"""The vendored memory layer stays a copy.

vendor/dai-memory is the memory layer at one commit of its own repository, with
every file hashed. These tests keep it that way: the committed copy matches its
record, a sync takes exactly the runtime files and nothing else, and a source
carrying a name this repository forbids is refused before anything is written.

Every sync here targets a scratch directory through DAI_MEMORY_VENDOR_DIR. A
test that synced over the real copy would, the one time it went wrong, destroy
what it was checking.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "vendor" / "sync-dai-memory.mjs"
NODE = shutil.which("node")

pytestmark = pytest.mark.skipif(
    NODE is None, reason="node is required to run the sync script"
)


def _run(*args: str, target: Path | None = None) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    if target is not None:
        env["DAI_MEMORY_VENDOR_DIR"] = str(target)
    return subprocess.run(
        [NODE, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        cwd=ROOT,
        timeout=120,
    )


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
        env={**os.environ, "GIT_CONFIG_NOSYSTEM": "1"},
    ).stdout.strip()


def _source(tmp_path: Path, files: dict[str, str]) -> Path:
    """A throwaway memory-layer repository with exactly these files committed."""
    repo = tmp_path / "source"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "test@example.invalid")
    _git(repo, "config", "user.name", "vendor test")
    _git(repo, "config", "core.autocrlf", "false")
    for name, content in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content.encode("utf-8"))
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "fixture")
    return repo


RUNTIME = {
    "LICENSE": "MIT License\n",
    "package.json": '{"name": "memory"}\n',
    "bin/dai-memory.mjs": "// launcher\n",
    "packages/core/src/index.ts": "export const x = 1;\n",
    "packages/core/grammars/README.md": "grammars\n",
    "packages/cli/package.json": '{"name": "cli"}\n',
}
NOT_RUNTIME = {
    "tests/store.test.js": "// test\n",
    "eval/run.mjs": "// eval\n",
    "docs/usage.md": "# usage\n",
    "hooks/hooks.json": "{}\n",
    ".claude-plugin/plugin.json": "{}\n",
}


def test_the_committed_copy_matches_its_record() -> None:
    result = _run("--check")
    assert result.returncode == 0, result.stderr
    provenance = json.loads(
        (ROOT / "vendor" / "dai-memory" / "PROVENANCE.json").read_text(encoding="utf-8")
    )
    assert provenance["source"] == "https://github.com/Exia-thd/DAI-memory-layer-plugin"
    assert len(provenance["commit"]) == 40
    assert "LICENSE" in provenance["files"], (
        "the MIT notice has to travel with the copy"
    )


def test_a_sync_takes_the_runtime_files_and_nothing_else(tmp_path: Path) -> None:
    source = _source(tmp_path, {**RUNTIME, **NOT_RUNTIME})
    target = tmp_path / "vendor"
    result = _run("--source", str(source), target=target)
    assert result.returncode == 0, result.stderr

    provenance = json.loads((target / "PROVENANCE.json").read_text(encoding="utf-8"))
    assert provenance["commit"] == _git(source, "rev-parse", "HEAD")
    assert sorted(provenance["files"]) == sorted(RUNTIME)
    for name, content in RUNTIME.items():
        expected = hashlib.sha256(content.encode("utf-8")).hexdigest()
        assert provenance["files"][name] == expected, name
    for name in NOT_RUNTIME:
        assert not (target / name).exists(), f"{name} was copied, and it does not run"

    assert _run("--check", target=target).returncode == 0


def test_the_copy_is_read_from_the_commit_not_the_working_tree(tmp_path: Path) -> None:
    # An uncommitted edit in the source must not ride along into a copy that
    # claims to be that commit.
    source = _source(tmp_path, RUNTIME)
    (source / "packages" / "core" / "src" / "index.ts").write_text(
        "export const x = 2;\n", encoding="utf-8"
    )
    target = tmp_path / "vendor"
    assert _run("--source", str(source), target=target).returncode == 0
    copied = (target / "packages" / "core" / "src" / "index.ts").read_text(
        encoding="utf-8"
    )
    assert copied == RUNTIME["packages/core/src/index.ts"]


def test_a_re_sync_removes_what_the_source_dropped_and_leaves_build_output(
    tmp_path: Path,
) -> None:
    source = _source(tmp_path, RUNTIME)
    target = tmp_path / "vendor"
    assert _run("--source", str(source), target=target).returncode == 0

    installed = target / "node_modules" / "dep" / "index.js"
    installed.parent.mkdir(parents=True)
    installed.write_text("// installed\n", encoding="utf-8")
    (target / "packages" / "core" / "tsconfig.tsbuildinfo").write_text(
        "{}", encoding="utf-8"
    )

    (source / "packages" / "core" / "grammars" / "README.md").unlink()
    _git(source, "add", "-A")
    _git(source, "commit", "-qm", "drop")
    assert _run("--source", str(source), target=target).returncode == 0

    assert not (target / "packages" / "core" / "grammars").exists(), (
        "a dropped file stayed behind"
    )
    assert installed.exists(), "a sync reached into node_modules"
    assert _run("--check", target=target).returncode == 0, (
        "build output was counted as part of the copy"
    )


def test_an_edit_in_place_is_reported(tmp_path: Path) -> None:
    source = _source(tmp_path, RUNTIME)
    target = tmp_path / "vendor"
    assert _run("--source", str(source), target=target).returncode == 0

    (target / "packages" / "core" / "src" / "index.ts").write_text(
        "// fixed here\n", encoding="utf-8"
    )
    (target / "packages" / "core" / "src" / "extra.ts").write_text(
        "\n", encoding="utf-8"
    )
    (target / "LICENSE").unlink()

    result = _run("--check", target=target)
    assert result.returncode == 1
    assert "modified  packages/core/src/index.ts" in result.stderr
    assert "added     packages/core/src/extra.ts" in result.stderr
    assert "missing   LICENSE" in result.stderr
    assert "Make the change in the memory layer" in result.stderr


def test_a_forbidden_name_is_refused_before_anything_is_written(tmp_path: Path) -> None:
    token = "forge" + "wr" + "ight"
    source = _source(
        tmp_path, {**RUNTIME, "packages/core/src/borrowed.ts": f"// from {token}\n"}
    )
    target = tmp_path / "vendor"

    result = _run("--source", str(source), target=target)
    assert result.returncode == 1
    assert "packages/core/src/borrowed.ts" in result.stderr
    assert not target.exists(), "files were written before the source was refused"
