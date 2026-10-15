"""Job state in Redis. One hash per job: `job:<job_id>`.

Written by the Celery worker, read by the API (progress polling + SSE).
Hashes expire after 7 days; finished *files* expire sooner (FILE_TTL_SECONDS)
via the cleanup task, so a stale job reports done-but-gone (HTTP 410).
"""
from __future__ import annotations

import time
import uuid

import redis.asyncio as aioredis

from app.config import get_settings
from app.schemas import JobResponse, JobStatus

_redis: aioredis.Redis | None = None

JOB_TTL_SECONDS = 7 * 24 * 3600


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _redis


def _key(job_id: str) -> str:
    return f"job:{job_id}"


def new_job_id() -> str:
    return uuid.uuid4().hex


async def create_job(job_id: str, url: str, title: str | None = None) -> None:
    r = get_redis()
    await r.hset(_key(job_id), mapping={
        "job_id": job_id,
        "status": JobStatus.QUEUED.value,
        "progress": "0",
        "url": url[:2048],
        "title": title or "",
        "created_at": str(int(time.time())),
    })
    await r.expire(_key(job_id), JOB_TTL_SECONDS)


async def update_job(job_id: str, **fields: object) -> None:
    r = get_redis()
    str_fields = {k: ("" if v is None else str(v)) for k, v in fields.items()}
    await r.hset(_key(job_id), mapping=str_fields)
    await r.expire(_key(job_id), JOB_TTL_SECONDS)


async def get_job(job_id: str) -> JobResponse | None:
    r = get_redis()
    data = await r.hgetall(_key(job_id))
    if not data:
        return None
    try:
        status = JobStatus(data.get("status") or "queued")
    except ValueError:
        status = JobStatus.QUEUED
    try:
        progress = float(data.get("progress") or 0)
    except ValueError:
        progress = 0.0
    return JobResponse(
        job_id=job_id,
        status=status,
        progress=max(0.0, min(100.0, progress)),
        speed=data.get("speed") or None,
        eta=data.get("eta") or None,
        error=data.get("error") or None,
        stage_used=data.get("stage_used") or None,
        filename=data.get("filename") or None,
        title=data.get("title") or None,
    )


async def delete_job(job_id: str) -> bool:
    r = get_redis()
    return bool(await r.delete(_key(job_id)))


async def list_job_ids(limit: int = 100) -> list[str]:
    r = get_redis()
    ids: list[str] = []
    async for key in r.scan_iter("job:*", count=100):
        ids.append(key.split(":", 1)[1])
        if len(ids) >= limit:
            break
    return ids
