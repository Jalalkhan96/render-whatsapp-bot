"""TikTok extractor — parses the embedded rehydration JSON on video pages.

The video page embeds ``<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">``
with ``__DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct`` holding
``video.playAddr`` / ``video.downloadAddr`` (signed mp4 URLs), cover images,
duration, and author info. Older pages may embed ``window['SIGI_STATE']``
instead — handled as a fallback.

Short links (vt.tiktok.com / vm.tiktok.com) redirect to the canonical video
page; curl_cffi follows them automatically, so the same parser applies.

URL shapes: https://www.tiktok.com/@user/video/<id>
            https://vt.tiktok.com/<code>/   https://vm.tiktok.com/<code>/

Network note (verified 2026-10-04): TikTok serves full video pages to this
network with plain chrome impersonation — no login needed. Signed media URLs
expire; use them promptly.
"""
from __future__ import annotations

import json
import re
from typing import Any

from .base import (GeneralBase, GeneralExtractionError, direct_url_entry,
                   js_unescape)


def _first(value: Any) -> str | None:
    """playAddr is usually a str, sometimes a one-element list."""
    if isinstance(value, list):
        value = value[0] if value else None
    return str(value).strip() if value else None


class TikTokExtractor(GeneralBase):
    platform = "tiktok"
    domains = ("tiktok.com", "vt.tiktok.com", "vm.tiktok.com")

    # -- parsing ----------------------------------------------------------
    def _item_struct(self, html: str) -> dict[str, Any]:
        m = re.search(
            r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
            html, re.S,
        )
        if m:
            try:
                scope = json.loads(m.group(1)).get("__DEFAULT_SCOPE__", {})
            except (json.JSONDecodeError, ValueError, AttributeError):
                scope = {}
            detail = scope.get("webapp.video-detail") or {}
            if detail.get("statusCode") not in (0, None) and "itemInfo" not in detail:
                raise GeneralExtractionError(
                    f"tiktok: video unavailable (status {detail.get('statusCode')}: "
                    f"{detail.get('statusMsg')})")
            item = (detail.get("itemInfo") or {}).get("itemStruct")
            if isinstance(item, dict):
                return item
        # Fallback: older SIGI_STATE embed.
        m = re.search(r"window\['SIGI_STATE'\]\s*=\s*(\{.*?\});?</script>", html, re.S)
        if m:
            try:
                state = json.loads(m.group(1))
            except (json.JSONDecodeError, ValueError):
                state = {}
            for section in ("ItemModule",):
                items = state.get(section) or {}
                if isinstance(items, dict) and items:
                    first = next(iter(items.values()))
                    if isinstance(first, dict) and "video" in first:
                        return first
        raise GeneralExtractionError("tiktok: no video data found in page JSON")

    # -- extract ----------------------------------------------------------
    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url, referer="https://www.tiktok.com/")
        item = self._item_struct(html)
        video = item.get("video") or {}
        if not isinstance(video, dict):
            raise GeneralExtractionError(f"tiktok: malformed video block on {url}")

        direct_urls: list[dict] = []
        seen: set[str] = set()

        def add(quality: str, raw: Any) -> None:
            u = _first(raw)
            if u:
                u = js_unescape(u)
                if u not in seen:
                    seen.add(u)
                    direct_urls.append(direct_url_entry(quality, u, ext="mp4"))

        add("watermarked", video.get("playAddr"))
        dl = _first(video.get("downloadAddr"))
        if dl and dl not in seen:
            add("no-watermark", video.get("downloadAddr"))

        author = item.get("author") or {}
        nickname = author.get("nickname") or author.get("uniqueId")
        desc = (item.get("desc") or "").strip()
        title = f"{nickname}: {desc}" if nickname and desc else (desc or nickname)

        duration = video.get("duration")
        try:
            duration = float(duration) if duration is not None else None
        except (TypeError, ValueError):
            duration = None

        thumbnail = _first(video.get("cover")) or _first(video.get("originCover"))
        return self.result(title=title or None, direct_urls=direct_urls,
                           thumbnail=thumbnail, duration=duration,
                           webpage_url=url)
