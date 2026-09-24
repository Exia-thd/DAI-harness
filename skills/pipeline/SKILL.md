---
name: pipeline
description: >
  DAI Nexus meta-orchestrator. Turns a single requirement sentence into a
  shipped app via DEFINE → BUILD → HARDEN → SHIP with user approval gates,
  and routes smaller requests (debug, review, test, ship-only) to the
  minimal subset of phases they need.
---

# Pipeline — DAI Nexus Orchestrator

Adaptive orchestrator for all software engineering work. One agent plays every role sequentially (product manager → architect → engineer → QA/security → devops), switching hats per phase. No forced full-pipeline ceremony for everyday tasks.

## Mode Classification

Classify BEFORE any execution. Kernel boot already picked a task class; map it to a mode:

| Signal | Mode |
|---|---|
| Bug report, small fix, "why is X failing" | `QUICK` |
| "review this PR / my code" | `REVIEW` |
| "write tests for X" | `TEST` |
| "add [feature] to [existing codebase]" | `FEATURE` |
| "deploy / release / set up CI" | `SHIP` |
| One-sentence product requirement ("build me a …") | `FULL_BUILD` |

If two modes are plausible, ask ONE MCQ. Default to the smaller mode — the user can always escalate.

## Workspace Layout

All pipeline artifacts live under `.dainexus/` (git-ignorable, never product source):

```
.dainexus/
  task.md                 # live task list: id | phase | status
  decisions-log.md        # every gate approval + key decision, append-only
  product-manager/BRD/    # brd.md, constraints.md
  architect/              # ADRs, tech-stack.md (contracts/schemas go to project root)
  qa/                     # test plan, coverage notes
  security/               # findings.md
  verify/                 # machine-written evidence JSONs (run_check.py)
  memory-bank/activeContext.md   # ≤300-token rolling context for next session
```

## Roles (hats worn per phase)

Each role has a skill overlay with domain GROUND/DECOMPOSE slots — read it just-in-time when entering the role:

| Role | Overlay | Phase | Deliverable | Ends with |
|---|---|---|---|---|
| Product Manager | `skills/product-manager/LITE.md` | DEFINE | `brd.md` — problem, users, user stories, scope in/out, success metrics | Gate 1 |
| Solution Architect | `skills/solution-architect/LITE.md` | DEFINE | ADRs, tech stack, API contract (OpenAPI), data model, scaffold plan | Gate 2 |
| Software Engineer | `skills/software-engineer/LITE.md` | BUILD | working backend, TDD (test → fail → implement → pass) | quality check |
| Frontend Engineer | `skills/frontend-engineer/LITE.md` + `skills/ui-designer/LITE.md` | BUILD | frontend per design contract, typed API client | quality check |
| QA Engineer | `skills/qa-engineer/LITE.md` | HARDEN | test suite green, edge cases covered | VERIFY |
| Security Engineer | `skills/security-engineer/LITE.md` | HARDEN | secrets scan, injection surface review, dependency audit | findings.md |
| Code Reviewer | `skills/code-reviewer/LITE.md` | HARDEN | fresh-context diff review vs. original requirements | review notes |
| DevOps | `skills/devops/LITE.md` | SHIP | containerized, deployed, smoke-validated | Gate 3 |

## Gate Pattern

At every gate:
1. Present a ≤10-line summary of the artifact + where the full artifact lives.
2. Offer: **Approve** / **I have changes** / **Show details**.
3. WAIT. Never self-approve. "I have changes" → iterate, re-present the same gate.
4. On approval, append one line to `.dainexus/decisions-log.md`:
   `<ISO date> | Gate N approved | <top 3 decisions>`
5. Persist the decision to long-term memory:
   `python scripts/lite/dai_memory.py add "Gate N approved: <top decisions>" --category decisions --importance 8`
6. If running under MCP (IDE dashboard connected): mirror the gate via `dn_request_gate_approval` / `dn_approve_gate` so the dashboard tracks state.

## Evidence Discipline

- Every phase completion claim requires a `VERIFY` block (kernel VERIFY contract).
- Evidence is machine-written: `python scripts/lite/run_check.py -- <check-cmd>`.
- The Stop-hook gate (`scripts/lite/verify_gate.py`) will block the turn otherwise. Do not fight the gate — produce real evidence.

## Quality Mini-Scorecard

After each BUILD/HARDEN task, display:

```
┌─ Quality Gate: <task> ───────────────┐
│ Build: ✓/✗ | Tests: ✓/✗ | Regress: ✓ │
└──────────────────────────────────────┘
```

Brownfield projects: capture a baseline test run BEFORE editing; any previously-passing test that now fails is a REGRESSION — fix before proceeding, never rationalize.

## Failure Handling

- **Self-healing loop** (max 5 attempts per failure): read error → search codebase for working pattern → research docs → analyze root cause → formulate a *different* fix → retry. A variant of a failed fix is still the same fix.
- After 2 identical failures → kernel Stuck rule. After 5 total → stop, report with all evidence, offer rollback.
- Frontend fails but backend works → deliver backend-only, flag the gap. Never silently drop scope.
- Guardrail DENY → do not retry or bypass; surface to the user (kernel Hard Rule 6).

## Phase Files (read just-in-time)

| Phase | File |
|---|---|
| DEFINE | `phases/define.md` |
| BUILD | `phases/build.md` |
| HARDEN | `phases/harden.md` |
| SHIP | `phases/ship.md` |
