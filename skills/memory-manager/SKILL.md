---
name: memory-manager
description: >
  Project memory through the DAI memory layer: record why a decision was made,
  retrieve it when the reasoning is needed, and reach it from the code it is
  about. Replaces the SQLite, ChromaDB and GraphRAG stacks this project used
  before 2026-09-21.
version: 3.0.0
author: dai-nexus
tags: [memory, decisions, retrieval, code-graph, context]
---

# Memory manager

> **Identity:** the long-term memory for agents on this project. A decision
> that is not recorded is re-derived — badly — the next time the context
> resets.

## The two rules

| Rule | Why |
|---|---|
| **Record after the work, not during** | What matters is the decision and the reason for it, which only exist once the work is done. |
| **Ask before starting** | The answer may already be recorded. `why` on the file you are about to change costs one call. |

Nothing here stores secrets. The layer redacts what looks like a credential
before it is written, and a store is never committed.

## How to use it

The MCP server exposes these; the same things exist as CLI commands.

### Recording

```
dn_memory_add({ text: "...", category: "decision", importance: 8 })
```

Categories map onto the layer's three layers: `decision`, `convention`,
`constraint` and `architecture` are **semantic** (true until superseded);
`error`, `incident`, `bug` and `session` are **episodic** (something that
happened); `procedure` and `howto` are **procedural**. Anything else is a
fact, which is semantic too.

Write the reason, not the change. "Capped declined-card retries at two because
the processor counts attempts, not elapsed time" is memory. "Changed retry
logic" is a commit message.

### Retrieving

```
dn_memory_search({ query: "why do we retry declined cards", limit: 5 })
dai_memory_why({ target: "src/billing/retry.ts" })
dai_memory_context({ target: "chargeCard" })
```

`search` fuses three branches — keyword, semantic, recency — and reports which
of them found what, so an answer that came from one branch alone can be told
from one three branches agreed on. `why` answers for a file or a symbol.
`context` carries the memory anchored to a declaration alongside its callers
and callees: that is how a recorded decision is found from the code that
depends on it.

### Checking before a commit

```
dai_memory_changes({ scope: "staged" })
```

What memory already records about the files you are about to commit —
including decisions reached through the call graph rather than only those
anchored to the file itself.

### What is settled, and what contradicts

```
dai_memory_constraints()   the decisions in force, most important first
dai_memory_conflicts()     recorded decisions that disagree with each other
```

`conflicts` is a question for a person. The layer will not pick a winner.

## Where it lives

```
<project>/.memory/            the store: index, recorded memory, viewer
<install dir>/                the engine, outside the repository
```

`python scripts/lite/dai_memory.py where` prints the install directory, and
`install` creates it. The store is gitignored: everything a scan produced can
be rebuilt by `dai-memory init`, and what people recorded is migrated rather
than re-derived.

## What was retired on 2026-09-21

| Retired | Replaced by |
|---|---|
| `scripts/lite/memory.py` (SQLite + FTS5) | the layer's store; its rows were migrated by `scripts/lite/migrate-memory.py` |
| `scripts/memory/local_memory.py` (ChromaDB + torch) | the layer's own embedder, one 130 MB model, no Python ML stack |
| `antigravity/src/memory/graph*.py` (GraphRAG) | the layer's memory graph and clustering |

The migration is idempotent: ids are derived from the legacy row, so running
it twice adds nothing. It skips archived rows and rows a scan produced, and
says how many of each it left behind.
