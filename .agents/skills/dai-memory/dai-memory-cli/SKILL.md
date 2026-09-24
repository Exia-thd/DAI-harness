---
name: dai-memory-cli
description: "Use when the user needs to run the memory layer from a terminal: index a repository, check what is indexed, remove the index, generate the wiki, or list the projects it knows. Examples: \"Index this repo\", \"Is the index current?\", \"Generate the wiki\""
---

# The memory layer from a terminal

The engine is installed outside this repository, one directory per pinned
version. `python scripts/lite/dai_memory.py where` prints the directory, and
`install` puts it there:

```bash
python scripts/lite/dai_memory.py install
```

Then the CLI is `node <that directory>/bin/dai-memory.mjs`. Everything below
is written as `dai-memory <command>`.

## Commands

### init — create the store and index the project

```bash
dai-memory init
```

Creates the store, scans the repository, builds the code graph and writes the
viewer. Run again to rebuild what a scan produces; **what people recorded is
kept**. `--fresh` removes that too, and has to be typed out.

### ingest — re-read what changed

```bash
dai-memory ingest
```

What to run after a commit or a merge. It replaces what the previous scan
produced, reclaims what is gone, and refreshes the viewer. `--force` re-reads
everything.

### status — what is indexed, and whether that is still true

```bash
dai-memory status
```

Says which commit the graph was built at, whether the working tree has moved
on since, the store schema and embedding, and the size of the graph. The
commands that depend on line numbers — `detect-changes`, `rename` — check the
same thing and refuse or warn rather than answering from stale positions.

### wiki — documentation from what is known

```bash
dai-memory wiki            # write the pages
dai-memory wiki --check    # report drift, write nothing, exit non-zero if it drifted
```

Six pages built from the graph, the recorded memory and the source. No
language model is called and none is configured; every page says so, and
recorded decisions are copied verbatim rather than summarised.

### clean — remove the store

```bash
dai-memory clean --yes
```

Refuses without `--yes`. Everything a scan produced can be rebuilt by `init`;
what a person recorded cannot.

### list — the projects it knows

```bash
dai-memory list
```

Every registered project with how fresh its index is.

### doctor — what is actually working

```bash
dai-memory doctor
```

Dependencies, build, embedding model, store health, graph counts — each as a
line that passes or fails with a reason.

## When the harness runs these

The commit gate runs `detect-changes` on every commit and `ingest` when the
index is behind. Neither needs a flag here; they are wired into
`scripts/ci/local-ci.py`.
