"""The replay snapshot may only skip what the fingerprint already ignores.

`verify-roadmap-completion.py` copies the whole worktree so it can replay every
verifier against a tree nobody is editing, then proves the copy is faithful by
comparing `worktree_fingerprint(snapshot)` with `worktree_fingerprint(ROOT)`.

That comparison is what makes skipping a directory safe -- and only for the
directories the fingerprint already excludes. `.memory` is one: it holds the
code-graph store, which reached 483MB of this 836MB worktree, so the replay copied
it, the fingerprint dropped it, and the copy bought nothing. It cost more than
nothing: a git call inside the snapshot's own fingerprint stopped answering within
its 45s budget, the verifier refused to emit a fingerprint, and the roadmap check
failed in a way that read as a broken gate. With `.memory` left out the same check
passes with the default timeout.

So the rule is tested rather than remembered: anything added to
SNAPSHOT_EXCLUDED_DIRS must be a path the fingerprint ignores. Add one it covers
and the snapshot stops matching the source, which is a silently weaker replay
rather than a loud failure.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "lite"))

from evidence_common import _ignored_verify_path  # noqa: E402


def _runner_module():
    path = ROOT / "scripts" / "ci" / "verify-roadmap-completion.py"
    spec = importlib.util.spec_from_file_location("roadmap_runner_under_test", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_every_skipped_directory_is_one_the_fingerprint_ignores():
    runner = _runner_module()
    assert runner.SNAPSHOT_EXCLUDED_DIRS, (
        "the exclusion list is empty; the copy is unbounded again"
    )
    for name in runner.SNAPSHOT_EXCLUDED_DIRS:
        assert _ignored_verify_path(name), (
            f"{name!r} is copied out of the snapshot but the fingerprint covers it, "
            "so the snapshot would no longer match the source"
        )
        assert _ignored_verify_path(f"{name}/nested/file.bin"), (
            f"content under {name!r} is covered by the fingerprint; skipping the "
            "directory would change the digest"
        )


def test_dropping_an_excluded_directory_leaves_the_rest_of_the_snapshot(tmp_path: Path):
    runner = _runner_module()
    snapshot = tmp_path / "workspace"
    (snapshot / "src").mkdir(parents=True)
    (snapshot / "src" / "keep.py").write_text("keep\n", encoding="utf-8")
    for name in runner.SNAPSHOT_EXCLUDED_DIRS:
        target = snapshot / name / "deep"
        target.mkdir(parents=True)
        (target / "store.bin").write_bytes(b"0" * 1024)

    runner._drop_excluded_dirs(snapshot)

    for name in runner.SNAPSHOT_EXCLUDED_DIRS:
        assert not (snapshot / name).exists(), f"{name} survived the drop"
    assert (snapshot / "src" / "keep.py").read_text(encoding="utf-8") == "keep\n"


def test_dropping_is_quiet_when_the_directory_was_never_copied(tmp_path: Path):
    # robocopy is told to skip them, so on Windows there is nothing to remove. The
    # helper runs on every platform and must not care which one it is on.
    runner = _runner_module()
    snapshot = tmp_path / "workspace"
    snapshot.mkdir()
    runner._drop_excluded_dirs(snapshot)
    assert snapshot.is_dir()


def test_the_verifier_environment_does_not_inherit_a_legacy_codepage():
    # A verifier that prints a non-cp1252 character must not fail for that reason.
    # This one is read from the source because the environment is built inside the
    # run, and the alternative is replaying a 276-second verification to assert one
    # variable.
    source = (ROOT / "scripts" / "ci" / "verify-roadmap-completion.py").read_text(
        encoding="utf-8"
    )
    assert 'environment["PYTHONUTF8"] = "1"' in source, (
        "the verifier environment no longer forces UTF-8; a verifier's verdict "
        "would depend on the console codepage that launched the gate"
    )
