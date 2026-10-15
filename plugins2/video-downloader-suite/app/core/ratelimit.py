"""Redis-backed fixed-window rate limiting + optional API key auth."""
from __future__ import annotations

import logging

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request

from app.config import get_settings

log = logging.getLogger("uvd.ratelimit")

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _redis


async def check_rate_limit(key: str, per_minute: int) -> bool:
    """Fixed window: allow up to `per_minute` hits per 60s for `key`."""
    if per_minute <= 0:
        return True
    r = get_redis()
    redis_key = f"rl:{key}"
    async with r.pipeline() as pipe:
        pipe.incr(redis_key)
        pipe.ttl(redis_key)
        count, ttl = await pipe.execute()
    if ttl == -1:  # first hit in this window: arm the expiry
        await r.expire(redis_key, 60)
    return int(count) <= per_minute


async def rate_limit(request: Request) -> None:
    """FastAPI dependency: 429 when the client IP exceeds the per-minute quota."""
    per_minute = get_settings().RATE_LIMIT_PER_MINUTE
    ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(ip, per_minute):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({per_minute} requests/minute). Try again shortly.",
        )


def _extract_api_key(request: Request) -> str | None:
    # Header for fetch() calls; query param for EventSource and plain <a> downloads,
    # which cannot set custom headers.
    return request.headers.get("x-api-key") or request.query_params.get("api_key")


async def require_api_key(request: Request) -> None:
    """Optional auth: enforced only when API_KEY is configured."""
    expected = get_settings().API_KEY
    if not expected:
        return
    if _extract_api_key(request) != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


async def require_admin_key(request: Request) -> None:
    """Admin endpoints always need a key; they are disabled when none is set."""
    expected = get_settings().API_KEY
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Admin endpoints are disabled: set API_KEY in the environment first.",
        )
    if _extract_api_key(request) != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


# Re-usable dependency aliases
RateLimit = Depends(rate_limit)
ApiKey = Depends(require_api_key)
AdminKey = Depends(require_admin_key)
