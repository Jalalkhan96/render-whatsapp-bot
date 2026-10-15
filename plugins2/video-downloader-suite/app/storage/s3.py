"""S3-compatible storage (AWS S3 or Cloudflare R2 via S3_ENDPOINT_URL)."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings
from app.core.security import sanitize_filename
from app.storage.base import StorageBackend

log = logging.getLogger("uvd.storage.s3")


class S3Storage(StorageBackend):
    def __init__(self) -> None:
        import boto3  # lazy: only needed when this backend is selected

        settings = get_settings()
        if not settings.S3_ACCESS_KEY or not settings.S3_SECRET_KEY:
            raise RuntimeError("S3 backend selected but S3_ACCESS_KEY/S3_SECRET_KEY are not set.")
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        )
        self.bucket = settings.S3_BUCKET
        self.prefix = settings.S3_PREFIX.rstrip("/") + "/"
        # small in-memory index so we can serve without a DB; rebuilt on demand
        self._keys: dict[str, tuple[str, str]] = {}  # job_id -> (s3_key, filename)

    def _key(self, job_id: str, filename: str) -> str:
        safe_job = sanitize_filename(job_id)
        safe_name = sanitize_filename(filename)
        return f"{self.prefix}{safe_job}/{safe_name}"

    def _resolve(self, job_id: str) -> tuple[str, str] | None:
        if job_id in self._keys:
            return self._keys[job_id]
        prefix = f"{self.prefix}{sanitize_filename(job_id)}/"
        resp = self.client.list_objects_v2(Bucket=self.bucket, Prefix=prefix, MaxKeys=10)
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            filename = key.rsplit("/", 1)[-1]
            self._keys[job_id] = (key, filename)
            return self._keys[job_id]
        return None

    def store(self, job_id: str, src: Path, filename: str) -> str:
        key = self._key(job_id, filename)
        self.client.upload_file(str(src), self.bucket, key)
        self._keys[job_id] = (key, sanitize_filename(filename))
        src.unlink(missing_ok=True)
        log.info("stored job %s -> s3://%s/%s", job_id, self.bucket, key)
        return key

    def local_path(self, job_id: str) -> Path | None:
        return None

    def download_url(self, job_id: str, expires: int = 3600) -> str | None:
        resolved = self._resolve(job_id)
        if not resolved:
            return None
        key, _filename = resolved
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )

    def open_stream(self, job_id: str) -> BinaryIO:
        # boto3 has no seekable file-like without buffering; stream via a temp
        # file only when the API really needs to proxy (presigned URL is preferred).
        import tempfile

        resolved = self._resolve(job_id)
        if not resolved:
            raise FileNotFoundError(f"no file stored for job {job_id}")
        key, _filename = resolved
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
        tmp.close()
        self.client.download_file(self.bucket, key, tmp.name)
        return open(tmp.name, "rb")

    def file_size(self, job_id: str) -> int | None:
        resolved = self._resolve(job_id)
        if not resolved:
            return None
        head = self.client.head_object(Bucket=self.bucket, Key=resolved[0])
        return head.get("ContentLength")

    def stored_filename(self, job_id: str) -> str | None:
        resolved = self._resolve(job_id)
        return resolved[1] if resolved else None

    def file_mtime(self, job_id: str) -> float | None:
        resolved = self._resolve(job_id)
        if not resolved:
            return None
        head = self.client.head_object(Bucket=self.bucket, Key=resolved[0])
        last_modified = head.get("LastModified")
        return last_modified.timestamp() if last_modified else time.time()

    def delete(self, job_id: str) -> None:
        resolved = self._resolve(job_id)
        if resolved:
            self.client.delete_object(Bucket=self.bucket, Key=resolved[0])
            self._keys.pop(job_id, None)
            log.info("deleted s3 object for job %s", job_id)

    def list_job_ids(self) -> list[str]:
        ids: list[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=self.prefix, Delimiter="/"):
            for cp in page.get("CommonPrefixes", []):
                job_id = cp["Prefix"][len(self.prefix):].strip("/")
                if job_id:
                    ids.append(job_id)
        return ids


def get_storage() -> StorageBackend:
    """Factory honoring STORAGE_BACKEND. Cached on first use."""
    from functools import lru_cache

    @lru_cache(maxsize=1)
    def _get() -> StorageBackend:
        backend = get_settings().STORAGE_BACKEND
        if backend == "s3":
            return S3Storage()
        return LocalStorage()

    return _get()
