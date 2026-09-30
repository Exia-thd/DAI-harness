"""Migrating the old SQLite memory into the DAI memory layer.

The legacy store is built with the harness's own MemoryDB, so its schema is the
real one rather than a guess at it. The migration is checked for what it moves,
what it leaves behind and says so, that the old database is not touched, that a
second run creates no duplicates, and that it refuses before writing when the
project has no store.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "lite" / "migrate-memory.py"
sys.path.insert(0, str(ROOT / "scripts" / "lite"))
import dai_memory  # noqa: E402

CLI = dai_memory.memory_cli()
NODE = shutil.which("node")

pytestmark = [
    pytest.mark.skipif(NODE is None, reason="node is required by the memory layer"),
    pytest.mark.skipif(
        not dai_memory.installed(),
        reason=f"the memory layer is not installed: run `{dai_memory.INSTALL_HINT}`",
    ),
]


def _env(home: Path) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        MEMORY_LAYER_HOME=str(home),
        MEMORY_LAYER_EMBEDDINGS="hash",
        MEMORY_LAYER_TEST="1",
        MEMORY_LAYER_LOG_LEVEL="error",
        PYTHONIOENCODING="utf-8",
    )
    return env


# The legacy schema, as the retired scripts/lite/memory.py wrote it. Copied
# here on purpose: this test is about reading a store that no longer has code
# to create it, so the shape being migrated has to be pinned by the test rather
# than borrowed from a module that is gone.
LEGACY_SCHEMA = """
CREATE TABLE observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_root TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    importance INTEGER DEFAULT 5,
    access_count INTEGER DEFAULT 0,
    content_hash TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at_epoch INTEGER NOT NULL DEFAULT (unixepoch()),
    last_accessed_epoch INTEGER,
    archived INTEGER DEFAULT 0,
    archived_at TEXT,
    UNIQUE(content_hash, project_root)
);
"""


def _legacy(project: Path) -> Path:
    """A legacy store with one of each case the migration has to tell apart."""
    db_path = project / ".daiharness" / "memory.db"
    rows = [
        # title, content, type, importance, archived
        (
            "Refunds settle within five business days",
            "Refunds settle within five business days",
            "decisions",
            9,
            0,
        ),
        (
            "Checkout crashed when the basket was empty",
            "Checkout crashed when the basket was empty",
            "errors",
            6,
            0,
        ),
        (
            "Release: tag, build, then publish",
            "Release: tag, build, then publish",
            "procedure",
            4,
            0,
        ),
        ("An old rule nobody follows", "An old rule nobody follows", "decisions", 5, 1),
        (
            "# README heading copied from a file",
            "# README heading copied from a file",
            "ingested",
            5,
            0,
        ),
    ]
    connection = sqlite3.connect(str(db_path))
    try:
        connection.executescript(LEGACY_SCHEMA)
        for title, content, kind, importance, archived in rows:
            connection.execute(
                "INSERT INTO observations (project_root, type, title, content, importance,"
                " content_hash, source, archived) VALUES (?, ?, ?, ?, ?, ?, 'manual', ?)",
                (
                    str(project),
                    kind,
                    title,
                    content,
                    importance,
                    hashlib.sha256(content.encode("utf-8")).hexdigest(),
                    archived,
                ),
            )
        connection.commit()
    finally:
        connection.close()
    return db_path


def _project(tmp_path: Path, with_store: bool) -> tuple[Path, Path]:
    project = tmp_path / "project"
    (project / ".daiharness").mkdir(parents=True)
    (project / "notes.md").write_text("# Notes\n\nNothing much.\n", encoding="utf-8")
    subprocess.run(
        ["git", "-C", str(project), "init", "-q"], check=True, capture_output=True
    )
    home = tmp_path / "home"
    home.mkdir()
    if with_store:
        done = subprocess.run(
            [NODE, str(CLI), "init"],
            cwd=project,
            env=_env(home),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
        )
        assert done.returncode == 0, done.stderr
    return project, home


def _migrate(
    project: Path, home: Path, *extra: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), "--project", str(project), *extra],
        env=_env(home),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=600,
    )


def _recorded(project: Path, home: Path) -> list[dict]:
    """Everything a person recorded, from every layer the migration writes to."""
    found = []
    for query in (
        "refunds settle",
        "checkout crashed basket",
        "release tag publish",
        "old rule",
        "README heading",
    ):
        done = subprocess.run(
            [NODE, str(CLI), "search", query, "--limit", "20", "--json"],
            cwd=project,
            env=_env(home),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
        )
        found.extend(json.loads(done.stdout)["results"])
    unique = {
        hit["id"]: hit
        for hit in found
        if hit["sourceRef"].startswith("legacy:memory.db#")
    }
    return list(unique.values())


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_what_people_recorded_moves_into_its_layer(tmp_path: Path) -> None:
    project, home = _project(tmp_path, with_store=True)
    legacy = _legacy(project)
    before = _sha(legacy)

    done = _migrate(project, home)
    assert done.returncode == 0, done.stderr + done.stdout
    assert json.loads(done.stdout.strip().splitlines()[-1]) == {
        "migrated": 3,
        "archived": 1,
        "derived": 1,
    }

    moved = {hit["title"]: hit for hit in _recorded(project, home)}
    assert set(moved) == {
        "Refunds settle within five business days",
        "Checkout crashed when the basket was empty",
        "Release: tag, build, then publish",
    }, sorted(moved)
    assert moved["Refunds settle within five business days"]["layer"] == "semantic"
    assert moved["Checkout crashed when the basket was empty"]["layer"] == "episodic"
    assert moved["Release: tag, build, then publish"]["layer"] == "procedural"

    assert _sha(legacy) == before, "the legacy database was modified"


def test_what_stays_behind_is_said_out_loud(tmp_path: Path) -> None:
    project, home = _project(tmp_path, with_store=True)
    _legacy(project)
    done = _migrate(project, home, "--dry-run")
    assert done.returncode == 0, done.stderr
    assert "1 archived -- left behind" in done.stdout
    assert "1 copied from files -- left behind" in done.stdout
    assert "3 to migrate" in done.stdout
    assert _recorded(project, home) == [], "a dry run wrote something"


def test_running_it_twice_creates_no_duplicates(tmp_path: Path) -> None:
    project, home = _project(tmp_path, with_store=True)
    _legacy(project)
    assert _migrate(project, home).returncode == 0
    first = sorted(hit["id"] for hit in _recorded(project, home))
    assert _migrate(project, home).returncode == 0
    second = sorted(hit["id"] for hit in _recorded(project, home))
    assert first == second and len(first) == 3


def test_a_project_without_a_store_is_refused_before_anything_is_written(
    tmp_path: Path,
) -> None:
    project, home = _project(tmp_path, with_store=False)
    _legacy(project)
    done = _migrate(project, home)
    assert done.returncode == 1
    assert "not ready" in done.stderr and "init" in done.stderr
    assert not (project / ".memory").exists()


def test_no_legacy_store_is_nothing_to_do(tmp_path: Path) -> None:
    project, home = _project(tmp_path, with_store=False)
    done = _migrate(project, home)
    assert done.returncode == 0
    assert "nothing to migrate" in done.stdout
