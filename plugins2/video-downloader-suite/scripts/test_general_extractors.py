#!/usr/bin/env python3
"""Smoke-test one general extractor against a live URL.

Usage:
    python3 scripts/test_general_extractors.py <video-url>

Prints the extraction result as JSON. Fetches at most a few pages;
keep volume minimal — these sites bot-guard aggressively.

Verified sample URLs (captured 2026-10-04):
    tiktok:    https://www.tiktok.com/@jenrocks25/video/7686917076128140574
    instagram: https://www.instagram.com/reel/C_Q2ORqsds4/   (public reel, no login)
    reddit:    https://www.reddit.com/r/<sub>/comments/<id>/x/  (blocked from
               datacenter IPs as of 2026-10-04: www -> 403, old -> timeout;
               or try a v.redd.it/<id> URL)

Notes:
  - TikTok/Instagram media URLs are signed and expire; use them promptly.
  - Reddit is currently unreachable from datacenter networks; the extractor
    is implemented + unit-tested but live extraction needs an unblocked IP.
  - Instagram login-walls by IP; gated pages need the yt-dlp+cookies stage.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.extractors.general import (GeneralExtractionError, extract,
                                    match_extractor)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[0])
        print("Usage: python3 scripts/test_general_extractors.py <video-url>")
        return 2
    url = sys.argv[1]
    cls = match_extractor(url)
    if cls is None:
        print(f"ERROR: no extractor supports {url!r}", file=sys.stderr)
        return 2
    try:
        result = extract(url)
    except GeneralExtractionError as exc:
        print(f"EXTRACTION FAILED [{cls.platform}]: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
