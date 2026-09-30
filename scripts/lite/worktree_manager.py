#!/usr/bin/env python3
"""
scripts/lite/worktree_manager.py
Git-worktree lifecycle for parallel dispatch (task contracts + merge arbiter).

Flow per worker:
  create -> contract -> (worker edits + commits in .worktrees/<id>) ->
  deliver -> validate (scope check = merge arbiter) -> merge -> cleanup

Usage:
    python scripts/lite/worktree_manager.py create <task_id> [--branch B]
    python scripts/lite/worktree_manager.py contract <task_id> --objective "..." \
        --outputs "glob1,glob2" [--forbidden "glob3"]
    python scripts/lite/worktree_manager.py deliver <task_id> --summary "..." [--status done]
    python scripts/lite/worktree_manager.py validate <task_id>
    python scripts/lite/worktree_manager.py merge <task_id>
    python scripts/lite/worktree_manager.py cleanup <task_id> [--force]
    python scripts/lite/worktree_manager.py status

Env: DAIHARNESS_MAX_WORKERS (default 4)
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from fnmatch import fnmatch
from pathlib import Path

WORKTREE_BASE = Path(".worktrees")
MAX_WORKERS = 4


def sh(
    args: list[str], cwd: Path | None = None, check: bool = True
) -> subprocess.CompletedProcess:
    r = subprocess.run(args, capture_output=True, text=True, cwd=cwd)
    if check and r.returncode != 0:
        print(
            f"[worktree] command failed: {' '.join(args)}\n{r.stderr.strip()}",
            file=sys.stderr,
        )
        sys.exit(1)
    return r


def repo_root() -> Path:
    return Path(sh(["git", "rev-parse", "--show-toplevel"]).stdout.strip())


def base_branch() -> str:
    return sh(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()


def wt_path(task_id: str) -> Path:
    return WORKTREE_BASE / task_id


def branch_name(task_id: str) -> str:
    return f"parallel/{task_id}"


# ── commands ──────────────────────────────────────────────────────────────────


def cmd_create(args) -> None:
    import os

    max_workers = int(os.environ.get("DAIHARNESS_MAX_WORKERS", MAX_WORKERS))
    active = [
        line
        for line in sh(["git", "worktree", "list", "--porcelain"]).stdout.splitlines()
        if line.startswith("worktree ")
    ]
    if len(active) - 1 >= max_workers:
        print(
            f"[worktree] Max workers reached ({max_workers}). Clean up first.",
            file=sys.stderr,
        )
        sys.exit(1)

    path = wt_path(args.task_id)
    if path.exists():
        print(f"[worktree] Already exists: {path}. Use cleanup first.", file=sys.stderr)
        sys.exit(1)

    branch = args.branch or branch_name(args.task_id)
    WORKTREE_BASE.mkdir(exist_ok=True)
    exists = (
        sh(
            ["git", "show-ref", "--verify", f"refs/heads/{branch}"], check=False
        ).returncode
        == 0
    )
    if exists:
        sh(["git", "worktree", "add", str(path), branch])
    else:
        sh(["git", "worktree", "add", "-b", branch, str(path)])
    print(f"+ worktree created: {path} (branch {branch}, base {base_branch()})")


def cmd_contract(args) -> None:
    path = wt_path(args.task_id)
    if not path.is_dir():
        print(f"[worktree] No worktree at {path}. Run create first.", file=sys.stderr)
        sys.exit(1)
    contract = {
        "task_id": args.task_id,
        "objective": args.objective,
        "outputs": [g.strip() for g in args.outputs.split(",") if g.strip()],
        "forbidden": [
            g.strip() for g in (args.forbidden or "").split(",") if g.strip()
        ],
        "base_commit": sh(["git", "rev-parse", "HEAD"]).stdout.strip(),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (path / "CONTRACT.json").write_text(
        json.dumps(contract, indent=2), encoding="utf-8"
    )
    print(
        f"+ CONTRACT.json written: outputs={contract['outputs']} forbidden={contract['forbidden']}"
    )


def cmd_deliver(args) -> None:
    path = wt_path(args.task_id)
    if not path.is_dir():
        print(f"[worktree] No worktree at {path}.", file=sys.stderr)
        sys.exit(1)
    delivery = {
        "task_id": args.task_id,
        "status": args.status,
        "summary": args.summary,
        "head": sh(["git", "rev-parse", "HEAD"], cwd=path).stdout.strip(),
        "delivered_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (path / "DELIVERY.json").write_text(
        json.dumps(delivery, indent=2), encoding="utf-8"
    )
    print(f"+ DELIVERY.json written (status={args.status})")


def _changed_files(path: Path, base_commit: str) -> list[str]:
    out = sh(["git", "diff", "--name-only", f"{base_commit}...HEAD"], cwd=path).stdout
    return [
        line.strip().replace("\\", "/") for line in out.splitlines() if line.strip()
    ]


def _validate(task_id: str) -> tuple[bool, list[str]]:
    """Merge-arbiter scope check. Returns (ok, errors)."""
    path = wt_path(task_id)
    errors: list[str] = []
    contract_file = path / "CONTRACT.json"
    delivery_file = path / "DELIVERY.json"
    if not contract_file.is_file():
        return False, ["CONTRACT.json missing — worker had no contracted scope"]
    if not delivery_file.is_file():
        return False, ["DELIVERY.json missing — worker did not declare completion"]
    contract = json.loads(contract_file.read_text(encoding="utf-8"))
    delivery = json.loads(delivery_file.read_text(encoding="utf-8"))
    if delivery.get("status") != "done":
        errors.append(f"delivery status is '{delivery.get('status')}', expected 'done'")

    changed = _changed_files(path, contract["base_commit"])
    if not changed:
        errors.append("no committed changes in worktree — nothing to merge")
    outputs = contract.get("outputs", [])
    forbidden = contract.get("forbidden", [])
    for f in changed:
        if any(fnmatch(f, pat) for pat in forbidden):
            errors.append(f"FORBIDDEN path changed: {f}")
        elif outputs and not any(fnmatch(f, pat) for pat in outputs):
            errors.append(
                f"OUT OF SCOPE: {f} matches no contract output glob {outputs}"
            )
    return (not errors), errors


def cmd_validate(args) -> None:
    ok, errors = _validate(args.task_id)
    if ok:
        path = wt_path(args.task_id)
        contract = json.loads((path / "CONTRACT.json").read_text(encoding="utf-8"))
        changed = _changed_files(path, contract["base_commit"])
        (path / "VALIDATION.json").write_text(
            json.dumps(
                {
                    "task_id": args.task_id,
                    "valid": True,
                    "files": changed,
                    "validated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"+ VALIDATION PASSED: {len(changed)} file(s) in scope: {changed}")
    else:
        print("[worktree] VALIDATION FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)


def cmd_merge(args) -> None:
    ok, errors = _validate(args.task_id)
    if not ok:
        print("[worktree] Refusing to merge — validation failed:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)
    branch = branch_name(args.task_id)
    r = sh(
        [
            "git",
            "merge",
            "--no-ff",
            branch,
            "-m",
            f"merge(parallel): {args.task_id} via merge-arbiter",
        ],
        check=False,
    )
    if r.returncode != 0:
        sh(["git", "merge", "--abort"], check=False)
        print(
            f"[worktree] MERGE CONFLICT with {branch} — merge aborted, tree restored.\n"
            f"{r.stdout}{r.stderr}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"+ merged {branch} into {base_branch()}")


def cmd_cleanup(args) -> None:
    path = wt_path(args.task_id)
    branch = branch_name(args.task_id)
    cmd = ["git", "worktree", "remove", str(path)]
    if args.force:
        cmd.append("--force")
    else:
        # metadata files (CONTRACT/DELIVERY/VALIDATION) are untracked → need force
        cmd.append("--force")
    sh(cmd, check=False)
    sh(["git", "branch", "-D" if args.force else "-d", branch], check=False)
    sh(["git", "worktree", "prune"])
    print(f"+ cleaned up {path} and branch {branch}")


def cmd_status(_args) -> None:
    if not WORKTREE_BASE.is_dir():
        print("No worktrees.")
        return
    count = 0
    for wt in sorted(WORKTREE_BASE.iterdir()):
        if not wt.is_dir():
            continue
        marks = "".join(
            "+" if (wt / f).is_file() else "-"
            for f in ("CONTRACT.json", "DELIVERY.json", "VALIDATION.json")
        )
        branch = sh(
            ["git", "branch", "--show-current"], cwd=wt, check=False
        ).stdout.strip()
        print(
            f"  {wt.name:<16} branch={branch:<28} [contract/delivery/validated: {marks}]"
        )
        count += 1
    print(f"Total: {count} worker(s)")


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    p = argparse.ArgumentParser(
        description="DAI Harness parallel-dispatch worktree manager"
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("create")
    sp.add_argument("task_id")
    sp.add_argument("--branch")

    sp = sub.add_parser("contract")
    sp.add_argument("task_id")
    sp.add_argument("--objective", required=True)
    sp.add_argument("--outputs", required=True)
    sp.add_argument("--forbidden")

    sp = sub.add_parser("deliver")
    sp.add_argument("task_id")
    sp.add_argument("--summary", required=True)
    sp.add_argument("--status", default="done")

    for name in ("validate", "merge"):
        sub.add_parser(name).add_argument("task_id")

    sp = sub.add_parser("cleanup")
    sp.add_argument("task_id")
    sp.add_argument("--force", action="store_true")

    sub.add_parser("status")

    args = p.parse_args()
    {
        "create": cmd_create,
        "contract": cmd_contract,
        "deliver": cmd_deliver,
        "validate": cmd_validate,
        "merge": cmd_merge,
        "cleanup": cmd_cleanup,
        "status": cmd_status,
    }[args.cmd](args)


if __name__ == "__main__":
    main()
