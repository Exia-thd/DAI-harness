#!/usr/bin/env python3
"""
scripts/lite/rule_ledger.py
Rule compliance ledger.

Records every rule violation the agent self-reports (or the user reports).
The ledger is append-only JSONL — the raw material for spotting which rules
get forgotten and hardening them.

Ledger: .daiharness/rule-ledger.jsonl

Usage:
    python scripts/lite/rule_ledger.py add <rule_id> <event> [note]
        event: violation | near-miss | corrected
    python scripts/lite/rule_ledger.py list [--limit N]
    python scripts/lite/rule_ledger.py stats
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LEDGER_RELATIVE = Path(".daiharness") / "rule-ledger.jsonl"
EVENTS = {"violation", "near-miss", "corrected"}


def ledger_path() -> Path:
    """Resolve the one ledger, the same way `rule-ledger.sh` resolves it.

    This path used to be relative to the process's working directory, so the
    same command read 43 entries from the repository root and 0 from
    `scripts/` — and `add` quietly created a second ledger there. An audit
    trail that forks per working directory is worse than no audit trail,
    because each fork looks complete. Both tools now consult the same three
    sources in the same order: an explicit file, a declared workspace, then
    the repository that contains this script.
    """
    override = os.environ.get("DAIHARNESS_RULE_LEDGER", "").strip()
    if override:
        return Path(override).expanduser()
    workspace = os.environ.get("DAIHARNESS_WORKSPACE", "").strip()
    if workspace:
        candidate = Path(workspace).expanduser()
        if candidate.is_dir():
            return candidate / LEDGER_RELATIVE
    return PROJECT_ROOT / LEDGER_RELATIVE


def read_entries() -> list[dict]:
    """Read the ledger, tolerating foreign or partial records.

    An append-only log accumulates lines from older tools and interrupted
    writes. A reader that dies on the first unfamiliar record makes the whole
    history unreadable, so unknown shapes are normalised instead — `ts`/`rule`/
    `outcome` are the field names used by earlier writers.
    """
    path = ledger_path()
    if not path.is_file():
        return []
    entries = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(raw, dict):
            continue
        entries.append(
            {
                "timestamp": raw.get("timestamp") or raw.get("ts") or "?",
                "rule_id": raw.get("rule_id") or raw.get("rule") or "?",
                "event": raw.get("event") or raw.get("outcome") or "?",
                "note": raw.get("note", ""),
            }
        )
    return entries


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    p = argparse.ArgumentParser(description="DAI Harness rule ledger")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("add")
    sp.add_argument("rule_id")
    sp.add_argument("event", choices=sorted(EVENTS))
    sp.add_argument("note", nargs="?", default="")
    sp = sub.add_parser("list")
    sp.add_argument("--limit", type=int, default=20)
    sub.add_parser("stats")
    args = p.parse_args()

    if args.cmd == "add":
        path = ledger_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "rule_id": args.rule_id,
            "event": args.event,
            "note": args.note[:300],
        }
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        print(f"+ ledger: {args.rule_id} {args.event}")
    elif args.cmd == "list":
        for e in read_entries()[-args.limit :]:
            print(
                f"  {e['timestamp']}  {e['rule_id']:<20} {e['event']:<10} {e.get('note', '')[:80]}"
            )
    elif args.cmd == "stats":
        entries = read_entries()
        by_rule = Counter(e["rule_id"] for e in entries)
        by_event = Counter(e["event"] for e in entries)
        print(
            json.dumps(
                {
                    "total": len(entries),
                    "by_rule": dict(by_rule.most_common()),
                    "by_event": dict(by_event),
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        # Rules violated 3+ times deserve hardening
        repeat = [r for r, c in by_rule.items() if c >= 3]
        if repeat:
            print(
                f"HARDEN CANDIDATES (>=3 entries): {', '.join(repeat)}", file=sys.stderr
            )


if __name__ == "__main__":
    main()
