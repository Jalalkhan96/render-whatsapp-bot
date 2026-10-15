"""Tests: format cleaning, presets, option resolution, playlist entries."""
import pytest

from app.core.downloader import (
    build_presets,
    clean_formats,
    is_playlist,
    playlist_entries,
    resolve_download_options,
)

FAKE_INFO = {
    "title": "Test video",
    "formats": [
        {"format_id": "h264-1080", "url": "http://cdn/x/1080.mp4", "ext": "mp4",
         "width": 1920, "height": 1080, "vcodec": "h264", "acodec": "none",
         "filesize": 50_000_000, "fps": 30, "format_note": "1080p"},
        {"format_id": "h264-720", "url": "http://cdn/x/720.mp4", "ext": "mp4",
         "width": 1280, "height": 720, "vcodec": "h264", "acodec": "none",
         "filesize_approx": 25_000_000, "fps": 30},
        {"format_id": "audio", "url": "http://cdn/x/a.m4a", "ext": "m4a",
         "vcodec": "none", "acodec": "aac", "filesize": 5_000_000, "abr": 128},
        {"format_id": "merged", "url": "http://cdn/x/full.mp4", "ext": "mp4",
         "width": 1280, "height": 720, "vcodec": "h264", "acodec": "aac",
         "filesize": 30_000_000},
        {"format_id": "nourl", "ext": "mp4", "vcodec": "h264", "acodec": "aac"},
        {"format_id": "meta", "url": "http://cdn/x/sb.jpg", "ext": "jpg",
         "vcodec": "none", "acodec": "none"},  # storyboards: dropped
    ],
}


def test_clean_formats_filters_and_labels():
    fmts = clean_formats(FAKE_INFO)
    ids = [f.format_id for f in fmts]
    assert "nourl" not in ids  # no URL
    assert "meta" not in ids  # neither audio nor video
    by_id = {f.format_id: f for f in fmts}
    assert by_id["h264-1080"].resolution == "1920x1080"
    assert by_id["h264-1080"].has_video and not by_id["h264-1080"].has_audio
    assert by_id["audio"].has_audio and not by_id["audio"].has_video
    assert by_id["audio"].resolution is None
    assert by_id["h264-720"].filesize == 25_000_000  # falls back to filesize_approx


def test_clean_formats_sorts_merged_first_then_resolution():
    fmts = clean_formats(FAKE_INFO)
    assert fmts[0].format_id == "merged"  # has both audio+video
    heights = [f.resolution for f in fmts if f.has_video]
    assert heights[0] == "1920x1080" or fmts[1].format_id == "h264-1080"


def test_clean_formats_empty():
    assert clean_formats({}) == []
    assert clean_formats({"formats": None}) == []


def test_build_presets_required_ids():
    presets = build_presets()
    ids = {p.id for p in presets}
    assert {"best_mp4", "1080p", "720p", "480p", "audio_mp3", "audio_m4a"} <= ids
    mp3 = next(p for p in presets if p.id == "audio_mp3")
    assert mp3.audio_only and mp3.target_ext == "mp3" and mp3.format_selector


def test_resolve_download_options():
    sel, audio_only, ext = resolve_download_options("audio_mp3", None, False)
    assert audio_only and ext == "mp3" and "bestaudio" in sel
    sel, audio_only, ext = resolve_download_options(None, "h264-720", False)
    assert sel == "h264-720" and not audio_only and ext is None
    sel, _, _ = resolve_download_options(None, None, False)
    assert sel == "bv*+ba/b"
    with pytest.raises(ValueError):
        resolve_download_options("nope", None, False)


def test_playlist_entries_capped():
    info = {"_type": "playlist",
            "entries": [{"id": str(i), "title": f"v{i}",
                         "webpage_url": f"http://x/{i}", "duration": 10} for i in range(80)]}
    assert is_playlist(info)
    entries = playlist_entries(info)
    assert len(entries) == 50
    assert entries[0].url == "http://x/0"
    assert not is_playlist({"_type": "video"})
