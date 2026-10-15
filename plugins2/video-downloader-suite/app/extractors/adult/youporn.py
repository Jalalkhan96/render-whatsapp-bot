"""YouPorn extractor (MindGeek template — shares the mediaDefinitions parser).

The video page embeds a ``mediaDefinitions`` JS array:
    {"format":"hls","videoUrl":"https:\\/\\/www.youporn.com\\/media\\/hls\\/?s=..."}

Like Pornhub, YouPorn intermittently serves bot-wall pages from datacenter
IPs; the extractor warms the session and retries once. Verified 2026-10-02.

URL shapes: https://www.youporn.com/watch/{id}/{slug}/
"""
from __future__ import annotations

from .mindgeek import MindGeekBase


class YoupornExtractor(MindGeekBase):
    platform = "youporn"
    domains = ("youporn.com",)
    home = "https://www.youporn.com/"
