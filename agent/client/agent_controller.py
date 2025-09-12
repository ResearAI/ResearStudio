# agent_controller.py - Flask-wrapped multi-agent system
# Based on the original HierarchicalClient, adds Flask API support while maintaining code isolation and modularity
# ==============================================================================

import time
import argparse
import asyncio
import json
import os
import uuid
import datetime
import shutil
import threading
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any, Dict, List, Optional
import queue
import logging
import zipfile
import tempfile
import time
import base64
import io
import concurrent.futures

# Flask-related imports
from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS

# Original imports remain unchanged
from dotenv import load_dotenv
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from openai import AsyncOpenAI
import re
from abc import ABC, abstractmethod

# Load environment variables
load_dotenv()

# ==============================================================================
# Original tools and classes remain unchanged - maintain code modularity and independence
# ==============================================================================

# Original prompt templates - do not modify

META_SYSTEM_PROMPT = """You are the META-PLANNER in a hierarchical AI system. A user will ask a high-level question.

**RULES:**

1.  Break the problem into executable tasks and output a complete TODO.md file.
2.  After each task execution by the EXECUTOR, you will receive results.
3.  Update the TODO.md by marking completed tasks with `[x]` and pending tasks with `[]`.
4.  When all main tasks are complete, output: `FINAL ANSWER: <answer>`.
5.  Never execute tools yourself - only plan for the EXECUTOR.
6.  If EXECUTOR reports `EXECUTION_BLOCKED`, analyze the issue and create a new TODO.md with revised tasks.

**MANDATORY FINAL STEP REQUIREMENT: Creating the `Result.html` Summary Website**

-   Every TODO.md MUST end with the final consolidation task.
-   **Final Task**: "Create a comprehensive summary website named `Result.html` using the **write_workspace_file** tool. The website must be built using the 'Modern Blog Style' as specified in the EXECUTOR's mandate."
-   **Content Structure**: When defining this final task, you MUST provide a clear, structured breakdown of the content suitable for a single-column blog format. For example:
    *   **Main Title**: "Provide the main title for the page, to be placed in an `<h1>`."
    *   **Table of Contents**: "Create a list of section titles (e.g., 'Summary', 'Methodology', 'Findings') to be used as links in the Table of Contents (`<nav id='table-of-contents'>`)."
    *   **Content Sections**: "For each section (e.g., `<section id='findings'>`), provide the content. Use `<h2>` for section titles. Structure the text in paragraphs (`<p>`), lists (`<ul>`), and styled code blocks (`<pre>`) or quotes (`<blockquote>`) as needed."
-   **Guidance**: "Instruct the EXECUTOR to use the provided 'Modern Blog Style' CSS and JS to ensure a clean, readable, and professional document."
-   **Confirmation Before Final Answer**: You can only output `FINAL ANSWER: <answer>` after receiving confirmation from the EXECUTOR that `Result.html` has been created. If the task is marked `[x]` but no confirmation is received, you must regenerate the TODO.md and ask for the confirmation again.
-   The `FINAL ANSWER` must reference the created `Result.html` file for complete details.

**TASK PLANNING PRINCIPLES:**

-   Keep plans SIMPLE: Default to 1-3 main tasks maximum (plus mandatory final consolidation task).
-   Only use 4+ main tasks for genuinely complex problems that cannot be simplified.
-   Each task must have clear, achievable outcomes.
-   Avoid over-decomposition - prefer broader, manageable tasks over micro-steps.
-   Design tasks that can succeed with available tools and capabilities.

**ACCIDENT HANDLING AND PLAN ADJUSTMENT:**

-   If the EXECUTOR reports a task failure or `EXECUTION_BLOCKED`:
    1.  Your primary action is to generate an updated TODO.md.
    2.  In this new TODO.md, you **must preserve** the progress of all successfully completed tasks by marking them as `[x]`.
    3.  Analyze the cause of the failure and **modify** the uncompleted tasks `[ ]` to chart a new, reasonable path forward. You may revise or replace the failed task, or select a new strategy from "Alternative Approaches" to address the issue.

**FEASIBILITY AND ALTERNATIVES:**

-   Always include a `## Alternative Approaches` section with 2-3 backup strategies.
-   Each alternative should use different methods or tools to achieve the same goal.
-   Provide fallback options that work even if the primary approach fails.
-   Consider multiple data sources, different analysis methods, or simplified versions of the goal.

**DEADLOCK PREVENTION:**

-   Never create tasks that depend on unavailable resources or capabilities.
-   Always have at least one executable path forward.
-   If a task fails, automatically pivot to alternative approaches without human intervention.
-   Include "simplified version" or "partial answer" options in alternatives.
-   Design tasks that can provide meaningful partial results even if full completion isn't possible.
-   When blocked, create new plans that work around limitations rather than waiting for resolution.

**TODO.md FORMAT REQUIREMENTS:**

-   Use standard markdown checklist format: `- [ ] Task description` for pending, `- [x] Task description` for completed.
-   Include a brief header: `# Task Plan for: [Brief description of the main goal]`.
-   Required sections: `## Main Tasks`, `## Alternative Approaches`, `## Progress Summary`.
-   Optional sections only when needed: `## Current Status Analysis`, `## Strategy Adjustment`.
-   Maximum 8 total tasks (including the mandatory final consolidation task).
-   Use clear, concise language.

**LANGUAGE CONSISTENCY:**

-   The TODO.md content MUST be written in the same language as the user's input.
-   Maintain language consistency throughout all sections, headers, and task descriptions.
-   Only the structural elements (like `- [ ]`, `- [x]`, `#`, `##`) remain in standard markdown format.

**OUTPUT RULES:**

-   If planning/replanning: Output ONLY the complete TODO.md content, nothing else.
-   If all tasks complete (including Result.md creation and its confirmation): Output ONLY `FINAL ANSWER: <answer>`, nothing else.
-   No explanations, no JSON, no additional text outside the specified formats.
-   This system must be fully autonomous - never create tasks requiring human input or intervention.
-   The `FINAL ANSWER` should reference the created summary website HTML file for complete details.
"""
EXEC_SYSTEM_PROMPT = (
    "You are the EXECUTOR, a highly autonomous sub-agent. You will receive a TODO.md file from the meta-planner. Your primary goal is to accomplish the tasks assigned to you with persistence and resourcefulness.\n\n"
    "**CORE DIRECTIVE: AUTONOMOUS PROBLEM SOLVING**\n"
    "1.  **IDENTIFY TASK**: Locate the first uncompleted task (`- [ ]`) in the TODO.md.\n"
    "2.  **UNDERSTAND & STRATEGIZE**: Deeply understand the task's objective. Think about how to achieve it using the available tools. Do not be afraid to try creative approaches.\n"
    "3.  **EXECUTE & PERSIST**: Execute your strategy. If you encounter an error or an obstacle, **do not give up immediately**. Treat it as a problem to be solved. Analyze the error, formulate a new hypothesis, and try a different approach. This may involve using a different tool, different tool parameters, or breaking the task into smaller internal steps.\n"
    "4.  **ITERATE**: Continue attempting to solve the task until it is successfully completed or you are genuinely stuck.\n\n"
    "**`Result.html` Modern Blog Style Mandate**:\n\n"
    "When creating the final `Result.html` summary website, you MUST strictly adhere to the unified 'Modern Blog Style' provided below. The goal is a clean, readable, single-column document focused on typography and clarity, not flashy effects. Your task is to inject the content provided by the META-PLANNER into this exact structure and style.\n\n"
    "**1. HTML Structure (Required):**\n"
    "- Use a single-column, centered layout. The main container should be a `<div class=\"wrapper\">`.\n"
    "- The page should start with a `<header>` for the main title (`<h1>`).\n"
    "- An optional Table of Contents should be a `<nav id=\"table-of-contents\">` containing a `<ul>` of links.\n"
    "- The main content area should be a `<main>` tag, with each topic in its own `<section id=\"section-id\">`.\n\n"
    "**2. Required Code Template:**\n"
    "You MUST use the following CSS and JavaScript code exactly as provided. Embed the CSS within a `<style>` tag in the `<head>` and the JavaScript within a `<script>` tag before the closing `</body>` tag.\n\n"
    "**CSS (Embed in `<style>` tag):**\n"
    "```css\n"
    ":root {\n"
    "  --bg-color: #fcfcfc; /* Clean, slightly off-white background */\n"
    "  --text-color: #3d3d3d; /* Dark gray for high readability */\n"
    "  --heading-color: #1a1a1a; /* Near-black for strong headings */\n"
    "  --primary-color: #005fcc; /* A professional, accessible blue */\n"
    "  --border-color: #eaeaea;\n"
    "  --code-bg-color: #f6f8fa;\n"
    "  --font-main: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol';\n"
    "  --font-headings: 'Merriweather', 'Georgia', serif;\n"
    "  --font-mono: 'SF Mono', 'Fira Code', 'Menlo', 'Courier New', monospace;\n"
    "}\n"
    "@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap');\n"
    "* { box-sizing: border-box; }\n"
    "body { font-family: var(--font-main); background-color: var(--bg-color); color: var(--text-color); line-height: 1.75; font-size: 1.1rem; margin: 0; padding: 0; }\n"
    ".wrapper { max-width: 840px; margin: 0 auto; padding: 2rem 1.5rem; }\n"
    "header, section { margin-bottom: 3.5rem; }\n"
    "h1, h2, h3 { font-family: var(--font-headings); color: var(--heading-color); line-height: 1.3; margin-top: 2rem; margin-bottom: 1rem; }\n"
    "h1 { font-size: 2.8rem; text-align: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1.5rem; }\n"
    "h2 { font-size: 2rem; border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; }\n"
    "p { margin-bottom: 1.25rem; }\n"
    "a { color: var(--primary-color); text-decoration: none; border-bottom: 1px solid transparent; transition: all 0.2s ease; }\n"
    "a:hover { border-bottom-color: var(--primary-color); }\n"
    "#table-of-contents { margin-bottom: 3rem; background: #fff; border: 1px solid var(--border-color); padding: 1.5rem 2rem; border-radius: 8px; }\n"
    "#table-of-contents h3 { margin-top: 0; } \n"
    "#table-of-contents ul { list-style: none; padding-left: 0; }\n"
    "#table-of-contents ul li { margin-bottom: 0.5rem; }\n"
    "#table-of-contents ul li a { font-weight: 500; font-size: 1.1rem; }\n"
    "pre { background-color: var(--code-bg-color); color: var(--text-color); padding: 1.5rem; border-radius: 8px; overflow-x: auto; font-family: var(--font-mono); font-size: 0.95rem; border: 1px solid var(--border-color); }\n"
    "blockquote { margin: 1.5rem 0; padding: 1rem 1.5rem; border-left: 4px solid var(--primary-color); background-color: #fff; border-radius: 0 8px 8px 0; font-size: 1.1rem; }\n"
    "```\n\n"
    "**JavaScript (Embed in `<script>` tag):**\n"
    "```javascript\n"
    "document.addEventListener('DOMContentLoaded', () => {\n"
    "  const tocLinks = document.querySelectorAll('#table-of-contents a[href^=\"#\"]');\n"
    "  tocLinks.forEach(link => {\n"
    "    link.addEventListener('click', function(e) {\n"
    "      e.preventDefault();\n"
    "      const targetId = this.getAttribute('href');\n"
    "      const targetElement = document.querySelector(targetId);\n"
    "      if (targetElement) {\n"
    "        const offsetTop = targetElement.offsetTop - 40;\n"
    "        window.scrollTo({ top: offsetTop, behavior: 'smooth' });\n"
    "      }\n"
    "    });\n"
    "  });\n"
    "});\n"
    "```\n\n"
    "## **Important Instruction:**\n"
    "You must use tools as frequently and accurately as possible to help the user solve their problem.\n"
    "Prioritize tool usage whenever it can enhance accuracy, efficiency, or the quality of the response.\n"
    "Your final output for this task must be the complete HTML code for `Result.html`, fully implementing these requirements.\n\n"
    "**REPORTING PROTOCOL**:\n\n"
    "**SUCCESS SCENARIO**:\n"
    "When a task is successfully completed, you must provide a **detailed summary** of your process. Your report should be comprehensive and include:\n"
    "- **Actions Taken**: A step-by-step description of what you did.\n"
    "- **Tools Used**: Which tools you called and with what arguments.\n"
    "- **Results & Progress**: A clear summary of the outcomes, data gathered, files created, and how this moves the overall goal forward.\n"
    "Your report should be clear enough that the meta-planner understands exactly what was accomplished.\n\n"
    "**FAILURE SCENARIO**:\n"
    "You should only report failure to the meta-planner as a **last resort**.\n"
    "- **Condition for Failure**: Only report `EXECUTION_BLOCKED` after you have made **at least 3-5 significant and different attempts** to solve the problem and have consistently failed.\n"
    "- **Failure Report Format**:\n"
    "    `EXECUTION_BLOCKED: [A brief, high-level summary of why you are blocked]`\n"
    "    `ATTEMPTED_TASK: [The original task description]`\n"
    "    `SUMMARY_OF_ATTEMPTS: [A detailed, multi-step summary of what you tried. For each attempt, describe the tool used, the logic behind the attempt, and the resulting error or obstacle. This is crucial for the meta-planner to understand the situation.]`\n"
    "    `FINAL_BLOCKING_REASON: [Your final analysis on why you cannot proceed.]`\n\n"
    "**CRITICAL RULES**:\n"
    "- You are empowered to think and act autonomously to solve your assigned task.\n"
    "- Execute ONE task from the TODO.md at a time, in sequential order.\n"
    "- Never modify the TODO.md file yourself.\n"
    "- Never output `FINAL ANSWER`.\n"
    "- Be persistent. Your default behavior should be to retry and find solutions, not to report failures."
)
# English: 原有工具function - 保持不变
def log_block(title: str, content: str):
    """Enhanced logging function with both console and logger output"""
    if not isinstance(content, str):
        try:
            content = json.dumps(content, indent=2, ensure_ascii=False)
        except Exception:
            content = repr(content)

    border = "=" * max(len(title), 50)
    formatted_log = f"\n{border}\n{title}\n{border}\n{content}\n"
    
    # Console output
    print(formatted_log)
    
    # Logger output for structured logging
    logger.info(f"[{title}] {content}")

