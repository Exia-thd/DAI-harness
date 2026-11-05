"""One batched census of live processes: pid, parent, group and a birth token.

The host-resource runtime uses this to decide whether a job it admitted is
still the job it admitted. Two things matter and neither is the process list
itself: the parent chain, so an admitted process cannot disown itself, and a
birth token, so a recycled pid cannot inherit another job's authority.

POSIX reads one `ps` batch, exactly as before. Windows has no `ps`, so the same
three facts come from Toolhelp32 (pid and parent) and GetProcessTimes (creation
time). That substitution is not a downgrade: `ps lstart` is second-resolution,
while GetProcessTimes is in 100-nanosecond ticks, so pid reuse is detected more
sharply there, not less.

What Windows does not have is a process group. ``setpgid`` has no counterpart --
the nearest thing is a Job Object, which is a different model with different
lifetime rules -- so ``pgid`` is reported as the pid itself and
``HAS_PROCESS_GROUPS`` is False. A caller must branch on that flag rather than
read equal group ids as proof of containment, because on Windows every process
trivially looks like its own group leader. Group-escape detection is therefore
unavailable on Windows, and a caller that depends on it has to say so.

Zombies have no Windows equivalent either; a process that has exited is simply
absent from the snapshot, which is the state the POSIX branch reaches by
filtering `Z` rows.
"""

from __future__ import annotations

import hashlib
import os

__all__ = [
    "HAS_PROCESS_GROUPS",
    "process_identity",
    "process_table",
    "signal_tree",
]

HAS_PROCESS_GROUPS = os.name == "posix"


def _posix_table(command) -> dict[int, tuple[int, int, str]]:
    rows: dict[int, tuple[int, int, str]] = {}
    raw = command(["/bin/ps", "-ax", "-o", "pid=,ppid=,pgid=,stat=,lstart="])
    lines = [line for line in raw.splitlines() if line.strip()]
    if not lines:
        raise ValueError("empty-ps-output")
    for line in lines:
        parts = line.split()
        if len(parts) != 9:
            raise ValueError("malformed-ps-row")
        pid, parent, group = map(int, parts[:3])
        if not parts[3].startswith("Z"):
            birth = hashlib.sha256(
                (str(pid) + ":" + " ".join(parts[4:])).encode()
            ).hexdigest()
            rows[pid] = (parent, group, birth)
    return rows


