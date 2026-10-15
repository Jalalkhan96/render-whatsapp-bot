"""Reddit extractor — hosted reddit videos (v.redd.it).

Two input shapes:
  1. Post URLs (reddit.com / redd.it): fetch ``https://www.reddit.com/comments/<id>.json``
     (falling back to old.reddit.com) and read ``secure_media.reddit_video`` —
     ``fallback_url`` is a progressive mp4, ``hls_url``/``dash_url`` are manifests.
  2. Bare ``https://v.redd.it/<id>``: fetch ``DASHPlaylist.mpd`` and pick the
     highest-bandwidth video Representation plus the audio Representation;
     ``HLSPlaylist.m3u8`` is added as well.

Network note (verified 2026-10-04): www.reddit.com returns HTTP 403 and
old.reddit.com times out from this datacenter network, so live extraction is
currently blocked here. The implementation is complete and unit-tested with
mocked responses; on an unblocked network (or with the existing yt-dlp+cookies
stage) it works. direct_urls are ordered: progressive mp4, DASH video, DASH
audio, DASH manifest, HLS manifest.
"""
from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urljoin, urlparse

from .base import (GeneralBase, GeneralExtractionError, direct_url_entry,
                   js_unescape)

log = logging.getLogger("uvd.extractors.general")

_MPD_NS = {"mpd": "urn:mpeg:dash:schema:mpd:2011"}


def _rep_url(mpd_url: str, rep: ET.Element, adapt: ET.Element) -> str | None:
    """Best-effort playable URL for one Representation (no URL fabrication).

    Prefers an explicit <BaseURL>; otherwise expands a SegmentTemplate
    initialization template (e.g. "...$RepresentationID$..."). Returns None
    when the manifest gives no directly addressable file.
    """
    base = rep.find("mpd:BaseURL", _MPD_NS)
    if base is not None and (base.text or "").strip():
        return urljoin(mpd_url, base.text.strip())
    rep_id = rep.get("id") or ""
    for scope in (rep, adapt):
        tmpl = scope.find("mpd:SegmentTemplate", _MPD_NS)
        if tmpl is not None:
            init = tmpl.get("initialization") or ""
            if "$RepresentationID$" in init and rep_id:
                return urljoin(mpd_url, init.replace("$RepresentationID$", rep_id))
    return None


