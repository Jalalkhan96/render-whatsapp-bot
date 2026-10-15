"""Download jobs: create, poll, stream progress (SSE), fetch file, cancel."""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse

from app.core import jobstore
from app.core.downloader import resolve_download_options
from app.core.ratelimit import ApiKey, RateLimit
from app.core.security import (
    BlockedSiteError,
    SSRFError,
    URLValidationError,
    assert_url_safe,
)
from app.schemas import DownloadRequest, JobAccepted, JobResponse, JobStatus
from app.workers.celery_app import celery
from app.workers.tasks import download_job
from app.storage.s3 import get_storage

log = logging.getLogger("uvd.api.download")

router = APIRouter(prefix="/api", tags=["downloads"])


@router.post("/download", response_model=JobAccepted, status_code=202,
             dependencies=[RateLimit, ApiKey])
async def create_download(request: DownloadRequest) -> JobAccepted:
    try:
        url = assert_url_safe(request.url)
    except (URLValidationError, SSRFError, BlockedSiteError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        # fail fast on unknown preset / bad format id before queueing
        resolve_download_options(request.preset, request.format_id, request.audio_only)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job_id = jobstore.new_job_id()
    await jobstore.create_job(job_id, url)
    options = {
        "preset": request.preset,
        "format_id": request.format_id,
        "audio_only": request.audio_only,
        "subtitles": request.subtitles,
        "embed_thumbnail": request.embed_thumbnail,
    }
    # task_id == job_id so DELETE can revoke it directly
    download_job.apply_async(args=[job_id, url, options], task_id=job_id)
    log.info("queued job %s for %s", job_id, url[:120])
    return JobAccepted(job_id=job_id)


@router.get("/jobs/{job_id}", response_model=JobResponse, dependencies=[ApiKey])
async def get_job_status(job_id: str) -> JobResponse:
    job = await jobstore.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/jobs/{job_id}/events", dependencies=[ApiKey])
async def job_events(job_id: str, request: Request) -> StreamingResponse:
    """Server-Sent Events: live progress until the job finishes or fails."""

    async def gen():
        while True:
            if await request.is_disconnected():
                break
            job = await jobstore.get_job(job_id)
            if job is None:
                yield 'event: error\ndata: {"message": "job not found"}\n\n'
                break
            yield f"data: {job.model_dump_json()}\n\n"
            if job.status in (JobStatus.DONE, JobStatus.FAILED):
                break
            await asyncio.sleep(0.7)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # don't let nginx buffer the stream
        },
    )


@router.get("/files/{job_id}", dependencies=[ApiKey])
async def download_file(job_id: str):
    job = await jobstore.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status != JobStatus.DONE:
        raise HTTPException(status_code=409, detail=f"Job is {job.status.value}, not done.")
    storage = get_storage()

    presigned = storage.download_url(job_id)
    if presigned:  # S3/R2: redirect straight to object storage
        return RedirectResponse(presigned, status_code=302)

    path = storage.local_path(job_id)
    if path is None:
        # job record outlived the file (TTL cleanup)
        raise HTTPException(
            status_code=410,
            detail="The file has expired and was deleted. Please download it again.",
        )
    filename = storage.stored_filename(job_id) or f"{job_id}.mp4"
    return FileResponse(
        path,
        filename=filename,  # -> Content-Disposition: attachment; filename=...
        media_type="application/octet-stream",
    )


@router.delete("/jobs/{job_id}", status_code=204, dependencies=[ApiKey])
async def cancel_job(job_id: str):
    job = await jobstore.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job.status not in (JobStatus.DONE, JobStatus.FAILED):
        celery.control.revoke(job_id, terminate=True, signal="SIGTERM")
    get_storage().delete(job_id)
    await jobstore.delete_job(job_id)
    log.info("cancelled/deleted job %s", job_id)
