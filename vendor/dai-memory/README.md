# vendor/dai-memory

The DAI memory layer, copied in from its own repository at one commit. It is the
harness's memory and code-graph engine: recorded decisions, incidents and
constraints; hybrid retrieval over them; and a tree-sitter code graph those
memories attach to.

**Do not edit anything here except this file.** The memory layer is its own
project and its repository is the source of truth:
<https://github.com/Exia-thd/DAI-memory-layer-plugin>. Every copied file is
hashed in `PROVENANCE.json`, and the test suite fails on any difference. A fix
goes to the memory layer, is committed there, and comes across with:

```bash
node scripts/vendor/sync-dai-memory.mjs --source <memory-layer checkout> [--ref <commit>]
```

The copy takes the files the layer needs to build and run — its packages,
launcher, grammars, manifests and licence — and leaves behind its tests,
evaluation corpus, documentation and Claude Code plugin packaging, which live
and run in its own repository.

## Setting it up

```bash
python scripts/lite/dai_memory.py install
```

Copies these sources to a per-version directory outside the repository
(`%LOCALAPPDATA%\dai-harness\dai-memory\<id>` on Windows,
`~/.cache/dai-harness/dai-memory/<id>` elsewhere; `DAI_MEMORY_ENGINE`
overrides it) and runs the layer's own setup there: dependencies, build, and
the embedding model (about 130 MB, cached under `~/.memory/models`). The layer
refuses to run without all three, and says so.

Nothing is built here. Installed, the layer is about 500 MB, and the harness's
verifiers copy and fingerprint the whole worktree, ignored files included.
`python scripts/lite/dai_memory.py where` prints the install directory.

## Licence

MIT, as the memory layer is — see `LICENSE` in this directory. The notice there
must stay with the copy.
