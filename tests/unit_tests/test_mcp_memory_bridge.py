"""dn_memory_add and dn_memory_search, through the DAI memory layer.

The harness's two memory tools keep their names and their arguments; what
answers them is now the vendored memory layer, reached through its CLI. These
tests drive the MCP server over stdio the way an IDE does, against a real store
in a scratch project.

The layer needs its install to run. When it has not been installed,
these tests are skipped with the command that installs it. The harness
installers do not run it yet; that moves in with the switch-over from GitNexus.

They run the layer's lexical test embedder (MEMORY_LAYER_TEST=1) so that a test
run needs no model download. The shipped path requires the real model, and the
layer refuses the test embedder outside a test.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SERVER = ROOT / "mcp" / "server.py"
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


def _env(project: Path, home: Path) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        DAINEXUS_ROOT=str(project),
        MEMORY_LAYER_HOME=str(home),
        MEMORY_LAYER_EMBEDDINGS="hash",
        MEMORY_LAYER_TEST="1",
        MEMORY_LAYER_LOG_LEVEL="error",
    )
    return env


@pytest.fixture()
def project(tmp_path: Path):
    repo = tmp_path / "project"
    repo.mkdir()
    (repo / "docs").mkdir()
    (repo / "docs" / "billing.md").write_text(
        "# Billing\n\nRetry a declined card at most twice.\n", encoding="utf-8"
    )
    for argv in (
        ["init", "-q"],
        ["config", "user.email", "test@example.invalid"],
        ["config", "user.name", "bridge test"],
        ["add", "-A"],
        ["commit", "-qm", "fixture"],
    ):
        subprocess.run(["git", "-C", str(repo), *argv], check=True, capture_output=True)
    home = tmp_path / "home"
    home.mkdir()
    done = subprocess.run(
        [NODE, str(CLI), "init"],
        cwd=repo,
        env=_env(repo, home),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )
    assert done.returncode == 0, done.stderr
    return repo, home


def _call(project: Path, home: Path, tool: str, arguments: dict) -> tuple[dict, bool]:
    """One tools/call over stdio, the way an IDE sends it."""
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        },
    ]
    done = subprocess.run(
        [sys.executable, str(SERVER)],
        input="".join(json.dumps(r) + "\n" for r in requests),
        env=_env(project, home),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=300,
    )
    replies = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
    reply = next(r for r in replies if r.get("id") == 2)
    assert "result" in reply, reply
    result = reply["result"]
    return json.loads(result["content"][0]["text"]), result["isError"]


def test_an_observation_is_recorded_with_its_layer_and_importance(project) -> None:
    repo, home = project
    payload, failed = _call(
        repo,
        home,
        "dn_memory_add",
        {
            "text": "PRs stay under 400 lines\nReview quality drops past that.",
            "category": "decisions",
            "importance": 8,
        },
    )
    assert not failed, payload
    assert payload["id"].startswith("mem_"), payload

    got = subprocess.run(
        [NODE, str(CLI), "get", payload["id"], "--json"],
        cwd=repo,
        env=_env(repo, home),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    node = json.loads(got.stdout)["node"]
    assert node["layer"] == "semantic", "a decision belongs in the semantic layer"
    assert node["title"] == "PRs stay under 400 lines", "the title is the first line"
    assert node["importance"] == 8, "the importance given is the one stored"
    assert node["sourceRef"].startswith("mcp:")


def test_a_search_finds_what_was_recorded(project) -> None:
    repo, home = project
    added, _ = _call(
        repo,
        home,
        "dn_memory_add",
        {"text": "Refunds settle within five business days", "category": "decisions"},
    )
    payload, failed = _call(
        repo, home, "dn_memory_search", {"query": "refunds settle days", "limit": 5}
    )
    assert not failed, payload
    assert any(hit["id"] == added["id"] for hit in payload["results"]), payload
    # The fusion report comes through: whether a branch was missing changes how
    # far the ranking can be trusted, and the tool must not strip it.
    assert "fusion" in payload


def test_a_category_nobody_mapped_is_a_fact(project) -> None:
    repo, home = project
    for category, layer in (
        ("errors", "episodic"),
        ("procedure", "procedural"),
        ("whatever", "semantic"),
    ):
        payload, failed = _call(
            repo,
            home,
            "dn_memory_add",
            {"text": f"a {category} record", "category": category},
        )
        assert not failed, payload
        got = subprocess.run(
            [NODE, str(CLI), "get", payload["id"], "--json"],
            cwd=repo,
            env=_env(repo, home),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=120,
        )
        assert json.loads(got.stdout)["node"]["layer"] == layer, category


def test_a_project_without_a_store_is_an_error_not_an_empty_answer(
    tmp_path: Path,
) -> None:
    # "Nothing recorded about this" and "memory could not be asked" are different
    # answers. The second must never be returned as the first.
    bare = tmp_path / "bare"
    bare.mkdir()
    subprocess.run(
        ["git", "-C", str(bare), "init", "-q"], check=True, capture_output=True
    )
    home = tmp_path / "home"
    home.mkdir()
    payload, failed = _call(bare, home, "dn_memory_search", {"query": "anything"})
    assert failed, payload
    assert "error" in payload and payload["error"], payload
    assert "results" not in payload


def test_empty_arguments_are_refused(project) -> None:
    repo, home = project
    for tool, arguments in (
        ("dn_memory_add", {"text": "  "}),
        ("dn_memory_search", {"query": ""}),
    ):
        payload, failed = _call(repo, home, tool, arguments)
        assert failed and "needs" in payload["error"], (tool, payload)
