"""Universal Video Downloader API.

Serves the JSON API under /api/* and the single-page frontend at /.
Run:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import logging
import os
import threading
import time
import urllib.request
from contextlib import asynccontextmanager

import redis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes_admin, routes_analyze, routes_download
from app.config import get_settings
from app.core.downloader import (
    deno_available,
    ffmpeg_available,
    ffprobe_available,
    get_ytdlp_version,
    update_yt_dlp,
)
from app.schemas import ApiInfoResponse, HealthResponse

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("uvd.main")


def _self_ping_target() -> str:
    """Where the keep-alive pinger should hit (public URL preferred)."""
    base = settings.PUBLIC_BASE_URL or os.environ.get("RENDER_EXTERNAL_URL", "")
    if base:
        return base.rstrip("/")
    port = os.environ.get("PORT", "8000")
    return f"http://127.0.0.1:{port}"


def _self_ping_loop() -> None:
    """Hit our own /ping every N seconds so free hosts never sleep."""
    url = f"{_self_ping_target()}/ping"
    interval = max(60, settings.SELF_PING_INTERVAL_SECONDS)
    log.info("self-ping enabled: GET %s every %ds", url, interval)
    while True:
        time.sleep(interval)
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:  # noqa: S310
                resp.read()
        except Exception as exc:  # noqa: BLE001
            log.debug("self-ping failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    settings.COOKIES_DIR.mkdir(parents=True, exist_ok=True)
    if settings.YTDLP_UPDATE_ON_START:
        # non-blocking: API serves while the update runs in the background
        threading.Thread(target=update_yt_dlp, daemon=True,
                         name="ytdlp-startup-update").start()
    if settings.SELF_PING_ENABLED:
        # daemon thread: keeps free hosts (Render, etc.) awake by generating
        # inbound traffic every few minutes; dies with the process.
        threading.Thread(target=_self_ping_loop, daemon=True,
                         name="self-ping").start()
    log.info("ready (storage=%s, redis=%s)", settings.STORAGE_BACKEND, settings.REDIS_URL)
    if settings.PUBLIC_BASE_URL:
        log.info("public API base URL: %s", settings.PUBLIC_BASE_URL.rstrip("/"))
        log.info("API docs: %s/docs", settings.PUBLIC_BASE_URL.rstrip("/"))
    else:
        log.info("PUBLIC_BASE_URL not set — set it to advertise a public API URL via /api/info")
    yield


def _cors_origins() -> list[str]:
    raw = settings.CORS_ORIGINS.strip()
    return ["*"] if raw == "*" else [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Universal Video Downloader", version="1.0.0", lifespan=lifespan)

# Allow API clients (web apps, mobile apps, scripts) to call the API from anywhere.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_analyze.router)
app.include_router(routes_download.router)
app.include_router(routes_admin.router)


@app.get("/api/info", response_model=ApiInfoResponse, tags=["ops"])
async def api_info(request: Request) -> ApiInfoResponse:
    """Public API discovery: where this instance can be reached from anywhere.

    Returns the configured PUBLIC_BASE_URL when set, otherwise derives the
    base URL from the incoming request.
    """
    base = (settings.PUBLIC_BASE_URL or str(request.base_url)).rstrip("/")
    return ApiInfoResponse(
        public_base_url=base,
        docs_url=f"{base}/docs",
        auth_required=bool(settings.API_KEY),
    )


@app.get("/ping", tags=["ops"])
async def ping() -> dict:
    """Ultra-lightweight liveness probe. The built-in self-pinger hits this
    every SELF_PING_INTERVAL_SECONDS so free hosts never sleep."""
    return {"status": "ok"}


@app.get("/health", response_model=HealthResponse, tags=["ops"])
async def health() -> HealthResponse:
    redis_ok = False
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        redis_ok = bool(r.ping())
    except Exception:  # noqa: BLE001
        pass
    return HealthResponse(
        status="ok",
        ytdlp_version=get_ytdlp_version(),
        ffmpeg=ffmpeg_available(),
        ffprobe=ffprobe_available(),
        deno=deno_available(),
        redis=redis_ok,
    )


# Frontend last: API routes are matched first, everything else serves index.html.
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
