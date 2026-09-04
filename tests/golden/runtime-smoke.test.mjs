import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const script = join(root, 'scripts', 'ci', 'verify-runtime-smoke.mjs');

// npm ships as npm.cmd on Windows; execFileSync does not append the extension
// and fails with ENOENT on a bare `npm`.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!process.argv.includes('--skip-build')) {
  execFileSync(npm, ['--prefix', 'mcp', 'run', 'build'], {
    cwd: root,
    stdio: 'pipe',
    // Node will not execute a .cmd shim directly; it needs the shell.
    shell: process.platform === 'win32',
  });
}
const mcpOnly = spawnSync(process.execPath, [script, '--mcp-only'], { cwd: root, encoding: 'utf8' });
assert.equal(mcpOnly.status, 0, mcpOnly.stderr);
assert.equal(JSON.parse(mcpOnly.stdout).mcp.nonMutatingTool, 'fw_get_current_phase');

const denied = spawnSync(process.execPath, [script, '--live'], { cwd: root, encoding: 'utf8', env: { ...process.env, DAINEXUS_LIVE_SMOKE: '' } });
assert.notEqual(denied.status, 0);
assert.match(denied.stderr, /DAINEXUS_LIVE_SMOKE=1/);

const missingKey = spawnSync(process.execPath, [script, '--live'], { cwd: root, encoding: 'utf8', env: { ...process.env, DAINEXUS_LIVE_SMOKE: '1', DAINEXUS_LIVE_SMOKE_PROVIDER: 'gemini-api', GEMINI_API_KEY: '' } });
assert.notEqual(missingKey.status, 0);
assert.match(missingKey.stderr, /GEMINI_API_KEY is required/);
console.log('runtime smoke guardrails passed');
