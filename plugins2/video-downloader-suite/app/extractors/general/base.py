"""Shared base for the general (non-adult) site extractors.

Same pattern as app/extractors/adult/base.py: every extractor fetches
page/API HTML over curl_cffi with Chrome impersonation (so the TLS/JA3
fingerprint looks like a real browser), retries once on transient failures,
and parses the known-good locations for direct media URLs.

Result contract from ``extract()``:
    {
        "platform": "tiktok",                  # registry key
        "title": "Video title",
        "direct_urls": [{"quality": "720p", "url": "https://...", "ext": "mp4"}],
        "thumbnail": "https://..." | None,
        "duration": 123.0 | None,              # seconds
        "webpage_url": "https://..."           # the URL that was scraped
    }
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from curl_cffi import requests as creq

log = logging.getLogger("uvd.extractors.general")

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

IMPERSONATE = "chrome120"  # curl_cffi client profile; "chrome" also fine


class GeneralExtractionError(Exception):
    """Raised when a page/API cannot be fetched or no media URL is found."""


def js_unescape(value: str) -> str:
    """Unescape JS-string-escaped URLs (\\/ -> / etc.); handles double-escaping."""
    prev = None
    while prev != value:
        prev = value
        value = value.replace("\\/", "/").replace("\\u0026", "&")
    if "\\u" in value:
        return value.encode().decode("unicode_escape", errors="ignore")
    return value


def extract_json_ld(html: str, want_type: str | None = None) -> list[dict]:
    """Pull all <script type="application/ld+json"> blocks as dicts."""
    blocks: list[dict] = []
    for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(m.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict) and (want_type is None or item.get("@type") == want_type):
                blocks.append(item)
    return blocks


def og_meta(html: str, prop: str) -> str | None:
    """Read <meta property="og:xxx" content="..."> (also name= variant)."""
    for attr in ("property", "name"):
        m = re.search(
            rf'<meta[^>]+{attr}="{re.escape(prop)}"[^>]+content="([^"]+)"',
            html, re.I,
        )
        if m:
            return m.group(1)
    return None


def direct_url_entry(quality: str | int, url: str, ext: str | None = None) -> dict[str, Any]:
    url = url.strip()
    ext = ext or ("m3u8" if url.endswith(".m3u8") else url.rsplit(".", 1)[-1].split("?")[0][:8] or "mp4")
    if ext not in ("mp4", "webm", "m3u8", "mpd", "html"):
        ext = "mp4"
    return {"quality": f"{quality}p" if isinstance(quality, int) else str(quality),
            "url": url, "ext": ext}


def unescape_json_string(value: str) -> str:
    """Decode a JSON-escaped string fragment (\\\" -> \", \\uXXXX -> char)."""
    try:
        return json.loads(f'"{value}"')
    except (json.JSONDecodeError, ValueError):
        return js_unescape(value)


class GeneralBase:
    """One instance per extraction call. Override ``platform``, ``domains`` and ``extract(url)``."""

    platform = "unknown"
    domains: tuple[str, ...] = ()

    def __init__(self) -> None:
        self.session = creq.Session(impersonate=IMPERSONATE)
        self.session.headers.update({
            "User-Agent": CHROME_UA,
            "Accept-Language": "en-US,en;q=0.9",
        })

    # -- HTTP -------------------------------------------------------------
    def fetch(self, url: str, *, referer: str | None = None, tries: int = 2,
              timeout: int = 30, accept: str = "text/html,application/xhtml+xml") -> str:
        """GET with one retry on transient errors. Raises GeneralExtractionError."""
        last: Exception | None = None
        for attempt in range(tries):
            try:
                headers = {"Accept": accept}
                if referer:
                    headers["Referer"] = referer
                resp = self.session.get(url, headers=headers, timeout=timeout)
                if resp.status_code == 404:
                    raise GeneralExtractionError(f"{self.platform}: page not found (404): {url}")
                if resp.status_code == 429:
                    raise GeneralExtractionError(f"{self.platform}: rate-limited (429) by the site; retry later")
                if resp.status_code >= 400:
                    raise GeneralExtractionError(
                        f"{self.platform}: HTTP {resp.status_code} fetching {url}")
                return resp.text
            except GeneralExtractionError:
                raise
            except Exception as exc:  # noqa: BLE001 - network flakiness
                last = exc
                log.debug("%s fetch attempt %d failed: %s", self.platform, attempt + 1, exc)
                time.sleep(2)
        raise GeneralExtractionError(f"{self.platform}: failed to fetch {url}: {last}")

    def fetch_json(self, url: str, **kwargs: Any) -> Any:
        text = self.fetch(url, accept="application/json", **kwargs)
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise GeneralExtractionError(f"{self.platform}: bad JSON from {url}: {exc}") from exc

    # -- shared parse helpers ---------------------------------------------
    def title_from(self, html: str) -> str | None:
        title = og_meta(html, "og:title")
        if title:
            return re.sub(r"\s+", " ", title).strip()
        m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
        return re.sub(r"\s+", " ", m.group(1)).strip() if m else None

    def result(self, *, title: str | None, direct_urls: list[dict],
               thumbnail: str | None = None, duration: float | None = None,
               webpage_url: str = "") -> dict[str, Any]:
        if not direct_urls:
            raise GeneralExtractionError(f"{self.platform}: no direct media URLs found on {webpage_url}")
        return {
            "platform": self.platform,
            "title": title,
            "direct_urls": direct_urls,
            "thumbnail": thumbnail,
            "duration": duration,
            "webpage_url": webpage_url,
        }
