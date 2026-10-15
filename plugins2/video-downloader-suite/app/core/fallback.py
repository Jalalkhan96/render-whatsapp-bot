"""The fallback chain: try download strategies in order, log which one worked.

Order (core requirement):
  1. yt-dlp, default extractor
  2. yt-dlp + browser impersonation (--impersonate chrome via curl_cffi)
  3. yt-dlp + cookies file for the domain (skipped when no file exists)
  4. yt-dlp + generic extractor (force_generic_extractor)
  5. gallery-dl (image posts / carousels / galleries)
  5b. general extractors: direct media-URL scraping for mainstream sites
      (TikTok, Reddit, Instagram via app/extractors/general) — runs only
      when a general extractor matches the URL, skipped otherwise
  6. Playwright: load the page in headless Chromium, sniff network responses
     for media URLs (.mp4/.webm/.m3u8/.mpd), then fetch the best one via
     yt-dlp (or ffmpeg for HLS).

Both analyze and download go through the same chain so the UI preview and the
actual fetch behave consistently. When every stage fails, a DownloadError with
a plain-language likely-cause message is raised.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from app.config import get_settings
from app.core.platforms import get_platform_opts, platform_hint
from app.core.security import assert_url_safe, cookie_path_for_domain

log = logging.getLogger("uvd.fallback")

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

YTDLP_STAGES = ("ytdlp-default", "ytdlp-impersonate", "ytdlp-cookies", "ytdlp-generic")


class DownloadError(Exception):
    """User-friendly failure. `cause` holds the raw stage details for logs."""

    def __init__(self, message: str, *, cause: str = "", stage: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.cause = cause
        self.stage = stage


@dataclass
class Attempt:
    stage: str
    ok: bool
    detail: str = ""


# ---------------------------------------------------------------------------
# yt-dlp stages 1-4
# ---------------------------------------------------------------------------

def base_ydl_opts() -> dict:
    """Defaults shared by every yt-dlp stage. Never pass user input to a shell:
    everything goes through the yt-dlp Python API or subprocess arg lists."""
    settings = get_settings()
    js_runtime: dict = {"deno": {}}
    if settings.DENO_PATH != "deno":
        js_runtime = {"deno": {"path": settings.DENO_PATH}}
    return {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 2,
        "fragment_retries": 2,
        "nocheckcertificate": False,
        # Deno solves YouTube-style JS challenges (n-param deciphering).
        "js_runtimes": js_runtime,
    }


def stage_opts(stage: str, url: str, base: dict) -> dict | None:
    """yt-dlp options for one stage. None => stage not applicable (skip it)."""
    settings = get_settings()
    opts = dict(base)
    if stage == "ytdlp-default":
        return opts
    if stage == "ytdlp-impersonate":
        # curl_cffi TLS/JA3 fingerprint of real Chrome; defeats many bot walls.
        opts["impersonate"] = "chrome"
        return opts
    if stage == "ytdlp-cookies":
        cookie_file = cookie_path_for_domain(urlparse(url).hostname or "", settings.COOKIES_DIR)
        if not cookie_file.exists():
            return None
        opts["cookiefile"] = str(cookie_file)
        return opts
    if stage == "ytdlp-generic":
        opts["force_generic_extractor"] = True
        return opts
    raise ValueError(f"unknown yt-dlp stage: {stage}")


def _extract_info(url: str, opts: dict, download: bool):
    """Thin wrapper so tests can monkeypatch a single seam. Lazy import keeps
    API startup fast when yt-dlp isn't needed yet."""
    import yt_dlp

    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=download)


def _try_ytdlp_stage(url: str, stage: str, opts: dict, *, download: bool):
    """Run one yt-dlp stage. Returns (info, opts) or raises."""
    return _extract_info(url, opts, download), opts


# ---------------------------------------------------------------------------
# Stage 5: gallery-dl
# ---------------------------------------------------------------------------

