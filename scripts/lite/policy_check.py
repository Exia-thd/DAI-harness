#!/usr/bin/env python3
"""
scripts/lite/policy_check.py
Execution policy gate (pure Python, zero-dependency).

Reads .daiharness/execution-policy.yaml and checks tool arguments against
deny_patterns. Called by guard middleware before a tool call executes.
See kernel/POLICY.md.

Usage:
    python scripts/lite/policy_check.py check <tool_name> [tool_args...]
    python scripts/lite/policy_check.py get <key>
    python scripts/lite/policy_check.py show

Keys for `get`: mode | require_verify | max_escalations | refresh_interval_ticks

Exit codes:
    0 - ALLOW (also: audit-mode match)
    1 - DENY  (pattern matched, mode=strict or unknown mode; also fail-closed
               when the policy file is missing/unreadable/malformed)
    2 - WARN  (pattern matched, mode=permissive)
    3 - usage error
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get("DAIHARNESS_WORKSPACE", ".")).resolve()
POLICY_FILE = Path(
    os.environ.get(
        "DAIHARNESS_POLICY_FILE", PROJECT_ROOT / ".daiharness" / "execution-policy.yaml"
    )
)
LOG_FILE = PROJECT_ROOT / ".daiharness" / "policy-log.jsonl"

VALID_MODES = {"strict", "permissive", "audit"}
SCALAR_KEYS = {"mode", "require_verify", "max_escalations", "refresh_interval_ticks"}


def _log_event(decision: str, tool: str, args: str, pattern: str = "") -> None:
    """Best-effort telemetry — must never fail the gate."""
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(
                json.dumps(
                    {
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "decision": decision,
                        "tool": tool,
                        "args": args[:300],
                        "pattern": pattern,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    except OSError:
        pass


def load_policy() -> dict | None:
    """Parse the constrained YAML subset. None = unreadable (fail closed)."""
    try:
        text = POLICY_FILE.read_text(encoding="utf-8")
    except OSError:
        return None
    if not text.strip():
        return None

    policy: dict = {"deny_patterns": []}
    for line in text.splitlines():
        stripped = line.split("#", 1)[0].rstrip()
        if not stripped.strip():
            continue
        m = re.match(r'^\s*-\s+"?([^"]+)"?\s*$', stripped)
        if m:
            policy["deny_patterns"].append(m.group(1).strip())
            continue
        m = re.match(r"^([A-Za-z_]+):\s*(\S+)\s*$", stripped)
        if m and m.group(1) in SCALAR_KEYS | {"deny_patterns"}:
            if m.group(1) != "deny_patterns":
                policy[m.group(1)] = m.group(2).strip('"')
    if "mode" not in policy:
        return None
    return policy


def cmd_check(tool: str, args: list[str]) -> int:
    policy = load_policy()
    if policy is None:
        print(
            f"[POLICY] ERROR: policy file missing/empty/malformed at {POLICY_FILE} — "
            f"DENY (fail-closed).",
            file=sys.stderr,
        )
        _log_event("deny-failclosed", tool, " ".join(args))
        return 1

    mode = policy.get("mode", "strict")
    if mode not in VALID_MODES:
        mode = "strict"  # unknown mode fails closed

    haystack = f"{tool} {' '.join(args)}"
    for pattern in policy["deny_patterns"]:
        try:
            if re.search(pattern, haystack, re.IGNORECASE):
                if mode == "audit":
                    print(f"[POLICY] AUDIT: '{pattern}' matched — logged, allowed.")
                    _log_event("audit", tool, haystack, pattern)
                    return 0
                if mode == "permissive":
                    print(
                        f"[POLICY] WARNING: '{pattern}' matched — allowed, tag step HARD.",
                        file=sys.stderr,
                    )
                    _log_event("warn", tool, haystack, pattern)
                    return 2
                print(
                    f"[POLICY] DENY: '{pattern}' matched '{haystack[:120]}'. "
                    f"Report to the user instead of retrying.",
                    file=sys.stderr,
                )
                _log_event("deny", tool, haystack, pattern)
                return 1
        except re.error as e:
            # Broken security pattern fails closed
            print(
                f"[POLICY] ERROR: invalid pattern {pattern!r} ({e}) — DENY (fail-closed).",
                file=sys.stderr,
            )
            _log_event("deny-badpattern", tool, haystack, pattern)
            return 1

    return 0


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(3)
    cmd = sys.argv[1]
    if cmd == "check":
        if len(sys.argv) < 3:
            print("usage: policy_check.py check <tool_name> [args...]", file=sys.stderr)
            sys.exit(3)
        sys.exit(cmd_check(sys.argv[2], sys.argv[3:]))
    elif cmd == "get":
        if len(sys.argv) != 3 or sys.argv[2] not in SCALAR_KEYS:
            print(
                f"usage: policy_check.py get <{'|'.join(sorted(SCALAR_KEYS))}>",
                file=sys.stderr,
            )
            sys.exit(3)
        policy = load_policy()
        if policy is None:
            print("[POLICY] ERROR: policy unreadable (fail-closed).", file=sys.stderr)
            sys.exit(1)
        print(policy.get(sys.argv[2], ""))
    elif cmd == "show":
        policy = load_policy()
        if policy is None:
            print("[POLICY] ERROR: policy unreadable (fail-closed).", file=sys.stderr)
            sys.exit(1)
        print(json.dumps(policy, indent=2, ensure_ascii=False))
    else:
        print(__doc__, file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
