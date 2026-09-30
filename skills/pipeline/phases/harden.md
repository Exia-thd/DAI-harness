# HARDEN Phase

Three hats: QA Engineer → Security Engineer → Code Reviewer. REVIEW/TEST modes run only their own section.

## T5: QA Engineer

Read `skills/qa-engineer/LITE.md` (domain slots). Update `.daiharness/task.md`: T5 → in_progress.

1. Write the test plan to `.daiharness/qa/test-plan.md`: map every BRD user story → at least one test. Uncovered story = gap, listed explicitly.
2. Beyond happy paths, cover: boundary values, empty/null inputs, unauthorized access, concurrent access where relevant, malformed payloads against the API contract.
3. Evidence: `python scripts/lite/run_check.py -- <full test suite command>` — exit 0 required.
4. Flaky test ≠ passing test. A test that needs retries is a finding.

Update `.daiharness/task.md`: T5 → completed.

## T6a: Security Engineer

Read `skills/security-engineer/LITE.md` (domain slots). Update `.daiharness/task.md`: T6a → in_progress. Security context = HARD by ESCALATE checklist; slow down accordingly.

Checklist → findings to `.daiharness/security/findings.md` (severity: CRITICAL/HIGH/MEDIUM/LOW):
1. **Secrets**: no keys/passwords in source or git history (`git log -p | grep`-style scan; the run_check redactor is a net, not an excuse).
2. **Injection surface**: every external input (HTTP params, headers, file uploads, env) validated; parameterized queries only.
3. **AuthN/AuthZ**: every non-public endpoint checks identity AND permission; test at least one forbidden-access case.
4. **Dependencies**: `npm audit` / `pip-audit` — evidence via run_check.
5. **Headers/transport**: TLS assumptions, CORS not `*` with credentials, cookies HttpOnly/Secure where used.

CRITICAL or HIGH findings → fix now, re-run T5 suite. MEDIUM/LOW → list at Gate 3, user decides.

Update `.daiharness/task.md`: T6a → completed.

## T6b: Code Reviewer (fresh context)

Read `skills/code-reviewer/LITE.md` (domain slots). Update `.daiharness/task.md`: T6b → in_progress.

- Adversarial review per kernel SOLVE §6.7: reviewer sees ONLY the diff + the BRD — not the build reasoning. Use a subagent if the host supports it; otherwise write the review in a fresh pass pretending no context.
- Review against: BRD coverage, contract conformance, error handling, naming/idiom consistency with surrounding code, dead code, TODO/FIXME stubs (the gate blocks these anyway).
- Findings → fix or explicitly defer with the user at Gate 3.

Update `.daiharness/task.md`: T6b → completed.

## Completion
1. One `VERIFY` block: full suite green after all fixes.
2. FULL_BUILD mode → read `phases/ship.md`. FEATURE mode → run kernel AUDIT and deliver.
