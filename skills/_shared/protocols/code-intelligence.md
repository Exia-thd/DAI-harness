---
id: code-intelligence
title: Code Intelligence Protocol
summary: Core protocol for code intelligence.
status: deprecated
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
# Code Intelligence Protocol

**Gives skills deep codebase awareness via a code graph. Powered by the DAI memory layer (`vendor/dai-memory`, a submodule of the plugin's own repository) — indexes declarations, calls, imports, execution flows and communities, alongside the project's recorded decisions.**

## When Available

Code Intelligence is available when ALL of these are true:
- The memory engine is installed (`python scripts/lite/dai_memory.py where` exits 0; install with `python scripts/lite/dai_memory.py install`)
- Project has been indexed (`.memory/meta.json` exists — `dai-memory init`)
- `project-profile.json` has `code_intelligence.indexed == true`

**If NOT available:** All skills MUST fall back to traditional analysis (grep, find, view_file_outline). Code Intelligence is an **enhancement**, never a hard dependency.

## Available MCP Tools

When Code Intelligence is active, the `dai-memory` MCP server offers these (the full list is in `dai_memory_*` tools; the guide skill `.claude/skills/dai-memory/dai-memory-guide/SKILL.md` describes each):

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `dai_memory_query` | Search code by concept, grouped by execution flow | Understanding a feature area, finding related code |
| `dai_memory_context` | 360° view of a declaration — callers, callees, members, imports, flows, memory | Before modifying any function/class, during code review |
| `dai_memory_impact` | Blast radius by distance, with a risk level | Before architecture changes, before refactoring |
| `dai_memory_detect_changes` | What a diff changes: declarations, dependents, flows, risk | Before committing, during code review |
| `dai_memory_rename` | Rename through the call graph; a plan first, `apply` to write | Refactoring symbols across files |
| `dai_memory_cypher` | One read-only graph query | Advanced analysis, custom reports |
| `dai_memory_groups` | Repositories grouped as one system | Multi-repo workflows |
| `dai_memory_search` / `dai_memory_why` | Recorded decisions, incidents and constraints | Learning why code is the way it is |

The same operations exist on the CLI: `dai-memory query|context|impact|detect-changes|rename|cypher`.

### Tool Parameters

**impact:**
```
dai_memory_impact({
  target: "UserService",      // declaration name
  direction: "upstream",      // upstream (what depends on this) or downstream (what this depends on)
  maxDepth: 3,                // traversal depth, 1-5
  minConfidence: 0.7,         // filter low-confidence relationships
  includeTests: false         // include test files in results
})
```

**context:**
```
dai_memory_context({
  name: "validateUser"   // returns callers, callees, members, imports, flows, memory
})
```

**detect_changes:**
```
dai_memory_detect_changes({
  scope: "working"   // "staged" (default), "working" (everything since the last commit), or "compare" with base
})
// Returns: changed declarations, their dependents, affected flows, risk level
```

## Usage Rules for Skills

### 1. Check Before Use

```
IF project-profile.json → code_intelligence.indexed == true:
    Use MCP tools for deep analysis
ELSE:
    Fall back to grep_search, find_by_name, view_file_outline
    Note in output: "Code Intelligence not available — analysis limited to file-level"
```

### 2. Required Usage Points

| Skill | When | Tool | Why |
|-------|------|------|-----|
| **solution-architect** | Before proposing changes | `dai_memory_impact` | Know blast radius before making ADRs |
| **code-reviewer** | For each modified function | `dai_memory_context` | 360° view catches missed dependencies |
| **code-reviewer** | Before approving PR | `dai_memory_detect_changes` | Risk assessment before merge |
| **debugger** | During investigation (Phase 3) | `dai_memory_context` | Trace call chains without manual search |
| **debugger** | Finding related code | `dai_memory_query` | Flow-grouped search finds execution flows |
| **software-engineer** | Before modifying function | `dai_memory_impact` upstream | Check what will break |
| **software-engineer** | After implementing changes | `dai_memory_detect_changes` | Pre-commit safety check |
| **parallel-dispatch** | Defining task boundaries | `dai_memory_code_clusters` | Each community = potential worktree scope |
| **qa-engineer** | Test planning | `dai_memory_impact` | Identify test coverage gaps from dependency chains |
| **security-engineer** | Data flow tracing | `dai_memory_taint` + `dai_memory_context` | Trace untrusted input through call chains |

### 3. Graceful Degradation

```
IF MCP tool call fails:
    1. Log warning: "Code Intelligence tool failed: [tool_name] — [error]"
    2. Fall back to traditional analysis (grep/find/outline)
    3. Note reduced analysis depth in output
    4. Continue pipeline — NEVER block on CI failure

IF index is stale (dai_memory_status says the indexed commit is not HEAD):
    1. Suggest re-indexing: "dai-memory ingest"
    2. Use existing index anyway (stale > nothing)
    3. Flag in output: "⚠ Code Intelligence index may be stale"
```

### 4. Performance Budget

- `query` and `context` — fast (<1s), use freely
- `impact` — moderate (~2-5s for deep traversal), use when needed
- `detect_changes` — moderate (~3s), use once before commit
- `cypher` — variable, use sparingly
- `rename` — writes files only with `apply`; always read the plan first

## Auto-Reindex (Session Lifecycle Integration)

The harness re-indexes at three lifecycle points — **no user action required:**

### At Session Start (Step 3.5)

```
IF .memory/meta.json exists:
  commits_since_last_index = git rev-list --count HEAD ^<meta.json lastCommit>

  IF commits_since > 0:
    Run: dai-memory ingest --quiet
    Log result (success or fallback to stale)
  ELSE:
    Use existing fresh index
```

### At Session End (Step 5)

```
IF .memory/meta.json exists:
  Run: dai-memory ingest --quiet
  This ensures NEXT session starts with fresh index
```

### Immediately Post-Commit (Background Hook)

```
IF git commit has successfully run:
  The post-commit hook runs: dai-memory ingest (as a background task)
  This keeps the graph current without blocking the agent or waiting for session end
```

### Why these hooks?

| Hook | Purpose |
|------|----------|
| Session Start | Catches manual changes user made between sessions (hotfixes, other tools) |
| Session End | Catches all changes made BY this session (new files, refactors) |
| Post-Commit | Immediate updates after code mutations, keeping the graph current |

### Fail-Safe

If `dai-memory ingest` fails at any point:
1. Log warning — do NOT block pipeline
2. Use stale index (stale > nothing)
3. Add `⚠ stale` badge to any Code Intelligence output
4. Retry at next lifecycle hook

> **Key principle:** Auto-reindex is best-effort. Pipeline NEVER blocks on Code Intelligence failures.

## Manual Re-indexing

In addition to auto-reindex, manual re-indexing may be needed:
- **After major refactoring** — run `dai-memory ingest --force`
- **After adding new files/services** — run `dai-memory ingest` (incremental)
- **Stale index warning** — run `dai-memory ingest`
- **Auto-reindex (IDE)** — the post-commit hook reindexes after commits

## No LLM Required

Every code graph operation (ingest, impact, context, query, detect-changes, wiki) runs **without any LLM** and without network access. `dai-memory wiki` builds its pages only from what the graph and the recorded memory already know.

## Integration with Existing Protocols

- **session-lifecycle.md:** Step 3.5 (Session Start) checks freshness + auto-reindex; Step 5 (Session End) re-indexes after changes
- **project-onboarding.md:** Phase 1.5 creates the initial index
- **quality-gate.md:** Quality gate can use `dai_memory_detect_changes` as additional validation signal
- **graceful-failure.md:** All CI tool failures follow graceful failure protocol
- **brownfield-safety.md:** `dai_memory_impact` analysis feeds into brownfield risk assessment
