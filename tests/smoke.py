#!/usr/bin/env python3
"""
tests/smoke.py — DAI Harness self-test suite (no external services, no model calls).

Run:  python tests/smoke.py
Exit: 0 = all pass, 1 = failures (listed on stderr)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = [sys.executable]
FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(
        f"  [{'PASS' if ok else 'FAIL'}] {name}"
        + (f" — {detail}" if detail and not ok else "")
    )
    if not ok:
        FAILURES.append(f"{name}: {detail}")


def run(args: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, capture_output=True, text=True, cwd=ROOT, timeout=120, **kw
    )


def test_compile() -> None:
    r = run(PY + ["-m", "compileall", "-q", "scripts/lite", "mcp", "tests"])
    check("all python sources compile", r.returncode == 0, r.stderr[:300])


def test_verify_gate_selftest() -> None:
    r = run(PY + ["scripts/lite/verify_gate.py", "--selftest"])
    check(
        "verify_gate selftest", r.returncode == 0, (r.stdout or "") + (r.stderr or "")
    )


def test_memory() -> None:
    """The harness reaches memory through one module, and it says what it cannot do.

    The SQLite module this used to exercise was retired on 2026-09-21. What is
    checked now is the seam every memory call in the harness goes through: it
    resolves the installed engine, and when nothing is installed it says so
    with the command to fix it rather than answering as if memory were empty.
    """
    sys.path.insert(0, str(ROOT / "scripts" / "lite"))
    import importlib

    dai_memory = importlib.import_module("dai_memory")

    check(
        "memory categories map onto the layer's layers",
        dai_memory.layer_for("decisions") == "semantic"
        and dai_memory.layer_for("errors") == "episodic"
        and dai_memory.layer_for("procedure") == "procedural"
        and dai_memory.layer_for("something else") == "semantic",
    )
    check(
        "an empty write is refused rather than recorded",
        "error"
        in dai_memory.write(
            "   ", cwd=ROOT, category=None, importance=5, source_ref="smoke"
        ),
    )
    check(
        "an empty search is refused rather than answered",
        "error" in dai_memory.search("  ", cwd=ROOT, limit=3),
    )

    installed = dai_memory.installed()
    if not installed:
        # Not a failure: a checkout without the engine is a normal state. It has
        # to be visible, though -- an absent engine that reads as "no memories"
        # is the failure mode this whole layer exists to prevent.
        check(
            "an uninstalled engine is an error, not an empty answer",
            "error" in dai_memory.run("doctor", cwd=ROOT)
            and dai_memory.INSTALL_HINT in dai_memory.run("doctor", cwd=ROOT)["error"],
        )
        return

    with tempfile.TemporaryDirectory() as tmp:
        project = Path(tmp)
        subprocess.run(
            ["git", "-C", str(project), "init", "-q"], check=True, capture_output=True
        )
        (project / "notes.md").write_text(
            "# Notes\n\nNothing much.\n", encoding="utf-8"
        )
        env = dict(
            os.environ,
            MEMORY_LAYER_HOME=str(project / "home"),
            MEMORY_LAYER_EMBEDDINGS="hash",
            MEMORY_LAYER_TEST="1",
            MEMORY_LAYER_LOG_LEVEL="error",
        )
        started = subprocess.run(
            ["node", str(dai_memory.memory_cli()), "init", "--quiet"],
            cwd=str(project),
            env=env,
            capture_output=True,
            text=True,
            timeout=600,
        )
        check(
            "memory store can be created",
            started.returncode == 0,
            started.stderr[-300:],
        )


def test_escalate_dry_run() -> None:
    r = run(PY + ["scripts/lite/escalate.py", "--dry-run", "smoke test task"])
    check(
        "escalate dry-run",
        r.returncode == 0 and "[DRY RUN]" in r.stdout,
        r.stderr[:200],
    )


def test_mcp_server() -> None:
    session = (
        "\n".join(
            [
                json.dumps(
                    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
                ),
                json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
            ]
        )
        + "\n"
    )
    r = run(PY + ["mcp/server.py"], input=session)
    lines = [json.loads(line) for line in r.stdout.splitlines() if line.strip()]
    ok = (
        len(lines) == 2
        and lines[0]["result"]["serverInfo"]["name"] == "dai-harness"
        and len(lines[1]["result"]["tools"]) == 8
    )
    check("mcp initialize + tools/list (8 tools)", ok, r.stdout[:200] + r.stderr[:200])


def test_mcp_gate_discipline() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        session = (
            "\n".join(
                [
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "tools/call",
                            "params": {
                                "name": "dh_start_pipeline",
                                "arguments": {"goal": "g"},
                            },
                        }
                    ),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 2,
                            "method": "tools/call",
                            "params": {"name": "dh_advance_phase", "arguments": {}},
                        }
                    ),
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": 3,
                            "method": "tools/call",
                            "params": {"name": "dh_advance_phase", "arguments": {}},
                        }
                    ),
                ]
            )
            + "\n"
        )
        import os

        # The server reconfigures its stdout to UTF-8, so decode as UTF-8 here
        # too: `text=True` alone decodes with the locale codepage, which on
        # Windows is cp1252 and mangles any non-ASCII the server reports.
        env = dict(
            os.environ,
            DAIHARNESS_ROOT=tmp,
            PYTHONUTF8="1",
            PYTHONIOENCODING="utf-8",
        )
        r = subprocess.run(
            PY + [str(ROOT / "mcp" / "server.py")],
            input=session,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env=env,
            cwd=ROOT,
        )
        # Report a short or malformed reply as itself rather than letting it
        # surface as an opaque payload comparison three lines later. The
        # behavioural assertions below are unchanged.
        raw = f"exit={r.returncode} stdout={r.stdout!r} stderr={r.stderr[-400:]!r}"
        try:
            lines = [json.loads(line) for line in r.stdout.splitlines() if line.strip()]
        except json.JSONDecodeError as error:
            check(
                "mcp gate discipline blocks unapproved advance",
                False,
                f"{error}; {raw}",
            )
            return
        if len(lines) != 3:
            check(
                "mcp gate discipline blocks unapproved advance",
                False,
                f"expected 3 responses, got {len(lines)}; {raw}",
            )
            return
        missing = [m for m in lines if "result" not in m]
        if missing:
            check(
                "mcp gate discipline blocks unapproved advance",
                False,
                f"response without result: {missing}; {raw}",
            )
            return
        payloads = [json.loads(m["result"]["content"][0]["text"]) for m in lines]
        ok = (
            payloads[0].get("started") is True
            and payloads[1].get("advanced") is True
            and "gate" in payloads[2].get("error", "")
        )
        check("mcp gate discipline blocks unapproved advance", ok, f"{payloads}; {raw}")


def test_sync_kernel_budget() -> None:
    r = run(PY + ["scripts/lite/sync-kernel.py"])
    check(
        "kernel sync within 7k budget",
        r.returncode == 0 and "EXCEEDED" not in r.stdout,
        r.stdout[-200:],
    )


def test_policy_check() -> None:
    r = run(
        PY + ["scripts/lite/policy_check.py", "check", "run_command", "npm", "test"]
    )
    check("policy allows safe command", r.returncode == 0, r.stderr[:200])
    r = run(
        PY + ["scripts/lite/policy_check.py", "check", "run_command", "rm", "-rf", "/"]
    )
    check("policy denies rm -rf (strict)", r.returncode == 1, f"exit={r.returncode}")
    r = run(
        PY
        + [
            "scripts/lite/policy_check.py",
            "check",
            "run_command",
            "git",
            "push",
            "--force",
        ]
    )
    check("policy denies force push", r.returncode == 1, f"exit={r.returncode}")
    import os

    env = dict(os.environ, DAIHARNESS_POLICY_FILE="nonexistent-policy.yaml")
    r = subprocess.run(
        PY + ["scripts/lite/policy_check.py", "check", "x", "y"],
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=30,
        env=env,
    )
    check(
        "policy fails closed when file missing",
        r.returncode == 1,
        f"exit={r.returncode}",
    )
    r = run(PY + ["scripts/lite/policy_check.py", "get", "max_escalations"])
    check("policy get scalar", r.returncode == 0 and r.stdout.strip() == "3", r.stdout)


def test_runtime_lease() -> None:
    # A dead-PID lease must not count as leaked; a live non-keep lease must.
    lease_file = ROOT / ".daiharness" / "leases.json"
    backup = lease_file.read_text(encoding="utf-8") if lease_file.is_file() else None
    try:
        r = run(
            PY
            + [
                "scripts/lite/runtime_lease.py",
                "run",
                "--role",
                "smoketest",
                "--",
                sys.executable,
                "-c",
                "import time; time.sleep(30)",
            ]
        )
        check(
            "lease run registers", r.returncode == 0 and "OPENED" in r.stdout, r.stdout
        )
        r = run(
            PY
            + [
                "scripts/lite/runtime_lease.py",
                "run",
                "--role",
                "smoketest",
                "--",
                sys.executable,
                "-c",
                "import time; time.sleep(30)",
            ]
        )
        check("lease reuses live role", "REUSE" in r.stdout, r.stdout)
        r = run(PY + ["scripts/lite/runtime_lease.py", "status"])
        check(
            "lease status detects leak",
            r.returncode == 1 and "LEAKED" in r.stdout,
            r.stdout,
        )
        r = run(PY + ["scripts/lite/runtime_lease.py", "reap"])
        check("lease reap kills non-keep", r.returncode == 0, r.stdout)
        r = run(PY + ["scripts/lite/runtime_lease.py", "status"])
        check(
            "lease clean after reap",
            r.returncode == 0 and "CLEAN" in r.stdout,
            r.stdout,
        )
    finally:
        if backup is not None:
            lease_file.write_text(backup, encoding="utf-8")
        elif lease_file.is_file():
            lease_file.unlink()


def test_routing_targets_exist() -> None:
    """Every skills/... path referenced by kernel + pipeline must exist on disk."""
    import re

    referenced: set[str] = set()
    sources = [
        ROOT / "kernel" / "ENTRY.md",
        ROOT / "skills" / "pipeline" / "SKILL.md",
        ROOT / "skills" / "pipeline" / "LITE.md",
        *(ROOT / "skills" / "pipeline" / "phases").glob("*.md"),
    ]
    for src in sources:
        for m in re.finditer(
            r"`(skills/[A-Za-z0-9_/\-]+\.md)`", src.read_text(encoding="utf-8")
        ):
            referenced.add(m.group(1))
    missing = [p for p in sorted(referenced) if not (ROOT / p).is_file()]
    check(
        f"all {len(referenced)} routed skill paths exist",
        not missing,
        f"missing: {missing}",
    )


def test_skill_overlays_clean() -> None:
    """No file in the repo may reference upstream-origin paths or names."""
    # Assembled from fragments on purpose. A repo-wide rename pass once rewrote
    # this very list, so the guard started checking for the *new* name and
    # reported every file as dirty. Fragments survive that.
    _w = "".join(("wr", "ight"))
    bad_tokens = (
        "forge" + _w,
        "DAI" + _w,
        "FORGE" + _w.upper() + "_",
        "buiphuc" + "minhtam",
        "mem" + "0-cli",
        "mem" + "0-v2",
    )
    skip_parts = {
        ".git",
        ".memory",
        ".daiharness",
        # Hypothesis caches string constants harvested from the tree, so it
        # echoes back whatever the sources said. Gitignored tool cache, not repo
        # content.
        ".hypothesis",
        ".worktrees",
        "__pycache__",
        "node_modules",
    }
    # Deny binaries, do not allow-list source extensions. An allow-list once let
    # .hbs templates, .cs presets, .fish completions and .example configs keep
    # the upstream name for a whole release; "no reference anywhere" cannot be
    # enforced by a guard that only looks at the extensions we thought of.
    binary_suffixes = {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".ico",
        ".pdf",
        ".zip",
        ".gz",
        ".whl",
        ".so",
        ".dylib",
        ".exe",
        ".db",
        ".sqlite",
        ".xlsx",
        ".xls",
        ".woff",
        ".woff2",
        ".ttf",
    }
    stale = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.suffix.lower() in binary_suffixes:
            continue
        if any(part in skip_parts for part in p.parts) or p.name == "smoke.py":
            continue
        # The frozen reference graph is a verbatim record of what the retired
        # GitNexus index held on the day it was taken, old paths included. It is
        # a fixture the code-graph comparator reads, not prose anybody wrote:
        # scrubbing names out of it would falsify the record it exists to keep.
        if (
            p.relative_to(ROOT)
            .as_posix()
            .startswith("src/codegraph/reference/snapshot/")
        ):
            continue
        # vendor/dai-memory is a submodule: another repository, with its own
        # history, licence and guards. This scan is about what *this* tree
        # carries; the plugin's own words are the plugin's to keep.
        if p.relative_to(ROOT).as_posix().startswith("vendor/dai-memory/"):
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        lower = text.lower()
        for bad in bad_tokens:
            if bad.lower() in lower:
                stale.append(f"{p.relative_to(ROOT)}: {bad}")
    # Names count too. Scanning only contents let files whose *filename* carried
    # the token sit in the repo indefinitely — their bodies had been cleaned, so
    # a content scan reported the tree clean while `git ls-files` did not.
    for path in ROOT.rglob("*"):
        if any(part in skip_parts for part in path.parts):
            continue
        if path.relative_to(ROOT).as_posix().startswith("vendor/dai-memory/"):
            continue
        lower_name = path.name.lower()
        for bad in bad_tokens:
            if bad.lower() in lower_name:
                stale.append(f"{path.relative_to(ROOT)}: {bad} (in filename)")
    check("repo free of upstream-origin references", not stale, str(stale[:10]))


def test_claim_correlation() -> None:
    """A VERIFY block must quote its evidence, not paraphrase it.

    Evidence proves a command ran; this proves the *report* about it is faithful.
    Rewording the claim, citing another command, or pasting prose where the
    output digest belongs all have to fail.
    """
    r = run(PY + ["scripts/lite/rule_validator.py", "--selftest"])
    check(
        "rule_validator selftest",
        r.returncode == 0,
        ((r.stdout or "") + (r.stderr or ""))[-200:],
    )

    import importlib

    sys.path.insert(0, str(ROOT / "scripts" / "lite"))
    rv = importlib.import_module("rule_validator")
    ev = {
        "command": ["py", "-3", "tests/smoke.py"],
        "output_sha256": "b" * 64,
        "acceptance_criteria": [{"id": "suite-green", "claim": "the suite passes"}],
    }
    good = (
        f"ACCEPTANCE: suite-green\nCLAIM: the suite passes\n"
        f"COMMAND: py -3 tests/smoke.py\nOUTPUT: sha256:{'b' * 64}\n"
        f"EXIT CODE: 0\nVERDICT: PASS"
    )
    check(
        "faithful block accepted",
        not rv.validate(good, ev),
        str(rv.validate(good, ev))[:150],
    )
    check(
        "reworded claim rejected",
        bool(rv.validate(good.replace("the suite passes", "all good"), ev)),
    )
    check(
        "prose instead of digest rejected",
        bool(rv.validate(good.replace(f"sha256:{'b' * 64}", "everything passed"), ev)),
    )
    check("silence is not an error", not rv.validate("plain prose, no claim made", ev))

    # The gate must refuse a misreported turn even when no code changed.
    import os

    if True:
        payload = json.dumps(
            {"response_content": good.replace("the suite passes", "fabricated claim")}
        )
        # Run the gate in a throwaway directory: asserting on this repo's own
        # working tree makes the result depend on whatever else is uncommitted.
        with tempfile.TemporaryDirectory() as sandbox:
            env = dict(os.environ, DAIHARNESS_TURN="__no_such_turn__")
            r = subprocess.run(
                PY + [str(ROOT / "scripts" / "lite" / "verify_gate.py"), "--hook"],
                input=payload,
                capture_output=True,
                text=True,
                cwd=sandbox,
                timeout=60,
                env=env,
            )
            out = (r.stdout or "") + (r.stderr or "")
            check(
                "gate blocks a misreported turn",
                r.returncode != 0 and "MISREPORTED" in out,
                out[-200:],
            )


def test_evidence_schema_v2() -> None:
    """v2 records carry an integrity digest; a doctored output must not survive it."""
    import importlib

    sys.path.insert(0, str(ROOT / "scripts" / "lite"))
    vg = importlib.import_module("verify_gate")

    with tempfile.TemporaryDirectory() as tmp:
        r = run(
            PY
            + [
                "scripts/lite/run_check.py",
                "--turn",
                "smoke_v2",
                "--out",
                tmp,
                "--tier",
                "unit",
                "--change-kind",
                "fix",
                "--phase",
                "green",
                "--risk",
                "standard",
                "--implementer-id",
                "smoke@local",
                "--limitations",
                "",
                "--reviewer-status",
                "not_required",
                "--acceptance-id",
                "digest-covers-output",
                "--claim",
                "digest covers output",
                "--test-ref",
                "scripts/lite/verify_gate.py",
                "--negative-path",
                "tampered output rejected",
                "--",
                sys.executable,
                "scripts/lite/verify_gate.py",
                "--selftest",
            ]
        )
        check("run_check writes v2 evidence", r.returncode == 0, r.stderr[-200:])
        ev = json.loads((Path(tmp) / "smoke_v2.json").read_text(encoding="utf-8"))

    check(
        "v2 schema_version",
        ev.get("schema_version") == "2",
        str(ev.get("schema_version")),
    )
    # The schema in kernel/VERIFY.md is the oracle: a v2 record must carry every
    # field the completion contract names, not just a free-text acceptance line.
    required_v2 = (
        "acceptance_criteria",
        "command",
        "execution",
        "implementer_id",
        "limitations",
        "negative_path_bindings",
        "negative_paths",
        "output_sha256",
        "reviewer",
        "schema_version",
        "tier",
        "tree_sha",
    )
    absent = [field for field in required_v2 if field not in ev]
    check("v2 carries every contracted field", not absent, f"absent: {absent}")
    check(
        "v2 carries tier/acceptance_criteria/negative_paths",
        ev.get("tier") == "unit"
        and ev.get("acceptance_criteria")
        and ev["acceptance_criteria"][0]["id"] == "digest-covers-output"
        and ev.get("negative_paths") == ["tampered output rejected"],
        str(ev)[:150],
    )
    check(
        "v2 clean record validates",
        not vg._validate_output(ev),
        str(vg._validate_output(ev))[:150],
    )
    check(
        "v2 tampered output is FORGED",
        any(
            "output_sha256 mismatch" in e
            for e in vg._validate_output(dict(ev, output="all green\n"))
        ),
    )
    check(
        "v2 missing digest is FORGED",
        bool(
            vg._validate_output({k: v for k, v in ev.items() if k != "output_sha256"})
        ),
    )
    check("v2 bad tier is FORGED", bool(vg._validate_schema(dict(ev, tier="turbo"))))
    # v1 must be REJECTED. kernel/VERIFY.md: "Schema v2 is the only completion
    # format; Schema v1 is legacy and non-completion after v2 activation." While
    # this oracle asserted the opposite, a hand-typed eight-line v1 record with
    # `"tree_sha": "NONGIT:fake"` opened the gate on a real, sabotaged code change.
    v1 = {
        k: v
        for k, v in ev.items()
        if k not in ("output_sha256", "tier", "acceptance", "negative_paths")
    }
    v1["schema_version"] = "1"
    v1_errors = vg._validate_schema(v1)
    check(
        "v1 evidence is rejected",
        any("v1 is rejected" in e for e in v1_errors),
        str(v1_errors)[:200],
    )


def test_stub_check_precision() -> None:
    """Real stubs must be caught; documentation *about* stub markers must not be."""
    sys.path.insert(0, str(ROOT / "scripts" / "lite"))
    import importlib

    vg = importlib.import_module("verify_gate")
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        cases = {
            "real_comment.py": ("def f():\n    # TODO: implement\n    return 1\n", 1),
            "real_raise.py": ("def f():\n    raise NotImplementedError\n", 1),
            "doc_string.py": ('MSG = "we ban TODO and FIXME markers"\n', 0),
            "other.ts": ("// TODO: fix later\n", 1),
        }
        for name, (body, want) in cases.items():
            (d / name).write_text(body, encoding="utf-8")
            got = len(vg._check_stubs(d, [name]))
            check(f"stub check: {name} -> {want}", got == want, f"got {got}")
    # The gate's own tooling documents these markers and must stay clean.
    for f in (
        "docs/build_docs.py",
        "scripts/lite/verify_gate.py",
        "docs/evidence.html",
    ):
        check(f"no false stub positive in {f}", len(vg._check_stubs(ROOT, [f])) == 0)
    # ...but @generated must not become a blanket bypass for authored code.
    with tempfile.TemporaryDirectory() as t:
        d = Path(t)
        (d / "gen.py").write_text(
            "# @generated\ndef f():\n    # TODO: later\n", encoding="utf-8"
        )
        (d / "hand.py").write_text(
            "def f():\n    # TODO: later\n" + "x = 1\n" * 200 + "# @generated\n",
            encoding="utf-8",
        )
        check("@generated header skips scan", len(vg._check_stubs(d, ["gen.py"])) == 0)
        check(
            "@generated deep in file does NOT skip scan",
            len(vg._check_stubs(d, ["hand.py"])) == 1,
        )


def test_utf8_cli_output() -> None:
    """Every CLI must print non-ASCII without dying on a legacy Windows codepage."""
    r = run(PY + ["scripts/lite/rule_ledger.py", "list"])
    check(
        "rule_ledger prints non-ASCII notes",
        r.returncode == 0,
        ((r.stdout or "") + (r.stderr or ""))[-200:],
    )


def test_docs_fresh() -> None:
    """Docs are generated from source — a stale committed page is a lie about the code."""
    r = run(PY + ["docs/build_docs.py", "--check"])
    check(
        "generated docs match current source",
        r.returncode == 0,
        ((r.stdout or "") + (r.stderr or ""))[-300:],
    )


def test_overlay_validator() -> None:
    r = run(PY + ["scripts/lite/validate_overlays.py"])
    check(
        "all overlays pass validator (no fake evidence/dead paths)",
        r.returncode == 0,
        ((r.stdout or "") + (r.stderr or ""))[-400:],
    )


def test_escalate_timeout_and_lease() -> None:
    """A hung provider must be killed, reported as 124, and leave no lease behind."""
    sys.path.insert(0, str(ROOT / "scripts" / "lite"))
    import importlib

    esc = importlib.import_module("escalate")
    lease_mod = importlib.import_module("runtime_lease")

    check(
        "timeout clamps below 1",
        esc.provider_timeout_seconds({"providerTimeoutSeconds": 0}) == 1,
    )
    check(
        "timeout clamps above 3600",
        esc.provider_timeout_seconds({"providerTimeoutSeconds": 99999}) == 3600,
    )
    check(
        "timeout falls back on garbage",
        esc.provider_timeout_seconds({"providerTimeoutSeconds": "abc"}) == 120,
    )

    lease_file = ROOT / ".daiharness" / "leases.json"
    backup = lease_file.read_text(encoding="utf-8") if lease_file.is_file() else None
    import os

    cwd = os.getcwd()
    try:
        os.chdir(ROOT)
        before = len(lease_mod.load_leases())
        result = esc.run_provider(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            "",
            False,
            dict(os.environ),
            timeout_seconds=2,
        )
        after = lease_mod.load_leases()
        check(
            "hung provider returns exit 124",
            result.returncode == 124,
            str(result.returncode),
        )
        check(
            "timed-out provider leaves no lease",
            len(after) == before,
            f"before={before} after={len(after)}",
        )
    finally:
        os.chdir(cwd)
        if backup is not None:
            lease_file.write_text(backup, encoding="utf-8")
        elif lease_file.is_file():
            lease_file.unlink()


def test_skill_test_contracts() -> None:
    r = run(
        PY
        + [
            "skills/_test/skill-test-executor.py",
            "--all",
            "--contract-only",
            "--no-color",
        ]
    )
    check(
        "skill test contracts valid",
        r.returncode == 0,
        ((r.stdout or "") + (r.stderr or ""))[-400:],
    )
    # The harness must never fabricate output: a silent adapter has to FAIL.
    r = run(
        PY
        + [
            "skills/_test/skill-test-executor.py",
            "code-reviewer",
            "test-basic-review",
            "--no-color",
            "--adapter-command",
            f'"{sys.executable}" -c "print(\'nothing\')"',
        ]
    )
    check(
        "silent adapter fails instead of faking a pass",
        r.returncode == 1 and "FAIL" in ((r.stdout or "") + (r.stderr or "")),
        ((r.stdout or "") + (r.stderr or ""))[-200:],
    )


def test_rule_ledger() -> None:
    ledger = ROOT / ".daiharness" / "rule-ledger.jsonl"
    backup = ledger.read_text(encoding="utf-8") if ledger.is_file() else None
    try:
        r = run(
            PY
            + [
                "scripts/lite/rule_ledger.py",
                "add",
                "hard-rule-1",
                "violation",
                "smoke",
            ]
        )
        check("rule ledger add", r.returncode == 0, r.stderr[:200])
        r = run(PY + ["scripts/lite/rule_ledger.py", "stats"])
        check(
            "rule ledger stats",
            r.returncode == 0 and "hard-rule-1" in r.stdout,
            r.stdout[:200],
        )
    finally:
        if backup is not None:
            ledger.write_text(backup, encoding="utf-8")
        elif ledger.is_file():
            ledger.unlink()


def main() -> None:
    print("DAI Harness smoke suite")
    for fn in (
        test_compile,
        test_verify_gate_selftest,
        test_memory,
        test_escalate_dry_run,
        test_mcp_server,
        test_mcp_gate_discipline,
        test_sync_kernel_budget,
        test_policy_check,
        test_runtime_lease,
        test_routing_targets_exist,
        test_skill_overlays_clean,
        test_overlay_validator,
        test_docs_fresh,
        test_evidence_schema_v2,
        test_claim_correlation,
        test_stub_check_precision,
        test_utf8_cli_output,
        test_escalate_timeout_and_lease,
        test_skill_test_contracts,
        test_rule_ledger,
    ):
        try:
            fn()
        except Exception as e:
            import traceback

            # Show where it broke: "crashed: <message>" alone sends you hunting.
            check(
                fn.__name__,
                False,
                f"crashed: {e}\n{traceback.format_exc()[-600:]}",
            )
    if FAILURES:
        print(f"\n{len(FAILURES)} failure(s):", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)
    print("\nAll smoke tests passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
