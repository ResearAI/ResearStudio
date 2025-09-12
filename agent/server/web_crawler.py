"""
crawl_server.py – FastMCP server exposing a crawl‑and‑clean tool
----------------------------------------------------------------
* crawl_page(url, task_cache_dir?) – Fetch a web page with **crawl4ai.AsyncWebCrawler**
                    and return the readable Markdown.

Dependencies
    pip install crawl4ai mcp fastmcp
"""

# --------------------------------------------------------------------------- #
#  Imports
# --------------------------------------------------------------------------- #

import logging
import os
import uuid
import datetime
from pathlib import Path
from urllib.parse import urlparse
from typing import Optional

from mcp.server.fastmcp import FastMCP
from crawl4ai import AsyncWebCrawler

# --------------------------------------------------------------------------- #
#  Text truncation utility
# --------------------------------------------------------------------------- #

def _truncate_web_content(text: str, max_tokens: int = 5000) -> str:
    """
    Truncate web content to approximately max_tokens, showing start and end.
    
    Args:
        text: Text to truncate
        max_tokens: Maximum tokens to show (approximately)
        
    Returns:
        Truncated text
    """
    # Rough approximation: 1 token ≈ 4 characters
    max_chars = max_tokens * 4
    
    if len(text) <= max_chars:
        return text
    
    # Show first and last portions
    chunk_size = max_chars // 2
    start_chunk = text[:chunk_size]
    end_chunk = text[-chunk_size:]
    
    truncated_chars = len(text) - (2 * chunk_size)
    
    return f"{start_chunk}\n\n... [Content truncated {truncated_chars:,} characters] ...\n\n{end_chunk}"

# --------------------------------------------------------------------------- #
#  Logger setup
# --------------------------------------------------------------------------- #

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('web_crawler.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  FastMCP server instance
# --------------------------------------------------------------------------- #

mcp = FastMCP("crawl")

# --------------------------------------------------------------------------- #
#  Cache helper functions
# --------------------------------------------------------------------------- #

def _get_safe_filename(url: str) -> str:
    """Generate a safe filename from URL."""
    parsed = urlparse(url)
    domain = parsed.netloc.replace(".", "_")
    path = parsed.path.replace("/", "_").replace("\\", "_")
    
    if len(path) > 50:
        path = path[:50]
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    
    return f"crawl_{domain}{path}_{timestamp}_{unique_id}.md"


def _save_crawled_content(content: str, url: str, task_cache_dir: Optional[str] = None) -> str:
    """Save crawled content to cache directory as markdown."""
    if not task_cache_dir:
        # Fallback to default cache directory
        task_cache_dir = os.getenv("AGENT_CACHE_DIR", "./agent_cache")
    
    cache_dir = Path(task_cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    filename = _get_safe_filename(url)
    cache_file = cache_dir / filename
    
    # Create markdown content with metadata
    markdown_content = f"""# Crawled Content from {url}

**URL:** {url}
**Crawled at:** {datetime.datetime.now().isoformat()}
**Content length:** {len(content)} characters

---

{content}
"""
    
    cache_file.write_text(markdown_content, encoding="utf-8")
    return str(cache_file)


# --------------------------------------------------------------------------- #
#  Tool
# --------------------------------------------------------------------------- #


@mcp.tool()
async def crawl_page(url: str, task_cache_dir: str | None = None) -> str:
    """Deep crawl and extract key content from a web page (Markdown format).

    This tool is designed to perform *deep analysis* on a specific link
    retrieved from an earlier search step (e.g., via a web search tool).
    Given a fully qualified HTTP(S) URL, it fetches the web page,
    removes boilerplate content (menus, ads, nav bars, etc.), and
    extracts the core readable content, returning it as a clean,
    structured Markdown string.

    This Markdown output is well-suited for downstream processing by
    large language models (LLMs) for tasks such as:
    - Answering user questions from a specific page
    - Summarizing long articles or reports
    - Extracting facts, definitions, lists, or instructions
    - Contextual search over high‑signal content

    This is often used as a **follow-up** step after a general-purpose
    search tool (e.g., via SearxNG), when the agent needs to "click through"
    to an individual link and analyze its full content in a readable form.

    Args:
        url (str): A valid, fully-qualified URL (http:// or https://) that
            points to a real and accessible web page (e.g. news article,
            blog post, research page).
        task_cache_dir (str, optional): Directory to save crawled content cache.

    Returns:
        str: Markdown-formatted main content of the page. If the crawl fails
            (due to network errors, access restrictions, or page layout
            issues), a plain-text error message is returned instead.
    """
    logger.info(f"Starting crawl for URL: {url}")
    
    try:
        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url)
            content = result.markdown
            
            logger.info(f"Successfully crawled {len(content)} characters from {url}")
            
            # Apply text truncation (5000 tokens max for web content)
            display_content = _truncate_web_content(content, max_tokens=5000)
            
            # Save full content to cache (not truncated)
            try:
                cache_file = _save_crawled_content(content, url, task_cache_dir)
                logger.info(f"Crawled content saved to: {cache_file}")
            except Exception as e:
                logger.error(f"Failed to save crawled content to cache: {e}")
            
            # Return truncated content for display
            if display_content != content:
                truncated_chars = len(content) - len(display_content.replace('\n\n... [网页content截断了 ', '').split(' 个字符] ...\n\n')[0])
                logger.info(f"Content truncated for display: {len(content)} -> {len(display_content)} characters")
            
            return display_content
            
    except Exception as exc:
        error_msg = f"⚠️ Crawl error: {exc!s}"
        logger.error(f"Crawl failed for {url}: {exc}")
        
        # Save error to cache as well
        try:
            cache_file = _save_crawled_content(error_msg, url, task_cache_dir)
            logger.info(f"Crawl error saved to: {cache_file}")
        except Exception as e:
            logger.error(f"Failed to save crawl error to cache: {e}")
        
        return error_msg


# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    # Use stdio when embedding inside an agent, or HTTP during development.
    mcp.run(transport="stdio")
    # mcp.run(host="0.0.0.0", port=5003)   # uncomment for a tiny HTTP server
