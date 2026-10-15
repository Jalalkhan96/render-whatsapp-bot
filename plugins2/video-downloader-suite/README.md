# Universal Video Downloader

Paste a link from YouTube, TikTok, Instagram, Reddit, X/Twitter, Facebook,
Vimeo, Twitch, Dailymotion — or any site with a video — and get a downloadable file.

**How it works:** `POST /api/analyze` inspects the link (title, thumbnail,
formats, quality presets). `POST /api/download` queues a Celery job that runs a
**7-stage fallback chain** — yt-dlp (default → impersonation → cookies →
generic extractor) → gallery-dl → direct site extractors (TikTok, Reddit,
Instagram) → headless-Chromium network sniffing — and the
browser gets live progress over Server-Sent Events.

Only download content you own or have explicit permission to download.

---

## Supported sites

Beyond yt-dlp's thousands of built-in extractors, the service ships dedicated
direct extractors that run as fallback-chain stage 5b (after yt-dlp, before
Playwright sniffing):

| Platform | Module | What it extracts |
|---|---|---|
| TikTok | `app/extractors/general/tiktok.py` | Signed mp4 (watermarked + no-watermark), cover, duration — no login needed |
| Reddit | `app/extractors/general/reddit.py` | Progressive mp4, DASH video/audio, HLS manifest from post JSON or bare `v.redd.it/<id>` |
| Instagram | `app/extractors/general/instagram.py` | Direct mp4 from public reels/posts — no login needed; login-walled pages fall through to the yt-dlp+cookies stage |
| xVideos / xnxx / Pornhub / YouPorn / RedTube / xHamster / Eporner / Erome / RedGifs / Motherless / Tnaflix / LetsJerkTV | `app/extractors/adult/*.py` | Direct mp4/HLS URLs (implemented; not wired into the fallback chain) |

Live smoke tests: `python3 scripts/test_general_extractors.py <url>` and
`python3 scripts/test_adult_extractors.py <url>`.


## Quick start

```bash
cp .env.example .env        # adjust if needed
docker compose up --build   # api on http://localhost:8000
```

Open http://localhost:8000 — the single-page UI is served by the API itself.

With the optional nginx reverse proxy:

```bash
docker compose --profile proxy up --build   # http://localhost
```

Local dev without Docker (needs Python 3.12, ffmpeg, deno, redis running):

```bash
pip install -r requirements.txt
python -m playwright install chromium
export REDIS_URL=redis://localhost:6379/0 DOWNLOAD_DIR=./data/downloads COOKIES_DIR=./data/cookies
uvicorn app.main:app --reload &
celery -A app.workers.celery_app.celery worker --loglevel=info -Q downloads &
celery -A app.workers.celery_app.celery beat --loglevel=info &
pytest
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379/0` | Celery broker + job state + rate limits |
| `DOWNLOAD_DIR` | `/data/downloads` | Finished files (local backend) |
| `COOKIES_DIR` | `/data/cookies` | `<domain>.txt` Netscape cookie files |
| `STORAGE_BACKEND` | `local` | `local` or `s3` (S3 / Cloudflare R2) |
| `MAX_FILE_SIZE` | `2147483648` (2 GiB) | Per-file cap; oversized downloads abort |
| `FILE_TTL_SECONDS` | `3600` | Finished files deleted after this long |
| `JOB_TIMEOUT` | `900` | Hard cap per download job (15 min) |
| `RATE_LIMIT_PER_MINUTE` | `10` | Per-IP quota on analyze/download (`0` = off) |
| `API_KEY` | _(empty)_ | When set, required via `X-API-Key` header or `?api_key=` param; admin endpoints require it to be set at all |
| `PUBLIC_BASE_URL` | _(empty)_ | Public URL of this instance (domain or tunnel URL); reported by `GET /api/info` and logged on startup |
| `CORS_ORIGINS` | `*` | Comma-separated allowed CORS origins (`*` = API callable from anywhere) |
| `SELF_PING_ENABLED` | `true` | API pings its own `/ping` every `SELF_PING_INTERVAL_SECONDS` so free hosts (Render, etc.) never sleep |
| `SELF_PING_INTERVAL_SECONDS` | `300` | Keep-alive ping interval (minimum 60) |
| `PROXY_LIST` | _(empty)_ | Comma-separated proxy URLs, rotated per attempt |
| `S3_ENDPOINT_URL` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` / `S3_PREFIX` | — | S3/R2 backend (R2: `https://<account>.r2.cloudflarestorage.com`) |
| `YTDLP_UPDATE_ON_START` | `true` | `pip install -U yt-dlp` on boot (keeps current on failure); also runs daily at 03:00 UTC via beat |
| `DENO_PATH` | `deno` | JS runtime yt-dlp needs for YouTube challenges |
| `LOG_LEVEL` | `INFO` | — |

## API

