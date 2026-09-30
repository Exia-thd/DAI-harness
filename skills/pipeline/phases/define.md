# DEFINE Phase

Two hats, sequential: Product Manager → Solution Architect. Two gates.

## T1: Product Manager — BRD

Read `skills/product-manager/LITE.md` (domain slots). Update `.daiharness/task.md`: T1 → in_progress.

1. **Interview the user** (skip questions already answered by the request): problem, target users, top 3 user stories, must-have vs nice-to-have, constraints (budget, stack, deadline), success metric.
   - FEATURE mode: compress to a "mini-BRD" — 1 paragraph problem + user stories + scope in/out. No interview if the request is specific.
2. **Research the domain** if unfamiliar (web search) — note findings, cite sources.
3. Write `.daiharness/product-manager/BRD/brd.md`:
   - Problem statement · Users/personas · User stories (numbered — these become AUDIT matrix rows) · Scope IN / Scope OUT · Non-functional requirements · Success metrics · Open questions
4. Write `constraints.md` (stack, budget, deadline, compliance).

Update `.daiharness/task.md`: T1 → completed.

### Gate 1 — BRD Approval
Present the gate pattern (SKILL.md § Gate Pattern). On approval → T2. FEATURE mode: Gate 1 may collapse into a one-paragraph confirmation.

## T2: Solution Architect — Architecture

Read `skills/solution-architect/LITE.md` (domain slots). Update `.daiharness/task.md`: T2 → in_progress.

1. Read the approved BRD. Every architecture decision must trace to a BRD requirement.
2. Decide and record as ADRs in `.daiharness/architect/` (one file per decision, ≤1 page: Context / Decision / Consequences): tech stack, monolith vs services, data store, auth mechanism (use CLARIFY MCQ 4 if unspecified — never default silently).
3. Design contracts at **project root** (product source, not workspace):
   - `api/openapi.yaml` — API contract (OpenAPI 3.1)
   - `schemas/` — data model / ERD / migrations
4. Write the scaffold plan: directory tree + one-line purpose per directory.
5. GROUND sweep (kernel SOLVE §2): verify chosen framework versions actually exist (`npm view <pkg> version` / registry check). No invented versions — Hard Rule 3.

Update `.daiharness/task.md`: T2 → completed.

### Gate 2 — Architecture Approval
Present the gate pattern. On approval → handoff.

## Handoff to BUILD
1. Evidence check: `python scripts/lite/run_check.py -- ls api schemas` (contracts exist).
2. Log decisions to `.daiharness/decisions-log.md`.
3. Read `phases/build.md` and begin BUILD.

## Failure Handling
- Cannot gather enough requirements after MCQs → present what is known + what is missing, wait for user.
- Architect finds contradictions in BRD → flag to user; never silently resolve.
