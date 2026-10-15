"""Abstract storage interface. Local disk by default; S3/R2 optional."""
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO


class StorageBackend(ABC):
    """All job files go through here so the backend can be swapped via config."""

    @abstractmethod
    def store(self, job_id: str, src: Path, filename: str) -> str:
        """Persist `src` for `job_id` under `filename`. Returns a storage key."""

    @abstractmethod
    def local_path(self, job_id: str) -> Path | None:
        """Direct filesystem path when the backend is local-disk-like."""

    @abstractmethod
    def download_url(self, job_id: str, expires: int = 3600) -> str | None:
        """Presigned/direct URL when the backend serves files itself."""

    @abstractmethod
    def open_stream(self, job_id: str) -> BinaryIO:
        """Open the stored file for streaming reads."""

    @abstractmethod
    def file_size(self, job_id: str) -> int | None:
        ...

    @abstractmethod
    def stored_filename(self, job_id: str) -> str | None:
        ...

    @abstractmethod
    def file_mtime(self, job_id: str) -> float | None:
        """Modification time, used by the TTL cleanup task."""

    @abstractmethod
    def delete(self, job_id: str) -> None:
        ...

    @abstractmethod
    def list_job_ids(self) -> list[str]:
        ...
