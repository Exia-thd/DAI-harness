#!/usr/bin/env python3
"""
scripts/ci/pytest_gate.py
Run a pytest target and gate on *new* failures only.

The unit-test tree carries a set of tests that were already red when the suite
was imported. Gating on a raw non-zero pytest exit means the gate can never go
green, which trains everyone to bypass it. Instead we record the known-red node
IDs in a baseline file and fail the gate when the observed failure set is not a
subset of it — i.e. when this change broke something new.

Usage:
    python scripts/ci/pytest_gate.py tests/unit_tests/ --baseline tests/known_failures.txt
    python scripts/ci/pytest_gate.py tests/unit_tests/ --baseline ... --write-baseline
    python scripts/ci/pytest_gate.py --selftest
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# pytest's `-rA` short summary emits one line per non-passing outcome:
#   FAILED tests/unit_tests/test_x.py::test_y - AssertionError: ...
#   ERROR tests/unit_tests/test_x.py::test_y
_OUTCOME = re.compile(r"^(FAILED|ERROR)\s+(\S+?)(?:\s+-\s.*)?$")

# pytest exit codes that mean "the run itself is unusable", never "known red".
# 0=ok 1=tests failed 2=interrupted 3=internal 4=usage 5=no tests collected
FATAL_EXIT_CODES = {2, 3, 4, 5}


def parse_outcomes(output: str) -> set[str]:
    """Node IDs pytest reported as FAILED or ERROR."""
    found: set[str] = set()
    for line in output.splitlines():
        match = _OUTCOME.match(line.strip())
        if match:
            found.add(match.group(2).replace("\\", "/"))
    return found


def load_baseline(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    entries: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            entries.add(line.replace("\\", "/"))
    return entries


def write_baseline(path: Path, node_ids: set[str], target: str) -> None:
    header = (
        "# Known-red tests, recorded so the gate reports regressions instead of\n"
        "# inherited failures. Each entry was already red when it was recorded,\n"
        f"# so the gate fails only on something new. Target: {target}\n"
        "# Regenerate: python scripts/ci/pytest_gate.py <target> --baseline "
        "<this file> --write-baseline\n"
    )
    path.write_text(header + "\n".join(sorted(node_ids)) + "\n", encoding="utf-8")


def report(observed: set[str], baseline: set[str]) -> tuple[bool, list[str]]:
    """Returns (ok, message lines)."""
    new_failures = sorted(observed - baseline)
    now_passing = sorted(baseline - observed)
    lines: list[str] = []
    if now_passing:
        lines.append(
            f"[pytest-gate] {len(now_passing)} baselined test(s) now pass — "
            "drop them from the baseline with --write-baseline:"
        )
        lines += [f"    + {n}" for n in now_passing]
    if new_failures:
        lines.append(f"[pytest-gate] {len(new_failures)} NEW failure(s):")
        lines += [f"    - {n}" for n in new_failures]
        return False, lines
    lines.append(
        f"[pytest-gate] no new failures ({len(observed)} known-red, "
        f"{len(baseline)} baselined)."
    )
    return True, lines


def _utf8_io() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def _selftest() -> int:
    cases = 0

    parsed = parse_outcomes(
        "FAILED tests/unit_tests/test_a.py::test_x - AssertionError: nope\n"
        "ERROR tests\\unit_tests\\test_b.py::test_y\n"
        "PASSED tests/unit_tests/test_c.py::test_z\n"
        "5 failed, 1 passed in 3.2s\n"
    )
    assert parsed == {
        "tests/unit_tests/test_a.py::test_x",
        "tests/unit_tests/test_b.py::test_y",
    }, parsed
    cases += 1

    # A failure line whose message itself contains " - " must not truncate the id.
    parsed = parse_outcomes("FAILED tests/t.py::test_q - ValueError: a - b - c")
    assert parsed == {"tests/t.py::test_q"}, parsed
    cases += 1

    ok, lines = report({"a", "b"}, {"a", "b"})
    assert ok and "no new failures" in lines[-1], lines
    cases += 1

    ok, lines = report({"a", "c"}, {"a", "b"})
    assert not ok, lines
    assert any(line.endswith("- c") for line in lines), lines
    assert any(line.endswith("+ b") for line in lines), lines
    cases += 1

    ok, lines = report(set(), {"a"})
    assert ok, lines  # everything fixed is not a regression
    cases += 1

    print(f"[pytest-gate] selftest OK ({cases} cases)")
    return 0


def main() -> int:
    _utf8_io()
    parser = argparse.ArgumentParser(description="pytest regression gate")
    parser.add_argument("target", nargs="?", help="path passed to pytest")
    parser.add_argument("--baseline", type=Path)
    parser.add_argument(
        "--write-baseline",
        action="store_true",
        help="record the observed failures as the new baseline",
    )
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return _selftest()
    if not args.target or not args.baseline:
        parser.error("target and --baseline are required")

    argv = [sys.executable, "-m", "pytest", args.target, "-q", "--tb=no", "-rfE"]
    print("[pytest-gate] " + " ".join(argv), flush=True)
    # Pin the interpreter's text encoding. Windows otherwise decodes source and
    # fixture files with the legacy ANSI codepage, so the same suite passes from
    # a UTF-8 shell and dies with UnicodeDecodeError from a git hook — the
    # baseline would then record the shell it was measured in, not the code.
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    completed = subprocess.run(
        argv,
        text=True,
        capture_output=True,
        stdin=subprocess.DEVNULL,
        env=env,
        errors="replace",
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    print(output)

    if completed.returncode in FATAL_EXIT_CODES:
        print(
            f"[pytest-gate] pytest exited {completed.returncode} — "
            "the run itself failed, not a baselined test outcome.",
            file=sys.stderr,
        )
        return 1

    observed = parse_outcomes(output)
    if args.write_baseline:
        write_baseline(args.baseline, observed, args.target)
        print(f"[pytest-gate] baseline written: {args.baseline} ({len(observed)})")
        return 0

    ok, lines = report(observed, load_baseline(args.baseline))
    for line in lines:
        print(line, file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
