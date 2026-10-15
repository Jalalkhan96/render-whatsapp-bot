# Adult-site extractors

Direct media-URL scrapers for 12 adult tube platforms, used as an extra stage
in the Universal Video Downloader. All HTTP goes through `curl_cffi` with
Chrome impersonation (`chrome120`) + a browser UA, one retry on transient
failures.

Entry point:

```python
from app.extractors.adult import extract, AdultExtractionError

try:
    info = extract("https://www.xvideos.com/video.omdmvlvce73/56266882")
except AdultExtractionError as exc:
    ...  # unsupported platform, blocked page, or no media found
```

Result shape:

```json
{
  "platform": "xvideos",
  "title": "...",
  "direct_urls": [{"quality": "high", "url": "https://...mp4", "ext": "mp4"}],
  "thumbnail": "https://...",
  "duration": 600.0,
  "webpage_url": "https://..."
}
```

## Per-platform method & limitations

| Platform | Method | Status / limitation |
|---|---|---|
| **Eporner** (`eporner.py`) | Video page JSON-LD `VideoObject` → `contentUrl` (direct mp4), `name`, ISO-8601 `duration`, `thumbnailUrl` | Intermittent "Age Verification" interstitial for fresh sessions; extractor warms the session via the homepage and retries. Public API (`/api/v2/video?id=`) returned empty bodies on 2026-10-02, so it is not used. ✅ live-verified |
| **Redgifs** (`redgifs.py`) | Public API only: `GET /v2/auth/temporary` (anonymous JWT, no account) → `GET /v2/gifs/{id}` with `Authorization: Bearer` → `urls.hd` / `urls.sd` | Clean, no page scraping. ✅ live-verified |
| **xVideos** (`xvideos.py`) | `html5player.setVideoUrlHigh/Low('...')`, `setVideoHLS('...')`, og tags | Same template as xnxx. ✅ live-verified |
| **xnxx** (`xnxx.py`) | Same as xVideos (same owner/template) | ✅ live-verified |
| **Pornhub** (`pornhub.py`) | `mediaDefinitions` JS array → `videoUrl` + `quality` (HLS URLs) | Works with Chrome impersonation; may be blocked from some datacenter IPs — raises a clear error then. ✅ live-verified |
| **Erome** (`erome.py`) | Album page `<video><source src="https://v*.erome.com/..._720p.mp4" label res>` | ✅ live-verified |
| **xHamster** (`xhamster.py`) | xplayer JSON `"file"` entries, JSON-LD `VideoObject` fallback | Bot-walled/timeouts from this network on 2026-10-02 — parsing implemented but **not live-verified**; raises a clear error when blocked |
| **Motherless** (`motherless.py`) | Page JS `__fileurl` / `fileurl` vars | Site hard-resets connections from this network on 2026-10-02 — **not live-verified**; raises a clear error when blocked |
| **LetsJerk** (`letsjerktv.py`) | WordPress post → primary non-ad `<iframe>` embed URL (the actual video lives on a rotating external JS host) | **Limited**: returns the embed URL (ext `html`), not a direct mp4. Use yt-dlp generic extractor or the Playwright network-sniff stage for the actual file |
| **TnaFlix** (`tnaflix.py`) | Video page JSON-LD `VideoObject` → `embedUrl` → `player.tnaflix.com/video/{id}` embed page → `<video><source src="...-720p.mp4?secure=.." size="720">` tags (144p–720p) | The `secure` token is time-limited — use URLs promptly. Embed URL accepted directly as input. ✅ live-verified 2026-10-02 |
| **YouPorn** (`youporn.py`) | MindGeek template: video page `mediaDefinitions` JS array → `videoUrl` + `format` (shares `mindgeek.py` parser with RedTube) | Intermittently bot-walled from datacenter IPs (like Pornhub); extractor warms the session and retries once. ✅ live-verified 2026-10-02 |
| **RedTube** (`redtube.py`) | Same MindGeek `mediaDefinitions` parser (`mindgeek.py`) | Flaky from this network (bot-wall page / timeouts); ✅ live-verified once via Python 2026-10-02 — treat as best-effort, raises a clear error when blocked |

## Integrating with the FastAPI service

The extractors return plain direct URLs, so they slot into
`app/core/fallback.py` as a new stage between the yt-dlp stages and
Playwright: run `extract(url)` when the URL's host matches one of
`match_extractor()`'s domains; on `AdultExtractionError`, continue down the
chain. `direct_urls` can be fed straight to the existing chunked-range
downloader (`/functions/stream-video-from-origin`-style proxy logic already
in `app/`), or handed to yt-dlp with `--no-playlist`.

## CLI smoke test

```bash
python3 scripts/test_adult_extractors.py https://www.xvideos.com/video.omdmvlvce73/56266882
python3 scripts/test_adult_extractors.py https://www.redgifs.com/watch/...
```

## Tests

```bash
pytest tests/test_adult_extractors.py -v   # mocked-HTTP unit tests
```

Keep request volume low: these sites bot-guard aggressively. The smoke
script fetches at most one video page per run.
