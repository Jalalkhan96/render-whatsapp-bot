"""Application configuration. Everything is driven by environment variables."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Redis / Celery -------------------------------------------------
    REDIS_URL: str = "redis://redis:6379/0"

    # --- Storage ---------------------------------------------------------
    DOWNLOAD_DIR: Path = Path("/data/downloads")
    COOKIES_DIR: Path = Path("/data/cookies")
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    MAX_FILE_SIZE: int = 2 * 1024**3  # 2 GiB default cap per file
    FILE_TTL_SECONDS: int = 3600  # finished files are deleted after this long

    # --- Jobs ------------------------------------------------------------
    JOB_TIMEOUT: int = 900  # hard cap per download job (15 minutes)

    # --- Rate limiting ---------------------------------------------------
    # 0 disables rate limiting (useful for local dev)
    RATE_LIMIT_PER_MINUTE: int = 10

    # --- Auth ------------------------------------------------------------
    # When set, /api/* (except /health) requires it via `X-API-Key` header
    # or `?api_key=` query param (the latter is needed for SSE/file links).
    API_KEY: str | None = None

    # --- Proxy pool -------------------------------------------------------
    # Comma-separated proxy URLs, rotated per job attempt.
    PROXY_LIST: str = ""

    # --- S3 / Cloudflare R2 ----------------------------------------------
    S3_ENDPOINT_URL: str | None = None  # e.g. https://<account>.r2.cloudflarestorage.com
    S3_BUCKET: str = "video-downloader"
    S3_ACCESS_KEY: str | None = None
    S3_SECRET_KEY: str | None = None
    S3_REGION: str = "auto"
    S3_PREFIX: str = "downloads/"

    # --- yt-dlp -----------------------------------------------------------
    YTDLP_UPDATE_ON_START: bool = True
    DENO_PATH: str = "deno"  # resolved via PATH when "deno"

    # --- Public API access ------------------------------------------------
    # Set this to the public URL the API is reachable at (e.g. your domain or
    # the Cloudflare Tunnel URL). It is reported by /api/info and logged on
    # startup so remote clients know where to connect.
    PUBLIC_BASE_URL: str | None = None
    # Comma-separated allowed CORS origins, or "*" for any origin (default).
    # "*" lets web/mobile clients call the API from anywhere.
    CORS_ORIGINS: str = "*"

    # --- Self-ping (keep-alive) -------------------------------------------
    # Pings this instance's /ping every N seconds so free hosts (Render, etc.)
    # never sleep from inactivity. Target is PUBLIC_BASE_URL, else the
    # RENDER_EXTERNAL_URL env var (set automatically by Render), else
    # http://127.0.0.1:$PORT.
    SELF_PING_ENABLED: bool = True
    SELF_PING_INTERVAL_SECONDS: int = 300

    LOG_LEVEL: str = "INFO"

    @property
    def proxies(self) -> list[str]:
        """Parsed proxy pool."""
        return [p.strip() for p in self.PROXY_LIST.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
