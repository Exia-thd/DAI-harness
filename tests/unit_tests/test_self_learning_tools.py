"""The manually triggered self-learning tools, and whether they work at all.

Two of them were unusable before this file existed.

`daiharness-evolution-init.sh` looked for its three helper scripts beside
itself. The layout was reorganised and it moved into `scripts/runtime/` with
only one of them, so it reported `asip-deterministic-check.sh` and
`daiharness-lesson-migrator.sh` as MISSING while both were present, and
declared the whole subsystem INCOMPLETE. It also spliced shell paths straight
into the Python helpers it runs: under MSYS that path is `/c/Users/...`, which
the native interpreter cannot open, so the metrics summary reported a missing
file that was right there and `--update-metrics` printed success while writing
nothing. Splicing also meant a skill name containing a quote broke the program.

`reverse_engineering_intelligence.py` had no entry point and no caller outside
its own tests, so the pinned catalog could not be consulted by hand. The tests
here also pin the property that matters about it: there is no flag that skips
the catalog digest check.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
INIT_SCRIPT = ROOT / "scripts" / "runtime" / "daiharness-evolution-init.sh"
RE_CLI = ROOT / "scripts" / "runtime" / "reverse_engineering_intelligence.py"
CATALOG = ROOT / ".daiharness" / "re-discovery-catalog.json"

HELPERS = {
    "scripts/runtime/daiharness-session-tracker.sh": "daiharness-session-tracker.sh",
    "scripts/skills/daiharness-lesson-migrator.sh": "daiharness-lesson-migrator.sh",
    "scripts/utilities/asip-deterministic-check.sh": "asip-deterministic-check.sh",
}

pytestmark = pytest.mark.skipif(
    shutil.which("bash") is None or shutil.which("python3") is None,
    reason="the init script is bash and runs python3; both must be on PATH",
)


def run(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args, cwd=cwd or ROOT, text=True, capture_output=True, check=False
    )


def plain(text: str) -> str:
    """Drop the ANSI colour the script writes, so assertions read the words."""
    out: list[str] = []
    index = 0
    while index < len(text):
        character = text[index]
        if character == "\x1b" and text[index + 1 : index + 2] == "[":
            index += 2
            while index < len(text) and not text[index].isalpha():
                index += 1
            index += 1
            continue
        out.append(character)
        index += 1
    return "".join(out)


def workspace(tmp_path: Path, *, helpers: bool = True) -> Path:
    """A standalone copy of the script tree the init script walks.

    The script derives its project root from its own location, so a hermetic
    test needs the real directory shape rather than an environment variable.
    """
    root = tmp_path / "repo"
    (root / "scripts" / "runtime").mkdir(parents=True)
    # The script locates its project by VERSION or the production-grade skill.
    (root / "VERSION").write_text("0.0.0-test\n", encoding="utf-8", newline="\n")
    shutil.copy2(INIT_SCRIPT, root / "scripts" / "runtime" / INIT_SCRIPT.name)
    if helpers:
        for relative in HELPERS:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
    (root / ".daiharness").mkdir(parents=True, exist_ok=True)
    return root


def init(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    script = root / "scripts" / "runtime" / INIT_SCRIPT.name
    return run("bash", str(script), *args, cwd=root)


def metrics_of(root: Path) -> dict:
    return json.loads(
        (root / ".daiharness" / "asip-metrics.json").read_text(encoding="utf-8")
    )


def state_of(root: Path) -> dict:
    return json.loads(
        (root / ".daiharness" / "asip-state.json").read_text(encoding="utf-8")
    )


# ─── evolution init: helper resolution ──────────────────────────────────────


def test_check_finds_helpers_that_live_in_other_subdirectories(tmp_path: Path) -> None:
    """The original bug: present files reported MISSING, subsystem INCOMPLETE."""
    root = workspace(tmp_path)
    result = init(root, "--check")
    assert result.returncode == 0, result.stderr
    text = plain(result.stdout)
    for name in HELPERS.values():
        assert f"{name} (MISSING)" not in text, text
        assert name in text, text


def test_check_reports_a_helper_that_really_is_absent(tmp_path: Path) -> None:
    """The resolver must still be able to say no."""
    root = workspace(tmp_path, helpers=False)
    text = plain(init(root, "--check").stdout)
    for name in HELPERS.values():
        assert f"{name} (MISSING)" in text, text


def test_resolution_prefers_the_organised_copy_over_the_root_shim(
    tmp_path: Path,
) -> None:
    """A deprecated `scripts/` shim must not shadow the real script.

    Observed through `--verify`, which syntax-checks whatever the resolver
    returned: the shim here is deliberately not valid shell, so a pass proves
    the organised copy was chosen.
    """
    root = workspace(tmp_path)
    shim = root / "scripts" / "daiharness-lesson-migrator.sh"
    shim.write_text("if then fi (((\n", encoding="utf-8", newline="\n")
    result = init(root, "--verify")
    text = plain(result.stdout + result.stderr)
    assert result.returncode == 0, text
    assert "daiharness-lesson-migrator.sh: valid" in text, text
    assert "INVALID" not in text, text


def test_check_accepts_the_tracker_state_filename_the_tracker_writes(
    tmp_path: Path,
) -> None:
    """The tracker writes session-tracker-v2.json; the check wanted v1."""
    root = workspace(tmp_path)
    (root / ".daiharness" / "session-tracker-v2.json").write_text(
        json.dumps({"sessions": []}), encoding="utf-8", newline="\n"
    )
    text = plain(init(root, "--check").stdout)
    assert "session-tracker-v2.json" in text, text
    assert "not found" not in text.split("Scripts:")[-1], text


# ─── evolution init: the python helpers it drives ───────────────────────────


def test_metrics_update_actually_increments_the_counter(tmp_path: Path) -> None:
    """It used to print success and write nothing wherever the path was MSYS."""
    root = workspace(tmp_path)
    assert init(root).returncode == 0
    assert metrics_of(root)["projectAdaptation"].get("lessonsLearned", 0) == 0

    result = init(root, "--update-metrics", "lesson_learned")
    assert result.returncode == 0, result.stderr
    assert metrics_of(root)["projectAdaptation"]["lessonsLearned"] == 1

    assert init(root, "--update-metrics", "lesson_learned", "", "4").returncode == 0
    assert metrics_of(root)["projectAdaptation"]["lessonsLearned"] == 5


def test_metrics_update_rejects_an_unknown_type_and_a_bad_value(
    tmp_path: Path,
) -> None:
    root = workspace(tmp_path)
    assert init(root).returncode == 0
    for args in (
        ("--update-metrics", "not_a_metric"),
        ("--update-metrics", "lesson_learned", "", "many"),
    ):
        result = init(root, *args)
        assert result.returncode != 0, (args, result.stdout)
    # A refused update must not have changed the file.
    assert metrics_of(root)["projectAdaptation"].get("lessonsLearned", 0) == 0


def test_state_update_survives_a_quote_in_a_skill_name(tmp_path: Path) -> None:
    """The name went into the program text, so one quote broke the helper.

    The command goes through `bash -c` so that bash does the word splitting.
    Handing a lone quote to MSYS bash through a Windows argument vector loses
    it before the script runs, which would measure argument passing rather
    than the helper.
    """
    root = workspace(tmp_path)
    assert init(root).returncode == 0
    script = root / "scripts" / "runtime" / INIT_SCRIPT.name
    command = f"bash '{script}' --update-state record_plan \"qa'engineer\" task-1 7.5"
    result = subprocess.run(
        ["bash", "-c", command], cwd=root, text=True, capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr
    attempt = state_of(root)["planAttempts"]["qa'engineer"]["task-1"]
    assert attempt["attempts"] == 1
    assert attempt["lastScore"] == 7.5
    assert attempt["researchGateTriggered"] is False


def test_state_update_flips_the_research_gate_on_the_second_attempt(
    tmp_path: Path,
) -> None:
    root = workspace(tmp_path)
    assert init(root).returncode == 0
    for score in ("7.5", "6.0"):
        assert (
            init(
                root, "--update-state", "record_plan", "builder", "task-1", score
            ).returncode
            == 0
        )
    attempt = state_of(root)["planAttempts"]["builder"]["task-1"]
    assert attempt["attempts"] == 2
    assert attempt["researchGateTriggered"] is True
    assert attempt["lastScore"] == 6.0

    assert init(root, "--update-state", "clear", "builder", "task-1").returncode == 0
    assert "task-1" not in state_of(root)["planAttempts"]["builder"]


def test_state_update_refuses_an_unknown_action_with_a_nonzero_exit(
    tmp_path: Path,
) -> None:
    root = workspace(tmp_path)
    assert init(root).returncode == 0
    result = init(root, "--update-state", "bogus", "builder", "task-1")
    assert result.returncode != 0, result.stdout
    assert "unknown action" in plain(result.stdout + result.stderr)


def test_init_writes_only_inside_its_own_workspace(tmp_path: Path) -> None:
    """A hermetic init must not touch the repository that hosts the test."""
    root = workspace(tmp_path)
    before = sorted(p.name for p in (ROOT / ".daiharness").glob("asip-*.json"))
    assert init(root).returncode == 0
    assert (root / ".daiharness" / "asip-state.json").is_file()
    after = sorted(p.name for p in (ROOT / ".daiharness").glob("asip-*.json"))
    assert before == after


# ─── reverse-engineering intelligence CLI ───────────────────────────────────


def cli(*args: str) -> subprocess.CompletedProcess[str]:
    return run(sys.executable, str(RE_CLI), *args)


def test_cli_search_returns_pinned_matches_and_claims_no_network() -> None:
    result = cli("search", "apk decompile", "--limit", "3")
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["network_used"] is False
    assert payload["matches"], payload
    assert len(payload["matches"]) <= 3
    assert payload["catalog_sha256"] == payload["catalog_sha256"].lower()
    assert all("guardrail_warnings" in match for match in payload["matches"])


def test_cli_refuses_a_catalog_whose_digest_does_not_match(tmp_path: Path) -> None:
    result = cli("search", "apk", "--expect-sha256", "0" * 64)
    assert result.returncode == 2, result.stdout
    assert "SHA-256 mismatch" in result.stderr, result.stderr

    tampered = tmp_path / "catalog.json"
    tampered.write_text(
        json.dumps([{"name": "evil/tool", "url": "https://example.invalid"}]),
        encoding="utf-8",
        newline="\n",
    )
    result = cli("search", "tool", "--catalog", str(tampered))
    assert result.returncode == 2, result.stdout
    assert "SHA-256 mismatch" in result.stderr, result.stderr


def test_cli_offers_no_way_to_skip_the_digest_check() -> None:
    """The pin is the whole guarantee; an escape hatch would remove it."""
    helptext = cli("search", "--help").stdout
    assert "--expect-sha256" in helptext
    for forbidden in ("--no-pin", "--no-verify", "--skip-digest", "--insecure"):
        assert forbidden not in helptext, helptext
    source = RE_CLI.read_text(encoding="utf-8")
    assert "expected_sha256=None" not in source, (
        "no command may pass None for the catalog digest"
    )


def test_cli_digest_reports_the_actual_value_and_whether_it_is_the_pin() -> None:
    result = cli("digest")
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["matches_pinned_digest"] is True
    assert payload["catalog_sha256"] == payload["pinned_digest"]
    assert payload["entries"] == len(json.loads(CATALOG.read_text(encoding="utf-8")))


def test_cli_routes_lists_every_task_that_route_accepts() -> None:
    listed = json.loads(cli("routes").stdout)["tasks"]
    assert listed, "a router with no tasks is not a router"
    for task in listed:
        result = cli("route", task)
        assert result.returncode == 0, result.stderr
        payload = json.loads(result.stdout)
        assert payload["task"] == task
        assert payload["primary_tools"], payload
        assert payload["limitations"], "a route must state what it cannot prove"

    unknown = cli("route", "no-such-task")
    assert unknown.returncode == 2
    assert "unknown task" in unknown.stderr


def test_cli_benchmark_ranks_runs_and_refuses_a_malformed_file(
    tmp_path: Path,
) -> None:
    def run_record(candidate: str, passed: int) -> dict:
        return {
            "role": "decompiler",
            "candidate_id": candidate,
            "tasks_total": 10,
            "tasks_passed": passed,
            "evidence_completeness": 1.0,
            "coverage_calibration": 1.0,
            "unsupported_claims": 0,
            "unauthorized_effects": 0,
            "p95_latency_ms": 100,
            "cost_usd": 1.0,
        }

    runs = [run_record("alpha", 9), run_record("beta", 4)]
    path = tmp_path / "runs.json"
    path.write_text(json.dumps(runs), encoding="utf-8", newline="\n")
    result = cli("benchmark", "--role", "decompiler", "--runs", str(path))
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["winner"]["candidate_id"] == "alpha"
    assert [row["candidate_id"] for row in payload["rankings"]] == ["alpha", "beta"]

    not_a_list = tmp_path / "bad.json"
    not_a_list.write_text("{}", encoding="utf-8", newline="\n")
    bad = cli("benchmark", "--role", "decompiler", "--runs", str(not_a_list))
    assert bad.returncode == 2
    assert "JSON list" in bad.stderr

    missing = cli("benchmark", "--role", "decompiler", "--runs", str(tmp_path / "x"))
    assert missing.returncode == 2
    assert "not found" in missing.stderr
