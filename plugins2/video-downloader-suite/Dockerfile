# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DENO_INSTALL=/usr/local

# ffmpeg (download/merge), curl (healthcheck), deno (yt-dlp JS challenges),
# plus the libs Playwright's Chromium needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg curl ca-certificates unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && deno --version \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && rm -rf /root/.cache/ms-playwright/*-ffmpeg || true
# NOTE: the line above keeps only the chromium build; harmless if it no-ops.

# Non-root runtime user (owns /app and /data).
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /data/downloads /data/cookies \
    && chown -R appuser:appuser /app /data
# Playwright browsers were installed as root above; make them readable.
RUN chmod -R a+rX /root/.cache/ms-playwright 2>/dev/null || true

COPY --chown=appuser:appuser . .

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
