---
name: dai-memory-exploring
description: "Use when the user asks how something works, wants an overview of an unfamiliar codebase, or asks where something happens. Examples: \"How does login work?\", \"What does this service do?\", \"Where is retry handled?\""
---

# Understanding a codebase

## When to use

- "How does X work?"
- "What is this repository?"
- "Where does Y happen?"
- Before changing code nobody in this session has read.

## Workflow

```
1. READ dai-memory://<project>/context     what this is, and whether the index is current
2. dai_memory_query({query: "the thing in words"})   answers grouped by execution flow
3. dai_memory_process({name: "<flow>"})              one flow, step by step
4. dai_memory_context({target: "<declaration>"})     one declaration from every side
```

Ask `query` in the words of the domain, not in symbol names: it splits
camelCase and snake_case on both sides, and groups what it finds by the
execution flow that runs it. Declarations no flow reaches come back in their
own group rather than being dropped.

## Resources

| Resource | What it holds |
|---|---|
| `dai-memory://<project>/context` | Counts, the commit the graph was built at, whether that is current |
| `dai-memory://<project>/processes` | Every execution flow, with the rule that found the entry points |
| `dai-memory://<project>/clusters` | Communities in the call graph, named after where they live |
| `dai-memory://<project>/routes` | The HTTP surface, and which frameworks were looked for |
| `dai-memory://<project>/check` | Import cycles and the other invariants |
| `dai-memory://<project>/schema` | The node and relationship types, for writing a query |

## What an entry point is

A declaration nothing in this repository calls, which calls other
declarations. That finds route handlers, CLI commands and `main` — and dead
code, which this layer cannot tell from a function only a framework calls.
Every flow carries that rule with it, so a flow list is never read as a claim
about what runs in production.

## Reaching the reasoning

`dai_memory_context` carries the memories anchored to a declaration, and
`dai_memory_why` answers for a file or a symbol directly. That is the point of
the whole layer: the graph is how a recorded decision is found from the code
that depends on it.

```
dai_memory_context({ target: "validateUser" })

called by (3): apiMiddleware, loginHandler, testValidateUser
calls (1): checkPassword
recorded about it:
  [semantic] Passwords are checked before sessions open  (src/auth/validate.ts#L2-L4)
execution flows: It takes part in 2 execution flow(s).
```
