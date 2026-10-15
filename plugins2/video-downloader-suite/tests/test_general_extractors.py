"""Unit tests for the general extractors — all HTTP is mocked; no live requests."""
from __future__ import annotations

import json

import pytest

from app.extractors.general import (GeneralExtractionError, extract,
                                    match_extractor, supported_platforms)
from app.extractors.general.base import (direct_url_entry, extract_json_ld,
                                         js_unescape, og_meta)
from app.extractors.general.instagram import InstagramExtractor
from app.extractors.general.reddit import RedditExtractor, parse_dash_manifest
from app.extractors.general.tiktok import TikTokExtractor


def _with_mocked_fetch(extractor, html: str):
    extractor.fetch = lambda url, **kw: html  # noqa: ARG005
    return extractor


def _boom(url, stage, opts, *, download):
    raise RuntimeError("stage exploded")


# ---------------------------------------------------------------- base helpers
def test_js_unescape():
    assert js_unescape(r"https:\/\/v16.tiktok.com\/x") == "https://v16.tiktok.com/x"


def test_og_meta():
    html = '<meta property="og:image" content="https://cdn.example.com/t.jpg" />'
    assert og_meta(html, "og:image") == "https://cdn.example.com/t.jpg"
    assert og_meta(html, "og:missing") is None


def test_direct_url_entry_ext_detection():
    assert direct_url_entry("hls", "https://x/playlist.m3u8")["ext"] == "m3u8"
    assert direct_url_entry(720, "https://x/v.mp4?y=1") == {
        "quality": "720p", "url": "https://x/v.mp4?y=1", "ext": "mp4"}


def test_extract_json_ld_video_object():
    html = ('<script type="application/ld+json">{"@type":"VideoObject",'
            '"contentUrl":"https://x/v.mp4"}</script>')
    blocks = extract_json_ld(html, "VideoObject")
    assert blocks[0]["contentUrl"] == "https://x/v.mp4"


# ---------------------------------------------------------------- tiktok
TIKTOK_HTML = """
<html><head><title>someuser on TikTok</title></head><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"statusCode":0,"itemInfo":{"itemStruct":{
"id":"7686917076128140574","desc":"test video #fun",
"author":{"nickname":"Jen","uniqueId":"jenrocks25"},
"video":{"playAddr":"https:\\/\\/v16.tiktok.com\\/play.mp4?x=1",
"downloadAddr":"https:\\/\\/v16.tiktok.com\\/dl.mp4?x=1",
"cover":"https:\\/\\/p16.tiktok.com\\/cover.jpg",
"duration":100,"width":720,"height":1280,"format":"mp4"}
}}}}}
</script></body></html>
"""

TIKTOK_MISSING_HTML = """
<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
{"__DEFAULT_SCOPE__":{"webapp.video-detail":{"statusCode":10204,"statusMsg":"item doesn't exist"}}}
</script></body></html>
"""


def test_tiktok_page_parsing():
    ext = _with_mocked_fetch(TikTokExtractor(), TIKTOK_HTML)
    result = ext.extract("https://www.tiktok.com/@jenrocks25/video/7686917076128140574")
    assert result["platform"] == "tiktok"
    assert result["title"] == "Jen: test video #fun"
    quals = {d["quality"]: d for d in result["direct_urls"]}
    assert quals["watermarked"]["url"] == "https://v16.tiktok.com/play.mp4?x=1"
    assert quals["no-watermark"]["url"] == "https://v16.tiktok.com/dl.mp4?x=1"
    assert result["thumbnail"] == "https://p16.tiktok.com/cover.jpg"
    assert result["duration"] == 100.0


def test_tiktok_missing_video_raises():
    ext = _with_mocked_fetch(TikTokExtractor(), TIKTOK_MISSING_HTML)
    with pytest.raises(GeneralExtractionError, match="unavailable"):
        ext.extract("https://www.tiktok.com/@u/video/1")


