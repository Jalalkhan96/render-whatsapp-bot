"""TnaFlix extractor.

The video page itself only carries trailers, but its schema.org VideoObject
JSON-LD block has an ``embedUrl``:
    "embedUrl": "https://player.tnaflix.com/video/3533313"

The embed player page holds the real direct MP4s as <video><source> tags:
    <source src="https://fck-cl21.tnaflix.com/.../Slug-720p.mp4?rs=..&secure=.."
            type="video/mp4" size="720">
Qualities seen: 144p/240p/360p/480p/720p. The ``secure`` token is
time-limited, so URLs must be used promptly after extraction.
Verified 2026-10-02.

URL shapes:
    https://www.tnaflix.com/{category}/{slug}/video{id}
    https://player.tnaflix.com/video/{id}   (embed, accepted directly)
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from .base import (AdultBase, AdultExtractionError, direct_url_entry,
                   extract_json_ld, og_meta, parse_iso8601_duration)


class TnaflixExtractor(AdultBase):
    platform = "tnaflix"
    domains = ("tnaflix.com",)

    def _video_id(self, url: str) -> str:
        path = urlparse(url).path
        m = re.search(r"/video/?(\d+)", path)
        if m:
            return m.group(1)
        raise AdultExtractionError(f"tnaflix: cannot parse video id from {url}")

    def extract(self, url: str) -> dict[str, Any]:
        vid = self._video_id(url)
        host = (urlparse(url).hostname or "").lower()

        title = thumb = None
        duration = None
        if "player.tnaflix.com" not in host:
            # Main page: title/duration/embedUrl from JSON-LD.
            page = self.fetch(url, referer="https://www.tnaflix.com/")
            for block in extract_json_ld(page, "VideoObject"):
                title = title or block.get("name")
                thumbs = block.get("thumbnailUrl")
                if isinstance(thumbs, list) and thumbs:
                    thumb = thumb or thumbs[0]
                elif isinstance(thumbs, str):
                    thumb = thumb or thumbs
                duration = duration or parse_iso8601_duration(block.get("duration"))
            title = title or self.title_from(page)
            thumb = thumb or og_meta(page, "og:image")

        # Embed player: the direct <source> URLs.
        embed = self.fetch(f"https://player.tnaflix.com/video/{vid}",
                           referer="https://www.tnaflix.com/")
        direct_urls: list[dict] = []
        seen: set[str] = set()
        for m in re.finditer(r'<source\s+src="([^"]+)"[^>]*?size="(\d+)"', embed):
            src = m.group(1).replace("&amp;", "&")
            if src in seen:
                continue
            seen.add(src)
            direct_urls.append(direct_url_entry(int(m.group(2)), src))

        title = title or self.title_from(embed)
        thumb = thumb or og_meta(embed, "og:image")
        return self.result(title=title, direct_urls=direct_urls, thumbnail=thumb,
                           duration=duration, webpage_url=url)
