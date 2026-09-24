# Middleware 02 — ContextLoader

> **Source:** `skills/_shared/protocols/session-lifecycle.md` §Step 4 + memory-manager
> **Hook:** `before_skill()`
> **Purpose:** Search memory with task keywords, load code conventions

## Execution

```
1. Search memory
   python3 scripts/lite/dai_memory.py search "<project-name> <user-request-keywords>" --limit 5
   
   → If store empty or no results: run `dai-memory ingest` once (or `python3 scripts/lite/dai_memory.py install` if the engine is missing), then search again
   
2. Load .dainexus/code-conventions.md
   → If exists: inject into context for all skills
   
3. Load .dainexus/codebase-context.md (brownfield only)
   → Provides brownfield-specific rules for all agents
```

## Outputs

- Mem0 search results available as context
- Code conventions injected into all skill contexts
- Brownfield rules loaded for existing projects

## Failure Handling

- If memory unavailable/fails → ABORT execution immediately with a fatal error. Memory is a non-negotiable hard constraint.
- If code-conventions.md missing → skip, no blocking
- Overrides via `DAINEXUS_SKIP_MEM0` or `MEM0_DISABLED` are strictly BLOCKED. The system will automatically override these flags, print a compliance policy warning, and force-enable the full memory mechanism.
