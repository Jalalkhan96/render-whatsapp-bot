#!/usr/bin/env python3
"""Smoke-test one adult extractor against a live URL.

Usage:
    python3 scripts/test_adult_extractors.py <video-url>

Prints the extraction result as JSON. Fetches at most a couple of pages;
keep volume minimal — these sites bot-guard aggressively.

Verified sample URLs (captured 2026-10-02; slugs may go stale):
    eporner:    https://www.eporner.com/hd-porn/iJQEOdWFroy/
    redgifs:    https://www.redgifs.com/watch/<id>   (find an id via the API search)
    xvideos:    https://www.xvideos.com/video.omdmvlvce73/56266882
    xnxx:       https://www.xnxx.com/video-17ujehcf/teen_begs_doctor_to_keep_her_test_results_a_secret_-_april_olsen
    pornhub:    https://www.pornhub.com/view_video.php?viewkey=6a9e93d0d41b2
    erome:      https://www.erome.com/a/NBkd0ih0
    letsjerktv: https://letsjerk.tv/thundercock-dallas-rea-wants-her-brother-to-stop-getting-bullied-1/
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.extractors.adult import AdultExtractionError, extract, match_extractor


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[0])
        print("Usage: python3 scripts/test_adult_extractors.py <video-url>")
        return 2
    url = sys.argv[1]
    cls = match_extractor(url)
    if cls is None:
        print(f"ERROR: no extractor supports {url!r}", file=sys.stderr)
        return 2
    try:
        result = extract(url)
    except AdultExtractionError as exc:
        print(f"EXTRACTION FAILED [{cls.platform}]: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
