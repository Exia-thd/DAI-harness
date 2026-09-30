---
id: expert-cli-mode
title: Expert CLI Mode Protocol
summary: Core protocol for expert cli mode.
status: active
version: 1.0.0
owners: [core]
triggers: []
used_by: [all]
related: []
supersedes: []
superseded_by: null
---
<!-- source: skills/_shared/protocols/expert-cli-mode.md -->

# Expert CLI Mode Protocol

> Purpose: optionally escalate high-stakes planning, review, and gate decisions to a locally installed Claude CLI or Codex CLI without requiring multiple providers or making premium-model usage the default.

## Core Rules

1. Expert CLI mode is opt-in. Default is disabled.
2. Only `claude` and `codex` CLI backends are supported.
3. A single CLI is sufficient. Do not require or assume a fallback provider.
4. Do not auto-switch providers unless `fallbackCli` is explicitly configured.
5. Missing CLI is a soft failure: warn, log the decision, and continue with normal pipeline behavior.
6. Token tracking is independent. Expert mode can enable it with `--track-tokens`, but `dai token on` remains the standalone control.

## Commands

```bash
dai expert status
dai expert on
dai expert off
dai expert use claude
dai expert use codex
dai expert test
dai expert budget --max-calls 5
dai expert gates on
dai expert gates off

dai token status
dai token on
dai token off
dai token budget --daily 5 --weekly 25 --monthly 80
dai token report --period day
dai token dashboard
```

`fw` aliases may call the same command groups if the installation provides a wrapper, but the canonical CLI binary in this repository is `dai`.

## Configuration

```yaml
expertMode:
  enabled: false
  activeCli: "claude" # claude | codex
  fallbackCli: null   # null | claude | codex
  useFor:
    planning: false
    failedPlanReview: true
    gates: true
    securityReview: true
    architectureReview: true
    codeReview: true
  budget:
    maxExpertCallsPerRun: 5
    requireConfirmationAbove: 3

token_tracking:
  enabled: false
  log_dir: "~/.daiharness/usage"
  export_format: jsonl
```

## Escalation Triggers

Use expert CLI only when `expertMode.enabled: true`.

| Trigger | Default |
|---------|---------|
| Initial planning | Off |
| Plan score below 9.0 after first pass | On |
| Gate 1/2/3 review | On |
| Security review for high-risk changes | On |
| Architecture review for cross-module changes | On |
| Code review for shared logic changes | On |

## Decision Log

Every expert-mode routing decision should be logged to:

```text
.daiharness/expert-cli-decisions.jsonl
```

Recommended fields:

```json
{
  "timestamp": "ISO-8601",
  "trigger": "gate-2",
  "activeCli": "codex",
  "fallbackCli": null,
  "usedExpertCli": true,
  "reason": "Architecture gate requires high-stakes review",
  "result": "pass"
}
```

## Token Tracking

`dai token on` enables local token tracking for DAI Harness logs and expert CLI decision accounting. It does not delete or modify existing usage data. `dai token off` only disables future tracking.

When expert mode is enabled with `--track-tokens`, run the equivalent of:

```bash
dai token on
```

before the expert-mode configuration is saved.
