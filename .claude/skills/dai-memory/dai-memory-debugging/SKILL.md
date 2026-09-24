---
name: dai-memory-debugging
description: "Use when the user is debugging a bug, tracing an error, or asking why something fails. Examples: \"Why is X failing?\", \"Where does this error come from?\", \"Trace this bug\""
---

# Debugging

## When to use

- "Why is this failing?"
- "Where does this error come from?"
- "Who calls this?"
- An endpoint returns the wrong thing.

## Workflow

```
1. dai_memory_query({query: "<the symptom, in words>"})    what runs near it
2. dai_memory_context({target: "<suspect>"})               callers, callees, memory about it
3. dai_memory_trace({from: "<entry>", to: "<suspect>"})     how running gets there
4. dai_memory_pdg({target: "<suspect>"})                   inside it: what is set where, what is conditional
```

## Patterns

| Symptom | Where to start |
|---|---|
| An error message | `query` on the words of the message, then `context` on what it finds |
| A wrong value | `pdg` on the function: which line last gives that name a value, and whether it is under a condition |
| Something never runs | `trace` from the entry point: the answer says where the chain breaks |
| A 500 from an endpoint | `routes` to find the handler, then `impact --direction downstream` on it |
| A value from outside | `explain` on the file: what untrusted input reaches from there |

## Trace says where it breaks

```
dai_memory_trace({ from: "authRouter", to: "hash" })

4 step(s) from authRouter to hash:
  0. authRouter      src/routes/router.ts:2
  1. loginHandler    src/auth/login.ts:2    <- CALLS 95%
  2. validateUser    src/auth/validate.ts:1 <- CALLS 95%
```

No path is an answer, not a failure: it reports the furthest declaration
reached, and whether the search stopped at its depth limit rather than at the
edge of the graph. Those are different, and a debugger needs to know which.

## Inside one function

```
dai_memory_pdg({ target: "total" })

names:
  sum       defined at 2, 4, 7   used at 4, 7, 9
  discount  defined at 1         used at 6, 7  -- read under a condition
```

It reads the syntax tree, so it knows an assignment from a comparison. It does
not follow values through calls, does not track aliases, and does not know
which definition reaches which use. The answer says all three.

## What memory already recorded

Before digging further, `dai_memory_why` on the file or symbol: an incident
somebody recorded is the fastest answer there is, and it is the reason this
layer exists.