def test_tiktok_no_json_raises():
    ext = _with_mocked_fetch(TikTokExtractor(), "<html><body>empty</body></html>")
    with pytest.raises(GeneralExtractionError):
        ext.extract("https://www.tiktok.com/@u/video/1")


def test_tiktok_playaddr_list_form():
    html = TIKTOK_HTML.replace(
        '"playAddr":"https:\\\\/\\\\/v16.tiktok.com\\\\/play.mp4?x=1"',
        '"playAddr":["https:\\\\/\\\\/v16.tiktok.com\\\\/play.mp4?x=1"]')
    ext = _with_mocked_fetch(TikTokExtractor(), html)
    result = ext.extract("https://www.tiktok.com/@u/video/1")
    assert result["direct_urls"][0]["url"] == "https://v16.tiktok.com/play.mp4?x=1"


# ---------------------------------------------------------------- reddit
REDDIT_POST_JSON = [{
    "data": {"children": [{"data": {
        "title": "Test reddit video",
        "thumbnail": "https://b.thumbs.redditmedia.com/thumb.jpg",
        "secure_media": {"reddit_video": {
            "fallback_url": "https://v.redd.it/abc123/DASH_720.mp4?source=fallback",
            "hls_url": "https://v.redd.it/abc123/HLSPlaylist.m3u8",
            "dash_url": "https://v.redd.it/abc123/DASHPlaylist.mpd",
            "duration": 42,
            "width": 1280,
            "height": 720,
        }},
    }}]}
}]

REDDIT_MPD = """<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT42S">
<Period>
<AdaptationSet contentType="video" mimeType="video/mp4">
<Representation id="DASH_720" bandwidth="2000000" width="1280" height="720"><BaseURL>DASH_720.mp4</BaseURL></Representation>
<Representation id="DASH_360" bandwidth="800000" width="640" height="360"><BaseURL>DASH_360.mp4</BaseURL></Representation>
</AdaptationSet>
<AdaptationSet contentType="audio" mimeType="audio/mp4">
<Representation id="DASH_AUDIO_128" bandwidth="128000"><BaseURL>DASH_AUDIO_128.mp4</BaseURL></Representation>
</AdaptationSet>
</Period></MPD>
"""


def _reddit_ext():
    ext = RedditExtractor()
    ext.fetch_json = lambda url, **kw: REDDIT_POST_JSON  # noqa: ARG005
    ext.fetch = lambda url, **kw: REDDIT_MPD  # noqa: ARG005
    return ext


def test_parse_dash_manifest_picks_best():
    parsed = parse_dash_manifest("https://v.redd.it/abc123/DASHPlaylist.mpd", REDDIT_MPD)
    assert parsed["video"]["url"] == "https://v.redd.it/abc123/DASH_720.mp4"
    assert parsed["video"]["bandwidth"] == 2000000
    assert parsed["audio"]["url"] == "https://v.redd.it/abc123/DASH_AUDIO_128.mp4"


def test_parse_dash_manifest_bad_xml_raises():
    with pytest.raises(GeneralExtractionError):
        parse_dash_manifest("https://v.redd.it/x/DASHPlaylist.mpd", "not xml")


def test_reddit_post_parsing():
    result = _reddit_ext().extract("https://www.reddit.com/r/test/comments/abc123/x/")
    assert result["platform"] == "reddit"
    assert result["title"] == "Test reddit video"
    assert result["duration"] == 42.0
    assert result["thumbnail"] == "https://b.thumbs.redditmedia.com/thumb.jpg"
    quals = {d["quality"]: d for d in result["direct_urls"]}
    assert quals["source"]["url"] == "https://v.redd.it/abc123/DASH_720.mp4?source=fallback"
    assert quals["dash-video"]["url"] == "https://v.redd.it/abc123/DASH_720.mp4"
    assert quals["dash-audio"]["url"] == "https://v.redd.it/abc123/DASH_AUDIO_128.mp4"
    assert quals["dash"]["ext"] == "mpd"
    assert quals["hls"]["ext"] == "m3u8"


