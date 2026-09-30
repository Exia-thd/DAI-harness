# Parallel Dispatch Protocol

> **Purpose:** Run multiple workers simultaneously on isolated git worktrees during BUILD, each bound by a task contract, merged back only through the merge arbiter. Tooling: `scripts/lite/worktree_manager.py`.

## When to Apply
- BUILD phase with ≥2 independent tasks (e.g., T3a backend ∥ T3b frontend).
- NEVER for tasks touching the same files — that is sequential work by definition.

## Lifecycle (per worker)

```bash
python scripts/lite/worktree_manager.py create <task_id>
python scripts/lite/worktree_manager.py contract <task_id> \
    --objective "..." --outputs "services/**,libs/**" --forbidden "kernel/**,api/**"
# worker operates ONLY inside .worktrees/<task_id>/, commits its work there
python scripts/lite/worktree_manager.py deliver <task_id> --summary "..."
python scripts/lite/worktree_manager.py validate <task_id>   # merge arbiter
python scripts/lite/worktree_manager.py merge <task_id>
python scripts/lite/worktree_manager.py cleanup <task_id>
```

## Task Contract (CONTRACT.json)
- `objective` — one sentence; the worker's entire scope.
- `outputs` — glob allowlist. Every committed change must match one.
- `forbidden` — glob denylist, wins over outputs (guardrail Rule 5).
- `base_commit` — recorded at contract time; diffs are measured against it.

## Merge Arbiter Rules
1. No CONTRACT.json or DELIVERY.json → REJECT (unscoped work is never merged).
2. Any changed file matching `forbidden` → REJECT.
3. Any changed file outside `outputs` → REJECT.
4. Delivery status ≠ `done` → REJECT.
5. Merge conflict → auto-abort, tree restored, report to orchestrator. Never hand-resolve inside the arbiter — resolve in the worktree, re-validate, retry.
6. Merges use `--no-ff` so each worker's contribution stays auditable.

## Constraints
- Max workers: `DAIHARNESS_MAX_WORKERS` (default 4).
- Workers share `.daiharness/memory.db` — safe because SQLite runs in WAL mode; never disable WAL.
- Orphaned worktrees are a known failure mode: `status` before dispatch, `cleanup` after merge, always.
