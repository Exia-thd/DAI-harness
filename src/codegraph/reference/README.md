# Reference graph

A frozen, tool-independent copy of the code graph that GitNexus built from this
repository, plus a differ that scores any other engine against it.

## Why this exists

DAI Nexus is dropping GitNexus: it is PolyForm Noncommercial, and this project
intends to be commercial. The replacement is planned on tree-sitter and
LadybugDB, both MIT — the same two components GitNexus itself stands on, and the
same two the earlier in-house engine (ForgeNexus, on KuzuDB) stood on before
Apple acquired Kuzu in October 2025 and archived it.

That earlier engine was deleted in `927726d2` — 166 files, 60,724 lines. Reading
what it left behind, the reason it could be deleted so easily is the part worth
learning from: its evaluation dataset cited files like `auth/jwt.ts` and
`db/schema.ts` that existed nowhere in the tree, and its evaluator defaulted to
`--mock`. It scored 0/30, and that score meant nothing. **Nobody could say
whether the graph it built was right**, so there was nothing to defend.

This directory is the answer to that. Before removing GitNexus we take its
output and keep it, because it is the only ground truth available for whether a
new resolver produces the right graph — built by a different implementation,
from this exact tree.

## What is here

| File | Purpose |
|---|---|
| `extract.mjs` | Reads a LadybugDB index read-only, writes neutral JSONL |
| `compare.mjs` | Multiset diff of two snapshots, grouped by node label / edge kind |
| `snapshot/` | The frozen reference: `nodes.jsonl`, `edges.jsonl`, `manifest.json` |

The snapshot carries identity and location only — never `content` or
`description`, which hold source text already in git.

`manifest.json` records provenance. **A reference graph is only meaningful
against the tree it saw**: this one is `d897e0c3`, indexed 2026-08-14 over 1,574
files. Compare against a different tree and the diff measures the commit range,
not the engine.

## Using it

```bash
cd src/codegraph/reference && npm install     # @ladybugdb/core, MIT
node extract.mjs ../../../.gitnexus/lbug snapshot
node compare.mjs snapshot <engine-output-dir> --kind CALLS --limit 20
```

An engine becomes measurable by emitting the same JSONL shape. It does not have
to be finished, or fast.

## What the reference contains

24,069 nodes and 33,375 edge records (32,426 distinct triples; the repeats are
multiple call sites, which `CodeRelation` cannot otherwise distinguish because
it carries no line column).

The edge mix is the useful part for planning, because it shows where the work
actually is:

| Edges | Count | Source |
|---|---|---|
| `CONTAINS`, `DEFINES`, `MEMBER_OF`, `HAS_METHOD`, `HAS_PROPERTY` | ~25,800 | single-file AST + directory walk |
| `STEP_IN_PROCESS`, `ENTRY_POINT_OF` | ~1,300 | BFS over a graph that already exists |
| **`CALLS`, `IMPORTS`, part of `ACCESSES`** | **~6,000** | **cross-file resolution — the expensive 18%** |
| `IMPLEMENTS`, `EXTENDS`, `METHOD_OVERRIDES`, … | ~50 | type hierarchy |

Roughly 78% of the graph is reachable from per-file parsing. The hard part is
bounded, and — because of this directory — independently measurable.

## Self-test

`compare.mjs snapshot snapshot` must report 100% and exit 0. Stripping every
`CALLS` edge from a copy must report exactly 4,289 missing under `CALLS` and
exit 1. A measuring stick that cannot fail is not measuring.
