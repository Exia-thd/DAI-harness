#!/usr/bin/env python3
"""
scripts/lite/escalate.py
HARD-step escalation runner for DAI Harness.

Builds a redacted context packet (task + verify evidence + git diff) and delegates
to a configured expert CLI in fresh-context, non-interactive mode.

Supported CLIs: claude (-p), codex (exec), gemini (-p), agy (--print)

Usage:
    python scripts/lite/escalate.py "<step + minimal context>"
    python scripts/lite/escalate.py --dry-run "<step>"     # show packet, no call

Config (.daiharness.yaml, optional):
    expertMode:
      activeCli: claude
      fallbackCli: gemini
      providerTimeoutSeconds: 120
      budget:
        maxExpertCallsPerRun: 5
        requireConfirmationAbove: 3

Env vars:
    DAIHARNESS_RUN_ID    budget-window key (default: today's date)
    DAIHARNESS_CONFIRM   set "1" to proceed past the confirmation threshold
    DAIHARNESS_ESCALATION_TIMEOUT_SECS  provider wall-clock cap (clamped 1..3600)

Output: escalation records in .daiharness/escalations/<run>-<ts>-<task>.json
Secrets are redacted before any packet is written or sent.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(
    os.environ.get("PROJECT_ROOT")
    or subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    ).stdout.strip()
    or Path.cwd()
).resolve()

CONFIG_FILE = PROJECT_ROOT / ".daiharness.yaml"
VERIFY_DIR = PROJECT_ROOT / ".daiharness" / "verify"
ESCALATION_DIR = PROJECT_ROOT / ".daiharness" / "escalations"

# (argv_builder, prompt_via_stdin) — stdin avoids cmd.exe mangling multi-line
# args when the CLI is an npm .CMD shim on Windows.
CLI_ARGV = {
    "claude": (lambda prompt: ["claude", "-p"], True),
    "codex": (lambda prompt: ["codex", "exec", prompt], False),
    "gemini": (lambda prompt: ["gemini", "-p", prompt], False),
    # Expert escalation is advisory/read-only: keep Antigravity sandboxed and
    # force plan mode even when the user's persisted default permits edits.
    "agy": (
        lambda prompt: ["agy", "--sandbox", "--mode", "plan", "--print", prompt],
        False,
    ),
}

SECRET_PATTERNS = [
    (
        re.compile(r"(?i)(api[_-]?key|secret|token|password|auth)\s*[:=]\s*\S+"),
        r"\1=***REDACTED***",
    ),
    (
        re.compile(
            r"(?i)\b(OPENAI|ANTHROPIC|GOOGLE|GITHUB|AWS|AZURE)_[A-Z_]*(?:KEY|TOKEN|SECRET)\s*=\s*\S+"
        ),
        "***REDACTED***",
    ),
    (re.compile(r"(?i)(Authorization:\s*(?:Bearer|Basic)\s+)\S+"), r"\1***REDACTED***"),
    (re.compile(r"(?<=[=:])([A-Za-z0-9+/]{32,}={0,2})"), "***REDACTED***"),
]


def redact(text: str) -> str:
    for pattern, replacement in SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ── config (regex-based, no yaml dependency) ──────────────────────────────────


def _yaml_scalar(text: str, key: str) -> str | None:
    m = re.search(
        r"(?m)^[ \t]*" + re.escape(key) + r":\s*(?:\"([^\"]*?)\"|'([^']*?)'|([^\n#]*))",
        text,
    )
    if not m:
        return None
    val = (m.group(1) or m.group(2) or m.group(3) or "").strip()
    return val if val not in ("null", "~", "") else None


def load_config() -> dict:
    defaults = {
        "activeCli": "claude",
        "fallbackCli": None,
        "maxExpertCallsPerRun": 5,
        "requireConfirmationAbove": 3,
        "providerTimeoutSeconds": 120,
    }
    if not CONFIG_FILE.exists():
        return defaults
    try:
        text = CONFIG_FILE.read_text(encoding="utf-8")
        block_m = re.search(r"(?m)^expertMode:\s*\n((?:[ \t]+.*\n?)*)", text)
        block = block_m.group(0) if block_m else text
        cfg = dict(defaults)
        cfg["activeCli"] = _yaml_scalar(block, "activeCli") or defaults["activeCli"]
        cfg["fallbackCli"] = _yaml_scalar(block, "fallbackCli")
        for key in (
            "maxExpertCallsPerRun",
            "requireConfirmationAbove",
            "providerTimeoutSeconds",
        ):
            v = _yaml_scalar(block, key)
            if v is not None:
                try:
                    cfg[key] = int(v)
                except ValueError:
                    pass
        return cfg
    except OSError:
        return defaults


# ── budget ────────────────────────────────────────────────────────────────────


def run_id() -> str:
    return os.environ.get("DAIHARNESS_RUN_ID") or time.strftime("%Y%m%d")


def count_prior_escalations() -> int:
    if not ESCALATION_DIR.is_dir():
        return 0
    return sum(
        1
        for f in ESCALATION_DIR.iterdir()
        if f.name.startswith(run_id()) and f.suffix == ".json"
    )


# ── context packet ────────────────────────────────────────────────────────────


def get_evidence() -> list[dict]:
    slices: list[dict] = []
    if VERIFY_DIR.is_dir():
        entries = sorted(
            (f for f in VERIFY_DIR.iterdir() if f.is_file()),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )[:3]
        for path in entries:
            try:
                raw = path.read_text(errors="replace")[:4000]
                slices.append({"file": path.name, "content": redact(raw)})
            except OSError:
                pass
    if slices:
        return slices
    return [
        {
            "file": "(none)",
            "content": "No .daiharness/verify files found for this turn.",
        }
    ]


def get_git_diff() -> str:
    try:
        diff = subprocess.run(
            ["git", "diff", "HEAD"],
            capture_output=True,
            text=True,
            cwd=PROJECT_ROOT,
            timeout=15,
        ).stdout
        return redact(diff[:10000])
    except Exception:
        return ""


def provider_timeout_seconds(cfg: dict) -> int:
    """Provider wall-clock cap. Env wins over config; always clamped to [1, 3600]."""
    raw = os.environ.get("DAIHARNESS_ESCALATION_TIMEOUT_SECS")
    try:
        value = (
            int(raw) if raw is not None else int(cfg.get("providerTimeoutSeconds", 120))
        )
    except (TypeError, ValueError):
        value = 120
    return max(1, min(value, 3600))


def _lease_module():
    """Import the runtime lease guard from the same directory. None if unavailable."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import runtime_lease  # noqa: PLC0415

        return runtime_lease
    except ImportError:
        return None


