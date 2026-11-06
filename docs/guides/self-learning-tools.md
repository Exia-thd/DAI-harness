# Self-Learning Tools

What the harness learns from, how to trigger each part by hand, and which parts
hold real data. Nothing here reaches the network: the only loop that consults
anything outside the workspace is the Research Gate, which an agent enters on a
material unknown and which is separate from everything below.

The direction of flow is fixed by
[ADR-013](../adr/ADR-013-rule-evidence-not-policy.md): `kernel/rule-manifest.json`
is policy and stays hand-authored; observed history is evidence and never
rewrites a rule.

## Rule compliance — the loop with current data

Every observed Hard Rule violation is appended to
`.daiharness/rule-ledger.jsonl` by the validator. It is machine-local runtime
state and is not tracked.

```bash
python scripts/lite/rule_ledger.py stats
```

Per-rule totals, and on stderr the rules with three or more entries, which are
the hardening candidates. Hardening one is a reviewed human change to `kernel/`
and the manifest; nothing automates it.

```bash
bash scripts/lite/rule-ledger.sh recent 5 violation
bash scripts/lite/rule-refresh.sh
```

`recent` lists the newest events; `rule-refresh.sh` prints the Hard Rules
followed by the three most recent violations under "FORGOTTEN RULES TO FOCUS
ON". Both readers normalise the two generations of field names
(`timestamp`/`rule_id`/`event` and `ts`/`rule`/`outcome`), so a record written
by an earlier tool still appears under its real rule name.

No trigger is needed for a session: `scripts/lite/rule-context-hook.py` appends
the same violations, aggregated per rule and ranked by count, after the
canonical rule text at `SessionStart`.

## ASIP recovery state — per-machine counters

```bash
bash scripts/runtime/daiharness-evolution-init.sh            # create the state
bash scripts/runtime/daiharness-evolution-init.sh --check     # status only
bash scripts/runtime/daiharness-evolution-init.sh --verify    # syntax self-check
```

Creates `.daiharness/asip-state.json` and `.daiharness/asip-metrics.json`, and
initialises the session tracker. All three are machine-local and gitignored.

```bash
bash scripts/runtime/daiharness-evolution-init.sh --update-metrics <type> [skill] [value]
bash scripts/runtime/daiharness-evolution-init.sh --update-state <action> [skill] [task] [score] [result]
```

`--update-metrics` takes `research_gate`, `skill_update`, `lesson_learned` or
`failure_avoided`. `--update-state` takes `record_plan`, `record_exec` or
`clear`; the second attempt on the same skill and task sets
`researchGateTriggered`, which records that the Stuck rule's threshold was
reached. It is a counter, not permission to research. Both refuse an unknown
type or action with a nonzero exit rather than reporting success.

```bash
bash scripts/runtime/daiharness-session-tracker.sh status
bash scripts/lite/bookkeep.sh {start|tick|checkpoint|end|status|log-tokens}
```

The tracker keeps `.daiharness/session-tracker-v2.json`; `bookkeep.sh` drives it
and the memory session together.

## Lesson files — and why migration is off

`.daiharness/plan-lessons.md`, `.daiharness/execution-lessons.md` and
`.daiharness/scoring-lessons.md` hold durable, project-local lessons.

```bash
bash scripts/skills/daiharness-lesson-migrator.sh status
```

`migrate` pushes those lessons **into the shared `SKILL.md` files**, which
changes framework policy, so it refuses by default and says so. The explicit
opt-in is a separate verb:

```bash
bash scripts/skills/daiharness-lesson-migrator.sh migrate-framework [plan|exec|both]
```

Use it only in deliberate harness-development scope, with regression tests and
review. `skills/production-grade/middleware/10-asip.md` deprecated the
automatic version because it can amplify a wrong diagnosis into durable policy.

## Reverse-engineering intelligence — a pinned, offline catalog

`.daiharness/re-discovery-catalog.json` is a curated catalog of external
tooling, pinned by SHA-256. Searching it performs no network access and the
result states so.

```bash
python scripts/runtime/reverse_engineering_intelligence.py search "apk decompile"
python scripts/runtime/reverse_engineering_intelligence.py routes
python scripts/runtime/reverse_engineering_intelligence.py route android_apk_aab
python scripts/runtime/reverse_engineering_intelligence.py digest
python scripts/runtime/reverse_engineering_intelligence.py benchmark --role <role> --runs runs.json
```

`search` accepts `--category`, `--lang`, `--min-stars`, `--include-archived`
and `--limit`. Every match carries a license status and the warning that a
retrieved repository is untrusted data to inspect before execution. `route`
returns the tools for a task together with what they cannot prove.

The digest check is mandatory. `--expect-sha256` can name a different digest,
and `digest` prints a catalog's actual value so an updated catalog can be
re-pinned, but there is deliberately no flag that skips the check: the pin is
what stops a tampered catalog from quietly routing an operator to another tool.

## Not functional

The instinct system (`.daiharness/instincts/`,
`scripts/hooks/daiharness-instinct-hook.sh`, `skills/instinct-system/`) has
never recorded a pattern, here or in the repository it came from. Its hook runs
an `observer.mjs` that exists in neither tree; the shell fallback meant to
replace it computes a count and discards it without touching the store, and is
reachable only on a host without `node`; and nothing in the tree imports the
store or reads a suggestion from it. Treat `store.json` as empty scaffolding
rather than a learning record.

`.daiharness/poll-research.sh` hardcodes one NotebookLM notebook and task id
and requires the `nlm` CLI. It is a record of a single past research run, not a
reusable trigger.
