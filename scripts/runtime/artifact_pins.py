"""Shared workspace artifact lock and token-owned consumer protection.

Pins never expire implicitly. Metadata is private same-user state, not proof
against a malicious same-user writer. No process execution or admission grant.
"""

from contextlib import contextmanager
from contextvars import ContextVar
from posix_compat import try_lock_exclusive
import hashlib
import hmac
import json
import os
import secure_paths
from posix_compat import owner_is_current_user, private_mode_is_safe
from pathlib import Path
import re
import secrets
import stat
import time
import uuid
import threading

from project_storage import StorageError, _open_directory, _bound_root, measure_tree

_LOCKED = ContextVar("artifact_locks", default=frozenset())


@contextmanager
def artifact_lock(workspace):
    if workspace is None:
        yield
        return
    workspace = Path(workspace).resolve(strict=True)
    key = (os.getpid(), threading.get_ident(), str(workspace))
    if key in _LOCKED.get():
        yield
        return
    current = workspace
    for part in (".daiharness", "runtime"):
        parent = _open_directory(current)
        try:
            try:
                secure_paths.mkdir_at(parent, part)
            except FileExistsError:
                pass
            # Re-open after creating, so a concurrent creator that left
            # something other than a directory is rejected, not inherited.
            child = secure_paths.child_anchor(parent, part)
            secure_paths.close_anchor(child)
        finally:
            secure_paths.close_anchor(parent)
        current /= part
    parent = _open_directory(current)
    descriptor, reset = None, None
    try:
        descriptor = secure_paths.open_at(
            parent, ".artifact.lock", os.O_CREAT | os.O_RDWR, 0o600
        )
        info = secure_paths.stat_at(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or not owner_is_current_user(info)
            or not private_mode_is_safe(info, 0o077)
        ):
            raise StorageError("unsafe-artifact-lock")
        deadline = time.monotonic() + 2
        while True:
            try:
                try_lock_exclusive(descriptor)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise StorageError("artifact-lock-busy")
                time.sleep(0.02)
        reset = _LOCKED.set(_LOCKED.get() | {key})
        yield
    finally:
        if reset is not None:
            _LOCKED.reset(reset)
        if descriptor is not None:
            secure_paths.close_anchor(descriptor)
        secure_paths.close_anchor(parent)


def pins(record, *, updated=None):
    """Call while holding artifact_lock; read fresh state before any deletion."""
    _bound_root(record)
    folder = Path(record["workspace"]) / ".daiharness/runtime/artifact-pins"
    parent = _open_directory(folder.parent)
    try:
        try:
            secure_paths.mkdir_at(parent, folder.name)
        except FileExistsError:
            pass
    finally:
        secure_paths.close_anchor(parent)
    descriptor = _open_directory(folder)
    name = record["job_id"] + ".json"
    identity = {k: record[k] for k in ("job_id", "nonce", "device", "inode")}
    try:
        try:
            fd = secure_paths.open_at(descriptor, name, os.O_RDONLY)
        except FileNotFoundError:
            value = {
                "schema": "dai-harness-artifact-pins/v1",
                "identity": identity,
                "pins": [],
            }
        else:
            with os.fdopen(fd, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or not owner_is_current_user(info)
                    or not private_mode_is_safe(info, 0o077)
                    or info.st_size > 16384
                ):
                    raise StorageError("unsafe-artifact-pins")
                value = json.load(stream)
            if value.get("identity") != identity or not isinstance(
                value.get("pins"), list
            ):
                raise StorageError("artifact-pin-identity-mismatch")
        if updated is not None:
            if len(updated) > 64:
                raise StorageError("artifact-pin-limit")
            value["pins"] = updated
            temp = name + "." + uuid.uuid4().hex + ".tmp"
            fd = secure_paths.open_at(
                descriptor, temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
            )
            try:
                with os.fdopen(fd, "w") as stream:
                    json.dump(value, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                secure_paths.replace_at(descriptor, temp, descriptor, name)
                secure_paths.fsync_at(descriptor)
            finally:
                try:
                    secure_paths.remove_at(descriptor, temp)
                except FileNotFoundError:
                    pass
        return value["pins"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise StorageError("artifact-protection-unavailable") from error
    finally:
        secure_paths.close_anchor(descriptor)


def pin_artifact(record, consumer):
    if not isinstance(consumer, str) or not re.fullmatch(
        r"[A-Za-z0-9_.:-]{1,128}", consumer
    ):
        raise StorageError("invalid-artifact-consumer")
    with artifact_lock(record["workspace"]):
        if record.get("state") != "retained" or measure_tree(
            _bound_root(record)
        ) != record.get("snapshot"):
            raise StorageError("artifact-unavailable")
        token = secrets.token_hex(32)
        pins(
            record,
            updated=pins(record)
            + [
                {
                    "consumer": consumer,
                    "token_digest": hashlib.sha256(token.encode()).hexdigest(),
                }
            ],
        )
        return token


def unpin_artifact(record, token):
    with artifact_lock(record["workspace"]):
        current = pins(record)
        expected = hashlib.sha256(token.encode()).hexdigest()
        remaining = [
            pin
            for pin in current
            if not hmac.compare_digest(pin["token_digest"], expected)
        ]
        if len(remaining) == len(current):
            raise StorageError("artifact-pin-owner-mismatch")
        pins(record, updated=remaining)
