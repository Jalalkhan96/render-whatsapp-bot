"""Celery tasks: the actual download job + maintenance jobs.

The HTTP request never blocks: it creates a job id, fires `download_job`, and
returns immediately. Progress flows job -> Redis hash -> API/SSE.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
import time
from pathlib import Path

import redis
from celery.exceptions import SoftTimeLimitExceeded

from app.config import get_settings
from app.core.downloader import (
    build_ydl_opts,
    resolve_download_options,
    update_yt_dlp,
)
from app.core.fallback import DownloadError, download_with_fallback
from app.core.security import assert_url_safe, sanitize_filename, validate_url
from app.schemas import JobStatus
from app.storage.s3 import get_storage
from app.workers.celery_app import celery

log = logging.getLogger("uvd.tasks")
settings = get_settings()

MAX_RETRIES = 3


def _job_key(job_id: str) -> str:
    return f"job:{job_id}"


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


def _set(r: redis.Redis, job_id: str, **fields: object) -> None:
    str_fields = {k: ("" if v is None else str(v)) for k, v in fields.items()}
    r.hset(_job_key(job_id), mapping=str_fields)


def _pick_proxy(attempt: int) -> str | None:
    proxies = settings.proxies
    if not proxies:
        return None
    # rotate per attempt so a retry uses a different egress IP
    return proxies[attempt % len(proxies)]


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc).lower()
    transient = ("timed out", "timeout", "connection", "429", "too many requests",
                 "temporary", "reset by peer", "proxy")
    return any(k in msg for k in transient)


def _progress_hook_factory(r: redis.Redis, job_id: str, max_bytes: int):
    def hook(d: dict) -> None:
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate")
            downloaded = d.get("downloaded_bytes") or 0
            if total and total > max_bytes:
                # abort early instead of filling the disk
                raise DownloadError(
                    f"File is too large ({total / 1e9:.1f} GB). "
                    f"Limit is {max_bytes / 1e9:.1f} GB."
                )
            progress = (downloaded / total * 100) if total else 0.0
            _set(r, job_id,
                 status=JobStatus.DOWNLOADING.value,
                 progress=f"{min(progress, 99.9):.1f}",
                 speed=str(d.get("_speed_str") or "").strip(),
                 eta=str(d.get("_eta_str") or "").strip())
        elif d.get("status") == "finished":
            _set(r, job_id, status=JobStatus.PROCESSING.value, progress="99")
    return hook


@celery.task(bind=True, max_retries=MAX_RETRIES, name="app.workers.tasks.download_job")
def download_job(self, job_id: str, url: str, options: dict) -> None:
    """Run one download through the fallback chain, then store the file."""
    r = _redis_client()
    attempt = self.request.retries or 0
    tmpdir = Path(tempfile.mkdtemp(prefix=f"uvd-{job_id}-"))
    try:
        # Re-validate inside the worker: the URL traveled through the broker.
        url = assert_url_safe(validate_url(url))
        _set(r, job_id, status=JobStatus.ANALYZING.value, progress="1")

        selector, audio_only, target_ext = resolve_download_options(
            options.get("preset"), options.get("format_id"), bool(options.get("audio_only"))
        )
        proxy = _pick_proxy(attempt)
        if proxy:
            log.info("job %s attempt %d using proxy %s", job_id, attempt, proxy.split("@")[-1])

        hook = _progress_hook_factory(r, job_id, settings.MAX_FILE_SIZE)
        ydl_opts = build_ydl_opts(
            format_selector=selector,
            audio_only=audio_only,
            target_ext=target_ext,
            subtitles=bool(options.get("subtitles")),
            embed_thumbnail=bool(options.get("embed_thumbnail")),
            tmpdir=tmpdir,
            proxy=proxy,
            progress_hook=hook,
        )

        info, stage, _attempts = download_with_fallback(url, ydl_opts, tmpdir)
        _set(r, job_id, status=JobStatus.PROCESSING.value, stage_used=stage,
             title=str(info.get("title") or "")[:300])

        # Locate the downloaded file. Some stages report it explicitly;
        # otherwise take the largest file yt-dlp left in tmpdir.
        explicit = info.get("_downloaded_file")
        if explicit and Path(explicit).exists():
            src = Path(explicit)
        else:
            candidates = [p for p in tmpdir.iterdir() if p.is_file()]
            if not candidates:
                raise DownloadError("Download finished but no file was produced.")
            src = max(candidates, key=lambda p: p.stat().st_size)

        size = src.stat().st_size
        if size > settings.MAX_FILE_SIZE:
            raise DownloadError(
                f"File is too large ({size / 1e9:.2f} GB). "
                f"Limit is {settings.MAX_FILE_SIZE / 1e9:.2f} GB."
            )
        if size == 0:
            raise DownloadError("Downloaded file is empty.")

        ext = src.suffix.lstrip(".") or str(info.get("ext") or "mp4")
        filename = sanitize_filename(f"{info.get('title') or 'video'}.{ext}")
        get_storage().store(job_id, src, filename)

        _set(r, job_id, status=JobStatus.DONE.value, progress="100",
             filename=filename, speed="", eta="", error="")
        log.info("job %s done via stage %s (%s)", job_id, stage, filename)

    except SoftTimeLimitExceeded:
        _fail(r, job_id, "The download took longer than 15 minutes and was stopped.")
    except DownloadError as exc:
        _fail_or_retry(self, r, job_id, attempt, exc, exc.message)
    except Exception as exc:  # noqa: BLE001 - never leave a job stuck
        log.exception("job %s failed unexpectedly", job_id)
        _fail_or_retry(self, r, job_id, attempt, exc, f"Unexpected error: {exc}")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _fail(r: redis.Redis, job_id: str, message: str) -> None:
    _set(r, job_id, status=JobStatus.FAILED.value, error=message[:1000], speed="", eta="")
    try:
        get_storage().delete(job_id)
    except Exception:  # noqa: BLE001
        pass


def _fail_or_retry(task, r: redis.Redis, job_id: str, attempt: int, exc: Exception, message: str) -> None:
    if attempt < MAX_RETRIES and _is_retryable(exc):
        countdown = 2 ** attempt * 15  # 15s, 30s, 60s backoff
        log.info("job %s failed transiently, retrying in %ss: %s", job_id, countdown, message[:150])
        _set(r, job_id, status=JobStatus.QUEUED.value, progress="0",
             error=f"Retrying ({attempt + 1}/{MAX_RETRIES}): {message[:300]}")
        raise task.retry(exc=exc, countdown=countdown)
    _fail(r, job_id, message)


# ---------------------------------------------------------------------------
# Maintenance tasks (run on beat)
# ---------------------------------------------------------------------------

@celery.task(name="app.workers.tasks.update_ytdlp")
def update_ytdlp() -> bool:
    """Daily yt-dlp self-update. Failure keeps the current version."""
    return update_yt_dlp()


@celery.task(name="app.workers.tasks.cleanup_old_files")
def cleanup_old_files() -> int:
    """Delete stored files older than FILE_TTL_SECONDS. Returns count removed."""
    storage = get_storage()
    now = time.time()
    removed = 0
    for job_id in storage.list_job_ids():
        mtime = storage.file_mtime(job_id)
        if mtime is not None and now - mtime > settings.FILE_TTL_SECONDS:
            storage.delete(job_id)
            removed += 1
            log.info("cleaned up expired files for job %s", job_id)
    return removed
