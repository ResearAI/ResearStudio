"""
mcp_image_analysis.py
FastMCP server – vision tools (image → caption / VQA)

File Reading Strategy:
All image files for processing should be placed in the unified workspace directory 
(task_cache_dir/workspace/) as managed by agent_core.py. This tool receives
the workspace directory path and filename as separate parameters, then combines
them for file operations to maintain consistency with the code execution environment.
"""

# --------------------------------------------------------------------------- #
#  Imports
# --------------------------------------------------------------------------- #
import base64
import io
import os
from typing import Optional
from pathlib import Path

import anyio
import openai
import requests
from PIL import Image
from urllib.parse import urlparse
from openai import AsyncOpenAI              # ← new

from mcp.server.fastmcp import FastMCP
from loguru import logger


from dotenv import load_dotenv
load_dotenv(".env")


# --------------------------------------------------------------------------- #
#  Unified path management functions
# --------------------------------------------------------------------------- #
def _get_workspace_dir(task_cache_dir: Optional[str] = None) -> str:
    """
    Get or create the unified workspace directory for a task.
    This follows the same pattern as code_tool.py to ensure consistency.
    
    📁 DIRECTORY STRUCTURE:
        task_cache_dir/workspace/  (flat structure - all files here)
    
    Args:
        task_cache_dir: Task-specific cache directory path
        
    Returns:
        str: Absolute path to workspace directory
    """
    if not task_cache_dir:
        task_cache_dir = os.getenv("AGENT_CACHE_DIR", "./agent_cache")
    
    workspace_dir = Path(task_cache_dir) / "workspace"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    return str(workspace_dir)


def _build_file_path(workspace_dir: str, filename: str) -> str:
    """
    Build full file path from workspace directory and filename.
    Ensures all files are accessed from the unified workspace location.
    
    Args:
        workspace_dir: Base workspace directory path
        filename: Target filename (should not contain path separators)
        
    Returns:
        str: Complete file path for document processing
    """
    # Normalize filename to prevent directory traversal
    clean_filename = os.path.basename(filename)
    return str(Path(workspace_dir) / clean_filename)


