---
name: dai-memory-impact-analysis
description: "Use when the user wants to know what will break if they change something, or needs safety analysis before editing code. Examples: \"Is it safe to change X?\", \"What depends on this?\", \"What will break?\""
---

# What breaks if this changes

## When to use

- "Is it safe to change this function?"
- "What will break if I modify X?"
- "Who uses this code?"
- Before a non-trivial edit, and before committing.

## Workflow

```
1. dai_memory_impact({target: "X", direction: "upstream"})   what depends on it
2. dai_memory_detect_changes({scope: "staged"})              what the current diff touches
3. Report the risk level and the reasons it gives
```

If the answer says the graph is older than the working tree, run
`dai-memory ingest` and ask again. The line numbers it matched against are
from the commit it was built at, and it says so rather than pretending.

## Reading the answer

| Depth | Label | Meaning |
|---|---|---|
| d=1 | **WILL BREAK** | Callers, subclasses, or callers of a type's members |
| d=2 | LIKELY AFFECTED | One call further out |
| d=3 | MAY NEED TESTING | Transitive |

Every hit carries the confidence of the edge that found it (`type` 100%,
`file` 95%, `receiver` 90%, `import` 85%, `unique` 70%) and the confidence of
the whole path. `--min-confidence` drops the weak ones **and reports how many
it dropped** — a filtered answer that hides its own filtering is worse than an
unfiltered one.

Risk is LOW under 5 dependents, MEDIUM to 15, HIGH above — and CRITICAL when
the declaration or a direct dependent is on an auth, payment, crypto or
session path. The answer lists the reason, so a risk level can be argued with.

## Tools

```
dai_memory_impact({ target: "validateUser", direction: "upstream", maxDepth: 3 })

d=1 (WILL BREAK):
  - loginHandler    src/auth/login.ts:3   [CALLS, 95%]
  - apiMiddleware   src/api/middleware.ts:3  [CALLS, 95%]
d=2 (LIKELY AFFECTED):
  - authRouter      src/routes/router.ts:3  [CALLS, 95%]

risk: CRITICAL -- 3 dependent declaration(s) within 3 hop(s); on a critical path: validateUser
processes: 2 execution flow(s) run through this change.
```

```
dai_memory_detect_changes({ scope: "staged" })

staged changes: 4 declaration(s) in 3 file(s)
  REMOVED helper  src/util/helper.ts:1-3
    2 dependent(s) within reach, 1 outside this file -- risk CRITICAL
```

A removed declaration that still has dependents is the case that breaks a
build rather than changing behaviour, and it is reported separately.

## What it cannot see

- Dynamic dispatch, reflection, and names built from strings are not edges in
  the graph, so they are not in a blast radius.
- A name that fits two declarations is answered with both, ranked. Pick one
  with `file` or `uid`; do not guess.
- Added code is in the diff but not in the graph until the next `ingest`; the
  answer counts those hunks and says so.