def parse_dash_manifest(mpd_url: str, xml_text: str) -> dict[str, Any]:
    """Return {"video": {bandwidth, url} | None, "audio": {...} | None}.

    Picks the highest-bandwidth video Representation and the highest-bandwidth
    audio Representation that resolve to a concrete URL.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise GeneralExtractionError(f"reddit: unparsable DASH manifest: {exc}") from exc

    best: dict[str, dict[str, Any]] = {}
    for adapt in root.findall(".//mpd:AdaptationSet", _MPD_NS):
        ctype = (adapt.get("contentType") or "").lower()
        mime = (adapt.get("mimeType") or "").lower()
        kind = None
        if "video" in ctype or mime.startswith("video/"):
            kind = "video"
        elif "audio" in ctype or mime.startswith("audio/"):
            kind = "audio"
        if kind is None:
            continue
        for rep in adapt.findall("mpd:Representation", _MPD_NS):
            try:
                bw = int(rep.get("bandwidth") or 0)
            except ValueError:
                bw = 0
            url = _rep_url(mpd_url, rep, adapt)
            if not url:
                continue
            cur = best.get(kind)
            if cur is None or bw > cur["bandwidth"]:
                best[kind] = {"bandwidth": bw, "url": js_unescape(url)}
    return {"video": best.get("video"), "audio": best.get("audio")}


class RedditExtractor(GeneralBase):
    platform = "reddit"
    domains = ("reddit.com", "redd.it", "v.redd.it")

    # -- URL handling -----------------------------------------------------
    def _post_id(self, url: str) -> str | None:
        """Extract the reddit post id, or None for bare v.redd.it/<id> URLs."""
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if host == "v.redd.it":
            return None
        m = re.search(r"/comments/([A-Za-z0-9]+)", parsed.path)
        if m:
            return m.group(1)
        m = re.fullmatch(r"/([A-Za-z0-9]+)/?", parsed.path)
        if m and host == "redd.it":
            return m.group(1)
        raise GeneralExtractionError(f"reddit: cannot find a post id in {url}")

    def _vredd_id(self, url: str) -> str:
        m = re.fullmatch(r"/([A-Za-z0-9]+)/?", urlparse(url).path)
        if not m:
            raise GeneralExtractionError(f"reddit: cannot find a v.redd.it id in {url}")
        return m.group(1)

    # -- post JSON --------------------------------------------------------
    def _fetch_post(self, post_id: str) -> dict[str, Any]:
        """GET the post listing JSON (www first, then old.reddit)."""
        last_err: Exception | None = None
        for host in ("www.reddit.com", "old.reddit.com"):
            try:
                data = self.fetch_json(
                    f"https://{host}/comments/{post_id}.json?raw_json=1")
                return data
            except GeneralExtractionError as exc:
                last_err = exc
        raise GeneralExtractionError(
            f"reddit: could not fetch post {post_id}: {last_err}")

    @staticmethod
    def _reddit_video(data: dict[str, Any]) -> dict[str, Any] | None:
        """Find the reddit_video dict on the post (or its crosspost parent)."""
        post = (((data[0] if isinstance(data, list) else {}).get("data") or {})
                 .get("children") or [{}])[0].get("data") or {}
        for obj in [post, *((post.get("crosspost_parent_list") or []))]:
            if not isinstance(obj, dict):
                continue
            for key in ("secure_media", "media"):
                rv = (obj.get(key) or {}).get("reddit_video")
                if isinstance(rv, dict) and rv.get("fallback_url"):
                    return rv
        return None

    # -- extract ----------------------------------------------------------
    def extract(self, url: str) -> dict[str, Any]:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()

        title: str | None = None
        thumbnail: str | None = None
        duration: float | None = None
        fallback_url: str | None = None
        hls_url: str | None = None
        dash_url: str | None = None

        if host == "v.redd.it":
            vid = self._vredd_id(url)
            title = f"reddit video {vid}"
            dash_url = f"https://v.redd.it/{vid}/DASHPlaylist.mpd"
            hls_url = f"https://v.redd.it/{vid}/HLSPlaylist.m3u8"
        else:
            post_id = self._post_id(url)
            data = self._fetch_post(post_id)
            rv = self._reddit_video(data)
            if rv is None:
                raise GeneralExtractionError(
                    f"reddit: no reddit_video found on post {post_id} "
                    f"(image/text post or removed)")
            fallback_url = js_unescape(rv["fallback_url"])
            hls_url = js_unescape(rv["hls_url"]) if rv.get("hls_url") else None
            dash_url = js_unescape(rv["dash_url"]) if rv.get("dash_url") else None
            try:
                duration = float(rv["duration"]) if rv.get("duration") else None
            except (TypeError, ValueError):
                duration = None
            post = (((data[0] if isinstance(data, list) else {}).get("data") or {})
                    .get("children") or [{}])[0].get("data") or {}
            title = (post.get("title") or "").strip() or None
            thumb = post.get("thumbnail") or ""
            thumbnail = thumb if thumb.startswith("http") else None

        direct_urls: list[dict] = []
        seen: set[str] = set()

        def add(quality: str, raw: str | None, ext: str | None = None) -> None:
            if raw:
                u = js_unescape(raw.strip())
                if u and u not in seen:
                    seen.add(u)
                    direct_urls.append(direct_url_entry(quality, u, ext=ext))

        # 1. progressive mp4 (video+audio) — the most directly usable URL
        add("source", fallback_url, ext="mp4")

        # 2/3. DASH video + audio from the manifest (best-effort concrete URLs)
        dash_video = dash_audio = None
        if dash_url:
            try:
                mpd = self.fetch(dash_url, accept="application/dash+xml")
                parsed_mpd = parse_dash_manifest(dash_url, mpd)
                dash_video = (parsed_mpd["video"] or {}).get("url")
                dash_audio = (parsed_mpd["audio"] or {}).get("url")
            except GeneralExtractionError as exc:
                # Manifest fetch/parse failed: keep the manifest URL itself below.
                log.debug("reddit: DASH manifest parse failed (%s); using manifest URL", exc)
        add("dash-video", dash_video, ext="mp4")
        add("dash-audio", dash_audio, ext="mp4")

        # 4/5. manifests themselves (yt-dlp resolves them downstream)
        add("dash", dash_url, ext="mpd")
        add("hls", hls_url, ext="m3u8")

        return self.result(title=title, direct_urls=direct_urls,
                           thumbnail=thumbnail, duration=duration,
                           webpage_url=url)
