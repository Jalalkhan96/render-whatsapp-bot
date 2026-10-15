"""Erome extractor.

Album pages (https://www.erome.com/a/{id}) render every media item as a
<video> tag with <source> children:
    <source src="https://v77.erome.com/7453/NBkd0ih0/i5OwkmJB_720p.mp4"
            type='video/mp4' label='HD' res='720'>
og:title / og:image supply title and thumbnail. Verified 2026-10-02.
"""
from __future__ import annotations

import re
from typing import Any

from .base import AdultBase, direct_url_entry, og_meta


class EromeExtractor(AdultBase):
    platform = "erome"
    domains = ("erome.com",)

    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url, referer="https://www.erome.com/")
        direct_urls: list[dict] = []
        seen: set[str] = set()
        for m in re.finditer(
                r'<source\s+src="([^"]+)"[^>]*?(?:label=[\'"]([^\'"]+)[\'"])?[^>]*?(?:res=[\'"](\d+)[\'"])?',
                html):
            src, label, res = m.group(1), m.group(2), m.group(3)
            if src in seen:
                continue
            seen.add(src)
            quality = int(res) if res and res.isdigit() else (label or "hd")
            direct_urls.append(direct_url_entry(quality, src))

        # Multiple qualities sometimes differ only by the _720p/_480p suffix;
        # dedupe by full URL is already done above via `seen`.
        direct_urls.sort(key=lambda d: int(d["quality"][:-1]) if d["quality"][:-1].isdigit() else 0,
                         reverse=True)
        return self.result(title=self.title_from(html), direct_urls=direct_urls,
                           thumbnail=og_meta(html, "og:image"),
                           duration=None, webpage_url=url)
