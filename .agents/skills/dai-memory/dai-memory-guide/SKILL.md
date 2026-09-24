---
name: dai-memory-guide
description: "Reference for the DAI memory layer: every MCP tool, every resource, the graph schema, and what each answer does not claim. Use when choosing a tool, reading an answer, or writing a query."
---

# The memory layer: tools, resources, and what they do not claim

The layer records **why** — decisions, incidents, constraints — and indexes
what each file declares and what those declarations do to each other. The code
graph exists so a recorded decision can be found from the code that depends on
it.

## Tools

### Memory

| Tool | Answers |
|---|---|
| `dai_memory_search` | Three-branch retrieval with a fusion report saying which branch found what |
| `dai_memory_why` | The decisions and constraints touching a file or symbol |
| `dai_memory_get`, `dai_memory_neighbors` | One node in full; the graph around it |
| `dai_memory_write`, `dai_memory_link` | Record a memory; relate two |
| `dai_memory_constraints`, `dai_memory_conflicts` | What is settled; what contradicts |
| `dai_memory_clusters`, `dai_memory_summarize` | Communities in the memory graph; record a summary for one |
| `dai_memory_changes` | What memory records about the files about to be committed |

### Code

| Tool | Answers |
|---|---|
| `dai_memory_impact` | Dependents by distance, with confidence and a risk level |
| `dai_memory_context` | One declaration from every side, with the memory about it |
| `dai_memory_trace` | The shortest call path, or where the chain breaks |
| `dai_memory_query` | Words in, execution flows out |
| `dai_memory_processes`, `dai_memory_process` | Every flow; one flow step by step |
| `dai_memory_detect_changes` | A diff, read as declarations |
| `dai_memory_review` | A branch: what can break other files, which modules, who worked there |
| `dai_memory_rename` | Rename through the graph; writes nothing without `apply` |
| `dai_memory_check` | Import cycles and other invariants, with what each rule examined |
| `dai_memory_code_clusters` | Communities in the call graph |
| `dai_memory_cypher` | One read-only query; writing clauses refused |
| `dai_memory_status` | What is indexed, from which commit, whether that is current |
| `dai_memory_routes`, `dai_memory_shape_check`, `dai_memory_api_impact` | The HTTP surface, its problems, and what answers through a declaration |
| `dai_memory_tool_map` | The MCP tools this repository declares |
| `dai_memory_taint`, `dai_memory_explain`, `dai_memory_pdg` | Untrusted input reaching danger; what that says about one thing; inside one declaration |
| `dai_memory_groups`, `dai_memory_contracts` | Repositories as one system, and the calls between them |
| `dai_memory_wiki` | Documentation from the graph, the memory and the source |

## Resources

`dai-memory://<project>/` + `context`, `processes`, `process/<name>`,
`clusters`, `memory-clusters`, `routes`, `check`, `taint`, `schema`.

Read `context` first in an unfamiliar repository: it says what is there and
whether the index is still current.

## The graph

Nodes: `Memory`, `Symbol`, `File`. Relationships: `CALLS` and `INHERITS`
(Symbol to Symbol, with a confidence label), `IMPORTS` (File to File),
`DECLARES` (File to Symbol), `ABOUT` (Memory to Symbol or File).

Containment is not an edge: a member is its container's id plus a dotted name,
so `Symbol:a.ts:Class.method` is inside `Symbol:a.ts:Class`. Property names
are snake_case — the `schema` resource is generated from the store's own DDL,
so read it before writing a query rather than guessing.

Confidence labels map to scores for ranking: `type` 1, `file` 0.95,
`receiver` 0.9, `import` 0.85, `unique` 0.7.

## What the answers do not claim

- **The graph is static.** Dynamic dispatch, reflection and names built from
  strings are not edges.
- **Flows are derived.** An entry point is a declaration nothing here calls
  which calls others; that also matches dead code, and the rule ships with
  every answer.
- **Routes are read per line**, per framework, from the source text. The
  frameworks looked for are listed, so no routes found cannot be read as a
  service having none.
- **Taint matches patterns and follows calls.** It does not track values: a
  source and a sink on one path need not be the same data. Nothing it reports
  is a vulnerability; it is a place worth reading.
- **`pdg` is one declaration.** No aliases, no fields, nothing across a call.
- **Contracts match method and path.** Bodies are not checked.
- **The index has a commit.** Anything depending on line numbers says when the
  working tree has moved past it.

An empty answer always says whether it means "nothing found" or "could not
look". That distinction is the point of the layer.
