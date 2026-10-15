"""LetsJerk (letsjerk.tv) extractor — best effort.

LetsJerk is a WordPress tube (Fluid Player). Video posts at
https://letsjerk.tv/{slug}/ embed the actual video from an external host via
an <iframe> (e.g. https://bysejikuar.com/e/{token} — host rotates and is a
JS app shell whose sources load through its own JS API).

The extractor returns:
  - title from og:title,
  - the primary non-ad embed iframe URL as a "embed" entry (ext "html"),
  - og:image as thumbnail.

Resolving the embed to a direct mp4/m3u8 is not reliable without the host's
JS API, so this platform is marked limited: the caller should fall back to
yt-dlp's generic extractor or the Playwright network-sniff stage.
Verified 2026-10-02.
"""
from __future__ import annotations

import re
from typing import Any

from .base import AdultBase, direct_url_entry, og_meta

# Ad/iframe hints to skip when picking the primary embed (matched on the full URL).
_AD_IFRAME_HINTS = ("magsrv.com", "letsjerk.tv/api/spots", "google", "doubleclick")


class LetsjerktvExtractor(AdultBase):
    platform = "letsjerktv"
    domains = ("letsjerk.tv", "letsjerk.com", "letsjerktv.tv")

    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url, referer="https://letsjerk.tv/")
        iframes = re.findall(r'<iframe[^>]*src="([^"]+)"', html, re.I)
        embeds: list[str] = []
        for src in iframes:
            src = src.replace("&amp;", "&")
            if any(hint in src for hint in _AD_IFRAME_HINTS):
                continue
            if src.startswith("//"):
                src = "https:" + src
            embeds.append(src)

        direct_urls = [direct_url_entry("embed", e, ext="html") for e in embeds]
        return self.result(title=self.title_from(html), direct_urls=direct_urls,
                           thumbnail=og_meta(html, "og:image"),
                           duration=None, webpage_url=url)
