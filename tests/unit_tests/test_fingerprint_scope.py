"""What the worktree fingerprint covers, and what it may skip for speed.

The fingerprint asks git for tracked, untracked and ignored paths and then drops the
derived trees -- installed dependencies, generated stores, git's own directory. On
this repository that meant git listed 28,267 ignored paths so the filter could keep
186, once per fingerprint, and a run makes several. Handing git the same rule as a
pathspec made one fingerprint 9.08s -> 3.63s for the same digest.

"For the same digest" is the whole claim, and it is the one thing worth testing: an
exclusion that removes a path the fingerprint should have covered does not fail
loudly. It produces a fingerprint that still looks like a fingerprint while no
longer noticing a change, which is how evidence stops meaning anything.

So: derived content must never move the digest, and anything else must always move
it.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lite"))

from evidence_common import (  # noqa: E402
    _DERIVED_TREE_DIR_NAMES,
    _DERIVED_TREE_PATHSPEC,
    _ignored_verify_path,
    worktree_fingerprint,
)


def _repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    for argv in (
        ["init", "-q"],
        ["config", "user.email", "test@example.invalid"],
        ["config", "user.name", "Test"],
        ["config", "commit.gpgsign", "false"],
    ):
        subprocess.run(["git", *argv], cwd=repo, check=True, capture_output=True)
    (repo / "src").mkdir()
    (repo / "src" / "main.py").write_text("print('hi')\n", encoding="utf-8")
    # Ignore both a derived tree and a directory that is not one, so the two cases
    # can be told apart: both are ignored by git, only one is derived.
    (repo / ".gitignore").write_text(
        "node_modules/\n.memory/\nlocal-notes/\n", encoding="utf-8"
    )
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-q", "-m", "seed"], cwd=repo, check=True, capture_output=True
    )
    return repo


def _write(repo: Path, relative: str, text: str = "x\n") -> None:
    path = repo / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_derived_content_never_moves_the_digest(tmp_path: Path):
    repo = _repo(tmp_path)
    before = worktree_fingerprint(repo)
    for name in _DERIVED_TREE_DIR_NAMES:
        if name == ".git":
            continue  # git's own directory is not a path git will list
        _write(repo, f"{name}/pkg/index.js", "// installed\n")
        _write(repo, f"{name}/deep/nested/blob.bin", "0" * 64)
    assert worktree_fingerprint(repo) == before, (
        "content under a derived tree changed the fingerprint; the filter and the "
        "pathspec no longer agree"
    )


def test_an_ignored_file_outside_a_derived_tree_does_move_the_digest(tmp_path: Path):
    # This is the assertion that catches over-exclusion. `local-notes/` is ignored by
    # git and covered by the fingerprint on purpose: ignored is not derived.
    repo = _repo(tmp_path)
    before = worktree_fingerprint(repo)
    _write(repo, "local-notes/decision.md", "we chose B\n")
    assert worktree_fingerprint(repo) != before, (
        "an ignored file outside the derived trees did not change the fingerprint; "
        "the pathspec is excluding more than the filter does"
    )


def test_tracked_and_untracked_changes_move_the_digest(tmp_path: Path):
    repo = _repo(tmp_path)
    before = worktree_fingerprint(repo)
    _write(repo, "src/main.py", "print('changed')\n")
    after_tracked = worktree_fingerprint(repo)
    assert after_tracked != before, "editing a tracked file did not change the digest"
    _write(repo, "src/new.py", "print('new')\n")
    assert worktree_fingerprint(repo) != after_tracked, (
        "adding an untracked file did not change the digest"
    )


def test_the_pathspec_only_names_trees_the_filter_rejects(tmp_path: Path):
    # The pathspec is a performance restatement of the filter. If it ever names a
    # tree the filter would keep, the fingerprint quietly stops covering it.
    assert _DERIVED_TREE_PATHSPEC, "the pathspec is empty; the optimisation is gone"
    for name in _DERIVED_TREE_DIR_NAMES:
        assert f":(exclude){name}/**" in _DERIVED_TREE_PATHSPEC
        assert f":(exclude)**/{name}/**" in _DERIVED_TREE_PATHSPEC
        assert _ignored_verify_path(f"{name}/anything"), (
            f"{name} is excluded from the git listing but the filter would keep it"
        )
        assert _ignored_verify_path(f"nested/{name}/anything")
