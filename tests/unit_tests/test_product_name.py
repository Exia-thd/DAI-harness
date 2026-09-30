"""The product is DAI Harness; its former name survives only where it must.

The rename touched display text, identifiers, environment variables, runtime
directories, script names and the MCP tool prefix at once. Three kinds of
reference to the old name are still correct, and each is pinned here:

- the frozen code-graph oracle, a record of an older commit's paths;
- the one-time migration that moves runtime state kept under the old name;
- the changelog entry that records the rename.

Everything else naming it is a regression, so the first test scans every
tracked text file. The name is assembled from fragments: a repo-wide rename
once rewrote a guard's own token list and turned the guard against every file.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
OLD = "ne" + "xus"
OLD_NAME = re.compile("dai[ _.-]?" + OLD, re.IGNORECASE)
LEGACY_DIR = ".dai" + OLD
BASH = shutil.which("bash")

ALLOWED_PREFIXES = ("src/codegraph/reference/snapshot/",)
ALLOWED_FILES = {
    "scripts/bootstrap/legacy-name-migration.sh",
    "CHANGELOG.md",
}
BINARY_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".wasm",
    ".db",
}


def tracked() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
    ).stdout.decode("utf-8")
    return [path for path in out.split("\0") if path]


def test_no_tracked_file_or_path_uses_the_former_name():
    offenders = []
    for relative in tracked():
        if relative.startswith(ALLOWED_PREFIXES) or relative in ALLOWED_FILES:
            continue
        if OLD_NAME.search(relative):
            offenders.append(f"{relative}: in the path")
            continue
        path = ROOT / relative
        if path.suffix.lower() in BINARY_SUFFIXES or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for number, line in enumerate(text.splitlines(), 1):
            if OLD_NAME.search(line):
                offenders.append(f"{relative}:{number}: {line.strip()[:100]}")
                break
    assert not offenders, "The former product name is back:\n" + "\n".join(
        f"  {entry}" for entry in offenders
    )


def test_the_changelog_names_the_former_name_only_to_record_the_rename():
    lines = [
        line
        for line in (ROOT / "CHANGELOG.md").read_text(encoding="utf-8").splitlines()
        if OLD_NAME.search(line)
    ]
    assert lines, "the changelog must record what the product used to be called"
    assert all(
        "renamed" in line.lower() or "former" in line.lower() for line in lines
    ), lines


@pytest.mark.skipif(BASH is None, reason="bash runs the installer's migration")
def test_runtime_state_under_the_former_name_moves_once(tmp_path: Path):
    home = tmp_path / "home"
    project = tmp_path / "project"
    (home / LEGACY_DIR / "sessions").mkdir(parents=True)
    (home / LEGACY_DIR / "sessions" / "s1.json").write_text("{}", encoding="utf-8")
    (project / LEGACY_DIR).mkdir(parents=True)
    (project / LEGACY_DIR / "memory.db").write_bytes(b"state")
    (project / (LEGACY_DIR + ".yaml")).write_text("mode: strict\n", encoding="utf-8")

    script = (ROOT / "scripts" / "bootstrap" / "legacy-name-migration.sh").as_posix()
    run = subprocess.run(
        [
            BASH,
            "-c",
            'source "$1"; migrate_legacy_home "$2"; migrate_legacy_project "$3"',
            "_",
            script,
            home.as_posix(),
            project.as_posix(),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert run.returncode == 0, run.stderr
    assert (home / ".daiharness" / "sessions" / "s1.json").is_file()
    assert (project / ".daiharness" / "memory.db").read_bytes() == b"state"
    assert (project / ".daiharness.yaml").is_file()
    assert not (home / LEGACY_DIR).exists() and not (project / LEGACY_DIR).exists()


@pytest.mark.skipif(BASH is None, reason="bash runs the installer's migration")
def test_migration_never_merges_into_existing_state(tmp_path: Path):
    project = tmp_path / "project"
    (project / LEGACY_DIR).mkdir(parents=True)
    (project / LEGACY_DIR / "memory.db").write_bytes(b"old")
    (project / ".daiharness").mkdir()
    (project / ".daiharness" / "memory.db").write_bytes(b"new")

    script = (ROOT / "scripts" / "bootstrap" / "legacy-name-migration.sh").as_posix()
    run = subprocess.run(
        [
            BASH,
            "-c",
            'source "$1"; migrate_legacy_project "$2"',
            "_",
            script,
            project.as_posix(),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert run.returncode == 0, run.stderr
    assert "both" in run.stderr, "the owner must be told both copies exist"
    assert (project / ".daiharness" / "memory.db").read_bytes() == b"new"
    assert (project / LEGACY_DIR / "memory.db").read_bytes() == b"old"


def _call(project: Path, tool: str) -> dict:
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": {}},
        },
    ]
    env = dict(os.environ, DAIHARNESS_ROOT=str(project))
    done = subprocess.run(
        [sys.executable, str(ROOT / "mcp" / "server.py")],
        input="".join(json.dumps(r) + "\n" for r in requests),
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    replies = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
    return next(r for r in replies if r.get("id") == 2)


def test_a_client_holding_the_old_tool_names_is_still_served(tmp_path: Path):
    current = _call(tmp_path, "dh_get_state")
    legacy = _call(tmp_path, "dn_get_state")
    assert "result" in current, current
    assert legacy.get("result") == current["result"], legacy

    unknown = _call(tmp_path, "dn_no_such_tool")
    assert unknown["error"]["code"] == -32602, unknown
