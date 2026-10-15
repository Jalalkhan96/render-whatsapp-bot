"""xVideos extractor — page parsing shared with xnxx (see xvtube.py)."""
from .xvtube import XvTubeBase


class XvideosExtractor(XvTubeBase):
    platform = "xvideos"
    domains = ("xvideos.com",)
