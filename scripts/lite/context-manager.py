#!/usr/bin/env python3
"""Load a small, relevant, project-rooted context packet."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


EXECUTABLE_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ERROR: str | None = None
workspace_value = os.environ.get("DAIHARNESS_WORKSPACE")
if workspace_value:
    try:
        candidate_workspace = Path(workspace_value).expanduser().resolve(strict=True)
        if not candidate_workspace.is_dir() or not os.access(
            candidate_workspace, os.R_OK
        ):
            raise OSError("not a readable directory")
        PROJECT_ROOT = candidate_workspace
    except OSError as error:
        PROJECT_ROOT = EXECUTABLE_ROOT
        WORKSPACE_ERROR = f"DAIHARNESS_WORKSPACE is invalid: {error}"
else:
    PROJECT_ROOT = EXECUTABLE_ROOT
DEFAULT_CHAR_CAP = 2_000  # Approximation of the kernel's global 500-token cap.


def _memory_lines(raw: str) -> str:
    """A recall answer as lines a reader can scan: title, then snippet.

    scripts/lite/dai_memory.py answers in JSON; anything else is shown as-is.
    """
    try:
        results = json.loads(raw).get("results", [])
    except (ValueError, AttributeError):
        return raw.strip()
    lines = []
    for item in results:
        title = str(item.get("title", "")).strip()
        snippet = " ".join(str(item.get("snippet", "")).split())
        lines.append(f"- {title}: {snippet}" if snippet else f"- {title}")
    return "\n".join(lines) or "(no memories matched)"


def _bounded_chunk(label: str, content: str, source_cap: int, remaining: int) -> str:
    if remaining <= 0:
        return ""
    header = f"--- {label} ---\n"
    body_cap = max(0, min(source_cap, remaining - len(header)))
    if body_cap <= 0:
        return ""
    if len(content) > body_cap:
        suffix = "...[truncated]"
        content = content[: max(0, body_cap - len(suffix))] + suffix
    chunk = header + content + "\n"
    return chunk[:remaining]


def _read(path: Path, *, tail_lines: int | None = None) -> str:
    content = path.read_text(encoding="utf-8")
    if tail_lines is not None:
        content = "\n".join(content.splitlines()[-tail_lines:])
    return content


def load_context(
    keywords: str = "", char_cap: int = DEFAULT_CHAR_CAP
) -> tuple[str, int]:
    if char_cap <= 0:
        raise ValueError("context char cap must be positive")
    output: list[str] = []
    used = 0
    loaded_sources = 0
    files = (
        (PROJECT_ROOT / ".daiharness/memory-bank/activeContext.md", 150 * 4, None),
        (PROJECT_ROOT / ".daiharness/memory-bank/HANDOVER.md", 150 * 4, None),
        (
            PROJECT_ROOT / ".daiharness/subagent-context/CONVERSATION_SUMMARY.md",
            100 * 4,
            10,
        ),
    )

    for path, source_cap, tail_lines in files:
        if not path.is_file() or not os.access(path, os.R_OK):
            continue
        chunk = _bounded_chunk(
            path.name, _read(path, tail_lines=tail_lines), source_cap, char_cap - used
        )
        if chunk:
            output.append(chunk)
            used += len(chunk)
            loaded_sources += 1

    mem0_path = EXECUTABLE_ROOT / "scripts/lite/dai_memory.py"
    if (
        keywords.strip()
        and os.environ.get("DAIHARNESS_SKIP_MEM0") != "1"
        and mem0_path.is_file()
        and used < char_cap
    ):
        result = subprocess.run(
            [
                sys.executable,
                str(mem0_path),
                "search",
                keywords.strip(),
                "--limit",
                "3",
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            chunk = _bounded_chunk(
                "memory", _memory_lines(result.stdout), 100 * 4, char_cap - used
            )
            if chunk:
                output.append(chunk)
                used += len(chunk)
                loaded_sources += 1

    return "".join(output)[:char_cap], loaded_sources


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("load",))
    parser.add_argument(
        "--keywords", default=os.environ.get("DAIHARNESS_CONTEXT_KEYWORDS", "")
    )
    parser.add_argument(
        "--char-cap",
        type=int,
        default=int(
            os.environ.get("DAIHARNESS_CONTEXT_CHAR_CAP", str(DEFAULT_CHAR_CAP))
        ),
    )
    args = parser.parse_args()
    if WORKSPACE_ERROR:
        print(WORKSPACE_ERROR, file=sys.stderr)
        return 1
    try:
        context, loaded = load_context(args.keywords, args.char_cap)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Context load failed: {error}", file=sys.stderr)
        return 1
    sys.stdout.write(context)
    print(f"✓ Memory loaded: {loaded} sources injected", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
