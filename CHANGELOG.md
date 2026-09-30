# Changelog

All notable changes to [DAI Harness](https://github.com/Exia-thd/DAI-harness).

## [Unreleased]

> Features targeting v8.8.0 and beyond. Not yet released.

### Added
- **DAI Harness Rule Compliance Loop** — Telemetry, Rule Ledger, Execution Policy, Context Manager, and Rule Validator to self-correct and enforce rules.
- **AI Reasoning Research Integration** — Deep NotebookLM research across 14 sources (OpenAI o1/o3, Anthropic extended thinking, Claude Code best practices) producing 15 actionable lessons (reconstructed from docs).
- **Reasoning Checkpoint** — SOLVE Step 6.4 mandates a 1–2 sentence reasoning pause after every CHECK result (reconstructed from docs).
- **Adversarial Review** — SOLVE Step 6.7 spawns a fresh-context reviewer for FEATURE/DEBUG tasks touching ≥3 files (reconstructed from docs).
- **Anti-Narrative Verification** — VERIFY Rules 6-7 mark narrative claims as automatically FALSE without command output (reconstructed from docs).
- **Tests-First Ordering** — Self-check protocol enforces test stubs BEFORE implementation for complex tasks (reconstructed from docs).
- **Context Reset** — STUCK rule expanded with Step 4 "Reset context" (reconstructed from docs).
- **Guardrail Hardening** — 13 rule categories integrated into Middleware ④ with 17 regression tests (reconstructed from docs).
- **UI Design Gate** — Mandatory design contract required before any frontend edit in SOLVE Step 3.D (reconstructed from docs).
- **58 Regression Tests** — 19 AI reasoning + 17 guardrail + 13 UI design gate + 9 audit tests (reconstructed from docs).
- **Client-Server Sequence Flow Generator** — Automated Mermaid sequence diagram generation powered by GitNexus static call-graphs (reconstructed from docs).

### Fixed
- **Inverted code blocks in 25 Markdown files** — examples written as ```` ```markdown ```` with
  another ```` ``` ```` block inside them closed early, so the rest of the file rendered code as
  prose and prose as code. Outer example fences are now longer than anything inside them, and
  `tests/unit_tests/test_markdown_fences.py` fails on an unclosed block or on an inner opener
  the length of its enclosing block.
- **Memory graph layer restored** — The relational layer (`flux_nodes`, `flux_edges`,
  `procedural_circuits`) was reachable only through paths that a rename had corrupted, so all
  15 graph writes in the session tracker and lesson migrator failed silently. Observation ops
  now route to `scripts/lite/memory.py` and graph ops to `scripts/memory/memory-v2.py`; both
  share `.daiharness/memory.db` over disjoint tables.
- **14 broken engine paths** — A rename rewrote path *basenames* into repo-relative paths,
  producing doubled prefixes (`scripts/memory/scripts/lite/memory.py`) and a shim pointing at
  `scripts/scripts/lite/memory.py`. Every one is now resolved and asserted.
- **Silent `python3` failure on Windows** — `subprocess.run(['python3', ...])` from Windows
  Python hits the Microsoft Store stub and exits 9009 without raising; with `stderr=DEVNULL`
  the procedural-circuit consolidation never ran and never reported. Now uses `sys.executable`.
- **MSYS path handling** — Git Bash exports `/c/...` paths that native Windows Python cannot
  open, so the session tracker silently failed to persist its own state. Normalised via
  `cygpath -m`.

### Changed
- **Product renamed from DAI Nexus to DAI Harness** — everywhere at once: display text, identifiers
  (`DaiHarnessError`, `detectDaiHarnessDir`, …), environment variables (`DAIHARNESS_*`), the
  runtime directory (`.daiharness/`, `~/.daiharness/`, `~/.daiharness-console/`), the project
  config (`.daiharness.yaml`), script names (`scripts/**/daiharness-*.sh`), package names
  (`@dai-harness/*`) and the MCP server's tool prefix (`dh_*`). The setup and install scripts
  move runtime state kept under the former name the first time they run, and never merge into
  a directory that already exists. Calls to the former `dn_*` tool names are still served.
  Environment variables under the former prefix are no longer read: set the `DAIHARNESS_*`
  names instead. The frozen code-graph oracle keeps its recorded paths.
- **Workflow Consolidation** — Archived overlapping GitHub Action workflows into `.github/workflows/archive/` and simplified `ci.yml`.
- **Game Extraction** — Removed the `game/` directory from the repository structure to decouple game assets from orchestrator CI.
- **NPM Workspaces** — Configured `mcp` and `src/cli` as NPM workspaces in the root `package.json` to deduplicate dependencies and share the lockfile.
- **Pre-commit Hardening** — Replaced `bash -n` with `shellcheck` in `lint-staged` for stronger shell script validation.
- **Script Reorganization** — Reorganized `scripts/` into subdirectories (`bootstrap`, `ci`, `docs`, `hooks`, `mcp`, `memory`, `release`, `runtime`, `skills`, `telemetry`, `testing`, `utilities`) and generated shims for backward compatibility.

---

## [8.7.0] — 2026-07-01

> **v8.7 — Evidence-Gated Kernel & Parallel Skill Distillation**

### Added
- **DAI Harness Lite — Evidence-Gated Kernel (Upgraded v3)**: Lightweight reasoning kernel for fast models (Gemini Flash), featuring turn-level script verification via `.daiharness/verify/<turn>.json`, turn-blocking platform hooks (Claude Code, Gemini CLI, Cursor, Codex CLI), ≤7k tokens boot budget, and objective escalations to Sonnet/Opus models.
- **Automated Skill Distillation & Batch Upgrader**: `upgrade-skills.py` queries NotebookLM CLI in parallel via multi-agent subagents to distill all 83 skills to Lite overlays (`LITE.md`).
- **Self-Healing Skill Indexing**: Dynamic generation of `kernel/INDEX.md` by scanning all `LITE.md` overlays, automatically mapping triggers and paths.
- **Agent Benchmark Command** (`dai agent benchmark`): CLI command for evaluating agent performance.
- **Expert CLI Mode**: Optional premium model escalation for high-stakes planning, architecture, security, and gate decisions via local Claude CLI or Codex CLI (reconstructed from docs).
- **Token Tracking by Default**: `token_tracking` enabled by default for all pipelines.
- **Webhook State & Telemetry Protocol**: Replaces OSC/MCP event mechanism with HTTP Webhook for token and state reporting.
- **Momentum Breaker Protocol**: Detects and documents LLM psychological traps during execution.
- **99% Empirical Confidence & UI Visual Gate**: Protocol for high-confidence assertions and visual verification.
- **GraphRAG Memory V4 (FluxMem)**: SQLite relational cognitive graph (`flux_nodes` & `flux_edges`) replacing JSON files. Includes Procedural Circuits caching, ASIP edge decay (0.5) / reinforcement (1.2), and passive 10m idle checkpointing (reconstructed from docs).

### Changed
- **Gemini 3.x Native Optimization**: Direct support for Gemini 3.5 Flash (`thinking_level: MINIMAL`) and Gemini 3.1 Pro (`thinking_level: HIGH`, temperature 1.0). Scoped temperature policy by task.
- **Hexagonal & CQRS Migration**: PipelineState refactored to Hexagonal architecture with CQRS pattern.
- **WebSocket → HTTP Webhook**: MCP state reporting migrated from WebSocket to HTTP Webhook.
- **Marketing & Conversion Skills**: Upgraded with 2026 AI/CRO trends and Kelly Criterion.
- **Orchestration**: Complexity-scaled evaluation, escalation ladder, normalized step numbering.
- **Skill count** — 83 skills (from 57).

### Fixed
- **Gemini temperature policy** scoped by task type to prevent blanket temperature 1.0 enforcement.
- **MCP workspace detection** handles unresolved IDE template variables.
- **RPC event queuing** during WebSocket connection.
- **Compliance enforcement** for GitNexus analyze and sequence update in post-commit.

## [8.6.0] — 2026-06-10

> **v8.6 — GraphRAG Memory V3 & IDE MCP Unification**

### Added
- **GraphRAG Memory V3**: NetworkX-based graph memory with clustering, auto-pruning, and pattern learning (reconstructed from docs).
- **Unified IDE MCP Setup** (`fw-mcp.sh`): Single script to configure MCP for all editors (reconstructed from docs).

### Changed
- **DAI Harness Node deprecated**: Added DEPRECATED notice; all new projects should use GitNexus (reconstructed from docs).
- **Post-commit hook**: Auto-reindexes GitNexus on commit (reconstructed from docs).

## [8.5.0] — 2026-05-29

> **v8.5 — GitNexus Migration**

### Added
- **GitNexus Integration**: Migrated code intelligence from DAI Harness Node to GitNexus (38K+ stars, npm install, auto-setup for all editors, 16 MCP tools) (reconstructed from docs).
- **daiharness-mcp-setup.sh v3.0.0**: Unified setup script configuring both `dai-harness` and `gitnexus` MCP servers.
- **Multi-repo Support**: New `gitnexus group` for cross-repo analysis.

### Breaking
- `npx daiharness-node analyze` → `gitnexus analyze`
- `daiharness_node_*` MCP tools → `gitnexus_*` MCP tools
- `fw-mcp.sh daiharness-node` → `gitnexus setup` (GitNexus) + `daiharness-mcp-setup.sh` (DAI Harness)

## [8.4.0] — 2026-05-10

> **v8.4 — Mandatory Pipeline Rule & Enhanced ASIP**

### Added
- **Mandatory DAI Harness Rule**: EVERY user request MUST go through the DAI Harness pipeline after installation. Added enforcement box to README and AGENTS.md (reconstructed from docs).
- **Enhanced Research Gate**: ASIP Research Gate now checks NotebookLM availability first, falls back to Web Search, synthesizes insights, and updates session tracker (reconstructed from docs).
- **Session Tracker** (`scripts/daiharness-session-tracker.sh`): Tracks consecutive plan failures; ≥2 consecutive failures trigger mandatory Research Gate (reconstructed from docs).
- **Plan Quality Tracking**: Mandatory `plan → score → meta-evaluate → check ≥9 → execute` loop with max 3 iterations.

### Changed
- **DAI Harness Node community detection threshold** increased to 20K.
- **MCP setup flow** simplified for multi-project use.
- **Memory optimization** (round 2) for DAI Harness Node indexer.

## [8.3.0] — 2026-04-24

> **v8.3 — Adaptive Self-Improving Protocol (ASIP)**

### Added
- **Adaptive Self-Improving Protocol (ASIP)** (`skills/_shared/protocols/asip.md`): Combines Plan Quality Loop + Execution Blocker Loop. Mandatory 2-failure-then-research with NotebookLM. Skills improve over time based on real failures (reconstructed from docs).
- **ASIP Middleware** (`skills/production-grade/middleware/10-asip.md`): Enforcement middleware for ASIP protocol.
- **ASIP Metrics** (`.daiharness/asip-metrics.json`): Tracking file for ASIP protocol performance.
- **Lessons file** (`.daiharness/lessons.md`): Project-specific learnings from ASIP failures.
- **Multica Hub Token Stats**: Token statistics component added to status dashboard (reconstructed from docs).
- **Token Tracking & Cost Analytics**: `dai token on`, budget management, real-time tracking, and cost dashboard (reconstructed from docs).

### Changed
- **Middleware chain** updated with ASIP integration.
- **Production-grade SKILL.md** updated with execution learnings.

## [8.2.0] — 2026-06-25

> **v8.2 — Test Coverage Reporting & State Isolation**

### Fixed
- **Vitest Coverage Reporter**: Removed `minimatch` version override in `mcp/package.json` to resolve conflicts with `test-exclude` and enable Vitest coverage generation and reporting.
- **Pipeline Test State Isolation**: Refactored `mcp/src/state/pipeline-manager.test.ts` to execute inside isolated temporary directories, preventing test runs from writing to and polluting the workspace's `.daiharness/` state directory.

### Added
- **Sequence Diagram Generator Update**: Automated sequence diagram generator to trace routes, extract parameters, and map client-to-server call trees using GitNexus.
- **Submodule Auto-Update Check**: Added `scripts/daiharness-submodule-check.sh` to allow projects using DAI Harness as a submodule to automatically check, fetch, and pull DAI Harness updates in their git hooks (pre-commit or post-merge).

## [8.1.0] — 2026-04-29

> **v8.1 — Autonomous Pipeline Hardening (Clarify-to-Deploy)**

### Added
- **Strict Cognitive Rules** (`rules/.tieu-mo-deployment-flow.md`) — Enforced ground truth for the AI orchestrator to prevent DevOps-related hallucinations during Clarify phase.
- **Automated Vercel Project Binding** (`scripts/task-runner.sh`) — Automatically generates `vercel.json` with a sanitized project name before deployment to resolve Vercel directory name collision bugs.
- **HTTP Validation Loop** (`scripts/task-runner.sh`) — Added a self-verifying HTTP ping check after assigning the custom Vercel subdomain to ensure DNS propagation before confirming task completion.
- **Global Memory Injection** — Integrated memory-wrapper injection to ensure the Orchestrator inherently understands the CI/CD boundaries.

## [8.0.0] — 2026-04-13

> **v8.0 — Stability, Resilience, Audit, Quality, Timeout**

### Added

- **Circuit Breaker Protocol** (`skills/_shared/protocols/circuit-breaker.md`) — State machine pattern (CLOSED → OPEN → HALF_OPEN) to prevent cascading failures in parallel dispatch workers.
- **Bulkhead Isolation Protocol** (`skills/_shared/protocols/bulkhead.md`) — Resource limits per worker type (memory, CPU, duration) with failure containment.
- **Verification Protocol** (`skills/_shared/protocols/verification.md`) — 4-level verification framework (Contract Compliance → Acceptance Criteria → Integration → Quality Score).
- **Quality History Schema** (`.daiharness/quality-history.schema.json`) — JSON Schema for tracking quality scores across sessions.
- **Production Config Template** (`.production-grade.yaml.example`) — Example config with circuit breaker, bulkhead, quality gate, middleware chain, and timeout settings.

### Changed

- **Documentation Count Fix** — Mode count corrected to 23 (from 22) in README.md, README.vi.md, CLAUDE.md, AGENTS.md. Protocol count corrected to 27 (from 15) in README.md and README.vi.md badges.
- **Skills Count Fix** — AGENTS.md corrected to "55 AI skills" (from 54).
- **AI Build Mode Simplification** — Removed `"scrape"`, `"crawl website"` triggers and `Web Scraper` skill from AI Build mode. Web Scraper has its own trigger and skill.
- **DEFINE Phase** — Added investigation timeout management (T0 no limit, T0.5 10min, T1 15min, T1.5 15min, T2 20min).
- **TASK Contract JSON Schema** (`skills/_shared/protocols/task-contract.md`) — Added JSON Schema block for contract validation.
- **READ-ONLY Enforcement** (`skills/code-reviewer/SKILL.md`) — Phase 0 enforcement ensuring code-reviewer never modifies source code.
- **Authority Boundary Checks** (`skills/_shared/protocols/guardrail.md`) — SOLE OWASP and SOLE SLO authority enforcement via guardrail custom rules.
- **Enhanced Secret Detection** (`skills/security-engineer/SKILL.md`) — JWT `algorithm: none`, AWS v4 signatures, base64-encoded secrets, env var patterns, hardcoded credentials, connection strings with embedded secrets.
- **Self-Healing Loop** (`skills/production-grade/phases/build.md`) — Error classification → retry protocol (max 3) → rollback → escrow report.

### Security

- Authority boundary enforcement via guardrail custom rules (SOLE OWASP for security-engineer, SOLE SLO for SRE).
- Secret detection patterns expanded with 20+ regex patterns for API keys, JWTs, credentials, and connection strings.

### Internal

- 15 phase and cross-cutting audits completed with 150+ findings. All P0 issues resolved. Breaking changes: 0.

## [7.8.2] — 2026-04-09

> **Quality Overhaul — Stability, CI/CD, Architecture, Maintainability**

### Added

- **Middleware Chain Extraction** (`skills/production-grade/middleware/`) — 10 middleware files extracted from SKILL.md into separate files for maintainability: `01-session-data.md` through `10-graceful-failure.md`. SKILL.md reduced from 1700+ lines to ~400 lines.
- **Modes Reference** (`skills/production-grade/modes/README.md`) — Quick-reference index for all 19 modes, gate counts, skill counts, and shared behaviors.
- **Architecture Decision Records** (`docs/adr/`) — 4 ADRs documenting key decisions: orchestrator separation, KuzuDB read-only MCP, parallel pre-commit, skills count oscillation prevention.
- **Health Monitoring Script** (`scripts/daiharness-node-health.sh`) — Automated index health check, staleness detection, and auto-reindex trigger.
- **CLI Integration Tests** (`scripts/test-cli.sh`) — 16-test suite covering CLI commands, skills system, CI/CD, and version consistency.

### Changed

- **KuzuDB readOnly mode** (`daiharness-node/src/data/db.ts`) — MCP server now opens database in read-only mode, eliminating lock conflicts with concurrent `analyze` CLI runs. Multiple MCP servers across projects can run safely alongside indexing.
- **Pre-commit parallelization** (`.husky/pre-commit`) — Restructured into 2-wave architecture: ESLint + Prettier run in parallel (wave 1), TypeScript + Vitest run in parallel (wave 2). ESLint uses `--cache` for incremental checks. ~2x speedup.
- **GitHub Actions CI parallelization** (`.github/workflows/ci.yml`) — All jobs (`lint-and-format`, `typecheck`, `test`, `commitlint`) now run in parallel. `test-coverage` waits only for `test`. Total CI time reduced significantly.
- **SKILL.md Middleware Table** — Middleware chain now documented with explicit file references, eliminating duplicate inline protocol reading.
- **build.md** — Self-healing loop (up to 5 attempts, search-augmented, escrow report) integrated per `self-healing-execution.md`.
- **DryRun Interceptor** — Added as middleware 03b in the middleware chain table.
- **`ANTIGRAVITY.md` references removed** — Replaced with `CLAUDE.md` in SKILL.md and `phases/sustain.md`.

### Fixed

- **husky version** (`package.json`) — Corrected `husky: "^10.0.0"` (non-existent) to `husky: "^9.1.7"`.
- **typo: `forgwrightVersion`** (`scripts/mcp-generate.sh`, `mcp-generator/templates/`) — Fixed to `dai-harnessVersion` in both script and Handlebars template.
- **Version consistency** — `package.json` `version` field bumped to `7.8.1`, matching `VERSION` file.
- **`mcp-config.json` version** — `dai_harness_version` updated from `7.0.0` to `7.8.1`.
- **MCP server config** — Added `dai-harness-daiharness-node` entry to `.cursor/mcp.json` pointing to local dai-harness repo.

### Dependencies

- **No changes** — All dependency versions unchanged.

### Impact Assessment

- **Breaking changes:** 0
- **Backward compatibility:** 100%
- **Migration required:** None
- **User affected:** Developers using pre-commit hooks (faster), MCP server users (no lock conflicts)

## [7.8.1] — 2026-04-08

> **DAI Harness Node Enterprise — Phase 1-3**

### Added

- **DAI Harness Node Enterprise Features** (Phase 1-3)
  - PR Review with blast radius analysis (`daiharness-node pr-review <base> [head]`)
  - Symbol impact analysis (`daiharness-node impact <symbol>`)
  - OpenAPI contract checking (oasdiff integration)
  - Auto Wiki generation with multi-provider LLM support
  - Auto Reindex workflow (incremental/full)
  - Multi-repo group management (`group contracts`, `group status`, `group query`)
  - Contract verification with oasdiff
  - Cross-repo impact analysis
- **GitHub Actions Workflows** (`.github/workflows/`)
  - `pr-review.yml` — PR blast radius + OpenAPI
  - `auto-wiki.yml` — Auto wiki generation
  - `auto-reindex.yml` — Incremental/full reindex
  - `contract-verification.yml` — OpenAPI breaking changes
  - `multi-repo.yml` — Multi-repo sync
  - `multi-repo-impact.yml` — Cross-repo impact
- **Composite Actions** (`.github/actions/`)
  - `pr-review/action.yml` — PR review action with dry-run
  - `auto-wiki/action.yml` — Wiki generation action
  - `auto-reindex/action.yml` — Reindex action
- **Reusable Workflows** (`.github/workflows/reusable/`)
  - `pr-review.yml` — Reusable PR review workflow
- **Documentation**
  - `.github/README.md` — Tổng hợp tất cả workflows
  - `.github/actions/*/README.md` — Hướng dẫn chi tiết
- **Test Suite** (`scripts/test-cli.sh`)
  - Test tất cả CLI commands

### Impact Assessment

- **Breaking changes:** 0
- **Backward compatibility:** 100%
- **Migration required:** None
- **User affected:** Only users wanting to use Enterprise features

## [7.8.0] — 2026-04-06

> **⚠️ Breaking Change — DAI Harness Node Database Migration**
>
> DAI Harness Node has migrated from `better-sqlite3` to **KuzuDB** (graph database).
> Existing SQLite indexes must be migrated. Run the migration script:
> ```bash
> node daiharness-node/scripts/migrate-sqlite-to-kuzu.js [--dry-run]
> ```

### Added

- **DAI Harness Node Groups** (`daiharness-node/src/data/groups.ts`) — Multi-repo contract tracking. Create named groups, add repos, sync contracts, query cross-repo execution flows. 8 new MCP tools: `group_list`, `group_create`, `group_add`, `group_sync`, `group_contracts`, `group_query`, `group_status`, `group_remove`. CLI: `daiharness-node group <list|create|add|remove|sync>`.
- **Claude Code Hooks** (`daiharness-node/.claude/hooks/`) — Auto-install on `daiharness-node setup`: `pre-tool-use.ts` enriches grep/search context with graph data; `post-tool-use.ts` auto-reindexes after git commits.
- **SQLite → KuzuDB Migration Script** (`daiharness-node/scripts/migrate-sqlite-to-kuzu.js`) — Automated migration for existing DAI Harness Node SQLite indexes. Run with `--dry-run` to preview.
- **README Mermaid Diagrams** — 7 diagrams replacing ASCII art: Architecture Overview, Middleware Chain, Session Lifecycle, DAI Harness Node Analyze Pipeline, Multi-Repo Group Management, Claude Code Hooks Flow, Request → Mode → Skills Routing.

### Changed

- **DAI Harness Node Database Backend** (`daiharness-node/src/data/db.ts`, `schema.ts`, `registry.ts`) — Replaced `better-sqlite3` with `kuzu ^0.11.3`. Schema migrated from single `nodes`/`edges` tables to per-type node tables (CodeNode, Community, Process) and per-edge-type rel tables (CALLS, IMPORTS, EXTENDS, etc.). KuzuDB handles FTS and vector extensions natively.
- **Husky Git Hooks** (`.husky/`) — Upgraded from v9 to v10. All hook scripts updated to use `#!/usr/bin/env sh` + source `husky.sh`. `husky.sh` rewritten with v10-compatible bootstrap logic.
- **ESLint + Security Fixes** (`daiharness-node/src/analysis/detect-changes.ts`, prompts) — Fixed 34 ESLint errors (unused vars, prefer-const, no-useless-escape, no-extra-semi, dead code). Added security overrides for `esbuild ^0.25.0` and `minimatch ^9.0.5`. Fixed 2 critical prompt bugs: `checkStaleness` variable interpolation and `detect_impact` template literal.
- **Prettier Format** — Reformatted all 32 source files.
- **Root-Level Scripts** (`package.json`) — Added `build:daiharness-node`, `test:daiharness-node`, `lint:daiharness-node`, `format:daiharness-node`, `build:cli`, `dev:cli`, `typecheck:cli`.

### Dependencies

- **Removed:** `better-sqlite3`, `@types/better-sqlite3`
- **Added:** `kuzu ^0.11.3` (graph DB with FTS + vector extensions)
- **Added overrides:** `esbuild ^0.25.0`, `minimatch ^9.0.5`

## [7.7.1] — 2026-04-06

### Added

- **DAI Harness Node 2.1.0** (`daiharness-node/`) — Parallel worker threads, Leiden algorithm, binding propagation, suffix trie, incremental FTS, embedding cache, early-exit optimization, 15+ framework detection

### Changed

- **DAI Harness Node README** — Full 9-phase pipeline architecture diagram, expanded features table, performance comparison vs original pipeline, GitNexus integration docs
- **VERSION** — Bumped to 7.7.1
- **Version badge** in README, AGENTS.md

## [7.7.0] — 2026-04-02

### Added

- **DAI-Harness MCP Server** (`mcp/`) — Global MCP server v1.0.0 with PipelineManager, SkillParser, PromptEngine. Enables Claude/Cursor AI assistants to interact with DAI Harness pipeline across all projects. Listens on stdio via Model Context Protocol SDK.
- **GitHub Actions CI/CD** (`.github/workflows/ci.yml`) — Full pipeline: ESLint, Prettier format-check, TypeScript build, Vitest unit tests with v8 coverage, coverage threshold gate, commitlint on PRs.
- **Dev tooling** (`mcp/`) — ESLint with TypeScript ESLint plugin, Prettier formatting, Vitest test runner, commitlint for Conventional Commits, `.eslintrc.json`, `.prettierrc`, `vitest.config.ts` with pool: forks.
- **Husky Git hooks** (`.husky/`) — Pre-commit hook (ESLint + Prettier + TypeScript + Vitest), commit-msg hook for commitlint. Root `package.json` with `prepare: husky install` for auto-initialization on clone.
- **Global Setup Script** (`scripts/setup-project.sh`) — Links DAI Harness to any project without git submodule. Detects tech stack, runs DAI Harness Node analyze, prints Cursor MCP config snippet.
- **GitHub Templates** (`.github/`) — Issue templates (bug report, feature request), PR template with DAI Harness pipeline checklist.
- **Cursor Subagent Review Workflow** (`.cursor/agents/`) — 5 specialized subagents: quality-reviewer, security-auditor, spec-reviewer, verifier, chat-interpreter for structured code review.
- **DAI Harness Node MCP Tools** (via MCP server) — `daiharness_node_query`, `daiharness_node_context`, `daiharness_node_impact`, `daiharness_node_detect_changes`, `daiharness_node_rename`, `daiharness_node_cypher` for code intelligence.
- **Auto-initialization Check** — MCP server and DAI Harness Node index auto-initialize on session start if `.daiharness/mcp-server/mcp-config.json` is missing.
- **Antigravity Plugin** (`.antigravity/`) — Production-grade plugin system with 52 skills, 15 shared protocols, preset templates, game dev workflows.

### Changed

- **Skill count** — 48 skills (corrected after oscillation 52 → 53 → 52)
- **README** — Added Mermaid flow diagrams for pipeline, subagent review, parallel dispatch; version badge bumped to 7.7.0
- **VERSION** — Bumped to 7.7.0
- **AGENTS.md** — Updated skill count to 52, skill directory table
- **CI pipeline** — Skills updated with activation rules, parallel-dispatch with Mermaid diagrams

### Fixed

- `.vite` build cache ignored in `.gitignore`
- `mcp/node_modules/` tracked artifacts removed (added to `.gitignore`)
- DAI Harness Node code intelligence block updated with `npx daiharness-node analyze` refresh note


## [7.0.0] — 2026-03-14

### Added — New Protocols (5)
- **Project Onboarding** (`project-onboarding.md`) — 5-phase deep project analysis: fingerprint → health check → pattern analysis → risk assessment → profile generation. Produces `.daiharness/project-profile.json` and `.daiharness/code-conventions.md`.
- **Session Lifecycle** (`session-lifecycle.md`) — Cross-session continuity with start/save/end hooks. Resume interrupted sessions, detect drift, memory integration.
- **Quality Gate** (`quality-gate.md`) — Universal per-skill validation: 4 levels (Build, Regression, Standards, Traceability), 0-100 quality scoring, configurable thresholds. Works in sequential AND parallel modes.
- **Brownfield Safety** (`brownfield-safety.md`) — Safety net: auto git branching, baseline snapshots, protected paths, change manifest, regression checks, rollback.
- **Quality Dashboard** (`quality-dashboard.md`) — Real-time tracking, final dashboard, machine-readable JSON reports, cross-session trending, early warning system.

### Added — Workflow
- `/onboard` — Run deep project analysis without starting pipeline.

### Added — Project State
- `.daiharness/` directory for persistent project state (profile, conventions, session logs, quality reports).

### Changed — Orchestrator
- **Session lifecycle pre-flight (Step 0.5)** — Loads project profile, session state, memory context, quality trends before work begins.
- **Enhanced codebase discovery** — Deep onboarding replaces shallow scanning for brownfield. Learns patterns, conventions, risk.
- **Context-aware routing** — Suggests addressing health issues before building (failing tests, CVEs, tech debt).
- **Quality gate integration** — Runs after EVERY skill. Mini-scorecard + aggregate at gates.
- **Brownfield safety net** — Auto-activates for all brownfield projects in any mode.
- **Session lifecycle hooks** — PHASE_COMPLETE, TASK_COMPLETE, GATE_DECISION, ERROR hooks throughout.
- **Quality Dashboard final summary** — Replaces legacy text banner with comprehensive report.
- **5 new common mistakes** added.

### Changed — Phase Dispatchers
- **BUILD phase** — Quality gate & regression checks after each task. Change manifest. Brownfield regression at completion.
- **HARDEN phase** — Quality gate per task, quality scoring in summary, brownfield merge readiness check.

### Changed — Memory Manager
- **Active lifecycle hooks** — Orchestrator now calls memory at 6 lifecycle points (was spec-only).
- **Context integration** — Memory + project profile provide full context without re-scanning.

### Changed — Metadata
- **Skill count** — 46 skills unchanged
- **Protocol count** — 7 → 12 (added 5 new protocols)
- **Version** — 6.1.0 → 7.0.0

## [5.2.0] — 2026-03-10

### Added
- **Parallel dispatch** — Git worktree-based parallel task execution. Independent tasks (BUILD: T3a/T3b/T3c, HARDEN: T5/T6a/T6b) run in isolated worktrees simultaneously.
- **Task Contract protocol** — JSON-based contract defining exact input/output/constraints for each parallel worker. Workers can only read listed files and write to allowed directories.
- **Task Validator protocol** — 7-step post-execution validation: contract compliance, boundary violations, forbidden patterns, build check, test check, import verification, API/schema conformance.
- **Merge Arbiter protocol** — Ordered merge strategy with auto-resolution for configs (package.json, docker-compose.yml), integration testing, and per-branch rollback.
- **Worktree Manager script** — Shell script managing git worktree lifecycle: create, status, validate, merge, cleanup, resume.
- **Scope Analysis Engine** — Analyzes project complexity (5-factor weighted score), estimates execution time for both modes, assesses 6 risk categories, and generates data-driven recommendation.
- **Anti-hallucination pipeline** — 6-layer defense: contract boundaries → forbidden pattern grep → build verification → test execution → import path resolution → API/schema conformance.
- **`init-parallel` setup command** — Convenience command that symlinks worktree-manager and updates .gitignore.
- **Checkpoint & resume** — Failed parallel workers preserve state in worktree for retry from checkpoint.

### Changed
- **Skill count** — 17 → 18 (added `parallel-dispatch` orchestrator skill).
- **Protocol count** — 4 → 7 (added task-contract, task-validator, merge-arbiter).
- **Execution strategy** — Orchestrator now presents scope analysis with complexity scoring, time estimates, and risk predictions before asking user to choose parallel or sequential.
- **BUILD phase** — Supports parallel mode via parallel-dispatch skill dispatch.
- **HARDEN phase** — Supports parallel mode with strict authority boundary enforcement in contracts.
- **AGENTS.md** — Updated with parallel-dispatch skill and new protocol references.

## [5.0.0] — 2026-03-06

### Changed
- **Migrated to Antigravity** — complete platform migration from Claude Code to Antigravity.
- All Claude Code-specific APIs replaced with Antigravity equivalents:
  - `AskUserQuestion` → `notify_user` with markdown numbered options
  - `Agent()` parallel sub-agents → sequential skill execution
  - `Skill()` invocation → direct SKILL.md reading and instruction following
  - `TeamCreate/TaskCreate/TaskUpdate/TeamDelete` → `task.md` tracking + `task_boundary`
  - `WebSearch/WebFetch` → `search_web/read_url_content`
  - `Read/Write/Edit/Glob/Grep` → `view_file/write_to_file/replace_file_content/find_by_name/grep_search`
  - `smart_outline/smart_unfold/smart_search` → `view_file_outline/view_code_item/grep_search`
  - `Bash` → `run_command`
- **Workspace directory** renamed: `Claude-Production-Grade-Suite/` → `Antigravity-Production-Grade-Suite/`
- **Config file** reference: `CLAUDE.md` → `ANTIGRAVITY.md`
- **Skill installation** simplified: skills load directly from `skills/` directory, no marketplace needed
- **Skill Maker** simplified: removed plugin packaging (Phase 3) and marketplace registration (Phase 5), skills install directly to `skills/` directory
- **Parallel execution removed** — Antigravity executes skills sequentially. Architecture quality (14 specialized skills, authority hierarchies, approval gates) is fully preserved.
- Author updated to `antigravity-code`
- All 50+ markdown files across 14 skills updated with new tool references and branding

## [4.2.0] — 2026-03-06

### Added
- **Adaptive routing** — orchestrator now analyzes the user's request and routes to the right skills automatically. No longer requires full pipeline for every task.
- **10 execution modes**: Full Build, Feature, Harden, Ship, Test, Review, Architect, Document, Explore, Optimize, Custom. Each with appropriate skill composition, gates, and parallelism.
- **Request classification** — automatic intent detection maps user requests to modes. "Add auth to my API" → Feature mode (PM + Architect + Backend + QA). "Review my code" → Review mode (Code Reviewer only).
- **Execution plan presentation** — user sees which skills will run and can adjust, escalate to full pipeline, or proceed.
- **Custom mode** — multi-select skill menu for requests that don't fit standard patterns.
- **Lightweight mode execution** — non-Full-Build modes skip unnecessary overhead (engagement/parallelism prompts only for 3+ skill modes).

### Changed
- Plugin description broadened from "build a complete production-ready system" to "any software engineering work that benefits from structured, production-quality execution."
- "When to Use" expanded to cover: adding features, hardening, deploying, testing, reviewing, documenting, optimizing, exploring — not just greenfield builds.
- Full Build pipeline preserved unchanged as one mode within the adaptive orchestrator.

## [4.1.0] — 2026-03-05

### Added
- **Engagement modes** — 4-level interaction depth (Express, Standard, Thorough, Meticulous) chosen at pipeline start.
- **Architecture Fitness Function** — Solution Architect now DERIVES architecture from constraints instead of picking templates.
- **Scale & Fitness Interview** — Adaptive 1-4 round interview (depth scales with engagement mode).
- **Adaptive PM interview** — Express: 2-3 questions. Standard: 3-5. Thorough: 5-8. Meticulous: 8-12.

### Changed
- **Engagement mode propagated to ALL 14 skills** — every skill reads `settings.md` and adapts decision surfacing.
- Solution Architect Phase 1 rewritten from 5 shallow questions to a comprehensive adaptive discovery process.
- Product Manager Phase 1 rewritten with 4 interview depth profiles matching engagement modes.
- **Software Engineer parallelism revised** — shared foundations established SEQUENTIALLY before parallel service agents.
- **Frontend Engineer parallelism revised** — UI Primitives built SEQUENTIALLY first, then Layout + Features parallel.

## [4.0.0] — 2026-03-05

### Changed
- **Two-wave parallel execution** — orchestrator splits work into Wave A (build + analysis) and Wave B (execution against code).
- **Internal skill parallelism** — 8 skills now spawn parallel Agents for independent work units.
- **Dynamic task generation** — orchestrator reads architecture output and creates tasks accordingly.

### Added
- **Parallelism preference** — user selects performance mode at pipeline start.
- **Token economics** — parallel execution is both faster AND cheaper.

## [3.3.0] — 2026-03-05

### Added
- **Brownfield awareness** — orchestrator detects greenfield vs existing codebase at startup.
- **Codebase discovery** — parallel scan of project root for package.json, go.mod, etc.

### Changed
- **MECE intent-based skill routing** — all 14 skill descriptions rewritten from keyword triggers to intent descriptions.

### Fixed
- **Protocol loading crash** — added `|| true` fallback.
- **Polymath priority** — uncertainty expressions now correctly route to polymath.

## [3.2.0] — 2026-03-05

### Added
- **Auto-update with consent** — orchestrator checks for new versions on pipeline start.

### Fixed
- **Protocol loading crash** — added `|| true` fallback to all `cat` commands.
- **MECE intent-based skill routing** — replaced keyword trigger matching with intent descriptions.

## [3.1.0] — 2026-03-05

### Added
- **Polymath co-pilot** — the 14th skill. Thinks with you before, during, and after the pipeline.
- 6 Polymath modes: onboard, research, ideate, advise, translate, synthesize.

## [3.0.0] — 2026-03-04

### Changed
- **Full rewrite** — shared protocols, 4 protocols, sole-authority conflict resolution.
- Large skills split into router + on-demand phases for 65% token savings.

### Added
- Phase-based skill splitting for 7 skills.
- Conditional task execution: frontend auto-skip, data-scientist auto-detect.
- Partial execution: "just define", "just build", "just harden", "just ship", "just document".

## [2.0.0] — 2026-03-04

### Changed
- **Bundle all 13 skills** into a single plugin install.
- Unified workspace architecture.
- Prescriptive UX Protocol enforced across all skills.

### Added
- Skill Maker as pipeline phase.
- VISION.md: ten principles governing the ecosystem.

## [1.0.0] — 2026-03-03

### Added
- Initial release: production-grade orchestrator plugin.
- 12 specialized agent skills coordinated through dependency graph.
- 3 approval gates, autonomous execution between gates.
- DEFINE > BUILD > HARDEN > SHIP > SUSTAIN pipeline.