def _windows_table() -> dict[int, tuple[int, int, str]]:
    import ctypes
    from ctypes import wintypes

    TH32CS_SNAPPROCESS = 0x00000002
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

    class ProcessEntry(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", ctypes.c_char * 260),
        ]

    kernel32 = ctypes.windll.kernel32
    kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    kernel32.OpenProcess.restype = wintypes.HANDLE

    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if not snapshot or snapshot == INVALID_HANDLE_VALUE:
        raise ValueError("empty-process-snapshot")

    pairs: list[tuple[int, int]] = []
    try:
        entry = ProcessEntry()
        entry.dwSize = ctypes.sizeof(ProcessEntry)
        if not kernel32.Process32First(snapshot, ctypes.byref(entry)):
            raise ValueError("empty-process-snapshot")
        while True:
            pairs.append((int(entry.th32ProcessID), int(entry.th32ParentProcessID)))
            if not kernel32.Process32Next(snapshot, ctypes.byref(entry)):
                break
    finally:
        kernel32.CloseHandle(snapshot)

    if not pairs:
        raise ValueError("empty-process-snapshot")

    rows: dict[int, tuple[int, int, str]] = {}
    for pid, parent in pairs:
        created = None
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if handle:
            try:
                times = (wintypes.FILETIME * 4)()
                if kernel32.GetProcessTimes(
                    handle,
                    ctypes.byref(times[0]),
                    ctypes.byref(times[1]),
                    ctypes.byref(times[2]),
                    ctypes.byref(times[3]),
                ):
                    created = (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
            finally:
                kernel32.CloseHandle(handle)
        if created is None:
            # Without a creation time there is no birth token, and a row with a
            # guessed one would let a recycled pid pass as the original. Leaving
            # the process out makes the job look gone, which is the safe way to
            # be wrong here.
            continue
        birth = hashlib.sha256(f"{pid}:{created}".encode()).hexdigest()
        # No process groups on this platform: see HAS_PROCESS_GROUPS.
        rows[pid] = (parent, pid, birth)
    if not rows:
        raise ValueError("empty-process-snapshot")
    return rows


def _taskkill() -> str:
    """taskkill by absolute path: PATH is not guaranteed in a managed job."""
    root = os.environ.get("SystemRoot") or os.environ.get("windir") or r"C:\Windows"
    candidate = os.path.join(root, "System32", "taskkill.exe")
    return candidate if os.path.isfile(candidate) else "taskkill"


def signal_tree(process, *, force: bool) -> None:
    """Signal a job and its descendants, raising what the POSIX caller expects.

    POSIX kills the process group, which is how a descendant that outlived its
    parent is still reached. Windows has no process group, so the equivalent is
    a tree kill by pid:

    * not forced -- TerminateProcess on the leader. Windows has no deliverable
      SIGTERM for a console child, so there is no graceful phase to emulate;
      this is the leader only, and descendants are reached by the forced pass
      that follows.
    * forced -- ``taskkill /T /F``, which walks the child tree the way the
      group kill does. ``signal.SIGKILL`` does not exist on Windows at all, so
      the caller must not name it.

    Raises ``ProcessLookupError`` when the target is already gone and ``OSError``
    for anything else, so the caller's distinction between "already exited" and
    "could not be signalled" is unchanged.
    """
    import signal as signal_module
    import subprocess

    if HAS_PROCESS_GROUPS:
        os.killpg(
            process.pid,
            signal_module.SIGKILL if force else signal_module.SIGTERM,
        )
        return

    if process.poll() is not None and not force:
        raise ProcessLookupError(process.pid)
    if not force:
        process.terminate()
        return
    completed = subprocess.run(
        [_taskkill(), "/PID", str(process.pid), "/T", "/F"],
        capture_output=True,
        timeout=10,
        check=False,
    )
    if completed.returncode == 0:
        return
    output = (completed.stdout or b"") + (completed.stderr or b"")
    if b"not found" in output or b"128" in output:
        raise ProcessLookupError(process.pid)
    raise OSError(
        completed.returncode, output.decode("utf-8", "replace").strip() or "taskkill"
    )


def process_identity(pid: int) -> str | None:
    """A Windows start-bound identity string for one pid, or None.

    Binds the pid, its creation time and its image path, and deliberately not
    the parent, the group or any scheduling state, all of which can change
    within a single process lifetime. The creation time is an absolute FILETIME
    in 100-nanosecond ticks, so it does not need a boot id to stay unique the
    way a Linux start-tick does.

    This replaces spawning PowerShell per pid. That worked, but an ancestry walk
    can ask about dozens of processes and each spawn cost a few hundred
    milliseconds, and it needed PowerShell on PATH to answer at all.
    """
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return None
    import ctypes
    from ctypes import wintypes

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    kernel32 = ctypes.windll.kernel32
    kernel32.OpenProcess.restype = wintypes.HANDLE
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return None
    try:
        times = (wintypes.FILETIME * 4)()
        if not kernel32.GetProcessTimes(
            handle,
            ctypes.byref(times[0]),
            ctypes.byref(times[1]),
            ctypes.byref(times[2]),
            ctypes.byref(times[3]),
        ):
            return None
        created = (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
        buffer = ctypes.create_unicode_buffer(32768)
        size = wintypes.DWORD(len(buffer))
        image = ""
        if kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            image = buffer.value
    finally:
        kernel32.CloseHandle(handle)
    return f"{pid}:{created}:{image}"


def process_table(command=None) -> dict[int, tuple[int, int, str]]:
    """Map each live pid to ``(ppid, pgid, birth)``.

    ``command`` runs the POSIX ``ps`` batch and is required there; it is unused
    on Windows, which reads the snapshot directly.
    """
    if os.name == "posix":
        if command is None:
            raise ValueError("ps-runner-required")
        return _posix_table(command)
    return _windows_table()
