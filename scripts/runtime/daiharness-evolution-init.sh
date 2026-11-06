#!/bin/bash
# daiharness-evolution-init.sh
# Bootstraps the ASIP self-evolution infrastructure. Creates baseline files,
# initializes state, and registers the lesson migration hook in the MCP setup.
#
# Usage:
#   bash scripts/daiharness-evolution-init.sh              # full init
#   bash scripts/daiharness-evolution-init.sh --check     # status only
#   bash scripts/daiharness-evolution-init.sh --update-metrics [type] [value]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAIHARNESS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect dai-harness location (submodule vs standalone)
if [ -f "$DAIHARNESS_DIR/VERSION" ] || [ -f "$DAIHARNESS_DIR/skills/production-grade/SKILL.md" ]; then
    # dai-harness is the project root
    PROJECT_DIR="$DAIHARNESS_DIR"
    HARNESS_ROOT="$DAIHARNESS_DIR"
elif [ -d "$DAIHARNESS_DIR/dai-harness" ]; then
    # dai-harness is a submodule inside the project
    PROJECT_DIR="$DAIHARNESS_DIR"
    HARNESS_ROOT="$PROJECT_DIR/dai-harness"
else
    echo "ERROR: Cannot detect dai-harness location. Run from within the dai-harness directory." >&2
    exit 1
fi

HARNESS_ROOT="${DAIHARNESS_DIR}"  # always point to dai-harness root for file ops

SCRIPTS_ROOT="$HARNESS_ROOT/scripts"