def test_reddit_post_order_progressive_first():
    result = _reddit_ext().extract("https://www.reddit.com/r/test/comments/abc123/x/")
    assert result["direct_urls"][0]["quality"] == "source"
    assert result["direct_urls"][0]["ext"] == "mp4"


def test_reddit_short_link_id():
    ext = _reddit_ext()
    result = ext.extract("https://redd.it/abc123")
    assert result["platform"] == "reddit"
    assert result["title"] == "Test reddit video"


def test_reddit_no_video_raises():
    ext = RedditExtractor()
    ext.fetch_json = lambda url, **kw: [{"data": {"children": [{"data": {
        "title": "text post", "secure_media": None, "media": None}}]}}]
    with pytest.raises(GeneralExtractionError, match="no reddit_video"):
        ext.extract("https://www.reddit.com/r/test/comments/abc123/x/")


def test_reddit_bare_vredd():
    ext = RedditExtractor()
    ext.fetch = lambda url, **kw: REDDIT_MPD  # noqa: ARG005
    result = ext.extract("https://v.redd.it/abc123")
    assert result["platform"] == "reddit"
    quals = {d["quality"]: d for d in result["direct_urls"]}
    assert quals["dash-video"]["url"] == "https://v.redd.it/abc123/DASH_720.mp4"
    assert quals["dash-audio"]["url"] == "https://v.redd.it/abc123/DASH_AUDIO_128.mp4"
    assert quals["dash"]["ext"] == "mpd"
    assert quals["hls"]["ext"] == "m3u8"
    assert "source" not in quals  # no progressive URL without post JSON


def test_reddit_bad_url():
    with pytest.raises(GeneralExtractionError):
        RedditExtractor()._post_id("https://www.reddit.com/r/test/")


# ---------------------------------------------------------------- instagram
INSTAGRAM_HTML = """
<html><head>
<meta property="og:description" content="nasa on August 29, 2024: &quot;Sail deployment achieved!&quot;" />
<meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg" />
</head><body>
<script type="application/json">{"x":{"video_versions":[
{"type":101,"url":"https:\\/\\/scontent.cdninstagram.com\\/v.mp4?x=1"},
{"type":102,"url":"https:\\/\\/scontent.cdninstagram.com\\/v.mp4?x=1"}
]}}</script>
</body></html>
"""


def test_instagram_page_parsing():
    ext = _with_mocked_fetch(InstagramExtractor(), INSTAGRAM_HTML)
    result = ext.extract("https://www.instagram.com/reel/C_Q2ORqsds4/")
    assert result["platform"] == "instagram"
    assert result["title"] == 'nasa on August 29, 2024: "Sail deployment achieved!"'
    assert len(result["direct_urls"]) == 1  # duplicate URLs deduped
    assert result["direct_urls"][0]["url"] == "https://scontent.cdninstagram.com/v.mp4?x=1"
    assert result["direct_urls"][0]["ext"] == "mp4"
    assert result["thumbnail"] == "https://scontent.cdninstagram.com/thumb.jpg"
    assert result["duration"] is None


def test_instagram_login_walled_raises():
    ext = _with_mocked_fetch(InstagramExtractor(), "<html><body>Login • Instagram</body></html>")
    with pytest.raises(GeneralExtractionError, match="login-walled"):
        ext.extract("https://www.instagram.com/reel/C_Q2ORqsds4/")


def test_instagram_bad_url_shape():
    with pytest.raises(GeneralExtractionError):
        InstagramExtractor()._shortcode("https://www.instagram.com/stories/nasa/123/")


@pytest.mark.parametrize("path", ["/reel/ABC123/", "/reels/ABC123/", "/p/ABC123/", "/tv/ABC123/"])
def test_instagram_shortcode_paths(path):
    assert InstagramExtractor()._shortcode(f"https://www.instagram.com{path}") == "ABC123"


