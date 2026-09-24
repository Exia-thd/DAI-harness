---
name: dai-memory-security
description: "Use when the user asks whether something is exposed, where untrusted input goes, or wants a security read of a file or endpoint. Examples: \"Is this endpoint safe?\", \"Where does user input end up?\", \"Review this for injection\""
---

# Where untrusted input can reach

## When to use

- "Is this endpoint safe?"
- "Where does user input end up?"
- "Review this file for injection"
- Before exposing something new over HTTP.

## Workflow

```
1. dai_memory_taint()                                      every source-to-sink path
2. dai_memory_explain({target: "<file or declaration>"})    what that says about one thing
3. dai_memory_routes() / dai_memory_api_impact()            which endpoints reach it
4. read the code at both ends
```

## What a finding is, and is not

A finding says: this declaration reads untrusted input, that one reaches
something dangerous, and the call graph joins them. It does **not** say the
same value travels between them -- nothing here tracks values.

So a finding is a place worth ten minutes, not a vulnerability. Confidence
falls with each call between the two ends, and a sanitizer anywhere on the way
halves it again and marks the path mitigated -- reported rather than dropped,
because that sanitizer may apply to something else entirely.

```
[60%] http-request -> shell
    from  handler      src/web/handler.ts:3
          const name = req.query.name;
    via   runCommand   src/shell/run.ts:2
    to    runCommand   src/shell/run.ts:3
          return execSync(`ls ${argument}`).toString();
```

## What it looks for

Sources: HTTP request data, Flask and Django requests, argv, the environment,
stdin, event payloads, uploads. Sinks: a shell, eval, SQL built by
concatenation, HTML, the filesystem, redirects, deserialization, a module
loaded by name. Sanitizers: escaping, validation, conversions that reject
anything else, path confinement, parameterised queries.

Each list is in the answer's limits, so a clean report can be read: a language
or a framework whose idiom is not in those patterns produces no findings, and
that is not the same as being safe.

## The other half

`dai_memory_shape_check` on the routes: the same path declared twice, and path
parameters the handler never mentions. Neither is a vulnerability by itself;
both are the kind of thing that turns into one.
