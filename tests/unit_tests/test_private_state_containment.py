"""The private-state roots, on the platform where their guards could not fire.

`posix_compat`'s owner and mode helpers both report success unconditionally on
Windows -- there is no `st_uid` to compare and no permission bits to mask, and a
directory created 0o700 reports 0o777 there. ADR-014 settled what to do about
it: the only basis the platform offers is the ACL a directory inherits from the
user profile, so a private root outside that profile is refused.

ADR-014 applied that to the journal. These tests cover the two chokepoints that
carry the rest of the private-state tree:

* `host_job_profiles.private_dir` -- every call site passes a path derived from
  the admission home (`host_job_history`, `native_job_requests`,
  `resource_enrollment`, and the profile store itself).
* `HostAdmission.__init__` -- the admission database, and `admission.home`,
  from which the journal and job directories are built.

Workspace-rooted storage is deliberately not covered: `artifact_pins`,
`project_storage` and `project_recipe` anchor on the project, which legitimately
lives outside the profile, so containment is not an available basis there and
their guards stay POSIX-only. ADR-014 records that gap.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_admission import HostAdmission  # noqa: E402
from host_admission_store import AdmissionError  # noqa: E402
from host_job_profiles import ProfileError, private_dir  # noqa: E402

WINDOWS_ONLY = "on POSIX the permission bits are the guard, not containment"


def relocate_profile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Move the user profile, not the state, and hand back a path outside it.

    Every writable directory on a Windows host is already inside the real
    profile -- the temp directory pytest hands out included -- so the only way
    to exercise the refusal is to relocate the profile. USERPROFILE is what
    `Path.home()` reads here; patching `Path.home` itself leaks, because pytest
    restores a patched classmethod as a bound method.
    """
    profile = tmp_path / "profile"
    profile.mkdir()
    monkeypatch.setenv("USERPROFILE", str(profile))
    assert Path.home() == profile
    return tmp_path / "outside"


def test_a_private_dir_outside_the_user_profile_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    if os.name != "nt":
        pytest.skip(WINDOWS_ONLY)
    outside = relocate_profile(tmp_path, monkeypatch)

    with pytest.raises(ProfileError) as caught:
        private_dir(outside / "profiles")
    assert str(caught.value) == "unsafe-profile-directory"
    # Fail closed means the directory is not created on the way to refusing.
    assert not (outside / "profiles").exists()


def test_a_private_dir_inside_the_user_profile_is_created(tmp_path: Path) -> None:
    if os.name != "nt":
        pytest.skip("this is about the Windows branch of the guard")
    assert tmp_path.resolve().is_relative_to(Path.home().resolve()), (
        f"this host's temp dir is outside the profile: {tmp_path}"
    )
    folder = private_dir(tmp_path / "profiles")
    assert folder.is_dir()


def test_an_admission_home_outside_the_user_profile_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    if os.name != "nt":
        pytest.skip(WINDOWS_ONLY)
    outside = relocate_profile(tmp_path, monkeypatch)

    with pytest.raises(AdmissionError) as caught:
        HostAdmission(outside / "admission")
    assert str(caught.value) == "unsafe-state-directory"
    # No database is left behind by a home that was refused.
    assert not (outside / "admission").exists()


def test_an_admission_home_inside_the_user_profile_still_opens(
    tmp_path: Path,
) -> None:
    if os.name != "nt":
        pytest.skip("this is about the Windows branch of the guard")
    admission = HostAdmission(tmp_path / "admission")
    assert admission.home.is_dir()
    assert (admission.home / "host.sqlite3").is_file()


def test_posix_still_refuses_a_world_readable_private_dir(tmp_path: Path) -> None:
    """The POSIX guard is the real one and must not have been weakened.

    It also shows why containment is not applied on POSIX: this fixture lives
    under /tmp, outside the profile, and is private by mode.
    """
    if os.name == "nt":
        pytest.skip("Windows keeps no permission bits to widen")
    folder = tmp_path / "profiles"
    folder.mkdir()
    os.chmod(folder, 0o777)

    with pytest.raises(ProfileError) as caught:
        private_dir(folder)
    assert str(caught.value) == "unsafe-profile-directory"
