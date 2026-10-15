"""Local-disk storage: <DOWNLOAD_DIR>/<job_id>/<filename>."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings
from app.core.security import sanitize_filename
from app.storage.base import StorageBackend

log = logging.getLogger("uvd.storage.local")


class LocalStorage(StorageBackend):
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or get_settings().DOWNLOAD_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _job_dir(self, job_id: str) -> Path:
        # job_id is a server-generated hex string, but resolve defensively anyway
        safe = sanitize_filename(job_id)
        path = (self.base_dir / safe).resolve()
        if self.base_dir.resolve() not in path.parents and path != self.base_dir.resolve():
            raise ValueError(f"Refusing to escape storage dir: {job_id!r}")
        return path

    def _find_file(self, job_id: str) -> Path | None:
        d = self._job_dir(job_id)
        if not d.is_dir():
            return None
        files = [p for p in d.iterdir() if p.is_file()]
        return max(files, key=lambda p: p.stat().st_size) if files else None

    def store(self, job_id: str, src: Path, filename: str) -> str:
        dest_dir = self._job_dir(job_id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / sanitize_filename(filename)
        shutil.move(str(src), str(dest))
        log.info("stored job %s -> %s", job_id, dest)
        return str(dest.relative_to(self.base_dir))

    def local_path(self, job_id: str) -> Path | None:
        return self._find_file(job_id)

    def download_url(self, job_id: str, expires: int = 3600) -> str | None:
        return None  # served by the API itself

    def open_stream(self, job_id: str) -> BinaryIO:
        path = self._find_file(job_id)
        if path is None:
            raise FileNotFoundError(f"no file stored for job {job_id}")
        return path.open("rb")

    def file_size(self, job_id: str) -> int | None:
        path = self._find_file(job_id)
        return path.stat().st_size if path else None

    def stored_filename(self, job_id: str) -> str | None:
        path = self._find_file(job_id)
        return path.name if path else None

    def file_mtime(self, job_id: str) -> float | None:
        path = self._find_file(job_id)
        return path.stat().st_mtime if path else None

    def delete(self, job_id: str) -> None:
        d = self._job_dir(job_id)
        if d.is_dir():
            shutil.rmtree(d, ignore_errors=True)
            log.info("deleted storage for job %s", job_id)

    def list_job_ids(self) -> list[str]:
        if not self.base_dir.is_dir():
            return []
        return [p.name for p in self.base_dir.iterdir() if p.is_dir()]
