#!/usr/bin/env python
"""
FastMCP video‑helper server (async OpenAI edition).

File Reading Strategy:
All video files for processing should be placed in the unified workspace directory 
(task_cache_dir/workspace/) as managed by agent_core.py. This tool receives
the workspace directory path and filename as separate parameters, then combines
them for file operations to maintain consistency with the code execution environment.

Dependencies
------------
pip install \
  yt_dlp ffmpeg-python pillow \
  opencv-python numpy scenedetect \
  openai>=1.14.0  # must include AsyncOpenAI
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import shutil
import uuid
import datetime
import tempfile
from pathlib import Path
from typing import Any, List, Optional

import ffmpeg
import yt_dlp
from mcp.server.fastmcp import FastMCP
from PIL import Image
import cv2
import numpy as np
from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector
from openai import AsyncOpenAI              # ← new
from dotenv import load_dotenv


load_dotenv()  # picks up OPENAI_* variables from .env if present

# --------------------------------------------------------------------------- #
#  Logger setup
# --------------------------------------------------------------------------- #

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('video_tool.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  OpenAI client (async)                                                      #
# --------------------------------------------------------------------------- #

openai_client = AsyncOpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL"),  # works with Azure etc.
)

# --------------------------------------------------------------------------- #
#  FastMCP instance                                                            #
# --------------------------------------------------------------------------- #

mcp = FastMCP("video_tools")

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
#  Cache helper functions                                                      #
# --------------------------------------------------------------------------- #

def _serialize_content(obj: Any) -> str:
    """Convert any object to a safe string representation."""
    if hasattr(obj, 'content') and hasattr(obj, 'type'):
        # Handle TextContent or similar objects
        return str(obj.content) if hasattr(obj.content, '__str__') else str(obj)
    elif isinstance(obj, (str, int, float, bool)):
        return str(obj)
    elif obj is None:
        return ""
    else:
        return str(obj)


def _save_video_file_to_workspace(video_path: str, workspace_dir: str, target_filename: str = None) -> str:
    """
    Copy video file to workspace directory with unified naming.
    
    Args:
        video_path: Source video file path
        workspace_dir: Target workspace directory
        target_filename: Optional target filename, if None auto-generate based on timestamp
        
    Returns:
        str: Path to saved video file in workspace
    """
    if not target_filename:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        video_ext = Path(video_path).suffix or ".mp4"
        target_filename = f"video_{timestamp}_{unique_id}{video_ext}"
    
    target_path = _build_file_path(workspace_dir, target_filename)
    shutil.copy2(video_path, target_path)
    return target_path


def _save_screenshots_to_workspace(images: List[str], workspace_dir: str, base_name: str = "screenshot") -> List[str]:
    """
    Save video screenshots to workspace directory.
    
    Args:
        images: List of base64 encoded images
        workspace_dir: Target workspace directory
        base_name: Base name for screenshot files
        
    Returns:
        List[str]: List of saved screenshot filenames (not full paths)
    """
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    
    saved_filenames = []
    for i, img_b64 in enumerate(images):
        filename = f"{base_name}_{timestamp}_{unique_id}_{i:03d}.jpg"
        file_path = _build_file_path(workspace_dir, filename)
        
        # Decode base64 and save image
        try:
            img_data = base64.b64decode(img_b64)
            Path(file_path).write_bytes(img_data)
            saved_filenames.append(filename)
        except Exception as e:
            logger.error(f"Failed to save screenshot {i}: {e}")
    
    return saved_filenames


# --------------------------------------------------------------------------- #
#  Helper functions (unchanged except for async OpenAI calls)                 #
# --------------------------------------------------------------------------- #


def _capture_screenshot(video_file: str, timestamp: float, width: int = 320) -> Image.Image:
    out, _ = (
        ffmpeg.input(video_file, ss=timestamp)
        .filter("scale", width, -1)
        .output("pipe:", vframes=1, format="image2", vcodec="png")
        .run(capture_stdout=True, capture_stderr=True)
    )
    return Image.open(io.BytesIO(out))


def _extract_audio(video_file: str, output_format: str = "mp3") -> str:
    basename = os.path.splitext(video_file)[0]
    out_path = f"{basename}.{output_format}"
    (
        ffmpeg.input(video_file)
        .output(out_path, vn=None, acodec="libmp3lame")
        .run(quiet=True)
    )
    return out_path


async def _transcribe_audio_async(audio_path: str) -> str:
    """Whisper transcription via AsyncOpenAI; returns '' if disabled."""
    if not openai_client.api_key:
        return ""
    rsp = await openai_client.audio.transcriptions.create(
        model="whisper-1",
        file=open(audio_path, "rb"),
    )
    return rsp.text.strip()


def _normalize(img: Image.Image, target_width: int = 512) -> Image.Image:
    w, h = img.size
    return img.resize((target_width, int(target_width * h / w)), Image.Resampling.LANCZOS).convert("RGB")


def _extract_keyframes(
    video_path: str,
    frame_interval: float = 4.0,
    max_frames: int = 100,
    target_width: int = 512,
) -> List[Image.Image]:
    cap = cv2.VideoCapture(video_path)
    total, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
    duration = total / fps if fps else 0
    cap.release()

    desired = min(max(int(duration / frame_interval) or 1, 1), max_frames)

    video = open_video(video_path)
    sm = SceneManager()
    sm.add_detector(ContentDetector())
    sm.detect_scenes(video)
    scenes = sm.get_scene_list()

    frames: List[Image.Image] = []
    if scenes:
        for i in np.linspace(0, len(scenes) - 1, min(len(scenes), desired), dtype=int):
            frames.append(_capture_screenshot(video_path, scenes[i][0].get_seconds()))
    else:
        for sec in np.linspace(0, duration, desired):
            frames.append(_capture_screenshot(video_path, sec))

    return [_normalize(f, target_width) for f in frames]


def _images_to_base64(imgs: List[Image.Image]) -> List[str]:
    base64_list = []
    for img in imgs:
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        img_b64 = base64.b64encode(buffer.getvalue()).decode()
        base64_list.append(img_b64)
    return base64_list


def _truncate_transcription(text: str, max_tokens: int = 2000) -> str:
    """
    Truncate transcription text to fit within token limits.
    Shows beginning and end of transcript with truncation notice.
    """
    if not text:
        return ""
    
    # Rough estimate: 1 token ≈ 4 characters
    max_chars = max_tokens * 4
    
    if len(text) <= max_chars:
        return text
    
    # Take first and last portions
    chunk_size = max_chars // 2
    start_chunk = text[:chunk_size]
    end_chunk = text[-chunk_size:]
    
    truncated_chars = len(text) - (2 * chunk_size)
    
    return f"{start_chunk}\n\n... [转录content截断了 {truncated_chars:,} 个字符] ...\n\n{end_chunk}"


# --------------------------------------------------------------------------- #
#  Tools                                                                      #
# --------------------------------------------------------------------------- #

@mcp.tool()
async def download_video(
    url: str, 
    download_directory: str | None = None,
    task_cache_dir: str | None = None
) -> str:
    """
    Download video from URL and save to unified workspace directory.
    
    **File Storage**:
    - Downloads video to specified directory (or temp if not provided)
    - Copies video to workspace directory for consistency with other tools
    - Returns the original download path for immediate use
    
    Args:
        url (str): Video URL to download (YouTube, etc.)
        download_directory (str, optional): Temporary download directory
        task_cache_dir (str, optional): Task-specific cache directory path
        
    Returns:
        str: Path to downloaded video file
    """
    logger.info(f"Downloading video from: {url}")
    
    download_directory = download_directory or tempfile.mkdtemp()
    Path(download_directory).mkdir(parents=True, exist_ok=True)
    template = str(Path(download_directory) / "%(title)s.%(ext)s")
    opts = {"format": "bestvideo+bestaudio/best", "outtmpl": template}
    
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        video_path = ydl.prepare_filename(info)
        
        # Save video to workspace
        try:
            workspace_dir = _get_workspace_dir(task_cache_dir)
            workspace_video_path = _save_video_file_to_workspace(video_path, workspace_dir)
            logger.info(f"Video saved to workspace: {workspace_video_path}")
        except Exception as e:
            logger.error(f"Failed to save video to workspace: {e}")
        
        return video_path


@mcp.tool()
async def get_video_bytes(
    filename: str,
    task_cache_dir: str | None = None
) -> bytes:
    """
    Read video file bytes from the unified workspace directory.
    
    **File Location Requirements**:
    - Video files must be placed in the workspace directory (task_cache_dir/workspace/)
    - This ensures consistency with code execution and other tools
    
    Args:
        filename (str): Name of the video file to read (within workspace directory)
        task_cache_dir (str, optional): Task-specific cache directory path
        
    Returns:
        bytes: Video file content as bytes
    """
    workspace_dir = _get_workspace_dir(task_cache_dir)
    video_path = _build_file_path(workspace_dir, filename)
    
    logger.info(f"Reading video bytes from workspace: {video_path}")
    
    # Verify file exists in workspace
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file '{filename}' not found in workspace directory: {workspace_dir}")
    
    with open(video_path, "rb") as fh:
        video_bytes = fh.read()
    
    return video_bytes


@mcp.tool()
async def get_video_screenshots(
    filename: str,
    amount: int = 3,
    task_cache_dir: str | None = None
) -> List[str]:
    """
    Extract screenshots from video file in the unified workspace directory.
    
    **File Location Requirements**:
    - Video files must be placed in the workspace directory (task_cache_dir/workspace/)
    - Screenshots will be saved back to the same workspace directory
    - This ensures consistency with code execution and other tools
    
    Args:
        filename (str): Name of the video file to process (within workspace directory)
        amount (int): Number of screenshots to extract (default: 3)
        task_cache_dir (str, optional): Task-specific cache directory path
        
    Returns:
        List[str]: List of base64-encoded screenshot images
    """
    workspace_dir = _get_workspace_dir(task_cache_dir)
    video_path = _build_file_path(workspace_dir, filename)
    
    logger.info(f"Extracting {amount} screenshots from workspace video: {video_path}")
    
    # Verify file exists in workspace
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file '{filename}' not found in workspace directory: {workspace_dir}")
    
    probe = ffmpeg.probe(video_path)
    dur = float(probe["format"]["duration"])
    step = dur / (amount + 1)
    imgs = [_capture_screenshot(video_path, (i + 1) * step) for i in range(amount)]
    images_b64 = _images_to_base64(imgs)
    
    # Save screenshots to workspace
    try:
        screenshot_filenames = _save_screenshots_to_workspace(images_b64, workspace_dir, "screenshot")
        logger.info(f"Screenshots saved to workspace: {screenshot_filenames}")
    except Exception as e:
        logger.error(f"Failed to save screenshots to workspace: {e}")
    
    return images_b64


VIDEO_QA_PROMPT = """
Use the key‑frames and (optional) transcription to answer.

