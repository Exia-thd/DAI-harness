"""An argv list has to stay an argv list, including on Windows.

`run_job` spawns with `subprocess.Popen(request.argv)` and no shell, which on
POSIX is execve: a quote or an ampersand in an argument is just a byte. Windows
has no argv at the OS level. CreateProcess takes one command-line string, and
subprocess builds it with `list2cmdline`, which quotes an argument only when it
contains a space or a tab -- the MSVC C runtime rules it follows have no reason
to care about `&`.

So `x&whoami` reaches the command line bare. A native .exe parses it back by
the same rules and sees the original argument. cmd.exe does not: it reads `&`
as a command separator, which splits the argument and runs the tail. Measured
on this host with a shim that forwards %* and one that reads %1 -- both split
the argument, and both executed the injected tail.

Two things follow. The caller's argument is silently truncated, and the journal
records `argv_sha256` over an argv that is not what ran, so the evidence
describes something other than the event. `validate` checked the argv for type,
emptiness and NUL bytes; it did not look at what argv[0] is.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_admission import HostAdmission, MemorySnapshot  # noqa: E402
from host_job_runner import JobError, JobRequest, validate  # noqa: E402


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    admission = HostAdmission(
        tmp_path / "admission",
        sensor=lambda: MemorySnapshot(
            16 * 1024**3, 10 * 1024**3, "normal", "synthetic"
        ),
    )
    yield root
    admission.close()


def request(project: Path, argv: list[str]) -> JobRequest:
    return JobRequest(
        project=project,
        cwd=project,
        argv=argv,
        profile="fixture-v1",
        memory_mib=128,
        scratch_bytes=0,
        disk_floor_bytes=0,
        timeout=5,
    )


@pytest.mark.parametrize("suffix", [".cmd", ".bat", ".CMD", ".Bat"])
def test_a_batch_target_is_refused(project, suffix) -> None:
    """The one target whose argument parsing the runtime cannot control."""
    shim = project / f"tool{suffix}"
    shim.write_text("@echo off\r\necho hi\r\n", encoding="utf-8", newline="")
    with pytest.raises(JobError) as caught:
        validate(request(project, [str(shim), "arg"]))
    assert "batch" in str(caught.value), caught.value


def test_an_ordinary_executable_is_still_accepted(project) -> None:
    """The refusal must be about batch files, not about arguments in general."""
    validate(request(project, [sys.executable, "-c", "pass"]))
    validate(request(project, [sys.executable, "-c", "pass", "x&whoami"]))


def test_cmd_really_splits_an_unquoted_argument() -> None:
    """The measurement the refusal rests on, so it is not taken on trust.

    If a future Windows or Python made list2cmdline quote this, or made cmd
    stop splitting it, this test fails and the refusal above can be revisited.
    """
    if os.name != "nt":
        pytest.skip("cmd.exe argument parsing is a Windows behaviour")
    # No space anywhere: list2cmdline quotes only on a space or a tab, and the
    # quoting is exactly what would stop cmd splitting. `echo.SPLIT` is cmd's
    # dot form, which needs no space of its own.
    payload = "x&echo.SPLIT"
    assert '"' not in subprocess.list2cmdline([payload]), (
        "list2cmdline quoted the argument, so cmd would not split it"
    )
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        shim = Path(tmp) / "forward.cmd"
        shim.write_text("@echo off\r\necho GOT[%*]\r\n", encoding="utf-8", newline="")
        out = subprocess.run(
            [str(shim), payload], capture_output=True, text=True, timeout=60
        )
        combined = (out.stdout or "") + (out.stderr or "")
    assert "GOT[x]" in combined, combined
    assert "SPLIT" in combined, (
        "the tail after & did not run; cmd no longer splits here"
    )
