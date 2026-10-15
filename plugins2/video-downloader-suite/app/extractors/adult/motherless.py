"""Motherless extractor.

Video pages (https://motherless.com/G/{id} or /{hash}) embed the source in
page JS as ``__fileurl`` (sometimes ``fileurl``), plus og:title/og:image.

Status 2026-10-02: motherless.com hard-resets TLS connections from this
network (Cloudflare bot filtering), so live extraction is currently blocked.
The extractor implements the known-good parsing and raises a clear error on
fetch failure — it will work from networks the site accepts.
"""
from __future__ import annotations

import re
from typing import Any

from .base import (AdultBase, AdultExtractionError, direct_url_entry,
                   js_unescape, og_meta)


class MotherlessExtractor(AdultBase):
    platform = "motherless"
    domains = ("motherless.com",)

    def extract(self, url: str) -> dict[str, Any]:
        try:
            html = self.fetch(url, referer="https://motherless.com/")
        except AdultExtractionError as exc:
            raise AdultExtractionError(
                f"motherless: page unreachable from this network (connection reset / "
                f"bot protection): {exc}") from exc

        direct_urls: list[dict] = []
        for pat in (
            r'__fileurl\s*=\s*[\'"]([^\'"]+)[\'"]',
            r'\bfileurl\s*=\s*[\'"]([^\'"]+\.mp4[^\'"]*)[\'"]',
            r'"fileurl"\s*:\s*"([^"]+)"',
        ):
            m = re.search(pat, html)
            if m:
                direct_urls.append(direct_url_entry("sd", js_unescape(m.group(1))))
                break
        # Fallback: direct mp4 links in the page.
        for m in re.finditer(r'"(https://[a-z0-9.-]*motherless[a-z0-9.-]*/[^"]+\.mp4[^"]*)"', html):
            src = js_unescape(m.group(1))
            if not any(d["url"] == src for d in direct_urls):
                direct_urls.append(direct_url_entry("sd", src))

        duration = None
        m = re.search(r'"duration"\s*:\s*"?(\d+)"?', html)
        if m:
            duration = float(m.group(1))
        return self.result(title=self.title_from(html), direct_urls=direct_urls,
                           thumbnail=og_meta(html, "og:image"),
                           duration=duration, webpage_url=url)
