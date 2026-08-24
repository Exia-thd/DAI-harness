#!/usr/bin/env python3
"""
scripts/lite/verify_gate.py
Turn-completion gate for DAI Nexus. Cross-platform (no bash needed).

Modes:
    python scripts/lite/verify_gate.py --selftest     # smoke-test the validators
    python scripts/lite/verify_gate.py --hook         # Claude Code Stop-hook mode (reads stdin JSON)
    python scripts/lite/verify_gate.py                # CLI mode (CI, manual)

Gate logic:
  1. Detect changed files via `git status --porcelain` (excluding .dainexus/).
  2. If no *code* files changed (docs/config only) -> gate OPEN.
  3. Otherwise require a fresh, machine-written evidence file under
     .dainexus/verify/ (written by run_check.py) that passes all checks:

  Evidence contract (schema_version "1" or "2"):
    v1: schema_version, turn, command, exit_code, output, timestamp_utc,
        workspace, tree_sha
    v2: the above plus output_sha256 (integrity digest of `output`),
        tier (see evidence_common.EVIDENCE_TIERS), acceptance, negative_paths

  Rejection reasons:
    MISSING   - no evidence file found
    STALE     - timestamp too old
    MISMATCH  - workspace or tree_sha mismatch
    FAILED    - exit_code != 0
    FORGED    - schema wrong, command empty, output generic/templated
    SECRETS   - output contains unredacted secrets
    STUBS     - changed source files contain TODO/FIXME/NotImplementedError
    MISREPORTED - the response's VERIFY blocks do not match the evidence

Exit codes: 0 = gate OPEN. Block = 2 in --hook mode (Claude Code blocking
convention, stderr is fed back to the agent), 1 otherwise.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evidence_common import (  # noqa: E402
    FINAL_PHASES,
    changed_files,
    command_errors,
    execution_manifest,
    hard_signal,
    link_values,
    phase_errors,
    read_evidence_json,
    redact,
    resolve_evidence_link,
    schema_errors,
    worktree_fingerprint,
)

# ── configuration ─────────────────────────────────────────────────────────────
STALENESS_SECS = int(os.environ.get("DAINEXUS_STALENESS_SECS", "3600"))  # 1 hour

_FORGED_OUTPUT_PATTERNS = [
    re.compile(r"^\[REDACTED\]$", re.MULTILINE),
    re.compile(r"^<output>$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^placeholder$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^TODO$", re.MULTILINE),
    re.compile(r"^N/A$", re.MULTILINE),
]

_SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),
    re.compile(r"ghp_[a-zA-Z0-9]{20,}"),
    re.compile(r"AKIA[A-Z0-9]{16}"),
    re.compile(r"-----BEGIN(?:\s+[A-Z]+)?\s+PRIVATE KEY-----"),
]

_STUB_PATTERN = re.compile(r"\b(TODO|FIXME|NotImplementedError)\b")

_BINARY_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".whl",
    ".so",
    ".dylib",
    ".exe",
    ".db",
    ".sqlite",
}
_DOC_EXTS = {".md", ".txt", ".json", ".yaml", ".yml", ".ini", ".cfg", ".toml", ".lock"}
_SKIP_PREFIXES = ("scripts/lite/", ".dainexus/", ".claude/", ".git/")


# ── helpers ───────────────────────────────────────────────────────────────────


def _log(label: str, msg: str, *, err: bool = False) -> None:
    stream = sys.stderr if err else sys.stdout
    print(f"[VERIFY-GATE] {label}: {msg}", file=stream)


def _ok(msg: str) -> None:
    _log("OK", msg)


def _err(msg: str) -> None:
    _log("ERROR", msg, err=True)


def _workspace() -> Path:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return Path(r.stdout.strip()).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def _current_tree_sha(workspace: Path) -> str:
    """Delegate to the same fingerprint the evidence writer uses.

    run_check.py records tree_sha via evidence_common.worktree_fingerprint,
    which hashes content and yields TREE:<sha256>. This module computed its own
    DIRTY:<head>:<index> instead, so on any dirty worktree the reader and the
    writer produced incomparable strings and the tree check could never agree.
    kernel/VERIFY.md describes the content-based fingerprint, not the head/index
    pair, so the shared implementation is the correct one.
    """
    return worktree_fingerprint(workspace)


def _declared_files() -> list[str]:
    """Changed paths the caller declared, via the documented hook interface.

    verify-gate.sh exports FILES_TO_CHECK_STR (NUL-separated when
    FILES_TO_CHECK_NUL is set). Deriving the set from `git status` alone is not
    enough: in a non-git workspace, or when the turn's edits were already
    committed, git reports nothing and the gate opens on unverified work.
    """
    raw = os.environ.get("FILES_TO_CHECK_STR", "")
    if not raw:
        return []
    parts = (
        raw.split(chr(0)) if os.environ.get("FILES_TO_CHECK_NUL") else raw.splitlines()
    )
    out: list[str] = []
    for part in parts:
        path = part.strip().strip('"').replace("\\", "/")
        if not path or any(path.startswith(prefix) for prefix in _SKIP_PREFIXES):
            continue
        out.append(path)
    return out


def _changed_files(workspace: Path) -> list[str]:
    """Repo-relative changed paths from git status, excluding gate internals."""
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=10,
        ).stdout
    except Exception:
        return []
    files: list[str] = []
    for line in out.splitlines():
        path = line[3:].strip()
        if " -> " in path:  # rename: take the new side
            path = path.split(" -> ", 1)[1]
        path = path.strip('"').replace("\\", "/")
        if not path or any(path.startswith(p) for p in _SKIP_PREFIXES):
            continue
        files.append(path)
    return files


def _code_files(files: list[str]) -> list[str]:
    return [f for f in files if Path(f).suffix.lower() not in _DOC_EXTS | _BINARY_EXTS]


# ── evidence lookup & validation ──────────────────────────────────────────────


def _find_evidence(project_root: Path, turn_env: str) -> Path | None:
    verify_dir = project_root / ".dainexus" / "verify"
    if turn_env:
        p = verify_dir / f"{turn_env}.json"
        return p if p.is_file() else None
    if verify_dir.is_dir():
        files = sorted(
            verify_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True
        )
        return files[0] if files else None
    return None


# Replay bounds, matching the reference implementation.
MAX_REPLAY_TIMEOUT_SECS = 300.0
DEFAULT_REPLAY_TIMEOUT_SECS = 300.0
MAX_REPLAY_DETAIL_CHARS = 4096
_SECRET_ENV_NAME = re.compile(
    r"(?:^|_)(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET(?:[_-]?KEY)?|TOKEN|"
    r"PASSWORD|PASSWD|CREDENTIALS?|PRIVATE[_-]?KEY|AUTH(?:ORIZATION)?)(?:_|$)",
    re.IGNORECASE,
)

SUPPORTED_SCHEMAS = {"2"}


def _validate_schema(ev: dict) -> list[str]:
    """Delegate the schema contract to evidence_common.

    This module previously kept its own, weaker copy: it accepted schema v1 and
    never checked the tree_sha fingerprint format, so a hand-typed record with
    `"schema_version": "1"` and `"tree_sha": "NONGIT:fake"` opened the gate on a
    real code change. evidence_common.schema_errors is the same validator the
    reference implementation uses and is already vendored here byte-identically.
    """
    return schema_errors(ev)


# ── final-command replay (ported from the reference implementation) ─────────
# Every other check verifies the record's internal consistency. This one is the
# only check of the world: it re-runs the exact stored argv and requires the
# stored exit code. Without it a hand-written record that is merely
# self-consistent opens the gate on sabotaged code.


def _replay_timeout() -> float:
    raw = os.environ.get("DAINEXUS_REPLAY_TIMEOUT_SECS", "")
    try:
        value = float(raw) if raw.strip() else DEFAULT_REPLAY_TIMEOUT_SECS
    except ValueError:
        value = DEFAULT_REPLAY_TIMEOUT_SECS
    if value <= 0:
        return 0.001
    return min(value, MAX_REPLAY_TIMEOUT_SECS)


def _replay_env() -> dict[str, str]:
    """Keep normal process discovery/environment while dropping secret-like names."""
    return {
        name: value
        for name, value in os.environ.items()
        if not _SECRET_ENV_NAME.search(name)
    }


def _bounded_replay_detail(value: Any) -> str:
    if value is None:
        return ""
    text = redact(str(value))
    if len(text) > MAX_REPLAY_DETAIL_CHARS:
        return text[:MAX_REPLAY_DETAIL_CHARS] + "...[truncated]"
    return text


def _final_replay_records(
    evidence: dict[str, Any], project_root: Path, evidence_path: Path, hard: bool
) -> list[tuple[str, dict[str, Any]]]:
    """Return only final-tree records; historical red/mutation records are excluded."""
    if evidence.get("phase") not in FINAL_PHASES:
        return []
    if evidence.get("tree_sha") != _current_tree_sha(project_root):
        return []

    records: list[tuple[str, dict[str, Any]]] = [("final", evidence)]
    if not hard:
        return records

    links = link_values(evidence)
    for relation in ("contract", "runtime", "e2e"):
        raw_path = links.get(relation)
        if not raw_path:
            continue
        path, error = resolve_evidence_link(project_root, raw_path)
        if error or path is None or path.resolve() == evidence_path.resolve():
            continue
        try:
            linked = read_evidence_json(project_root, path)
        except ValueError:
            continue
        if (
            linked.get("phase") in FINAL_PHASES
            and linked.get("exit_code") == 0
            and linked.get("tree_sha") == evidence.get("tree_sha")
        ):
            records.append((relation, linked))
    return records


def _replay_final_commands(
    evidence: dict[str, Any],
    project_root: Path,
    evidence_path: Path,
    hard: bool,
) -> list[str]:
    """Replay each exact final-tree argv once and fail closed on any mismatch."""
    errors: list[str] = []
    records = _final_replay_records(evidence, project_root, evidence_path, hard)
    commands: dict[tuple[str, ...], list[tuple[str, dict[str, Any]]]] = {}
    for label, record in records:
        command = record.get("command")
        command_diagnostics = command_errors(command)
        if command_diagnostics:
            errors.extend(
                f"REPLAY: {label} command refused by schema: {diagnostic}"
                for diagnostic in command_diagnostics
            )
            continue
        assert isinstance(command, list)
        commands.setdefault(tuple(command), []).append((label, record))

    mutated_worktree = False
    for command_tuple, command_records in commands.items():
        command = list(command_tuple)
        try:
            result = subprocess.run(
                command,
                cwd=str(project_root),
                env=_replay_env(),
                shell=False,
                capture_output=True,
                text=True,
                timeout=_replay_timeout(),
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            detail = _bounded_replay_detail(
                getattr(error, "stderr", None) or getattr(error, "output", None)
            )
            suffix = f" detail={detail!r}" if detail else ""
            errors.append(
                "REPLAY: final-tree command timed out before proving exit_code=0"
                f" after {_replay_timeout():g}s{suffix}"
            )
            continue
        except (OSError, UnicodeError) as error:
            detail = _bounded_replay_detail(error)
            errors.append(
                "REPLAY: final-tree command could not be started safely"
                + (f": {detail}" if detail else "")
            )
            continue

        detail = _bounded_replay_detail((result.stdout or "") + (result.stderr or ""))
        for label, record in command_records:
            expected = record.get("exit_code")
            if result.returncode != expected:
                errors.append(
                    f"REPLAY: {label} command returncode {result.returncode} does not "
                    f"match stored exit_code {expected}"
                    + (f" detail={detail!r}" if detail else "")
                )
            elif result.returncode != 0:
                errors.append(
                    f"REPLAY: {label} final-tree command returned nonzero exit_code "
                    f"{result.returncode}; final evidence must replay with 0"
                    + (f" detail={detail!r}" if detail else "")
                )

        replay_tree = _current_tree_sha(project_root)
        if replay_tree != evidence.get("tree_sha") and not mutated_worktree:
            errors.append(
                "REPLAY: mutated final worktree outside excluded evidence directory; "
                "replay changed tracked, untracked, ignored, or submodule content. "
                f"Evidence: {evidence.get('tree_sha')!r}, Current: {replay_tree!r}"
            )
            mutated_worktree = True

    # Recompute after all final commands, including when commands are deduplicated.
    final_tree = _current_tree_sha(project_root)
    if final_tree != evidence.get("tree_sha") and not mutated_worktree:
        errors.append(
            "REPLAY: mutated final worktree outside excluded evidence directory; "
            "replay changed tracked, untracked, ignored, or submodule content. "
            f"Evidence: {evidence.get('tree_sha')!r}, Current: {final_tree!r}"
        )
    return errors


def _validate_output(ev: dict) -> list[str]:
    errors: list[str] = []
    output = ev.get("output", "")
    if not isinstance(output, str) or not output.strip():
        errors.append("FORGED: 'output' is empty — evidence not machine-written")
        return errors
    for pat in _FORGED_OUTPUT_PATTERNS:
        if pat.search(output):
            errors.append(
                f"FORGED: output matches forged-shape pattern {pat.pattern!r}"
            )
    for pat in _SECRET_PATTERNS:
        if pat.search(output):
            errors.append(
                f"SECRETS: evidence output contains unredacted secret matching {pat.pattern!r}"
            )
    # v2 integrity: the writer stored a digest of the output it captured. If the
    # two disagree, the record was edited after the command ran.
    digest = ev.get("output_sha256")
    if ev.get("schema_version") == "2":
        if not digest:
            errors.append("FORGED: v2 evidence is missing 'output_sha256'")
        else:
            actual = hashlib.sha256(output.encode("utf-8")).hexdigest()
            if actual != digest:
                errors.append(
                    f"FORGED: output_sha256 mismatch — stored {digest[:12]}…, "
                    f"actual {actual[:12]}…; the output field was modified after capture"
                )
    return errors


def _validate_staleness(ev: dict) -> list[str]:
    ts_str = ev.get("timestamp_utc", "")
    if not ts_str:
        return ["STALE: timestamp_utc missing"]
    try:
        ev_time = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        age_secs = (datetime.now(timezone.utc) - ev_time).total_seconds()
        if age_secs < 0:
            return [
                f"FORGED: evidence timestamp is in the future ({age_secs:.0f}s ahead)"
            ]
        if age_secs > STALENESS_SECS:
            return [
                f"STALE: evidence is {age_secs:.0f}s old (limit: {STALENESS_SECS}s)"
            ]
    except ValueError as e:
        return [f"STALE: cannot parse timestamp_utc {ts_str!r}: {e}"]
    return []


def _validate_workspace(ev: dict, current_workspace: Path) -> list[str]:
    ev_ws = ev.get("workspace", "")
    if not ev_ws:
        return ["MISMATCH: workspace field missing in evidence"]
    if Path(ev_ws).resolve() != current_workspace.resolve():
        return [f"MISMATCH: workspace {ev_ws!r} != current {str(current_workspace)!r}"]
    return []


def _validate_tree(ev: dict, current_tree: str) -> list[str]:
    ev_tree = ev.get("tree_sha", "")
    if not ev_tree:
        return ["MISMATCH: tree_sha missing in evidence"]
    if ev_tree == current_tree:
        return []
    # No prefix waives this comparison. NONGIT:<sha256> is an exact digest of a
    # non-git worktree, not an "unknown" marker, and treating the prefix as a
    # pass let `NONGIT:` + 64 zeros open the gate on sabotaged code inside a real
    # git repository. The DIRTY:<head>:<index> form is no longer produced by
    # _current_tree_sha at all. The reference compares fingerprints by equality
    # and nothing else; so does this.
    return [
        f"MISMATCH: tree_sha changed since evidence was written. "
        f"Evidence: {ev_tree!r}, Current: {current_tree!r}"
    ]


def _validate_exit_code(ev: dict) -> list[str]:
    ec = ev.get("exit_code")
    if not isinstance(ec, int):
        return ["FAILED: exit_code is not an integer"]
    if ec != 0:
        return [f"FAILED: evidence exit_code={ec} (must be 0)"]
    return []


# ── stub check (never mutates source) ────────────────────────────────────────


def _python_stub_lines(source: str) -> list[tuple[int, str]]:
    """Stub markers in Python, ignoring string literals.

    A tool that *documents* stub markers (a linter, this gate, the docs
    generator) mentions TODO/FIXME inside strings. Flagging those is a false
    positive that trains people to bypass the gate. Real stubs live in comments
    (`# TODO: implement`) or in code (`raise NotImplementedError`), so only
    COMMENT and NAME tokens are inspected.
    """
    import io
    import tokenize

    hits: list[tuple[int, str]] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type == tokenize.COMMENT and _STUB_PATTERN.search(tok.string):
                hits.append((tok.start[0], tok.line.rstrip()))
            elif tok.type == tokenize.NAME and tok.string == "NotImplementedError":
                hits.append((tok.start[0], tok.line.rstrip()))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        # Unparseable file: fall back to the line scan rather than skipping it.
        return [
            (i, line.rstrip())
            for i, line in enumerate(source.splitlines(), 1)
            if _STUB_PATTERN.search(line)
        ]
    return hits


# Bundlers inline the source of tools that *document* stub markers, so a
# generated bundle reports stubs its authored input never had. Path is the only
# reliable signal — esbuild output carries no `@generated` banner.
_BUILD_DIRS = {"dist", "build", "out", "node_modules", ".next", "coverage"}


def _is_build_output(rel_path: str) -> bool:
    parts = PurePosixPath(rel_path.replace("\\", "/")).parts
    return any(part.lower() in _BUILD_DIRS for part in parts[:-1])


def _check_stubs(workspace: Path, files: list[str]) -> list[str]:
    errors: list[str] = []
    for f in files:
        fp = workspace / f
        if fp.suffix.lower() in _DOC_EXTS | _BINARY_EXTS:
            continue
        if _is_build_output(f):
            continue
        if not fp.is_file():
            continue
        try:
            source = fp.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        # Build outputs are not authored code. Scanning them for stubs flags any
        # generator that *documents* the markers. The file still counts as a
        # change, so evidence is still required — only this scan is skipped.
        if "@generated" in source[:400]:
            continue
        if fp.suffix.lower() == ".py":
            hits = _python_stub_lines(source)
        else:
            hits = [
                (i, line.rstrip())
                for i, line in enumerate(source.splitlines(), 1)
                if _STUB_PATTERN.search(line)
            ]
        errors.extend(f"  {f}:{idx}: {line}" for idx, line in hits)
    return errors


# ── selftest ──────────────────────────────────────────────────────────────────


def completion_checks(
    evidence: dict,
    project_root: Path,
    evidence_path: Path,
    files_to_check: list[str] | None = None,
) -> tuple[bool, tuple[tuple[str, list[str]], ...]]:
    """The one completion decision shared by this gate and rule-validator.py.

    rule-validator.py imports this symbol; without it the strict response
    correlation step died at module load and every turn carrying a VERIFY block
    was rejected for a reason unrelated to its evidence.

    Final-command replay is now included: it re-runs the exact stored argv and
    requires the stored exit code, which is the only check here that examines
    the world rather than the record's internal consistency.

    The remaining HARD family the reference also aggregates — signed review-2
    and RED->GREEN chain validation with controlled mutation backcheck — is not
    implemented in this tree. It is reported as an explicit UNVERIFIED check
    rather than silently omitted, so a hard-risk turn cannot read as complete.
    """
    current_tree = _current_tree_sha(project_root)
    files_for_signal = files_to_check or changed_files(project_root)
    hard = evidence.get("risk") == "hard" or hard_signal(project_root, files_for_signal)
    checks: list[tuple[str, list[str]]] = [
        ("schema", _validate_schema(evidence)),
        ("output", _validate_output(evidence)),
        ("staleness", _validate_staleness(evidence)),
        ("workspace", _validate_workspace(evidence, project_root)),
        ("tree", _validate_tree(evidence, current_tree)),
        ("phase", phase_errors(evidence, final=True)),
        ("exit_code", _validate_exit_code(evidence)),
        (
            "replay",
            _replay_final_commands(evidence, project_root, evidence_path, hard),
        ),
    ]
    if hard:
        checks.append(
            (
                "hard",
                [
                    "UNVERIFIED: HARD completion (signed review-2, RED->GREEN "
                    "chain, mutation backcheck) is not implemented in this "
                    "tree; see tests/lite_known_failures.txt"
                ],
            )
        )
    return hard, tuple(checks)


def _selftest() -> int:
    import shutil
    import tempfile

    tmp = Path(tempfile.mkdtemp())
    try:
        # schema_errors requires test_refs to name a real file inside the
        # workspace AND to appear in the exact command. Give the fixture one.
        check_dir = tmp / "tests"
        check_dir.mkdir(parents=True, exist_ok=True)
        (check_dir / "check_selftest.py").write_text(
            "def test_ok():" + chr(10) + "    assert True" + chr(10),
            encoding="utf-8",
        )
        selftest_ref = "tests/check_selftest.py::test_ok"

        ev = {
            "schema_version": "1",
            "turn": "selftest_001",
            "command": ["echo", "selftest"],
            "exit_code": 0,
            "output": "selftest\n",
            "output_truncated": False,
            "timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "workspace": str(tmp),
            "tree_sha": "NONGIT:selftest",
        }

        def validate(record: dict) -> list[str]:
            return (
                _validate_schema(record)
                + _validate_output(record)
                + _validate_staleness(record)
                + _validate_workspace(record, tmp)
                + _validate_exit_code(record)
            )

        # A complete v2 record. evidence_common.schema_errors owns this contract
        # now, so the fixture must carry every field it requires — that is the
        # point of the selftest.
        digest = hashlib.sha256(ev["output"].encode("utf-8")).hexdigest()
        v2 = dict(
            ev,
            schema_version="2",
            tier="unit",
            command=["python", "-m", "pytest", selftest_ref],
            test_refs=[selftest_ref],
            acceptance_criteria=[
                {
                    "id": "selftest-accepts-v2",
                    "claim": "a well-formed v2 record is accepted",
                    "test_refs": [selftest_ref],
                }
            ],
            negative_paths=["a v1 record is rejected"],
            negative_path_bindings=[
                {
                    "id": "negative-path-1",
                    "claim": "a v1 record is rejected",
                    "acceptance_ids": ["selftest-accepts-v2"],
                    "test_refs": [selftest_ref],
                }
            ],
            limitations=[],
            change_kind="test",
            phase="green",
            reviewer={"status": "not_required"},
            implementer_id="selftest@local",
            tree_sha="NONGIT:" + digest,
            output_sha256=digest,
        )
        # The manifest is derived from the command, never hand-written — the
        # validator recomputes it and compares.
        manifest, _manifest_errors = execution_manifest(
            tmp, v2["command"], v2["test_refs"]
        )
        v2["execution"] = manifest

        cases = [
            ("v1 record rejected", _validate_schema(ev), False),
            ("v2 record accepted", validate(v2), True),
            (
                "empty output + nonzero exit rejected",
                _validate_output(dict(ev, output=""))
                + _validate_exit_code(dict(ev, exit_code=1)),
                False,
            ),
            (
                "v2 with edited output rejected",
                _validate_output(dict(v2, output="doctored\n")),
                False,
            ),
            (
                "v2 missing digest rejected",
                _validate_output({k: v for k, v in v2.items() if k != "output_sha256"}),
                False,
            ),
            ("v2 bad tier rejected", _validate_schema(dict(v2, tier="turbo")), False),
            (
                "unknown schema rejected",
                _validate_schema(dict(ev, schema_version="9")),
                False,
            ),
        ]
        for name, errors, want_clean in cases:
            if want_clean and errors:
                _err(f"selftest FAILED — {name}: {errors}")
                return 1
            if not want_clean and not errors:
                _err(f"selftest FAILED — {name}: expected rejection, got none")
                return 1
        # Stub scan: authored code is scanned, build output is not.
        (tmp / "src").mkdir(parents=True, exist_ok=True)
        (tmp / "src" / "dist").mkdir(parents=True, exist_ok=True)
        stub_line = "const q = 'TODO: implement';\n"
        (tmp / "src" / "authored.ts").write_text(stub_line, encoding="utf-8")
        (tmp / "src" / "dist" / "bundle.js").write_text(stub_line, encoding="utf-8")
        if not _check_stubs(tmp, ["src/authored.ts"]):
            _err("selftest FAILED — stub scan missed authored code")
            return 1
        if _check_stubs(tmp, ["src/dist/bundle.js"]):
            _err("selftest FAILED — stub scan flagged build output")
            return 1
        if _check_stubs(tmp, ["src\\dist\\bundle.js"]):
            _err("selftest FAILED — stub scan flagged build output (backslash path)")
            return 1
        _ok(f"selftest PASSED ({len(cases)} validator cases + 3 stub-scan cases)")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── main ──────────────────────────────────────────────────────────────────────


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def _correlate_claims(response_text: str) -> list[str]:
    """Check the response's VERIFY blocks against this turn's evidence.

    A command that ran is only half the proof; the other half is that the report
    about it is faithful. Returns [] when the response makes no claim.
    """
    if not response_text:
        return []
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import rule_validator  # noqa: PLC0415
    except ImportError:
        return []
    evidence, _note = rule_validator.load_evidence(
        os.environ.get("DAINEXUS_TURN") or None
    )
    return rule_validator.validate(response_text, evidence)


def main() -> None:
    _utf8_io()
    hook_mode = "--hook" in sys.argv
    block_code = 2 if hook_mode else 1

    if "--selftest" in sys.argv:
        sys.exit(_selftest())

    # Stop-hook payload (unused fields tolerated; stdin may be empty in CLI mode)
    response_text = ""
    if hook_mode and not sys.stdin.isatty():
        try:
            payload = json.load(sys.stdin)
            if isinstance(payload, dict):
                response_text = str(payload.get("response_content") or "")
        except (json.JSONDecodeError, OSError):
            pass

    workspace = _workspace()
    # Union, not either/or: honour what the caller declared and what the
    # worktree shows. Trusting only one of the two is how this gate opened on a
    # real change.
    changed = sorted(set(_changed_files(workspace)) | set(_declared_files()))
    code_changed = _code_files(changed)

    # Claim correlation runs first and unconditionally: a VERIFY block that
    # misquotes its evidence is a false report whether or not code changed.
    claim_errors = _correlate_claims(response_text)

    # Evidence present for this turn is validated whether or not code changed.
    # Skipping validation when no change was detected meant a record carrying a
    # leaked secret, a forged output shape, a nonzero exit code or a stale tree
    # passed unexamined the moment file detection came up empty — which it does
    # in a non-git workspace, or when the turn's edits were already committed.
    # Only the question "is evidence REQUIRED here" depends on code changing.
    turn_evidence = _find_evidence(workspace, os.environ.get("DAINEXUS_TURN", ""))
    if not code_changed and not claim_errors and turn_evidence is None:
        _ok(
            f"No code changes detected ({len(changed)} doc/config file(s) changed) — gate OPEN"
        )
        sys.exit(0)

    if code_changed:
        print(
            f"[VERIFY-GATE] {len(code_changed)} changed code file(s): "
            f"{', '.join(code_changed[:10])}"
        )
    all_errors: list[str] = []
    if claim_errors:
        _err("Response claims do not match the evidence:")
        for e in claim_errors:
            print(f"   - {e}", file=sys.stderr)
        all_errors.append("MISREPORTED")
    if not code_changed and turn_evidence is None:
        # No evidence to examine; the claim mismatch alone decides the turn.
        _err("Gate BLOCKED. Reasons: MISREPORTED")
        sys.exit(block_code)

    # 1. Stub check
    print("[VERIFY-GATE] 1. Checking for stubs (TODO, FIXME, NotImplementedError)...")
    stub_errs = _check_stubs(workspace, code_changed) if code_changed else []
    if stub_errs:
        _err("Code contains stubs:")
        for e in stub_errs:
            print(e, file=sys.stderr)
        all_errors.append("STUBS")
    else:
        _ok("No stubs found")

    # 2. Machine-written evidence validation
    print("[VERIFY-GATE] 2. Validating machine-written evidence...")
    turn_env = os.environ.get("DAINEXUS_TURN", "")
    ev_path = _find_evidence(workspace, turn_env)
    if ev_path is None and not code_changed:
        _ok("No code changes detected and no evidence to validate — gate OPEN")
        sys.exit(0)
    if ev_path is None:
        _err("MISSING: No evidence file under .dainexus/verify/")
        print(
            "   Code changes must be gated by a machine-written evidence file.",
            file=sys.stderr,
        )
        print(
            "   Run: python scripts/lite/run_check.py -- <your-check-cmd>",
            file=sys.stderr,
        )
        all_errors.append("MISSING")
    else:
        print(f"   - Evidence file: {ev_path}")
        try:
            ev = json.loads(ev_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            _err(f"FORGED: cannot parse evidence file: {e}")
            all_errors.append("FORGED")
            ev = {}

        if ev:
            # One decision path. This ran its own shorter list before, which
            # omitted the phase check and the HARD marker and, once replay
            # landed, would have omitted that too: the CLI gate and
            # rule-validator.py could reach opposite verdicts on one record.
            _hard, completion = completion_checks(ev, workspace, ev_path, code_changed)
            for label, errs in completion:
                if errs:
                    _err(f"Evidence {label} check failed:")
                    for e in errs:
                        print(f"   {e}", file=sys.stderr)
                    all_errors.extend(errs)

    # Final decision
    if all_errors:
        _err(
            f"Gate BLOCKED. Reasons: {', '.join(sorted(set(e.split(':')[0] for e in all_errors)))}"
        )
        sys.exit(block_code)
    _ok("All checks passed — gate OPEN")
    sys.exit(0)


if __name__ == "__main__":
    main()