def _gallerydl_exe() -> str | None:
    return shutil.which("gallery-dl")


def gallerydl_analyze(url: str, timeout: int = 60) -> dict:
    """`gallery-dl -j <url>` -> synthetic info dict. Raises on failure."""
    exe = _gallerydl_exe()
    if not exe:
        raise DownloadError("gallery-dl is not installed in this image.")
    proc = subprocess.run(
        [exe, "--dump-json", url],  # arg list: no shell involved
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        raise DownloadError(f"gallery-dl found nothing usable: {proc.stderr.strip()[:300]}")
    try:
        items = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise DownloadError(f"gallery-dl returned unparsable metadata: {exc}") from exc
    if not items:
        raise DownloadError("gallery-dl returned empty metadata.")
    first = items[0] if isinstance(items, list) else items
    media_urls = [
        it.get("file") or it.get("url")
        for it in (items if isinstance(items, list) else [items])
        if isinstance(it, dict) and (it.get("file") or it.get("url"))
    ]
    return {
        "title": first.get("title") or first.get("description") or url,
        "thumbnail": first.get("thumbnail") or None,
        "uploader": first.get("uploader") or first.get("author"),
        "webpage_url": url,
        "_gallerydl": True,
        "_media_urls": media_urls[:50],
        "formats": [],
    }


def gallerydl_download(url: str, dest: Path, timeout: int = 600) -> list[Path]:
    """Download a gallery into `dest`. Returns the downloaded media files."""
    exe = _gallerydl_exe()
    if not exe:
        raise DownloadError("gallery-dl is not installed in this image.")
    proc = subprocess.run(
        [exe, "-d", str(dest), "--no-mtime", url],
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        raise DownloadError(f"gallery-dl download failed: {proc.stderr.strip()[:300]}")
    files = [p for p in dest.rglob("*") if p.is_file() and p.suffix.lower() in
             {".mp4", ".webm", ".mov", ".mkv", ".m4v", ".jpg", ".jpeg", ".png", ".webp", ".gif"}]
    if not files:
        raise DownloadError("gallery-dl finished but produced no media files.")
    return sorted(files, key=lambda p: p.stat().st_size, reverse=True)


# ---------------------------------------------------------------------------
# Stage 5b: general extractors (TikTok / Reddit / Instagram direct scraping)
# ---------------------------------------------------------------------------

def general_extractors_analyze(url: str) -> dict:
    """Run the general site extractors -> synthetic info dict.

    Raises DownloadError("skipped: ...") when no general extractor matches the
    URL, so the chain moves on instead of failing. Lazy import keeps API
    startup fast and curl_cffi out of the module import path.
    """
    from app.extractors.general import (GeneralExtractionError, extract,
                                        match_extractor)

    if match_extractor(url) is None:
        raise DownloadError("skipped: no general extractor supports this URL")
    try:
        result = extract(url)
    except GeneralExtractionError as exc:
        raise DownloadError(str(exc)) from exc
    return {
        "title": result.get("title") or url,
        "thumbnail": result.get("thumbnail"),
        "duration": result.get("duration"),
        "uploader": None,
        "webpage_url": result.get("webpage_url") or url,
        "_general": True,
        "_media_urls": [d["url"] for d in result["direct_urls"]][:50],
        "formats": [
            {"format_id": f"general-{i}", "url": d["url"], "ext": d["ext"],
             "vcodec": "h264" if d["ext"] == "mp4" else None,
             "acodec": "aac" if d["ext"] == "mp4" else None}
            for i, d in enumerate(result["direct_urls"])
        ],
    }


# ---------------------------------------------------------------------------
# Stage 6: Playwright network sniffing
# ---------------------------------------------------------------------------

_MEDIA_EXTS = (".mp4", ".webm", ".mov", ".m4v")


def sniff_media_url(url: str, timeout: int = 60) -> tuple[str, str, str]:
    """Open the page in headless Chromium and capture media network responses.

    Returns (media_url, kind, page_title) where kind is one of
    "direct" (.mp4/.webm), "hls" (.m3u8) or "dash" (.mpd). The best candidate
    wins: largest direct file, otherwise HLS, otherwise DASH.
    Every candidate URL is SSRF-checked before it is returned.
    """
    from playwright.sync_api import sync_playwright

    candidates: list[tuple[str, str, int]] = []  # (url, kind, size)
    title = ""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = browser.new_page(user_agent=CHROME_UA)
            page.set_default_timeout(timeout * 1000)

            def on_response(resp) -> None:
                try:
                    u = resp.url
                    ctype = (resp.headers.get("content-type") or "").lower()
                    if u.endswith(".m3u8") or "mpegurl" in ctype:
                        candidates.append((u, "hls", 0))
                    elif u.endswith(".mpd") or "dash+xml" in ctype:
                        candidates.append((u, "dash", 0))
                    elif u.lower().split("?")[0].endswith(_MEDIA_EXTS) or ctype.startswith("video/"):
                        try:
                            size = int(resp.headers.get("content-length") or 0)
                        except ValueError:
                            size = 0
                        # skip tiny tracking pixels / previews
                        if size >= 50_000 or u.lower().split("?")[0].endswith(_MEDIA_EXTS):
                            candidates.append((u, "direct", size))
                except Exception:  # never let a bad response kill the listener
                    pass

            page.on("response", on_response)
            page.goto(url, wait_until="domcontentloaded")
            # let lazy players fire their requests
            page.wait_for_timeout(5000)
            try:
                title = page.title()
            except Exception:
                title = ""
        finally:
            browser.close()

    # Deduplicate, keep the biggest size seen per URL.
    best: dict[str, tuple[str, int]] = {}
    for u, kind, size in candidates:
        if u not in best or size > best[u][1]:
            best[u] = (kind, size)
    if not best:
        raise DownloadError("Playwright loaded the page but saw no video traffic.")

    def rank(item: tuple[str, tuple[str, int]]) -> tuple[int, int]:
        kind, size = item[1]
        order = {"direct": 0, "hls": 1, "dash": 2}[kind]
        return (order, -size)

    media_url, (kind, _size) = sorted(best.items(), key=rank)[0]
    assert_url_safe(media_url)  # SSRF gate on the discovered URL
    log.info("playwright sniffed %s media: %s", kind, media_url[:120])
    return media_url, kind, title


def _ffmpeg_download(media_url: str, dest: Path, timeout: int = 600) -> Path:
    """Direct HLS copy via ffmpeg (no re-encode). Arg list, no shell."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise DownloadError("ffmpeg is not installed; cannot fetch HLS stream.")
    out = dest / "sniffed.mp4"
    proc = subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
         "-i", media_url, "-c", "copy", str(out)],
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0 or not out.exists():
        raise DownloadError(f"ffmpeg HLS fetch failed: {proc.stderr.strip()[:300]}")
    return out


# ---------------------------------------------------------------------------
# Chains
# ---------------------------------------------------------------------------

def analyze_with_fallback(url: str, extra_opts: dict | None = None) -> tuple[dict, str, list[Attempt]]:
    """Run the analyze chain. Returns (info_dict, stage_name, attempts)."""
    attempts: list[Attempt] = []
    merged = {**base_ydl_opts(), **get_platform_opts(url), **(extra_opts or {})}
    merged["playlistend"] = 50  # never pull more entries than we show

    for stage in YTDLP_STAGES:
        opts = stage_opts(stage, url, merged)
        if opts is None:
            attempts.append(Attempt(stage, False, "skipped: no cookies file for this domain"))
            continue
        try:
            info = _try_ytdlp_stage(url, stage, {**opts, "skip_download": True}, download=False)[0]
            if not info:
                raise DownloadError("extractor returned no info")
            attempts.append(Attempt(stage, True))
            log.info("analyze succeeded at stage %s for %s", stage, url)
            return info, stage, attempts
        except Exception as exc:  # noqa: BLE001 - every stage must be survivable
            attempts.append(Attempt(stage, False, str(exc)[:300]))
            log.info("analyze stage %s failed for %s: %s", stage, url, str(exc)[:200])

    # Stage 5: gallery-dl
    try:
        info = gallerydl_analyze(url)
        attempts.append(Attempt("gallery-dl", True))
        log.info("analyze succeeded at stage gallery-dl for %s", url)
        return info, "gallery-dl", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("gallery-dl", False, str(exc)[:300]))

    # Stage 5b: general extractors (tiktok / reddit / instagram)
    try:
        info = general_extractors_analyze(url)
        attempts.append(Attempt("general-extractors", True))
        log.info("analyze succeeded at stage general-extractors for %s", url)
        return info, "general-extractors", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("general-extractors", False, str(exc)[:300]))

    # Stage 6: playwright sniff -> synthetic info
    try:
        media_url, kind, title = sniff_media_url(url)
        ext = {"direct": "mp4", "hls": "mp4", "dash": "mp4"}[kind]
        info = {
            "title": title or url,
            "webpage_url": url,
            "_sniffed": True,
            "_media_url": media_url,
            "_media_kind": kind,
            "formats": [{"format_id": "sniffed", "url": media_url, "ext": ext,
                         "vcodec": "h264", "acodec": "aac"}],
        }
        attempts.append(Attempt("playwright-sniff", True))
        log.info("analyze succeeded at stage playwright-sniff for %s", url)
        return info, "playwright-sniff", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("playwright-sniff", False, str(exc)[:300]))

    raise friendly_error(url, attempts)


def download_with_fallback(
    url: str,
    ydl_opts: dict,
    tmpdir: Path,
    *,
    timeout: int = 600,
) -> tuple[dict, str, list[Attempt]]:
    """Run the download chain into `tmpdir`. Returns (info, stage, attempts).

    `ydl_opts` already contains outtmpl/progress hooks/postprocessors; each
    yt-dlp stage merges its own tweaks on top.
    """
    attempts: list[Attempt] = []
    merged = {**base_ydl_opts(), **get_platform_opts(url), **ydl_opts}

    for stage in YTDLP_STAGES:
        opts = stage_opts(stage, url, merged)
        if opts is None:
            attempts.append(Attempt(stage, False, "skipped: no cookies file for this domain"))
            continue
        try:
            info = _try_ytdlp_stage(url, stage, {**opts, "noplaylist": True}, download=True)[0]
            if not info:
                raise DownloadError("extractor downloaded nothing")
            attempts.append(Attempt(stage, True))
            log.info("download succeeded at stage %s for %s", stage, url)
            return info, stage, attempts
        except Exception as exc:  # noqa: BLE001
            attempts.append(Attempt(stage, False, str(exc)[:300]))
            log.info("download stage %s failed for %s: %s", stage, url, str(exc)[:200])

    # Stage 5: gallery-dl downloads straight to disk
    try:
        files = gallerydl_download(url, tmpdir, timeout=timeout)
        src = files[0]
        info = {"title": src.stem, "webpage_url": url, "_gallerydl": True,
                "_downloaded_file": str(src), "ext": src.suffix.lstrip(".")}
        attempts.append(Attempt("gallery-dl", True))
        log.info("download succeeded at stage gallery-dl for %s", url)
        return info, "gallery-dl", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("gallery-dl", False, str(exc)[:300]))

    # Stage 5b: general extractors — fetch the best direct URL via yt-dlp's
    # generic path (handles mp4/webm directly and HLS/DASH manifests natively).
    try:
        info = general_extractors_analyze(url)
        media_urls = info.get("_media_urls") or []
        if not media_urls:
            raise DownloadError("general extractors found no media URLs")
        dinfo = _try_ytdlp_stage(
            media_urls[0], "general-extractors",
            {**merged, "force_generic_extractor": True}, download=True)[0]
        dinfo = dinfo or {}
        dinfo.setdefault("title", info.get("title") or url)
        dinfo["webpage_url"] = url
        dinfo["_general"] = True
        attempts.append(Attempt("general-extractors", True))
        log.info("download succeeded at stage general-extractors for %s", url)
        return dinfo, "general-extractors", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("general-extractors", False, str(exc)[:300]))

    # Stage 6: sniff the media URL, then fetch it
    try:
        media_url, kind, title = sniff_media_url(url)
        if kind == "hls":
            # yt-dlp handles HLS fine, but a raw ffmpeg copy is faster and
            # simpler; fall back to yt-dlp if ffmpeg chokes on the playlist.
            try:
                out = _ffmpeg_download(media_url, tmpdir, timeout=timeout)
            except DownloadError:
                info = _try_ytdlp_stage(
                    media_url, "playwright-sniff",
                    {**merged, "force_generic_extractor": True}, download=True)[0]
                out = None
        else:  # direct mp4/webm or DASH: yt-dlp's generic path (DASH needs its merger)
            info = _try_ytdlp_stage(
                media_url, "playwright-sniff",
                {**merged, "force_generic_extractor": True}, download=True)[0]
            out = None
        info = info or {}
        info.setdefault("title", title or url)
        info["webpage_url"] = url
        info["_sniffed"] = True
        if out is not None:
            info["_downloaded_file"] = str(out)
            info["ext"] = "mp4"
        attempts.append(Attempt("playwright-sniff", True))
        log.info("download succeeded at stage playwright-sniff for %s", url)
        return info, "playwright-sniff", attempts
    except Exception as exc:  # noqa: BLE001
        attempts.append(Attempt("playwright-sniff", False, str(exc)[:300]))

    raise friendly_error(url, attempts)


# ---------------------------------------------------------------------------
# Friendly errors
# ---------------------------------------------------------------------------

def friendly_error(url: str, attempts: list[Attempt]) -> DownloadError:
    """Map raw stage failures to a plain-language likely cause."""
    # Skipped stages (e.g. "no cookies file") are not failures; including them
    # would let the word "cookies" false-trigger the login-walled branch below.
    failures = [a for a in attempts if not a.ok and not a.detail.startswith("skipped")]
    details = " | ".join(f"{a.stage}: {a.detail}" for a in failures)
    low = details.lower()
    hint = platform_hint(url)
    hint = f" {hint}" if hint else ""

    if any(k in low for k in ("private video", "private", "login required", "log in", "sign in to confirm", "cookies")):
        message = ("This looks like private or login-walled content. "
                   "If you have access, upload cookies for the site and try again." + hint)
    elif "drm" in low:
        message = "This video is DRM-protected and cannot be downloaded by any tool."
    elif any(k in low for k in ("http error 403", "403", "forbidden", "perimeter", "captcha", "not a bot", "bot")):
        message = ("The site blocked the request (bot protection / HTTP 403). "
                   "Uploading fresh cookies for the site often fixes this." + hint)
    elif "http error 429" in low or "rate-limit" in low or "too many requests" in low:
        message = "The site is rate-limiting this server. Wait a few minutes and try again."
    elif any(k in low for k in ("unsupported url", "no video", "no media")):
        message = "No downloadable video was found at this link (unsupported page or no media)."
    elif any(k in low for k in ("geo", "country", "region", "location")):
        message = "This video is geo-blocked for the server's region. A proxy in an allowed region may help."
    elif "http error 404" in low or "not found" in low or "removed" in low or "deleted" in low:
        message = "The link looks dead: the video was removed or the URL is wrong."
    elif "timed out" in low or "timeout" in low:
        message = "The site took too long to respond. Try again in a bit."
    else:
        message = "All download methods failed for this link." + hint
    return DownloadError(message, cause=details)
