#!/usr/bin/env python3
"""
scripts/lite/validate_overlays.py
Skill overlay linter (pure Python, zero-dependency).

An overlay teaches the agent how to work in a domain. Anything that *looks like
finished evidence* inside an overlay is poison: the agent learns to emit a
passing VERIFY block instead of running the check. This linter fails such files.

Usage:
    python scripts/lite/validate_overlays.py [path ...]     # default: skills/*/LITE.md

Checks:
  1. frontmatter      — LITE.md must open with a `---` block carrying name + description
  2. static verdicts  — no bare `EXIT CODE: 0` / `VERDICT: PASS` lines (fake evidence)
  3. fake transcripts — no `[SUCCESS]`/`[VRT]`/`[PLAYWRIGHT]`-style invented tool output
  4. dead paths       — no references to directories that do not exist in this repo
                        (see DEAD_DIRS below)
  5. tables           — every markdown table has a header separator and consistent arity

Exit codes: 0 = all clean, 1 = violations found (printed to stderr).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
STATIC_VERDICT_RE = re.compile(r"^(?:EXIT CODE:\s*0|VERDICT:\s*PASS)\s*$", re.MULTILINE)
FAKE_TRANSCRIPT_RE = re.compile(
    r"\[(?:SUCCESS|INFO|PERF|VRT|ERROR|WARNING|OFFLOAD SUCCESS|OFFLOAD|MOTION|PLAYWRIGHT)\]"
)
# Directories this project retired. The third is assembled rather than
# written out, for the same reason the product-name guard assembles its
# tokens: a repo-wide rename must not be able to edit a guard into
# agreeing with whatever it was meant to catch.
DEAD_DIRS = ("agents", "agent", "forge" + r"\d*", "antigravity")
DEAD_PATH_RE = re.compile(r"\.(?:" + "|".join(DEAD_DIRS) + r")/\S*")


def strip_fences(text: str) -> str:
    """Remove fenced code blocks — sample commands inside them are legitimate."""
    return FENCE_RE.sub("", text)


def check_frontmatter(text: str) -> list[str]:
    if not text.startswith("---"):
        return ["missing YAML frontmatter (must start with ---)"]
    end = text.find("\n---", 3)
    if end == -1:
        return ["unterminated YAML frontmatter"]
    block = text[3:end]
    errors = []
    for key in ("name:", "description:"):
        if key not in block:
            errors.append(f"frontmatter missing `{key}`")
    return errors


INLINE_CODE_RE = re.compile(r"`[^`]*`")


def cell_count(row: str) -> int:
    """Count table cells, ignoring pipes inside inline code and escaped pipes."""
    row = INLINE_CODE_RE.sub("`code`", row)  # shell `a || b` must not add cells
    row = row.replace(r"\|", "")
    return row.count("|") - 1


def check_tables(text: str) -> list[str]:
    errors: list[str] = []
    lines = text.splitlines()
    table: list[tuple[int, str]] = []

    def flush(rows: list[tuple[int, str]]) -> None:
        if len(rows) < 2:
            return
        sep = rows[1][1]
        if not re.match(r"^\s*\|[\s:|-]+\|\s*$", sep):
            errors.append(f"line {rows[1][0]}: table header missing `|---|` separator")
            return
        width = cell_count(rows[0][1])
        for num, row in rows[2:]:
            if cell_count(row) != width:
                errors.append(
                    f"line {num}: table row has {cell_count(row)} cells, header has {width}"
                )

    in_fence = False
    for num, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if line.lstrip().startswith("|"):
            table.append((num, line))
        elif table:
            flush(table)
            table = []
    flush(table)
    return errors


def validate_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    prose = strip_fences(text)
    errors: list[str] = []

    errors += check_frontmatter(text)

    if STATIC_VERDICT_RE.search(prose):
        errors.append(
            "static verification verdict found — overlays must tell the agent to RUN "
            "the check, never embed a passing result"
        )
    fakes = set(FAKE_TRANSCRIPT_RE.findall(prose))
    if fakes:
        errors.append(
            f"fabricated tool-output transcript markers: {', '.join(sorted(fakes))}"
        )

    dead = sorted(set(DEAD_PATH_RE.findall(text)))
    real_dead = [p for p in dead if not (Path.cwd() / p.split()[0]).exists()]
    if real_dead:
        errors.append(f"references to non-existent paths: {', '.join(real_dead)}")

    errors += check_tables(text)
    return errors


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    args = sys.argv[1:]
    targets = (
        [Path(a) for a in args] if args else sorted(Path("skills").glob("*/LITE.md"))
    )
    if not targets:
        print("[overlays] no overlay files found", file=sys.stderr)
        sys.exit(1)

    failed = 0
    for path in targets:
        if not path.is_file():
            print(f"[overlays] FAIL {path}: not a file", file=sys.stderr)
            failed += 1
            continue
        errors = validate_file(path)
        if errors:
            failed += 1
            print(f"[overlays] FAIL {path}", file=sys.stderr)
            for e in errors:
                print(f"    - {e}", file=sys.stderr)

    total = len(targets)
    if failed:
        print(
            f"[overlays] {failed}/{total} overlay(s) failed validation", file=sys.stderr
        )
        sys.exit(1)
    print(f"[overlays] OK — {total} overlay(s) clean")
    sys.exit(0)


if __name__ == "__main__":
    main()
