"""Platform registry: URL -> extractor class, plus the single ``extract(url)`` entry point."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from .base import AdultBase, AdultExtractionError
from .eporner import EpornerExtractor
from .erome import EromeExtractor
from .letsjerktv import LetsjerktvExtractor
from .motherless import MotherlessExtractor
from .pornhub import PornhubExtractor
from .redgifs import RedgifsExtractor
from .redtube import RedtubeExtractor
from .tnaflix import TnaflixExtractor
from .xhamster import XhamsterExtractor
from .xvideos import XvideosExtractor
from .xnxx import XnxxExtractor
from .youporn import YoupornExtractor

_EXTRACTORS: tuple[type[AdultBase], ...] = (
    EpornerExtractor,
    EromeExtractor,
    LetsjerktvExtractor,
    MotherlessExtractor,
    PornhubExtractor,
    RedgifsExtractor,
    RedtubeExtractor,
    TnaflixExtractor,
    XhamsterExtractor,
    XvideosExtractor,
    XnxxExtractor,
    YoupornExtractor,
)

# Longest-match domain routing, same convention as app.core.platforms.
_DOMAIN_MAP: dict[str, type[AdultBase]] = {}
for _cls in _EXTRACTORS:
    for _domain in _cls.domains:
        _DOMAIN_MAP[_domain] = _cls


def match_extractor(url: str) -> type[AdultBase] | None:
    """Return the extractor class for a URL, or None when unsupported."""
    host = (urlparse(url).hostname or "").lower()
    best: str | None = None
    for domain in _DOMAIN_MAP:
        if host == domain or host.endswith("." + domain):
            if best is None or len(domain) > len(best):
                best = domain
    return _DOMAIN_MAP.get(best) if best else None


def supported_platforms() -> list[str]:
    return [cls.platform for cls in _EXTRACTORS]


def extract(url: str) -> dict[str, Any]:
    """Detect the platform from the URL and return the extraction result dict.

    Result: {platform, title, direct_urls: [{quality, url, ext}],
             thumbnail, duration, webpage_url}
    Raises AdultExtractionError when the platform is unsupported or the page
    cannot be scraped.
    """
    cls = match_extractor(url)
    if cls is None:
        raise AdultExtractionError(f"no adult extractor supports {url!r}")
    return cls().extract(url)
