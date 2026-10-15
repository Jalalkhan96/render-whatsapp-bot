# Video & Audio Downloader API — Render Edition

A FastAPI REST API backed by `yt-dlp` and FFmpeg. It can inspect and download individual, publicly accessible videos from many sites supported by yt-dlp, retrieve audio as MP3, and expose job progress over HTTP. It is intended to be called from your own backend, app, or bot.

**Important limitations**

- No downloader can promise every website or every URL will work. Sites change their anti-bot systems and media formats frequently. See the [current yt-dlp supported extractors](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md); even listed sites are not guaranteed to work.
- TikTok and other sites may sometimes expose a rendition without a platform watermark. This service downloads a rendition exposed by the site's extractor; it does **not** erase a watermark already embedded in the video frames and cannot guarantee watermark-free output for every site.
- Use only content you own or are allowed to download. The API does not bypass DRM, paywalls, private accounts, or login restrictions.
- The Render Free plan uses temporary disk and can sleep after 15 minutes without inbound traffic. Downloads and job records are temporary. A deployment/restart/sleep may interrupt a download or remove its output. This is best for testing and light personal use, not a high-volume production service.

## 1. API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/` | No | Service summary |
| `GET` | `/health` | No | Render health check |
| `GET` | `/docs` | No | Interactive Swagger API docs |
| `GET` | `/api/capabilities` | `X-API-Key` | Limits and capabilities |
| `POST` | `/api/info` | `X-API-Key` | Inspect video metadata before download |
| `POST` | `/api/download` | `X-API-Key` | Start an asynchronous download job |
| `GET` | `/api/jobs/{job_id}` | `X-API-Key` | Poll progress/status |
| `GET` | `/api/jobs/{job_id}/file` | `X-API-Key` | Fetch completed file |
| `DELETE` | `/api/jobs/{job_id}` | `X-API-Key` | Delete the completed/failed job |

All `/api/*` endpoints require the header `X-API-Key: YOUR_SECRET`. Never put your API key in a URL query string or expose it in frontend JavaScript, a mobile app bundle, a public Git repository, or a shared screenshot. For browser apps, call this API from your own server. `CORS_ORIGINS` is configurable; use your frontend origin(s) rather than `*` when a browser must call the API directly (but CORS is not a replacement for API authentication).

## 2. Deploy to Render Free

### A. Put the project in GitHub

1. Download and extract this ZIP.
2. Open the extracted `video-audio-downloader-backend` folder. The repository root must contain `render.yaml`, `Dockerfile`, `requirements.txt`, and the `app/` directory (do not make another extra nested folder level).
3. Create a repository in GitHub (private is recommended) and push the **contents** of that folder.
4. Ensure `.env` is not uploaded. This project ignores it via `.gitignore` and `.dockerignore`.

### B. Create the Render service

