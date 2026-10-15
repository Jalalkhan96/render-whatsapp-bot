"""Tests: URL validation, SSRF blocking, filename sanitization, domains."""
import socket

import pytest

from app.core import security
from app.core.security import (
    BlockedSiteError,
    SSRFError,
    URLValidationError,
    assert_url_safe,
    cookie_path_for_domain,
    is_blocked_domain,
    sanitize_domain,
    sanitize_filename,
    validate_url,
)


# --- URL validation -------------------------------------------------------

def test_validate_url_ok():
    assert validate_url("https://www.youtube.com/watch?v=abc123") == \
        "https://www.youtube.com/watch?v=abc123"


def test_validate_url_rejects_non_http():
    with pytest.raises(URLValidationError):
        validate_url("ftp://example.com/video.mp4")
    with pytest.raises(URLValidationError):
        validate_url("javascript:alert(1)")


def test_validate_url_rejects_empty_and_long():
    with pytest.raises(URLValidationError):
        validate_url("   ")
    with pytest.raises(URLValidationError):
        validate_url("https://example.com/" + "a" * 3000)


def test_validate_url_rejects_drm():
    with pytest.raises(BlockedSiteError):
        validate_url("https://www.netflix.com/watch/123")
    with pytest.raises(BlockedSiteError):
        validate_url("https://open.spotify.com/track/abc")


def test_is_blocked_domain_subdomains():
    assert is_blocked_domain("www.netflix.com")
    assert is_blocked_domain("netflix.com")
    assert not is_blocked_domain("notnetflix.com")
    assert not is_blocked_domain("youtube.com")


def test_validate_url_rejects_adult_sources():
    for url in (
        "https://www.xvideos.com/video/123",
        "https://subdomain.pornhub.com/view_video.php",
        "https://erome.com/a/example",
        "https://nhentai.net/g/123",
    ):
        with pytest.raises(BlockedSiteError):
            validate_url(url)


def test_adult_domain_subdomains_are_blocked():
    assert is_blocked_domain("www.xvideos.com")
    assert is_blocked_domain("cdn.redgifs.com")
    assert is_blocked_domain("api.nhentai.net")
    assert not is_blocked_domain("notxvideos.com")


# --- SSRF -----------------------------------------------------------------

def _fake_getaddrinfo_factory(ip):
    def fake(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port or 0))]
    return fake


@pytest.mark.parametrize("bad_ip", [
    "127.0.0.1", "10.0.0.5", "172.16.4.4", "192.168.1.1",
    "169.254.169.254",  # cloud metadata
    "224.0.0.1", "0.0.0.0",
])
def test_assert_url_safe_blocks_private_ips(monkeypatch, bad_ip):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo_factory(bad_ip))
    with pytest.raises(SSRFError):
        assert_url_safe("http://example.com/video.mp4")


def test_assert_url_safe_allows_public_ip(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo_factory("93.184.216.34"))
    assert assert_url_safe("https://example.com/video.mp4") == "https://example.com/video.mp4"


def test_assert_url_safe_unresolvable(monkeypatch):
    def boom(*a, **k):
        raise socket.gaierror("nope")
    monkeypatch.setattr(socket, "getaddrinfo", boom)
    with pytest.raises(SSRFError):
        assert_url_safe("https://nonexistent.invalid/video.mp4")


# --- filenames ------------------------------------------------------------

def test_sanitize_filename_traversal():
    assert sanitize_filename("../../etc/passwd.mp4") == "passwd.mp4"
    # basename semantics: only the final path component survives, then
    # every illegal char is stripped
    assert sanitize_filename('a/b\\c:d*e?f"g<h>i|j.mp4') == "cdefghij.mp4"


def test_sanitize_filename_edge_cases():
    assert sanitize_filename("") == "download"
    assert sanitize_filename("...") == "download"
    assert sanitize_filename(".hidden.mp4") == "hidden.mp4"
    long_name = "a" * 500 + ".mp4"
    assert len(sanitize_filename(long_name)) <= 184  # 180 + ".mp4"
    assert sanitize_filename(long_name).endswith(".mp4")


def test_sanitize_domain():
    assert sanitize_domain("YouTube.com") == "youtube.com"
    with pytest.raises(URLValidationError):
        sanitize_domain("not a domain!!")
    with pytest.raises(URLValidationError):
        sanitize_domain("")


def test_cookie_path_for_domain(tmp_path):
    p = cookie_path_for_domain("www.youtube.com", tmp_path)
    assert p == tmp_path / "youtube.com.txt"
    p2 = cookie_path_for_domain("m.tiktok.com", tmp_path)
    assert p2 == tmp_path / "tiktok.com.txt"
