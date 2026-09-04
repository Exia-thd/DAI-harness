#!/usr/bin/env bash
# Bounded Stop-hook entry point. All validation and retry decisions are owned
# by stop_gate.py so a single Stop event can replay completion evidence at most
# once.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="${2:-}"; shift 2 ;;
    --help|-h)
      echo "Usage: stop-gate.sh --platform CLAUDE|GEMINI|CURSOR|CODEX"
      exit 0
      ;;
    *) shift ;;
  esac
done

PLATFORM="$(printf '%s' "$PLATFORM" | tr '[:lower:]' '[:upper:]')"

# A project-local Codex gate is canonical for that repository. An installed
# global copy defers before requiring any adjacent Python modules.
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
PROJECT_LITE_DIR="${PROJECT_ROOT:+${PROJECT_ROOT}/scripts/lite}"

# Compare the two in one spelling. Under MSYS, `pwd` yields /c/... while git
# yields C:/..., so the project's own gate would fail this identity check,
# conclude it is a foreign global install, and defer - allowing every Codex
# Stop event unvalidated.
canonical_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1" 2>/dev/null || printf '%s' "$1"
  else
    printf '%s' "$1"
  fi
}
SCRIPT_DIR_CANONICAL="$(canonical_path "$SCRIPT_DIR")"
PROJECT_LITE_CANONICAL="${PROJECT_LITE_DIR:+$(canonical_path "$PROJECT_LITE_DIR")}"
if [[ "$PLATFORM" == "CODEX" && -n "$PROJECT_ROOT" && "$SCRIPT_DIR_CANONICAL" != "$PROJECT_LITE_CANONICAL" ]]; then
  PROJECT_CODEX_CONFIG="${PROJECT_ROOT}/.codex/config.toml"
  if [[ -f "$PROJECT_CODEX_CONFIG" ]] &&
    grep -Eq 'command[[:space:]]*=[[:space:]]*"bash scripts/lite/stop-gate\.sh --platform CODEX([[:space:]]|"|$)' "$PROJECT_CODEX_CONFIG"; then
    printf '{"continue": true}\n'
    exit 0
  fi
fi

# Resolve an interpreter instead of assuming `python3` is on PATH. On Windows a
# bare `python3`/`python` is often the Store alias stub, which exits non-zero
# with "Python was not found" - probe it rather than trust the name.
PY=()
if command -v python3 >/dev/null 2>&1 && python3 -c '' >/dev/null 2>&1; then
  PY=(python3)
elif command -v python >/dev/null 2>&1 && python -c '' >/dev/null 2>&1; then
  PY=(python)
elif command -v py >/dev/null 2>&1 && py -3 -c '' >/dev/null 2>&1; then
  PY=(py -3)
else
  # Fail closed. This gate exists to stop unverified claims, so "I could not
  # run the validators" must never reach the caller as "validated".
  echo "[STOP-GATE] No usable Python interpreter on PATH - cannot validate." >&2
  if [[ "$PLATFORM" == "CODEX" ]]; then
    printf '{"decision": "block", "reason": "stop-gate: no usable Python interpreter on PATH"}\n'
    exit 0
  fi
  if [[ "$PLATFORM" == "CLAUDE" || "$PLATFORM" == "GEMINI" ]]; then
    exit 2
  fi
  exit 1
fi
# Legacy Windows codepages turn non-ASCII validator output into a crash.
export PYTHONUTF8=1

exec "${PY[@]}" "${SCRIPT_DIR}/stop_gate.py" --platform "$PLATFORM" --typed-stop-decision