1. Sign in at [Render Dashboard](https://dashboard.render.com/).
2. Select **New + → Blueprint**.
3. Connect the GitHub repository you just created.
4. Select the branch that contains `render.yaml` and review the Blueprint.
5. When Render prompts for `API_KEY`, enter a long random secret. On Windows PowerShell, generate one with:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

6. Confirm deployment. The Blueprint intentionally uses `plan: free` and does **not** declare a persistent disk. The Dockerfile reads Render's injected `PORT` environment variable and binds to `0.0.0.0`.
7. After deployment, open `https://YOUR-SERVICE.onrender.com/health`. Expected response includes `"status":"ok"`.
8. Open `https://YOUR-SERVICE.onrender.com/docs` to use the Swagger interface. Set the `X-API-Key` value using Swagger's `Authorize` control if prompted.

### C. Environment variables

`render.yaml` sets safe Free-plan defaults. In Render → your service → **Environment**, the essential secret is:

- `API_KEY`: your long, random secret. Render's Blueprint asks for it because its value is marked `sync: false`.

Optional variables can also be set in the Render dashboard:

| Variable | Render Free default | Meaning |
|---|---:|---|
| `API_KEY` | Required | Secret request header for `/api/*` |
| `DOWNLOAD_DIR` | `/tmp/video-audio-downloader` | Temporary output folder |
| `MAX_DOWNLOAD_MB` | `150` | Maximum file-size target; larger jobs may fail |
| `MAX_DURATION_SECONDS` | `3600` | Maximum duration (1 hour) |
| `MAX_ACTIVE_JOBS` | `1` | Concurrent downloads; keep at 1 on Free |
| `FILE_TTL_MINUTES` | `10` | Completed files expire after this many minutes without job activity |
| `SOCKET_TIMEOUT_SECONDS` | `15` | Network timeout |
| `CORS_ORIGINS` | `*` | Comma-separated browser origins or `*` |

**Do not upload `.env` to GitHub.** Render environment settings replace the local `.env` file in deployment. If you already exposed a key, rotate it immediately.

## 3. Use the API

In the examples below, replace `BASE_URL` with your Render URL and `YOUR_API_KEY` with the secret you created. Keep the API key on a trusted server, not in public client code.

### Check health (no API key)

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

### Get metadata

```bash
curl -X POST "https://YOUR-SERVICE.onrender.com/api/info" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@publicuser/video/1234567890"}'
```

Use a real public video URL; the example identifier is illustrative.

### Start a video download

```bash
curl -X POST "https://YOUR-SERVICE.onrender.com/api/download" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@publicuser/video/1234567890","media_type":"video","quality":"720p"}'
```

The response contains a `job_id` and starts with `queued` or `downloading`.

Valid options:

- `media_type`: `video` or `audio`
- `quality`: `best`, `1080p`, `720p`, `480p`, or `360p` (used for video; audio becomes MP3)

### Poll the job

```bash
curl "https://YOUR-SERVICE.onrender.com/api/jobs/JOB_ID" \
  -H "X-API-Key: YOUR_API_KEY"
```

Poll every 2–5 seconds until `status` is `completed` or `failed`. Check the `error` value if it fails.

### Download the result

```bash
curl -fL "https://YOUR-SERVICE.onrender.com/api/jobs/JOB_ID/file" \
  -H "X-API-Key: YOUR_API_KEY" \
  -o downloaded-media.mp4
```

For audio requests, use an `.mp3` output name. Download links are temporary and still require `X-API-Key`.

### Node.js server-side example

```js
const BASE_URL = process.env.DOWNLOADER_API_URL;
const API_KEY = process.env.DOWNLOADER_API_KEY;

async function downloadVideo(url) {
  const headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  };

  const started = await fetch(`${BASE_URL}/api/download`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, media_type: "video", quality: "720p" }),
  });
  if (!started.ok) throw new Error(`Start failed (${started.status}): ${await started.text()}`);
  const job = await started.json();

  // Keep polling in your own backend; do not block a web request indefinitely.
  return { jobId: job.job_id, statusUrl: `${BASE_URL}/api/jobs/${job.job_id}` };
}
```

## 4. Local setup on Windows

You can use Python directly (install FFmpeg separately) or Docker Desktop. Docker is closer to Render.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. In PowerShell, enter the extracted project folder.
3. Copy the example environment file and edit it:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

4. Replace `API_KEY` with a secret created by the Python command above.
5. Start the service:

   ```powershell
   docker compose up --build
   ```

6. Open `http://localhost:8000/docs`.

Stop it with `Ctrl+C`; use `docker compose down` to stop the containers. The named Docker volume keeps local outputs across restarts; Render Free does not provide that persistence.

## 5. Site support and watermarks

The project uses the latest available `yt-dlp[default]` package at build time and bundles FFmpeg plus Node.js 22 for sites that need JavaScript challenge support. This gives broad extractor coverage, not a guarantee for every URL. Public site pages may fail if a provider changes its API, imposes geographic restrictions, requires sign-in, rate-limits the service, or blocks hosting IP addresses. Keep the dependency updated and redeploy when a site breaks.

This API does not promise watermark removal. For TikTok or another source, an extractor may expose a rendition without a watermark; if it does, yt-dlp can download the rendition. If the only available public rendition includes a watermark, this service does not erase it from the frames. No authentication/cookie bypass, private-profile downloads, DRM circumvention, or paywall bypass is implemented.

## 6. Render Free limitations

- Free web services sleep after 15 minutes without inbound traffic, and the next request may have cold-start delay.
- Local files are ephemeral and can disappear after a restart, redeploy, or spin-down; the free service has no persistent disk.
- The service is configured for one concurrent download, 150 MB files, up to one hour duration, and 10-minute file retention to reduce memory/disk pressure.
- Heavy 1080p downloads or audio/video merging can still exceed free CPU/memory limits. If large or frequent downloads are necessary, use a paid instance and object storage (e.g., S3-compatible storage) rather than raising limits blindly.
- The in-memory job queue resets on restart. Do not scale to multiple workers/instances without moving job state to a shared queue and storage.

## 7. Troubleshooting

- **401**: Send `X-API-Key` and confirm it exactly matches Render's `API_KEY`.
- **503 API_KEY is not configured**: Set `API_KEY` in Render Environment and redeploy.
- **422 unsupported/private URL**: Try a public direct post URL, not a profile, search, private page, or watch-later page. Some platforms are not supported or currently broken.
- **429 busy**: Wait for the current download to finish; Render Free is configured for one active job.
- **404 job not found**: The service restarted/spun down, or the job expired; start it again.
- **File expired**: Start a new job and download the result within the TTL.
- **YouTube says JavaScript runtime missing**: Check logs for `node --version`; this Dockerfile installs Node.js 22, and yt-dlp is installed with its `default` extras including EJS scripts.
- **A site stops working**: Check yt-dlp release notes/issues; sites change frequently. A successful health check only verifies that the API server is running, not that a particular media provider is currently downloadable.

## License / third-party notes

The project source and dependencies retain their respective licenses. Review yt-dlp and FFmpeg licensing if redistributing a modified image or offering a public service. Do not advertise the API as affiliated with the social media platforms it supports.
