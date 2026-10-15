"""POST /api/analyze — inspect a link without downloading anything."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.downloader import (
    build_presets,
    clean_formats,
    is_playlist,
    playlist_entries,
)
from app.core.fallback import DownloadError, analyze_with_fallback
from app.core.platforms import match_platform
from app.core.ratelimit import ApiKey, RateLimit
from app.core.security import (
    BlockedSiteError,
    SSRFError,
    URLValidationError,
    assert_url_safe,
)
from app.schemas import AnalyzeRequest, AnalyzeResponse

log = logging.getLogger("uvd.api.analyze")

router = APIRouter(prefix="/api", tags=["analyze"])

ANALYZE_TIMEOUT = 90  # yt-dlp extraction runs in a thread; don't hang the request


@router.post("/analyze", response_model=AnalyzeResponse,
             dependencies=[RateLimit, ApiKey])
async def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        url = assert_url_safe(request.url)
    except (URLValidationError, SSRFError, BlockedSiteError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        info, stage, _attempts = await asyncio.wait_for(
            asyncio.to_thread(analyze_with_fallback, url),
            timeout=ANALYZE_TIMEOUT,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Analysis timed out; the site is too slow.") from exc
    except DownloadError as exc:
        log.info("analyze failed for %s: %s", url, exc.cause[:200])
        raise HTTPException(status_code=422, detail=exc.message) from exc

    platform, _cfg = match_platform(info.get("webpage_url") or url)
    formats = clean_formats(info)
    entries = playlist_entries(info) if is_playlist(info) else []

    return AnalyzeResponse(
        title=(info.get("title") or "")[:300] or None,
        thumbnail=info.get("thumbnail"),
        duration=info.get("duration"),
        uploader=info.get("uploader"),
        platform=platform,
        webpage_url=info.get("webpage_url") or url,
        formats=formats,
        presets=build_presets(),
        is_playlist=is_playlist(info),
        playlist_entries=entries,
        stage_used=stage,
    )
