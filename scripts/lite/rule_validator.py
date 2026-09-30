#!/usr/bin/env python3
"""
scripts/lite/rule_validator.py
Correlate the VERIFY blocks in an agent's response against the turn's evidence.

The evidence gate proves a command ran. This proves the agent *reported it
honestly*: every claim in the response must map to an acceptance id recorded in
the evidence, repeat that acceptance's exact wording, cite the exact command,
and quote the output digest rather than a summary the agent typed.

Strict block shape — six fields, ACCEPTANCE first:

    ACCEPTANCE: lowercase-slug
    CLAIM: <exact text of the matching acceptance_criteria[].claim>
    COMMAND: <exact argv, space-joined>
    OUTPUT: sha256:<evidence output_sha256>
    EXIT CODE: 0
    VERDICT: PASS

Usage:
    python scripts/lite/rule_validator.py --response-file <file> [--turn ID]
    python scripts/lite/rule_validator.py --selftest

Exit: 0 = response is consistent with the evidence, 1 = mismatch (reasons on
stderr), 2 = usage error.

A response containing no VERIFY block at all is *not* an error here: not every
turn makes a verification claim. Emitting a partial block is the error, because
a half-formed block reads like proof while proving nothing.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_FIELDS = ("ACCEPTANCE", "CLAIM", "COMMAND", "OUTPUT", "EXIT CODE", "VERDICT")
FIELD_RE = re.compile(
    r"^\s*(ACCEPTANCE|CLAIM|COMMAND|OUTPUT|EXIT CODE|VERDICT):\s*(.*?)\s*$"
)
SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
VERIFY_DIR = Path(".daiharness") / "verify"


def _utf8_io() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def parse_blocks(response: str) -> tuple[list[dict[str, str]], list[str]]:
    """Split a response into strict blocks. ACCEPTANCE starts a block."""
    lines = response.splitlines()
    parsed = [(i, FIELD_RE.match(line)) for i, line in enumerate(lines)]
    starts = [i for i, m in parsed if m and m.group(1).upper() == "ACCEPTANCE"]
    if not starts:
        return [], []

    blocks: list[dict[str, str]] = []
    errors: list[str] = []
    for n, start in enumerate(starts, 1):
        end = starts[n] if n < len(starts) else len(lines)
        fields: dict[str, str] = {}
        for i in range(start, end):
            m = FIELD_RE.match(lines[i])
            if m:
                key = m.group(1).upper()
                if key in fields:
                    errors.append(f"VERIFY block {n}: duplicate field {key}")
                fields[key] = m.group(2)
        missing = [f for f in REQUIRED_FIELDS if f not in fields]
        if missing:
            errors.append(f"VERIFY block {n}: missing {', '.join(missing)}")
            continue
        if not fields["OUTPUT"].startswith("sha256:"):
            errors.append(
                f"VERIFY block {n}: OUTPUT must be the evidence digest "
                f"as sha256:<hex>, not pasted text"
            )
        blocks.append(fields)
    return blocks, errors


def load_evidence(turn: str | None) -> tuple[dict | None, str]:
    if not VERIFY_DIR.is_dir():
        return None, "no .daiharness/verify directory"
    if turn:
        path = VERIFY_DIR / f"{turn}.json"
        if not path.is_file():
            return None, f"no evidence for turn {turn!r}"
    else:
        files = sorted(
            VERIFY_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        if not files:
            return None, "no evidence files"
        path = files[0]
    try:
        return json.loads(path.read_text(encoding="utf-8")), str(path)
    except (json.JSONDecodeError, OSError) as e:
        return None, f"unreadable evidence {path}: {e}"


def validate(response: str, evidence: dict | None) -> list[str]:
    blocks, errors = parse_blocks(response)
    if not blocks and not errors:
        return []  # no claim made; nothing to correlate
    if errors:
        return errors
    if evidence is None:
        return [
            "a VERIFY block was emitted but this turn has no machine-written "
            "evidence to correlate it against"
        ]

    criteria = {
        c["id"]: c
        for c in evidence.get("acceptance_criteria", [])
        if isinstance(c, dict) and "id" in c
    }
    if not criteria:
        return [
            "evidence records no acceptance_criteria; rerun run_check.py with "
            "--acceptance-id/--claim so the claim can be correlated"
        ]

    exact_command = " ".join(evidence.get("command", []))
    exact_digest = f"sha256:{evidence.get('output_sha256', '')}"
    seen: set[str] = set()

    for n, block in enumerate(blocks, 1):
        slug = block["ACCEPTANCE"]
        if not SLUG_RE.fullmatch(slug):
            errors.append(
                f"VERIFY block {n}: ACCEPTANCE {slug!r} is not a lowercase slug"
            )
            continue
        if slug in seen:
            errors.append(f"VERIFY block {n}: acceptance {slug!r} claimed twice")
        seen.add(slug)
        if slug not in criteria:
            errors.append(
                f"VERIFY block {n}: acceptance {slug!r} is not in the evidence"
            )
            continue
        if block["CLAIM"] != criteria[slug]["claim"]:
            errors.append(
                f"VERIFY block {n}: CLAIM does not match the recorded claim "
                f"for {slug!r}"
            )
        if block["COMMAND"] != exact_command:
            errors.append(
                f"VERIFY block {n}: COMMAND does not match the evidence command"
            )
        if block["OUTPUT"] != exact_digest:
            errors.append(
                f"VERIFY block {n}: OUTPUT digest does not match the evidence"
            )

    unclaimed = set(criteria) - seen
    if unclaimed:
        errors.append(
            f"acceptance criteria recorded but never reported: "
            f"{', '.join(sorted(unclaimed))}"
        )
    return errors


def _selftest() -> int:
    ev = {
        "command": ["py", "-3", "tests/smoke.py"],
        "output_sha256": "a" * 64,
        "acceptance_criteria": [{"id": "smoke-green", "claim": "the suite passes"}],
    }
    good = (
        "ACCEPTANCE: smoke-green\nCLAIM: the suite passes\n"
        "COMMAND: py -3 tests/smoke.py\nOUTPUT: sha256:"
        + "a" * 64
        + "\nEXIT CODE: 0\nVERDICT: PASS"
    )
    cases = [
        ("well-formed block accepted", validate(good, ev), True),
        ("no block at all is fine", validate("just prose about the work", ev), True),
        (
            "partial block rejected",
            validate("ACCEPTANCE: smoke-green\nCLAIM: the suite passes", ev),
            False,
        ),
        (
            "reworded claim rejected",
            validate(good.replace("the suite passes", "everything works"), ev),
            False,
        ),
        (
            "wrong command rejected",
            validate(good.replace("py -3 tests/smoke.py", "py -3 other.py"), ev),
            False,
        ),
        (
            "pasted output instead of digest rejected",
            validate(good.replace("sha256:" + "a" * 64, "all tests passed"), ev),
            False,
        ),
        (
            "unknown acceptance rejected",
            validate(good.replace("smoke-green", "made-up-id"), ev),
            False,
        ),
        (
            "unreported criterion rejected",
            validate(
                good,
                dict(
                    ev,
                    acceptance_criteria=ev["acceptance_criteria"]
                    + [{"id": "other", "claim": "x"}],
                ),
            ),
            False,
        ),
        ("block without evidence rejected", validate(good, None), False),
    ]
    for name, errs, want_clean in cases:
        if want_clean and errs:
            print(f"[rule-validator] selftest FAILED — {name}: {errs}", file=sys.stderr)
            return 1
        if not want_clean and not errs:
            print(
                f"[rule-validator] selftest FAILED — {name}: expected rejection",
                file=sys.stderr,
            )
            return 1
    print(f"[rule-validator] selftest PASSED ({len(cases)} cases)")
    return 0


def main() -> None:
    _utf8_io()
    p = argparse.ArgumentParser(
        description="Correlate VERIFY blocks with turn evidence"
    )
    p.add_argument("--response-file")
    p.add_argument("--turn")
    p.add_argument("--selftest", action="store_true")
    args = p.parse_args()

    if args.selftest:
        sys.exit(_selftest())
    if not args.response_file:
        print(
            "usage: rule_validator.py --response-file <file> [--turn ID]",
            file=sys.stderr,
        )
        sys.exit(2)

    try:
        response = Path(args.response_file).read_text(
            encoding="utf-8", errors="replace"
        )
    except OSError as e:
        print(f"[rule-validator] cannot read response: {e}", file=sys.stderr)
        sys.exit(2)

    evidence, note = load_evidence(args.turn)
    errors = validate(response, evidence)
    if errors:
        print("[rule-validator] response does not match the evidence:", file=sys.stderr)
        for e in errors:
            print(f"   - {e}", file=sys.stderr)
        if evidence is None:
            print(f"   ({note})", file=sys.stderr)
        sys.exit(1)
    print("[rule-validator] OK — VERIFY blocks match the evidence")
    sys.exit(0)


if __name__ == "__main__":
    main()
