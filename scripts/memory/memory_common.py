"""Shared identity and configuration for optional, local project memory."""

import hashlib
from contextlib import contextmanager
import json
import os
import sys as _sys
from pathlib import Path as _Path

_sys.path.insert(0, str(_Path(__file__).resolve().parents[1] / "runtime"))
import secure_paths  # noqa: E402 - sys.path must precede this repo-relative import
from posix_compat import try_lock_exclusive, unlock  # noqa: E402
from pathlib import Path
import subprocess
import time

import continuity
from memory_redaction import redact


def disabled() -> bool:
    return any(
        os.environ.get(key, "").lower() in {"true", "1", "yes"}
        for key in ("MEM0_DISABLED", "DAIHARNESS_SKIP_MEM0")
    )


def workspace_root() -> Path:
    configured = os.environ.get("DAIHARNESS_WORKSPACE", "").strip()
    if configured:
        root = Path(configured).expanduser().resolve()
        if not root.is_dir():
            raise ValueError("invalid_memory_workspace")
        return root
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=2,
        )
        if result.returncode == 0:
            return Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return Path.cwd().resolve()


def project_id(workspace=None) -> str:
    return os.environ.get("MEM0_PROJECT_ID", "").strip() or (
        "workspace:"
        + hashlib.sha256(str(workspace or workspace_root()).encode()).hexdigest()[:24]
    )


def session_namespace(session: str) -> str:
    return (
        project_id() + ":session:" + hashlib.sha256(session.encode()).hexdigest()[:24]
    )


def active_session() -> str:
    return os.environ.get("DAIHARNESS_SESSION") or os.environ.get(
        "DAIHARNESS_SESSION_ID", ""
    )


def database_path() -> Path:
    configured = os.environ.get("MEM0_DB_PATH", "").strip()
    path = (
        Path(configured).expanduser() if configured else Path(".daiharness/memory.db")
    )
    return (path if path.is_absolute() else workspace_root() / path).absolute()


def runtime_root() -> Path:
    configured = os.environ.get("MEMORY_DB_DIR", "").strip()
    return (
        Path(configured).expanduser().resolve()
        if configured
        else workspace_root() / ".daiharness/runtime/memory"
    )


def _redirects_anywhere(path: Path) -> bool:
    """Whether the path or any ancestor redirects elsewhere.

    This stands in for a private continuity helper that this project's
    continuity module does not export, and it is stricter than the original: it
    also rejects a Windows junction, which a symlink test misses.
    """
    return any(secure_paths.entry_redirects(p) for p in (path, *path.parents))


def atomic_json(path: Path, data: dict) -> None:
    if _redirects_anywhere(path):
        raise ValueError("unsafe_memory_state_path")
    continuity._atomic_write(
        path, (json.dumps(redact(data), ensure_ascii=False, indent=2) + "\n").encode()
    )


@contextmanager
def _writer_lock(folder: Path):
    """A bounded, non-blocking writer lock held on a file inside ``folder``.

    The continuity module this used to borrow from exposes no lock helper here,
    and reaching for its fcntl/msvcrt attributes only worked where they existed.
    posix_compat owns that difference instead: the lock is advisory and
    non-blocking on both platforms.
    """
    descriptor = os.open(
        folder / ".memory-writer.lock",
        os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    try:
        yield descriptor
    finally:
        try:
            unlock(descriptor)
        finally:
            os.close(descriptor)


@contextmanager
def json_transaction(path: Path, initial: dict):
    """Bounded process lock and atomic publication."""
    if disabled():
        raise RuntimeError("memory_disabled")
    if _redirects_anywhere(path):
        raise ValueError("unsafe_memory_state_path")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with _writer_lock(path.parent) as lock:
        deadline = time.monotonic() + 2
        while True:
            try:
                try_lock_exclusive(lock)
                break
            except (OSError, BlockingIOError):
                if time.monotonic() >= deadline:
                    raise TimeoutError("memory_state_busy")
                time.sleep(0.01)
        data = (
            json.loads(path.read_text())
            if path.exists()
            else json.loads(json.dumps(initial))
        )
        if not isinstance(data, dict):
            raise ValueError("invalid_memory_state")
        yield data
        atomic_json(path, data)
