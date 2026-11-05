"""POSIX primitives the runtime modules rely on, with Windows stand-ins.

The host-resource runtime is written against POSIX: advisory locks through
``fcntl``, an owner check through ``os.getuid``, ``O_NOFOLLOW`` on open, and
peak RSS through ``resource.getrusage``. None of those exist on Windows, which
is where this project runs, and ``import fcntl`` fails at import time -- so a
module that merely mentions a lock cannot even be collected by pytest.

Each stand-in here is the one this project already uses elsewhere rather than a
new invention; see ``scripts/lite/evidence_common.py`` for the lock and
``scripts/lite/review_attest.py`` for the uid lookup.

What is equivalent, and what is not:

* ``try_lock_exclusive`` -- ``msvcrt.locking`` with ``LK_NBLCK`` over a single
  byte. Also advisory, also non-blocking. msvcrt raises a plain ``OSError`` on
  contention while callers catch ``BlockingIOError``, so contention is
  re-raised as ``BlockingIOError`` to keep the callers' contract exact.
* ``try_lock_shared`` -- msvcrt has no shared mode, so this takes the exclusive
  lock. That can only serialise more than intended, never less, so it is safe
  in the direction that matters.
* ``owner_is_current_user`` -- there is no Windows equivalent of comparing
  ``st_uid`` to ``os.getuid()``; Windows reports ``st_uid`` as 0 for every
  file, and the ``st_mode & 0o077`` test it is paired with is meaningless
  there. On POSIX the real comparison still happens and the guarantee is
  unchanged. On Windows the check cannot be performed and this reports True,
  so callers must not treat a True here as proof of ownership on Windows --
  that protection comes from the file living in the user's own profile with
  default ACLs, and it is weaker than the POSIX check.
* ``NOFOLLOW`` -- 0 where the platform lacks the flag, which is what this
  project already does. A caller that needs the guarantee must pair it with a
  symlink check before the open and an ``os.fstat`` identity check after it;
  the flag alone is not available to lean on.
* ``peak_rss_mib`` -- ``GetProcessMemoryInfo`` through ctypes. Returns None
  when neither source is available, so callers report a gap instead of a zero
  that reads like a measurement.
"""

from __future__ import annotations

import os
import sys

try:
    import fcntl as _fcntl
except ImportError:  # Windows
    _fcntl = None
    import msvcrt as _msvcrt

try:
    import resource as _resource
except ImportError:  # Windows
    _resource = None

NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
HAS_NOFOLLOW = bool(NOFOLLOW)
HAS_UID = hasattr(os, "getuid")


def _as_fd(target) -> int:
    return target if isinstance(target, int) else target.fileno()


def _try_lock(target, exclusive: bool) -> None:
    fd = _as_fd(target)
    if _fcntl is not None:
        flag = _fcntl.LOCK_EX if exclusive else _fcntl.LOCK_SH
        _fcntl.flock(fd, flag | _fcntl.LOCK_NB)
        return
    where = os.lseek(fd, 0, os.SEEK_CUR)
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        _msvcrt.locking(fd, _msvcrt.LK_NBLCK, 1)
    except OSError as error:
        # Callers distinguish contention from real failure by catching
        # BlockingIOError; msvcrt does not raise that subclass itself.
        raise BlockingIOError(error.errno, "lock is held") from error
    finally:
        os.lseek(fd, where, os.SEEK_SET)


def try_lock_exclusive(target) -> None:
    """Take a non-blocking exclusive lock, or raise ``BlockingIOError``."""
    _try_lock(target, True)


def try_lock_shared(target) -> None:
    """Take a non-blocking shared lock where the platform has one."""
    _try_lock(target, False)


def unlock(target) -> None:
    fd = _as_fd(target)
    if _fcntl is not None:
        _fcntl.flock(fd, _fcntl.LOCK_UN)
        return
    where = os.lseek(fd, 0, os.SEEK_CUR)
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        _msvcrt.locking(fd, _msvcrt.LK_UNLCK, 1)
    except OSError:
        pass
    finally:
        os.lseek(fd, where, os.SEEK_SET)


def owner_is_current_user(info) -> bool:
    """Whether ``info`` (an ``os.stat_result``) belongs to this user.

    POSIX compares uids. Windows has no uid to compare, so this reports True;
    read the module docstring before relying on it there.
    """
    if not HAS_UID:
        return True
    return info.st_uid == os.getuid()


def private_mode_is_safe(info) -> bool:
    """Whether the group/other permission bits are clear.

    Windows does not carry these bits, so the test is reported as satisfied
    there; the protection on that platform is the containing directory's ACL.
    """
    if not HAS_UID:
        return True
    return not info.st_mode & 0o077


def peak_rss_mib() -> float | None:
    """Peak resident set size of this process in MiB, or None if unknown."""
    if _resource is not None:
        peak = _resource.getrusage(_resource.RUSAGE_SELF).ru_maxrss
        # ru_maxrss is bytes on macOS and kibibytes on Linux.
        return peak / (1024 * 1024) if sys.platform == "darwin" else peak / 1024
    try:
        import ctypes
        from ctypes import wintypes
    except ImportError:
        return None

    class _Counters(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    kernel32 = ctypes.windll.kernel32
    getter = getattr(ctypes.windll.psapi, "GetProcessMemoryInfo", None)
    if getter is None:
        return None
    # The declarations matter: left at the ctypes default the pseudo-handle comes
    # back as a C int, the call fails, and the result reads as "unknown" on a
    # platform that can answer perfectly well.
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    getter.argtypes = [wintypes.HANDLE, ctypes.POINTER(_Counters), wintypes.DWORD]
    getter.restype = wintypes.BOOL

    counters = _Counters()
    counters.cb = ctypes.sizeof(_Counters)
    if not getter(kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return counters.PeakWorkingSetSize / (1024 * 1024)
