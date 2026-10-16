#!/usr/bin/env bash
# scripts/lite/rule-ledger.sh
# DAI Harness Phase 1 — rule ledger.
# Tracks per-rule enforcement events so the kernel can measure which
# Hard Rules actually fire and which get violated.
#
# Usage:
#   bash scripts/lite/rule-ledger.sh add <rule_id> <outcome> [note...]
#   bash scripts/lite/rule-ledger.sh stats
#   bash scripts/lite/rule-ledger.sh top [N] [outcome]
#   bash scripts/lite/rule-ledger.sh recent [N] [outcome]
#
# Storage: .daiharness/rule-ledger.jsonl
# Record:  {"ts":"<ISO-8601 UTC>","rule":"<id>","outcome":"<outcome>","note":"..."}
# Recommended outcomes: hit | violation | override | waived
#
# Exit codes:
#   0 — success
#   1 — usage error / missing dependency

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[RULE-LEDGER]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[RULE-LEDGER] WARNING:${NC} $*" >&2; }
log_error() { echo -e "${RED}[RULE-LEDGER] ERROR:${NC} $*" >&2; }

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [[ -n "${DAIHARNESS_WORKSPACE:-}" ]]; then
  WORKSPACE_PATH="$DAIHARNESS_WORKSPACE"
  if command -v cygpath >/dev/null 2>&1; then
    WORKSPACE_PATH="$(cygpath -u "$WORKSPACE_PATH" 2>/dev/null)" || {
      log_error "DAIHARNESS_WORKSPACE cannot be normalized."
      exit 1
    }
  fi
  if [[ ! -d "$WORKSPACE_PATH" ]]; then
    log_error "DAIHARNESS_WORKSPACE is not a readable directory."
    exit 1
  fi
  PROJECT_ROOT="$(cd "$WORKSPACE_PATH" 2>/dev/null && pwd -P)" || {
    log_error "DAIHARNESS_WORKSPACE cannot be resolved."
    exit 1
  }
fi
cd "$PROJECT_ROOT"

LEDGER_FILE="${DAIHARNESS_RULE_LEDGER:-.daiharness/rule-ledger.jsonl}"

HAS_JQ=0
command -v jq >/dev/null 2>&1 && HAS_JQ=1
# Needed by the read paths as well as the write path, so it is resolved
# whenever jq is absent rather than only when something is being appended.
PYTHON_BIN=""
if [[ "$HAS_JQ" -eq 0 ]]; then
  PYTHON_BIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)"
  [[ -n "$PYTHON_BIN" ]] || { log_error "jq or python is required but not found in PATH."; exit 1; }
fi

ACTIVE_LOCK_DIR=""
_release_lock() {
  if [[ -n "$ACTIVE_LOCK_DIR" && -d "$ACTIVE_LOCK_DIR" ]]; then
    rmdir "$ACTIVE_LOCK_DIR" 2>/dev/null || true
  fi
  ACTIVE_LOCK_DIR=""
}

_append_locked() {
  local file="$1" record="$2" attempts=0 max_attempts=100
  mkdir -p "$(dirname "$file")"
  ACTIVE_LOCK_DIR="${file}.lock"
  while ! mkdir "$ACTIVE_LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [[ "$attempts" -ge "$max_attempts" ]]; then
      log_error "Timed out waiting for ledger append lock."
      ACTIVE_LOCK_DIR=""
      return 1
    fi
    sleep 0.02
  done
  trap _release_lock EXIT HUP INT TERM
  if ! printf '%s\n' "$record" >> "$file"; then
    _release_lock
    trap - EXIT HUP INT TERM
    return 1
  fi
  _release_lock
  trap - EXIT HUP INT TERM
}

usage() {
  cat >&2 <<'EOF'
Usage:
  rule-ledger.sh add <rule_id> <outcome> [note...]   Record one enforcement event
  rule-ledger.sh stats                               Per-rule totals with outcome breakdown
  rule-ledger.sh top [N] [outcome]                   Top N rules, optionally filtered
  rule-ledger.sh recent [N] [outcome]                Most recent events (default: violation)

Recommended outcomes: hit | violation | override | waived
EOF
  exit 1
}

_require_ledger() {
  if [[ ! -s "$LEDGER_FILE" ]]; then
    log_warn "Ledger is empty (${LEDGER_FILE} missing or empty)."
    exit 0
  fi
}

