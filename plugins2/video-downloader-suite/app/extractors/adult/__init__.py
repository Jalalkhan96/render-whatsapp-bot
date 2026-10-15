"""Adult-site extractors: direct media-URL scraping for 9 tube platforms."""
from .base import AdultBase, AdultExtractionError
from .registry import extract, match_extractor, supported_platforms

__all__ = ["AdultBase", "AdultExtractionError", "extract", "match_extractor",
           "supported_platforms"]
