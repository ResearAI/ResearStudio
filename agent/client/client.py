"""
client.py – chat with one or *many* local MCP servers using OpenAI function‑calling
=======================================================================

Usage
-----
    # export OPENAI_API_KEY (and optionally OPENAI_BASE_URL) in your shell or .env
    python client.py path/to/server1.py path/to/server2.js [...]

If you pass only a single path, the behaviour is identical to the original
single‑server client.
"""

import asyncio
import json
import os
import sys
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import AsyncOpenAI

load_dotenv()  # picks up OPENAI_* variables from .env if present

SYSTEM_PREFIX = (
    "You are a general AI assistant. I will ask you a question. "
    "Report your thoughts, and finish your answer with the following template: "
    "FINAL ANSWER: [YOUR FINAL ANSWER]. YOUR FINAL ANSWER should be a number "
    "OR as few words as possible OR a comma separated list of numbers and/or strings. "
    "If you are asked for a number, don't use comma to write your number neither use "
    "units such as $ or percent sign unless specified otherwise. If you are asked for a "
    "string, don't use articles, neither abbreviations (e.g. for cities), and write the "
    "digits in plain text unless specified otherwise. If you are asked for a comma "
    "separated list, apply the above rules depending of whether the element to be put "
    "in the list is a number or a string. If the required information cannot be found after reasonable tool use, respond with 'FINAL ANSWER: not found'."
)

class MCPClient:
    """Manages one OpenAI chat session spread across N MCP tool servers."""

    def __init__(self) -> None:
        self.exit_stack = AsyncExitStack()
        self.sessions: Dict[str, ClientSession] = {}  # tool name ➜ ClientSession

        # Async client; OPENAI_API_KEY / OPENAI_BASE_URL taken from env
        self.openai = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),
        )

    # ---------------------------------------------------------------------
    #   Connect to one or many servers
    # ---------------------------------------------------------------------
    async def connect_to_servers(self, script_paths: List[str]) -> None:
        """Spawn every server and build a tool‑name ➜ session map."""

        for script in script_paths:
            path = Path(script)
            if path.suffix not in {".py", ".js"}:
                raise ValueError("Server script must be a .py or .js file → " + script)

            command = "python" if path.suffix == ".py" else "node"
            server_params = StdioServerParameters(command=command, args=[str(path)])

            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
            stdio, write = stdio_transport

            session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
            await session.initialize()

            # Register *every* tool this session exposes
            tools_resp = await session.list_tools()
            for tool in tools_resp.tools:
                if tool.name in self.sessions:
                    raise RuntimeError(
                        f"Duplicate tool name '{tool.name}' across servers. Rename or remove the clash."
                    )
                self.sessions[tool.name] = session

        print("Connected tools:", list(self.sessions.keys()))

    # ------------------------------------------------------------------
    #   Helper – build the function list for OpenAI
    # ------------------------------------------------------------------
    async def _available_tools_for_openai(self) -> List[dict]:
        """Translate MCP Tool definitions into OpenAI function‑tool format."""
        result: List[dict] = []
        # We may query the same session multiple times; cache per session id
        seen_sessions = {}
        for session in self.sessions.values():
            if id(session) in seen_sessions:
                tools_resp = seen_sessions[id(session)]
            else:
                tools_resp = await session.list_tools()
                seen_sessions[id(session)] = tools_resp

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

    # ------------------------------------------------------------------
    #   One user query round‑trip
    # ------------------------------------------------------------------
    async def process_query(self, query: str) -> str:
        messages = [
            {"role": "system", "content": SYSTEM_PREFIX},
            {"role": "user", "content": query},
        ]
        final_chunks: List[str] = []

        # build the tool palette once per top‑level call
        available_tools = await self._available_tools_for_openai()

        while True:
            # ---- LLM call --------------------------------------------------
            response = await self.openai.chat.completions.create(
                model="o4-mini",  # or gpt-4o if you have access
                messages=messages,
                tools=available_tools,
                tool_choice="auto",
                max_tokens=1000,
            )
            assistant_msg = response.choices[0].message

            # plain content (if any)
            if assistant_msg.content:
                final_chunks.append(assistant_msg.content)
                messages.append({"role": "assistant", "content": assistant_msg.content})

            # any tool calls?
            tool_calls = getattr(assistant_msg, "tool_calls", None)
            if not tool_calls:
                break  # LLM is done

            # ---- Execute all tool calls -----------------------------------
            for call in tool_calls:
                tool_name = call.function.name
                tool_args = json.loads(call.function.arguments or "{}")

                # Tell the model we *initiated* the tool call
                messages.append(
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [call],
                    }
                )

                # Find the correct session for this tool
                target_session = self.sessions.get(tool_name)
                if not target_session:
                    raise RuntimeError(f"No server session found for tool '{tool_name}'")

                # Run the tool
                result = await target_session.call_tool(tool_name, tool_args)

                # Return the result to the model
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": tool_name,
                        "content": result.content,
                    }
                )

                # Optional: echo to the user so they see that something happened
                final_chunks.append(f"[{tool_name} executed]")

        return "\n".join(final_chunks)

    # ------------------------------------------------------------------
    #   Interactive REPL
    # ------------------------------------------------------------------
    async def chat_loop(self) -> None:
        print("\nMCP Client Started!  Type your queries – or 'quit' to exit.")
        while True:
            try:
                query = input("\nQuery: ").strip()
                if query.lower() == "quit":
                    break
                response = await self.process_query(query)
                print("\n" + response)
            except Exception as exc:
                print(f"\nError: {exc}")

    # ------------------------------------------------------------------
    #   Cleanup
    # ------------------------------------------------------------------
    async def cleanup(self) -> None:
        await self.exit_stack.aclose()


# ---------------------------------------------------------------------------
#   Script entry‑point
# ---------------------------------------------------------------------------

async def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python client.py <server_script1> [server_script2 ...]")
        sys.exit(1)

    server_paths = sys.argv[1:]

    client = MCPClient()
    try:
        await client.connect_to_servers(server_paths)
        await client.chat_loop()
    finally:
        await client.cleanup()


if __name__ == "__main__":
    asyncio.run(main())


# uv run client.py ../mcp-server/math_tool.py ../mcp-server/weather.py ../mcp-server/search_tool.py ../mcp-server/web_crawler.py ../mcp-server/video_tool.py

# uv run client.py ../mcp-server/video_analysis_tool.py