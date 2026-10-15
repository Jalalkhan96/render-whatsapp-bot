"""Pydantic v2 request/response models for the HTTP API."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    ANALYZING = "analyzing"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class AnalyzeRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)


class FormatInfo(BaseModel):
    format_id: str
    ext: str
    resolution: str | None = None
    filesize: int | None = None
    has_audio: bool = False
    has_video: bool = False
    fps: float | None = None
    note: str | None = None


class PresetInfo(BaseModel):
    id: str
    label: str
    format_selector: str | None = None  # yt-dlp -f selector
    audio_only: bool = False
    target_ext: str | None = None  # e.g. "mp3" when post-processing decides the container


class PlaylistEntry(BaseModel):
    id: str | None = None
    title: str | None = None
    url: str | None = None
    duration: float | None = None


class AnalyzeResponse(BaseModel):
    title: str | None = None
    thumbnail: str | None = None
    duration: float | None = None
    uploader: str | None = None
    platform: str = "generic"
    webpage_url: str | None = None
    formats: list[FormatInfo] = []
    presets: list[PresetInfo] = []
    is_playlist: bool = False
    playlist_entries: list[PlaylistEntry] = []
    stage_used: str = "ytdlp-default"


class DownloadRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    format_id: str | None = Field(default=None, max_length=128)
    preset: str | None = Field(default=None, max_length=64)
    audio_only: bool = False
    subtitles: bool = False
    embed_thumbnail: bool = False


class JobAccepted(BaseModel):
    job_id: str


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0  # 0-100
    speed: str | None = None
    eta: str | None = None
    error: str | None = None
    stage_used: str | None = None
    filename: str | None = None
    title: str | None = None


class HealthResponse(BaseModel):
    status: str
    ytdlp_version: str | None = None
    ffmpeg: bool = False
    ffprobe: bool = False
    deno: bool = False
    redis: bool = False


class CookieUploadResponse(BaseModel):
    domain: str
    path: str


class ApiInfoResponse(BaseModel):
    name: str = "Universal Video Downloader"
    version: str = "1.0.0"
    public_base_url: str | None = None
    docs_url: str | None = None
    openapi_url: str = "/openapi.json"
    health_url: str = "/health"
    auth_required: bool = False
