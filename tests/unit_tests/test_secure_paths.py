"""The traversal layer must refuse a redirect it cannot anchor around.

These are the cases that decide whether the Windows path is safe or only looks
safe. The junction test is the important one: a Windows junction redirects like
a symlink but ``os.path.islink`` reports False for it, so a check written
against ``islink`` walks straight through. Creating a junction needs no special
privilege, while creating a symlink needs SeCreateSymbolicLinkPrivilege, so the
junction is also the cheaper attack.
"""

from __future__ import annotations

import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts" / "runtime"))

from secure_paths import (  # noqa: E402
    SecureDir,
    SecurePathError,
    is_redirect,
    supports_fd_traversal,
)


def make_junction(link: Path, target: Path) -> bool:
    """Create a Windows junction, reporting whether the platform allowed it."""
    if os.name != "nt":
        return False
    result = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(target)],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and link.exists()


def make_symlink(link: Path, target: Path) -> bool:
    # Capability first: a platform without os.symlink cannot be asked at all,
    # and Windows raises OSError(1314) when the account lacks the privilege.
    if not hasattr(os, "symlink"):
        return False
    try:
        link.symlink_to(target, target_is_directory=target.is_dir())
    except OSError:
        return False
    return True


def test_fd_traversal_is_claimed_only_where_the_platform_has_it():
    """The capability probe must match reality, since callers branch on it."""
    supported = getattr(os, "supports_dir_fd", set())
    expected = bool(supported) and os.open in supported and hasattr(os, "O_DIRECTORY")
    assert supports_fd_traversal() == expected
    if os.name == "nt":
        assert not supports_fd_traversal(), (
            "Windows has no directory descriptor to anchor to; claiming otherwise "
            "would let callers assume a guarantee that is not there"
        )


def test_a_junction_is_treated_as_a_redirect(tmp_path):
    """os.path.islink misses this; the reparse attribute does not."""
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "link"
    if not make_junction(link, target):
        pytest.skip("platform does not create junctions")

    assert not os.path.islink(link), (
        "this test is pointless if islink already reports the junction"
    )
    info = os.lstat(link)
    assert info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT
    assert is_redirect(link), "a junction redirects and must be refused"


