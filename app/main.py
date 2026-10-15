from __future__ import annotations

import asyncio
import hmac
import ipaddress
import os
import shutil
import socket
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlparse

import yt_dlp
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from yt_dlp.utils import DownloadError

APP_NAME = "Video & Audio Downloader API"
APP_VERSION = "2.0.0"


def env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    """Read bounded numeric configuration so bad env values don't crash startup."""
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


API_KEY = os.getenv("API_KEY", "").strip()
DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "/tmp/video-audio-downloader")).resolve()
# Conservative defaults for Render Free (512 MB RAM and ephemeral filesystem).
MAX_DOWNLOAD_MB = env_int("MAX_DOWNLOAD_MB", 150, minimum=1, maximum=10240)
MAX_DURATION_SECONDS = env_int("MAX_DURATION_SECONDS", 3600, minimum=60, maximum=86400)
MAX_ACTIVE_JOBS = env_int("MAX_ACTIVE_JOBS", 1, minimum=1, maximum=10)
FILE_TTL_MINUTES = env_int("FILE_TTL_MINUTES", 10, minimum=5, maximum=1440)
SOCKET_TIMEOUT_SECONDS = env_int("SOCKET_TIMEOUT_SECONDS", 15, minimum=5, maximum=120)
CORS_ORIGINS = [item.strip() for item in os.getenv("CORS_ORIGINS", "*").split(",") if item.strip()]

MEDIA_EXTENSIONS = {
    ".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi",
    ".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav", ".flac",
}
VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mkv", ".webm", ".mov", ".avi"}
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".opus", ".ogg", ".wav", ".flac"}

# Use one Uvicorn worker: jobs and concurrency tracking intentionally live in memory.
jobs: dict[str, dict] = {}
active_jobs: set[str] = set()
state_lock = asyncio.Lock()


class RequestModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class InfoRequest(RequestModel):
    url: str = Field(min_length=8, max_length=4096)


class DownloadRequest(InfoRequest):
    media_type: Literal["video", "audio"] = "video"
    quality: Literal["best", "1080p", "720p", "480p", "360p"] = "best"


class JobResponse(BaseModel):
    job_id: str
    status: Literal["queued", "downloading", "processing", "completed", "failed"]
    progress: float
    media_type: str
    quality: str
    title: str | None = None
    duration_seconds: int | None = None
    filename: str | None = None
    error: str | None = None
    created_at: float
    updated_at: float


def validate_public_http_url(value: str) -> str:
    """Reject non-HTTP schemes, URL credentials, and obvious SSRF targets.

    This is defense-in-depth, not a substitute for outbound network restrictions.
    """
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme.lower() not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only public HTTP/HTTPS URLs are supported.")
    if not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="The URL is invalid or must not contain credentials.")
    try:
        if parsed.port is not None and not (1 <= parsed.port <= 65535):
            raise HTTPException(status_code=400, detail="The URL port is invalid.")
    except ValueError:
        raise HTTPException(status_code=400, detail="The URL port is invalid.") from None

    hostname = parsed.hostname.rstrip(".").lower()
    if (
        hostname in {"localhost", "localhost.localdomain"}
        or hostname.endswith((".local", ".internal", ".localhost", ".test"))
    ):
        raise HTTPException(status_code=400, detail="Local or internal network addresses are not allowed.")

    try:
        try:
            addresses = [ipaddress.ip_address(hostname)]
        except ValueError:
            port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
            records = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
            addresses = [
                ipaddress.ip_address(record[4][0].split("%", 1)[0])
                for record in records
            ]
        if not addresses or any(not address.is_global for address in addresses):
            raise HTTPException(status_code=400, detail="The URL must resolve only to public IP addresses.")
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="The URL hostname could not be resolved.") from None
    except ValueError:
        raise HTTPException(status_code=400, detail="The URL hostname is invalid.") from None
    return value


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    configured = API_KEY
    if not configured or configured in {"change-me", "REPLACE_WITH_A_LONG_RANDOM_SECRET"}:
        raise HTTPException(status_code=503, detail="API_KEY is not configured with a production secret.")
    if not x_api_key or not hmac.compare_digest(x_api_key, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid API key.")


def common_ydl_options() -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "cachedir": False,
        "socket_timeout": SOCKET_TIMEOUT_SECONDS,
        "retries": 2,
        "fragment_retries": 2,
        "extractor_retries": 2,
        "overwrites": False,
        "ignoreerrors": False,
        # Prefer the public, extractor-provided rendition; there is no universal
        # cross-site option that can guarantee watermark-free output.
        "format_sort": ["res", "ext:mp4:m4a"],
        "js_runtimes": {"node": {}},
    }


