"""RedTube extractor (MindGeek template — shares the mediaDefinitions parser).

Same page template as Pornhub/YouPorn: a ``mediaDefinitions`` JS array with
``videoUrl`` entries. RedTube was unreachable/flaky from the test network on
2026-10-02 (bot-wall page or timeouts), so this extractor is implemented
against the shared MindGeek parser but marked network-limited: it retries
with a warm session and raises a clear error when blocked.

URL shapes: https://www.redtube.com/{numeric_id}
"""
from __future__ import annotations

from .mindgeek import MindGeekBase


class RedtubeExtractor(MindGeekBase):
    platform = "redtube"
    domains = ("redtube.com",)
    home = "https://www.redtube.com/"
