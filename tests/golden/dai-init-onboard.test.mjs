import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// npm ships as npm.cmd on Windows; execFileSync does not append the extension
// and fails with ENOENT on a bare `npm`. runtime-smoke already does this.
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const cliPath = join(repoRoot, "src/cli/dist/index.js");
const fixtureRoot = mkdtempSync(join(tmpdir(), "dai-nexus-golden-"));
const startedAt = Date.now();

function runDai(...args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: { ...process.env, FORGE_DELEGATION_NOTICE: "0" },
  });
  assert.equal(result.stderr, "", result.stderr);
  assert.notEqual(result.stdout, "", "dai must emit a JSON envelope");
  return { ...result, envelope: JSON.parse(result.stdout) };
}

function assertEnvelope(result, tool, ok = true) {
  const expectedStatus = ok ? 0 : result.envelope.error.code;
  assert.equal(result.status, expectedStatus, result.stdout);
  assert.equal(result.envelope.ok, ok);
  assert.equal(result.envelope.tool, tool);
  assert.equal(typeof result.envelope.metadata.duration_ms, "number");
  assert.equal(typeof result.envelope.metadata.version, "string");
}

try {
  execFileSync(npm, ["--prefix", "src/cli", "run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    // Node will not execute a .cmd shim directly; it needs the shell.
    shell: process.platform === "win32",
  });

  const target = join(fixtureRoot, "sample-app");
  mkdirSync(target, { recursive: true });

  const init = runDai("--json", "init", target);
  assertEnvelope(init, "dai.init");
  assert.equal(init.envelope.data.status, "created");
  assert.deepEqual(readdirSync(join(target, ".dainexus")), ["project.json"]);
  const manifestPath = join(target, ".dainexus", "project.json");
  const manifestBytes = readFileSync(manifestPath, "utf8");

  const initAgain = runDai("--json", "init", target);
  assertEnvelope(initAgain, "dai.init");
  assert.equal(initAgain.envelope.data.status, "already_exists");
  assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes);

  writeFileSync(manifestPath, "{\"sentinel\":true}\n");
  const forcedInit = runDai("--json", "init", target, "--force");
  assertEnvelope(forcedInit, "dai.init");
  assert.equal(forcedInit.envelope.data.status, "overwritten");
  assert.equal(readFileSync(manifestPath, "utf8"), manifestBytes);

  const missingManifestTarget = join(fixtureRoot, "missing-manifest");
  mkdirSync(missingManifestTarget, { recursive: true });
  const missingManifest = runDai("--json", "onboard", missingManifestTarget);
  assertEnvelope(missingManifest, "dai.onboard", false);
  assert.equal(missingManifest.envelope.error.code, 3);
  assert.equal(missingManifest.envelope.error.details.reason, "MANIFEST_REQUIRED");

  mkdirSync(join(target, ".git"));
  writeFileSync(
    join(target, "package.json"),
    JSON.stringify({ name: "sample-app", scripts: { test: "vitest run" } }),
  );
  writeFileSync(join(target, "package-lock.json"), "{}\n");

  const onboard = runDai("--json", "onboard", target);
  assertEnvelope(onboard, "dai.onboard");
  assert.equal(onboard.envelope.data.status, "created");
  const profilePath = join(target, ".dainexus", "project-profile.json");
  const profileBytes = readFileSync(profilePath, "utf8");
  assert.deepEqual(JSON.parse(profileBytes), {
    schema_version: 1,
    facts: {
      git_present: true,
      package_json_present: true,
      lockfiles: ["package-lock.json"],
      declared_test_script: "vitest run",
    },
  });

  const onboardAgain = runDai("--json", "onboard", target);
  assertEnvelope(onboardAgain, "dai.onboard");
  assert.equal(onboardAgain.envelope.data.status, "already_exists");
  assert.equal(readFileSync(profilePath, "utf8"), profileBytes);

  writeFileSync(profilePath, "{\"sentinel\":true}\n");
  const protectedOnboard = runDai("--json", "onboard", target);
  assertEnvelope(protectedOnboard, "dai.onboard");
  assert.equal(protectedOnboard.envelope.data.status, "already_exists");
  assert.equal(readFileSync(profilePath, "utf8"), "{\"sentinel\":true}\n");

  const forcedOnboard = runDai("--json", "onboard", target, "--force");
  assertEnvelope(forcedOnboard, "dai.onboard");
  assert.equal(forcedOnboard.envelope.data.status, "overwritten");
  assert.equal(readFileSync(profilePath, "utf8"), profileBytes);

  assert.equal(existsSync(manifestPath), true);
  const guide = readFileSync(
    join(repoRoot, "docs/guides/dai-init-onboard.md"),
    "utf8",
  );
  assert.match(guide, /dai --json init \./);
  assert.match(guide, /dai --json onboard \./);
  assert.ok(Date.now() - startedAt < 10 * 60 * 1000, "golden path exceeded 10 minutes");
  console.log("golden path passed");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
