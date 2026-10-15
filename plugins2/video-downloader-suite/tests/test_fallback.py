"""Tests: fallback chain order (stages mocked), cookie skip, friendly errors.

yt-dlp / gallery-dl / playwright are never touched here: the chain's seams
(_try_ytdlp_stage, gallerydl_analyze, sniff_media_url) are monkeypatched.
"""
import pytest

from app.core import fallback
from app.core.fallback import (
    Attempt,
    DownloadError,
    analyze_with_fallback,
    friendly_error,
    stage_opts,
    base_ydl_opts,
)


def _boom(url, stage, opts, *, download):
    raise RuntimeError("stage exploded")


def test_chain_tries_stages_in_order(monkeypatch):
    calls: list[str] = []

    def fake_stage(url, stage, opts, *, download):
        calls.append(stage)
        if stage == "ytdlp-generic":
            return ({"title": "ok", "formats": []}, opts)
        raise RuntimeError("nope")

    monkeypatch.setattr(fallback, "_try_ytdlp_stage", fake_stage)
    monkeypatch.setattr(fallback, "gallerydl_analyze", _boom)
    monkeypatch.setattr(fallback, "sniff_media_url", _boom)

    info, stage, attempts = analyze_with_fallback("https://example.com/v/1")
    assert stage == "ytdlp-generic"
    assert info["title"] == "ok"
    # cookie stage is skipped (no cookie file), the rest ran in order
    ran = [a.stage for a in attempts if a.detail != "skipped: no cookies file for this domain"]
    assert ran == ["ytdlp-default", "ytdlp-impersonate", "ytdlp-generic"]
    assert calls == ["ytdlp-default", "ytdlp-impersonate", "ytdlp-generic"]
    assert all(not a.ok for a in attempts if a.stage != "ytdlp-generic")


def test_chain_falls_through_to_gallerydl(monkeypatch):
    monkeypatch.setattr(fallback, "_try_ytdlp_stage", _boom)
    monkeypatch.setattr(fallback, "gallerydl_analyze",
                        lambda url, timeout=60: {"title": "gallery", "formats": []})
    monkeypatch.setattr(fallback, "sniff_media_url", _boom)
    info, stage, _ = analyze_with_fallback("https://example.com/v/1")
    assert stage == "gallery-dl"
    assert info["title"] == "gallery"


def test_chain_falls_through_to_playwright(monkeypatch):
    monkeypatch.setattr(fallback, "_try_ytdlp_stage", _boom)
    monkeypatch.setattr(fallback, "gallerydl_analyze", _boom)
    monkeypatch.setattr(
        fallback, "sniff_media_url",
        lambda url, timeout=60: ("https://cdn.example.com/v.mp4", "direct", "Sniffed title"),
    )
    info, stage, _ = analyze_with_fallback("https://example.com/v/1")
    assert stage == "playwright-sniff"
    assert info["_media_url"] == "https://cdn.example.com/v.mp4"
    assert info["formats"][0]["format_id"] == "sniffed"


def test_chain_all_fail_raises_friendly(monkeypatch):
    monkeypatch.setattr(fallback, "_try_ytdlp_stage", _boom)
    monkeypatch.setattr(fallback, "gallerydl_analyze", _boom)
    monkeypatch.setattr(fallback, "sniff_media_url", _boom)
    with pytest.raises(DownloadError) as excinfo:
        analyze_with_fallback("https://example.com/v/1")
    assert "All download methods failed" in str(excinfo.value)


def test_stage_opts_cookie_skipped_without_file(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.fallback.get_settings",
                        lambda: type("S", (), {"COOKIES_DIR": tmp_path, "DENO_PATH": "deno"})())
    assert stage_opts("ytdlp-cookies", "https://www.youtube.com/watch?v=1",
                      base_ydl_opts()) is None
    (tmp_path / "youtube.com.txt").write_text("# netscape cookies")
    opts = stage_opts("ytdlp-cookies", "https://www.youtube.com/watch?v=1", base_ydl_opts())
    assert opts is not None and opts["cookiefile"].endswith("youtube.com.txt")


def test_stage_opts_impersonate_and_generic():
    base = base_ydl_opts()
    assert stage_opts("ytdlp-impersonate", "https://x.com/1", base)["impersonate"] == "chrome"
    assert stage_opts("ytdlp-generic", "https://x.com/1", base)["force_generic_extractor"] is True
    assert "impersonate" not in stage_opts("ytdlp-default", "https://x.com/1", base)


@pytest.mark.parametrize("detail, expected_snippet", [
    ("ERROR: Private video. Sign in if you've been granted access",
     "private or login-walled"),
    ("ERROR: This video is DRM protected", "DRM-protected"),
    ("ERROR: HTTP Error 403: Forbidden", "blocked the request"),
    ("Unable to extract", "All download methods failed"),
])
def test_friendly_error_mapping(detail, expected_snippet):
    attempts = [Attempt("s1", False, detail)]
    err = friendly_error("https://example.com/v", attempts)
    assert expected_snippet in err.message
    assert err.cause == f"s1: {detail}"


def test_friendly_error_ignores_skipped_stages():
    attempts = [
        Attempt("ytdlp-cookies", False, "skipped: no cookies file for this domain"),
        Attempt("ytdlp-default", False, "stage exploded"),
    ]
    err = friendly_error("https://example.com/v", attempts)
    # the word "cookies" in the skip note must not trigger the login branch
    assert "All download methods failed" in err.message