# ---------------------------------------------------------------- registry
@pytest.mark.parametrize("url,platform", [
    ("https://www.tiktok.com/@user/video/1234567890123456789", "tiktok"),
    ("https://vt.tiktok.com/ABC123/", "tiktok"),
    ("https://vm.tiktok.com/ABC123/", "tiktok"),
    ("https://www.reddit.com/r/test/comments/abc123/x/", "reddit"),
    ("https://redd.it/abc123", "reddit"),
    ("https://v.redd.it/abc123", "reddit"),
    ("https://www.instagram.com/reel/C_Q2ORqsds4/", "instagram"),
    ("https://www.instagram.com/p/ABC123/", "instagram"),
])
def test_registry_routing(url, platform):
    cls = match_extractor(url)
    assert cls is not None
    assert cls().platform == platform


def test_registry_unsupported():
    assert match_extractor("https://www.youtube.com/watch?v=abc") is None
    with pytest.raises(GeneralExtractionError):
        extract("https://www.youtube.com/watch?v=abc")


def test_supported_platforms():
    assert set(supported_platforms()) == {"tiktok", "reddit", "instagram"}


# ---------------------------------------------------------------- fallback wiring
def test_fallback_uses_general_extractors_stage(monkeypatch):
    from app.core import fallback

    monkeypatch.setattr(RedditExtractor, "fetch_json",
                        lambda self, url, **kw: REDDIT_POST_JSON)
    monkeypatch.setattr(RedditExtractor, "fetch",
                        lambda self, url, **kw: REDDIT_MPD)
    monkeypatch.setattr(fallback, "_try_ytdlp_stage", _boom)
    monkeypatch.setattr(fallback, "gallerydl_analyze", _boom)
    monkeypatch.setattr(fallback, "sniff_media_url", _boom)

    info, stage, attempts = fallback.analyze_with_fallback(
        "https://www.reddit.com/r/test/comments/abc123/x/")
    assert stage == "general-extractors"
    assert info["_general"] is True
    assert info["formats"][0]["url"].endswith("DASH_720.mp4?source=fallback")
    assert any(a.stage == "general-extractors" and a.ok for a in attempts)


def test_fallback_skips_general_stage_for_other_urls(monkeypatch):
    from app.core import fallback

    monkeypatch.setattr(fallback, "_try_ytdlp_stage", _boom)
    monkeypatch.setattr(fallback, "gallerydl_analyze", _boom)
    monkeypatch.setattr(
        fallback, "sniff_media_url",
        lambda url, timeout=60: ("https://cdn.example.com/v.mp4", "direct", "t"),
    )
    info, stage, attempts = fallback.analyze_with_fallback("https://example.com/v/1")
    assert stage == "playwright-sniff"  # general stage skipped, chain continued
    skip = [a for a in attempts if a.stage == "general-extractors"]
    assert len(skip) == 1 and not skip[0].ok
    assert skip[0].detail.startswith("skipped")


def test_general_extractors_analyze_result_shape():
    from app.core.fallback import general_extractors_analyze

    ext = _with_mocked_fetch(TikTokExtractor(), TIKTOK_HTML)
    import app.extractors.general.registry as reg
    monkeypatch_cls = reg.TikTokExtractor
    orig = monkeypatch_cls.extract
    bound = orig.__get__(ext, monkeypatch_cls)  # original bound to our instance
    monkeypatch_cls.extract = lambda self, url: bound(url)
    try:
        info = general_extractors_analyze("https://www.tiktok.com/@u/video/1")
    finally:
        monkeypatch_cls.extract = orig
    assert info["title"] == "Jen: test video #fun"
    assert info["_media_urls"][0] == "https://v16.tiktok.com/play.mp4?x=1"
    assert info["formats"][0]["format_id"] == "general-0"
