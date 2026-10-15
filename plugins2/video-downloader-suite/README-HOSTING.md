# Where to Host — Universal Video Downloader

This is a **Docker-based** app, so it can run almost anywhere that supports
Docker containers with ~2 GB RAM. Below are the practical options, from
cheapest to most hands-off.

> Requirements to keep in mind:
> - **Needs:** Docker, ~2 GB RAM, ~1–2 GB disk (yt-dlp + FFmpeg + Playwright
>   Chromium), a public URL for downloads.
> - **Playwright Chromium** needs extra system libs (already installed in our
>   `Dockerfile`). Hosts that only run "stateless serverless functions"
>   (Vercel, Netlify, plain Cloudflare Workers) will **not** work.
> - **Redis + a Celery worker** must run alongside the API (Docker Compose
>   handles this: `api`, `worker`, `beat`, `redis` services).

---

## Option 1 — VPS with Docker Compose (recommended, cheapest)

**Best for:** full control, lowest cost, this is what the project was designed for.

Providers (any region close to you):

| Provider | Approx. price | Specs |
|---|---|---|
| [Hetzner](https://www.hetzner.com/cloud) CX23 | ~€5.15/mo | 2 vCPU, 4 GB RAM |
| [Contabo](https://contabo.com) VPS S | ~€4.50/mo | 4 vCPU, 8 GB RAM |
| [DigitalOcean](https://www.digitalocean.com) Basic | ~$6/mo | 1 vCPU, 1 GB RAM (tight — prefer the $12/2 GB plan) |
| [Linode/Akamai](https://www.linode.com) Shared | ~$12/mo | 2 vCPU, 4 GB RAM |

**Steps (Ubuntu 22.04/24.04):**

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# 2. Copy the project to the server
scp video-downloader.zip user@YOUR_SERVER_IP:/tmp/
ssh user@YOUR_SERVER_IP
cd /opt && unzip /tmp/video-downloader.zip && cd video-downloader

# 3. Configure
cp .env.example .env
nano .env        # set API_KEY, DOWNLOAD_DIR, storage settings

# 4. Launch
docker compose build
docker compose up -d

# 5. (Optional) put nginx in front with HTTPS — see nginx.conf in the repo.
```

**Updating later:** `docker compose pull && docker compose up -d --build`
(the beat container runs `yt-dlp -U` daily automatically).

---

## Option 2 — Railway (easiest, no server management)

**Best for:** "just deploy it", free credits to start.

- Sign up at [railway.app](https://railway.app), connect your GitHub repo
  (push this project to a repo first).
- Add a **Redis** plugin/service.
- Deploy the `Dockerfile` as the API service; add a second service from the
  same repo with start command `celery -A app.workers.celery_app.celery_app worker ...`
  and a third with `celery -A app.workers.celery_app.celery_app beat ...`.
  (Or run all three via `docker-compose` style: Railway supports a single
  `Dockerfile` per service, so split the three processes into three services.)
- Set the same environment variables from `.env.example`.
- Railway gives you a public `*.up.railway.app` URL with HTTPS automatically.

Cost: ~$5–20/mo in usage credits after the free trial, depending on downloads.

---

## Option 3 — Render

**Best for:** simple PaaS deploy, similar to Railway.

- Push the project to GitHub.
- Create a **Web Service** from the repo (Docker runtime), a **Background
  Worker** (Celery worker start command), a **Cron Job** (beat), and a
  **Redis** instance — all from [render.com](https://render.com).
- Copy env vars from `.env.example` into each service.
- Render provides HTTPS automatically.

Note: Render's free tier sleeps after 15 min of inactivity, but this app
ships a **built-in self-pinger**: the API calls its own lightweight `/ping`
route every 5 minutes (`SELF_PING_ENABLED` / `SELF_PING_INTERVAL_SECONDS` in
`.env`), which counts as inbound traffic and keeps the service awake. On
Render it automatically uses the `RENDER_EXTERNAL_URL` env var as the ping
target — no configuration needed. Set `SELF_PING_ENABLED=false` to disable it.

---

## Option 4 — Fly.io

**Best for:** cheap global edge hosting, generous free allowance.

- Install `flyctl`, then `fly launch` (Dockerfile detected automatically).
- Add [Upstash Redis](https://upstash.com) or Fly's managed Redis for the
  broker.
- Run the worker as a second Fly app / process group:
  `fly scale` with `[processes]` in `fly.toml` (`app`, `worker`, `beat`).
- Set secrets with `fly secrets set API_KEY=...` etc.

Docs: [fly.io/docs](https://fly.io/docs)

---

## Option 5 — Your own machine / home server

Works fine for personal use:

```bash
cd video-downloader
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8000`. To share outside your network, use a tunnel
(`cloudflared tunnel`) or port-forward with a domain + the included
`nginx.conf` for HTTPS.

---

## Option 6 — Big-cloud (AWS / GCP / Azure)

Only worth it if you already live in that ecosystem:

- **AWS:** ECS Fargate (api + worker task definitions) + ElastiCache Redis,
  or a single EC2 instance running Docker Compose (much simpler).
- **GCP:** Cloud Run for the API + a GCE VM (or Cloud Run jobs) for the
  worker + Memorystore Redis. Note: Cloud Run alone can't host the worker.
- **Azure:** Container Apps (api + worker replicas) + Azure Cache for Redis.

---

## What will NOT work

- **Vercel / Netlify / Cloudflare Pages/Workers:** serverless only — no
  FFmpeg, no Playwright, no long-running worker.
- **Shared cPanel hosting:** no Docker, no persistent processes.
- **Free tiers that sleep** (Render free, Railway trial exhausted): downloads
  die mid-job when the container sleeps.

---

## Quick checklist before going live

1. Set a strong `API_KEY` in `.env` (the frontend and API require it).
2. Set `DOWNLOAD_DIR` to a volume with enough disk space.
3. If expecting traffic, put the included `nginx.conf` in front for TLS and
   rate-limit offloading.
4. Back up cookies (`cookies/` dir) if you download from login-walled sites.
5. Watch disk usage — `FILE_TTL_SECONDS` auto-cleans finished files.

## Access the API from anywhere

Once the stack is running, the JSON API is live at `<base>/api/*` and a
discovery endpoint tells any client where it lives:

```bash
curl https://YOUR-PUBLIC-URL/api/info
# {"name":"Universal Video Downloader","version":"1.0.0",
#  "public_base_url":"https://YOUR-PUBLIC-URL",
#  "docs_url":"https://YOUR-PUBLIC-URL/docs", ...}
```

Interactive docs are always at `<base>/docs` (Swagger UI).

**Fastest public URL — Cloudflare Tunnel (free, no account):**

```bash
docker compose --profile tunnel up --build -d
docker compose logs -f tunnel   # copy the https://xxx.trycloudflare.com URL
```

Then put that URL in `.env` as `PUBLIC_BASE_URL=https://xxx.trycloudflare.com`
and restart the api service (`docker compose up -d api`). From then on
`/api/info` advertises the public URL and the startup log prints it.

**Calling the API remotely** (replace `BASE` and `KEY`):

```bash
BASE=https://xxx.trycloudflare.com
KEY=your-api-key

# 1. Analyze a URL
curl -s -X POST "$BASE/api/analyze" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=..."}'

# 2. Start a download job
curl -s -X POST "$BASE/api/download" \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=...","preset":"best"}'
# -> {"job_id":"..."}

# 3. Watch progress (SSE works through the tunnel too)
curl -N "$BASE/api/jobs/<job_id>/events?api_key=$KEY"

# 4. Check status / download the finished file
curl -s "$BASE/api/jobs/<job_id>?api_key=$KEY"
curl -o video.mp4 "$BASE/api/jobs/<job_id>/file?api_key=$KEY"
```

Notes:
- CORS is open (`CORS_ORIGINS=*` by default), so browser and mobile apps can
  call the API from any origin. Restrict it to your domains in `.env` if you
  want.
- `?api_key=` is accepted as well as the `X-API-Key` header, because plain
  download links and `EventSource` can't set headers.
- The tunnel URL is random per start. For a stable URL, point your own domain
  at the server (Option 1) or use a named Cloudflare Tunnel.

## Rough monthly cost summary

| Route | Cost |
|---|---|
| Hetzner/Contabo VPS | ~€4.50–6 |
| DigitalOcean 2 GB | ~$12 |
| Railway / Render / Fly | ~$5–20 (usage-based) |
| Home server | $0 (+ electricity) |
| AWS/GCP/Azure | $15–60+ |
