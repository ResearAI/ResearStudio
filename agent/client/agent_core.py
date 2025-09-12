# client_hierarchical_shared_history.py – two‑level planner/executor with shared memory
# ==============================================================================
# This version is identical in behaviour to the reference implementation you
# pasted, **except** the meta‑planner and executor now keep a *single* history
# so both agents see everything the other has said.  The history is capped by
# a crude turn budget; replace with a token‑aware limiter for production.
import time
import argparse
import asyncio
import json
import os
import uuid
import datetime
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import AsyncOpenAI
import re
# ---------------------------------------------------------------------------
#   Load env vars (OPENAI_API_KEY, etc.)
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
#   Prompt templates
# ---------------------------------------------------------------------------

META_SYSTEM_PROMPT = (
    "You are the META‑PLANNER in a hierarchical AI system.  A user will ask a\n"
    "high‑level question.  **First**: break the problem into a *minimal sequence*\n"
    "of executable tasks.  Reply ONLY in JSON with the schema:\n"
    "{ \"plan\": [ {\"id\": INT, \"description\": STRING} ... ] }\n\n"
    "After each task is executed by the EXECUTOR you will receive its result.\n"
    "If the final answer is complete, output it with the template with no other lines:\n"
    "FINAL ANSWER: <answer>\n\n"
    "Otherwise, emit a *new* JSON plan for the remaining work.  Keep cycles as\n"
    "few as possible.  Never call tools yourself — that's the EXECUTOR's job."
)

EXEC_SYSTEM_PROMPT = (
    "You are the EXECUTOR sub‑agent.  You receive one task description at a\n"
    "time from the meta‑planner.  Your job is to complete the task, using\n"
    "available tools via function calling if needed.  Always think step by\n"
    "step but respond with the minimal content needed for the meta‑planner.\n"
    "If you must call a tool, produce the appropriate function call instead of\n"
    "natural language.  When done, output a concise result.  Do NOT output\n"
    "FINAL ANSWER."
)

# ---------------------------------------------------------------------------
#   Utility – simple pretty logger (unchanged)
# ---------------------------------------------------------------------------

def log_block(title: str, content: str):
    if not isinstance(content, str):
        try:
            content = json.dumps(content, indent=2, ensure_ascii=False)
        except Exception:
            content = repr(content)

    border = "=" * len(title)
    print(f"\n{border}\n{title}\n{border}\n{content}\n")

def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[^\n]*\n", "", text)
        text = re.sub(r"\n?```$", "", text)
        return text.strip()
    m = re.search(r"{[\\s\\S]*}", text)
    return m.group(0) if m else text

# ---------------------------------------------------------------------------
#   Cache management utilities
# ---------------------------------------------------------------------------

def _serialize_for_json(obj: Any) -> Any:
    """Convert complex objects to JSON-serializable format."""
    if hasattr(obj, '__dict__'):
        # If object has attributes, convert to dict
        return {k: _serialize_for_json(v) for k, v in obj.__dict__.items()}
    elif hasattr(obj, 'content') and hasattr(obj, 'type'):
        # Handle TextContent or similar objects
        return str(obj.content) if hasattr(obj.content, '__str__') else str(obj)
    elif isinstance(obj, (list, tuple)):
        return [_serialize_for_json(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: _serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    else:
        # Fallback: convert to string
        return str(obj)


def create_task_cache_dir(base_cache_dir: str) -> str:
    """Create a unique cache directory for a new task."""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    task_id = str(uuid.uuid4())[:8]
    task_dir_name = f"task_{timestamp}_{task_id}"
    task_cache_dir = Path(base_cache_dir) / task_dir_name
    task_cache_dir.mkdir(parents=True, exist_ok=True)
    return str(task_cache_dir)

# ---------------------------------------------------------------------------
#   Minimal OpenAI backend wrapper (unchanged apart from import typing tweak)
# ---------------------------------------------------------------------------

from abc import ABC, abstractmethod

class ChatBackend(ABC):
    """Abstract base class for LLM back‑ends."""

    @abstractmethod
    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]] | None = None,
        tool_choice: str | None = "auto",
        max_tokens: int = 10000,
    ) -> Dict[str, Any]:
        ...

