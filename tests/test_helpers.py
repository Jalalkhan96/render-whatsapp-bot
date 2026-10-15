import os

os.environ.setdefault("API_KEY", "test-secret-key")

import pytest
from fastapi import HTTPException

from app.main import (
    DownloadRequest,
    InfoRequest,
    quality_format,
    validate_media_info,
    validate_public_http_url,
)


def test_audio_format_uses_audio_source():
    assert quality_format("audio", "best") == "bestaudio/best"


def test_720p_format_has_height_ceiling():
    selected = quality_format("video", "720p")
    assert "height<=720" in selected
    assert "/best" not in selected.split("+")[-1] or "height<=720" in selected


def test_best_video_format_prefers_best_video_and_audio():
    assert quality_format("video", "best") == "bestvideo*+bestaudio/best"


def test_rejects_file_scheme():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("file:///etc/passwd")
    assert exc.value.status_code == 400


def test_rejects_localhost_before_dns():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("http://localhost:8080/admin")
    assert exc.value.status_code == 400


def test_rejects_internal_suffix_before_dns():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("http://service.internal/file.mp4")
    assert exc.value.status_code == 400


def test_rejects_private_ip():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("http://127.0.0.1/video.mp4")
    assert exc.value.status_code == 400


def test_rejects_url_credentials():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("https://user:password@example.com/video")
    assert exc.value.status_code == 400


def test_rejects_invalid_port():
    with pytest.raises(HTTPException) as exc:
        validate_public_http_url("https://example.com:99999/video")
    assert exc.value.status_code == 400


def test_rejects_live_streams():
    assert "Live streams" in validate_media_info({"is_live": True})


def test_rejects_too_long_media():
    assert "exceeds" in validate_media_info({"duration": 3601})


def test_info_request_strips_surrounding_whitespace():
    request = InfoRequest(url="  https://example.com/video  ")
    assert request.url == "https://example.com/video"


def test_download_request_rejects_invalid_quality():
    with pytest.raises(Exception):
        DownloadRequest(url="https://example.com/video", quality="240p")
