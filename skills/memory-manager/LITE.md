---
name: memory-manager
description: "Records why decisions were made and retrieves them when an agent meets unfamiliar code, through the DAI memory layer. Use when the user asks for memory retrieval, session recovery, or what a project already decided."
version: 2.0.0
---

# Memory Manager (LITE)

## SOLVE Step 2: GROUND (Memory Manager Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| The memory layer is installed and the project is indexed | `python scripts/lite/dai_memory.py where` then `dai-memory status` | ... | run the check command and paste output |
| The index was built from the current commit | `dai-memory status` — it names the commit and says when the working tree has moved past it | ... | paste the `indexed at` line |
| Memory files the project keeps by hand are present | `find .dainexus/ -maxdepth 2 -name "lessons.md" -o -name "memory-bank"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Memory Manager Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. RETRIEVE | `dn_memory_search` with the request's keywords before starting work | Recent decisions and incidents are in context before the first edit.
2. ANCHOR | `dai_memory_why` on each file about to change | The reasoning behind unfamiliar code is read rather than re-derived.
3. RECORD | `dn_memory_add` once the work is done, with the reason, not the diff | The decision is retrievable next session; `dai_memory_changes --scope staged` shows it against the files being committed.

## Common Mistakes Checklist
- **Starting without asking**: editing code whose reason is already recorded, then re-deriving it badly.
- **Recording the change instead of the reason**: "changed retry logic" is a commit message; "capped retries at two because the processor counts attempts" is memory.
- **Reading an empty answer as "nothing to know"**: the layer distinguishes *nothing found* from *could not look*. An error means the engine is not installed or the store is missing — fix that rather than proceeding.
- **Trusting a stale index**: `status` says when the graph is older than the working tree. Anything that depends on line numbers says so too.

### Step 1: Ground the memory layer
```bash
python scripts/lite/dai_memory.py where
dai-memory status
```

### Step 2: Retrieve what is already known
```bash
dai-memory search "<the words of the problem>" --limit 5
dai-memory why <file or symbol>
```

### Step 3: Record the reasoning, and check it against the change
```bash
dai-memory write --layer semantic --title "<the decision>" --body "<why>" --source-ref <file>#L1-L20
dai-memory changes --scope staged
```
