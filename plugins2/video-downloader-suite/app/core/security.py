"""Input validation, SSRF protection, filename sanitization.

SSRF model: every URL the service is asked to fetch (the pasted page URL and
any media URL discovered later, e.g. by the Playwright stage) is validated
before use:
  1. scheme must be http/https, host must exist, URL length is capped;
  2. obviously-DRM sites are refused outright;
  3. the hostname is DNS-resolved and every returned IP is checked against
     private/loopback/link-local/multicast/reserved ranges.

Residual risk (documented, not ignored): yt-dlp and ffmpeg follow redirects
internally, so a malicious DNS rebinding *during* their own requests cannot be
fully prevented without patching their HTTP stacks. We mitigate by validating
the page URL up front and re-validating every discovered direct media URL
before handing it to ffmpeg/yt-dlp.
"""
from __future__ import annotations

import ipaddress
import logging
import re
import socket
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger("uvd.security")

MAX_URL_LENGTH = 2048

# Domains blocked by policy: DRM-restricted providers and adult-content sources.
# This gate runs before page retrieval and again before processing media URLs.
BLOCKED_DOMAINS = frozenset({
    "netflix.com", "www.netflix.com",
    "disneyplus.com", "www.disneyplus.com",
    "hulu.com", "www.hulu.com",
    "max.com", "www.max.com", "hbomax.com",
    "primevideo.com", "www.primevideo.com",
    "peacocktv.com", "www.peacocktv.com",
    "paramountplus.com", "www.paramountplus.com",
    "tv.apple.com",
    "spotify.com", "open.spotify.com",
    "tidal.com", "www.tidal.com",
    "deezer.com", "www.deezer.com",
    "crunchyroll.com", "www.crunchyroll.com",
    "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", "xhamster2.com",
    "youporn.com", "redtube.com", "tube8.com", "spankbang.com", "eporner.com",
    "beeg.com", "tnaflix.com", "thumbzilla.com", "porntrex.com", "hqporner.com",
    "drtuber.com", "motherless.com", "youjizz.com", "vporn.com", "brazzers.com",
    "redgifs.com", "erome.com", "hentaihaven.xxx", "hentaimama.io",
    "uncensoredhentai.xxx", "hentaiworld.tv", "hentaiestream.com", "hentaigasm.com",
    "animeidhentai.com", "muchohentai.com", "kuroani.me", "hentaidude.com",
    "hentaiyes.com", "rule34video.com", "multporno.com", "3dhentai.net",
    "sfmcompile.club", "3dporn.com", "3dporndude.com", "bignsfw.com", "toonporn.com",
    "hentaizone.com", "nhentai.net", "hitomi.la", "luscious.net", "hentai2read.com",
    "tsumino.com", "pururin.to", "e-hentai.org", "8muses.com", "fakku.net",
    "hentaifox.com", "asmhentai.com", "realbooru.com", "gelbooru.com", "rule34.xxx",
    "konachan.com.de", "e621.net", "sankakucomplex.com", "yande.re", "xbooru.com",
    "danbooru.donmai.us", "paheal.net", "tbib.org", "hentai-foundry.com", "booru.org",
    "hypnohub.net", "nijie.info", "adultcolony-api.vercel.app", "onlyfans.com",
    "fansly.com", "manyvids.com", "chaturbate.com", "stripchat.com", "livejasmin.com",
    "bongacams.com", "cam4.com", "hanime.tv", "hentaicloud.com", "hentaivideoworld.com",
    "comicporn.xxx", "cartoontube.xxx", "simpsonsporn.com", "familyguyporn.com",
    "hentaihand.com", "multporn.net",
})


class URLValidationError(ValueError):
    """The URL is malformed, uses a bad scheme, or is too long."""


class BlockedSiteError(ValueError):
    """The site is blocked by content policy."""


class SSRFError(ValueError):
    """The URL resolves to a non-public IP address."""


