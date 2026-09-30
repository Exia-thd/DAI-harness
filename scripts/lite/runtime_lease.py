#!/usr/bin/env python3
"""
scripts/lite/runtime_lease.py
Minimal Runtime Lifecycle Guard. Tracks every long-running process the agent starts so nothing
leaks: a dev server left behind is invisible to tests but eats the machine.

Registry: .daiharness/leases.json

Usage:
    python scripts/lite/runtime_lease.py run --role <role> [--policy keep] -- <cmd> [args...]
        Spawn <cmd> detached, register a lease. If a live lease with the same
        role exists, REUSE it (prints existing lease, exit 0) instead of
        starting a duplicate.
    python scripts/lite/runtime_lease.py register --role <role> --pid <pid> [--port N] [--policy keep]
    python scripts/lite/runtime_lease.py status              # table + LEAKED verdict
    python scripts/lite/runtime_lease.py release <lease_id>  # terminate + remove
    python scripts/lite/runtime_lease.py reap                # kill all non-keep live leases, drop dead ones

Exit codes: status -> 0 = CLEAN, 1 = LEAKED (live non-keep leases present).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

LEASE_FILE = Path(".daiharness") / "leases.json"


# ── PID liveness / termination (cross-platform; os.kill(pid,0) is unsafe on
# Windows — any non-signal value calls TerminateProcess) ──────────────────────


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        r = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH", "/FO", "CSV"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return f'"{pid}"' in r.stdout
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def pid_kill(pid: int) -> bool:
    if os.name == "nt":
        r = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return r.returncode == 0
    try:
        import signal

        os.kill(pid, signal.SIGTERM)
        return True
    except OSError:
        return False


# ── registry ──────────────────────────────────────────────────────────────────


def load_leases() -> list[dict]:
    if LEASE_FILE.is_file():
        try:
            return json.loads(LEASE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return []


def save_leases(leases: list[dict]) -> None:
    LEASE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEASE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(leases, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, LEASE_FILE)


def new_lease(
    role: str, pid: int, port: int | None, policy: str, cmd: str = ""
) -> dict:
    return {
        "lease_id": f"{role}-{uuid.uuid4().hex[:8]}",
        "role": role,
        "pid": pid,
        "port": port,
        "policy": policy,  # reap | keep
        "cmd": cmd[:200],
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ── commands ──────────────────────────────────────────────────────────────────


def cmd_run(args) -> int:
    leases = load_leases()
    for lease in leases:
        if lease["role"] == args.role and pid_alive(lease["pid"]):
            print(
                f"[lease] REUSE existing '{args.role}': {lease['lease_id']} pid={lease['pid']}"
            )
            return 0
    if not args.cmd_list:
        print("[lease] ERROR: no command after '--'", file=sys.stderr)
        return 3
    kwargs: dict = {}
    if os.name == "nt":
        kwargs["creationflags"] = (
            0x00000208  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        )
    else:
        kwargs["start_new_session"] = True
    proc = subprocess.Popen(
        args.cmd_list, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs
    )
    lease = new_lease(
        args.role, proc.pid, args.port, args.policy, " ".join(args.cmd_list)
    )
    leases.append(lease)
    save_leases(leases)
    print(
        f"[lease] OPENED {lease['lease_id']} role={args.role} pid={proc.pid} policy={args.policy}"
    )
    return 0


def cmd_register(args) -> int:
    leases = load_leases()
    lease = new_lease(args.role, args.pid, args.port, args.policy)
    leases.append(lease)
    save_leases(leases)
    print(f"[lease] REGISTERED {lease['lease_id']} role={args.role} pid={args.pid}")
    return 0


def cmd_status(_args) -> int:
    leases = load_leases()
    if not leases:
        print("RUNTIME LEDGER: no leases. VERDICT: CLEAN")
        return 0
    leaked: list[str] = []
    for lease in leases:
        alive = pid_alive(lease["pid"])
        state = "LIVE" if alive else "DEAD"
        print(
            f"  {lease['lease_id']:<24} role={lease['role']:<12} pid={lease['pid']:<8} "
            f"policy={lease['policy']:<5} [{state}]"
        )
        if alive and lease["policy"] != "keep":
            leaked.append(lease["lease_id"])
    if leaked:
        print(f"VERDICT: LEAKED — live non-keep lease(s): {', '.join(leaked)}")
        print("Run: python scripts/lite/runtime_lease.py reap")
        return 1
    print(
        "VERDICT: CLEAN (live leases are all policy=keep)"
        if any(pid_alive(le["pid"]) for le in leases)
        else "VERDICT: CLEAN"
    )
    return 0


def cmd_release(args) -> int:
    leases = load_leases()
    remaining, found = [], None
    for lease in leases:
        if lease["lease_id"] == args.lease_id:
            found = lease
        else:
            remaining.append(lease)
    if not found:
        print(f"[lease] not found: {args.lease_id}", file=sys.stderr)
        return 1
    if pid_alive(found["pid"]):
        pid_kill(found["pid"])
    save_leases(remaining)
    print(f"[lease] CLOSED {args.lease_id}")
    return 0


def cmd_reap(_args) -> int:
    leases = load_leases()
    kept, reaped, dropped = [], [], []
    for lease in leases:
        if lease["policy"] == "keep":
            kept.append(lease)
        elif pid_alive(lease["pid"]):
            pid_kill(lease["pid"])
            reaped.append(lease["lease_id"])
        else:
            dropped.append(lease["lease_id"])
    save_leases(kept)
    print(
        f"[lease] reaped={reaped or 'none'} dropped-dead={dropped or 'none'} kept={len(kept)}"
    )
    return 0


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    argv = sys.argv[1:]
    cmd_args: list[str] = []
    if "--" in argv:
        split = argv.index("--")
        argv, cmd_args = argv[:split], argv[split + 1 :]

    p = argparse.ArgumentParser(description="DAI Harness runtime lease guard")
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("run")
    sp.add_argument("--role", required=True)
    sp.add_argument("--port", type=int)
    sp.add_argument("--policy", choices=["reap", "keep"], default="reap")
    sp = sub.add_parser("register")
    sp.add_argument("--role", required=True)
    sp.add_argument("--pid", type=int, required=True)
    sp.add_argument("--port", type=int)
    sp.add_argument("--policy", choices=["reap", "keep"], default="reap")
    sub.add_parser("status")
    sp = sub.add_parser("release")
    sp.add_argument("lease_id")
    sub.add_parser("reap")

    args = p.parse_args(argv)
    args.cmd_list = cmd_args
    sys.exit(
        {
            "run": cmd_run,
            "register": cmd_register,
            "status": cmd_status,
            "release": cmd_release,
            "reap": cmd_reap,
        }[args.cmd](args)
    )


if __name__ == "__main__":
    main()
