"""xnxx extractor — page parsing shared with xVideos (see xvtube.py)."""
from .xvtube import XvTubeBase


class XnxxExtractor(XvTubeBase):
    platform = "xnxx"
    domains = ("xnxx.com", "xnxx2.com")