def run_provider(
    argv: list[str], prompt: str, use_stdin: bool, env: dict, timeout_seconds: int
) -> subprocess.CompletedProcess:
    """Run the expert CLI under a runtime lease so a hung provider is never invisible.

    The lease is registered right after spawn and released in `finally`, so a
    provider that overruns its timeout is killed AND deregistered rather than
    lingering as an orphan.
    """
    proc = subprocess.Popen(
        argv,
        stdin=subprocess.PIPE if use_stdin else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
    )

    lease_mod, lease_id = _lease_module(), None
    if lease_mod is not None:
        try:
            leases = lease_mod.load_leases()
            lease = lease_mod.new_lease(
                "expert", proc.pid, None, "reap", " ".join(argv[:2])
            )
            leases.append(lease)
            lease_mod.save_leases(leases)
            lease_id = lease["lease_id"]
        except OSError as e:
            print(
                f"[ESCALATE] WARNING: could not register runtime lease: {e}",
                file=sys.stderr,
            )

    try:
        stdout, stderr = proc.communicate(
            input=prompt if use_stdin else None, timeout=timeout_seconds
        )
        return subprocess.CompletedProcess(argv, proc.returncode, stdout, stderr)
    except subprocess.TimeoutExpired:
        if lease_mod is not None:
            lease_mod.pid_kill(proc.pid)
        else:
            proc.kill()
        stdout, stderr = proc.communicate()
        msg = f"[ESCALATE] ERROR: provider timed out after {timeout_seconds}s.\n"
        return subprocess.CompletedProcess(argv, 124, stdout, (stderr or "") + msg)
    finally:
        if lease_id and lease_mod is not None:
            try:
                remaining = [
                    le for le in lease_mod.load_leases() if le["lease_id"] != lease_id
                ]
                lease_mod.save_leases(remaining)
            except OSError as e:
                print(
                    f"[ESCALATE] WARNING: could not release lease {lease_id}: {e}",
                    file=sys.stderr,
                )


def build_argv(cli: str, prompt: str) -> tuple[list[str], bool]:
    if cli not in CLI_ARGV:
        raise ValueError(f"Unknown CLI '{cli}'. Supported: {sorted(CLI_ARGV)}")
    builder, use_stdin = CLI_ARGV[cli]
    argv = builder(prompt)
    # Windows: npm shims are .cmd/.ps1 — resolve the real executable path
    resolved = shutil.which(argv[0])
    if resolved:
        argv[0] = resolved
    return argv, use_stdin


# ── main ──────────────────────────────────────────────────────────────────────


