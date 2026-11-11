"""The RLG lease log, which had no privacy guard on any platform.

`runtime_registry` resolves its home from `DAIHARNESS_RLG_HOME` and appends
every lease event to `leases.jsonl` under it. ADR-010 calls that file the audit
trail of everything the guard ever opened: it carries project paths, session
ids, pids and command lines.

Unlike the rest of the runtime it was written with no guard at all — not a
vacuous one. `append_event` did `path.parent.mkdir(parents=True,
exist_ok=True)` with no mode, then `open(path, "a")`, so the directory took the
umask instead of 0o700, the file took 0o666 before umask, nothing checked the
owner or the mode, and neither side used `O_NOFOLLOW`, so a symlink in place of
the log redirected the append. ADR-014's basis now applies here too.
"""

from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
import runtime_registry  # noqa: E402
from runtime_registry import RegistryError, append_event, read_events  # noqa: E402

EVENT = {
    "schema_version": "1",
    "lease_id": "lease-test",
    "event": "open",
    "project": "/project",
}
WINDOWS_ONLY = "on POSIX the permission bits are the guard, not containment"


def relocate_profile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Move the profile, not the state: temp is already inside the real one."""
    profile = tmp_path / "profile"
    profile.mkdir()
    monkeypatch.setenv("USERPROFILE", str(profile))
    assert Path.home() == profile
    outside = tmp_path / "outside"
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(outside))
    return outside


def test_appending_to_a_home_outside_the_user_profile_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    if os.name != "nt":
        pytest.skip(WINDOWS_ONLY)
    outside = relocate_profile(tmp_path, monkeypatch)

    with pytest.raises(RegistryError):
        append_event(dict(EVENT))
    # Fail closed: the log is not created on the way to refusing it.
    assert not outside.exists()


def test_reading_a_home_outside_the_user_profile_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    if os.name != "nt":
        pytest.skip(WINDOWS_ONLY)
    relocate_profile(tmp_path, monkeypatch)

    with pytest.raises(RegistryError):
        read_events()


def test_a_contained_home_still_appends_and_reads_back(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The ordinary path keeps working, and the log stays one line per event."""
    home = tmp_path / "runtime"
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(home))

    append_event(dict(EVENT))
    append_event(dict(EVENT, event="close"))

    raw = (home / "leases.jsonl").read_bytes()
    assert raw.count(b"\n") == 2, f"expected one line per event, got {raw!r}"
    assert [r["event"] for r in read_events()] == ["open", "close"]
    assert json.loads(raw.splitlines()[0])["lease_id"] == "lease-test"


def test_the_home_and_the_log_are_created_private(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """0o700 on the directory and 0o600 on the log, where the OS keeps bits."""
    if os.name == "nt":
        pytest.skip("Windows keeps no permission bits to assert")
    home = tmp_path / "runtime"
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(home))

    append_event(dict(EVENT))

    assert not home.lstat().st_mode & 0o077, oct(home.lstat().st_mode)
    log = (home / "leases.jsonl").lstat()
    assert stat.S_ISREG(log.st_mode)
    assert not log.st_mode & 0o077, oct(log.st_mode)


def test_a_home_and_log_left_too_open_are_tightened_not_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The migration path, which is the real risk of adding this guard.

    Every installation that already ran the old code has a directory at the
    umask and a log at 0o644. Refusing those would break a working system, and
    they belong to this user, so they are repaired instead. A directory owned
    by someone else is still refused, but that needs a second uid to exercise
    and is not simulated here.
    """
    if os.name == "nt":
        pytest.skip("Windows keeps no permission bits to widen or tighten")
    home = tmp_path / "runtime"
    home.mkdir()
    os.chmod(home, 0o777)
    log = home / "leases.jsonl"
    log.write_text('{"event": "old"}\n', encoding="utf-8")
    os.chmod(log, 0o644)
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(home))

    append_event(dict(EVENT))

    assert not home.lstat().st_mode & 0o077, oct(home.lstat().st_mode)
    assert not log.lstat().st_mode & 0o077, oct(log.lstat().st_mode)
    # The pre-existing record is still there: this repairs, it does not reset.
    assert [r.get("event") for r in read_events()] == ["old", "open"]


def test_a_symlinked_log_is_refused_on_posix(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A redirect in place of the log must not carry the append elsewhere."""
    if os.name == "nt":
        pytest.skip("creating a symlink needs a privilege this test should not need")
    home = tmp_path / "runtime"
    home.mkdir(mode=0o700)
    elsewhere = tmp_path / "elsewhere.jsonl"
    elsewhere.touch()
    (home / "leases.jsonl").symlink_to(elsewhere)
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(home))

    with pytest.raises((RegistryError, OSError)):
        append_event(dict(EVENT))
    assert elsewhere.read_bytes() == b"", "the append followed the redirect"


def test_rlg_home_itself_is_unchanged(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`rlg_home()` stays a pure path builder.

    `project_disk` and `project_storage` call it to locate `projects.index` and
    `budget.yaml`; making it raise would change their contract, so the guard
    belongs in the functions that create and read the log.
    """
    outside = tmp_path / "anywhere"
    monkeypatch.setenv("DAIHARNESS_RLG_HOME", str(outside))
    assert runtime_registry.rlg_home() == outside
    assert runtime_registry.leases_path() == outside / "leases.jsonl"