Base URL `http://localhost:8000`. If `API_KEY` is set, add `-H "X-API-Key: …"`
(or `?api_key=…` for the SSE stream and file links, which can't set headers).

**Where am I? (public API discovery)**

```bash
curl localhost:8000/api/info
# → {name, version, public_base_url, docs_url, openapi_url, auth_required}
```

Interactive Swagger UI lives at `/docs`. To expose the API on a public HTTPS
URL from anywhere (no account needed), run the bundled Cloudflare Tunnel:

```bash
docker compose --profile tunnel up --build -d
docker compose logs -f tunnel   # copy the https://xxx.trycloudflare.com URL
# then set PUBLIC_BASE_URL=<that URL> in .env and restart the api service
```

See `README-HOSTING.md` for hosting options and remote `curl` examples.

**Analyze a link**

```bash
curl -X POST localhost:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# → title, thumbnail, duration, uploader, platform, formats[], presets[],
#   playlist entries (max 50), stage_used
```

**Start a download** (returns immediately; the worker does the work)

```bash
curl -X POST localhost:8000/api/download \
  -H 'Content-Type: application/json' \
  -d '{"url": "…", "preset": "720p", "subtitles": true, "embed_thumbnail": false}'
# → {"job_id": "…"}   (preset | format_id | default best; audio_only flag for audio)
```

**Poll status / stream progress / fetch file / cancel**

```bash
curl localhost:8000/api/jobs/<job_id>
curl -N localhost:8000/api/jobs/<job_id>/events        # Server-Sent Events
curl -OJ localhost:8000/api/files/<job_id>             # the finished file
curl -X DELETE localhost:8000/api/jobs/<job_id>        # cancel + delete files
```

**Health**

```bash
curl localhost:8000/health
# → {"status":"ok","ytdlp_version":"…","ffmpeg":true,"ffprobe":true,"deno":true,"redis":true}
```

**Admin (API key required)**

```bash
# upload/replace cookies for a domain (Netscape cookies.txt format)
curl -X POST localhost:8000/api/admin/cookies/instagram.com \
  -H "X-API-Key: $API_KEY" -F "file=@instagram.com.txt"
curl -H "X-API-Key: $API_KEY" localhost:8000/api/admin/cookies
curl -X DELETE -H "X-API-Key: $API_KEY" localhost:8000/api/admin/cookies/instagram.com
curl -X POST -H "X-API-Key: $API_KEY" localhost:8000/api/admin/ytdlp/update
```

## Cookies

Private/age-gated/login-walled content needs cookies:

1. In your browser, install a "Get cookies.txt" extension and export cookies
   for the site while logged in.
2. Upload via the admin endpoint above, or drop the file directly at
   `/data/cookies/<domain>.txt` (e.g. `instagram.com.txt`, `youtube.com.txt`).
3. Stage 3 of the fallback chain picks it up automatically; files are `chmod 600`.

## Adding a new platform

Edit `app/core/platforms.py` — add one entry, no core changes needed:

```python
"example.com": {
    "name": "Example",
    "ydl_opts": {"impersonate": "chrome"},  # any yt_dlp.YoutubeDL params
    "requires_cookies": False,              # shows a hint when downloads fail
    "notes": "Anything operators should know.",
},
```

Subdomains match automatically (`www.example.com`, `m.example.com`).

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `HTTP 403` / "blocked the request (bot protection)" | Datacenter IPs get flagged. Upload fresh cookies for the domain (admin API), or set `PROXY_LIST` to residential proxies. |
| "Sign in to confirm you're not a bot" (YouTube) | YouTube is challenging the server IP. Add `youtube.com` cookies from a logged-in browser; as a last resort use a proxy. |
| `ffmpeg not found` | The Docker image bundles ffmpeg. In local dev: `apt install ffmpeg` / `brew install ffmpeg`. |
| "All download methods failed" on Instagram/Facebook private posts | Upload cookies for that domain — private content is unreachable anonymously. |
| Slow first YouTube analyze | Deno is solving JS challenges; subsequent runs are faster. Check `/health` shows `deno: true`. |
| Job stuck at 0% then `failed: File is too large` | Lower `MAX_FILE_SIZE`, or pick a smaller preset. |
| `410` on `/api/files/<id>` | The file expired (`FILE_TTL_SECONDS`, default 1h) and was cleaned up — download again. |
| `429 Rate limit exceeded` | Per-IP quota (`RATE_LIMIT_PER_MINUTE`); wait a minute or raise it. |

## Known limitations

- **DRM** (Netflix, Disney+, Spotify, …) cannot be downloaded by any tool; these
  domains are refused outright with a clear message.
- **Private content** needs your cookies; without them only public media works.
- **Datacenter IPs** are aggressively bot-checked by YouTube/TikTok/Instagram.
  Residential proxies and/or cookies are the practical workaround.
- **Sites change often** — extractors break when sites redesign. The container
  auto-updates yt-dlp on boot and daily; the Playwright sniffing stage is the
  last-resort net for sites yt-dlp doesn't cover yet.
- **Live streams** are not supported (only finished VODs/clips).
- SSRF protection validates the page URL and every discovered media URL, but
  yt-dlp/ffmpeg follow redirects internally, so DNS rebinding *during* their own
  requests is a documented residual risk — don't point this service at URLs you
  don't trust, and run it network-isolated if that's a concern.

## Project layout

```
app/main.py                 FastAPI app, /health, serves the frontend
app/config.py               pydantic-settings (.env)
app/schemas.py              Pydantic v2 models
app/api/                    routes_analyze.py, routes_download.py, routes_admin.py
app/core/downloader.py      format cleaning, presets, yt-dlp option building
app/core/fallback.py        7-stage fallback chain + friendly errors
app/core/platforms.py       domain → yt-dlp options registry
app/core/security.py        SSRF gate, URL validation, filename sanitizing
app/core/ratelimit.py       Redis rate limiting + API key auth
app/core/jobstore.py        job state in Redis (worker ↔ API)
app/workers/                celery_app.py, tasks.py (download job, beat jobs)
app/storage/                base.py (interface), local.py, s3.py (S3/R2)
frontend/index.html         single-page UI (Tailwind CDN, SSE progress, history)
tests/                      pytest: security, formats, fallback chain
Dockerfile / docker-compose.yml / nginx.conf / requirements.txt / .env.example
```
