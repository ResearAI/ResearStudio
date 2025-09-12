"""
weather_server.py – FastMCP server with two tools
-------------------------------------------------
* get_alerts(state)      – U.S. National Weather Service alerts (unchanged).
* get_forecast(location) – Global current‑weather lookup via Open‑Meteo.

Dependencies
    pip install httpx mcp fastmcp
"""

from typing import Any
import datetime as dt

import httpx
from mcp.server.fastmcp import FastMCP

# --------------------------------------------------------------------------- #
#  FastMCP server instance
# --------------------------------------------------------------------------- #

mcp = FastMCP("weather")

# --------------------------------------------------------------------------- #
#  Constants
# --------------------------------------------------------------------------- #

# ---  U.S. NWS alerts backend (unchanged)  ----------------------------------
NWS_API_BASE = "https://api.weather.gov"
USER_AGENT = "weather‑bot/1.0"

# ---  Open‑Meteo (global) forecast backend  ---------------------------------
OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast"

# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #

async def make_nws_request(url: str) -> dict[str, Any] | None:
    """GET helper with basic error handling for weather.gov."""
    hdrs = {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(url, headers=hdrs)
            r.raise_for_status()
            return r.json()
        except Exception:
            return None


def format_alert(feature: dict[str, Any]) -> str:
    """Pretty‑print one NWS alert feature."""
    p = feature["properties"]
    return (
        f"Event: {p.get('event', 'Unknown')}\n"
        f"Area: {p.get('areaDesc', 'Unknown')}\n"
        f"Severity: {p.get('severity', 'Unknown')}\n"
        f"Description: {p.get('description', '—')}\n"
        f"Instructions: {p.get('instruction', '—')}"
    )

# --------------------------------------------------------------------------- #
#  Tools
# --------------------------------------------------------------------------- #




@mcp.tool()
async def get_alerts(state: str) -> str:
    """Get *active* weather alerts for a U.S. state (two‑letter code)."""
    url = f"{NWS_API_BASE}/alerts/active/area/{state.upper()}"
    data = await make_nws_request(url)

    if not data or "features" not in data:
        return "Unable to fetch alerts or no alerts found."

    if not data["features"]:
        return "No active alerts for this state."

    return "\n\n---\n\n".join(format_alert(f) for f in data["features"])


@mcp.tool()
async def get_forecast(location: str) -> str:
    """Current weather for *any* city or placename worldwide.

    Args:
        location: e.g. "London", "Tokyo, JP", "1600 Amphitheatre Pkwy".
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        # 1 – Geocode the place name
        g = await client.get(
            OPEN_METEO_GEOCODE,
            params={"name": location, "count": 1, "language": "en", "format": "json"},
        )
        if not g.is_success or not g.json().get("results"):
            return f"Sorry, I couldn’t find a place called {location!r}."

        res = g.json()["results"][0]
        lat, lon = res["latitude"], res["longitude"]
        nice_name = f"{res['name']}, {res.get('country_code', '')}".strip(", ")

        # 2 – Fetch current weather
        w = await client.get(
            OPEN_METEO_FORECAST,
            params={
                "latitude": lat,
                "longitude": lon,
                "current_weather": True,
                "timezone": "auto",
            },
        )
        if not w.is_success:
            return f"Weather service error ({w.status_code})."

        cur = w.json()["current_weather"]
        ts_local = dt.datetime.fromisoformat(cur["time"]).strftime("%Y‑%m‑%d %H:%M")

        # Optional: simple mapping for common WMO weather codes
        wmo_desc = {
            0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
            45: "fog", 48: "depositing rime fog",
            51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
            61: "light rain", 63: "moderate rain", 65: "heavy rain",
            71: "light snow", 73: "moderate snow", 75: "heavy snow",
            80: "rain showers", 95: "thunderstorm",
        }.get(cur["weathercode"], f"code {cur['weathercode']}")

        return (
            f"Weather in {nice_name} at {ts_local}:\n"
            f"• {cur['temperature']} °C\n"
            f"• Wind {cur['windspeed']} km/h\n"
            f"• {wmo_desc}"
        )

# --------------------------------------------------------------------------- #
#  Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    mcp.run(transport="stdio")