def test_a_symlink_is_treated_as_a_redirect(tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    link = tmp_path / "link"
    if not make_symlink(link, target):
        pytest.skip("platform does not allow this user to create symlinks")
    assert is_redirect(link)


def test_a_plain_directory_is_not_a_redirect(tmp_path):
    plain = tmp_path / "plain"
    plain.mkdir()
    assert not is_redirect(plain)


def test_an_unreadable_component_is_not_assumed_safe(tmp_path):
    assert is_redirect(tmp_path / "does-not-exist"), (
        "a component that cannot be stat-ed is not provably safe"
    )


def test_traversal_refuses_a_junction_component(tmp_path):
    """The whole point: a redirect anywhere on the way is refused."""
    outside = tmp_path / "outside"
    (outside / "inner").mkdir(parents=True)
    root = tmp_path / "root"
    root.mkdir()
    link = root / "hop"
    if not make_junction(link, outside):
        pytest.skip("platform does not create junctions")

    with pytest.raises((SecurePathError, OSError)) as caught:
        SecureDir.open(link / "inner")
    assert "redirect" in str(caught.value) or isinstance(caught.value, SecurePathError)


def test_traversal_opens_and_creates_a_real_tree(tmp_path):
    wanted = tmp_path / "a" / "b" / "c"
    with SecureDir.open(wanted, create=True) as directory:
        assert wanted.is_dir()
        assert directory.path == wanted or directory.fd is not None
        assert stat.S_ISDIR(directory.stat().st_mode)
    with SecureDir.open(wanted) as directory:
        assert stat.S_ISDIR(directory.stat().st_mode)


def test_traversal_refuses_a_file_as_a_component(tmp_path):
    (tmp_path / "file").write_text("x", encoding="utf-8")
    with pytest.raises((SecurePathError, OSError)):
        SecureDir.open(tmp_path / "file" / "child")


def test_missing_component_without_create_is_an_error(tmp_path):
    with pytest.raises(OSError):
        SecureDir.open(tmp_path / "absent" / "deeper")


def test_open_file_round_trips_and_rejects_a_directory(tmp_path):
    with SecureDir.open(tmp_path) as directory:
        fd = directory.open_file("note.txt", os.O_CREAT | os.O_RDWR, 0o600)
        try:
            os.write(fd, b"payload")
        finally:
            os.close(fd)
        assert (tmp_path / "note.txt").read_bytes() == b"payload"

        directory.mkdir("sub")
        with pytest.raises((SecurePathError, OSError)):
            directory.open_file("sub", os.O_RDONLY)


def test_open_file_refuses_a_redirected_file(tmp_path):
    real = tmp_path / "real"
    real.mkdir()
    secret = tmp_path / "secret.txt"
    secret.write_text("secret", encoding="utf-8")
    link = real / "note.txt"
    if not make_symlink(link, secret) and not make_junction(link, real):
        pytest.skip("platform does not allow this user to create redirects")
    with SecureDir.open(real) as directory:
        with pytest.raises((SecurePathError, OSError)):
            directory.open_file("note.txt", os.O_RDONLY)


def test_open_file_detects_a_file_swapped_between_check_and_open(tmp_path, monkeypatch):
    """Inject the race the Windows path cannot prevent, to prove it is caught.

    Descriptor anchoring makes this impossible; path-based opening cannot, so it
    must at least notice. The swap is injected deterministically rather than
    raced, because a test that loses the race proves nothing.
    """
    if supports_fd_traversal():
        pytest.skip("this platform anchors by descriptor, so there is no gap to inject")

    directory_path = tmp_path / "d"
    directory_path.mkdir()
    victim = directory_path / "note.txt"
    victim.write_text("original", encoding="utf-8")

    real_open = os.open
    swapped = {"done": False}

    def swapping_open(path, flags, mode=0o777, **kwargs):
        if not swapped["done"] and str(path) == str(victim):
            swapped["done"] = True
            victim.unlink()
            victim.write_text("substituted", encoding="utf-8")
        return real_open(path, flags, mode, **kwargs)

    monkeypatch.setattr(os, "open", swapping_open)
    with SecureDir.open(directory_path) as directory:
        with pytest.raises(SecurePathError) as caught:
            directory.open_file("note.txt", os.O_RDONLY)
    assert swapped["done"], "the swap never fired, so nothing was tested"
    assert "replaced" in str(caught.value)


def test_replace_unlink_lstat_and_scandir_operate_inside_the_directory(tmp_path):
    with SecureDir.open(tmp_path, create=True) as directory:
        fd = directory.open_file("tmp.json", os.O_CREAT | os.O_WRONLY, 0o600)
        try:
            os.write(fd, b"{}")
        finally:
            os.close(fd)
        directory.replace("tmp.json", "final.json")
        assert (tmp_path / "final.json").is_file()
        assert not (tmp_path / "tmp.json").exists()

        assert stat.S_ISREG(directory.lstat("final.json").st_mode)
        with directory.scandir() as entries:
            assert "final.json" in {entry.name for entry in entries}

        directory.unlink("final.json")
        assert not (tmp_path / "final.json").exists()
        directory.unlink("final.json", missing_ok=True)
        with pytest.raises(FileNotFoundError):
            directory.unlink("final.json")


def test_a_closed_directory_refuses_further_use(tmp_path):
    directory = SecureDir.open(tmp_path)
    directory.close()
    directory.close()  # releasing twice must not raise
    with pytest.raises(SecurePathError):
        directory.lstat("anything")


def test_child_keeps_the_parent_usable(tmp_path):
    (tmp_path / "one" / "two").mkdir(parents=True)
    with SecureDir.open(tmp_path) as parent:
        with parent.child("one") as first:
            with first.child("two") as second:
                assert stat.S_ISDIR(second.stat().st_mode)
            assert stat.S_ISDIR(first.stat().st_mode)
        assert stat.S_ISDIR(parent.stat().st_mode)


def test_an_open_directory_pins_its_ancestors_against_replacement(tmp_path):
    """The anchor, not just the check: a pinned ancestor cannot be swapped.

    This is the property that makes the Windows path equivalent to holding a
    POSIX directory descriptor. While the chain is held the component cannot be
    renamed or deleted, so there is no window in which the verified path starts
    pointing somewhere else. On POSIX the descriptor gives this directly and
    renaming a directory is legal, so the assertion only applies where the pin
    is what provides it.
    """
    victim = tmp_path / "middle"
    (victim / "leaf").mkdir(parents=True)
    # pin=True asks for the Windows handle chain. It is opt-in because a
    # pinned directory is shared read-only, which blocks writes into it; a
    # caller that only needs to publish one file wants it, and this test is
    # what proves the pin does what it claims.
    with SecureDir.open(victim / "leaf", pin=True) as directory:
        assert stat.S_ISDIR(directory.stat().st_mode)
        if os.name != "nt":
            pytest.skip("POSIX anchors by descriptor; renaming a directory stays legal")
        with pytest.raises(OSError) as caught:
            victim.rename(tmp_path / "moved")
        assert caught.value.winerror in (5, 32), caught.value
        assert victim.is_dir(), "the pinned ancestor must still be in place"
    # Once released, the same rename is allowed again.
    victim.rename(tmp_path / "moved")
    assert (tmp_path / "moved").is_dir()
