---
name: dai-memory-refactoring
description: "Use when the user wants to rename, move, extract or restructure code safely. Examples: \"Rename X to Y\", \"Is this safe to refactor?\", \"Split this module\""
---

# Refactoring

## When to use

- "Rename X to Y"
- "Move this function"
- "Split this module"
- Any edit whose risk is in what else refers to it.

## Never find-and-replace a name

It renames the comment that mentions it, the string that contains it, and the
unrelated function three directories away with the same name — and misses
nothing, which is how it passes review. Use `dai_memory_rename`: it walks the
call and inheritance edges, so every site it rewrites is one the graph says
refers to that declaration.

## Workflow

```
1. dai_memory_impact({target: "X", direction: "upstream"})   what depends on it
2. dai_memory_rename({target: "X", to: "Y"})                 the plan, written nowhere
3. read the plan, and the occurrences it will not touch
4. dai_memory_rename({target: "X", to: "Y", apply: true})    make the edits
5. run the tests
```

Nothing is written without `apply`. The plan lists each site with the
confidence of the edge that found it, and separately lists the occurrences a
text search would also change — comments, strings, a different declaration
with the same name. Those are yours to decide on; the tool will not touch
them unless asked.

## What it refuses

| Refusal | Why |
|---|---|
| the graph is older than the working tree | the plan is positions in files, and stale positions overwrite the wrong text. Run `dai-memory ingest` |
| the name fits two declarations | both are listed, ranked; say which with `file` or `uid` |
| the new name is not an identifier | it would not compile |
| the new name is already declared in that file | the rename would collide |

When it applies, every position is checked against the file first, and
anything that does not match is skipped and reported rather than written.

## Before moving code between modules

```
dai_memory_check()            import cycles, declarations that take part in nothing
dai_memory_code_clusters()    what actually belongs together, by who calls whom
dai_memory_api_impact({target: "X"})   whether an endpoint answers through it
```

A cluster is not a verdict about where code should live; it is what the call
graph says is already tied together. Moving across that boundary is the
expensive kind of move, and worth knowing about first.