# --------------------------------------------------------------------------- #
#  Helper class
# --------------------------------------------------------------------------- #
class ImageAnalysisToolkit:
    """
    Very small wrapper around OpenAI Vision GPT models.
    Provides two public coroutines:
        • image_to_text
        • ask_question_about_image
        
    **WORKSPACE INTEGRATION**: 
    All image files for processing must be located in the unified workspace directory
    (task_cache_dir/workspace/) as established by the code execution environment.
    This ensures consistent file access across all tools in the agent system.
    """

    def __init__(self, timeout: float | None = None):
        self.timeout = timeout or 15

    # ---------------- public API ------------------------------------------ #
    async def image_to_text(
        self, workspace_dir: str, filename: str, sys_prompt: Optional[str] = None
    ) -> str:
        """
        Return a detailed caption of image located in the unified workspace.
        
        Args:
            workspace_dir: Path to the unified workspace directory
            filename: Name of the image file to process (within workspace)
            sys_prompt: Optional system prompt for the vision model
            
        Returns:
            str: Detailed image caption
        """
        default_sys = (
            "You are an expert image analyst. Provide a rich, concise "
            "description of everything visible, including any text."
        )
        return await self._chat_with_image(
            workspace_dir,
            filename,
            user_prompt="Please describe the contents of this image.",
            system_prompt=sys_prompt or default_sys,
        )

    async def ask_question_about_image(
        self,
        workspace_dir: str,
        filename: str,
        question: str,
        sys_prompt: Optional[str] = None,
    ) -> str:
        """
        Answer question about image located in the unified workspace.
        
        Args:
            workspace_dir: Path to the unified workspace directory
            filename: Name of the image file to process (within workspace)
            question: Question to ask about the image
            sys_prompt: Optional system prompt for the vision model
            
        Returns:
            str: Answer to the question about the image
        """
        default_sys = (
            "You answer questions about images by careful visual inspection, "
            "reading any text, and reasoning from what you see. Please consider the requirements of the question carefully"
        )
        return await self._chat_with_image(
            workspace_dir,
            filename,
            user_prompt=question,
            system_prompt=sys_prompt or default_sys,
        )

    # ---------------- implementation -------------------------------------- #
    async def _chat_with_image(
        self, workspace_dir: str, filename: str, user_prompt: str, system_prompt: str
    ) -> str:
        """
        Core routine: prepare image from workspace, run OpenAI vision chat, return content.
        
        Args:
            workspace_dir: Path to the unified workspace directory
            filename: Name of the image file to process (within workspace)
            user_prompt: User prompt for the vision model
            system_prompt: System prompt for the vision model
            
        Returns:
            str: Response from the vision model
        """
        # Build full image path using unified workspace structure
        image_path = _build_file_path(workspace_dir, filename)
        
        # Verify file exists in workspace
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file '{filename}' not found in workspace directory: {workspace_dir}")
        
        logger.debug(f"Processing image: workspace={workspace_dir}, filename={filename}, full_path={image_path}")
        
        iage_url = await self._prepare_image(image_path)

        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ]
        openai_client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),  # works with Azure etc.
        )

        try:
            logger.info("Sending image to OpenAI ChatCompletion (vision)…")
            response = await openai_client.chat.completions.create(
                model="gemini-2.5-flash-preview-05-20",
                messages=messages,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI call failed: {e}")
            raise

    async def _prepare_image(self, path: str) -> str:
        """
        Turn local file path into a data‑URL acceptable to the OpenAI Vision endpoint.
        
        Args:
            path: Full local path to the image file
            
        Returns:
            str: Data URL for the image
        """
        parsed = urlparse(path)

        # Remote URL – just return it (OpenAI fetches it directly)
        if parsed.scheme in ("http", "https"):
            logger.debug(f"Using remote image URL: {path}")
            return path

        # Local file – read & encode
        logger.debug(f"Encoding local image: {path}")
        data = await anyio.to_thread.run_sync(lambda: open(path, "rb").read())
        mime = Image.open(io.BytesIO(data)).get_format_mimetype()
        b64 = base64.b64encode(data).decode()
        return f"data:{mime};base64,{b64}"


# --------------------------------------------------------------------------- #
#  FastMCP server
# --------------------------------------------------------------------------- #
mcp = FastMCP("image_analysis")
toolkit = ImageAnalysisToolkit()


@mcp.tool()
async def image_to_text(
    filename: str, 
    task_cache_dir: str | None = None,
    sys_prompt: Optional[str] = None
) -> str:
    """
    Return a detailed caption of an image from the unified workspace directory.
    
    **File Location Requirements**:
    - Image files must be placed in the workspace directory (task_cache_dir/workspace/)
    - This ensures consistency with code execution and other tools
    - The agent_core.py manages the task_cache_dir and passes it to tools
    
    Args:
        filename (str): Name of the image file to process (.jpg, .jpeg, .png)
        task_cache_dir (str, optional): Task-specific cache directory path.
                                       If not provided, uses AGENT_CACHE_DIR environment variable.
        sys_prompt (str, optional): Custom system prompt for the vision model
    
    Returns:
        str: Detailed caption of the image
        
    Example Usage:
        await image_to_text("photo.jpg", "/path/to/task_cache")
        await image_to_text("diagram.png")
    """
    # Get unified workspace directory
    workspace_dir = _get_workspace_dir(task_cache_dir)
    
    try:
        return await toolkit.image_to_text(workspace_dir, filename, sys_prompt)
    except Exception as e:
        logger.error(f"Image processing failed for {filename}: {e}")
        raise ValueError(f"Image processing error: {str(e)}")


@mcp.tool()
async def ask_question_about_image(
    filename: str,
    question: str,
    task_cache_dir: str | None = None,
    sys_prompt: Optional[str] = None
) -> str:
    """
    Answer a question about an image from the unified workspace directory.
    
    **File Location Requirements**:
    - Image files must be placed in the workspace directory (task_cache_dir/workspace/)
    - This ensures consistency with code execution and other tools
    - The agent_core.py manages the task_cache_dir and passes it to tools
    
    Args:
        filename (str): Name of the image file to process (.jpg, .jpeg, .png)
        question (str): Question to ask about the image
        task_cache_dir (str, optional): Task-specific cache directory path.
                                       If not provided, uses AGENT_CACHE_DIR environment variable.
        sys_prompt (str, optional): Custom system prompt for the vision model
    
    Returns:
        str: Answer to the question about the image
        
    Example Usage:
        await ask_question_about_image("chart.png", "What data is shown in this chart?", "/path/to/task_cache")
        await ask_question_about_image("document.jpg", "What text is visible in this image?")
    """
    # Get unified workspace directory
    workspace_dir = _get_workspace_dir(task_cache_dir)
    
    try:
        return await toolkit.ask_question_about_image(workspace_dir, filename, question, sys_prompt)
    except Exception as e:
        logger.error(f"Image question processing failed for {filename}: {e}")
        raise ValueError(f"Image question processing error: {str(e)}")


# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    # Make sure OPENAI_API_KEY is set in your environment before running.
    mcp.run(transport="stdio")