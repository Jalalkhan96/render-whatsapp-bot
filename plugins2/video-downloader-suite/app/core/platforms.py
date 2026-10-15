"""Platform registry: domain -> yt-dlp option overrides.

Add a new platform by adding one entry here; core download logic never changes.
Each entry:
  - name: human-readable platform label
  - ydl_opts: extra yt_dlp.YoutubeDL params merged under stage/job options
  - requires_cookies: hint shown when a download fails (private content)
  - notes: short operator-facing note
"""
from __future__ import annotations

from urllib.parse import urlparse

PLATFORM_CONFIGS: dict[str, dict] = {
    "youtube.com": {
        "name": "YouTube",
        # Deno solves YouTube's JS challenges (n-parameter deciphering).
        # Age-gated videos additionally need cookies (see README).
        "ydl_opts": {"js_runtimes": {"deno": {}}},
        "requires_cookies": False,
        "notes": "Age-restricted videos need a youtube.com cookies file.",
    },
    "youtu.be": {
        "name": "YouTube",
        "ydl_opts": {"js_runtimes": {"deno": {}}},
        "requires_cookies": False,
        "notes": "Short-link domain for YouTube.",
    },
    "tiktok.com": {
        "name": "TikTok",
        # yt-dlp's TikTok extractor prefers the no-watermark API variant;
        # impersonation defeats most bot checks.
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": False,
        "notes": "No-watermark variant is used when the API exposes it.",
    },
    "instagram.com": {
        "name": "Instagram",
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": True,
        "notes": "Reels/posts/stories/carousels. Private content needs instagram.com cookies.",
    },
    "reddit.com": {
        "name": "Reddit",
        # Reddit serves separate video/audio streams; yt-dlp merges them with ffmpeg.
        "ydl_opts": {"merge_output_format": "mp4"},
        "requires_cookies": False,
        "notes": "v.redd.it streams are merged with ffmpeg.",
    },
    "x.com": {
        "name": "X (Twitter)",
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": False,
        "notes": "",
    },
    "twitter.com": {
        "name": "X (Twitter)",
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": False,
        "notes": "",
    },
    "facebook.com": {
        "name": "Facebook",
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": True,
        "notes": "Public videos usually work; private groups need facebook.com cookies.",
    },
    "fb.watch": {
        "name": "Facebook",
        "ydl_opts": {"impersonate": "chrome"},
        "requires_cookies": True,
        "notes": "",
    },
    "vimeo.com": {
        "name": "Vimeo",
        "ydl_opts": {},
        "requires_cookies": False,
        "notes": "",
    },
    "twitch.tv": {
        "name": "Twitch",
        "ydl_opts": {},
        "requires_cookies": False,
        "notes": "Clips and VODs. Live streams are not supported.",
    },
    "dailymotion.com": {
        "name": "Dailymotion",
        "ydl_opts": {},
        "requires_cookies": False,
        "notes": "",
    },
}


def _domain_key(hostname: str) -> str | None:
    """Find the longest matching registry key for a hostname."""
    host = hostname.lower()
    best: str | None = None
    for key in PLATFORM_CONFIGS:
        if host == key or host.endswith("." + key):
            if best is None or len(key) > len(best):
                best = key
    return best


def match_platform(url: str) -> tuple[str, dict]:
    """Return (platform_name, config_dict) for a URL; ('generic', {}) when unknown."""
    hostname = urlparse(url).hostname or ""
    key = _domain_key(hostname)
    if key is None:
        return "generic", {"name": "generic", "ydl_opts": {}, "requires_cookies": False, "notes": ""}
    cfg = PLATFORM_CONFIGS[key]
    return cfg["name"], cfg


def get_platform_opts(url: str) -> dict:
    """Just the yt-dlp option overrides for a URL."""
    _, cfg = match_platform(url)
    return dict(cfg.get("ydl_opts", {}))


def platform_hint(url: str) -> str:
    """User-facing hint appended to cookie-related failures."""
    _, cfg = match_platform(url)
    if cfg.get("requires_cookies"):
        return (
            f"{cfg['name']} often needs login cookies for this content. "
            "Upload a cookies file for the site (see README) and retry."
        )
    return cfg.get("notes", "")
