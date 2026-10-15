"""yt-dlp helpers: format cleaning, presets, progress hooks, option building."""
from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable

from app.schemas import FormatInfo, PlaylistEntry, PresetInfo

log = logging.getLogger("uvd.downloader")

# Preset id -> (label, yt-dlp format selector, audio_only, target_ext)
PRESETS: dict[str, tuple[str, str | None, bool, str | None]] = {
    "best_mp4": (
        "Best video (MP4)", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b", False, None,
    ),
    "1080p": (
        "1080p", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
        False, None,
    ),
    "720p": (
        "720p", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b",
        False, None,
    ),
    "480p": (
        "480p", "bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=480]/b",
        False, None,
    ),
    "audio_mp3": ("Audio only (MP3)", "bestaudio/b", True, "mp3"),
    "audio_m4a": ("Audio only (M4A)", "bestaudio[ext=m4a]/bestaudio", True, "m4a"),
}

DEFAULT_SELECTOR = "bv*+ba/b"  # best video + best audio, merged


def clean_formats(info: dict[str, Any]) -> list[FormatInfo]:
    """Reduce yt-dlp's raw format list to what the UI needs."""
    out: list[FormatInfo] = []
    for f in info.get("formats") or []:
        if not f.get("url"):
            continue
        vcodec, acodec = f.get("vcodec"), f.get("acodec")
        has_video = bool(vcodec and vcodec != "none")
        has_audio = bool(acodec and acodec != "none")
        if not (has_video or has_audio):
            continue  # e.g. storyboard / metadata-only entries
        height, width = f.get("height"), f.get("width")
        if width and height:
            resolution = f"{width}x{height}"
        elif height:
            resolution = f"{height}p"
        else:
            resolution = None
        note = (f.get("format_note") or "")[:60] or None
        out.append(FormatInfo(
            format_id=str(f.get("format_id")),
            ext=str(f.get("ext") or "mp4"),
            resolution=resolution,
            filesize=f.get("filesize") or f.get("filesize_approx"),
            has_audio=has_audio,
            has_video=has_video,
            fps=f.get("fps"),
            note=note,
        ))

    def sort_key(fmt: FormatInfo) -> tuple[int, int, int]:
        height_px = 0
        if fmt.resolution and fmt.resolution.endswith("p"):
            try:
                height_px = int(fmt.resolution[:-1])
            except ValueError:
                height_px = 0
        both = 0 if (fmt.has_video and fmt.has_audio) else 1
        return (both, -height_px, -(fmt.filesize or 0))

    out.sort(key=sort_key)
    # cap the list so the UI stays usable on format-rich sites
    return out[:40]


def build_presets() -> list[PresetInfo]:
    return [
        PresetInfo(id=pid, label=label, format_selector=sel,
                   audio_only=audio_only, target_ext=target_ext)
        for pid, (label, sel, audio_only, target_ext) in PRESETS.items()
    ]


def resolve_download_options(
    preset: str | None, format_id: str | None, audio_only: bool
) -> tuple[str, bool, str | None]:
    """Return (format_selector, audio_only, target_ext) for a download request."""
    if preset:
        if preset not in PRESETS:
            raise ValueError(f"Unknown preset: {preset!r}")
        _label, selector, p_audio_only, target_ext = PRESETS[preset]
        return selector or DEFAULT_SELECTOR, p_audio_only or audio_only, target_ext
    if format_id:
        return format_id, audio_only, None
    return DEFAULT_SELECTOR, audio_only, None


def build_ydl_opts(
    *,
    format_selector: str,
    audio_only: bool,
    target_ext: str | None,
    subtitles: bool,
    embed_thumbnail: bool,
    tmpdir: Path,
    proxy: str | None,
    progress_hook: Callable[[dict], None] | None,
) -> dict:
    """Assemble the yt-dlp params for a download job (merged over stage opts)."""
    postprocessors: list[dict] = []
    if audio_only and target_ext == "mp3":
        postprocessors.append({
            "key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192",
        })
    if embed_thumbnail:
        postprocessors.append({"key": "EmbedThumbnail"})
    if subtitles:
        # let yt-dlp write subs, then embed them into the mp4
        postprocessors.append({"key": "FFmpegEmbedSubtitle"})

    return {
        "format": format_selector,
        "outtmpl": str(tmpdir / "%(title)s [%(id)s].%(ext)s"),
        "merge_output_format": "mp4",
        "noplaylist": True,
        "progress_hooks": [progress_hook] if progress_hook else [],
        "postprocessors": postprocessors,
        "writesubtitles": subtitles,
        "writeautomaticsub": False,
        "subtitleslangs": ["en.*", "en"],
        "writethumbnail": embed_thumbnail,
        "proxy": proxy,
        "continuedl": True,
    }


def playlist_entries(info: dict[str, Any], limit: int = 50) -> list[PlaylistEntry]:
    """Extract up to `limit` entries when the URL turned out to be a playlist."""
    entries: list[PlaylistEntry] = []
    for e in (info.get("entries") or [])[:limit]:
        if not isinstance(e, dict):
            continue
        entries.append(PlaylistEntry(
            id=e.get("id"),
            title=e.get("title"),
            url=e.get("webpage_url") or e.get("url"),
            duration=e.get("duration"),
        ))
    return entries


def is_playlist(info: dict[str, Any]) -> bool:
    return info.get("_type") == "playlist"


# ---------------------------------------------------------------------------
# Runtime checks / maintenance
# ---------------------------------------------------------------------------

def get_ytdlp_version() -> str | None:
    try:
        import yt_dlp

        return yt_dlp.version.__version__
    except Exception:  # noqa: BLE001
        return None


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def deno_available() -> bool:
    from app.config import get_settings

    path = get_settings().DENO_PATH
    return shutil.which(path) is not None


def update_yt_dlp() -> bool:
    """`pip install -U yt-dlp` via arg list (no shell). Keeps current on failure."""
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", "yt-dlp"],
            capture_output=True, timeout=300, check=True,
        )
        log.info("yt-dlp updated to %s", get_ytdlp_version())
        return True
    except Exception as exc:  # noqa: BLE001
        log.warning("yt-dlp auto-update failed, keeping current version: %s", exc)
        return False
