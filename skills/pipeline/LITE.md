---
name: pipeline
description: "Meta-orchestrator for all software engineering work — turns one requirement sentence into a shipped app (DEFINE → BUILD → HARDEN → SHIP with user gates), and routes smaller requests (debug, review, test, ship-only) to the minimal subset of phases they need."
---

# Pipeline — LITE Overlay

One orchestrator skill, mode-based. The kernel routing table selected your mode; this overlay tells you which phases run. Full details: `skills/pipeline/SKILL.md`.

## Modes → Phases

| Mode | Phases executed | Gates |
|---|---|---|
| `QUICK` (debug/small fix) | SOLVE loop only — no pipeline ceremony | none |
| `REVIEW` | HARDEN (review checklist only, no edits) | none |
| `TEST` | HARDEN (test authoring only) | none |
| `FEATURE` | DEFINE (mini) → BUILD → HARDEN | Gate 2 optional |
| `SHIP` | SHIP only | Gate 3 |
| `FULL_BUILD` | DEFINE → BUILD → HARDEN → SHIP | Gates 1, 2, 3 |

## Invariants (all modes)

1. Every phase's claims end in `VERIFY` blocks backed by machine-written evidence:
   `python scripts/lite/run_check.py -- <check-cmd>` → `.daiharness/verify/<turn>.json`
2. The completion gate `scripts/lite/verify_gate.py` blocks the turn if evidence is missing, stale, forged, or failing.
3. Guardrail (`skills/_shared/protocols/guardrail.md`) pre-authorizes every tool call.
4. Workspace artifacts (BRD, ADRs, task list, phase logs) live under `.daiharness/` — never mixed into product source.
5. A gate = present a concise summary + the artifact, then WAIT for explicit user approval. Never self-approve a gate.

## FULL_BUILD flow (the "1 REQ → app" path)

```
User: one-sentence requirement
  ⇓ INTERPRET  — restate, classify, CLARIFY MCQs if vague
  ⇓ DEFINE     — phases/define.md  → BRD + architecture     [Gate 1: BRD] [Gate 2: architecture]
  ⇓ BUILD      — phases/build.md   → backend + frontend + containerization
  ⇓ HARDEN     — phases/harden.md  → tests + security pass + self-review
  ⇓ SHIP       — phases/ship.md    → deploy + smoke-validate [Gate 3: release]
  ⇓ AUDIT      — kernel/AUDIT.md coverage matrix
```

Read the phase file just-in-time when entering that phase — do not preload all phases.
