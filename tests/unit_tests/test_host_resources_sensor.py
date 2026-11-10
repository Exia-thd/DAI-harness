"""The resource sensor, measured on the host the suite runs on.

Every other test in this suite injects `sensor=lambda: MemorySnapshot(...)`,
and one of them says so outright: "ONLY the resource sensor is synthetic."
That is reasonable for testing admission arithmetic, and it is why nobody
noticed that the real sensor returned zeros on Windows: the probe shelled out
to PowerShell with an environment stripped to PATH, LC_ALL and LANG, and
PowerShell cannot start without SystemRoot. It failed in 0.18s, the failure was
swallowed, and `MemorySnapshot(0, 0, "unknown", "telemetry-unavailable")` came
back.

Zeros are not inert. `select_jobs` computes
`available_bytes - reserved - memory_bytes < headroom`, so with available at 0
and headroom at 1 GiB the comparison is true for every row and every job is
denied `insufficient-memory` -- on a host with 31 GiB free. These tests call
the real sensor, which is the one thing the rest of the suite cannot do.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/runtime"))
from host_capacity import select_jobs  # noqa: E402
from host_resources import GIB, MIB, memory_snapshot  # noqa: E402


def test_the_real_sensor_reports_usable_figures_on_this_host() -> None:
    """A host running this suite has memory; the sensor has to find it."""
    snapshot = memory_snapshot()
    assert snapshot.source != "telemetry-unavailable", (
        f"the sensor could not read this host at all; source={snapshot.source!r}"
    )
    assert snapshot.total_bytes > 0, f"total_bytes={snapshot.total_bytes}"
    assert snapshot.available_bytes > 0, f"available_bytes={snapshot.available_bytes}"
    assert snapshot.available_bytes <= snapshot.total_bytes
    # A machine that can run this suite has at least a gigabyte installed.
    assert snapshot.total_bytes >= GIB


def test_the_real_sensor_lets_a_small_job_through() -> None:
    """The arithmetic the sensor feeds, run on real figures.

    This is the end of the chain the defect broke: not "is the number right"
    but "does a 64 MiB job get admitted on a host with free memory".
    """
    snapshot = memory_snapshot()
    # A broken sensor must fail here, not skip: zeros would otherwise satisfy
    # the "too little memory" guard below and the defect would read as a host
    # that happens to be short on RAM.
    assert snapshot.source != "telemetry-unavailable", (
        f"the sensor read nothing; source={snapshot.source!r}"
    )
    if snapshot.available_bytes <= snapshot.headroom + 64 * MIB:
        pytest.skip(
            "this host genuinely has too little free memory to admit a job: "
            f"available={snapshot.available_bytes} headroom={snapshot.headroom}"
        )
    queue = [
        {
            "id": "job-1",
            "kind": "worker",
            "project": "/project",
            "memory_bytes": 64 * MIB,
            "parent_id": None,
            "state": "queued",
        }
    ]
    grants, cancelled, reasons = select_jobs(
        snapshot, queue, active=[], worker_limit=snapshot.worker_limit
    )
    assert reasons.get("job-1") != "insufficient-memory", (
        "a 64 MiB job was refused for memory on a host with "
        f"{snapshot.available_bytes} bytes available"
    )
    assert grants == ["job-1"]
    assert cancelled == []


def test_the_sensor_needs_no_child_process_on_windows() -> None:
    """On Windows the figures come from the OS directly, not from a shell.

    A child process brings an environment, a PATH, a startup cost and an
    execution policy with it, and the probe was defeated by the first of those.
    Reading the counters in-process removes the whole class.
    """
    if os.name != "nt":
        pytest.skip("this is about the Windows branch of the sensor")
    source = memory_snapshot().source
    assert "powershell" not in source.lower()
    assert source.startswith("windows-"), f"source={source!r}"
