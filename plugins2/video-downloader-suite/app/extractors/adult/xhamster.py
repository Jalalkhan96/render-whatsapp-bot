"""xHamster extractor.

Video pages (https://xhamster.com/videos/{id}) are heavily bot-guarded from
datacenter IPs: on 2026-10-02 the site intermittently returned truncated
responses or timed out entirely from this network. The extractor therefore
tries the known-good source locations and raises a clear error when the page
is blocked rather than returning junk.

Known-good locations (from real page captures):
  - window.initials / xplayer JSON with "file" entries
    e.g. {"file":"https://.../xhamster.com/...mp4?...","label":"720p"}
  - <meta property="og:title">, og:image, JSON-LD VideoObject
"""
from __future__ import annotations

import re
from typing import Any

from .base import (AdultBase, AdultExtractionError, direct_url_entry,
                   extract_json_ld, js_unescape, og_meta)


class XhamsterExtractor(AdultBase):
    platform = "xhamster"
    domains = ("xhamster.com",)

    def extract(self, url: str) -> dict[str, Any]:
        try:
            html = self.fetch(url, referer="https://xhamster.com/")
        except AdultExtractionError as exc:
            raise AdultExtractionError(
                "xhamster: page unreachable from this network (bot protection / "
                f"timeout): {exc}") from exc

        direct_urls: list[dict] = []
        seen: set[str] = set()

        def add(quality: str | int, src: str) -> None:
            src = js_unescape(src)
            if src not in seen and src.startswith("http"):
                seen.add(src)
                direct_urls.append(direct_url_entry(quality, src))

        # xplayer-style entries: {"file":"...mp4...","label":"720p"}
        for m in re.finditer(
                r'\{[^{}]*?"file"\s*:\s*"(https:[^"]+)"[^{}]*?"label"\s*:\s*"([^"]+)"',
                html):
            add(m.group(2), m.group(1))
        # bare file entries
        for m in re.finditer(r'"file"\s*:\s*"(https:[^"]+?\.(?:mp4|m3u8)[^"]*)"', html):
            add("sd", m.group(1))
        # JSON-LD fallback
        for block in extract_json_ld(html, "VideoObject"):
            for key in ("contentUrl", "embedUrl"):
                if block.get(key):
                    add("sd", block[key])

        if not direct_urls and ("captcha" in html.lower() or "are you a robot" in html.lower()):
            raise AdultExtractionError("xhamster: bot check page served; cannot extract")

        title = self.title_from(html)
        return self.result(title=title, direct_urls=direct_urls,
                           thumbnail=og_meta(html, "og:image"),
                           duration=None, webpage_url=url)
