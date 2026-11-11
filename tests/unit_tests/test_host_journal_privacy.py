"""The journal's privacy guard, on the platform where it could not fire.

`write_journal` refuses to write unless the journal directory is private:

    if (not stat.S_ISDIR(...) or not owner_is_current_user(info)
            or not private_mode_is_safe(info, 0o077)):
        raise JobError("unsafe-journal")

On Windows both of those helpers return True unconditionally -- there is no
`st_uid` to compare and no permission bits to mask. Measured on this host: a
directory created with mode 0o700 reports 0o777 and a file created 0o600
reports 0o666, so `private_mode_is_safe` would refuse *everything* if it read
the bits, which is why it reports success instead. The consequence is that
`unsafe-journal` could not be raised on Windows for any input.

`posix_compat`'s own module docstring already names what protects the journal
there: "that protection comes from the file living in the user's own profile
with default ACLs". The assumption was stated and never checked, while the
home is redirectable through `--home` or `DAIHARNESS_ADMISSION_HOME`. These
tests pin both halves: the stated basis is now enforced on Windows, and the
POSIX permission check is unchanged.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_job_runner import JobError, write_journal  # noqa: E402

RECORD = {
    "schema": "dai-harness-host-job/v1",
    "job_id": "job-" + "0" * 32,
    "state": "queued",
}


def test_a_journal_home_outside_the_user_profile_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Windows has no bits to check, so containment is the whole guard.

    The user profile is relocated rather than the journal, because every
    writable directory on this host is already inside the real profile --
    including the temp directory pytest hands out. What is under test is the
    containment decision, not this machine's drive layout.
    """
    if os.name != "nt":
        pytest.skip("on POSIX the permission bits are the guard, not containment")
    profile = tmp_path / "profile"
    profile.mkdir()
    # The environment, not `monkeypatch.setattr(Path, "home", ...)`: pytest
    # saves a patched classmethod as a bound method and restores it as one,
    # which leaks into the rest of the session. USERPROFILE is also what
    # `Path.home()` actually reads on this platform.
    monkeypatch.setenv("USERPROFILE", str(profile))
    assert Path.home() == profile
    outside = tmp_path / "outside"
    outside.mkdir()

    with pytest.raises(JobError) as caught:
        write_journal(outside, dict(RECORD))
    assert str(caught.value) == "unsafe-journal"
    # Fail closed means nothing was created on the way to refusing.
    assert not (outside / "jobs").exists()


def test_a_journal_home_inside_the_user_profile_is_accepted(tmp_path: Path) -> None:
    """The ordinary case still writes: the real profile, the real temp dir."""
    if os.name != "nt":
        pytest.skip("this is about the Windows branch of the guard")
    assert tmp_path.resolve().is_relative_to(Path.home().resolve()), (
        f"this host's temp dir is outside the profile: {tmp_path}"
    )
    write_journal(tmp_path, dict(RECORD))
    assert (tmp_path / "jobs" / (RECORD["job_id"] + ".json")).is_file()


def test_posix_still_refuses_a_world_readable_journal_directory(
    tmp_path: Path,
) -> None:
    """The POSIX guard is the real one and must not have been weakened.

    A journal directory anyone may read is refused on POSIX regardless of
    where it sits, which is also why containment is not applied there: the
    suite's own fixtures live under /tmp, outside the profile, and are private
    by mode.
    """
    if os.name == "nt":
        pytest.skip("Windows keeps no permission bits to widen")
    home = tmp_path / "admission"
    (home / "jobs").mkdir(parents=True)
    os.chmod(home / "jobs", 0o777)

    with pytest.raises(JobError) as caught:
        write_journal(home, dict(RECORD))
    assert str(caught.value) == "unsafe-journal"
