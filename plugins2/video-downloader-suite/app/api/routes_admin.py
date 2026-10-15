"""Admin endpoints: cookie management, job listing, yt-dlp update.

All routes require the API key (and are disabled entirely when API_KEY is unset).
Cookie files live in /data/cookies/<domain>.txt (Netscape format).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile

from app.config import get_settings
from app.core import jobstore
from app.core.ratelimit import AdminKey
from app.core.security import sanitize_domain
from app.schemas import CookieUploadResponse, JobResponse
from app.workers.tasks import update_ytdlp

log = logging.getLogger("uvd.api.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"],
                   dependencies=[Depends(AdminKey)])

MAX_COOKIE_BYTES = 256 * 1024


@router.get("/cookies")
async def list_cookies() -> dict:
    cookies_dir = get_settings().COOKIES_DIR
    cookies_dir.mkdir(parents=True, exist_ok=True)
    return {"domains": sorted(p.stem for p in cookies_dir.glob("*.txt"))}


@router.post("/cookies/{domain}", response_model=CookieUploadResponse)
async def upload_cookies(domain: str, file: UploadFile) -> CookieUploadResponse:
    """Upload (or replace) the Netscape-format cookie file for a domain."""
    domain = sanitize_domain(domain)
    data = await file.read()
    if len(data) > MAX_COOKIE_BYTES:
        raise HTTPException(status_code=413, detail="Cookie file too large.")
    cookies_dir = get_settings().COOKIES_DIR
    cookies_dir.mkdir(parents=True, exist_ok=True)
    path = cookies_dir / f"{domain}.txt"
    path.write_bytes(data)
    path.chmod(0o600)
    log.info("cookie file updated for %s (%d bytes)", domain, len(data))
    return CookieUploadResponse(domain=domain, path=str(path))


@router.delete("/cookies/{domain}", status_code=204)
async def delete_cookies(domain: str):
    domain = sanitize_domain(domain)
    path = get_settings().COOKIES_DIR / f"{domain}.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No cookie file for this domain.")
    path.unlink()


@router.get("/jobs", response_model=list[JobResponse])
async def list_jobs(limit: int = 50) -> list[JobResponse]:
    jobs: list[JobResponse] = []
    for job_id in await jobstore.list_job_ids(limit=min(limit, 200)):
        job = await jobstore.get_job(job_id)
        if job:
            jobs.append(job)
    return jobs


@router.post("/ytdlp/update")
async def trigger_ytdlp_update() -> dict:
    """Queue a yt-dlp self-update on the worker (keeps current version on failure)."""
    task = update_ytdlp.delay()
    return {"task_id": task.id, "status": "queued"}
