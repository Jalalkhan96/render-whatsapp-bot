"""Redgifs extractor.

Redgifs has a real public JSON API, no page scraping needed:
  1. GET https://api.redgifs.com/v2/auth/temporary -> {"token": "<jwt>"}
     (anonymous temp token, no account required; verified 2026-10-02)
  2. GET https://api.redgifs.com/v2/gifs/{id}
     with header Authorization: Bearer <token>
     -> gif.urls.hd / .sd (mp4), gif.urls.thumbnail, gif.title, gif.duration

URL shapes: https://www.redgifs.com/watch/{id}  (id like "abandonedglittery...").
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from .base import AdultBase, AdultExtractionError, direct_url_entry

_API = "https://api.redgifs.com/v2"


class RedgifsExtractor(AdultBase):
    platform = "redgifs"
    domains = ("redgifs.com",)

    def _gif_id(self, url: str) -> str:
        path = urlparse(url).path.rstrip("/")
        m = re.search(r"/(?:watch|ifr)/([A-Za-z0-9_-]{4,})", path)
        if m:
            return m.group(1)
        raise AdultExtractionError(f"redgifs: cannot parse gif id from {url}")

    def _token(self) -> str:
        data = self.fetch_json(f"{_API}/auth/temporary")
        token = data.get("token") if isinstance(data, dict) else None
        if not token:
            raise AdultExtractionError("redgifs: temporary auth token request failed")
        return token

    def extract(self, url: str) -> dict[str, Any]:
        gid = self._gif_id(url)
        token = self._token()
        # curl_cffi session-level headers are browser-like; add bearer per call.
        self.session.headers["Authorization"] = f"Bearer {token}"
        try:
            data = self.fetch_json(f"{_API}/gifs/{gid}")
        finally:
            self.session.headers.pop("Authorization", None)

        gif = (data or {}).get("gif") if isinstance(data, dict) else None
        if not isinstance(gif, dict):
            raise AdultExtractionError(f"redgifs: gif {gid} not found")
        urls = gif.get("urls") or {}
        direct_urls: list[dict] = []
        if urls.get("hd"):
            direct_urls.append(direct_url_entry("hd", urls["hd"]))
        if urls.get("sd"):
            direct_urls.append(direct_url_entry("sd", urls["sd"]))
        # Some gifs only expose vthumbnail (video thumbnail); keep hd/sd primary.
        title = gif.get("title") or None
        try:
            duration = float(gif["duration"]) if gif.get("duration") else None
        except (TypeError, ValueError):
            duration = None
        return self.result(title=title, direct_urls=direct_urls,
                           thumbnail=urls.get("thumbnail") or urls.get("vthumbnail"),
                           duration=duration, webpage_url=url)