def _hostname_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def is_blocked_domain(hostname: str) -> bool:
    """True for blocked sites and their subdomains."""
    host = hostname.lower().lstrip(".")
    return any(host == d or host.endswith("." + d) for d in BLOCKED_DOMAINS)


def validate_url(url: str) -> str:
    """Cheap syntactic checks. Returns the stripped URL or raises."""
    url = (url or "").strip()
    if not url:
        raise URLValidationError("URL must not be empty.")
    if len(url) > MAX_URL_LENGTH:
        raise URLValidationError(f"URL is too long (max {MAX_URL_LENGTH} characters).")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise URLValidationError("Only http:// and https:// URLs are allowed.")
    hostname = _hostname_of(url)
    if not hostname:
        raise URLValidationError("URL must contain a hostname.")
    if is_blocked_domain(hostname):
        raise BlockedSiteError(
            f"{hostname} is blocked by this service's content policy. "
            "This source is not available for downloading."
        )
    return url


def resolve_host(hostname: str) -> list[str]:
    """DNS-resolve a hostname to a deduplicated list of IP strings."""
    try:
        infos = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise SSRFError(f"Could not resolve hostname {hostname!r}: {exc}") from exc
    ips: list[str] = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    if not ips:
        raise SSRFError(f"Hostname {hostname!r} resolved to no addresses.")
    return ips


def ip_is_public(ip: str) -> bool:
    """Reject private, loopback, link-local, multicast, reserved, unspecified."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def assert_url_safe(url: str) -> str:
    """Full SSRF gate: validate syntax, then reject non-public DNS targets."""
    url = validate_url(url)
    hostname = _hostname_of(url)
    for ip in resolve_host(hostname):
        if not ip_is_public(ip):
            log.warning("SSRF blocked: %s resolves to non-public IP %s", url, ip)
            raise SSRFError(
                "This URL resolves to a private or internal address and was blocked."
            )
    return url


_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_WHITESPACE_RUN = re.compile(r"\s+")


def sanitize_filename(name: str, max_length: int = 180) -> str:
    """Make a user/extractor-supplied filename safe for disk and download.

    Basename semantics first: any directory components are dropped, so
    "../../etc/passwd" becomes "passwd" and can never traverse. Then illegal
    characters and control codes are stripped, leading dots removed (no hidden
    files), whitespace collapsed, and length capped. Never returns "".
    """
    name = (name or "").replace("\\", "/").split("/")[-1]
    name = _ILLEGAL_FILENAME_CHARS.sub("", name)
    name = _WHITESPACE_RUN.sub(" ", name).strip(" .")
    if len(name) > max_length:
        stem, dot, ext = name.rpartition(".")
        # keep the extension when truncating
        name = (stem[: max_length - len(ext) - 1] + dot + ext) if dot and len(ext) <= 10 else name[:max_length]
        name = name.strip(" .")
    return name or "download"


def cookie_path_for_domain(domain: str, cookies_dir: Path) -> Path:
    """Map a page domain to its cookie file: <cookies_dir>/<domain>.txt.

    The domain is reduced to its registrable part heuristically (last two
    labels) so www.youtube.com and youtube.com share one file.
    """
    host = (domain or "").lower().strip().lstrip(".")
    host = re.sub(r"[^a-z0-9.\-]", "", host)
    labels = [p for p in host.split(".") if p]
    short = ".".join(labels[-2:]) if len(labels) >= 2 else host
    if not short:
        raise URLValidationError("Cannot derive a cookie domain from an empty host.")
    return cookies_dir / f"{short}.txt"


def sanitize_domain(domain: str) -> str:
    """Validate a domain supplied to the admin cookie endpoints."""
    domain = (domain or "").lower().strip()
    if not re.fullmatch(r"[a-z0-9]([a-z0-9.\-]{0,253}[a-z0-9])?", domain):
        raise URLValidationError(f"Invalid domain: {domain!r}")
    return domain
