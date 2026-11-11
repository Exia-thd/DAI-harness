"""Workspace-rooted job storage is private on Windows. Pin the reason.

A project legitimately lives outside the user profile, and this machine's
system drive grants the local Users group inheritable read, so a project under
it -- and everything created beneath -- is readable by every local user and
modifiable by any authenticated user. Job storage created there looked like a
real hole.

It is not one. CPython translates `mode=0o700` into a restrictive DACL on
Windows, so `secure_paths.mkdir_at`, which passes that mode by default, already
creates private directories -- the same mechanism POSIX uses, not a different
one. That is why this project writes no ACLs of its own.

But nothing else here pins that behaviour, and it is a platform detail rather
than a documented guarantee. If a future CPython stops translating the mode,
job storage silently becomes world-readable and every guard above it keeps
reporting success, because the mode bits those guards read do not exist on
Windows either. These tests are the tripwire for that.

The widening step uses `icacls`, the OS tool. A product function whose purpose
is to open a directory up would be a liability to keep around, and the tests do
not need one to exist.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
import secure_paths  # noqa: E402
import windows_acl  # noqa: E402

# The local Users group, by SID so this does not depend on the display language.
LOCAL_USERS_SID = "S-1-5-32-545"


def widen(path: Path) -> None:
    """Grant the local Users group inheritable read, as a system drive does."""
    result = subprocess.run(
        ["icacls", str(path), "/grant", f"*{LOCAL_USERS_SID}:(OI)(CI)(R)"],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, f"icacls failed: {result.stdout}{result.stderr}"


def others_with_access(path: Path) -> list[str]:
    _, allowed = windows_acl._owner_and_allowed(path)
    extra = allowed - windows_acl.ALWAYS_ALLOWED - {windows_acl.current_user_sid()}
    return sorted(extra)


def test_the_verifier_can_actually_fail(tmp_path: Path) -> None:
    """A widened directory must be reported as not private.

    Without this, every other assertion here could be passing because the
    verifier always says yes.
    """
    if os.name != "nt":
        pytest.skip("there is no ACL to read on POSIX")
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    widen(workspace)

    assert others_with_access(workspace) == [LOCAL_USERS_SID]
    assert not windows_acl.restricted_to_current_user(workspace)


def test_mkdir_at_produces_private_job_storage_under_an_open_workspace(
    tmp_path: Path,
) -> None:
    """The load-bearing one: the runtime's own creation path, worst case.

    If this fails, job storage for every project outside the user profile is
    readable by every local user, and nothing else in the suite would notice.
    """
    if os.name != "nt":
        pytest.skip("POSIX gets this from mode=0o700, which it has always honoured")
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    widen(workspace)

    anchor = secure_paths.open_anchor(workspace)
    try:
        secure_paths.mkdir_at(anchor, "scratch")
    finally:
        secure_paths.close_anchor(anchor)

    created = workspace / "scratch"
    assert created.is_dir()
    assert others_with_access(created) == [], (
        "job storage created under a world-readable workspace is readable too"
    )

    # A file inside it needs no second act: it inherits the directory's DACL.
    inner = created / "manifest.json"
    inner.write_text("{}", encoding="utf-8")
    assert others_with_access(inner) == []


def test_a_file_mode_alone_buys_nothing_on_windows(tmp_path: Path) -> None:
    """Characterisation, so nobody relies on the open mode for privacy.

    `os.open(..., 0o600)` is honoured on POSIX and ignored here. Code that
    needs a private file on Windows has to create the directory holding it.
    This is the measured reason `artifact_pins` is safe: its lock file lives in
    a `.daiharness/runtime` that `mkdir_at` created, not in the workspace.
    """
    if os.name != "nt":
        pytest.skip("POSIX honours the file mode, so there is nothing to pin")
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    widen(workspace)

    descriptor = os.open(workspace / "loose.txt", os.O_WRONLY | os.O_CREAT, 0o600)
    os.close(descriptor)

    assert others_with_access(workspace / "loose.txt") == [LOCAL_USERS_SID], (
        "the file mode now protects a file on Windows; the guidance here and in "
        "windows_acl's docstring should be revisited"
    )


def test_the_module_is_inert_on_posix(tmp_path: Path) -> None:
    if os.name == "nt":
        pytest.skip("this is about the POSIX branch")
    folder = tmp_path / "job"
    folder.mkdir(mode=0o700)
    assert not windows_acl.HAS_ACL
    # It reports True because `private_mode_is_safe` is the guard there, and it
    # must not claim to have read an ACL that does not exist.
    assert windows_acl.restricted_to_current_user(folder)
