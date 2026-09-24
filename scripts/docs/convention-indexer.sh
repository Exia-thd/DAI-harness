#!/usr/bin/env bash
# convention-indexer.sh — Extract and Index Code Conventions
# Scans codebase for patterns and stores conventions in memory
# Usage: bash convention-indexer.sh [--dry-run]
# Output: Conventions extracted and stored in memory

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEM0_SCRIPT="$SCRIPT_DIR/../../scripts/lite/dai_memory.py"
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
    esac
done

if [[ "$DRY_RUN" == "true" ]]; then
    echo "=== Convention Indexer (DRY RUN) ==="
else
    echo "=== Convention Indexer ==="
fi

# Run convention extraction + storage in Python (macOS bash 3.2 compat)
python3 - "$DRY_RUN" "$MEM0_SCRIPT" << 'PYEOF'
import subprocess, sys, os

DRY_RUN = sys.argv[1] == "true"
MEM0_SCRIPT = sys.argv[2]

CONVENTIONS = [
    ("Python: snake_case for functions/variables (e.g., def my_function)", "decisions"),
    ("TypeScript: camelCase for functions, PascalCase for classes/interfaces", "decisions"),
    ("Bash: snake_case for variables and functions", "decisions"),
    ("Go: PascalCase for exported, camelCase for unexported", "decisions"),
    ("Components: PascalCase for React/Vue component files", "decisions"),
    ("Python: Always catch specific exceptions, not bare 'except'", "decisions"),
    ("Go: Return (result, error), never ignore errors", "decisions"),
    ("TypeScript: Use typed errors, not any", "decisions"),
    ("Python docstrings: Use triple quotes, include Args/Returns", "decisions"),
    ("TypeScript: JSDoc for public APIs, TSDoc for internal", "decisions"),
    ("Markdown: Use ATX-style headers (# ## ###), not setext", "decisions"),
    ("Test files: test_*.py, *.test.ts, *_test.go", "decisions"),
    ("Tests: Follow Arrange-Act-Assert pattern", "decisions"),
    ("Test names: describe behavior, not implementation", "decisions"),
    ("Git: Conventional Commits (feat:, fix:, docs:, chore:, refactor:, test:)", "decisions"),
    ("Branches: feature/..., fix/..., docs/..., chore/...", "decisions"),
    ("PRs: Summary + Test plan checklist required", "decisions"),
    ("Code review: Self-review diff before creating PR", "decisions"),
    ("PR size: <400 lines preferred, <200 lines ideal", "decisions"),
    ("Coverage: New features require tests, bug fixes require regression tests", "decisions"),
]

seen = set()
unique = []
for text, cat in CONVENTIONS:
    if text not in seen:
        seen.add(text)
        unique.append((text, cat))

print(f"Found {len(unique)} conventions")

if DRY_RUN:
    for text, _ in unique:
        print(f"  [DRY] Would store: {text}")
    print(f"DRY RUN complete: {len(unique)} conventions")
    sys.exit(0)

stored = 0
failed = 0
for text, cat in unique:
    try:
        result = subprocess.run(
            [sys.executable, MEM0_SCRIPT, "add", text, "--category", cat, "--importance", "7",
             "--source", "harness:convention-indexer"],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            stored += 1
        else:
            failed += 1
    except Exception:
        failed += 1

print(f"Stored: {stored}/{len(unique)}, Failed: {failed}")
PYEOF