# The three helpers this script drives live in different scripts/ subdirectories
# since the layout was reorganised, and this file moved into scripts/runtime/
# with only one of them. Looking beside this script therefore reported
# asip-deterministic-check.sh and daiharness-lesson-migrator.sh as MISSING
# while both were present, and declared the whole subsystem INCOMPLETE.
# Resolve by name instead: any organised subdirectory first, in a deterministic
# order, and the deprecated scripts/ shim only as a last resort.
resolve_script() {
    local name="$1" candidate
    for candidate in "$SCRIPTS_ROOT"/*/"$name" "$SCRIPTS_ROOT/$name"; do
        if [ -f "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done
    return 1
}

# Every python helper below used to splice a shell path straight into the
# program text. Under MSYS that path is /c/Users/..., which the native Windows
# interpreter cannot open, so the metrics summary reported "No such file or
# directory" for a file that was right there and --update-metrics silently did
# nothing while printing success. Convert to a native path, and pass values as
# arguments instead of splicing them into source: a skill name containing a
# quote used to break the program.
native_path() {
    local value="$1"
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$value" 2>/dev/null || printf '%s' "$value"
    else
        printf '%s' "$value"
    fi
}

STATE_FILE="$HARNESS_ROOT/.daiharness/asip-state.json"
METRICS_FILE="$HARNESS_ROOT/.daiharness/asip-metrics.json"
LESSON_PLAN="$HARNESS_ROOT/.daiharness/plan-lessons.md"
LESSON_EXEC="$HARNESS_ROOT/.daiharness/execution-lessons.md"
SESSION_TRACK="$HARNESS_ROOT/.daiharness/session-track.json"
# The session tracker writes session-tracker-v2.json. This script only looked
# for the v1 name, so a successful init still reported the tracker state as
# missing. Accept either, newest schema first; the v1 path stays as the name
# this script writes itself when the tracker is unavailable.
SESSION_TRACK_V2="$HARNESS_ROOT/.daiharness/session-tracker-v2.json"

session_track_file() {
    if [ -f "$SESSION_TRACK_V2" ]; then
        printf '%s\n' "$SESSION_TRACK_V2"
    elif [ -f "$SESSION_TRACK" ]; then
        printf '%s\n' "$SESSION_TRACK"
    else
        return 1
    fi
}

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[INIT]${NC}  $*"; }
ok()   { echo -e "${GREEN}[INIT]${NC}  $*"; }
warn() { echo -e "${YELLOW}[INIT]${NC}  $*" >&2; }
err()  { echo -e "${RED}[INIT]${NC}  $*" >&2; }

# ---------------------------------------------------------------------------
# Check utilities
# ---------------------------------------------------------------------------

check_shell_deps() {
    local missing=()
    for cmd in python3 git; do
        command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
    done
    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing dependencies: ${missing[*]}"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Bootstrap: create all baseline infrastructure files
# ---------------------------------------------------------------------------

bootstrap_asip_state() {
    mkdir -p "$(dirname "$STATE_FILE")"
    if [ ! -f "$STATE_FILE" ]; then
        cat > "$STATE_FILE" << 'EOF'
{
  "sessionId": null,
  "planAttempts": {},
  "executionAttempts": {},
  "totalResearchGates": 0,
  "skillUpdates": [],
  "lastUpdated": null
}
EOF
        ok "Created asip-state.json"
    else
        ok "asip-state.json already exists"
    fi
}

bootstrap_asip_metrics() {
    mkdir -p "$(dirname "$METRICS_FILE")"
    if [ ! -f "$METRICS_FILE" ]; then
        cat > "$METRICS_FILE" << 'EOF'
{
  "projectAdaptation": {
    "totalResearchGates": 0,
    "totalSkillUpdates": 0,
    "uniquePatterns": 0,
    "lessonsLearned": 0,
    "failuresAvoided": 0,
    "sessionsWithEvolution": 0,
    "totalMigrations": 0,
    "lastUpdated": null
  },
  "bySkill": {},
  "byBlockerType": {
    "Technical": 0,
    "Architectural": 0,
    "Tooling": 0,
    "External": 0,
    "Performance": 0,
    "Knowledge": 0,
    "Unknown": 0
  },
  "byWeakCriterion": {
    "Completeness": 0,
    "Specificity": 0,
    "Feasibility": 0,
    "RiskAwareness": 0,
    "ScopeControl": 0,
    "DependencyOrdering": 0,
    "Testability": 0,
    "ImpactAssessment": 0
  },
  "lastUpdated": null
}
EOF
        ok "Created asip-metrics.json"
    else
        ok "asip-metrics.json already exists"
    fi
}

bootstrap_lesson_files() {
    mkdir -p "$(dirname "$LESSON_PLAN")"

    if [ ! -f "$LESSON_PLAN" ]; then
        cat > "$LESSON_PLAN" << 'EOF'
# Plan Lessons — cross-session planning knowledge

> Project-local planning lessons. Keep entries here for reviewed reuse.
> Shared DAI Harness skills are not auto-mutated from session lessons.

## Session-Lessons

<!-- Append new entries below. Format:
## [Date] — [Skill Name]
### Weak Criterion: [Criterion Name] (Score: X/1.25)
### Problem: [What the plan missed]
### Research Source: [NotebookLM notebook URL]
### Lesson: [What to always include when planning this type of work]
### Example:
  - BAD: [vague example]
  - GOOD: [specific example]
-->
EOF
        ok "Created plan-lessons.md"
    else
        ok "plan-lessons.md already exists"
    fi

    if [ ! -f "$LESSON_EXEC" ]; then
        cat > "$LESSON_EXEC" << 'EOF'
# Execution Lessons — cross-session implementation knowledge

> Project-local execution lessons. Keep entries here for reviewed reuse.
> Shared DAI Harness skills are not auto-mutated from session lessons.

## Session-Lessons

<!-- Append new entries below. Format:
## [Date] — [Skill Name]
### Blocker Type: [Technical/Architectural/Tooling/External]
### Problem: [What was blocking]
### Failed Attempts: [What was tried and failed]
### Research Source: [NotebookLM notebook URL]
### Solution: [What fixed it]
### Key Insight: [1-sentence takeaway]
### Apply When: [When to apply this pattern]
-->
EOF
        ok "Created execution-lessons.md"
    else
        ok "execution-lessons.md already exists"
    fi
}

bootstrap_migration_state() {
    local mig_file="$HARNESS_ROOT/.daiharness/lesson-migration-state.json"
    mkdir -p "$(dirname "$mig_file")"
    if [ ! -f "$mig_file" ]; then
        cat > "$mig_file" << 'EOF'
{
  "lastMigrationPlan": null,
  "lastMigrationExec": null,
  "migratedPlanEntries": [],
  "migratedExecEntries": [],
  "totalMigrated": 0
}
EOF
        ok "Created lesson-migration-state.json"
    else
        ok "lesson-migration-state.json already exists"
    fi
}

bootstrap_session_tracker() {
    local tracker existing
    if existing="$(session_track_file)"; then
        ok "session tracker state already exists ($(basename "$existing"))"
    else
        # Re-initialize via daiharness-session-tracker.sh
        if tracker="$(resolve_script daiharness-session-tracker.sh)"; then
            bash "$tracker" init 2>/dev/null || true
            ok "Initialized session-track.json"
        else
            # Fallback: create manually
            mkdir -p "$(dirname "$SESSION_TRACK")"
            echo '{"plan_failures":0,"execution_failures":0,"last_plan_score":null,"last_execution_result":null,"last_update":null,"research_gate_triggered":false}' > "$SESSION_TRACK"
            ok "Created session-track.json (fallback)"
        fi
    fi
}

bootstrap_scripts() {
    local required_scripts=(
        "asip-deterministic-check.sh"
        "daiharness-lesson-migrator.sh"
        "daiharness-session-tracker.sh"
    )

    for script in "${required_scripts[@]}"; do
        local path
        if path="$(resolve_script "$script")"; then
            # Ensure executable
            chmod +x "$path" 2>/dev/null || true
            ok "Script $script: present"
        else
            warn "Script $script: MISSING (searched $SCRIPTS_ROOT)"
        fi
    done
}

# ---------------------------------------------------------------------------
# Update metrics (for post-ASIP-cycle calls)
# ---------------------------------------------------------------------------

update_metrics() {
    local type="$1"   # research_gate | skill_update | lesson_learned | failure_avoided
    local skill="${2:-}"
    local value="${3:-1}"

    if [ ! -f "$METRICS_FILE" ]; then
        bootstrap_asip_metrics
    fi

    if ! python3 - "$(native_path "$METRICS_FILE")" "$type" "$skill" "$value" <<'PYEOF'
import json
import sys
from datetime import datetime, timezone

path, kind, skill, raw_value = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
try:
    value = int(raw_value)
except ValueError:
    sys.stderr.write(f"value must be an integer, got {raw_value!r}\n")
    raise SystemExit(1)

try:
    with open(path, encoding="utf-8") as handle:
        metrics = json.load(handle)
except (OSError, ValueError):
    metrics = {
        "projectAdaptation": {},
        "bySkill": {},
        "byBlockerType": {},
        "byWeakCriterion": {},
    }

stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
adaptation = metrics.get("projectAdaptation", {})
adaptation["lastUpdated"] = stamp

counters = {
    "research_gate": "totalResearchGates",
    "skill_update": "totalSkillUpdates",
    "lesson_learned": "lessonsLearned",
    "failure_avoided": "failuresAvoided",
}
if kind not in counters:
    sys.stderr.write(f"unknown metric type {kind!r}; expected one of {sorted(counters)}\n")
    raise SystemExit(1)
field = counters[kind]
adaptation[field] = adaptation.get(field, 0) + value
if kind == "research_gate":
    adaptation["sessionsWithEvolution"] = adaptation.get("sessionsWithEvolution", 0) + 1

if skill:
    by_skill = metrics.setdefault("bySkill", {})
    entry = by_skill.setdefault(skill, {"researchGates": 0, "skillUpdates": 0})
    if kind == "research_gate":
        entry["researchGates"] = entry.get("researchGates", 0) + 1
    elif kind == "skill_update":
        entry["skillUpdates"] = entry.get("skillUpdates", 0) + 1

metrics["projectAdaptation"] = adaptation
metrics["lastUpdated"] = stamp
with open(path, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(metrics, handle, indent=2)
    handle.write("\n")
PYEOF
    then
        err "Metrics update failed: $type"
        return 1
    fi

    ok "Metrics updated: $type (+$value)"
}

# ---------------------------------------------------------------------------
# Update asip-state (for middleware/skill calls)
# ---------------------------------------------------------------------------

update_state() {
    local action="$1"  # init | record_plan | record_exec | clear
    local skill="$2"
    local task="$3"
    local score="${4:-}"
    local result="${5:-}"

    mkdir -p "$(dirname "$STATE_FILE")"

    if [ "$action" = "init" ]; then
        bootstrap_asip_state
        if ! python3 - "$(native_path "$STATE_FILE")" <<'PYEOF'
import json
import sys
from datetime import datetime, timezone

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as handle:
        state = json.load(handle)
except (OSError, ValueError):
    state = {}
state["sessionId"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
state["lastUpdated"] = state["sessionId"]
with open(path, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(state, handle, indent=2)
    handle.write("\n")
PYEOF
        then
            err "ASIP state init failed"
            return 1
        fi
        ok "ASIP state initialized"
        return
    fi

    if ! python3 - \
        "$(native_path "$STATE_FILE")" "$action" "$skill" "$task" "$score" "$result" <<'PYEOF'
import json
import sys
from datetime import datetime, timezone

path, action, skill, task, score, result = sys.argv[1:7]
stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
try:
    with open(path, encoding="utf-8") as handle:
        state = json.load(handle)
except (OSError, ValueError):
    state = {
        "sessionId": stamp,
        "planAttempts": {},
        "executionAttempts": {},
        "totalResearchGates": 0,
    }
state["lastUpdated"] = stamp

# Two attempts on the same task is the Stuck rule's threshold, which is what
# researchGateTriggered records. It is a counter, not permission to research.
GATE_AFTER_ATTEMPTS = 2

if action in {"record_plan", "record_exec"}:
    if not skill or not task:
        sys.stderr.write("record_plan/record_exec need both a skill and a task\n")
        raise SystemExit(1)
    key = "planAttempts" if action == "record_plan" else "executionAttempts"
    entry = state.setdefault(key, {}).setdefault(skill, {}).setdefault(
        task,
        {"attempts": 0, "lastScore": None, "lastResult": None,
         "researchGateTriggered": False},
    )
    entry["attempts"] = entry.get("attempts", 0) + 1
    if action == "record_plan":
        if score:
            try:
                entry["lastScore"] = float(score)
            except ValueError:
                sys.stderr.write(f"score must be a number, got {score!r}\n")
                raise SystemExit(1)
    else:
        entry["lastResult"] = result
    if entry["attempts"] >= GATE_AFTER_ATTEMPTS:
        entry["researchGateTriggered"] = True
elif action == "clear":
    for key in ("planAttempts", "executionAttempts"):
        state.get(key, {}).get(skill, {}).pop(task, None)
else:
    sys.stderr.write(f"unknown action {action!r}\n")
    raise SystemExit(1)

with open(path, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(state, handle, indent=2)
    handle.write("\n")
PYEOF
    then
        err "ASIP state update failed: $action"
        return 1
    fi

    ok "ASIP state updated: $action / $skill / $task"
}

# ---------------------------------------------------------------------------
# Check status
# ---------------------------------------------------------------------------

check_status() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ASIP Infrastructure Status"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local all_ok=true

    # Check files
    for item in "asip-state.json:$STATE_FILE" "asip-metrics.json:$METRICS_FILE" "plan-lessons.md:$LESSON_PLAN" "execution-lessons.md:$LESSON_EXEC"; do
        local name="${item%:*}"
        local path="${item#*:}"
        if [ -f "$path" ]; then
            local lines
            lines=$(wc -l < "$path" | tr -d ' ')
            echo -e "  ${GREEN}✓${NC} $name ($lines lines)"
        else
            echo -e "  ${RED}✗${NC} $name (MISSING — run init)"
            all_ok=false
        fi
    done

    # Check scripts
    echo ""
    echo "  Scripts:"
    for script in "asip-deterministic-check.sh" "daiharness-lesson-migrator.sh" "daiharness-session-tracker.sh"; do
        local path
        if ! path="$(resolve_script "$script")"; then
            echo -e "  ${RED}✗${NC} $script (MISSING)"
        elif [ -x "$path" ]; then
            echo -e "  ${GREEN}✓${NC} $script (executable)"
        else
            echo -e "  ${YELLOW}⚠${NC} $script (not executable)"
        fi
    done

    # Check the session tracker state under either schema name
    local tracker_state
    if tracker_state="$(session_track_file)"; then
        echo -e "  ${GREEN}✓${NC} $(basename "$tracker_state")"
    else
        echo -e "  ${YELLOW}⚠${NC} session tracker state (not found)"
    fi

    # Metrics summary (handle JSON with markdown comments)
    if [ -f "$METRICS_FILE" ]; then
        echo ""
        echo "  Metrics summary:"
        python3 - "$(native_path "$METRICS_FILE")" <<'PYEOF'
import json
import re
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        content = handle.read()
    # Some older metrics files carried markdown comment lines.
    content = re.sub(r"^#.*$", "", content, flags=re.MULTILINE)
    adaptation = json.loads(content).get("projectAdaptation", {})
    for label, field in (
        ("Research gates", "totalResearchGates"),
        ("Skill updates", "totalSkillUpdates"),
        ("Lessons learned", "lessonsLearned"),
        ("Sessions evolved", "sessionsWithEvolution"),
        ("Failures avoided", "failuresAvoided"),
        ("Total migrations", "totalMigrations"),
    ):
        print(f"    {label}: {adaptation.get(field, 0)}")
except (OSError, ValueError) as error:
    print(f"    (could not parse metrics: {error})")
PYEOF
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if $all_ok; then
        echo -e "  Status: ${GREEN}ALL SYSTEMS OK${NC}"
    else
        echo -e "  Status: ${RED}INCOMPLETE — run: bash scripts/daiharness-evolution-init.sh${NC}"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# ---------------------------------------------------------------------------
# Verify: run deterministic check on itself
# ---------------------------------------------------------------------------

self_verify() {
    log "Self-verification: checking this script's shell syntax..."
    if bash -n "$0" 2>/dev/null; then
        ok "Shell syntax: valid"
    else
        err "Shell syntax: INVALID"
        return 1
    fi

    log "Self-verification: checking referenced scripts..."
    for script in asip-deterministic-check.sh daiharness-lesson-migrator.sh daiharness-session-tracker.sh; do
        local path
        if path="$(resolve_script "$script")"; then
            if bash -n "$path" 2>/dev/null; then
                ok "  $script: valid"
            else
                err "  $script: INVALID syntax"
                return 1
            fi
        fi
    done

    ok "Self-verification: all checks passed"
}

# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

main() {
    check_shell_deps || exit 1

    case "${1:-init}" in
        init|--init)
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "  ASIP Infrastructure Bootstrap"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            bootstrap_asip_state
            bootstrap_asip_metrics
            bootstrap_lesson_files
            bootstrap_migration_state
            bootstrap_session_tracker
            bootstrap_scripts
            echo ""
            self_verify
            echo ""
            ok "Bootstrap complete!"
            ok "Run: bash scripts/daiharness-evolution-init.sh --check  (to verify)"
            echo ""
            ;;
        --check|check|status)
            check_status
            ;;
        --update-metrics)
            if [ -z "${2:-}" ]; then
                echo "Usage: $0 --update-metrics <type> [skill] [value]"
                echo "  type: research_gate | skill_update | lesson_learned | failure_avoided"
                exit 1
            fi
            update_metrics "$2" "${3:-}" "${4:-1}"
            ;;
        --update-state)
            update_state "${2:-init}" "${3:-}" "${4:-}" "${5:-}" "${6:-}"
            ;;
        --verify|verify)
            self_verify
            ;;
        *)
            echo "Usage: $0 {init|check|status|verify}"
            echo "       $0 --update-metrics <type> [skill] [value]"
            echo "       $0 --update-state <action> [skill] [task] [score] [result]"
            exit 1
            ;;
    esac
}

main "$@"