cmd_add() {
  [[ $# -ge 2 ]] || usage
  local rule_id="$1" outcome="$2"
  shift 2
  local note="$*"

  if [[ ! "$rule_id" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid rule_id '${rule_id}' (allowed: letters, digits, '.', '_', '-')."
    exit 1
  fi
  if [[ ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome '${outcome}' (allowed: letters, digits, '.', '_', '-')."
    exit 1
  fi

  local ts record
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  if [[ "$HAS_JQ" -eq 1 ]]; then
    record="$(jq -cn --arg ts "$ts" --arg rule "$rule_id" \
                     --arg outcome "$outcome" --arg note "$note" \
                     '{ts: $ts, rule: $rule, outcome: $outcome, note: $note}')"
  else
    record="$("$PYTHON_BIN" -c 'import json,sys; print(json.dumps({"ts":sys.argv[1],"rule":sys.argv[2],"outcome":sys.argv[3],"note":sys.argv[4]},separators=(",",":")))' "$ts" "$rule_id" "$outcome" "$note")"
  fi

  _append_locked "$LEDGER_FILE" "$record"
  log_info "add ${rule_id} [${outcome}] → ${LEDGER_FILE}"
}

# Read the ledger without jq.
#
# One program for all three views: each already pipes TSV into awk, so matching
# that contract is the whole job. A malformed line is skipped rather than
# failing the read - a ledger is an audit trail, and one torn append should not
# make the rest of it unreadable.
_ledger_py() {
  "$PYTHON_BIN" - "$LEDGER_FILE" "$@" <<'PYEOF'
import json
import sys

path, mode = sys.argv[1], sys.argv[2]
outcome = sys.argv[3] if len(sys.argv) > 3 else ""
limit = int(sys.argv[4]) if len(sys.argv) > 4 else 0

rows = []
with open(path, "r", encoding="utf-8", errors="replace") as handle:
    for line in handle:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict):
            rows.append(entry)

if outcome:
    rows = [r for r in rows if r.get("outcome") == outcome]

def field(row, name):
    value = row.get(name, "")
    return "" if value is None else str(value)

out = []
if mode == "stats":
    order, groups = [], {}
    for row in rows:
        rule = field(row, "rule")
        if rule not in groups:
            groups[rule] = []
            order.append(rule)
        groups[rule].append(row)
    # Count descending, and a stable order within a tie so repeated runs agree.
    for rule in sorted(order, key=lambda r: (-len(groups[r]), order.index(r))):
        members = groups[rule]
        seen, breakdown = [], []
        for row in members:
            name = field(row, "outcome")
            if name not in seen:
                seen.append(name)
        for name in seen:
            breakdown.append("%s=%d" % (name, sum(1 for r in members if field(r, "outcome") == name)))
        out.append("%s\t%d\t%s" % (rule, len(members), ", ".join(breakdown)))
elif mode == "top":
    order, counts = [], {}
    for row in rows:
        rule = field(row, "rule")
        if rule not in counts:
            counts[rule] = 0
            order.append(rule)
        counts[rule] += 1
    for rule in sorted(order, key=lambda r: (-counts[r], order.index(r))):
        out.append("%d\t%s" % (counts[rule], rule))
elif mode == "recent":
    rows.sort(key=lambda r: field(r, "ts"), reverse=True)
    if limit:
        rows = rows[:limit]
    for row in rows:
        out.append("\t".join(field(row, name) for name in ("ts", "rule", "outcome", "note")))

sys.stdout.write("".join(line + "\n" for line in out))
PYEOF
}

cmd_stats() {
  _require_ledger
  echo "── Rule ledger stats ──────────────────────────────────────"
  echo "File:          ${LEDGER_FILE}"
  echo "Total entries: $(wc -l < "$LEDGER_FILE" | tr -d ' ')"
  echo ""
  echo "Per rule (count, outcome breakdown):"
  if [[ "$HAS_JQ" -eq 1 ]]; then
    jq -sr '
      group_by(.rule) | sort_by(-length) | .[]
      | "\(.[] | .rule)\t\(length)\t\([group_by(.outcome)[] | "\(.[] | .outcome)=\(length)"] | join(", "))"
    ' "$LEDGER_FILE"
  else
    _ledger_py stats
  fi | awk -F'\t' '{printf "  %-28s %4s  %s\n", $1, $2, $3}'
}

cmd_top() {
  local n="${1:-5}"
  local outcome="${2:-}"
  if [[ ! "$n" =~ ^[1-9][0-9]*$ ]]; then
    log_error "N must be a positive integer, got: ${n}"
    exit 1
  fi
  if [[ -n "$outcome" && ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome filter: ${outcome}"
    exit 1
  fi
  _require_ledger
  echo "── Top ${n} rules by event count${outcome:+ [${outcome}]} ──────────────────────────"
  if [[ "$HAS_JQ" -eq 1 ]]; then
    jq -sr --arg outcome "$outcome" '
      map(select($outcome == "" or .outcome == $outcome))
      | group_by(.rule) | map({rule: (.[0].rule), n: length})
      | sort_by(-.n) | .[] | "\(.n)\t\(.rule)"
    ' "$LEDGER_FILE"
  else
    _ledger_py top "$outcome"
  fi | head -n "$n" | awk -F'\t' '{printf "  %4s  %s\n", $1, $2}'
}

cmd_recent() {
  local n="${1:-5}"
  local outcome="${2:-violation}"
  if [[ ! "$n" =~ ^[1-9][0-9]*$ ]]; then
    log_error "N must be a positive integer, got: ${n}"
    exit 1
  fi
  if [[ -n "$outcome" && ! "$outcome" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    log_error "Invalid outcome filter: ${outcome}"
    exit 1
  fi
  _require_ledger
  echo "── Recent ${n} ${outcome:-all} rule events ──────────────────────────"
  if [[ "$HAS_JQ" -eq 1 ]]; then
    jq -sr --arg outcome "$outcome" --argjson n "$n" '
      map(select($outcome == "" or .outcome == $outcome))
      | sort_by(.ts) | reverse | .[:$n][]
      | [.ts, .rule, .outcome, .note] | @tsv
    ' "$LEDGER_FILE"
  else
    _ledger_py recent "$outcome" "$n"
  fi | awk -F'\t' '{printf "  %s  %-24s %-12s %s\n", $1, $2, $3, $4}'
}

[[ $# -ge 1 ]] || usage
cmd="$1"; shift
case "$cmd" in
  add)   cmd_add "$@" ;;
  stats) cmd_stats "$@" ;;
  top)   cmd_top "$@" ;;
  recent) cmd_recent "$@" ;;
  *)     usage ;;
esac
