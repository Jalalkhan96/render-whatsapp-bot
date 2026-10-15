"""Shared parser for MindGeek tube sites (Pornhub/YouPorn/RedTube/Tube8 template).

Video pages embed a ``mediaDefinitions`` JS array; each entry has ``videoUrl``
(JS-escaped) plus optional ``quality`` and ``format`` keys:
    {"format":"hls","videoUrl":"https:\\/\\/www.youporn.com\\/media\\/hls\\/?s=..."}
    {"quality":"1080","videoUrl":"https:\\/\\/ev-h.phncdn.com\\/hls\\/..."}

MindGeek pages are bot-walled intermittently from datacenter IPs, so the
extractor warms the session (homepage visit) and retries once when
``mediaDefinitions`` is missing. Failures raise AdultExtractionError.
"""
from __future__ import annotations

import re
from typing import Any

from .base import AdultBase, AdultExtractionError, direct_url_entry, js_unescape, og_meta


class MindGeekBase(AdultBase):
    """Override ``platform``, ``domains`` and ``home`` in subclasses."""

    platform = "mindgeek"
    domains: tuple[str, ...] = ()
    home = "https://www.example.com/"

    def extract(self, url: str) -> dict[str, Any]:
        html = self.fetch(url, referer=self.home)

        if "mediaDefinitions" not in html:
            # Bot wall / consent page; try once more with a warm session.
            html = self.fetch(self.home, referer=self.home)
            html = self.fetch(url, referer=self.home)
        if "mediaDefinitions" not in html:
            raise AdultExtractionError(
                f"{self.platform}: mediaDefinitions not found — page is blocked or bot-walled")

        direct_urls: list[dict] = []
        seen: set[str] = set()

        def add(quality: str | int, video_url: str, fmt: str | None = None) -> None:
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
            if fmt == "hls" or video_url.endswith(".m3u8") or "hls" in video_url:
                entry["ext"] = "m3u8"
            elif fmt == "mp4":
                entry["ext"] = "mp4"
            direct_urls.append(entry)

        # Each mediaDefinitions entry is a flat {...} JSON object. Parse
        # per-object so quality/format/videoUrl pairing stays correct
        # regardless of key order.
        for block in re.finditer(r"\{[^{}]*\}", html):
            obj = block.group(0)
            if "videoUrl" not in obj:
                continue
            vm = re.search(r'"videoUrl"\s*:\s*"([^"]+)"', obj)
            if not vm:
                continue
            qm = re.search(r'"quality"\s*:\s*"?(\d+)"?', obj)
            fm = re.search(r'"format"\s*:\s*"(\w+)"', obj)
            add(qm.group(1) if qm else "sd", vm.group(1), fm.group(1) if fm else None)

        # Fallback passes for page variants the flat scan missed.
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
