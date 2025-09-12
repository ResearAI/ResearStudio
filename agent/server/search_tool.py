"""
search_server.py – FastMCP server exposing a SearxNG search tool
----------------------------------------------------------------
* search(query, num_results?, category?, language?, time_range?,
          safe_search?, host?, task_cache_dir?)
      – Privacy‑respecting web search powered by any SearxNG instance.

Dependencies
    pip install httpx mcp fastmcp
"""

# --------------------------------------------------------------------------- #
#  Imports
# --------------------------------------------------------------------------- #

import json
import logging
import os
import uuid
import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP

# --------------------------------------------------------------------------- #
#  Logger setup
# --------------------------------------------------------------------------- #

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('search_tool.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
#  FastMCP server instance
# --------------------------------------------------------------------------- #

mcp = FastMCP("search")

# --------------------------------------------------------------------------- #
#  Constants & simple validators
# --------------------------------------------------------------------------- #

api_key = os.getenv("GOOGLESERPER_API_KEY")
GOOGLE_SERPER_URL = "https://google.serper.dev/search"


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


def _safe_str(obj: Any) -> str:
    """Safely convert any object to string, handling TextContent and other complex objects."""
    if obj is None:
        return ""
    elif hasattr(obj, 'content') and hasattr(obj, 'type'):
        # Handle TextContent or similar objects
        try:
            return str(obj.content)
        except Exception:
            return str(obj)
    elif isinstance(obj, str):
        return obj
    else:
        try:
            return str(obj)
        except Exception:
            return repr(obj)


def _save_search_results(results: List[Dict[str, str]], query: str, task_cache_dir: Optional[str] = None) -> str:
    """Save search results to cache directory as JSON."""
    if not task_cache_dir:
        # Fallback to default cache directory
        task_cache_dir = os.getenv("AGENT_CACHE_DIR", "./agent_cache")
    
    cache_dir = Path(task_cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    # Create unique filename for this search
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    search_id = str(uuid.uuid4())[:8]
    filename = f"search_{timestamp}_{search_id}.json"
    
    # Ensure all data is JSON serializable
    serializable_results = _serialize_for_json(results)
    
    search_data = {
        "query": str(query),
        "timestamp": datetime.datetime.now().isoformat(),
        "num_results": len(results),
        "results": serializable_results
    }
    
    cache_file = cache_dir / filename
    cache_file.write_text(json.dumps(search_data, indent=2, ensure_ascii=False), encoding="utf-8")
    
    return str(cache_file)


# --------------------------------------------------------------------------- #
#  Tool
# --------------------------------------------------------------------------- #


@mcp.tool()
async def search(
    query: str,
    num_results: int = 10,
    category: str | None = None,
    language: str = "en",
    time_range: str | None = None,
    safe_search: int = 1,
    host: str | None = None,
    task_cache_dir: str | None = None,
) -> List[Dict[str, str]]:
    """Run a web search via Google Serper API.

    Args:
        query: The search string.
        num_results: Max results to return (default 10 — max 20 is polite).
        category: (Ignored) Not supported by Google Serper API.
        language: Two‑letter language code (default "en"). Maps to 'hl' param.
        time_range: (Ignored) Optional freshness filter: "day" | "week" | "month" | "year".
        safe_search: (Ignored) 0 = off • 1 = moderate • 2 = strict (default 1).
        host: (Ignored) Full base‑URL of the SearxNG instance to query.
        task_cache_dir: Directory to save search results cache.

    Returns:
        A list of dicts with **title**, **link**, **snippet** keys.
    """
    logger.info(f"Starting search for query: {query}")

    if any([category, time_range, safe_search != 1, host]):
        logger.warning(
            "Parameters 'category', 'time_range', 'safe_search', and 'host' "
            "are not supported by the Google Serper API and will be ignored."
        )

    payload = {"q": query, "num": num_results, "hl": language}
    headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            r = await client.post(GOOGLE_SERPER_URL, headers=headers, json=payload)
            r.raise_for_status()
            response_data = r.json()

            results = response_data.get("organic", [])

            # Prepend knowledge graph result if it exists
            if knowledge_graph := response_data.get("knowledgeGraph"):
                kg_snippet = knowledge_graph.get("description", "")
                if attributes := knowledge_graph.get("attributes"):
                    attrs_str = "\n".join(
                        f"{key}: {value}" for key, value in attributes.items()
                    )
                    kg_snippet = f"{kg_snippet}\n{attrs_str}"

                kg_result = {
                    "title": knowledge_graph.get("title", ""),
                    "link": knowledge_graph.get("website")
                    or knowledge_graph.get("descriptionLink", ""),
                    "snippet": kg_snippet.strip(),
                }
                results.insert(0, kg_result)

            # Respect num_results after prepending knowledge graph
            results = results[:num_results]
            logger.info(f"Retrieved {len(results)} search results")
        except Exception as exc:  # network / JSON / key errors
            logger.error(f"Search failed: {exc}")
            results = [{"title": "Search error", "link": "", "snippet": str(exc)}]

    # Clean and format results, ensuring ALL values are plain strings
    formatted_results = []
    for i, it in enumerate(results):
        try:
            # Use _safe_str to handle any complex objects
            formatted_result = {
                "title": _safe_str(it.get("title", "")),
                "link": _safe_str(it.get("link", "")),
                "snippet": _safe_str(it.get("snippet", "")),
            }
            formatted_results.append(formatted_result)
            logger.debug(f"Processed result {i}: title={formatted_result['title'][:50]}...")
        except Exception as e:
            logger.error(f"Error processing result {i}: {e}")
            # Add a safe fallback result
            formatted_results.append({
                "title": "Error processing result",
                "link": "",
                "snippet": f"Error: {str(e)}"
            })
    
    # Double-check that everything is JSON serializable before returning
    try:
        # Test serialization
        json.dumps(formatted_results, ensure_ascii=False)
        logger.info("Search results are JSON serializable")
    except Exception as e:
        logger.error(f"Results are not JSON serializable: {e}")
        # Force serialize everything
        formatted_results = _serialize_for_json(formatted_results)
        logger.info("Applied emergency serialization to results")
    
    # Save results to cache
    try:
        cache_file = _save_search_results(formatted_results, query, task_cache_dir)
        logger.info(f"Search results saved to: {cache_file}")
    except Exception as e:
        logger.error(f"Failed to save search results to cache: {e}")
        # Try to log the problematic data for debugging
        try:
            logger.error(f"Problematic data type: {type(formatted_results)}")
            if formatted_results:
                logger.error(f"Sample result keys: {list(formatted_results[0].keys())}")
                logger.error(f"Sample result types: {[(k, type(v)) for k, v in formatted_results[0].items()]}")
        except Exception as debug_e:
            logger.error(f"Could not analyze problematic data: {debug_e}")
    
    logger.info(f"Returning {len(formatted_results)} formatted results")
    return formatted_results


# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    mcp.run(transport="stdio")  # or: mcp.run(host="0.0.0.0", port=5002)
