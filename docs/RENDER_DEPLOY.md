# Render deployment (ABIX-AE)

This repository is configured for a Docker-based Render Web Service. Deploy the repository from its root so Render can find `render.yaml` and `Dockerfile`.

## Important hosting requirements

- The included Blueprint uses the `1c-2g` service plan and a 2 GB persistent disk. Render persistent disks require a paid service. This avoids relying on an ephemeral filesystem for WhatsApp credentials and JSON-backed bot state.
- `docker-entrypoint.sh` copies the checked-in seed files into the disk without overwriting existing state, then maps `data/`, `database/`, the broadcast suite's auth directory, and `baileys_store.json` to persistent storage.
- The app binds to Render's injected `PORT` on `0.0.0.0`; do not hard-code the service port in Render's environment settings.
- `/healthz` is the Render liveness endpoint. `/health` reports WhatsApp/Telegram connectivity and may return `503` during first-time pairing or reconnection.
- Production Gemini uses the official API, avoiding the extra Web2API child process and its runtime package installation. Set `GEMINI_API_KEY` in Render's Environment page.
- Enter `OWNER_NUMBER` as digits only, including the country code, without `+`. On first boot, watch the service logs for the WhatsApp pairing code and link the device. After pairing, keep the persistent disk attached and do not run more than one active instance.
- `NODE_OPTIONS=--max-old-space-size=1280` limits V8 heap growth for the 2 GB plan. Heavy media tasks may still need concurrency limits and testing under expected traffic.

## Deploy

1. Push this project to a private GitHub repository. Do not commit `.env`, `session/`, cookies, or API credentials.
2. In Render, choose **New → Blueprint**, connect the repository, and review the `render.yaml` service/disk settings.
3. Supply `OWNER_NUMBER` and `GEMINI_API_KEY` when prompted. Add optional keys (Apify, Telegram, Turso/Postgres, upload providers, etc.) through the service's Environment page only when needed.
4. Deploy. Open the logs; confirm dependency installation, command loading, `Web server listening`, and WhatsApp pairing/connection.
5. Verify `https://YOUR-SERVICE.onrender.com/healthz` returns HTTP 200, then inspect `/api/status` for bot, memory, and disk status.

## Free-plan caveat

The free Render web service plan does not support a persistent disk and has 512 MB RAM. It is not recommended for this stateful bot: a restart/deploy can lose the locally updated Baileys session, and the process may run out of memory. A paid service with a persistent disk is required for the configuration in this Blueprint.
