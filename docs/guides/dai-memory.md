# Memory layer guide

The memory layer records **why** — decisions, incidents and constraints — and
indexes what each file declares and what those declarations do to each other.
The code graph exists so a recorded decision can be found from the code that
depends on it.

It replaced GitNexus on 2026-09-21. GitNexus is PolyForm Noncommercial, which
this project cannot ship on; every capability the harness used it for is now
in the layer, which is MIT and maintained in its own repository.

## Setup

The engine is installed **outside** the repository, one directory per pinned
version, because installed it is about 500 MB and this project's verifiers
copy and fingerprint the whole worktree.

```bash
python scripts/lite/dai_memory.py install   # dependencies, build, embedding model
python scripts/lite/dai_memory.py where     # prints the install directory
```

Then, from the repository root:

```bash
dai-memory init      # create the store, scan, build the code graph
dai-memory status    # what is indexed, from which commit, whether that is current
dai-memory ingest    # re-read what changed, after a commit or a merge
```

## The safe edit loop

1. `dai_memory_query` for the behaviour, not the filename: answers come back
   grouped by the execution flow that runs them.
2. `dai_memory_context` on the target: callers, callees, types, imports, and
   the memory recorded about it.
3. `dai_memory_impact` before changing it: dependents by distance, each with
   the confidence of the edge that found it, and a risk level that states its
   reasons.
4. `dai_memory_detect_changes` before committing: the diff read as
   declarations, with what it could not see listed.

The commit gate runs step 4 on every commit.

## What the answers do not claim

- The graph is static: unsupported or dynamic patterns may not resolve --
  dynamic dispatch, reflection and names built from strings are not edges, so
  they are not in a blast radius.
- An entry point is a declaration nothing here calls which calls others. That
  rule also matches dead code, and it ships with every flow.
- Routes are read per line, per framework; the frameworks looked for are part
  of the answer.
- Taint matches patterns and follows calls. It does not track values, so a
  finding is a place worth reading, not a vulnerability.
- Anything that depends on line numbers says when the index is older than the
  working tree, and `rename` refuses outright rather than writing into it.

An empty answer says whether it means "nothing found" or "could not look".

## Repository rules

`AGENTS.md` and `CLAUDE.md` define the required commands and risk handling for
this project, and take precedence over the generic examples here.
