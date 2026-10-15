"""Shared parser for the xVideos/xnxx page template (same owner, same JS API).

The video page embeds:
    html5player.setVideoUrlHigh('https://.../video_1080p.mp4');
    html5player.setVideoUrlLow('https://.../video_240p.mp4');
    html5player.setVideoHLS('https://.../playlist.m3u8');
plus og:title / og:image meta tags. Verified on both domains 2026-10-02.

xVideos URL shapes:
    https://www.xvideos.com/video.{id}/{numeric_id}
    https://www.xvideos.com/video{id}/{slug}
xnxx URL shapes:
    https://www.xnxx.com/video-{id}/{slug}
"""
from __future__ import annotations

import re
from typing import Any

from .base import (AdultBase, AdultExtractionError, direct_url_entry,
                   js_unescape, og_meta)


def _parse_video_page(extractor: "XvTubeBase", html: str, url: str) -> dict[str, Any]:
    direct_urls: list[dict] = []
    seen: set[str] = set()

    def add(quality: str, url: str, ext: str | None = None) -> None:
        url = js_unescape(url)
        if url not in seen:
            seen.add(url)
            direct_urls.append(direct_url_entry(quality, url, ext=ext))

    for label, pat, quality in (
        ("high", r"setVideoUrlHigh\('([^']+)'\)", "high"),
        ("low", r"setVideoUrlLow\('([^']+)'\)", "low"),
    ):
        m = re.search(pat, html)
        if m:
            add(quality, m.group(1))
    m = re.search(r"setVideoHLS\('([^']+)'\)", html)
    if m:
        add("hls", m.group(1), ext="m3u8")
    # Fallback: any direct cdn mp4 links.
    for src in set(re.findall(r'"(https://[a-z0-9-]+\.(?:xvideos|xnxx)-cdn\.com/[^"]+\.mp4[^"]*)"', html)):
        if not any(d["url"] == src for d in direct_urls):
            direct_urls.append(direct_url_entry("sd", js_unescape(src)))

    duration = None
    m = re.search(r"setVideoDuration\((\d+)\)", html)
    if m:
        duration = float(m.group(1))

    title = extractor.title_from(html)
    # xVideos HTML-escapes the og:title; decode entities.
    if title:
        import html as _html
        title = _html.unescape(title)
    return extractor.result(title=title, direct_urls=direct_urls,
                            thumbnail=og_meta(html, "og:image"),
                            duration=duration, webpage_url=url)


class XvTubeBase(AdultBase):
    """Shared base for xVideos/xnxx (same owner, same page template)."""

    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url)
        return _parse_video_page(self, html, url)
