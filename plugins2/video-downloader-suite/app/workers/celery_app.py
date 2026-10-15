"""Celery app: broker + result backend are Redis; beat schedules maintenance."""
from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings

settings = get_settings()

celery = Celery(
    "video_downloader",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery.conf.update(
    task_time_limit=settings.JOB_TIMEOUT,  # hard kill after 15 min
    task_soft_time_limit=settings.JOB_TIMEOUT - 30,  # chance to clean up first
    task_acks_late=True,  # re-queue if a worker dies mid-job
    worker_prefetch_multiplier=1,
    task_default_queue="downloads",
    beat_schedule={
        "update-ytdlp-daily": {
            "task": "app.workers.tasks.update_ytdlp",
            "schedule": crontab(hour=3, minute=0),  # 03:00 UTC daily
        },
        "cleanup-old-files-hourly": {
            "task": "app.workers.tasks.cleanup_old_files",
            "schedule": crontab(minute=5),  # hourly
        },
    },
    timezone="UTC",
)