Transcription (may be empty):
{transcription}

Question:
{question}
""".strip()


@mcp.tool()
async def ask_question_about_video(
    filename: str,
    question: str,
    use_audio_transcription: bool = False,
    task_cache_dir: str | None = None,
) -> str:
    """
    Answer question about video file from the unified workspace directory using GPT‑4o.
    
    **File Location Requirements**:
    - Video files must be placed in the workspace directory (task_cache_dir/workspace/)
    - Generated keyframes and transcriptions will be saved to the same workspace directory
    - This ensures consistency with code execution and other tools
    
    Args:
        filename (str): Name of the video file to analyze (within workspace directory)
        question (str): Question to ask about the video
        use_audio_transcription (bool): Whether to include audio transcription (default: False)
        task_cache_dir (str, optional): Task-specific cache directory path
        
    Returns:
        str: Answer to the question about the video
        
    Example Usage:
        await ask_question_about_video("presentation.mp4", "What is the main topic discussed?")
        await ask_question_about_video("meeting.mov", "Who are the speakers?", True)
    """
    workspace_dir = _get_workspace_dir(task_cache_dir)
    video_path = _build_file_path(workspace_dir, filename)
    
    logger.info(f"Analyzing video from workspace: {video_path} with question: {question}")
    
    # Verify file exists in workspace
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file '{filename}' not found in workspace directory: {workspace_dir}")
    
    if not openai_client.api_key:
        return "OPENAI_API_KEY not set."

    frames = _extract_keyframes(video_path)
    images_b64 = _images_to_base64(frames)
    
    # Save keyframes to workspace
    try:
        keyframe_filenames = _save_screenshots_to_workspace(images_b64, workspace_dir, "keyframe")
        logger.info(f"Keyframes saved to workspace: {keyframe_filenames}")
    except Exception as e:
        logger.error(f"Failed to save keyframes to workspace: {e}")
    
    transcription = ""
    if use_audio_transcription:
        logger.info("Extracting and transcribing audio...")
        audio_path = _extract_audio(video_path)
        full_transcription = await _transcribe_audio_async(audio_path)
        
        # Apply truncation for display and LLM processing
        transcription = _truncate_transcription(full_transcription, max_tokens=2000)
        
        # Save audio and transcription to workspace
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = str(uuid.uuid4())[:8]
            
            # Save audio file to workspace
            audio_filename = f"audio_{timestamp}_{unique_id}.mp3"
            workspace_audio_path = _build_file_path(workspace_dir, audio_filename)
            shutil.copy2(audio_path, workspace_audio_path)
            
            # Save FULL transcription to workspace (not truncated)
            transcription_filename = f"transcription_{timestamp}_{unique_id}.txt"
            transcription_path = _build_file_path(workspace_dir, transcription_filename)
            Path(transcription_path).write_text(_serialize_content(full_transcription), encoding="utf-8")
            
            logger.info(f"Audio saved to workspace: {audio_filename}")
            logger.info(f"Transcription saved to workspace: {transcription_filename}")
        except Exception as e:
            logger.error(f"Failed to save audio/transcription to workspace: {e}")

    user_message = [
        {
            "type": "text",
            "text": VIDEO_QA_PROMPT.format(transcription=transcription, question=question),
        },
        *(
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b}"}}
            for b in images_b64
        ),
    ]

    resp = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": user_message}],
        max_tokens=1000,
    )
    
    answer = resp.choices[0].message.content
    
    # Save Q&A to workspace
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        
        qa_filename = f"video_qa_{timestamp}_{unique_id}.txt"
        qa_path = _build_file_path(workspace_dir, qa_filename)
        
        qa_content = f"""Video Q&A Session
==================

Video: {_serialize_content(filename)}
Question: {_serialize_content(question)}
Timestamp: {datetime.datetime.now().isoformat()}

Transcription:
{_serialize_content(transcription)}

Answer:
{_serialize_content(answer)}
"""
        Path(qa_path).write_text(qa_content, encoding="utf-8")
        logger.info(f"Q&A session saved to workspace: {qa_filename}")
    except Exception as e:
        logger.error(f"Failed to save Q&A to workspace: {e}")
    
    return _serialize_content(answer)


# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    mcp.run(transport="stdio")
