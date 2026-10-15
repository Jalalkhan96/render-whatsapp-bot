"""General (non-adult) site extractors: TikTok, Reddit, Instagram.

Direct media-URL scraping for mainstream platforms, used as a fallback-chain
stage after yt-dlp and before Playwright sniffing (see app/core/fallback.py).
"""
from .base import GeneralBase, GeneralExtractionError
from .registry import extract, match_extractor, supported_platforms

__all__ = ["GeneralBase", "GeneralExtractionError", "extract",
           "match_extractor", "supported_platforms"]
