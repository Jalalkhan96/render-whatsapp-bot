"""Instagram extractor — public reels/posts via anonymous page fetch.

The logged-out reel/post page embeds one or more
``<script type="application/json">`` blobs containing ``video_versions``
([{type, url}] direct mp4 URLs), plus ``og:image`` (thumbnail) and
``og:description`` (caption) meta tags. No login or API key is used.

URL shapes: https://www.instagram.com/reel/<shortcode>/
            https://www.instagram.com/reels/<shortcode>/
            https://www.instagram.com/p/<shortcode>/   (video posts)
            https://www.instagram.com/tv/<shortcode>/

Network note (verified 2026-10-04): public reels/posts DO render server-side
for anonymous chrome-impersonated requests from this network — video_versions
mp4 URLs are present without login. Instagram login-walls aggressively by
IP/account status, so when the page comes back without video data the error
message points at the existing yt-dlp+cookies stage (app/core/fallback.py),
which is the supported path for gated content. Signed cdninstagram URLs
expire; use them promptly.
"""
from __future__ import annotations

import html as _html
import json
import re
from typing import Any
from urllib.parse import urlparse

from .base import (GeneralBase, GeneralExtractionError, direct_url_entry,
                   js_unescape, og_meta)


def _walk(obj: Any, key: str, out: list) -> None:
    """Collect every value stored under `key` in a nested JSON structure."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                out.append(v)
            _walk(v, key, out)
    elif isinstance(obj, list):
        for v in obj:
            _walk(v, key, out)


class InstagramExtractor(GeneralBase):
    platform = "instagram"
    domains = ("instagram.com",)

    _PATH_RE = re.compile(r"^/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)/?")

    def _shortcode(self, url: str) -> str:
        m = self._PATH_RE.match(urlparse(url).path or "")
        if not m:
            raise GeneralExtractionError(
                f"instagram: unsupported URL shape (want /reel/, /p/, /tv/): {url}")
        return m.group(1)

    def _video_versions(self, html: str) -> list[dict[str, Any]]:
        """All video_versions dicts from the embedded application/json blobs."""
        found: list = []
        for m in re.finditer(r'<script type="application/json"[^>]*>(.*?)</script>',
                             html, re.S):
            try:
                blob = json.loads(m.group(1))
            except (json.JSONDecodeError, ValueError):
                continue
            _walk(blob, "video_versions", found)
        versions: list[dict[str, Any]] = []
        for item in found:
            if isinstance(item, list):
                versions.extend(v for v in item if isinstance(v, dict))
        return versions

    def extract(self, url: str) -> dict[str, Any]:
        self._shortcode(url)  # validates the URL shape early
        html = self.fetch(url)

        direct_urls: list[dict] = []
        seen: set[str] = set()
        for ver in self._video_versions(html):
            raw = ver.get("url")
            if not raw:
                continue
            media_url = js_unescape(str(raw))
            if not media_url.startswith("http") or media_url in seen:
                continue
            seen.add(media_url)
            vtype = ver.get("type")
            quality = {101: "sd", 102: "hd", 103: "hd"}.get(vtype, "source")
            direct_urls.append(direct_url_entry(quality, media_url, ext="mp4"))

        # Older/alternate embeds sometimes carry a plain video_url key.
        if not direct_urls:
            for m in re.finditer(r'"video_url"\s*:\s*"([^"]+)"', html):
                media_url = js_unescape(m.group(1))
                if media_url.startswith("http") and media_url not in seen:
                    seen.add(media_url)
                    direct_urls.append(direct_url_entry("source", media_url, ext="mp4"))

        if not direct_urls:
            raise GeneralExtractionError(
                "instagram: no video data on the page (login-walled, private, "
                "removed, or a photo post). Public media needs no login, but "
                "Instagram gates aggressively per IP — gated content goes "
                "through the yt-dlp+cookies stage instead.")

        caption = og_meta(html, "og:description")
        title = _html.unescape(caption).strip() if caption else None
        thumbnail = og_meta(html, "og:image")
        if thumbnail:
            thumbnail = _html.unescape(thumbnail)

        return self.result(title=title, direct_urls=direct_urls,
                           thumbnail=thumbnail, duration=None,
                           webpage_url=url)
