"""Pornhub extractor.

The video page embeds a ``mediaDefinitions`` JS array, each entry with
``videoUrl`` (JS-escaped HLS URLs) and ``quality``:
    {"quality":"1080","videoUrl":"https:\\/\\/ev-h.phncdn.com\\/hls\\/c6251\\/videos\\/..."}

Parsing needs the page fetched with Chrome impersonation (curl_cffi
chrome120); a plain requests fetch gets a bot-wall. Pornhub may still block
datacenter IPs — failures raise AdultExtractionError with a clear message.
Verified working 2026-10-02.

URL shapes: https://www.pornhub.com/view_video.php?viewkey={key}
"""
from __future__ import annotations

import re
from typing import Any

from .base import AdultBase, direct_url_entry, js_unescape, og_meta


class PornhubExtractor(AdultBase):
    platform = "pornhub"
    domains = ("pornhub.com",)

    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url, referer="https://www.pornhub.com/")

        if "mediaDefinitions" not in html:
            # Bot wall / consent page; try once more with a warm session.
            html = self.fetch("https://www.pornhub.com/", referer="https://www.pornhub.com/")
            html = self.fetch(url, referer="https://www.pornhub.com/")
        if "mediaDefinitions" not in html:
            raise AdultExtractionError(
                "pornhub: mediaDefinitions not found — page is blocked or bot-walled")

        direct_urls: list[dict] = []
        seen: set[str] = set()

        def add(quality: str | int, video_url: str) -> None:
            video_url = js_unescape(video_url)
            if video_url in seen:
                return
            seen.add(video_url)
            if quality == "sd":
                # Quality is often embedded in the filename:
                # .../1080P_4000K_61517705.mp4/master.m3u8
                qm = re.search(r"/(\d{3,4})P_", video_url)
                if qm:
                    quality = int(qm.group(1))
            entry = direct_url_entry(quality, video_url)
            if video_url.endswith(".m3u8") or "hls" in video_url:
                entry["ext"] = "m3u8"
            direct_urls.append(entry)

        # Each mediaDefinitions entry is a flat {...} JSON object with
        # "quality" and "videoUrl" keys (either order). Parse per-object so the
        # pairing stays correct.
        for block in re.finditer(r"\{[^{}]*\}", html):
            obj = block.group(0)
            if "videoUrl" not in obj:
                continue
            vm = re.search(r'"videoUrl"\s*:\s*"([^"]+)"', obj)
            if not vm:
                continue
            qm = re.search(r'"quality"\s*:\s*"?(\d+)"?', obj)
            add(qm.group(1) if qm else "sd", vm.group(1))

        # Fallback pass: explicit pair patterns for page variants the flat
        # scan missed (group order differs per pattern, kept separate).
        for m in re.finditer(r'"quality"\s*:\s*"?(\d+)"?\s*,\s*"videoUrl"\s*:\s*"([^"]+)"', html):
            add(m.group(1), m.group(2))
        for m in re.finditer(r'"videoUrl"\s*:\s*"([^"]+)"\s*,\s*"quality"\s*:\s*"?(\d+)"?', html):
            add(m.group(2), m.group(1))
        for m in re.finditer(r'"videoUrl"\s*:\s*"([^"]+)"', html):
            add("sd", m.group(1))

        direct_urls.sort(key=lambda d: int(d["quality"][:-1]) if d["quality"][:-1].isdigit() else 0,
                         reverse=True)

        duration = None
        m = re.search(r'"duration"\s*:\s*"?(\d+)"?', html)
        if m:
            duration = float(m.group(1))
        return self.result(title=self.title_from(html), direct_urls=direct_urls,
                           thumbnail=og_meta(html, "og:image"),
                           duration=duration, webpage_url=url)
