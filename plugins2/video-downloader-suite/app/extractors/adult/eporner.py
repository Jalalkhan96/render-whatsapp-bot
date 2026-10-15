"""Eporner extractor.

Primary method: the video page carries a schema.org VideoObject JSON-LD block
with ``contentUrl`` (direct mp4), name, duration (ISO-8601) and thumbnailUrl.
Verified 2026-10-02.

Caveats:
- Eporner sometimes serves an "Age Verification" interstitial to fresh
  sessions; a retry (or a warm session) usually gets the real page. The
  extractor detects it and retries once.
- The public API (https://www.eporner.com/api/v2/video?id={id}) returned an
  empty body on 2026-10-02, so the page route is used instead.
- Video URL shape: /hd-porn/{video_id}/{slug}/ — the 11-char id is taken from
  the first path segment.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from .base import (AdultBase, AdultExtractionError, direct_url_entry,
                   extract_json_ld, og_meta, parse_iso8601_duration)


class EpornerExtractor(AdultBase):
    platform = "eporner"
    domains = ("eporner.com",)

    def _video_id(self, url: str) -> str:
        path = urlparse(url).path
        m = re.search(r"/(?:hd-porn|video)/?([A-Za-z0-9]{6,})", path)
        if m:
            return m.group(1)
        raise AdultExtractionError(f"eporner: cannot parse video id from {url}")

    def extract(self, url: str) -> dict[str, Any]:
        vid = self._video_id(url)
        # Warm session first: homepage visit establishes cookies and skips the
        # intermittent age-verification interstitial on the video page.
        # Warm session first: homepage visit establishes cookies and skips the
        # intermittent age-verification interstitial on the video page.
        try:
            home = self.fetch("https://www.eporner.com/")
        except AdultExtractionError:
            home = ""
        if home and "Age Verification" in home and "<title>Eporner Age Verification" in home:
            home = self.fetch("https://www.eporner.com/")

        page = self.fetch(f"https://www.eporner.com/hd-porn/{vid}/",
                          referer="https://www.eporner.com/")
        if "Age Verification" in page and "<title>Eporner Age Verification" in page:
            page = self.fetch(f"https://www.eporner.com/hd-porn/{vid}/",
                              referer="https://www.eporner.com/")

        direct_urls: list[dict] = []
        title = thumb = None
        duration = None

        for block in extract_json_ld(page, "VideoObject"):
            content = block.get("contentUrl")
            if content:
                direct_urls.append(direct_url_entry("hd", content))
            title = title or block.get("name")
            thumbs = block.get("thumbnailUrl")
            if isinstance(thumbs, list) and thumbs:
                thumb = thumb or thumbs[0]
            elif isinstance(thumbs, str):
                thumb = thumb or thumbs
            duration = duration or parse_iso8601_duration(block.get("duration"))

        # Fallback: any gvideo.eporner.com mp4 link in the page.
        for src in set(re.findall(r'"(https://gvideo\.eporner\.com/[^"]+\.mp4[^"]*)"', page)):
            if not any(d["url"] == src for d in direct_urls):
                direct_urls.append(direct_url_entry("sd", src))

        title = title or self.title_from(page)
        thumb = thumb or og_meta(page, "og:image")
        return self.result(title=title, direct_urls=direct_urls, thumbnail=thumb,
                           duration=duration, webpage_url=url)