def validate_media_info(info: dict) -> str | None:
    if info.get("is_live"):
        return "Live streams are not supported by this service."
    duration = info.get("duration")
    try:
        duration_num = float(duration) if duration is not None else None
    except (TypeError, ValueError):
        duration_num = None
    if duration_num is not None and duration_num > MAX_DURATION_SECONDS:
        return f"This media exceeds the server limit of {MAX_DURATION_SECONDS // 60} minutes."
    return None


def quality_format(media_type: str, quality: str) -> str:
    if media_type == "audio":
        return "bestaudio/best"
    if quality == "best":
        return "bestvideo*+bestaudio/best"
    height = int(quality.removesuffix("p"))
    # Cap both separate-stream and progressive fallback formats at the requested height.
    return f"bestvideo*[height<={height}]+bestaudio/best[height<={height}]"


def get_media_files(job_dir: Path, media_type: str) -> list[Path]:
    preferred = AUDIO_EXTENSIONS if media_type == "audio" else VIDEO_EXTENSIONS
    paths: list[Path] = []
    for path in job_dir.rglob("*"):
        if not path.is_file() or "temp" in path.parts:
            continue
        if path.suffix.lower() in MEDIA_EXTENSIONS and not path.name.endswith((".part", ".ytdl")):
            paths.append(path)
    paths.sort(key=lambda path: (path.suffix.lower() in preferred, path.stat().st_size), reverse=True)
    return paths


def public_job(job: dict) -> dict:
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": round(float(job.get("progress", 0.0)), 1),
        "media_type": job["media_type"],
        "quality": job["quality"],
        "title": job.get("title"),
        "duration_seconds": job.get("duration_seconds"),
        "filename": job.get("filename"),
        "error": job.get("error"),
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
    }


def _extract_info(url: str) -> dict:
    with yt_dlp.YoutubeDL(common_ydl_options()) as downloader:
        info = downloader.extract_info(url, download=False)
    if not info:
        raise DownloadError("The source did not return media information.")
    return info


async def cleanup_expired_jobs() -> None:
    expiry_seconds = FILE_TTL_MINUTES * 60
    now = time.time()
    async with state_lock:
        expired_ids = [
            job_id for job_id, job in jobs.items()
            if job_id not in active_jobs
            and now - job.get("updated_at", now) > expiry_seconds
        ]
        for job_id in expired_ids:
            job = jobs.pop(job_id, None)
            if job:
                directory = job.get("directory")
                if directory:
                    shutil.rmtree(directory, ignore_errors=True)


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(60)
        await cleanup_expired_jobs()


@asynccontextmanager
async def lifespan(_: FastAPI):
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # The job registry is in memory. Files from before a restart cannot be addressed safely.
    for stale_item in DOWNLOAD_DIR.iterdir():
        if stale_item.is_dir():
            shutil.rmtree(stale_item, ignore_errors=True)
        else:
            try:
                stale_item.unlink(missing_ok=True)
            except OSError:
                pass
    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description=(
        "API for downloading individual publicly accessible media from sites supported by yt-dlp. "
        "Use only for content you own or are authorized to download. Site support and watermark-free "
        "availability depend on the source; this API does not erase embedded watermarks."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if "*" in CORS_ORIGINS else CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
    max_age=600,
)


@app.get("/", tags=["service"])
async def root() -> dict:
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "api_auth": "X-API-Key required for /api/* endpoints",
        "supported_sites": "See yt-dlp's supported extractors; not every URL is guaranteed to work.",
    }


@app.get("/health", tags=["service"])
async def health() -> dict:
    return {
        "status": "ok",
        "version": APP_VERSION,
        "active_downloads": len(active_jobs),
        "max_active_downloads": MAX_ACTIVE_JOBS,
    }


