"""Unit tests for the adult extractors — all HTTP is mocked; no live requests."""
from __future__ import annotations

import pytest

from app.extractors.adult import (AdultExtractionError, extract,
                                  match_extractor, supported_platforms)
from app.extractors.adult.base import (extract_json_ld, js_unescape, og_meta,
                                       parse_iso8601_duration)
from app.extractors.adult.eporner import EpornerExtractor
from app.extractors.adult.redgifs import RedgifsExtractor
from app.extractors.adult.xvideos import XvideosExtractor

EPORNER_HTML = """
<html><head>
<title>Test Video - EPORNER</title>
<meta property="og:image" content="https://static-ca-cdn.eporner.com/thumbs/x/13_240.jpg" />
<script type="application/ld+json">
{"@context":"http://schema.org/","@type":"VideoObject",
 "name":"This Girl Knows How To Suck Dick",
 "url":"https://www.eporner.com/hd-porn/iJQEOdWFroy/x/",
 "duration":"PT0H31M1S",
 "thumbnailUrl":["https://static-ca-cdn.eporner.com/thumbs/x/13_360.jpg"],
 "contentUrl":"https://gvideo.eporner.com/iJQEOdWFroy/iJQEOdWFroy.mp4"}
</script>
</head><body></body></html>
"""

XVIDEOS_HTML = """
<html><head>
<meta property="og:title" content="My Best Friend&#039;s Girlfriend" />
<meta property="og:image" content="https://thumbs-gcore.xvideos-cdn.com/x/6/xv_3.jpg" />
</head><body><script>
html5player.setVideoUrlHigh('https:\\/\\/mp4-cdn77.xvideos-cdn.com\\/x\\/6\\/video_1080p.mp4');
html5player.setVideoUrlLow('https:\\/\\/mp4-cdn77.xvideos-cdn.com\\/x\\/6\\/video_240p.mp4');
html5player.setVideoHLS('https:\\/\\/hls-cdn77.xvideos-cdn.com\\/x\\/playlist.m3u8');
html5player.setVideoDuration(600);
</script></body></html>
"""


def _with_mocked_fetch(extractor, html: str):
    extractor.fetch = lambda url, **kw: html  # noqa: ARG005
    return extractor


# ---------------------------------------------------------------- base helpers
def test_parse_iso8601_duration():
    assert parse_iso8601_duration("PT1H2M3S") == 3723.0
    assert parse_iso8601_duration("PT0H31M1S") == 1861.0
    assert parse_iso8601_duration("PT45S") == 45.0
    assert parse_iso8601_duration(None) is None
    assert parse_iso8601_duration("garbage") is None


def test_js_unescape():
    assert js_unescape(r"https:\/\/ev-h.phncdn.com\/x") == "https://ev-h.phncdn.com/x"


def test_extract_json_ld_video_object():
    blocks = extract_json_ld(EPORNER_HTML, "VideoObject")
    assert len(blocks) == 1
    assert blocks[0]["contentUrl"].endswith(".mp4")


def test_og_meta():
    assert og_meta(XVIDEOS_HTML, "og:image").endswith("xv_3.jpg")
    assert og_meta(XVIDEOS_HTML, "og:missing") is None


# ---------------------------------------------------------------- eporner
def test_eporner_json_ld_parsing():
    ext = _with_mocked_fetch(EpornerExtractor(), EPORNER_HTML)
    result = ext.extract("https://www.eporner.com/hd-porn/iJQEOdWFroy/x/")
    assert result["platform"] == "eporner"
    assert result["title"] == "This Girl Knows How To Suck Dick"
    assert result["duration"] == 1861.0
    urls = [d["url"] for d in result["direct_urls"]]
    assert urls == ["https://gvideo.eporner.com/iJQEOdWFroy/iJQEOdWFroy.mp4"]
    assert result["thumbnail"].endswith("13_360.jpg")


def test_eporner_bad_url():
    with pytest.raises(AdultExtractionError):
        EpornerExtractor()._video_id("https://www.eporner.com/")


