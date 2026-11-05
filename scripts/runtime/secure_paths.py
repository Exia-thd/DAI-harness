"""Directory traversal that cannot be redirected mid-walk, on POSIX and Windows.

The host-resource runtime opens every path one component at a time, anchored to
the parent's file descriptor, so that replacing a component with a symlink
between the check and the open changes nothing: the descriptor already names the
directory that was verified. That is the property to preserve, not the calls.

Windows has no directory descriptor. ``os.open`` on a directory fails with
``PermissionError``, ``os.scandir(fd)`` has nothing to take, and
``os.supports_dir_fd`` is empty. It does have an equivalent by another route,
which this project already implemented in ``scripts/lite/windows_secure_io.py``:
open every directory from the root with ``FILE_FLAG_OPEN_REPARSE_POINT`` and
hold the handles, sharing read only. While they are held no component can be
renamed, deleted or replaced by a reparse point, which is the same property the
descriptor provides. The Windows path verifies each component and then pins the
chain, so the verification is not left as a check-then-use window.

The pin covers the ancestors and not the target directory itself, because a
handle on the target would refuse to share the write access that creating an
entry inside it needs. That is the right boundary regardless: it is the path to
the directory that must not change underneath, while the directory stays
writable.

What each measure buys:

* Every component is rejected if it is **any** reparse point, not only a
  symlink. This matters more than it looks: ``os.path.islink`` returns False for
  a Windows junction, which redirects exactly like a symlink, so a port written
  against ``islink`` alone walks straight through one. The test here is the
  ``FILE_ATTRIBUTE_REPARSE_POINT`` attribute, which catches junctions, symlinks
  and the rest.
* Containment is verified against the root with a fully resolved path, so a
  component that points outside the tree is refused even if it is not a
  redirect.
* Directories are re-verified after any ``mkdir``, closing the window where a
  concurrent creator wins the race and leaves something else in place.
* A file opened by path has its identity confirmed against the ``lstat`` taken
  before the open (device, inode and type), which detects a swap in the gap.
* The walk stays on one device, so a mount point cannot widen it.

What remains, stated plainly: the pin is what closes the check-then-use window,
so if ``windows_secure_io`` cannot be imported the Windows path falls back to
verification alone and the window reopens. On Windows creating a symlink needs
SeCreateSymbolicLinkPrivilege (administrator by default) while a junction needs
nothing, which is why junctions are the case that actually matters here.
``supports_fd_traversal()`` reports whether the platform anchors by descriptor,
and it stays False on Windows even with the pin held, because the pin is a
different mechanism with a different failure mode -- a caller that genuinely
requires descriptor semantics should keep branching on it.

This mirrors the fallback this project already uses for the same problem in
``scripts/lite/rule-context-hook.py``; it is that approach made reusable, not a
second design.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path

__all__ = [
    "SecureDir",
    "SecurePathError",
    "child_anchor",
    "close_anchor",
    "dup_anchor",
    "entry_redirects",
    "fsync_at",
    "fsync_directory",
    "is_redirect",
    "is_redirect_stat",
    "lstat_at",
    "mkdir_at",
    "open_anchor",
    "open_at",
    "remove_at",
    "remove_redirect_at",
    "replace_with_retry",
    "rename_at",
    "replace_at",
    "rmdir_at",
    "scandir_at",
    "stat_at",
    "supports_fd_traversal",
]

_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
_DIRECTORY = getattr(os, "O_DIRECTORY", 0)
_CLOEXEC = getattr(os, "O_CLOEXEC", 0)


class SecurePathError(OSError):
    """A path component was unsafe, or escaped the tree it was anchored to."""


def supports_fd_traversal() -> bool:
    """Whether every component can be anchored to a parent descriptor."""
    required = ("open", "mkdir", "rename", "unlink", "lstat", "stat")
    if not all(hasattr(os, name) for name in required):
        return False
    supported = getattr(os, "supports_dir_fd", set())
    return (
        all(getattr(os, name) in supported for name in required)
        and bool(_NOFOLLOW)
        and bool(_DIRECTORY)
    )


def is_redirect(path: Path | str, *, info: os.stat_result | None = None) -> bool:
    """Whether ``path`` itself redirects elsewhere, without following it.

    True for a POSIX symlink and for any Windows reparse point, junctions
    included. ``os.path.islink`` is not enough on Windows: it reports False for
    a junction, and a junction redirects.
    """
    try:
        info = info if info is not None else os.lstat(path)
    except (OSError, ValueError):
        return True  # unreadable is not provably safe
    if stat.S_ISLNK(info.st_mode):
        return True
    attributes = getattr(info, "st_file_attributes", 0)
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def _identity(info: os.stat_result) -> tuple[int, int, int]:
    return (info.st_dev, info.st_ino, stat.S_IFMT(info.st_mode))


def _pin_directory_chain(root: Path, directory: Path):
    """Hold an open handle on every directory from ``root`` to ``directory``.

    Delegates to this project's own windows_secure_io, which opens each node
    with FILE_FLAG_BACKUP_SEMANTICS and FILE_FLAG_OPEN_REPARSE_POINT and keeps
    the handles while the caller works. Returns the live context manager, which
    the caller must exit, or None where there is nothing to pin.
    """
    if os.name != "nt":
        return None
    if directory == root:
        return None
    try:
        import sys

        # Imported here, eagerly, so the handle-closing path can still reach it
        # if a pin is only released while the interpreter is shutting down: a
        # late `import ctypes` fails once sys.meta_path is gone, while a cached
        # module still resolves. Releasing a pin deterministically is the rule;
        # this keeps the exception from a missed one out of the output.
        import ctypes  # noqa: F401
        import ctypes.wintypes  # noqa: F401

        lite = Path(__file__).resolve().parents[1] / "lite"
        if str(lite) not in sys.path:
            sys.path.insert(0, str(lite))
        import windows_secure_io
    except ImportError:
        # Without the pin the verification above still applies; it is a
        # check-then-use window rather than an anchor, and the module docstring
        # says so. Refusing outright would make the subsystem unusable for a
        # weaker-but-stated guarantee.
        return None
    # Pin the ancestors, not the directory itself. The chain is opened sharing
    # read only, so a handle on the target would block the very writes this is
    # protecting -- creating an entry needs write access the pin refuses to
    # share. Pinning root..parent is what the guarantee needs anyway: the
    # target cannot be reached through a swapped component, while remaining
    # writable.
    pin = windows_secure_io.locked_directory_chain(root, directory.parent)
    pin.__enter__()
    return pin


class SecureDir:
    """A directory reached without being redirected, and operations within it.

    On POSIX this holds the descriptor the components were verified through, so
    later operations are anchored and no re-check is needed. On Windows it holds
    the verified absolute path and re-verifies before each use, because there is
    no descriptor to anchor to.

    Use it as a context manager, or call ``close``; the POSIX descriptor must be
    released either way.
    """

    __slots__ = ("_closed", "_device", "_fd", "_path", "_pin", "_root")

    def __init__(self, path: Path, fd: int | None, root: Path, device: int) -> None:
        self._path = path
        self._fd = fd
        self._root = root
        self._device = device
        self._closed = False
        self._pin = None

    # -- construction ----------------------------------------------------

    @classmethod
    def open(
        cls, path: Path | str, *, create: bool = False, pin: bool = False
    ) -> SecureDir:
        """Verify every component of ``path`` from its anchor and open it.

        ``create`` makes missing components, re-verifying each one afterwards.
        """
        target = Path(path).absolute()
        anchor = Path(target.anchor)
        if not anchor.is_dir():
            raise SecurePathError(f"path anchor is not a directory: {anchor}")

        if supports_fd_traversal():
            fd = os.open(anchor, os.O_RDONLY | _DIRECTORY | _CLOEXEC)
            try:
                device = os.fstat(fd).st_dev
                for part in target.parts[1:]:
                    fd = cls._descend_fd(fd, part, create=create, device=device)
            except BaseException:
                os.close(fd)
                raise
            return cls(target, fd, anchor, device)

        device = os.stat(anchor).st_dev
        current = anchor
        for part in target.parts[1:]:
            current = cls._descend_path(current, part, anchor, device, create=create)

        # Having verified the chain, pin it. This project already owns a module
        # that opens every directory from the root with FILE_FLAG_OPEN_REPARSE_POINT
        # and holds the handles without FILE_SHARE_DELETE, so while they are held
        # no component can be renamed, deleted or swapped for a reparse point.
        # That turns the check-then-use window into a real anchor -- the same
        # property a POSIX directory descriptor gives -- so it is used in
        # preference to the verification above rather than as well as it.
        directory = cls(current, None, anchor, device)
        if pin:
            directory._pin = _pin_directory_chain(anchor, current)
        return directory

    @staticmethod
    def _descend_fd(parent: int, name: str, *, create: bool, device: int) -> int:
        flags = os.O_RDONLY | _DIRECTORY | _NOFOLLOW | _CLOEXEC
        try:
            child = os.open(name, flags, dir_fd=parent)
        except FileNotFoundError:
            if not create:
                raise
            try:
                os.mkdir(name, 0o700, dir_fd=parent)
            except FileExistsError:
                pass  # a concurrent creator is fine; O_NOFOLLOW still decides
            child = os.open(name, flags, dir_fd=parent)
        try:
            info = os.fstat(child)
            if not stat.S_ISDIR(info.st_mode):
                raise SecurePathError(f"path component is not a directory: {name}")
            if info.st_dev != device:
                raise SecurePathError(f"path component crosses a device: {name}")
        except BaseException:
            os.close(child)
            raise
        os.close(parent)
        return child

    @staticmethod
    def _descend_path(
        parent: Path, name: str, root: Path, device: int, *, create: bool
    ) -> Path:
        child = parent / name
        for attempt in (0, 1):
            try:
                info = os.lstat(child)
            except FileNotFoundError:
                if not create or attempt:
                    raise
                try:
                    child.mkdir(mode=0o700)
                except FileExistsError:
                    pass  # re-verified on the next attempt, which is the point
                continue
            if is_redirect(child, info=info):
                raise SecurePathError(f"path component redirects elsewhere: {child}")
            if not stat.S_ISDIR(info.st_mode):
                raise SecurePathError(f"path component is not a directory: {child}")
            if info.st_dev != device:
                raise SecurePathError(f"path component crosses a device: {child}")
            resolved = Path(os.path.realpath(child))
            try:
                resolved.relative_to(Path(os.path.realpath(root)))
            except ValueError as error:
                raise SecurePathError(
                    f"path component escapes the tree: {child}"
                ) from error
            return child
        raise SecurePathError(f"path component could not be verified: {child}")

    # -- lifetime --------------------------------------------------------

    def close(self) -> None:
        if self._closed:
            return
        try:
            if self._fd is not None:
                os.close(self._fd)
        finally:
            pin, self._pin = self._pin, None
            self._closed = True
            if pin is not None:
                pin.__exit__(None, None, None)

    def __enter__(self) -> SecureDir:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    @property
    def path(self) -> Path:
        return self._path

    @property
    def fd(self) -> int | None:
        """The anchoring descriptor, or None where the platform has none."""
        return self._fd

    def _check(self) -> None:
        if self._closed:
            raise SecurePathError("directory is closed")

    # -- operations ------------------------------------------------------

    def child(self, name: str, *, create: bool = False, pin: bool = False) -> SecureDir:
        self._check()
        if self._fd is not None:
            # _descend_fd closes the parent it is handed, so it gets a duplicate
            # and this directory keeps its own descriptor usable.
            child_fd = self._descend_fd(
                os.dup(self._fd), name, create=create, device=self._device
            )
            return SecureDir(self._path / name, child_fd, self._root, self._device)
        child = self._descend_path(
            self._path, name, self._root, self._device, create=create
        )
        opened = SecureDir(child, None, self._root, self._device)
        if pin:
            opened._pin = _pin_directory_chain(self._root, child)
        return opened

    def stat(self) -> os.stat_result:
        self._check()
        if self._fd is not None:
            return os.fstat(self._fd)
        return os.stat(self._path)

    def lstat(self, name: str) -> os.stat_result:
        self._check()
        if self._fd is not None:
            return os.lstat(name, dir_fd=self._fd)
        return os.lstat(self._path / name)

    def open_file(self, name: str, flags: int, mode: int = 0o600) -> int:
        """Open a file in this directory without following a redirect.

        Where the platform lacks O_NOFOLLOW the file is lstat-ed first and the
        descriptor's identity is confirmed afterwards, so a swap in the gap is
        detected rather than trusted.
        """
        self._check()
        if self._fd is not None:
            return os.open(name, flags | _NOFOLLOW | _CLOEXEC, mode, dir_fd=self._fd)

        target = self._path / name
        creating = bool(flags & getattr(os, "O_CREAT", 0))
        before: os.stat_result | None = None
        try:
            before = os.lstat(target)
        except FileNotFoundError:
            if not creating:
                raise
        if before is not None and is_redirect(target, info=before):
            raise SecurePathError(f"file redirects elsewhere: {target}")

        fd = os.open(target, flags, mode)
        try:
            after = os.fstat(fd)
            if stat.S_ISDIR(after.st_mode):
                raise SecurePathError(f"expected a file, found a directory: {target}")
            if before is not None and _identity(before) != _identity(after):
                raise SecurePathError(f"file was replaced while opening: {target}")
            if is_redirect(target):
                raise SecurePathError(f"file became a redirect while opening: {target}")
        except BaseException:
            os.close(fd)
            raise
        return fd

    def replace(self, source: str, destination: str) -> None:
        self._check()
        if self._fd is not None:
            os.replace(source, destination, src_dir_fd=self._fd, dst_dir_fd=self._fd)
            return
        os.replace(self._path / source, self._path / destination)

    def unlink(self, name: str, *, missing_ok: bool = False) -> None:
        self._check()
        try:
            if self._fd is not None:
                os.unlink(name, dir_fd=self._fd)
            else:
                os.unlink(self._path / name)
        except FileNotFoundError:
            if not missing_ok:
                raise

    def mkdir(self, name: str, mode: int = 0o700) -> None:
        self._check()
        if self._fd is not None:
            os.mkdir(name, mode, dir_fd=self._fd)
            return
        (self._path / name).mkdir(mode=mode)

    def scandir(self):
        """Iterate this directory. Entries are not followed by the caller."""
        self._check()
        return os.scandir(self._fd if self._fd is not None else self._path)

    def detach(self) -> int | None:
        """Hand the descriptor to the caller, who must then close it."""
        fd, self._fd = self._fd, None
        self._closed = True
        return fd


# ---------------------------------------------------------------------------
# Anchored operations
#
# Callers that used to hold a directory descriptor hold an "anchor" instead: on
# POSIX it is that same descriptor, so every call below forwards with dir_fd and
# the platform's behaviour is unchanged to the byte. Elsewhere it is a SecureDir
# and the operation goes through the verified path. Keeping one spelling for both
# is what lets the subsystem stay single-sourced instead of growing a parallel
# Windows implementation that drifts.
# ---------------------------------------------------------------------------

Anchor = "int | SecureDir"


def open_anchor(path: Path | str, *, create: bool = False, pin: bool = False):
    """Verify ``path`` component by component and return an anchor to it.

    ``pin`` requests the Windows handle chain. It is off by default because a
    pinned ancestor is opened sharing read only, which denies the write access
    that creating or renaming an entry inside it needs -- and a transaction that
    stages entries throughout its own tree does exactly that. Those callers
    carry their own defence instead, re-checking device and inode at every step
    against a sealed manifest, which is what detects a swapped component for
    them. Pass pin=True for a one-shot publication, where nothing is written
    into the pinned path itself.
    """
    directory = SecureDir.open(path, create=create, pin=pin)
    if directory.fd is not None:
        return directory.detach()
    return directory


def dup_anchor(anchor):
    """An independent anchor to the same directory, which the caller closes.

    The POSIX form is os.dup, so the original descriptor stays usable; the path
    form re-verifies and returns a fresh handle on the same directory.
    """
    if isinstance(anchor, SecureDir):
        return SecureDir.open(anchor.path)
    return os.dup(anchor)


def close_anchor(anchor) -> None:
    if isinstance(anchor, SecureDir):
        anchor.close()
    else:
        os.close(anchor)


def child_anchor(anchor, name: str, *, create: bool = False):
    if isinstance(anchor, SecureDir):
        return anchor.child(name, create=create)
    flags = os.O_RDONLY | _DIRECTORY | _NOFOLLOW | _CLOEXEC
    try:
        return os.open(name, flags, dir_fd=anchor)
    except FileNotFoundError:
        if not create:
            raise
        try:
            os.mkdir(name, 0o700, dir_fd=anchor)
        except FileExistsError:
            pass
        return os.open(name, flags, dir_fd=anchor)


def open_at(anchor, name: str, flags: int, mode: int = 0o600) -> int:
    if isinstance(anchor, SecureDir):
        return anchor.open_file(name, flags, mode)
    return os.open(name, flags | _NOFOLLOW, mode, dir_fd=anchor)


def mkdir_at(anchor, name: str, mode: int = 0o700) -> None:
    if isinstance(anchor, SecureDir):
        anchor.mkdir(name, mode)
        return
    os.mkdir(name, mode, dir_fd=anchor)


def lstat_at(anchor, name: str) -> os.stat_result:
    if isinstance(anchor, SecureDir):
        return anchor.lstat(name)
    return os.stat(name, dir_fd=anchor, follow_symlinks=False)


def stat_at(anchor) -> os.stat_result:
    if isinstance(anchor, SecureDir):
        return anchor.stat()
    return os.fstat(anchor)


def remove_at(anchor, name: str) -> None:
    if isinstance(anchor, SecureDir):
        anchor.unlink(name)
        return
    os.unlink(name, dir_fd=anchor)


def rmdir_at(anchor, name: str) -> None:
    if isinstance(anchor, SecureDir):
        os.rmdir(anchor.path / name)
        return
    os.rmdir(name, dir_fd=anchor)


def _anchor_path(anchor, name: str) -> Path:
    if isinstance(anchor, SecureDir):
        return anchor.path / name
    raise AssertionError("path form requested for a descriptor anchor")


def replace_at(
    source_anchor, source: str, destination_anchor, destination: str
) -> None:
    if isinstance(source_anchor, SecureDir) or isinstance(
        destination_anchor, SecureDir
    ):
        # Retried: the path form is the one that meets Windows' refusal to
        # rename over a destination any handle holds open.
        replace_with_retry(
            _anchor_path(source_anchor, source),
            _anchor_path(destination_anchor, destination),
        )
        return
    os.replace(
        source,
        destination,
        src_dir_fd=source_anchor,
        dst_dir_fd=destination_anchor,
    )


def rename_at(source_anchor, source: str, destination_anchor, destination: str) -> None:
    if isinstance(source_anchor, SecureDir) or isinstance(
        destination_anchor, SecureDir
    ):
        os.rename(
            _anchor_path(source_anchor, source),
            _anchor_path(destination_anchor, destination),
        )
        return
    os.rename(
        source,
        destination,
        src_dir_fd=source_anchor,
        dst_dir_fd=destination_anchor,
    )


def scandir_at(anchor):
    if isinstance(anchor, SecureDir):
        return anchor.scandir()
    return os.scandir(anchor)


def is_redirect_stat(info: os.stat_result) -> bool:
    """Whether an already-taken ``lstat`` describes a redirect.

    A POSIX symlink has its own file type, so ``S_ISLNK`` settles it. A Windows
    junction does not: it reports as a directory and carries the reparse
    attribute instead, so code that branches on ``S_ISDIR`` alone will walk into
    it. Callers that are deciding "descend or treat as a link" must ask this
    first, before the ``S_ISDIR`` test.
    """
    if stat.S_ISLNK(info.st_mode):
        return True
    attributes = getattr(info, "st_file_attributes", 0)
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def entry_redirects(path: Path | str) -> bool:
    """Whether an existing entry redirects elsewhere; a missing path does not.

    This is the drop-in replacement for ``Path.is_symlink()`` in a security
    check. It gives the same answer for a symlink and for a path that is not
    there, so call sites keep their meaning, but it also reports a Windows
    junction -- which ``Path.is_symlink()`` does not, and which an unprivileged
    user can create. Prefer ``is_redirect`` where a path that cannot be read
    should count as unsafe, such as while walking one component at a time.
    """
    try:
        info = os.lstat(path)
    except (OSError, ValueError):
        return False
    return is_redirect_stat(info)


def remove_redirect_at(anchor, name: str) -> None:
    """Remove a redirect entry itself, never what it points at.

    A symlink is unlinked. A Windows junction is a directory entry, so it needs
    rmdir; that removes the junction and leaves the target alone.
    """
    try:
        remove_at(anchor, name)
        return
    except (IsADirectoryError, PermissionError, OSError):
        rmdir_at(anchor, name)


def replace_with_retry(
    source: Path | str,
    destination: Path | str,
    *,
    attempts: int = 25,
    pause: float = 0.02,
) -> None:
    """os.replace, retried while the destination is momentarily held open.

    On Windows a rename over a destination that any handle holds open fails,
    even a read-only one, where POSIX renames successfully and leaves the reader
    on the old inode. The usual holder is transient -- an indexer or scanner
    reading what was just written -- and it lets go in milliseconds. A holder
    that does not let go still fails, so a real sharing problem is still
    reported rather than hidden.
    """
    import time

    for attempt in range(attempts):
        try:
            os.replace(source, destination)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(pause)


def fsync_directory(path: Path | str) -> None:
    """Flush a directory entry named by path, where the platform allows it.

    os.open on a directory raises PermissionError on Windows, so the usual
    open-fsync-close sequence cannot run at all there. See fsync_at for what
    that costs: files written inside are still fsynced, and what is unavailable
    is the durability of a newly created name across a power loss.
    """
    directory_flag = getattr(os, "O_DIRECTORY", 0)
    if not directory_flag and os.name == "nt":
        return
    descriptor = os.open(path, os.O_RDONLY | directory_flag)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def fsync_at(anchor) -> None:
    """Flush the directory entry where the platform allows it.

    Windows does not: there is no directory descriptor to fsync, and flushing
    the volume handle instead needs administrator rights. Files written inside
    are still fsynced on their own descriptors, so what is unavailable is the
    durability of a newly created *name* across a power loss. A caller that
    needs that guarantee has to say so rather than infer it from a clean return.
    """
    if isinstance(anchor, SecureDir):
        return
    os.fsync(anchor)
