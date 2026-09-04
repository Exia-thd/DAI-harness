#!/usr/bin/env bash
# Compatibility wrapper for direct verify-gate callers. The same canonical
# engine serves Stop hooks and this CLI; the wrapper intentionally does not add
# a second evidence replay.

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Probe the interpreter rather than trusting the name: on Windows a bare
# `python3`/`python` is often the Store alias stub. Fail closed if none runs -
# "I could not validate" must never reach the caller as "validated".
PY=()
if command -v python3 >/dev/null 2>&1 && python3 -c '' >/dev/null 2>&1; then
  PY=(python3)
elif command -v python >/dev/null 2>&1 && python -c '' >/dev/null 2>&1; then
  PY=(python)
elif command -v py >/dev/null 2>&1 && py -3 -c '' >/dev/null 2>&1; then
  PY=(py -3)
else
  echo "[VERIFY-GATE] No usable Python interpreter on PATH - cannot validate." >&2
  exit 1
fi
export PYTHONUTF8=1

exec "${PY[@]}" "${SCRIPT_DIR}/stop_gate.py" "$@"
