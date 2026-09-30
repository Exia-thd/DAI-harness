import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { ProcessPolicyEvaluator } from './guardrail.js';

// The bash policy gate parses YAML with jq. Where jq is absent the script exits
// with a configuration error before any policy logic runs, so these two cases
// cannot be exercised — skipped with a reason rather than failed. They run
// unchanged on any machine that has jq.
const HAS_JQ = (() => {
  const probe = spawnSync('jq', ['--version'], { stdio: 'ignore', shell: true });
  return probe.status === 0;
})();
const itJq = HAS_JQ ? it : it.skip;

function policyScript(body: string): { root: string; script: string } {
  const root = mkdtempSync(join(tmpdir(), 'dai-harness-policy-evaluator-'));
  const script = join(root, 'policy-check.sh');
  writeFileSync(script, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o700 });
  return { root, script };
}

describe('ProcessPolicyEvaluator', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [0, 'allow'],
    [1, 'block'],
    [2, 'warn'],
    [3, 'config-error'],
  ] as const)('maps policy exit %s to %s', async (exitCode, action) => {
    const { root, script } = policyScript(`echo policy-result >&2\nexit ${exitCode}`);
    const evaluator = new ProcessPolicyEvaluator({ scriptPath: script, cwd: root });

    await expect(evaluator.evaluate('Bash', { cmd: 'echo ok' })).resolves.toMatchObject({ action });
  });

  it('distinguishes a fail-closed policy configuration error from a normal denial', async () => {
    const { root, script } = policyScript(
      'echo "Execution policy is missing, unreadable, empty, or malformed" >&2\nexit 1',
    );
    const evaluator = new ProcessPolicyEvaluator({ scriptPath: script, cwd: root });

    await expect(evaluator.evaluate('Bash', { cmd: 'echo ok' })).resolves.toMatchObject({
      action: 'config-error',
    });
  });

  it('passes tool data as literal argv without shell interpolation', async () => {
    const { root, script } = policyScript('exit 0');
    const marker = join(root, 'injected');
    const evaluator = new ProcessPolicyEvaluator({ scriptPath: script, cwd: root });

    await evaluator.evaluate('Bash', { cmd: `touch ${marker}; $(touch ${marker})` });

    expect(existsSync(marker)).toBe(false);
  });

  it('passes shell command fields in the form expected by the policy parser', async () => {
    const { root, script } = policyScript('[[ "$3" = "git -C . reset --hard" ]] || exit 3\nexit 1');
    const evaluator = new ProcessPolicyEvaluator({ scriptPath: script, cwd: root });

    await expect(
      evaluator.evaluate('Bash', { cmd: 'git -C . reset --hard' }),
    ).resolves.toMatchObject({ action: 'block' });
  });

  itJq('resolves workspace policy and DAI Harness script from launcher environment', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dai-harness-launcher-layout-'));
    const workspace = join(root, 'workspace');
    const daiHarnessDir = join(root, 'dai-harness');
    const script = join(daiHarnessDir, 'scripts/lite/policy-check.sh');
    mkdirSync(join(workspace, '.daiharness'), { recursive: true });
    mkdirSync(join(daiHarnessDir, 'scripts/lite'), { recursive: true });
    writeFileSync(join(workspace, '.daiharness/execution-policy.yaml'), 'mode: strict\n');
    writeFileSync(
      script,
      [
        '#!/usr/bin/env bash',
        '[[ "$(pwd -P)" = "$(cd "$DAIHARNESS_WORKSPACE" && pwd -P)" ]] || exit 3',
        '[[ "$DAIHARNESS_POLICY_FILE" = "$DAIHARNESS_WORKSPACE/.daiharness/execution-policy.yaml" ]] || exit 3',
        'exit 0',
      ].join('\n'),
      { mode: 0o700 },
    );
    vi.stubEnv('DAIHARNESS_WORKSPACE', workspace);
    vi.stubEnv('DAIHARNESS_DIR', daiHarnessDir);
    vi.stubEnv('DAIHARNESS_POLICY_FILE', '');

    const evaluator = new ProcessPolicyEvaluator();

    const evaluation = await evaluator.evaluate('Bash', { cmd: 'echo safe' });
    expect(evaluation, evaluation.reason).toMatchObject({ action: 'allow' });
  });

  it('discovers the nearest workspace ancestor when launched from its mcp directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dai-harness-cwd-layout-'));
    const mcpDirectory = join(root, 'mcp');
    const script = join(root, 'scripts/lite/policy-check.sh');
    mkdirSync(join(root, '.daiharness'), { recursive: true });
    mkdirSync(join(root, 'scripts/lite'), { recursive: true });
    mkdirSync(mcpDirectory);
    writeFileSync(join(root, '.daiharness/execution-policy.yaml'), 'mode: strict\n');
    writeFileSync(
      script,
      [
        '#!/usr/bin/env bash',
        '[[ "$(cd "$(dirname "$DAIHARNESS_POLICY_FILE")/.." && pwd -P)" = "$(pwd -P)" ]] || exit 3',
        'exit 0',
      ].join('\n'),
      { mode: 0o700 },
    );
    vi.stubEnv('DAIHARNESS_WORKSPACE', '');
    vi.stubEnv('DAIHARNESS_DIR', '');
    vi.stubEnv('DAIHARNESS_POLICY_FILE', '');

    // This case is about workspace-ancestor discovery, not the policy
    // deadline. The 2s production default is not enough to spawn bash on a
    // loaded Windows box, so the evaluator returned config-error and a
    // discovery test failed for a reason it never meant to measure. The
    // deadline itself is asserted separately, by the timeoutMs: 20 case below.
    const evaluator = new ProcessPolicyEvaluator({
      cwd: mcpDirectory,
      timeoutMs: 30_000,
    });

    await expect(evaluator.evaluate('Bash', { cmd: 'echo safe' })).resolves.toMatchObject({
      action: 'allow',
    });
    // The test's own budget must exceed the evaluator's deadline above, or the
    // 30s deadline is unreachable and vitest's 10s default fails the case
    // before the evaluator can answer — reporting a timeout instead of the
    // discovery result this case exists to assert.
  }, 60_000);

  itJq(
    'uses the canonical policy script when generated MCP config has no DAIHARNESS_DIR',
    async () => {
      const home = mkdtempSync(join(tmpdir(), 'dai-harness-canonical-home-'));
      const workspace = join(home, 'workspace');
      const script = join(home, '.daiharness/scripts/lite/policy-check.sh');
      mkdirSync(join(workspace, '.daiharness'), { recursive: true });
      mkdirSync(join(home, '.daiharness/scripts/lite'), { recursive: true });
      writeFileSync(join(workspace, '.daiharness/execution-policy.yaml'), 'mode: strict\n');
      writeFileSync(script, '#!/usr/bin/env bash\n[[ "$1" = "check" ]] || exit 3\nexit 0\n', {
        mode: 0o700,
      });
      vi.stubEnv('HOME', home);
      vi.stubEnv('DAIHARNESS_WORKSPACE', workspace);
      vi.stubEnv('DAIHARNESS_DIR', '');
      vi.stubEnv('DAIHARNESS_POLICY_FILE', '');

      const evaluator = new ProcessPolicyEvaluator();

      await expect(evaluator.evaluate('Bash', { cmd: 'echo safe' })).resolves.toMatchObject({
        action: 'allow',
      });
    },
  );

  it('returns config-error when the policy process times out', async () => {
    const { root, script } = policyScript('sleep 2');
    const evaluator = new ProcessPolicyEvaluator({ scriptPath: script, cwd: root, timeoutMs: 20 });

    await expect(evaluator.evaluate('Bash', { cmd: 'echo ok' })).resolves.toMatchObject({
      action: 'config-error',
      reason: expect.stringContaining('timed out'),
    });
  });

  it('returns config-error when policy output exceeds the configured bound', async () => {
    const { root, script } = policyScript("printf '%0200d' 0");
    const evaluator = new ProcessPolicyEvaluator({
      scriptPath: script,
      cwd: root,
      maxOutputBytes: 32,
    });

    await expect(evaluator.evaluate('Bash', { cmd: 'echo ok' })).resolves.toMatchObject({
      action: 'config-error',
      reason: expect.stringContaining('output limit'),
    });
  });
});
