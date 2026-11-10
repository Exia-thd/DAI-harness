"""Read-only OS resource signals for host admission; no process termination."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import os
import process_census
from pathlib import Path
import re
import subprocess
import sys

MIB = 1024**2
GIB = 1024**3


@dataclass(frozen=True)
class MemorySnapshot:
    total_bytes: int
    available_bytes: int
    pressure: str
    source: str
    # One-minute runnable/blocked load per logical CPU, not temperature or CPU %.
    load_ratio: float | None = None
    # Discounted file cache estimate, never guaranteed allocatable memory.
    reclaimable_estimate_bytes: int = 0
    swap_total_bytes: int | None = None
    immediate_bytes: int | None = None
    # Currently provisioned free swap, not cumulative I/O or future disk growth.
    swap_free_bytes: int | None = None

    @property
    def worker_limit(self) -> int:
        return 1 if self.total_bytes <= 8 * GIB or self.pressure != "normal" else 2

    @property
    def headroom(self) -> int:
        if self.pressure in {"warning", "unknown"}:
            return 1024 * MIB
        return 256 * MIB if self.total_bytes <= 4 * GIB else 512 * MIB


def command(argv: list[str]) -> str:
    result = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=2,
        check=True,
        env={"PATH": os.environ.get("PATH", ""), "LC_ALL": "C", "LANG": "C"},
    )
    return result.stdout.strip()


def inspect_process(pid: int) -> str | None:
    """Return a start-bound digest; do not expose the command line or signal it."""
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return None
    try:
        if sys.platform.startswith("linux"):
            raw = Path(f"/proc/{pid}/stat").read_text()
            fields = raw[raw.rfind(")") + 2 :].split()
            if fields[0] == "Z":
                return None
            # PPID/PGID can change during this exact process lifetime.
            identity = f"{pid}:{fields[19]}:"
            identity += Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        elif sys.platform == "darwin":
            raw = command(
                [
                    "/bin/ps",
                    "-p",
                    str(pid),
                    "-o",
                    "lstart=",
                    "-o",
                    "pgid=",
                    "-o",
                    "ppid=",
                    "-o",
                    "stat=",
                    "-o",
                    "comm=",
                ]
            )
            parts = raw.split(maxsplit=8)
            if len(parts) != 9 or parts[7].startswith("Z"):
                return None
            # Bind PID, birth time and executable, not mutable scheduling state,
            # parent or process group. ps birth time has one-second resolution;
            # the random per-lease owner token remains mandatory as well.
            identity = f"{pid}:" + " ".join(parts[:5] + parts[8:])
        elif os.name == "nt":
            identity = process_census.process_identity(pid)
            if identity is None:
                return None
        else:
            return None
        return hashlib.sha256(identity.encode()).hexdigest()
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None


def darwin_swap_free_bytes() -> int | None:
    """Optional capacity signal; probe failure must not discard RAM telemetry."""
    try:
        raw = command(["/usr/sbin/sysctl", "-n", "vm.swapusage"])
        match = re.search(r"\bfree\s*=\s*(\d+(?:\.\d+)?)([KMG])(?:\s|$)", raw)
        if match is not None:
            scale = {"K": 1024, "M": MIB, "G": GIB}[match[2]]
            return int(float(match[1]) * scale)
    except (OSError, ValueError, OverflowError, subprocess.SubprocessError):
        pass
    return None


def windows_memory_snapshot() -> MemorySnapshot:
    """Read the memory counters from the OS, in this process.

    This used to shell out to `powershell -Command Get-CimInstance ...` through
    `command()`, which hands the child an environment of PATH, LC_ALL and LANG
    and nothing else. PowerShell cannot start without SystemRoot: it exited
    0xFFFF0000 in 0.18s with "Loading managed Windows PowerShell failed with
    error 8009001d", the except clause swallowed it, and the caller received
    MemorySnapshot(0, 0, "unknown", "telemetry-unavailable").

    Those zeros were not inert. `select_jobs` tests
    `available_bytes - reserved - memory_bytes < headroom`, which with
    available at 0 and headroom at 1 GiB is true for every row, so every job
    was denied `insufficient-memory` on a host with 31 GiB free. No test caught
    it because every other test in the suite injects a synthetic sensor.

    GlobalMemoryStatusEx needs no child process, so there is no environment,
    PATH, execution policy or startup cost to get wrong, and it answers in
    microseconds instead of the 1.0-1.3s a PowerShell start measured here --
    against the 2s timeout `command()` imposes. The same reasoning moved
    process identity off PowerShell in process_census.

    `dwMemoryLoad` is deliberately not read as pressure: it is a percentage of
    physical use, not the stall signal Linux PSI reports, and inventing a
    pressure model from it would change worker_limit and headroom on evidence
    that does not support it.
    """
    import ctypes
    from ctypes import wintypes

    class MemoryStatusEx(ctypes.Structure):
        _fields_ = [
            ("dwLength", wintypes.DWORD),
            ("dwMemoryLoad", wintypes.DWORD),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    status = MemoryStatusEx()
    status.dwLength = ctypes.sizeof(MemoryStatusEx)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.GlobalMemoryStatusEx.argtypes = [ctypes.POINTER(MemoryStatusEx)]
    kernel32.GlobalMemoryStatusEx.restype = wintypes.BOOL
    if not kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        raise OSError(ctypes.get_last_error(), "GlobalMemoryStatusEx failed")
    total, available = int(status.ullTotalPhys), int(status.ullAvailPhys)
    if total <= 0 or available < 0 or available > total:
        raise ValueError("implausible-memory-counters")
    # Page file free is the swap-equivalent signal the scheduler already knows
    # how to treat as optional.
    swap_free = int(status.ullAvailPageFile)
    return MemorySnapshot(
        total,
        available,
        "unknown",
        "windows-globalmemorystatusex-pressure-unavailable",
        swap_free_bytes=swap_free if swap_free >= 0 else None,
    )


def memory_snapshot() -> MemorySnapshot:
    """Use OS pressure and available/reclaimable memory, not free percent alone."""
    try:
        load_ratio = os.getloadavg()[0] / max(1, os.cpu_count() or 1)
    except (AttributeError, OSError):
        load_ratio = None
    try:
        if sys.platform == "darwin":
            values = command(
                [
                    "/usr/sbin/sysctl",
                    "-n",
                    "hw.memsize",
                    "kern.memorystatus_vm_pressure_level",
                ]
            ).splitlines()
            total, level = int(values[0]), int(values[1])
            raw = command(["/usr/bin/vm_stat"])
            page_size = int(re.search(r"page size of (\d+) bytes", raw).group(1))
            pages = dict(re.findall(r"^([^:\n]+):\s*(\d+)\.", raw, re.MULTILINE))
            available = (
                sum(
                    int(pages.get(k, 0))
                    # Inactive anonymous pages may require swap before reuse.
                    # Count only free, speculative and explicitly purgeable pages.
                    for k in ("Pages free", "Pages purgeable", "Pages speculative")
                )
                * page_size
            )
            pressure = {1: "normal", 2: "warning", 4: "critical"}.get(level, "unknown")
            # File-backed includes speculative and may overlap purgeable.
            # Subtract both before a policy 50% uncertainty discount. Neither
            # inactive anonymous pages nor compressor storage earns credit.
            reclaimable = (
                max(
                    0,
                    int(pages["File-backed pages"])
                    - int(pages["Pages speculative"])
                    - int(pages["Pages purgeable"]),
                )
                * page_size
                // 2
            )
            swap_total = (int(pages["Swapins"]) + int(pages["Swapouts"])) * page_size
            return MemorySnapshot(
                total,
                available,
                pressure,
                "darwin-vm-stat+memorystatus",
                load_ratio,
                reclaimable,
                swap_total,
                available,
                swap_free_bytes=darwin_swap_free_bytes(),
            )
        if sys.platform.startswith("linux"):
            rows = dict(
                re.findall(
                    r"^(\w+):\s*(\d+) kB",
                    Path("/proc/meminfo").read_text(),
                    re.MULTILINE,
                )
            )
            total, available = (
                int(rows["MemTotal"]) * 1024,
                int(rows["MemAvailable"]) * 1024,
            )
            pressure = "unknown"
            psi_path = Path("/proc/pressure/memory")
            if psi_path.is_file():
                raw = psi_path.read_text()
                some = float(re.search(r"some avg10=([\d.]+)", raw).group(1))
                full = float(re.search(r"full avg10=([\d.]+)", raw).group(1))
                pressure = (
                    "critical"
                    if full >= 5 or some >= 20
                    else "warning"
                    if some >= 5
                    else "normal"
                )
            return MemorySnapshot(
                total, available, pressure, "linux-memavailable+psi", load_ratio
            )
        if os.name == "nt":
            return windows_memory_snapshot()
    except (
        OSError,
        ValueError,
        KeyError,
        AttributeError,
        IndexError,
        subprocess.SubprocessError,
    ):
        pass
    return MemorySnapshot(0, 0, "unknown", "telemetry-unavailable")
