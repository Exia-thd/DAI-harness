#!/usr/bin/env python3
"""run_tests.py — Memory System test suite runner with aggregation."""

import subprocess
import re
import sys
from pathlib import Path

# The retrieve, suggest, hygiene, diagnostic and memory-v2 suites went with
# the stores they tested; memory is the DAI memory layer, tested in its own
# repository and through scripts/lite/dai_memory.py here.
tests = [
    ("checkpoint-extract", "bash", ["tests/memory-system/test-checkpoint-extract.sh"]),
    ("convention-indexer", "bash", ["tests/memory-system/test-convention-indexer.sh"]),
    ("memory-middleware", "bash", ["tests/memory-system/test-memory-middleware.sh"]),
]

total = 0
passed = 0
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print("  Memory System Test Suite")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

for name, cmd, args in tests:
    r = subprocess.run(
        [cmd] + args,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parent.parent.parent,
    )
    out = r.stdout + r.stderr

    if cmd == sys.executable:
        m = re.search(r"Ran (\d+) tests", out)
        a = int(m.group(1)) if m else 0
        b = a
        ok = "OK" in out
    else:
        m = re.search(r"Results: (\d+)/(\d+) passed", out)
        a = int(m.group(1)) if m else 0
        b = int(m.group(2)) if m else 0
        ok = a == b
    # A file that reported no results did not pass — it failed to run. Counting
    # 0/0 as green is how four of these suites sat dead and unnoticed.
    if b == 0:
        ok = False

    status = "✅" if ok else "⚠️"
    print(f"  {status} {name}: {a}/{b} passed")
    total += b
    passed += a

pct = 100 * passed // total if total else 0
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
print(f"  TOTAL: {passed}/{total} passed ({pct}%)")
print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
sys.exit(0 if passed == total else 1)