def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[^\n]*\n", "", text)
        text = re.sub(r"\n?```$", "", text)
        return text.strip()
    m = re.search(r"{[\\s\\S]*}", text)
    return m.group(0) if m else text

def _serialize_for_json(obj: Any) -> Any:
    """Convert complex objects to JSON-serializable format."""
    if hasattr(obj, '__dict__'):
        return {k: _serialize_for_json(v) for k, v in obj.__dict__.items()}
    elif hasattr(obj, 'content') and hasattr(obj, 'type'):
        return str(obj.content) if hasattr(obj.content, '__str__') else str(obj)
    elif isinstance(obj, (list, tuple)):
        return [_serialize_for_json(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: _serialize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (str, int, float, bool, type(None))):
        return obj
    else:
        return str(obj)

def create_task_cache_dir(base_cache_dir: str) -> str:
    """Create a unique cache directory for a new task."""
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    task_id = str(uuid.uuid4())[:8]
    task_dir_name = f"task_{timestamp}_{task_id}"
    task_cache_dir = Path(base_cache_dir) / task_dir_name
    task_cache_dir.mkdir(parents=True, exist_ok=True)
    return str(task_cache_dir)

# English: 原有backendclass - 保持不变
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
    def __init__(self, model: str, api_key: str, base_url: str = None, reasoning_effort = None, error_callback = None):
        self.model = model
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )
        self.reasoning_effort = reasoning_effort
        self.error_callback = error_callback  # English: 用于发送error到frontend

    async def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]] | None = None,
        tool_choice: str | None = "auto",
        max_tokens: int = 10000,
    ) -> Dict[str, Any]:
        # Log the request
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "reasoning_effort":self.reasoning_effort,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        
        # Enhanced logging for LLM requests
        
        try:
            response = await self.client.chat.completions.create(**payload)
            msg = response.choices[0].message
            time.sleep(2)
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

            # English: 始终initializeresultvariable
            result = {"content": msg.content, "tool_calls": tool_calls}
            
            return result
            
        except Exception as e:
            error_msg = f"LLM API call failed: {str(e)}"
            log_block("LLM ERROR", error_msg)
            logger.error(f"LLM request failed: {e}")
            
            # Send error to frontend
            if self.error_callback:
                try:
                    self.error_callback(f"🚨 {error_msg}", "error")
                except Exception as callback_error:
                    logger.error(f"Error callback failed: {callback_error}")
            
            raise

# ==============================================================================
# Flask integration layer - new section, wrapping original code
# ==============================================================================

# Flask application initialization
app = Flask(__name__)
CORS(app)

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global state management
active_tasks: Dict[str, Dict[str, Any]] = {}
task_queues: Dict[str, queue.Queue] = {}
task_clients: Dict[str, 'HierarchicalClient'] = {}
completed_tasks_history: Dict[str, Dict[str, Any]] = {}

# Global tool service pool - new addition
global_tool_sessions: Dict[str, ClientSession] = {}
global_tools_schema: List[Dict[str, Any]] = []
global_exit_stack: Optional[AsyncExitStack] = None
tools_initialized: bool = False

# File type definitions
URL_FILE_TYPES = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
    '.pdf', '.mp3', '.wav', '.aac', '.ogg', '.m4a',
    '.zip', '.rar', '.7z', '.tar', '.gz',
    '.exe', '.msi', '.dmg', '.deb', '.rpm'
}

EDITABLE_FILE_TYPES = {
    '.md', '.txt', '.py', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss', '.less',
    '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
    '.sh', '.bat', '.ps1', '.sql', '.csv', '.log'
}

def should_use_url_mode(filename: str) -> bool:
    """Determine if file should use URL mode for transmission"""
    file_ext = Path(filename).suffix.lower()
    return file_ext in URL_FILE_TYPES

def is_editable_file(filename: str) -> bool:
    """Determine if file is editable"""
    file_ext = Path(filename).suffix.lower()
    return file_ext in EDITABLE_FILE_TYPES

# ==============================================================================
# Global tool service management - new addition
# ==============================================================================

import threading
import concurrent.futures

class ToolManager:
    """Tool manager - handles asynchronous tool calls"""
    
    def __init__(self):
        self.sessions = {}
        self.tools_schema = []
        self.exit_stack = None
        self.initialized = False
        self.loop = None
        self.executor = None
        self._lock = threading.Lock()
    
    def initialize_sync(self):
        """Initialize tool pool synchronously"""
        with self._lock:
            if self.initialized:
                logger.info("Tool services already initialized, skipping duplicate initialization")
                return True
            
            logger.info("🔧 Initializing global tool service pool...")
            
            try:
                # Create dedicated event loop and thread pool
                import asyncio
                self.loop = asyncio.new_event_loop()
                self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=10)
                
                # Run event loop in new thread
                def run_loop():
                    asyncio.set_event_loop(self.loop)
                    self.loop.run_forever()
                
                loop_thread = threading.Thread(target=run_loop, daemon=True)
                loop_thread.start()
                
                # Asynchronously initialize tools
                future = asyncio.run_coroutine_threadsafe(self._async_init(), self.loop)
                success = future.result(timeout=60)  # 60 second timeout
                
                if success:
                    self.initialized = True
                    logger.info("✅ Tool manager initialized successfully")
                    
                return success
                
            except Exception as e:
                logger.error(f"❌ Tool manager initialization failed: {e}")
                return False
    
    async def _async_init(self):
        """Asynchronously initialize tool connections"""
        try:
            self.exit_stack = AsyncExitStack()
            existing_scripts = get_available_servers()
            
            if not existing_scripts:
                raise RuntimeError("没有找到可用的server scripts")
            
            connected_tools = []
            failed_connections = []
            
            for script in existing_scripts:
                try:
                    path = Path(script)
                    if path.suffix not in {".py", ".js"}:
                        failed_connections.append((script, "无效的脚本class型"))
                        continue
                        
                    if not path.exists():
                        failed_connections.append((script, "脚本file不存在"))
                        continue
                    
                    # Use python3 instead of python for better compatibility
                    command = "python3" if path.suffix == ".py" else "node"
                    
                    # setup通用环境variable
                    env = os.environ.copy()
                    env["AGENT_CACHE_DIR"] = str(Path("workspaces").absolute())
                    env["AGENT_WORKSPACE"] = str(Path("workspaces").absolute())
                    
                    params = StdioServerParameters(command=command, args=[str(path)], env=env)
                    stdio_transport = await self.exit_stack.enter_async_context(stdio_client(params))
                    stdio, write = stdio_transport
                    session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
                    await session.initialize()
                    
                    # get工具列表
                    tools_resp = await session.list_tools()
                    server_tools = []
                    
                    for tool in tools_resp.tools:
                        if tool.name in self.sessions:
                            logger.warning(f"工具名称重复 '{tool.name}' 来自 {script}")
                            continue
                        
                        self.sessions[tool.name] = session
                        server_tools.append(tool.name)
                        connected_tools.append(tool.name)
                    
                    logger.info(f"✅ 服务器 {script} 连接success，工具: {server_tools}")
                    
                except Exception as e:
                    failed_connections.append((script, str(e)))
                    logger.error(f"❌ 服务器 {script} 连接failed: {e}")
            
            # English: 构建工具schema
            await self._build_tools_schema()
            
            # English: 连接总结
            if connected_tools:
                logger.info(f"🎉 global tool poolinitializecomplete，已连接工具: {connected_tools}")
            if failed_connections:
                logger.warning(f"⚠️ 部分连接failed: {[f[0] for f in failed_connections]}")
            
            if not connected_tools:
                raise RuntimeError("没有工具success连接")
                
            return True
            
        except Exception as e:
            logger.error(f"❌ 异步工具initializefailed: {e}")
            if self.exit_stack:
                await self.exit_stack.aclose()
            raise
    
    async def _build_tools_schema(self):
        """构建工具schema [Contains Chinese - needs translation]"""
        self.tools_schema = []
        processed_sessions = set()
        
        # English: 按唯一session遍历，避免重复process
        for tool_name, session in self.sessions.items():
            session_id = id(session)
            if session_id in processed_sessions:
                continue
            processed_sessions.add(session_id)
            
            try:
                tools_resp = await session.list_tools()
                
                for tool in tools_resp.tools:
                    tool_schema = {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.inputSchema,
                        },
                    }
                    self.tools_schema.append(tool_schema)
                    
            except Exception as e:
                logger.error(f"get工具schemafailed {tool_name}: {e}")
    
    def call_tool_sync(self, tool_name: str, args: dict):
        """synchronous method调用工具 [Contains Chinese - needs translation]"""
        if not self.initialized:
            raise RuntimeError("tool manager尚未initialize")
        
        if tool_name not in self.sessions:
            raise RuntimeError(f"工具 '{tool_name}' 不存在")
        
        # English: 使用asyncio.run_coroutine_threadsafe在tool manager的event loop中execute
        future = asyncio.run_coroutine_threadsafe(
            self._async_call_tool(tool_name, args), 
            self.loop
        )
        
        try:
            return future.result(timeout=300)  # 5分钟超时
        except concurrent.futures.TimeoutError:
            raise RuntimeError(f"工具 '{tool_name}' 调用超时")
    
    async def _async_call_tool(self, tool_name: str, args: dict):
        """异步调用工具 [Contains Chinese - needs translation]"""
        session = self.sessions[tool_name]
        return await session.call_tool(tool_name, args)
    
    def get_tools_info(self):
        """get工具info [Contains Chinese - needs translation]"""
        if not self.initialized:
            return {
                "initialized": False,
                "tools_count": 0,
                "tool_names": [],
                "schema": []
            }
        
        tool_names = [tool['function']['name'] for tool in self.tools_schema]
        return {
            "initialized": True,
            "tools_count": len(tool_names),
            "tool_names": tool_names,
            "schema": self.tools_schema
        }
    
    async def cleanup(self):
        """清理tool manager [Contains Chinese - needs translation]"""
        if self.initialized and self.exit_stack:
            logger.info("🧹 正在清理tool manager...")
            await self.exit_stack.aclose()
            self.sessions.clear()
            self.tools_schema.clear()
            self.initialized = False
            if self.loop and self.loop.is_running():
                self.loop.call_soon_threadsafe(self.loop.stop)
            logger.info("✅ tool manager清理complete")

