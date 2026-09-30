# BUILD Phase

Engineer hat. Default sequential: backend → frontend → containerization.

**Parallel mode** (optional, for ≥2 independent tasks): dispatch T3a/T3b as isolated worktree workers per `skills/_shared/protocols/parallel-dispatch.md` (`scripts/lite/worktree_manager.py`: create → contract → deliver → validate → merge). T4 always runs after the merge, sequentially.

## Pre-Flight
- Read `api/openapi.yaml`, `schemas/`, ADRs in `.daiharness/architect/`. The contract is law — code conforms to the contract, not vice versa. Contract change needed → go back through Gate 2.
- Brownfield: run the existing test suite FIRST and save the baseline:
  `python scripts/lite/run_check.py --turn baseline -- <test-cmd>`

## T3a: Backend

Read `skills/software-engineer/LITE.md` (domain slots). Update `.daiharness/task.md`: T3a → in_progress.

- Follow the kernel SOLVE loop per endpoint/module: DECOMPOSE into plan items with CHECK commands, execute one at a time.
- **TDD enforced**: write test → watch it fail → implement → watch it pass → refactor. No implementation before its failing test exists.
- Write services to project root (per scaffold plan). Workspace notes to `.daiharness/`.
- CHECK after each item; evidence for phase completion:
  `python scripts/lite/run_check.py -- <build+test command>`

Update `.daiharness/task.md`: T3a → completed.

## T3b: Frontend (skip if backend-only per BRD)

Read `skills/frontend-engineer/LITE.md` + `skills/ui-designer/LITE.md` (domain slots). Update `.daiharness/task.md`: T3b → in_progress.

- Consume the API contract — generate/write a typed client from `api/openapi.yaml`, never hand-guess response shapes.
- Kernel SOLVE §3.D **UI Design Gate** applies: produce the design contract (tokens, states, responsive matrix, a11y) before implementing screens.
- Component states are part of done: default, hover, focus, disabled, loading, empty, error.
- VERIFY uses Template 2 (UI/Visual) — build success alone does not prove responsiveness.

Update `.daiharness/task.md`: T3b → completed.

## T4: Containerization

Read `skills/devops/LITE.md` (domain slots). Update `.daiharness/task.md`: T4 → in_progress.

- Dockerfile per service + `docker-compose.yml` at project root.
- Evidence: `python scripts/lite/run_check.py -- docker compose up -d --build` then a health-check command. Tear down after.

Update `.daiharness/task.md`: T4 → completed.

## Quality Gate (after EACH task)
1. Build passes, tests pass (script-produced evidence, not self-attested).
2. Brownfield: re-run baseline suite — any previously-passing test now failing = REGRESSION → fix before proceeding.
3. Display the mini-scorecard (SKILL.md).

## Completion
1. Full stack starts (`docker compose up` evidence).
2. One `VERIFY` block per changed behavior.
3. Update `.daiharness/memory-bank/activeContext.md` (≤300 tokens).
4. Read `phases/harden.md` and begin HARDEN.

## Failure Handling
- Self-healing loop, max 5 attempts (SKILL.md § Failure Handling). After 2 identical failures → kernel Stuck rule.
- Frontend fails but backend works → continue backend-only, flag the gap at the next gate.
