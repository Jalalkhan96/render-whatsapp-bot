FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/tmp \
    TMPDIR=/tmp

WORKDIR /app

# FFmpeg handles audio extraction and merging. Node 22 enables yt-dlp's
# supported JavaScript challenge runtime for sites that need it (notably YouTube).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
       > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && node --version \
    && ffmpeg -version | head -n 1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/video-audio-downloader \
    && chown -R appuser:appuser /app /tmp/video-audio-downloader

USER appuser

EXPOSE 10000

# Render injects PORT. Locally, this falls back to 10000 unless docker-compose sets PORT=8000.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers"]
