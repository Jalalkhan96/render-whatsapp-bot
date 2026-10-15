# ABIX-AE integration — Universal Video Downloader Suite

The complete `video-downloader` service is kept in this folder and is exposed to the main ABIX bot through `../video-downloader-suite.js`.

## Separate bot commands

- `-vdmenu` — owner-only menu
- `-vdanalyze <URL>` — analyze without downloading
- `-vddownload [480p|720p|1080p|mp3|m4a|best] <URL>` — queue and download
- `-vdstatus <job_id>` — poll a job
- `-vdcancel <job_id>` — cancel/delete a job and stored file
- `-vdhealth` — health check
- `-vdinfo` — service information

The existing `-downloadvideo` command is not replaced.

## Configuration

Set these environment variables in the ABIX bot environment:

```env
VIDEO_DOWNLOADER_URL=http://127.0.0.1:8000
VIDEO_DOWNLOADER_API_KEY=
VD_MAX_SEND_MB=64
VD_POLL_MS=2500
VD_MAX_WAIT_MS=1200000
```

`VIDEO_DOWNLOADER_URL` can point to a separately deployed FastAPI/Celery service. The ABIX process does **not** start a second Python/Redis/Celery stack automatically; this avoids duplicate worker processes and protects the bot from another large runtime footprint.

For large results, `-vddownload` returns a service URL rather than buffering the file into the bot process. The default in-process WhatsApp send limit is 64 MiB and can be lowered with `VD_MAX_SEND_MB`.

## Service runtime

Use the supplied `Dockerfile`/`docker-compose.yml` inside this folder to run the Python service. It uses Redis + Celery for jobs and expires completed local files using `FILE_TTL_SECONDS`.

Only download content you own or have permission to download.