# ---------------------------------------------------------------- redgifs
def test_redgifs_api_parsing():
    ext = RedgifsExtractor()
    calls = []

    def fake_json(url, **kw):
        calls.append(url)
        if url.endswith("/auth/temporary"):
            return {"token": "tok123"}
        return {"gif": {
            "id": "abc123",
            "title": "Test Gif",
            "duration": 5.2,
            "urls": {"hd": "https://thumbs2.redgifs.com/abc-hd.mp4",
                     "sd": "https://thumbs2.redgifs.com/abc-sd.mp4",
                     "thumbnail": "https://thumbs2.redgifs.com/abc.jpg"},
        }}

    ext.fetch_json = fake_json
    result = ext.extract("https://www.redgifs.com/watch/abc123")
    assert result["platform"] == "redgifs"
    assert result["title"] == "Test Gif"
    assert result["duration"] == 5.2
    quals = {d["quality"]: d["url"] for d in result["direct_urls"]}
    assert quals["hd"] == "https://thumbs2.redgifs.com/abc-hd.mp4"
    assert quals["sd"] == "https://thumbs2.redgifs.com/abc-sd.mp4"
    assert result["thumbnail"] == "https://thumbs2.redgifs.com/abc.jpg"
    assert any("auth/temporary" in u for u in calls)


def test_redgifs_bad_url():
    with pytest.raises(AdultExtractionError):
        RedgifsExtractor()._gif_id("https://www.redgifs.com/")


# ---------------------------------------------------------------- xvideos
def test_xvideos_page_parsing():
    ext = _with_mocked_fetch(XvideosExtractor(), XVIDEOS_HTML)
    result = ext.extract("https://www.xvideos.com/video.omdmvlvce73/56266882")
    assert result["platform"] == "xvideos"
    assert result["title"] == "My Best Friend's Girlfriend"
    quals = {d["quality"]: d for d in result["direct_urls"]}
    assert quals["high"]["url"] == "https://mp4-cdn77.xvideos-cdn.com/x/6/video_1080p.mp4"
    assert quals["low"]["url"] == "https://mp4-cdn77.xvideos-cdn.com/x/6/video_240p.mp4"
    assert quals["hls"]["ext"] == "m3u8"
    assert result["duration"] == 600.0


def test_xvideos_no_sources_raises():
    ext = _with_mocked_fetch(XvideosExtractor(), "<html><body>empty</body></html>")
    with pytest.raises(AdultExtractionError):
        ext.extract("https://www.xvideos.com/video.omdmvlvce73/56266882")


# ---------------------------------------------------------------- registry
@pytest.mark.parametrize("url,platform", [
    ("https://www.eporner.com/hd-porn/abc123/x/", "eporner"),
    ("https://www.redgifs.com/watch/abc123", "redgifs"),
    ("https://www.xvideos.com/video.omdmvlvce73/56266882", "xvideos"),
    ("https://www.xnxx.com/video-17ujehcf/x", "xnxx"),
    ("https://www.pornhub.com/view_video.php?viewkey=abc", "pornhub"),
    ("https://xhamster.com/videos/xhFuYuV", "xhamster"),
    ("https://motherless.com/G/ABC123", "motherless"),
    ("https://www.erome.com/a/NBkd0ih0", "erome"),
    ("https://letsjerk.tv/some-video-1/", "letsjerktv"),
    ("https://www.tnaflix.com/teen-porn/Slug/video3533313", "tnaflix"),
    ("https://player.tnaflix.com/video/3533313", "tnaflix"),
    ("https://www.youporn.com/watch/15602684/slug/", "youporn"),
    ("https://www.redtube.com/267509561", "redtube"),
])
def test_registry_routing(url, platform):
    cls = match_extractor(url)
    assert cls is not None
    assert cls().platform == platform


def test_registry_unsupported():
    assert match_extractor("https://www.youtube.com/watch?v=abc") is None
    with pytest.raises(AdultExtractionError):
        extract("https://www.youtube.com/watch?v=abc")


def test_supported_platforms():
    plats = supported_platforms()
    assert set(plats) == {"eporner", "erome", "letsjerktv", "motherless",
                          "pornhub", "redgifs", "redtube", "tnaflix",
                          "xhamster", "xvideos", "xnxx", "youporn"}


# ---------------------------------------------------------------- tnaflix
TNAFLIX_PAGE_HTML = """
<html><head>
<title>Test Video - TNAFLIX</title>
<meta property="og:title" content="Test Teen Video" />
<meta property="og:image" content="https://img.tnaflix.com/thumb.jpg" />
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"VideoObject",
 "name":"Test Teen Video",
 "duration":"PT00H08M00S",
 "embedUrl":"https://player.tnaflix.com/video/3533313",
 "thumbnailUrl":"https://img.tnaflix.com/thumb.jpg"}
</script>
</head><body></body></html>
"""