def _utf8_io() -> None:
    """Windows consoles default to a legacy codepage; non-ASCII output would
    crash the tool instead of printing. Force UTF-8 on our own streams."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _utf8_io()
    args = list(sys.argv[1:])
    is_dry_run = "--dry-run" in args
    if is_dry_run:
        args.remove("--dry-run")

    task_desc = " ".join(args).strip()
    if not task_desc and not sys.stdin.isatty():
        task_desc = sys.stdin.read().strip()
    if not task_desc:
        task_desc = "No task provided."

    cfg = load_config()
    active_cli = cfg["activeCli"]
    fallback_cli = cfg["fallbackCli"]
    max_calls = cfg["maxExpertCallsPerRun"]
    req_confirm = cfg["requireConfirmationAbove"]

    if active_cli not in CLI_ARGV:
        print(
            f"[ESCALATE] ERROR: activeCli '{active_cli}' is not supported. "
            f"Supported: {sorted(CLI_ARGV)}. Set expertMode.activeCli in .daiharness.yaml.",
            file=sys.stderr,
        )
        sys.exit(1)

    prior = count_prior_escalations()
    if prior >= max_calls:
        print(
            f"[ESCALATE] BUDGET EXCEEDED: {prior}/{max_calls} expert calls used this run.\n"
            f"  Pausing. Security / schema / public-interface work must wait for user approval.\n"
            f"  Raise expertMode.budget.maxExpertCallsPerRun in .daiharness.yaml to continue.",
            file=sys.stderr,
        )
        sys.exit(2)

    if prior >= req_confirm and os.environ.get("DAIHARNESS_CONFIRM") != "1":
        print(
            f"[ESCALATE] CONFIRMATION REQUIRED: {prior} calls used "
            f"(threshold {req_confirm}). Re-run with DAIHARNESS_CONFIRM=1 to proceed.",
            file=sys.stderr,
        )
        sys.exit(3)

    evidence_slices = get_evidence()
    git_diff = get_git_diff()

    prompt_text = (
        f"[DAI Harness Escalation — fresh context, answer directly]\n"
        f"Task: {task_desc}\n\n"
        f"Evidence:\n{json.dumps(evidence_slices, indent=2)}\n\n"
        f"Diff (redacted):\n{git_diff[:3000] if git_diff else '(none)'}"
    )

    if is_dry_run:
        argv, use_stdin = build_argv(active_cli, task_desc)
        print("[DRY RUN] Context Packet:")
        print(
            json.dumps(
                {
                    "task": task_desc,
                    "evidence": evidence_slices,
                    "diff_chars": len(git_diff),
                },
                indent=2,
            )
        )
        print(
            f"[DRY RUN] Would execute argv: {argv} (prompt via {'stdin' if use_stdin else 'argv'})"
        )
        print(
            f"[DRY RUN] Budget: {prior}/{max_calls} used, confirm threshold {req_confirm}."
        )
        sys.exit(0)

    try:
        argv, use_stdin = build_argv(active_cli, prompt_text)
    except ValueError as e:
        print(f"[ESCALATE] ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    timeout_seconds = provider_timeout_seconds(cfg)
    print(
        f"[ESCALATE] CLI: {active_cli}, budget {prior + 1}/{max_calls}, timeout {timeout_seconds}s"
    )
    delegation_env = dict(os.environ, DAIHARNESS_WORKSPACE=str(PROJECT_ROOT))
    start_time = time.time()
    try:
        result = run_provider(
            argv, prompt_text, use_stdin, delegation_env, timeout_seconds
        )
    except FileNotFoundError:
        print(
            f"[ESCALATE] ERROR: CLI '{active_cli}' not found in PATH.", file=sys.stderr
        )
        sys.exit(1)
    latency_ms = int((time.time() - start_time) * 1000)

    print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    ESCALATION_DIR.mkdir(parents=True, exist_ok=True)
    safe_task = re.sub(r"[^A-Za-z0-9_-]", "-", task_desc[:40])
    record_path = ESCALATION_DIR / f"{run_id()}-{int(time.time())}-{safe_task}.json"
    record = {
        "timestamp": time.time(),
        "cli": active_cli,
        "task": task_desc,
        "exit_code": result.returncode,
        "latency_ms": latency_ms,
        "output_head": redact(result.stdout[:2000]),
    }
    record_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"[ESCALATE] Done in {latency_ms}ms. Record: {record_path}")

    if result.returncode != 0 and fallback_cli in CLI_ARGV:
        print(
            f"[ESCALATE] Primary exited {result.returncode}. Trying fallback: {fallback_cli}."
        )
        fb_argv, fb_stdin = build_argv(fallback_cli, prompt_text)
        fb = run_provider(
            fb_argv, prompt_text, fb_stdin, delegation_env, timeout_seconds
        )
        print(fb.stdout)
        if fb.stderr:
            print(fb.stderr, file=sys.stderr)
        sys.exit(fb.returncode)

    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
