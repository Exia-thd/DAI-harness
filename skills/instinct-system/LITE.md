---
name: instinct-system
description: "Orchestrates memory retrieval and recording through the DAI memory layer: recalling past procedures and decisions, scoring execution trajectories (PES), and recording what worked and what blocked. Use when the user requests memory-bank updates, memory queries, session lesson ingestion, or automated performance evaluation score (PES) assessments."
version: 1.0.0
---

# Instinct System (LITE)

## SOLVE Step 2: GROUND (Instinct System Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| The DAI memory layer is installed and the project is indexed | `python3 scripts/lite/dai_memory.py where && test -f .memory/meta.json` | ... | run the check command and paste output |
| Memory bank structures (persona and scenario layers) are initialized | `find .dainexus/memory-bank/ -name "*.md"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Instinct System Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | Run Step 0.5 memory loops: search procedures and decisions for the task | Extract past procedures with a high PES and the decisions still in force before processing requests.
2. EVALUATE | Assess task execution trajectories and assign a Performance Evaluation Score (PES) | Verify that execution paths are rated accurately on a 0-100 scale.
3. INGEST | Record the outcome in memory | A successful trajectory is recorded as a `procedure` (the session tracker does this at session end when PES qualifies); a blocker is recorded as an `incident`, so the next session finds it before repeating it.

## Common Mistakes Checklist
- **Direct JSON Memory Overload**: Reading or writing massive unstructured JSON memory files on every step instead of searching the memory layer, causing progressive latency.
- **Not Recording Blockers**: Failing to record a failed plan or a blocker as an `incident`, so the orchestrator repeats a historical mistake it could have found.
- **Dangling Uncommitted Sessions**: Failing to trigger session checkpoints (`scripts/memory/memory-middleware.py checkpoint`) during the 10-minute idle trigger window, risking state loss during unexpected IDE disconnects.
- **Unverified PES Assessments**: Recording a trajectory as a successful procedure without verifying it meets the Performance Evaluation Score criteria.
- **Non-Compliant File Names**: Storing consolidated scenario files or architecture records under `docs/` or `.dainexus/` using CamelCase instead of lowercase kebab-case.

### Step 1: Ground the memory layer
```bash
python3 scripts/lite/dai_memory.py where
```

### Step 2: Recall a past procedure for this kind of task
```bash
python3 scripts/lite/dai_memory.py search "procedure FEATURE checkout" --limit 3
```

### Step 3: Record a blocker after a detected compilation failure
```bash
python3 scripts/lite/dai_memory.py add "Blocker: the DB connection pool exhausts under the integration suite; raise pool size before parallel runs" --category incident --importance 7
```