TNAFLIX_EMBED_HTML = """
<html><body><video>
<source src="https://fck-cl21.tnaflix.com/dev21/0/023/258/0023258977/Slug-720p.mp4?rs=1&amp;secure=ab==" type="video/mp4" size="720">
<source src="https://fck-cl30.tnaflix.com/dev30/0/023/258/0023258859/Slug-480p.mp4?rs=1&amp;secure=ab==" type="video/mp4" size="480">
</video></body></html>
"""


def test_tnaflix_embed_parsing():
    from app.extractors.adult.tnaflix import TnaflixExtractor
    ext = TnaflixExtractor()

    def fake_fetch(url, **kw):
        return TNAFLIX_EMBED_HTML if "player.tnaflix.com" in url else TNAFLIX_PAGE_HTML

    ext.fetch = fake_fetch
    result = ext.extract("https://www.tnaflix.com/hardcore-porn/Slug/video3533313")
    assert result["platform"] == "tnaflix"
    assert result["title"] == "Test Teen Video"
    assert result["duration"] == 480.0
    quals = {d["quality"]: d for d in result["direct_urls"]}
    assert quals["720p"]["ext"] == "mp4"
    assert "fck-cl21.tnaflix.com" in quals["720p"]["url"]
    assert "&amp;" not in quals["720p"]["url"]
    assert quals["480p"]["url"].endswith("Slug-480p.mp4?rs=1&secure=ab==")
    assert result["thumbnail"] == "https://img.tnaflix.com/thumb.jpg"


def test_tnaflix_embed_url_direct():
    from app.extractors.adult.tnaflix import TnaflixExtractor
    ext = TnaflixExtractor()
    ext.fetch = lambda url, **kw: TNAFLIX_EMBED_HTML
    result = ext.extract("https://player.tnaflix.com/video/3533313")
    assert result["platform"] == "tnaflix"
    assert len(result["direct_urls"]) == 2


def test_tnaflix_bad_url():
    from app.extractors.adult.tnaflix import TnaflixExtractor
    with pytest.raises(AdultExtractionError):
        TnaflixExtractor()._video_id("https://www.tnaflix.com/")


# ---------------------------------------------------------------- mindgeek (youporn / redtube)
MINDGEEK_HTML = """
<html><head>
<title>Test Video - YOUPORN</title>
<meta property="og:image" content="https://thumbs.youporn.com/thumb.jpg" />
</head><body><script>
var playerData = {"mediaDefinitions":[
 {"format":"hls","videoUrl":"https:\\/\\/www.youporn.com\\/media\\/hls\\/?s=abc123","remote":true},
 {"format":"mp4","videoUrl":"https:\\/\\/www.youporn.com\\/media\\/mp4\\/?s=def456","remote":true}
],"duration":1290};
</script></body></html>
"""


def test_youporn_media_definitions_parsing():
    from app.extractors.adult.youporn import YoupornExtractor
    ext = _with_mocked_fetch(YoupornExtractor(), MINDGEEK_HTML)
    result = ext.extract("https://www.youporn.com/watch/15602684/slug/")
    assert result["platform"] == "youporn"
    assert result["duration"] == 1290.0
    exts = {d["ext"] for d in result["direct_urls"]}
    assert exts == {"m3u8", "mp4"}
    assert result["direct_urls"][0]["url"] == "https://www.youporn.com/media/hls/?s=abc123"


def test_redtube_uses_mindgeek_parser():
    from app.extractors.adult.redtube import RedtubeExtractor
    ext = _with_mocked_fetch(RedtubeExtractor(), MINDGEEK_HTML)
    result = ext.extract("https://www.redtube.com/267509561")
    assert result["platform"] == "redtube"
    assert len(result["direct_urls"]) == 2


def test_mindgeek_botwall_raises():
    from app.extractors.adult.youporn import YoupornExtractor
    ext = _with_mocked_fetch(YoupornExtractor(), "<html><body>consent page</body></html>")
    with pytest.raises(AdultExtractionError):
        ext.extract("https://www.youporn.com/watch/15602684/slug/")