class OpenAIBackend(ChatBackend):
    def __init__(self, model: str):
        self.model = model
        self.client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),  # optional
        )

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]] | None = None,
        tool_choice: str | None = "auto",
        max_tokens: int = 10000,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        
        response = await self.client.chat.completions.create(**payload)
        msg = response.choices[0].message
        #time.sleep(1)
        raw_calls = getattr(msg, "tool_calls", None)
        tool_calls: List[Dict[str, Any]] | None = None
        if raw_calls:
            tool_calls = [
                {
                    "id": tc.id,
                    "type": tc.type,
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in raw_calls
            ]

        return {"content": msg.content, "tool_calls": tool_calls}

# ---------------------------------------------------------------------------
#   Hierarchical client with shared history and cache management
# ---------------------------------------------------------------------------

MAX_TURNS_MEMORY = 50  # crude cap; swap for token‑aware clipping in prod

class HierarchicalClient:
    """Coordinates meta‑planner ⇄ executor loops with shared memory and cache management."""

    MAX_CYCLES = 30  # planner‑executor iterations per user query

    def __init__(self, meta_model: str, exec_model: str):
        self.meta_llm = OpenAIBackend(meta_model)
        self.exec_llm = OpenAIBackend(exec_model)
        self.exit_stack = AsyncExitStack()
        self.sessions: Dict[str, ClientSession] = {}
        self.shared_history: List[Dict[str, str]] = []  # 🆕 shared convo memory
        
        # Cache management
        self.base_cache_dir = os.getenv("AGENT_CACHE_DIR", "./agent_cache")
        self.current_task_cache_dir = None
        
        # Ensure base cache directory exists
        Path(self.base_cache_dir).mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------------
    #   Cache management helpers
    # -------------------------------------------------------------------
    
    def _create_new_task_cache(self) -> str:
        """Create a new cache directory for the current task."""
        self.current_task_cache_dir = create_task_cache_dir(self.base_cache_dir)
        print(f"Created task cache directory: {self.current_task_cache_dir}")
        return self.current_task_cache_dir

    def _get_current_cache_dir(self) -> str:
        """Get the current task cache directory."""
        if self.current_task_cache_dir is None:
            self.current_task_cache_dir = self._create_new_task_cache()
        return self.current_task_cache_dir

    # -------------------------------------------------------------------
    #   Shared‑memory helpers
    # -------------------------------------------------------------------

    def _add_to_history(self, role: str, content: str):
        """Append a message and trim history when over cap."""
        self.shared_history.append({"role": role, "content": content})
        if len(self.shared_history) > MAX_TURNS_MEMORY:
            self.shared_history.pop(0)

    # -------------------------------------------------------------------
    #   Connect MCP tool servers with cache path injection
    # -------------------------------------------------------------------

    async def connect_to_servers(self, scripts: List[str]):
        for script in scripts:
            path = Path(script)
            if path.suffix not in {".py", ".js"}:
                raise ValueError("Server script must be a .py or .js file → " + script)
            command = "python" if path.suffix == ".py" else "node"
            
            # Set environment variable for cache directory
            env = os.environ.copy()
            env["AGENT_CACHE_DIR"] = self.base_cache_dir
            
            params = StdioServerParameters(command=command, args=[str(path)], env=env)
            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(params))
            stdio, write = stdio_transport
            session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
            await session.initialize()
            for tool in (await session.list_tools()).tools:
                if tool.name in self.sessions:
                    raise RuntimeError(f"Duplicate tool name '{tool.name}'.")
                self.sessions[tool.name] = session
        print("Connected tools:", list(self.sessions.keys()))

    # -------------------------------------------------------------------
    #   Build a combined OpenAI "tools" schema (unchanged)
    # -------------------------------------------------------------------

    async def _tools_schema(self) -> List[Dict[str, Any]]:
        result: List[Dict[str, Any]] = []
        cached = {}
        for session in self.sessions.values():
            if id(session) in cached:
                tools_resp = cached[id(session)]
            else:
                tools_resp = await session.list_tools()
                cached[id(session)] = tools_resp
            for tool in tools_resp.tools:
                result.append(
                    {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.inputSchema,
                        },
                    }
                )
        return result

    # -------------------------------------------------------------------
    #   Main planner ⇄ executor routine with shared history and cache
    # -------------------------------------------------------------------

    async def process_query(self, query: str) -> str:
        # Create a new task cache directory for this query
        task_cache_dir = self._create_new_task_cache()
        
        # Save the initial query to cache
        query_file = Path(task_cache_dir) / "query.txt"
        query_file.write_text(str(query), encoding="utf-8")
        
        tools_schema = await self._tools_schema()

        # 1️⃣  Add the new user message to shared history *first*
        self._add_to_history("user", query)

        # 2️⃣  Meta‑planner sees the entire history (plus its system prompt)
        planner_msgs = [{"role": "system", "content": META_SYSTEM_PROMPT}] + self.shared_history

        log_block("META‑PLANNER INPUT (cycle 0)", query)

        for cycle in range(self.MAX_CYCLES):
            
            meta_reply = await self.meta_llm.chat(planner_msgs)
            log_block('META‑PLANNER OUTPUT (cycle 0)', meta_reply)
            meta_content = meta_reply["content"] or ""
            log_block(f"META‑PLANNER OUTPUT (cycle {cycle})", meta_content)

            # Save planner output to history so executor can see it
            self._add_to_history("assistant", meta_content)

            # Check for final answer early
            if "FINAL ANSWER:" in meta_content:
                # Save final answer to cache
                final_answer_file = Path(task_cache_dir) / "final_answer.txt"
                final_answer_file.write_text(str(meta_content), encoding="utf-8")
                return meta_content

            # --- parse the JSON plan ---------------------------------
            try:
                plan_json = json.loads(_strip_fences(meta_content))
                tasks = plan_json["plan"]
                if not tasks:
                    return "[planner error] empty plan"
                task = tasks[0]  
                
                # Save plan to cache
                plan_file = Path(task_cache_dir) / f"plan_cycle_{cycle}.json"
                serializable_plan = _serialize_for_json(plan_json)
                plan_file.write_text(json.dumps(serializable_plan, indent=2, ensure_ascii=False), encoding="utf-8")
                
            except Exception as e:
                return f"[planner error] {e}: {meta_content}"


            task_desc = f"Task {task['id']}: {task['description']}"
            log_block(f"EXECUTOR INPUT (task {task['id']})", task_desc)

            # Executor messages = system prompt + *full shared history* + task
            exec_msgs = (
                [{"role": "system", "content": EXEC_SYSTEM_PROMPT}]
                + self.shared_history
                + [{"role": "user", "content": task_desc}]
            )

            while True:
                exec_reply = await self.exec_llm.chat(exec_msgs, tools_schema)

                # ── normal assistant response ────────────────────
                if exec_reply["content"]:
                    result_text = exec_reply["content"]
                    exec_msgs.append({"role": "assistant", "content": result_text})
                    log_block(
                        f"EXECUTOR OUTPUT (task {task['id']})", result_text
                    )

                    # Store the *result* so it's visible to planner/future executor calls
                    self._add_to_history(
                        "assistant", f"Task {task['id']} result: {result_text}"
                    )
                    
                    # Save task result to cache
                    task_result_file = Path(task_cache_dir) / f"task_{task['id']}_result.txt"
                    task_result_file.write_text(str(result_text), encoding="utf-8")
                    break

                # ── tool calls ───────────────────────────────────
                tool_calls = exec_reply.get("tool_calls")
                if not tool_calls:
                    break  # should not happen but safety first

                for call in tool_calls:
                    t_name = call["function"]["name"]
                    t_args = json.loads(call["function"].get("arguments") or "{}")
                    
                    # Inject current task cache directory into tool arguments
                    if "task_cache_dir" not in t_args:
                        t_args["task_cache_dir"] = task_cache_dir
                    
                    log_block(
                        f"EXECUTOR → TOOL CALL ({t_name})",
                        json.dumps(t_args, indent=2),
                    )
                    session = self.sessions[t_name]
                    result_msg = await session.call_tool(t_name, t_args)
                    log_block(f"TOOL RESULT ({t_name})", result_msg.content)

                    # Save tool call and result to cache with proper serialization
                    tool_call_file = Path(task_cache_dir) / f"tool_call_{t_name}_{cycle}.json"
                    tool_call_data = {
                        "tool_name": str(t_name),
                        "arguments": _serialize_for_json(t_args),
                        "result": str(result_msg.content),
                        "timestamp": datetime.datetime.now().isoformat()
                    }
                    try:
                        tool_call_file.write_text(json.dumps(tool_call_data, indent=2, ensure_ascii=False), encoding="utf-8")
                    except Exception as e:
                        print(f"Failed to save tool call to cache: {e}")
                        # Fallback: save as string representation
                        tool_call_file.write_text(str(tool_call_data), encoding="utf-8")

                    # Feed tool result back into executor conversation
                    exec_msgs.append(
                        {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [call],
                        }
                    )
                    exec_msgs.append(
                        {
                            "role": "tool",
                            "tool_call_id": call["id"],
                            "name": t_name,
                            "content": result_msg.content,
                        }
                    )

            # After all tasks, re‑plan: meta‑planner gets NEW history
            planner_msgs = (
                [{"role": "system", "content": META_SYSTEM_PROMPT}] + self.shared_history
            )
            log_block(
                f"META‑PLANNER INPUT (cycle {cycle + 1})",
                "\n".join(m["content"] for m in self.shared_history[-6:]),  # show tail only
            )

        # Ran out of cycles – return whatever the last planner said
        return meta_content or "FINAL ANSWER: not found"

    # -------------------------------------------------------------------
    #   Simple REPL wrapper (unchanged)
    # -------------------------------------------------------------------

    async def chat_loop(self):
        print("\nHierarchical Client started – type 'quit' to exit.")
        while True:
            q = input("\nUser> ").strip()
            if q.lower() == "quit":
                break
            try:
                ans = await self.process_query(q)
                print("\n" + ans)
            except Exception as e:
                print("[error]", e)

    # -------------------------------------------------------------------
    #   Cleanup (unchanged)
    # -------------------------------------------------------------------

    async def cleanup(self):
        await self.exit_stack.aclose()

# ---------------------------------------------------------------------------
#   CLI entry‑point (almost unchanged – fix exec model default)
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Hierarchical meta‑planner / executor client with shared history and turn‑by‑turn logging"
    )
    parser.add_argument(
        "servers",
        metavar="SERVER",
        nargs="+",
        help="Path to MCP tool server script (.py or .js)",
    )
    return parser.parse_args()

async def main():
    args = parse_args()
    meta_model = os.getenv("META_MODEL", "gpt-4o")
    exec_model = os.getenv("EXEC_MODEL", "o4-mini")  # corrected default

    client = HierarchicalClient(meta_model, exec_model)
    try:
        await client.connect_to_servers(args.servers)
        await client.chat_loop()
    finally:
        await client.cleanup()

if __name__ == "__main__":
    asyncio.run(main())