@app.get("/api/capabilities", dependencies=[Depends(require_api_key)], tags=["service"])
async def capabilities() -> dict:
    return {
        "video": True,
        "audio_mp3": True,
        "qualities": ["best", "1080p", "720p", "480p", "360p"],
        "max_download_mb": MAX_DOWNLOAD_MB,
        "max_duration_seconds": MAX_DURATION_SECONDS,
        "max_active_jobs": MAX_ACTIVE_JOBS,
        "file_ttl_minutes": FILE_TTL_MINUTES,
        "supported_sites_reference": "https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md",
        "watermark_free": {
            "guaranteed": False,
            "note": "Uses the rendition returned by the source extractor. Some sources may expose an unwatermarked rendition; this API does not erase watermarks embedded in video frames.",
        },
    }


@app.post("/api/info", dependencies=[Depends(require_api_key)], tags=["media"])
async def media_info(request: InfoRequest) -> dict:
    url = await asyncio.to_thread(validate_public_http_url, request.url)
    try:
        info = await asyncio.to_thread(_extract_info, url)
        rejection = validate_media_info(info)
        if rejection:
            raise HTTPException(status_code=422, detail=rejection)
        return {
            "title": info.get("title"),
            "site": info.get("extractor_key") or info.get("extractor"),
            "duration_seconds": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
            "webpage_url": info.get("webpage_url") or url,
            "uploader": info.get("uploader"),
            "formats_available": len(info.get("formats") or []),
            "watermark_free_guaranteed": False,
        }
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc).strip() or "The site could not provide media information."
        raise HTTPException(status_code=422, detail=message[:350]) from None


async def update_progress(job_id: str, progress: float, state: str) -> None:
    async with state_lock:
        job = jobs.get(job_id)
        if job:
            job["progress"] = progress
            job["status"] = state
            job["updated_at"] = time.time()


def _download_sync(url: str, options: dict) -> dict:
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
    if not info:
        raise DownloadError("The source did not return a media file.")
    return info


async def run_download(job_id: str, request: DownloadRequest) -> None:
    job = jobs.get(job_id)
    if not job:
        async with state_lock:
            active_jobs.discard(job_id)
        return

    job_dir = Path(job["directory"])
    temp_dir = job_dir / "temp"
    loop = asyncio.get_running_loop()

    def progress_hook(data: dict) -> None:
        if data.get("status") == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            downloaded = data.get("downloaded_bytes", 0)
            percentage = min(98.0, downloaded * 100.0 / total) if total else 0.0
            loop.call_soon_threadsafe(
                lambda: asyncio.create_task(update_progress(job_id, percentage, "downloading"))
            )
        elif data.get("status") == "finished":
            loop.call_soon_threadsafe(
                lambda: asyncio.create_task(update_progress(job_id, 99.0, "processing"))
            )

    def match_filter(info: dict, *, incomplete: bool = False):
        return validate_media_info(info)

    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        temp_dir.mkdir(parents=True, exist_ok=True)
        options = common_ydl_options()
        options.update({
            "format": quality_format(request.media_type, request.quality),
            "outtmpl": str(job_dir / "%(title).100B [%(id)s].%(ext)s"),
            "paths": {"home": str(job_dir), "temp": str(temp_dir)},
            "max_filesize": MAX_DOWNLOAD_MB * 1024 * 1024,
            "merge_output_format": "mp4",
            "progress_hooks": [progress_hook],
            "match_filter": match_filter,
        })
        if request.media_type == "audio":
            options["postprocessors"] = [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }]

        async with state_lock:
            if job_id in jobs:
                jobs[job_id]["status"] = "downloading"
                jobs[job_id]["updated_at"] = time.time()

        info = await asyncio.to_thread(_download_sync, request.url, options)
        media_files = get_media_files(job_dir, request.media_type)
        if not media_files:
            raise RuntimeError("Download completed but no supported output file was found.")
        final_path = media_files[0]
        final_size = final_path.stat().st_size
        if final_size > MAX_DOWNLOAD_MB * 1024 * 1024:
            raise RuntimeError(f"The completed file exceeds the {MAX_DOWNLOAD_MB} MB server limit.")
        async with state_lock:
            current = jobs.get(job_id)
            if current:
                current.update({
                    "status": "completed",
                    "progress": 100.0,
                    "title": info.get("title") or final_path.stem,
                    "duration_seconds": info.get("duration"),
                    "filename": final_path.name,
                    "file_path": str(final_path),
                    "error": None,
                    "updated_at": time.time(),
                })
    except Exception as exc:
        # Keep API error messages concise; details are still visible in Render's server logs.
        raw_message = str(exc).strip()
        message = raw_message or "Download failed. Check that the URL is supported and public."
        if len(message) > 300:
            message = message[:297] + "..."
        async with state_lock:
            current = jobs.get(job_id)
            if current:
                current.update({
                    "status": "failed",
                    "error": message,
                    "progress": 0.0,
                    "updated_at": time.time(),
                })
        shutil.rmtree(job_dir, ignore_errors=True)
    finally:
        async with state_lock:
            active_jobs.discard(job_id)


