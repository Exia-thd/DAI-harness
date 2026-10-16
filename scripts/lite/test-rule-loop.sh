#!/usr/bin/env bash
# Isolated behavioral smoke for the rule-compliance loop.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/fw-rule-loop.XXXXXX")"
cleanup() { rm -rf "$TEST_ROOT"; }
trap cleanup EXIT

export DAIHARNESS_RULE_LEDGER="$TEST_ROOT/rule-ledger.jsonl"
export DAIHARNESS_TELEMETRY_DIR="$TEST_ROOT/telemetry"
export DAIHARNESS_SKIP_MEM0=1
export DAIHARNESS_CONTEXT_CHAR_CAP=2000

# The interpreter this loop runs on.
#
# Never the bare name `python3`: on Windows that resolves to the Microsoft
# Store alias, which exits 9009 with an advertisement instead of running
# anything. The alias is ruled out by checking the candidate actually runs.
PY=""
_real_interpreter() {
  # Ask the candidate where it really lives. A name on PATH can be a shim - a
  # bash script on Windows - which runs here but cannot be executed by the
  # native Python that replays the recorded command (WinError 193). Its own
  # sys.executable is an interpreter binary by construction.
  local found
  found="$("$@" -c "import sys; print(sys.executable)" 2>/dev/null)" || return 1
  [[ -n "$found" && -f "$found" ]] || return 1
  printf '%s\n' "$found"
}

for candidate in "${DAIHARNESS_PYTHON_BIN:-}" python3 python python3.13 python3.12 python3.11; do
  [[ -n "$candidate" ]] || continue
  exe="$(command -v "$candidate" 2>/dev/null || true)"
  [[ -n "$exe" ]] || continue
  # The Microsoft Store alias answers nothing and exits 9009, so it fails here.
  PY="$(_real_interpreter "$exe")" && [[ -n "$PY" ]] && break
  PY=""
done
if [[ -z "$PY" ]]; then
  launcher="$(command -v py.exe 2>/dev/null || command -v py 2>/dev/null || true)"
  if [[ -n "$launcher" ]]; then
    PY="$(_real_interpreter "$launcher" -3)" || PY=""
  fi
fi
[[ -n "$PY" ]] || { echo "no working Python interpreter found" >&2; exit 1; }
# A recorded command is split on whitespace when it is replayed, so an
# interpreter whose path contains a space cannot be recorded as one word.
case "$PY" in
  *" "*) echo "the interpreter path contains a space and cannot be recorded: $PY" >&2; exit 1 ;;
esac

telemetry_record="$(bash scripts/lite/telemetry.sh emit test.event '{"token":"must-not-leak","status":"ok"}')"

# The emitted record is real JSON, so it is checked as JSON. jq when it is
# there, and the interpreter the rest of these scripts already rely on when it
# is not - this harness must not need a tool the scripts it tests do without.
assert_record() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -e '.event == "test.event" and .data.token == "***REDACTED***"' >/dev/null
    return
  fi
  $PY - "$1" <<'PYEOF'
import json
import sys

record = json.loads(sys.argv[1])
assert record.get("event") == "test.event", record
assert record.get("data", {}).get("token") == "***REDACTED***", record
PYEOF
}

assert_record "$telemetry_record"
[[ "$telemetry_record" != *"must-not-leak"* ]]

bash scripts/lite/rule-ledger.sh add HR1-verify hit "isolated pass" >/dev/null
bash scripts/lite/rule-ledger.sh add HR2-impact violation "isolated violation" >/dev/null
top_output="$(bash scripts/lite/rule-ledger.sh top 3 violation)"
[[ "$top_output" == *"HR2-impact"* ]]
[[ "$top_output" != *"HR1-verify"* ]]
bash scripts/lite/rule-refresh.sh >/dev/null

$PY scripts/lite/rule-validator.py --static >/dev/null
git -C "$TEST_ROOT" init -q -b main
git -C "$TEST_ROOT" config user.email test@dai-harness.local
git -C "$TEST_ROOT" config user.name "DAI Harness Test"
mkdir -p "$TEST_ROOT/checks"
printf '%s\n' "print('isolated-check passed')" > "$TEST_ROOT/checks/isolated_check.py"
git -C "$TEST_ROOT" add checks/isolated_check.py
git -C "$TEST_ROOT" commit -qm init

validator_response="$({
  cd "$TEST_ROOT"
  $PY "$PROJECT_ROOT/scripts/lite/run_check.py" \
    --turn isolated-validator \
    --acceptance 'isolated-validator=isolated rule validation is correlated' \
    --tier contract \
    --test-ref checks/isolated_check.py \
    --negative-path 'missing exact-turn evidence is rejected' \
    --limitations '' \
    --change-kind test \
    --phase verification \
    --implementer-id isolated-implementer \
    --reviewer-status not_required \
    -- $PY checks/isolated_check.py
})"
export DAIHARNESS_WORKSPACE="$TEST_ROOT"
export DAIHARNESS_TURN=isolated-validator
printf '%s' "$validator_response" \
  | $PY scripts/lite/rule-validator.py --runtime >/dev/null
if printf '%s\n' 'CLAIM: incomplete' 'VERDICT: PASS' \
    | $PY scripts/lite/rule-validator.py --runtime >/dev/null 2>&1; then
  echo "Expected incomplete VERIFY block to fail." >&2
  exit 1
fi
unset DAIHARNESS_WORKSPACE DAIHARNESS_TURN

$PY scripts/lite/context-manager.py load --keywords "rule compliance" > "$TEST_ROOT/context.txt"
[[ "$(wc -c < "$TEST_ROOT/context.txt" | tr -d ' ')" -le 2000 ]]

bash scripts/lite/policy-check.sh check run_command "git status --short" >/dev/null
if bash scripts/lite/policy-check.sh check run_command "command git -C . reset --hard" >/dev/null 2>&1; then
  echo "Expected destructive wrapped command to be denied." >&2
  exit 1
fi

echo "Rule compliance loop behavioral checks passed."