# create全局tool manager实例
global_tool_manager = ToolManager()

# English: 为了向后兼容，保持原有的全局variable
global_tool_sessions: Dict[str, ClientSession] = {}
global_tools_schema: List[Dict[str, Any]] = []
global_exit_stack: Optional[AsyncExitStack] = None
tools_initialized: bool = False

def initialize_global_tools_sync():
    """synchronous methodinitialize全局工具服务池 [Contains Chinese - needs translation]"""
    global tools_initialized
    
    success = global_tool_manager.initialize_sync()
    if success:
        # update全局variable以保持兼容性
        global_tool_sessions.clear()
        global_tool_sessions.update(global_tool_manager.sessions)
        global_tools_schema.clear()
        global_tools_schema.extend(global_tool_manager.tools_schema)
        tools_initialized = True
    
    return success

# English: 保持异步版本用于向后兼容
async def initialize_global_tools():
    """异步版本的initializefunction [Contains Chinese - needs translation]"""
    return initialize_global_tools_sync()

async def build_global_tools_schema():
    """构建全局工具schema - 已由tool managerprocess [Contains Chinese - needs translation]"""
    pass

def get_global_tools_info():
    """get全局工具info [Contains Chinese - needs translation]"""
    return global_tool_manager.get_tools_info()

async def cleanup_global_tools():
    """清理全局工具服务 [Contains Chinese - needs translation]"""
    global tools_initialized
    await global_tool_manager.cleanup()
    global_tool_sessions.clear()
    global_tools_schema.clear()
    tools_initialized = False

# ==============================================================================
# English: 增强的HierarchicalClient - 支持Flask集成和事件发送
# ==============================================================================

MAX_TURNS_MEMORY = 50