@app.post(
    "/api/download",
    response_model=JobResponse,
    status_code=202,
    dependencies=[Depends(require_api_key)],
    tags=["media"],
)
async def start_download(request: DownloadRequest) -> dict:
    url = await asyncio.to_thread(validate_public_http_url, request.url)
    await cleanup_expired_jobs()
    async with state_lock:
        if len(active_jobs) >= MAX_ACTIVE_JOBS:
            raise HTTPException(
                status_code=429,
                detail=f"The server is busy. Maximum concurrent downloads: {MAX_ACTIVE_JOBS}.",
                headers={"Retry-After": "30"},
            )
        job_id = uuid.uuid4().hex
        job_dir = DOWNLOAD_DIR / job_id
        now = time.time()
        job = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0.0,
            "media_type": request.media_type,
            "quality": request.quality,
            "title": None,
            "duration_seconds": None,
            "filename": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
            "directory": str(job_dir),
            "file_path": None,
        }
        jobs[job_id] = job
        active_jobs.add(job_id)
        asyncio.create_task(run_download(job_id, request.model_copy(update={"url": url})))
    return public_job(job)


@app.get("/api/jobs/{job_id}", response_model=JobResponse, dependencies=[Depends(require_api_key)], tags=["jobs"])
async def get_job(job_id: str) -> dict:
    await cleanup_expired_jobs()
    async with state_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found or its temporary files have expired.")
        return public_job(job)


@app.get("/api/jobs/{job_id}/file", dependencies=[Depends(require_api_key)], tags=["jobs"])
async def get_download_file(job_id: str) -> FileResponse:
    await cleanup_expired_jobs()
    async with state_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found or its temporary files have expired.")
        if job["status"] != "completed" or not job.get("file_path"):
            raise HTTPException(status_code=409, detail=f"File is not ready. Current status: {job['status']}.")
        path = Path(job["file_path"]).resolve()
        try:
            path.relative_to(DOWNLOAD_DIR)
        except ValueError:
            raise HTTPException(status_code=404, detail="File not found.") from None
        if not path.is_file():
            raise HTTPException(status_code=410, detail="The temporary file has expired.")

        suffix = path.suffix.lower()
        media_type = {
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".aac": "audio/aac",
            ".opus": "audio/opus",
            ".ogg": "audio/ogg",
            ".wav": "audio/wav",
            ".flac": "audio/flac",
            ".mp4": "video/mp4",
            ".m4v": "video/x-m4v",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mkv": "video/x-matroska",
            ".avi": "video/x-msvideo",
        }.get(suffix, "application/octet-stream")
        filename = path.name
    return FileResponse(path=path, filename=filename, media_type=media_type)


@app.delete("/api/jobs/{job_id}", dependencies=[Depends(require_api_key)], tags=["jobs"])
async def delete_job(job_id: str) -> dict:
    async with state_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        if job_id in active_jobs:
            raise HTTPException(status_code=409, detail="An active download cannot be deleted yet.")
        jobs.pop(job_id, None)
    directory = job.get("directory")
    if directory:
        shutil.rmtree(directory, ignore_errors=True)
    return {"deleted": True, "job_id": job_id}
