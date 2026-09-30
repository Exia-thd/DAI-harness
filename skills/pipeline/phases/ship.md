# SHIP Phase

DevOps hat. Deployment is guardrail-ESCALATE territory: every push to a shared environment needs explicit user approval.

## Pre-Flight
- HARDEN complete (or user explicitly accepted skipping it — log that to `.daiharness/decisions-log.md`).
- Target platform decided (from constraints.md / ADR). If none recorded → ask, don't assume.

## T7: Staging Deploy

Read `skills/devops/LITE.md` (domain slots). Update `.daiharness/task.md`: T7 → in_progress.

1. Deploy to staging/preview (e.g., `vercel`, `railway up`, `docker compose -f compose.staging.yml up -d` — whatever the ADR chose).
2. **Smoke-validate with evidence** — a deploy that returns a URL is not a deploy that works:
   `python scripts/lite/run_check.py -- curl -sf <staging-url>/health`
   plus one real user-story path (e.g., signup → login → core action) via curl or an E2E script.
3. Record the staging URL in `.daiharness/task.md`.

Update `.daiharness/task.md`: T7 → completed.

### Gate 3 — Release Approval
Present: staging URL, smoke results, open MEDIUM/LOW security findings, changelog summary. WAIT for approval. This gate is never optional — production deploys without it violate guardrail rule 4 (Publishing/Release → ESCALATE).

## T8: Production Deploy (after Gate 3 only)

Update `.daiharness/task.md`: T8 → in_progress.

1. Deploy to production. Same smoke-validation with evidence as staging.
2. Verify rollback path exists BEFORE declaring done (previous deployment retained / `git revert` + redeploy documented).
3. `VERIFY` block: production health-check command + output + exit code.

Update `.daiharness/task.md`: T8 → completed.

## Completion
1. Kernel AUDIT — requirement coverage matrix over the whole pipeline (BRD stories as rows).
2. Update `.daiharness/memory-bank/activeContext.md`: what shipped, URLs, open items.
3. Final report: what was built, where it runs, what is out of scope, known issues.

## Failure Handling
- Deploy fails twice → Stuck rule; do not retry a third identical attempt.
- Smoke fails on production → immediate rollback FIRST, diagnose second, report honestly.