class HierarchicalClient:
    """增强版协调器，支持Flask集成和实时事件发送 [Contains Chinese - needs translation]"""

    MAX_CYCLES = 30

    def __init__(self, model: str, api_key: str, base_url: str, task_id: str, workspace_dir: str):
        # English: 存储APIconfiguration
        self.api_config = {
            'model': model,
            'api_key': api_key,
            'base_url': base_url
        }
        
        # META和EXEC都使用相同的模型configuration，传入error回调
        self.meta_llm = OpenAIBackend(model, api_key, base_url, error_callback=self.emit_llm_error)
        self.exec_llm = OpenAIBackend(model, api_key, base_url, error_callback=self.emit_llm_error)
        
        # English: 使用全局工具服务池，不再create自己的exit_stack和sessions
        self.sessions: Dict[str, ClientSession] = global_tool_sessions  # English: 引用全局工具会话
        self.shared_history: List[Dict[str, str]] = []
        
        # Flask集成相关
        self.task_id = task_id
        self.workspace_dir = Path(workspace_dir)
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # create沙盒环境setup
        self._setup_sandbox()
        
        # English: 事件发送 - load现有消息计数
        existing_messages = self._load_messages_from_file()
        self.message_count = len(existing_messages)
        self.files_created = {}
        self.todo_content = ""
        self.run_control_file = self.workspace_dir / "_run"
        
        # English: 缓存管理
        self.base_cache_dir = str(self.workspace_dir)
        self.current_task_cache_dir = str(self.workspace_dir)
        
        logger.info(f"Initialized client for task {task_id}, loaded {self.message_count} existing messages")
        
        # filestatus监控
        self.workspace_file_states = {}
        self._initial_sync_file_states()

    def _initial_sync_file_states(self):
        """Synchronously scans the workspace for the initial file state."""
        self.workspace_file_states = {}
        files_dir = self.workspace_dir / "workspace"
        if not files_dir.exists():
            return
        for root, _, files in os.walk(files_dir):
            for name in files:
                file_path = Path(root) / name
                relative_path = str(file_path.relative_to(files_dir))
                try:
                    self.workspace_file_states[relative_path] = file_path.stat().st_mtime
                except OSError:
                    continue
        logger.info(f"Initial file state for task {self.task_id} synced, {len(self.workspace_file_states)} files found.")

    def _setup_sandbox(self):
        """setup沙盒环境，限制file操作到workspace内 [Contains Chinese - needs translation]"""
        # create基础directory结构
        (self.workspace_dir / "workspace").mkdir(exist_ok=True)
        (self.workspace_dir / "cache").mkdir(exist_ok=True)
        (self.workspace_dir / "temp").mkdir(exist_ok=True)
        
        # setup环境variable，限制所有操作到workspace内
        os.environ["AGENT_WORKSPACE"] = str(self.workspace_dir)
        os.environ["AGENT_CACHE_DIR"] = str(self.workspace_dir / "cache")
        
    def _send_message(self, msg_type: str, data: dict):
        """发送消息到frontend队列并save到file [Contains Chinese - needs translation]"""
        message = {
            "type": msg_type,
            "data": data,
            "sequence": self.message_count,
            "timestamp": time.time()
        }
        
        # save到file
        self._save_message_to_file(message)
        
        # English: 发送到内存队列（如果存在）
        if self.task_id in task_queues:
            task_queues[self.task_id].put(message)
            
        self.message_count += 1
        logger.info(f"发送并save消息: {msg_type}, 任务: {self.task_id}")

    def _save_message_to_file(self, message: dict):
        """save消息到JSONfile [Contains Chinese - needs translation]"""
        try:
            messages_file = self.workspace_dir / "messages.jsonl"
            # English: 使用JSONL格式，每行一个JSON对象
            with open(messages_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(message, ensure_ascii=False) + '\n')
        except Exception as e:
            logger.error(f"Error saving message to file: {e}")

    def _load_messages_from_file(self) -> List[dict]:
        """从fileload所有消息 [Contains Chinese - needs translation]"""
        try:
            messages_file = self.workspace_dir / "messages.jsonl"
            if not messages_file.exists():
                return []
            
            messages = []
            with open(messages_file, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip():
                        try:
                            message = json.loads(line)
                            messages.append(message)
                        except json.JSONDecodeError:
                            continue
            return messages
        except Exception as e:
            logger.error(f"Error loading messages from file: {e}")
            return []

    def emit_activity(self, text: str, activity_type: str = "thinking", **kwargs):
        """发送活动status [Contains Chinese - needs translation]"""
        activity_data = {
            "text": text,
            "type": activity_type,
            "status": kwargs.get("status", "in-progress"),
            "id": int(time.time() * 1000000),
            "timestamp": time.time(),
            **kwargs
        }
        self._send_message("activity", activity_data)
        return activity_data["id"]

    def emit_activity_update(self, activity_id: int, status: str, **kwargs):
        """update活动status [Contains Chinese - needs translation]"""
        update_data = {
            "id": activity_id,
            "status": status,
            "timestamp": time.time(),
            **kwargs
        }
        self._send_message("activity_update", update_data)

    def emit_file_update(self, filename: str, content: str, is_url: bool = False):
        """发送fileupdate [Contains Chinese - needs translation]"""
        # savefile到workspace/workspace
        if not is_url:
            file_path = self.workspace_dir / "workspace" / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                file_path.write_text(content, encoding="utf-8")
            except Exception:
                file_path.write_bytes(content.encode('utf-8', errors='ignore'))
        
        self.files_created[filename] = content
        
        file_data = {
            "filename": filename,
            "content": content,
            "is_url": is_url,
            "is_editable": is_editable_file(filename),
            "file_type": self._detect_file_type(filename),
            "content_mode": "url" if is_url else "text"
        }
        
        self._send_message("file_update", file_data)

    def _detect_file_type(self, filename: str) -> str:
        """检测fileclass型 [Contains Chinese - needs translation]"""
        file_ext = Path(filename).suffix.lower()
        
        if file_ext in {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico'}:
            return 'image'
        elif file_ext in {'.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'}:
            return 'video'
        elif file_ext == '.pdf':
            return 'pdf'
        elif file_ext == '.html':
            return 'html'
        elif file_ext == '.md':
            return 'markdown'
        elif file_ext in {'.mp3', '.wav', '.aac', '.ogg', '.m4a'}:
            return 'audio'
        else:
            return 'text'

    def emit_terminal_output(self, command: str, output: str, status: str = "completed"):
        """发送终端output [Contains Chinese - needs translation]"""
        output = 'Output:'.join(output.split('Output:')[1:])
        terminal_data = {
            "command": command,
            "output": output,
            "status": status,
            "timestamp": time.time()
        }
        self._send_message("terminal", terminal_data)

    def emit_final_answer(self, content: str):
        """Sends the final answer to the frontend."""
        answer_data = content
        self.emit_activity(f"{answer_data}", "activity")
        self._send_message("final_answer", {'content': answer_data})

    def emit_task_update(self, status: str, **kwargs):
        """发送任务statusupdate [Contains Chinese - needs translation]"""
        task_data = {
            "status": status,
            **kwargs
        }
        self._send_message("task_update", task_data)

    def emit_llm_error(self, error_message: str, error_type: str = "llm_error"):
        """发送LLMerror到frontend [Contains Chinese - needs translation]"""
        self.emit_activity(error_message, error_type, status="failed")
        
    def emit_error(self, error_message: str, error_type: str = "error", **kwargs):
        """发送通用error到frontend [Contains Chinese - needs translation]"""
        error_data = {
            "message": error_message,
            "type": error_type,
            "timestamp": time.time(),
            **kwargs
        }
        self._send_message("error", error_data)
        # English: 同时也作为activity发送
        self.emit_activity(f"❌ {error_message}", "error", status="failed")

    def update_todo_md(self, plan_data: str = None):
        """Updates todo.md file and sends to frontend."""

        
        # English: 发送fileupdate
        self.emit_file_update("todo.md", plan_data)

    async def _wait_if_paused(self):
        """Checks the _run file and pauses execution if it's set to '0'."""
        is_paused = False
        # Ensure the control file exists
        if not self.run_control_file.exists():
            self.run_control_file.write_text('1', encoding='utf-8')

        while self.run_control_file.read_text(encoding='utf-8').strip() == '0':
            if not is_paused:
                self.emit_task_update("paused")
                is_paused = True
                logger.info(f"Task {self.task_id} is paused.")
            await asyncio.sleep(1)  # Check every second

        if is_paused:
            self.emit_task_update("running")
            logger.info(f"Task {self.task_id} is resumed.")

    # English: 保持原有method不变
    def _create_new_task_cache(self) -> str:
        return str(self.workspace_dir)

    def _get_current_cache_dir(self) -> str:
        return str(self.workspace_dir)

    def _add_to_history(self, role: str, content: str):
        """Append a message and trim history when over cap."""
        self.shared_history.append({"role": role, "content": content})
        if len(self.shared_history) > MAX_TURNS_MEMORY:
            self.shared_history.pop(0)

    def connect_to_global_tools(self):
        """连接到全局工具服务池 [Contains Chinese - needs translation]"""
        if not global_tool_manager.initialized:
            raise RuntimeError("Global tool service pool not initialized, please start tool service first")
        
        # update工作区环境variable
        os.environ["AGENT_CACHE_DIR"] = str(self.workspace_dir)
        os.environ["AGENT_WORKSPACE"] = str(self.workspace_dir)
        
        # get可用工具info
        tools_info = global_tool_manager.get_tools_info()
        logger.info(f"任务 {self.task_id} 连接到global tool pool，可用工具: {tools_info['tool_names']}")
        
        return tools_info['tool_names']

    async def _tools_schema(self) -> List[Dict[str, Any]]:
        """返回全局工具schema [Contains Chinese - needs translation]"""
        return global_tool_manager.tools_schema
    
    def call_tool_safe(self, tool_name: str, args: dict):
        """安全的工具调用，使用tool manager [Contains Chinese - needs translation]"""
        try:
            return global_tool_manager.call_tool_sync(tool_name, args)
        except Exception as e:
            error_msg = f"Tool {tool_name} call failed: {str(e)}"
            logger.error(error_msg)
            
            # Send error to frontend
            try:
                self.emit_error(error_msg, "tool_manager_error", tool_name=tool_name, tool_args=args)
            except Exception as emit_error:
                logger.error(f"发送tool managererror到frontendfailed: {emit_error}")
            
            raise
    
    async def call_tool_async(self, tool_name: str, args: dict):
        """异步工具调用包装器，在execute器中使用 [Contains Chinese - needs translation]"""
        import asyncio
        loop = asyncio.get_event_loop()
        
        # English: 在当前线程中run同步调用
        return await loop.run_in_executor(
            None, 
            self.call_tool_safe, 
            tool_name, 
            args
        )

    async def process_query(self, query: str, uploaded_files: Optional[List[str]] = None) -> str:
        """增强版查询process，支持事件发送 [Contains Chinese - needs translation]"""
        try:
            # Create the run control file and set to running
            self.run_control_file.write_text('1', encoding='utf-8')

            # English: 发送任务startstatus
            self.emit_task_update("started")

            # Emit file updates for uploaded files
            if uploaded_files:
                sync_activity_id = self.emit_activity("Syncing uploaded files to frontend...", "thinking")
                for uploaded_file in uploaded_files:
                    # All uploaded files are sent as URLs
                    file_url = f"/api/file_load/{self.task_id}/{uploaded_file}"
                    self.emit_file_update(uploaded_file, file_url, is_url=True)
                self.emit_activity_update(sync_activity_id, "completed")
            
            log_block("TASK STARTED", f"Query: {query}")
            
            # create初始todo.md
            initial_todo = f"""# Task: {query}

## 📋 Task Progress
- [ ] Analyze task requirements
- [ ] Formulate execution plan
- [ ] Execute tasks
- [ ] Complete task

## 🎯 Execution Log
Start Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Status: 🟡 In Progress
"""
            self.emit_file_update("todo.md", initial_todo)
            
            # save初始查询
            query_file = self.workspace_dir / "query.txt"
            query_file.write_text(str(query), encoding="utf-8")
            
            # saveAPIconfiguration到file
            api_config_file = self.workspace_dir / "api_config.json"
            try:
                api_config_file.write_text(json.dumps(self.api_config, indent=2, ensure_ascii=False), encoding="utf-8")
            except Exception as e:
                logger.warning(f"Failed to save API config for task {self.task_id}: {e}")
            
            tools_schema = await self._tools_schema()
            # English: 简化工具info显示
            tool_names = [tool['function']['name'] for tool in tools_schema]
            logger.info(f"Available tools: {tool_names}")


            # English: 为META-PLANNER准备系统提示
            system_prompt = META_SYSTEM_PROMPT

            if tool_names:
                system_prompt += f"\n\n---\n***\n---\n\nThe EXECUTOR has the following tools available: {tool_names}. "
                system_prompt += "During the planning process, please simultaneously consider the potential uses of these tools and provide corresponding guidance. "
                system_prompt += "However, please note that tools other than these are not provided/available. Therefore, instructing the EXECUTOR to use additional tools is not permitted."
            # Always try to list the workspace structure
            files_context = ""
            list_files_tool_name = "list_workspace_files"
            
            if list_files_tool_name in self.sessions:
                session = self.sessions[list_files_tool_name]
                try:
                    activity_id = self.emit_activity(f"Listing workspace files via {list_files_tool_name}...", "command", command=f"{list_files_tool_name}()")
                    args = {"task_cache_dir": str(self.workspace_dir)} # Provide the workspace directory
                    log_block(f"AUTO TOOL CALL ({list_files_tool_name})", args)
                    
                    result_msg = await self.call_tool_async(list_files_tool_name, args)
                    
                    # The result is now a pre-formatted string from the tool
                    file_list_str = result_msg.content[0].text

                    log_block(f"AUTO TOOL RESULT ({list_files_tool_name})", file_list_str)
                    
                    if uploaded_files:
                        files_context += "The user has uploaded some files. They are located in the 'upload_files' directory. Here is the full workspace structure:\n"
                    else:
                        files_context += "Here is the current workspace structure:\n"
                    
                    files_context += file_list_str
                    files_context += "\n\nThis is the end of the file list. Now, consider the user's request and the provided files to create a plan.\n\n"
                    system_prompt = files_context + META_SYSTEM_PROMPT
                    
                    self.emit_activity_update(activity_id, "completed")
                except Exception as e:
                    logger.error(f"Failed to auto-list workspace files with {list_files_tool_name}: {e}")
                    # Fallback if the tool fails
                    if uploaded_files:
                        system_prompt = f"The user has uploaded the following files to the 'upload_files' directory: {', '.join(uploaded_files)}. Please proceed with the plan.\n\n" + META_SYSTEM_PROMPT

            # English: 添加用户消息到历史
            self._add_to_history("user", query)
            log_block("META‑SYSTEM", system_prompt)
            # English: 元规划器消息
            planner_msgs = [{"role": "system", "content": system_prompt}] + self.shared_history
            log_block("META‑PLANNER INPUT (cycle 0)", query)

            
            # initializemeta_contentvariable，防止未定义error
            meta_content = ""

            for cycle in range(self.MAX_CYCLES):
                # Check for pause signal before each cycle
                await self._wait_if_paused()
                
                # English: 元规划器process
                try:
                    planning_activity_id = self.emit_activity(f"🧠 Meta-Planner analyzing task (Cycle {cycle + 1})...", "planning")
                    meta_reply = await self.meta_llm.chat(planner_msgs)
                    meta_content = meta_reply["content"] or ""
                    self.emit_activity_update(planning_activity_id, "completed")
                    
                    log_block(f"META‑PLANNER OUTPUT (cycle {cycle})", meta_content)
                    
                except Exception as e:
                    meta_error = f"Meta-Planner execution failed (Cycle {cycle + 1}): {str(e)}"
                    log_block("META-PLANNER ERROR", meta_error)
                    self.emit_error(meta_error, "meta_planner_error", cycle=cycle)
                    if 'planning_activity_id' in locals():
                        self.emit_activity_update(planning_activity_id, "failed", error=str(e))
                    raise

                # save规划器output到历史
                self._add_to_history("assistant", meta_content)

                # complete分析活动


                # check最终答案
                if "FINAL ANSWER:" in meta_content:
                    log_block("FINAL ANSWER DETECTED", meta_content)
                    final_answer_text = meta_content.split("FINAL ANSWER:")[1]
                    self.emit_final_answer(final_answer_text)

                    final_answer_file = self.workspace_dir / "final_answer.txt"
                    final_answer_file.write_text(str(meta_content), encoding="utf-8")
                    
                    # updatetodo.md为completestatus

                    
                    self.emit_task_update("completed", final_answer=final_answer_text)
                    return meta_content

                # English: 解析JSON计划
                try:

                    
                    log_block(f"PLAN PARSED (cycle {cycle})", meta_content)
                    self.update_todo_md(meta_content)
                    
                    # save计划
                    plan_file = self.workspace_dir / f"plan_cycle_{cycle}.md"

                    plan_file.write_text(meta_content, encoding="utf-8")
                    
                except Exception as e:
                    error_msg = f"[planner error] {e}: {meta_content}"
                    log_block("PLAN PARSING ERROR", error_msg)
                    self.emit_task_update("failed", error=str(e))
                    return error_msg



                # execute器消息
                exec_msgs = (
                    [{"role": "system", "content": EXEC_SYSTEM_PROMPT}]
                    + self.shared_history
                    + [{"role": "user", "content": meta_content}]
                )

                while True:
                    # Check for pause signal before each executor action
                    await self._wait_if_paused()
                    
                    try:
                        executor_activity_id = self.emit_activity(f"⚡ Executor processing task (Cycle {cycle + 1})...", "execution")
                        exec_reply = await self.exec_llm.chat(exec_msgs, tools_schema)
                        self.emit_activity_update(executor_activity_id, "completed")
                        
                    except Exception as e:
                        exec_error = f"Executor call failed (Cycle {cycle + 1}): {str(e)}"
                        log_block("EXECUTOR ERROR", exec_error)
                        self.emit_error(exec_error, "executor_error", cycle=cycle)
                        if 'executor_activity_id' in locals():
                            self.emit_activity_update(executor_activity_id, "failed", error=str(e))
                        raise

                    # English: 普通助手响应
                    if exec_reply["content"]:
                        result_text = exec_reply["content"]
                        exec_msgs.append({"role": "assistant", "content": result_text})
                        
                        log_block(f"EXECUTOR OUTPUT)", result_text)
                        

                        
                        # English: 存储result到历史
                        self._add_to_history("user", f"EXEC AGENT: Task result: {result_text}")
                        
                        # save任务result
                        task_result_file = self.workspace_dir / f"task_result.txt"
                        task_result_file.write_text(str(result_text), encoding="utf-8")
                        
                        # updatetodo.mdcompletestatus

                        break

                    # English: 工具调用
                    tool_calls = exec_reply.get("tool_calls")
                    if not tool_calls:
                        log_block("NO RESPONSE", "Executor returned neither content nor tool calls")
                        break

                    for call in tool_calls:
                        t_name = call["function"]["name"]
                        try:
                            # English: 更安全的parameter解析
                            raw_args = call["function"].get("arguments") or "{}"
                            if isinstance(raw_args, str):
                                t_args = json.loads(raw_args)
                            else:
                                t_args = raw_args
                        except json.JSONDecodeError as e:
                            error_msg = f"Failed to parse arguments for {t_name}: {raw_args}, error: {e}"
                            log_block("TOOL CALL PARSE ERROR", error_msg)
                            # English: 尝试修复常见的JSON问题
                            try:
                                # English: 移除可能的额外反斜杠或修复引号
                                fixed_args = raw_args.replace('\\"', '"').replace("\\n", "\n")
                                t_args = json.loads(fixed_args)
                                log_block("TOOL CALL PARSE FIXED", f"Successfully fixed arguments: {t_args}")
                            except:
                                # English: 如果仍然failed，使用空parameter
                                t_args = {}
                                log_block("TOOL CALL FALLBACK", f"Using empty arguments for {t_name}")
                        
                        # English: 注入workspacepath到工具parameter
                        if "task_cache_dir" not in t_args:
                            t_args["task_cache_dir"] = str(self.workspace_dir)
                        if "workspace" not in t_args:
                            t_args["workspace"] = str(self.workspace_dir)
                        
                        log_block(
                            f"EXECUTOR → TOOL CALL ({t_name})",
                            _serialize_for_json(t_args)
                        )
                        
                        # English: 发送工具调用活动
                        tool_activity_id = self.emit_activity(f"Calling tool: {t_name}", "command", 
                                                            command=f"{t_name}({json.dumps(t_args, ensure_ascii=False)})")

                        try:
                            session = self.sessions[t_name]
                            
                            # English: 确保parameter格式正确 - 深度序列化process
                            clean_args = {}
                            for key, value in t_args.items():
                                # English: 确保parameter值是JSON可序列化的
                                if isinstance(value, (str, int, float, bool, type(None))):
                                    clean_args[key] = value
                                elif isinstance(value, (list, dict)):
                                    # English: 对复杂对象进行序列化
                                    try:
                                        clean_args[key] = _serialize_for_json(value)
                                    except:
                                        clean_args[key] = str(value)
                                else:
                                    # English: 其他class型转换为字符串
                                    clean_args[key] = str(value)
                            
                            result_msg = await self.call_tool_async(t_name, clean_args)
                            
                            log_block(f"TOOL RESULT ({t_name})", result_msg.content)

                            # process不同工具的result
                            await self._handle_tool_result(t_name, clean_args, result_msg, clean_args)
                            
                            # complete工具调用
                            self.emit_activity_update(tool_activity_id, "completed")
                            
                            # save工具调用记录
                            tool_call_file = self.workspace_dir / f"tool_call_{t_name}_{cycle}.json"
                            tool_call_data = {
                                "tool_name": str(t_name),
                                "original_arguments": _serialize_for_json(t_args),
                                "cleaned_arguments": clean_args,
                                "result": str(result_msg.content),
                                "timestamp": datetime.datetime.now().isoformat()
                            }
                            try:
                                tool_call_file.write_text(json.dumps(tool_call_data, indent=2, ensure_ascii=False), encoding="utf-8")
                            except Exception as e:
                                logger.error(f"Failed to save tool call: {e}")

                            # English: 反馈到execute器对话
                            exec_msgs.append({
                                "role": "assistant",
                                "content": "",
                                "tool_calls": [call],
                            })
                            exec_msgs.append({
                                "role": "tool",
                                "tool_call_id": call["id"],
                                "name": t_name,
                                "content": result_msg.content,
                            })
                            
                        except Exception as e:
                            error_msg = f"Tool {t_name} call failed: {str(e)}"
                            log_block(f"TOOL ERROR ({t_name})", error_msg)
                            logger.error(error_msg)
                            
                            # English: 发送详细errorinfo到frontend
                            self.emit_error(
                                error_msg, 
                                "tool_call_error", 
                                tool_name=t_name, 
                                tool_args=clean_args,
                                cycle=cycle
                            )
                            
                            # update活动status为failed
                            self.emit_activity_update(tool_activity_id, "failed", error=str(e))
                            
                            # English: 向LLM反馈error
                            exec_msgs.append({
                                "role": "assistant",
                                "content": "",
                                "tool_calls": [call],
                            })
                            exec_msgs.append({
                                "role": "tool",
                                "tool_call_id": call["id"],
                                "name": t_name,
                                "content": f"Error: {str(e)}",
                            })

                files_context = ""
                list_files_tool_name = "list_workspace_files"
                
                if list_files_tool_name in self.sessions:
                    session = self.sessions[list_files_tool_name]
                    try:
                        args = {"task_cache_dir": str(self.workspace_dir)} # Provide the workspace directory
                        result_msg = await self.call_tool_async(list_files_tool_name, args)
                        
                        # The result is now a pre-formatted string from the tool
                        file_list_str = result_msg.content[0].text
                        
                        files_context += "Here is the current workspace structure:\n"
                        
                        files_context += file_list_str

                    except Exception as e:
                        logger.error(f"Failed to auto-list workspace files with {list_files_tool_name}: {e}")
                        # Fallback if the tool fails

                # English: 准备下一轮规划
                planner_msgs = (
                    [{"role": "system", "content": META_SYSTEM_PROMPT + files_context}] + self.shared_history
                )
                
                log_block(
                    f"META‑PLANNER INPUT (cycle {cycle + 1})",
                    "\n".join(m["content"] for m in self.shared_history[-6:])  # show tail only
                )

            # English: 超出最大循环次数
            log_block("MAX CYCLES REACHED", f"Completed {self.MAX_CYCLES} cycles without final answer")
            self.emit_task_update("failed", error="Max cycles reached")
            return meta_content or "FINAL ANSWER: The task could not be completed within the maximum number of cycles."

        except Exception as e:
            error_msg = f"Task {self.task_id} execution failed: {str(e)}"
            log_block("TASK FAILED", error_msg)
            logger.error(error_msg)
            
            # English: 发送详细errorinfo到frontend
            self.emit_error(error_msg, "task_execution_error", task_id=self.task_id)
            self.emit_task_update("failed", error=str(e))
            
            # saveerror到file
            try:
                error_file = self.workspace_dir / "error.txt"
                error_file.write_text(f"任务executeerror:\n{error_msg}\n\n详细info:\n{str(e)}", encoding="utf-8")
            except Exception as save_error:
                logger.error(f"saveerrorinfofailed: {save_error}")
            
            raise

    async def _handle_tool_result(self, tool_name: str, args: dict, result_msg, clean_args: dict = None):
        """process不同工具的result，发送相应的事件 [Contains Chinese - needs translation]"""
        
        # English: 根据工具class型processresult
        if tool_name == "search":
            # English: 搜索工具：save为.jsonsearchfile
            search_filename = f"search_result_{int(time.time())}.jsonsearch"
 
            # English: 提取搜索result并转换为JSON字符串
            search_results = [i.text for i in result_msg.content]
            formatted_content = json.dumps(search_results, indent=2, ensure_ascii=False)
            log_block("SEARCH TOOL RESULT WITH JSON", formatted_content)
            self.emit_file_update(search_filename, formatted_content)
            
        elif tool_name == "crawl_page":
            # English: 爬虫工具：直接返回URL，不爬取content
            url = clean_args.get("url", "unknown") if clean_args else args.get("url", "unknown")
            log_block("CRAWL_PAGE TOOL - RETURNING URL", str(url))
            
            self.emit_file_update("Web.html", url, is_url=True)
            
        elif tool_name == "execute_terminal_command":
            # English: 终端工具：发送终端output
            content = result_msg.content[0].text
            command = clean_args.get("command", "") if clean_args else args.get("command", "")
            self.emit_terminal_output(command, content)
            await self.scan_and_sync_workspace()
            
        elif tool_name == "write_workspace_file":
            # filewrite工具：同时发送filecontent到frontend
            content = result_msg.content[0].text
            filename = clean_args.get("filename", "") if clean_args else args.get("filename", "")
            file_content = clean_args.get("content", "") if clean_args else args.get("content", "")
            
            # check是否successsave
            if content.startswith("✅ File OVERWRITTEN:") or content.startswith("✅ File CREATED:"):
                # English: 发送filecontent到frontend
                if filename and file_content:
                    self.emit_file_update(filename, file_content)
            
        elif tool_name == "video_tool":
            content = str(result_msg.content)
            # English: 视频工具：process视频URL或file
            if "http" in content:
                # English: 如果result包含URL，直接发送
                self.emit_activity(f"Video processing complete: {content}", "video", url=content)
            else:
                # English: 否则save为本地fileURL
                video_filename = f"video_output_{int(time.time())}.mp4"
                video_url = f"/api/file_load/{self.task_id}/{video_filename}"
                self.emit_file_update(video_filename, content, is_url=True)
                self.emit_activity(f"Video saved: {video_url}", "video", url=video_url)
                
        elif tool_name in ["image_tool", "code_tool"]:
            content = str(result_msg.content)
            # file工具：check是否create了新file
            if "created" in content.lower() or "saved" in content.lower():
                # English: 扫描workspace查找新file
                await self.scan_and_sync_workspace()
        else:
            content = str(result_msg.content)
            # English: 其他工具：发送一般活动status
            self.emit_activity(f"Tool {tool_name} execution finished", "activity", result=content)

    def emit_file_deleted(self, filename: str):
        """Sends a file deletion event."""
        delete_data = {"filename": filename}
        self._send_message("file_delete", delete_data)

    def scan_and_sync_workspace_legacy(self):
        """扫描workspacedirectory，发送fileupdate(旧版，仅新增) [Contains Chinese - needs translation]"""
        try:
            files_dir = self.workspace_dir / "files"
            if files_dir.exists():
                for file_path in files_dir.rglob("*"):
                    if file_path.is_file():
                        relative_path = file_path.relative_to(files_dir)
                        filename = str(relative_path)
                        
                        if filename not in self.files_created:
                            try:
                                if should_use_url_mode(filename):
                                    # English: 二进制file：使用URL模式
                                    file_url = f"/api/file_load/{self.task_id}/{filename}"
                                    self.emit_file_update(filename, file_url, is_url=True)
                                else:
                                    # English: 文本file：readcontent
                                    content = file_path.read_text(encoding="utf-8")
                                    self.emit_file_update(filename, content)
                            except Exception as e:
                                logger.error(f"Error reading file {filename}: {e}")
        except Exception as e:
            logger.error(f"Error scanning files: {e}")

    async def scan_and_sync_workspace(self):
        """Scans the workspace, compares with the stored state, and emits updates."""
        logger.info(f"Scanning workspace for task {self.task_id} for file changes.")
        current_files = {}
        files_dir = self.workspace_dir / "workspace"
        
        if files_dir.exists():
            for root, _, files in os.walk(files_dir):
                for name in files:
                    file_path = Path(root) / name
                    relative_path = str(file_path.relative_to(files_dir))
                    try:
                        current_files[relative_path] = file_path.stat().st_mtime
                    except OSError:
                        continue

        # English: 查找新file和修改过的file
        for filename, mtime in current_files.items():
            if filename not in self.workspace_file_states or self.workspace_file_states[filename] < mtime:
                logger.info(f"Detected new/modified file: {filename}")
                file_path = files_dir / filename
                try:
                    if should_use_url_mode(filename):
                        file_url = f"/api/file_load/{self.task_id}/{filename}"
                        self.emit_file_update(filename, file_url, is_url=True)
                    else:
                        content = file_path.read_text(encoding="utf-8", errors="ignore")
                        self.emit_file_update(filename, content)
                except Exception as e:
                    logger.error(f"Error reading file for sync {filename}: {e}")

        # English: 查找delete的file
        deleted_files = set(self.workspace_file_states.keys()) - set(current_files.keys())
        for filename in deleted_files:
            logger.info(f"Detected deleted file: {filename}")
            self.emit_file_deleted(filename)
            
        # updatestatus
        self.workspace_file_states = current_files
        logger.info("Workspace sync complete.")

    async def cleanup(self):
        """清理资源 - 使用global tool pool后不需要清理连接 [Contains Chinese - needs translation]"""
        logger.info(f"任务 {self.task_id} 清理complete，global tool poolcontinuerun")

# ==============================================================================
# Flask API路由
# ==============================================================================

@app.route('/api/tasks', methods=['POST','OPTIONS'])
def create_task():
    """create新任务并立即startexecute - 确保原子性 [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    try:
        data = request.get_json()
        prompt = data.get('prompt', '')
        attachments = data.get('attachments', [])
        api_config = data.get('api_config', {})

        if not prompt.strip():
            return jsonify({'error': 'Prompt is required'}), 400
            
        # verifyAPIconfiguration
        required_api_fields = ['openaiApiKey', 'model']
        missing_fields = [field for field in required_api_fields if not api_config.get(field)]
        if missing_fields:
            return jsonify({'error': f'Missing required API config fields: {missing_fields}'}), 400
            
        # English: 提取APIconfiguration
        openai_api_key = api_config.get('openaiApiKey')
        openai_base_url = api_config.get('openaiBaseUrl')
        model = api_config.get('model')

        # English: 生成任务ID和workspacedirectory
        task_id = str(uuid.uuid4())
        workspace_dir = Path("workspaces") / task_id
        workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # English: 立即将path转换为绝对path，以确保在所有子进程中都能正确定位
        absolute_workspace_dir = str(workspace_dir.resolve())
        logger.info(f"Created workspace with absolute path: {absolute_workspace_dir}")

        # processupload的file
        uploaded_files_list = []
        if attachments:
            upload_dir = workspace_dir / "workspace" / "upload_files"
            upload_dir.mkdir(exist_ok=True, parents=True)
            
            for attachment in attachments:
                if isinstance(attachment, dict) and 'name' in attachment and 'content' in attachment:
                    filename = attachment['name']
                    content_base64 = attachment['content']
                    
                    if ',' in content_base64:
                        content_base64 = content_base64.split(',', 1)[1]

                    try:
                        file_bytes = base64.b64decode(content_base64)
                    except (ValueError, TypeError) as e:
                        logger.error(f"Failed to decode base64 for file {filename}: {e}")
                        continue
                    
                    if filename.lower().endswith('.zip'):
                        logger.info(f"Unzipping file: {filename} to {upload_dir}")
                        try:
                            with zipfile.ZipFile(io.BytesIO(file_bytes), 'r') as zip_ref:
                                for member in zip_ref.infolist():
                                    if not member.is_dir():
                                        # To prevent path traversal, we resolve the path
                                        target_path = (upload_dir / member.filename).resolve()
                                        if str(target_path).startswith(str(upload_dir.resolve())):
                                            zip_ref.extract(member, upload_dir)
                                            relative_member_path = Path("upload_files") / member.filename
                                            uploaded_files_list.append(str(relative_member_path))
                                        else:
                                            logger.warning(f"Skipping potentially malicious zip member: {member.filename}")
                        except zipfile.BadZipFile:
                            logger.error(f"Bad zip file, saving as is: {filename}")
                            (upload_dir / filename).write_bytes(file_bytes)
                            uploaded_files_list.append(str(Path("upload_files") / filename))
                    else:
                        (upload_dir / filename).write_bytes(file_bytes)
                        uploaded_files_list.append(str(Path("upload_files") / filename))

        # create任务记录 - 立即setup为runningstatus
        active_tasks[task_id] = {
            'id': task_id,
            'prompt': prompt,
            'status': 'running',  # English: 改为runningstatus
            'created_at': time.time(),
            'workspace_dir': absolute_workspace_dir,
            'uploaded_files': uploaded_files_list,
            'api_config': {
                'openai_api_key': openai_api_key,
                'openai_base_url': openai_base_url,
                'model': model
            }
        }

        # create消息队列
        task_queues[task_id] = queue.Queue()

        # English: 立即createclient并startexecute任务 - 确保原子性
        try:
            # checkglobal tool pool是否已initialize
            if not tools_initialized:
                error_msg = "Global tool service pool not initialized, cannot create task"
                logger.error(error_msg)
                active_tasks[task_id]['status'] = 'failed'
                active_tasks[task_id]['error'] = error_msg
                
                # English: 发送error到队列
                if task_id in task_queues:
                    error_message = {
                        "type": "error",
                        "data": {
                            "message": error_msg,
                            "error_type": "initialization_error"
                        },
                        "timestamp": time.time()
                    }
                    task_queues[task_id].put(error_message)
                
                raise RuntimeError(error_msg)
            
            logger.info(f"任务 {task_id}: create后立即startexecute")
            
            # createclient - 使用传入的APIconfiguration
            client = HierarchicalClient(model, openai_api_key, openai_base_url, task_id, str(workspace_dir))
            task_clients[task_id] = client
            
            # English: 在新线程中start任务execute
            def run_task():
                try:
                    logger.info(f"任务 {task_id}: 连接到global tool pool")
                    
                    # run异步任务
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                    async def execute():
                        result = None  # initializeresultvariable
                        try:
                            # English: 连接到global tool pool
                            connected_tools = client.connect_to_global_tools()
                            logger.info(f"任务 {task_id} success连接到 {len(connected_tools)} 个工具")
                            
                            prompt = active_tasks[task_id]['prompt']
                            uploaded_files = active_tasks[task_id].get('uploaded_files', [])
                            result = await client.process_query(prompt, uploaded_files=uploaded_files)
                            logger.info(f"任务 {task_id} complete，result: {result[:100] if result else 'No result'}...")
                            
                            # save到历史
                            completed_tasks_history[task_id] = {
                                'task_id': task_id,
                                'completed_at': time.time(),
                                'final_result': result or 'Task failed',
                                'files': dict(client.files_created) if hasattr(client, 'files_created') else {},
                                'messages': []  # English: 消息已save在file中
                            }
                            
                        except Exception as e:
                            logger.error(f"任务 {task_id} executefailed: {e}")
                            # English: 确保即使failed也save到历史
                            completed_tasks_history[task_id] = {
                                'task_id': task_id,
                                'completed_at': time.time(),
                                'final_result': f'Error: {str(e)}',
                                'files': dict(client.files_created) if hasattr(client, 'files_created') else {},
                                'messages': []
                            }
                            raise
                        
                        finally:
                            # English: 清理
                            if task_id in active_tasks:
                                del active_tasks[task_id]
                            # English: 不需要清理全局工具连接
                    
                    loop.run_until_complete(execute())
                    
                except Exception as e:
                    logger.error(f"任务executeerror: {e}")
                    # English: 发送详细error消息到frontend
                    if task_id in task_queues:
                        error_msg = {
                            "type": "error",
                            "data": {
                                "message": f"Error occurred during task execution: {str(e)}",
                                "error_type": "task_execution_error",
                                "task_id": task_id
                            },
                            "timestamp": time.time()
                        }
                        task_queues[task_id].put(error_msg)
                        
                        # English: 发送任务statusupdate
                        task_update_msg = {
                            "type": "task_update",
                            "data": {
                                "status": "failed",
                                "error": str(e),
                                "error_type": "execution_error"
                            },
                            "timestamp": time.time()
                        }
                        task_queues[task_id].put(task_update_msg)

            thread = threading.Thread(target=run_task)
            thread.daemon = True
            thread.start()
            
            logger.info(f"Created and started task {task_id}: {prompt[:50]}...")

            return jsonify({
                'task_id': task_id,
                'status': 'running',  # English: 返回runningstatus
                'workspace_dir': absolute_workspace_dir,
                'message': 'Task created and execution started immediately'
            })
            
        except Exception as e:
            # English: 如果startexecutefailed，update任务status为failed
            error_msg = f"Failed to start task execution: {str(e)}"
            active_tasks[task_id]['status'] = 'failed'
            active_tasks[task_id]['error'] = error_msg
            logger.error(f"Failed to start task {task_id}: {e}")
            
            # English: 发送error到队列
            if task_id in task_queues:
                error_message = {
                    "type": "error",
                    "data": {
                        "message": error_msg,
                        "error_type": "task_start_error",
                        "task_id": task_id
                    },
                    "timestamp": time.time()
                }
                task_queues[task_id].put(error_message)
            
            return jsonify({
                'task_id': task_id,
                'status': 'failed',
                'workspace_dir': absolute_workspace_dir,
                'error': error_msg,
                'error_type': 'task_start_error'
            }), 500

    except Exception as e:
        error_msg = f"Task creation failed: {str(e)}"
        logger.error(f"Error creating task: {e}")
        return jsonify({
            'error': error_msg,
            'error_type': 'task_creation_error'
        }), 500

@app.route('/api/tasks/<task_id>/connect', methods=['POST', 'OPTIONS'])
def connect_task(task_id):
    """连接任务并回放消息 - 任务execute已在create_task中start [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    logger.info(f"Connecting to task: {task_id}")

    # check任务是否存在
    workspace_dir = None
    if task_id in active_tasks:
        workspace_dir = Path(active_tasks[task_id]['workspace_dir'])
    elif task_id in completed_tasks_history:
        workspace_dir = Path("workspaces") / task_id
    else:
        # English: 尝试从workspacesdirectory查找
        potential_workspace = Path("workspaces") / task_id
        if potential_workspace.exists():
            workspace_dir = potential_workspace
        else:
            return jsonify({'error': 'Task not found'}), 404

    def generate_response():
        """生成流式响应 - 仅负责回放消息 [Contains Chinese - needs translation]"""
        try:
            # check是否存在历史消息file
            messages_file = workspace_dir / "messages.jsonl"
            
            if messages_file.exists():
                # English: 回放历史消息
                logger.info(f"Replaying messages from file for task {task_id}")
                
                with open(messages_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.strip():
                            try:
                                message = json.loads(line)
                                chunk = json.dumps(message) + '\n'
                                yield chunk
                                time.sleep(0.1)  # English: 控制回放速度
                            except json.JSONDecodeError:
                                continue
                
                # check任务是否已complete
                if task_id in completed_tasks_history or not (task_id in active_tasks or task_id in task_clients):
                    # English: 发送任务complete信号
                    final_message = {
                        "type": "connection_close",
                        "data": {"reason": "Task completed - replayed from file"},
                        "timestamp": time.time()
                    }
                    yield json.dumps(final_message) + '\n'
                    return
                            
            # English: 发送实时消息流 - 如果任务正在run
            if task_id in task_queues:
                task_queue = task_queues[task_id]
                message_count = 0
                
                while True:
                    try:
                        message = task_queue.get(timeout=30)
                        message_count += 1
                        
                        chunk = json.dumps(message) + '\n'
                        yield chunk
                        
                        # check任务是否complete
                        if (message.get('type') == 'task_update' and 
                            message.get('data', {}).get('status') in ['completed', 'failed']):
                            logger.info(f"Task {task_id} finished, sent {message_count} messages")
                            break
                            
                    except queue.Empty:
                        # English: 发送心跳
                        heartbeat = json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n'
                        yield heartbeat
                        continue
            else:
                # English: 没有活动任务，发送连接disable信号
                final_message = {
                    "type": "connection_close",
                    "data": {"reason": "No active task or task already completed"},
                    "timestamp": time.time()
                }
                yield json.dumps(final_message) + '\n'

        except Exception as e:
            logger.error(f"Connection error for task {task_id}: {e}")
            error_msg = json.dumps({
                'type': 'error', 
                'data': {
                    'message': f'Error connecting to task {task_id}: {str(e)}',
                    'error_type': 'connection_error',
                    'task_id': task_id
                },
                'timestamp': time.time()
            }) + '\n'
            yield error_msg

    return Response(
        generate_response(),
        mimetype='text/plain',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Transfer-Encoding': 'chunked'
        }
    )
@app.route('/api/tasks/<task_id>/workspaces/<path:filename>', methods=['GET'])
def get_file_content(task_id, filename):
    """getfilecontent"""
    try:
        # check任务
        workspace_dir = None
        if task_id in active_tasks:
            workspace_dir = Path(active_tasks[task_id]['workspace_dir'])
        elif task_id in completed_tasks_history:
            workspace_dir = Path("workspaces") / task_id
        elif task_id in task_clients:
            workspace_dir = task_clients[task_id].workspace_dir
        
        if not workspace_dir:
            return jsonify({'error': 'Task not found'}), 404

        # English: 查找file
        file_path = workspace_dir / "workspace" / filename
        log_block("file_path", str(file_path))
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        # readfilecontent
        try:
            if should_use_url_mode(filename):
                # English: 二进制file，返回为download
                return send_file(str(file_path), as_attachment=False)
            else:
                # English: 文本file，返回content
                content = file_path.read_text(encoding='utf-8')
                return jsonify({
                    'success': True,
                    'content': content,
                    'filename': filename,
                    'file_type': Path(filename).suffix[1:] if Path(filename).suffix else 'txt'
                })
        except Exception as e:
            return jsonify({'error': f'Error reading file: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error getting file {filename} for task {task_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/files/<path:filename>', methods=['GET'])
def get_files_content(task_id, filename):
    """getfilecontent"""
    try:
        # check任务
        workspace_dir = None
        if task_id in active_tasks:
            workspace_dir = Path(active_tasks[task_id]['workspace_dir'])
        elif task_id in completed_tasks_history:
            workspace_dir = Path("workspaces") / task_id
        elif task_id in task_clients:
            workspace_dir = task_clients[task_id].workspace_dir
        
        if not workspace_dir:
            return jsonify({'error': 'Task not found'}), 404

        # English: 查找file
        file_path = '/root/demo/AGENT/agent/' / workspace_dir / "workspace" / filename
        log_block("file_path", file_path)
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404

        # readfilecontent
        try:
            if should_use_url_mode(filename):
                # English: 二进制file，返回为download
                return send_file(str(file_path), as_attachment=False)
            else:
                # English: 文本file，返回content
                content = file_path.read_text(encoding='utf-8')
                return jsonify({
                    'success': True,
                    'content': content,
                    'filename': filename,
                    'file_type': Path(filename).suffix[1:] if Path(filename).suffix else 'txt'
                })
        except Exception as e:
            return jsonify({'error': f'Error reading file: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Error getting file {filename} for task {task_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/file_load/<task_id>/<path:filename>', methods=['GET'])
def load_file(task_id, filename):
    """直接loadfilecontent [Contains Chinese - needs translation]"""
    return get_files_content(task_id, filename)

@app.route('/api/tasks/<task_id>/export', methods=['GET'])
def export_task_workspace(task_id):
    """导出任务工作空间为ZIPfile [Contains Chinese - needs translation]"""
    try:
        logger.info(f"Export request for task: {task_id}")
        
        # English: 查找工作空间directory
        workspace_dir = None
        if task_id in active_tasks:
            workspace_dir = Path(active_tasks[task_id]['workspace_dir'])
            logger.info(f"Found workspace in active_tasks: {workspace_dir}")
        elif task_id in completed_tasks_history:
            workspace_dir = Path("workspaces") / task_id
            logger.info(f"Found workspace in completed_tasks_history: {workspace_dir}")
        elif task_id in task_clients:
            workspace_dir = task_clients[task_id].workspace_dir
            logger.info(f"Found workspace in task_clients: {workspace_dir}")
        else:
            # English: 尝试直接查找workspacedirectory
            potential_workspace = Path("workspaces") / task_id
            if potential_workspace.exists():
                workspace_dir = potential_workspace
                logger.info(f"Found workspace by direct search: {workspace_dir}")
        
        if not workspace_dir:
            logger.error(f"Workspace directory not found for task {task_id}")
            return jsonify({'error': 'Task workspace not found'}), 404
            
        if not workspace_dir.exists():
            logger.error(f"Workspace directory does not exist: {workspace_dir}")
            return jsonify({'error': 'Task workspace directory does not exist'}), 404

        # English: 确保workspace_dir是绝对path
        workspace_dir = workspace_dir.resolve()
        logger.info(f"Resolved workspace directory: {workspace_dir}")
        
        # create临时ZIPfile - 使用临时directory避免path冲突
        zip_filename = f"task_{task_id}_export.zip"
        
        # create临时file
        temp_dir = Path(tempfile.gettempdir())
        zip_path = temp_dir / zip_filename
        
        logger.info(f"Creating export ZIP at: {zip_path}")
        logger.info(f"Temp directory: {temp_dir}")
        logger.info(f"Workspace directory: {workspace_dir}")
        
        # English: 确保临时directory存在
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        files_added = 0
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # English: 添加workspace子directory（如果存在）
            workspace_subdir = workspace_dir / "workspace"
            if workspace_subdir.exists():
                for file_path in workspace_subdir.rglob('*'):
                    if file_path.is_file():
                        # English: 计算相对path，保持directory结构
                        try:
                            arcname = f"workspace/{file_path.relative_to(workspace_subdir)}"
                            logger.debug(f"Adding to ZIP: {file_path} -> {arcname}")
                            zipf.write(file_path, arcname)
                            files_added += 1
                        except Exception as e:
                            logger.warning(f"Failed to add workspace file {file_path}: {e}")
            
        logger.info(f"Added {files_added} files to ZIP")
        
        # verifyZIPfile是否successcreate
        if not zip_path.exists():
            logger.error(f"ZIP file was not created: {zip_path}")
            return jsonify({'error': 'Failed to create export ZIP file'}), 500
            
        zip_size = zip_path.stat().st_size
        logger.info(f"ZIP file created successfully: {zip_path} ({zip_size} bytes)")

        # English: 使用绝对path发送file
        absolute_zip_path = str(zip_path.resolve())
        logger.info(f"Sending ZIP file from absolute path: {absolute_zip_path}")

        # English: 发送ZIPfile
        response = send_file(
            absolute_zip_path,
            as_attachment=True,
            download_name=zip_filename,
            mimetype='application/zip'
        )
        
        # setup清理回调（delete临时file）
        @response.call_on_close
        def cleanup():
            try:
                if zip_path.exists():
                    zip_path.unlink()
                    logger.info(f"Cleaned up temporary ZIP file: {zip_path}")
            except Exception as e:
                logger.error(f"Error cleaning up export file: {e}")
        
        return response

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        logger.error(f"Error exporting task {task_id}: {e}")
        logger.error(f"Full traceback: {error_detail}")
        return jsonify({'error': f'Export failed: {str(e)}'}), 500

def _get_workspace_dir(task_id: str) -> Optional[Path]:
    """Helper to get workspace directory for a task."""
    workspace_dir = None
    if task_id in active_tasks:
        workspace_dir = Path(active_tasks[task_id]['workspace_dir'])
    elif task_id in task_clients:
        workspace_dir = task_clients[task_id].workspace_dir
    elif task_id in completed_tasks_history:
         # For completed tasks, the structure might be different.
         # Assuming the history stores the path.
        if 'workspace_dir' in completed_tasks_history[task_id]:
             workspace_dir = Path(completed_tasks_history[task_id]['workspace_dir'])
        else:
             workspace_dir = Path("workspaces") / task_id # Fallback
    else:
        # Fallback to checking the filesystem
        potential_dir = Path("workspaces") / task_id
        if potential_dir.exists():
            workspace_dir = potential_dir
    return workspace_dir

@app.route('/api/tasks/<task_id>/pause', methods=['POST', 'OPTIONS'])
def pause_task(task_id):
    """Pauses a running task."""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    workspace_dir = _get_workspace_dir(task_id)
    if not workspace_dir or not workspace_dir.exists():
        return jsonify({'error': 'Task workspace not found'}), 404

    try:
        run_file = workspace_dir / "_run"
        run_file.write_text('0', encoding='utf-8')
        logger.info(f"Task {task_id} paused by API request.")
        
        # Also send a message to the frontend queue if the task is active
        if task_id in task_clients:
            task_clients[task_id].emit_task_update("paused")
            
        return jsonify({'success': True, 'is_paused': True, 'message': 'Task paused'})
    except Exception as e:
        logger.error(f"Error pausing task {task_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/resume', methods=['POST', 'OPTIONS'])
def resume_task(task_id):
    """Resumes a paused task."""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    workspace_dir = _get_workspace_dir(task_id)
    if not workspace_dir or not workspace_dir.exists():
        return jsonify({'error': 'Task workspace not found'}), 404

    try:
        run_file = workspace_dir / "_run"
        run_file.write_text('1', encoding='utf-8')
        logger.info(f"Task {task_id} resumed by API request.")

        # Also send a message to the frontend queue if the task is active
        if task_id in task_clients:
            task_clients[task_id].emit_task_update("running")

        return jsonify({'success': True, 'is_paused': False, 'message': 'Task resumed'})
    except Exception as e:
        logger.error(f"Error resuming task {task_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<task_id>/save-file', methods=['POST'])
def save_file(task_id):
    """Saves file content, with special handling for todo.md to update agent state."""
    try:
        data = request.get_json()
        filename = data.get('filename')
        content = data.get('content', '')

        if not filename:
            return jsonify({'error': 'Filename is required'}), 400

        client = task_clients.get(task_id)

        # Handle case where task is not active (e.g., completed)
        if not client:
            workspace_dir = _get_workspace_dir(task_id)
            if not workspace_dir:
                return jsonify({'error': 'Task not found'}), 404
            
            try:
                file_path = workspace_dir / "workspace" / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(content, encoding="utf-8")
                logger.info(f"File saved directly to inactive task workspace: {filename}")
                return jsonify({
                    'success': True,
                    'message': f'✅ File saved directly: {filename}',
                    'method': 'direct_file_save'
                })
            except Exception as e:
                logger.error(f"Error saving file directly: {e}")
                return jsonify({'success': False, 'message': f'Error saving file directly: {str(e)}'}), 500

        # --- Handle active task ---
        workspace_dir = client.workspace_dir
        
        # Special handling for todo.md to update agent state
        if filename == 'todo.md':
            logger.info(f"Saving todo.md for task {task_id} and updating agent state.")
            
            # 1. Save file to disk
            file_path = workspace_dir / "workspace" / "todo.md"
            file_path.write_text(content, encoding='utf-8')

            # 2. Update shared history
            updated = False
            for i in range(len(client.shared_history) - 1, -1, -1):
                if client.shared_history[i]['role'] == 'assistant':
                    logger.info(f"Found last assistant message to update in shared_history for task {task_id}.")
                    client.shared_history[i]['content'] = content
                    updated = True
                    break
            
            if not updated:
                 # If no assistant message found, append it. This might happen in edge cases.
                client.shared_history.append({'role': 'assistant', 'content': content})
                logger.warning(f"No prior assistant message in history for task {task_id}. Appended new todo.md.")


            # 3. Emit file update to frontend to confirm save
            client.emit_file_update(filename, content)

            return jsonify({
                'success': True,
                'message': '✅ todo.md saved and agent state updated.',
                'filename': filename,
                'method': 'agent_state_update'
            })

        # --- Default handling for other files ---
        else:
            try:
                file_path = workspace_dir / "workspace" / filename
                file_path.parent.mkdir(parents=True, exist_ok=True)
                
                # Save file
                try:
                    file_path.write_text(content, encoding="utf-8")
                except Exception:
                    file_path.write_bytes(content.encode('utf-8', errors='ignore'))
                
                # Update client state and notify frontend
                client.files_created[filename] = content
                client.emit_file_update(filename, content)
                
                return jsonify({
                    'success': True,
                    'message': f'✅ File saved: {filename}',
                    'filename': filename,
                    'method': 'direct_with_event'
                })
                
            except Exception as e:
                logger.error(f"Error saving file '{filename}' directly for task {task_id}: {e}")
                return jsonify({
                    'success': False,
                    'message': f"Error saving file directly: {str(e)}",
                    'filename': filename,
                    'method': 'direct_with_event'
                }), 500

    except Exception as e:
        error_msg = f"File save failed: {str(e)}"
        logger.error(f"Error in save_file for task {task_id}: {e}")
        
        # English: 如果client存在，发送error到frontend
        if task_id in task_clients:
            try:
                client = task_clients[task_id]
                client.emit_error(error_msg, "file_save_error", filename=filename)
            except Exception as emit_error:
                logger.error(f"发送filesaveerror到frontendfailed: {emit_error}")
        
        return jsonify({
            'success': False,
            'error': error_msg,
            'filename': filename,
            'error_type': 'file_save_error'
        }), 500

@app.route('/api/tasks/<task_id>')
def get_task(task_id):
    """get任务info [Contains Chinese - needs translation]"""
    if task_id in active_tasks:
        return jsonify(active_tasks[task_id])
    elif task_id in completed_tasks_history:
        return jsonify(completed_tasks_history[task_id])
    else:
        return jsonify({'error': 'Task not found'}), 404

@app.route('/api/tasks')
def list_tasks():
    """列出所有任务 [Contains Chinese - needs translation]"""
    tasks_list = []
    
    # English: 添加活跃任务
    for task in active_tasks.values():
        task_info = task.copy()
        task_info['category'] = 'active'
        tasks_list.append(task_info)
    
    # English: 添加已complete任务的摘要info
    for task_id, task_data in completed_tasks_history.items():
        task_info = {
            'id': task_id,
            'prompt': task_data.get('prompt', ''),
            'status': task_data.get('final_status', 'completed'),
            'completed_at': task_data.get('completed_at'),
            'workspace_dir': task_data.get('workspace_dir', ''),
            'category': 'completed',
            'auto_loaded': True  # English: 历史任务都是自动load的
        }
        tasks_list.append(task_info)
    
    return jsonify({
        'tasks': tasks_list,
        'summary': {
            'total': len(tasks_list),
            'active': len(active_tasks),
            'completed': len(completed_tasks_history),
            'auto_loaded': sum(1 for task in active_tasks.values() if task.get('auto_loaded', False)),
            'auto_paused': sum(1 for task in active_tasks.values() if task.get('auto_paused', False)),
            'paused_tasks': sum(1 for task in active_tasks.values() if task.get('status') == 'paused'),
            'running_tasks': sum(1 for task in active_tasks.values() if task.get('status') == 'running')
        }
    })

@app.route('/api/health')
def health_check():
    """健康check [Contains Chinese - needs translation]"""
    tools_info = get_global_tools_info()
    
    # English: 统计自动load的任务
    auto_loaded_tasks = sum(1 for task in active_tasks.values() if task.get('auto_loaded', False))
    auto_paused_tasks = sum(1 for task in active_tasks.values() if task.get('auto_paused', False))
    
    return jsonify({
        'status': 'healthy',
        'active_tasks': len(active_tasks),
        'running_clients': len(task_clients),
        'completed_tasks': len(completed_tasks_history),
        'auto_loaded_tasks': auto_loaded_tasks,
        'auto_paused_tasks': auto_paused_tasks,
        'tools_initialized': tools_info['initialized'],
        'available_tools': tools_info['tool_names'],
        'tools_count': tools_info['tools_count'],
        'timestamp': time.time(),
        'version': '3.3.0-auto-load-tasks',
        'architecture': 'Atomic task execution with auto-loading and auto-pausing of existing workspaces',
        'features': ['auto-task-loading', 'auto-pausing', 'pause-resume', 'todo-state-sync', 'global-tool-pool']
    })

@app.route('/api/tools/status')
def tools_status():
    """get工具池status详情 [Contains Chinese - needs translation]"""
    tools_info = get_global_tools_info()
    return jsonify({
        'initialized': tools_info['initialized'],
        'tools_count': tools_info['tools_count'],
        'tool_names': tools_info['tool_names'],
        'global_sessions_count': len(global_tool_sessions),
        'schema_count': len(global_tools_schema),
        'timestamp': time.time()
    })

@app.route('/api/tasks/reload-workspaces', methods=['POST', 'OPTIONS'])
def reload_workspaces():
    """手动重新load工作空间中的任务 [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    try:
        logger.info("🔄 手动重新load工作空间任务...")
        
        # English: 记录load前的status
        before_active = len(active_tasks)
        before_completed = len(completed_tasks_history)
        before_clients = len(task_clients)
        before_auto_paused = sum(1 for task in active_tasks.values() if task.get('auto_paused', False))
        
        # executeload
        load_existing_tasks_from_workspaces()
        
        # English: 记录load后的status
        after_active = len(active_tasks)
        after_completed = len(completed_tasks_history)
        after_clients = len(task_clients)
        after_auto_paused = sum(1 for task in active_tasks.values() if task.get('auto_paused', False))
        
        # English: 计算新增数量
        new_active = after_active - before_active
        new_completed = after_completed - before_completed
        new_clients = after_clients - before_clients
        new_auto_paused = after_auto_paused - before_auto_paused
        
        return jsonify({
            'success': True,
            'message': 'Workspace tasks reload completed (newly loaded tasks are auto-paused)',
            'before': {
                'active_tasks': before_active,
                'completed_tasks': before_completed,
                'task_clients': before_clients,
                'auto_paused_tasks': before_auto_paused
            },
            'after': {
                'active_tasks': after_active,
                'completed_tasks': after_completed,
                'task_clients': after_clients,
                'auto_paused_tasks': after_auto_paused
            },
            'changes': {
                'new_active_tasks': new_active,
                'new_completed_tasks': new_completed,
                'new_task_clients': new_clients,
                'new_auto_paused_tasks': new_auto_paused
            },
            'pause_policy': 'auto_pause_on_reload',
            'timestamp': time.time()
        })
        
    except Exception as e:
        logger.error(f"❌ 手动重新load工作空间任务failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to reload workspace tasks'
        }), 500

@app.route('/api/tasks/<task_id>/terminal', methods=['POST', 'OPTIONS'])
def execute_terminal(task_id):
    """execute终端命令 - 使用MCP服务器execute并通过消息队列发送result [Contains Chinese - needs translation]"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
        
    try:
        data = request.get_json()
        command = data.get('command', '')
        
        if not command.strip():
            return jsonify({'error': 'Command is required'}), 400
            
        # check任务是否存在并getclient
        if task_id not in task_clients:
            return jsonify({'error': 'Task not found or not active'}), 404
            
        client = task_clients[task_id]
        
        # English: 使用全局tool manager查找终端命令工具
        if not global_tool_manager.initialized:
            return jsonify({'error': 'Global tool manager not initialized'}), 500
        
        # English: 查找可用的终端execute工具
        terminal_tool_name = None
        available_tools = global_tool_manager.get_tools_info()['tool_names']
        
        # English: 按优先级查找终端工具
        for tool_name in ['execute_terminal_command', 'terminal_command', 'shell_command']:
            if tool_name in available_tools:
                terminal_tool_name = tool_name
                break
                
        if not terminal_tool_name:
            return jsonify({'error': f'Terminal tool not available. Available tools: {available_tools}'}), 404
            
        logger.info(f"Using terminal tool '{terminal_tool_name}' for command: {command}")
        
        # execute命令
        async def run_command():
            try:
                # English: 准备parameter - 包含任务工作区path
                args = {
                    "command": command,
                    "task_cache_dir": str(client.workspace_dir),
                    "workspace": str(client.workspace_dir)
                }
                
                logger.info(f"Executing terminal command with args: {args}")
                
                # English: 调用MCP工具
                result_msg = await client.call_tool_async(terminal_tool_name, args)
                
                # English: 提取resultcontent
                if hasattr(result_msg, 'content'):
                    if isinstance(result_msg.content, list):
                        # English: 如果content是列表，提取文本content
                        output = ""
                        for item in result_msg.content:
                            if hasattr(item, 'text'):
                                output += item.text
                            else:
                                output += str(item)
                    else:
                        output = str(result_msg.content)
                else:
                    output = str(result_msg)
                
                logger.info(f"Terminal command '{command}' executed successfully, output length: {len(output)}")
                
                # English: 使用client的emit_terminal_outputmethod发送到frontend
                client.emit_terminal_output(command, output, "completed")
                
                # English: 命令execute后同步filestatus
                await client.scan_and_sync_workspace()

                return {
                    "success": True,
                    "command": command,
                    "output": output,
                    "status": "completed",
                    "message": "Command executed and sent to frontend via message queue"
                }
                
            except Exception as e:
                error_output = f"Error executing command '{command}': {str(e)}"
                logger.error(error_output)
                
                # English: 即使出错也发送到frontend
                client.emit_terminal_output(command, error_output, "failed")
                
                # English: 命令execute后也同步filestatus，以捕获部分success或failed时产生的file
                await client.scan_and_sync_workspace()
                
                return {
                    "success": False,
                    "command": command,
                    "output": error_output,
                    "status": "failed",
                    "error": str(e)
                }
        
        # run异步命令
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(run_command())
        
        return jsonify(result)
        
    except Exception as e:
        error_msg = f"Terminal command execution failed: {str(e)}"
        logger.error(f"Error in terminal API for task {task_id}: {e}")
        
        # English: 如果client存在，发送error到frontend
        if task_id in task_clients:
            try:
                client = task_clients[task_id]
                client.emit_error(error_msg, "terminal_api_error", command=command)
                client.emit_terminal_output(command, f"Execution failed: {str(e)}", "failed")
            except Exception as emit_error:
                logger.error(f"发送终端error到frontendfailed: {emit_error}")
        
        return jsonify({
            'success': False,
            'error': error_msg,
            'command': command,
            'error_type': 'terminal_execution_error'
        }), 500

# ==============================================================================
# start应用
# ==============================================================================

# default服务器列表
DEFAULT_SERVERS = [
    "server/pasa_tool.py",
    "server/code_tool.py", 
    "server/web_crawler.py",
    "server/video_tool.py",
    "server/image_tool.py",
    "server/documents_tool.py",
    "server/math_tool.py",
    "server/search_tool.py"
]

def get_available_servers():
    """get可用的server scripts [Contains Chinese - needs translation]"""
    available_servers = []
    for server in DEFAULT_SERVERS:
        if Path(server).exists():
            available_servers.append(server)
        else:
            logger.warning(f"Server script not found: {server}")
    return available_servers

# Note: Application startup logic is now handled by app.py
# This ensures proper initialization of the global tool pool under different startup methods

# ==============================================================================
# English: 工作空间任务自动load功能
# ==============================================================================

def load_existing_tasks_from_workspaces():
    """start时自动load workspaces directory中的所有现有任务 [Contains Chinese - needs translation]"""
    try:
        workspaces_dir = Path("workspaces")
        if not workspaces_dir.exists():
            logger.info("工作空间directory不存在，跳过任务load")
            return
        
        loaded_count = 0
        failed_count = 0
        
        logger.info("🔍 扫描工作空间directoryload现有任务...")
        
        # English: 扫描所有子directory，每个子directory代表一个任务
        for task_dir in workspaces_dir.iterdir():
            if not task_dir.is_dir():
                continue
                
            task_id = task_dir.name
            
            # English: 跳过已经load的任务
            if task_id in task_clients or task_id in active_tasks:
                continue
            
            try:
                # check是否是有效的任务directory（包含必要file）
                query_file = task_dir / "query.txt"
                if not query_file.exists():
                    logger.debug(f"跳过directory {task_id}：缺少 query.txt file")
                    continue
                
                # read任务查询
                try:
                    task_prompt = query_file.read_text(encoding='utf-8').strip()
                except Exception as e:
                    logger.warning(f"无法read任务 {task_id} 的查询file: {e}")
                    task_prompt = f"已load的任务 {task_id}"
                
                # check任务是否已complete
                final_answer_file = task_dir / "final_answer.txt"
                is_completed = final_answer_file.exists()
                
                if is_completed:
                    # English: 任务已complete，load到历史记录
                    try:
                        final_answer = final_answer_file.read_text(encoding='utf-8')
                    except Exception:
                        final_answer = "任务已complete"
                    
                    # create历史记录条目
                    completed_tasks_history[task_id] = {
                        'task_id': task_id,
                        'prompt': task_prompt,
                        'completed_at': final_answer_file.stat().st_mtime if final_answer_file.exists() else time.time(),
                        'final_status': 'completed',
                        'workspace_dir': str(task_dir.absolute()),
                        'executor_data': {
                            'all_files': {},  # English: 可以进一步扫描file系统get
                            'execution_log': [],
                            'prompt': task_prompt
                        },
                        'messages': []
                    }
                    
                    logger.info(f"📋 已complete任务load: {task_id}")
                    
                else:
                    # English: 任务未complete，createclient实例
                    # English: 尝试从filereadAPIconfiguration
                    api_config_file = task_dir / "api_config.json"
                    api_config = None
                    
                    if api_config_file.exists():
                        try:
                            api_config_data = json.loads(api_config_file.read_text(encoding='utf-8'))
                            api_config = {
                                'model': api_config_data.get('model'),
                                'api_key': api_config_data.get('api_key'),
                                'base_url': api_config_data.get('base_url')
                            }
                        except Exception as e:
                            logger.warning(f"无法read任务 {task_id} 的APIconfiguration: {e}")
                    
                    # English: 如果没有APIconfiguration，尝试使用环境variable作为fallback
                    if not api_config or not api_config.get('model') or not api_config.get('api_key'):
                        fallback_api_key = os.getenv("OPENAI_API_KEY")
                        fallback_base_url = os.getenv("OPENAI_BASE_URL")
                        fallback_model = os.getenv("META_MODEL", "gpt-4o")
                        
                        if not fallback_api_key:
                            logger.warning(f"跳过任务 {task_id}：缺少APIconfiguration且无环境variablefallback")
                            continue
                            
                        api_config = {
                            'model': fallback_model,
                            'api_key': fallback_api_key,
                            'base_url': fallback_base_url
                        }
                        logger.info(f"任务 {task_id} 使用环境variable作为APIconfigurationfallback")
                    
                    # createHierarchicalClient实例
                    client = HierarchicalClient(
                        api_config['model'], 
                        api_config['api_key'], 
                        api_config['base_url'], 
                        task_id, 
                        str(task_dir)
                    )
                    
                    # English: 连接到global tool pool
                    if global_tool_manager.initialized:
                        try:
                            connected_tools = client.connect_to_global_tools()
                            logger.debug(f"任务 {task_id} 连接到 {len(connected_tools)} 个工具")
                        except Exception as e:
                            logger.warning(f"任务 {task_id} 连接工具池failed: {e}")
                    
                    # setup任务为pausestatus - 重新load的任务defaultpause
                    client.run_control_file.write_text('0', encoding='utf-8')
                    logger.info(f"任务 {task_id} 已setup为pausestatus（重新loaddefaultpause）")
                    
                    # English: 添加到全局字典
                    task_clients[task_id] = client
                    
                    # create任务记录
                    active_tasks[task_id] = {
                        'id': task_id,
                        'prompt': task_prompt,
                        'status': 'paused',  # English: 标记为已load但pause
                        'created_at': task_dir.stat().st_mtime,
                        'workspace_dir': str(task_dir.absolute()),
                        'uploaded_files': [],
                        'auto_loaded': True,  # English: 标记为自动load
                        'auto_paused': True,  # English: 标记为自动pause
                        'api_config': {
                            'openai_api_key': api_config['api_key'],
                            'openai_base_url': api_config['base_url'],
                            'model': api_config['model']
                        }
                    }
                    
                    # create消息队列
                    if task_id not in task_queues:
                        task_queues[task_id] = queue.Queue()
                    
                    logger.info(f"🔄 活跃任务load: {task_id}")
                
                loaded_count += 1
                
            except Exception as e:
                logger.error(f"load任务 {task_id} failed: {e}")
                failed_count += 1
                continue
        
        logger.info(f"✅ 任务loadcomplete: success {loaded_count} 个，failed {failed_count} 个")
        logger.info(f"📊 当前status: 活跃任务 {len(active_tasks)} 个，已complete任务 {len(completed_tasks_history)} 个")
        
    except Exception as e:
        logger.error(f"❌ 工作空间任务load过程出错: {e}")
