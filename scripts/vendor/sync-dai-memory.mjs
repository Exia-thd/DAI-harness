#!/usr/bin/env node
/**
 * Copies the DAI memory layer into vendor/dai-memory, from one commit, and
 * records exactly what was copied.
 *
 * The memory layer is its own project and stays its own project: its
 * repository is the source of truth, and this directory is a pinned copy of it.
 * A copy that people edit in place stops being a copy -- fixes land here and
 * never reach the source, fixes land there and never reach here, and after a
 * few months nobody can say which of the two is right. So nothing here is
 * edited by hand. A change goes to the memory layer, and this script brings it
 * across.
 *
 *   node scripts/vendor/sync-dai-memory.mjs --source <memory-layer checkout> [--ref <commit>]
 *   node scripts/vendor/sync-dai-memory.mjs --check
 *
 * Files are read from the commit, not from the checkout's working tree: an
 * uncommitted edit in the source must not ride along into a copy that claims to
 * be that commit.
 *
 * `--check` recomputes every vendored file's hash against PROVENANCE.json and
 * fails on any difference -- modified, missing, or added. It is what the test
 * suite runs.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Overridable so the tests can sync into a scratch directory. A test that
// exercised this script against the real copy would, the one time it failed,
// overwrite the thing it was checking.
const TARGET = process.env.DAI_MEMORY_VENDOR_DIR
  ? path.resolve(process.env.DAI_MEMORY_VENDOR_DIR)
  : path.join(ROOT, 'vendor', 'dai-memory');
const PROVENANCE = path.join(TARGET, 'PROVENANCE.json');
const UPSTREAM = 'https://github.com/Exia-thd/DAI-memory-layer-plugin';

/**
 * What the harness needs to build and run the layer, and nothing else.
 *
 * Its tests, evaluation corpus and documentation stay in its own repository,
 * where they run. So does its Claude Code plugin packaging -- hooks, manifest,
 * skills, commands -- which describes installing it as a plugin, not running it
 * inside something else.
 */
const INCLUDE = [
  /^LICENSE$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^tsconfig\.base\.json$/,
  /^bin\/[^/]+\.mjs$/,
  /^packages\/(core|cli)\/(package\.json|tsconfig\.json)$/,
  /^packages\/(core|cli)\/src\//,
  /^packages\/core\/grammars\//,
];

/** Written by this repository, not copied: kept through a sync, and not hashed. */
const OWNED_HERE = new Set(['PROVENANCE.json', 'README.md']);

/** Produced by installing or building the copy. Never part of it. */
const GENERATED = new Set(['node_modules', 'dist']);
/** Build output that lands beside the sources rather than inside dist/. */
const GENERATED_FILE = /\.tsbuildinfo$/;

/**
 * The same guard the smoke suite runs over the whole tree, applied before a
 * file is written rather than after it is committed.
 *
 * Assembled from fragments for the reason the smoke suite gives: a repo-wide
 * rename once rewrote a literal list and the guard checked for the wrong names.
 */
const _w = ['wr', 'ight'].join('');
const FORBIDDEN = ['forge' + _w, 'DAI' + _w, 'FORGE' + _w.toUpperCase() + '_', 'buiphuc' + 'minhtam', 'mem' + '0-cli', 'mem' + '0-v2'];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(source, args, options = {}) {
  return execFileSync('git', ['-C', source, ...args], { maxBuffer: 256 * 1024 * 1024, ...options });
}

function args() {
  const argv = process.argv.slice(2);
  const out = { check: false, source: process.env.DAI_MEMORY_SOURCE ?? null, ref: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') out.check = true;
    else if (argv[i] === '--source') out.source = argv[++i];
    else if (argv[i] === '--ref') out.ref = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

/** Every file under the copy, relative and with forward slashes. */
function vendoredFiles(dir = TARGET, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!prefix && (OWNED_HERE.has(entry.name) || entry.name === '.gitignore')) continue;
    if (GENERATED.has(entry.name) || GENERATED_FILE.test(entry.name)) continue;
    if (entry.isDirectory()) out.push(...vendoredFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out.sort();
}

function removeEmptyDirs(dir, isRoot = false) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || GENERATED.has(entry.name)) continue;
    removeEmptyDirs(path.join(dir, entry.name));
  }
  if (!isRoot && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

function check() {
  if (!fs.existsSync(PROVENANCE)) {
    throw new Error(`${path.relative(ROOT, PROVENANCE)} is missing: the copy records nothing about where it came from.`);
  }
  const recorded = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8'));
  const present = vendoredFiles();
  const problems = [];

  for (const [file, expected] of Object.entries(recorded.files)) {
    const full = path.join(TARGET, file);
    if (!fs.existsSync(full)) problems.push(`missing   ${file}`);
    else if (sha256(fs.readFileSync(full)) !== expected) problems.push(`modified  ${file}`);
  }
  for (const file of present) {
    if (!(file in recorded.files)) problems.push(`added     ${file}`);
  }

  if (problems.length > 0) {
    process.stderr.write(
      `vendor/dai-memory no longer matches ${UPSTREAM} at ${recorded.commit}:\n` +
        problems.map((line) => `  ${line}`).join('\n') +
        '\n\nThis directory is a copy. Make the change in the memory layer, commit it there, and run\n' +
        '  node scripts/vendor/sync-dai-memory.mjs --source <its checkout>\n',
    );
    process.exit(1);
  }
  process.stdout.write(
    `vendor/dai-memory matches ${recorded.commit.slice(0, 12)}: ${present.length} files\n`,
  );
}

function sync(source, ref) {
  if (!source) {
    throw new Error('--source <memory-layer checkout> is required (or set DAI_MEMORY_SOURCE).');
  }
  const commit = git(source, ['rev-parse', '--verify', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  const listed = git(source, ['ls-tree', '-r', '--name-only', commit], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && INCLUDE.some((rule) => rule.test(file)))
    .sort();
  if (listed.length === 0) throw new Error(`nothing to copy at ${commit}: is ${source} the memory layer?`);

  // Read everything and check it before writing anything: a copy refused
  // halfway is worse than one refused up front.
  const contents = new Map();
  const tainted = [];
  for (const file of listed) {
    const bytes = git(source, ['show', `${commit}:${file}`]);
    const text = bytes.toString('latin1').toLowerCase();
    if (FORBIDDEN.some((token) => text.includes(token.toLowerCase()))) tainted.push(file);
    contents.set(file, bytes);
  }
  if (tainted.length > 0) {
    throw new Error(
      `refusing to copy: these files carry a name this repository forbids:\n  ${tainted.join('\n  ')}\n` +
        'Remove it in the memory layer, commit, and sync again.',
    );
  }

  for (const stale of vendoredFiles()) {
    if (!contents.has(stale)) fs.rmSync(path.join(TARGET, stale));
  }
  const files = {};
  for (const [file, bytes] of contents) {
    const full = path.join(TARGET, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes);
    files[file] = sha256(bytes);
  }
  // Empty directories left by removed files -- and only those. An installed
  // copy has node_modules and dist beside the sources; walking into them would
  // be slow and would prune directories this script does not own.
  removeEmptyDirs(TARGET, true);

  // No timestamp: the same commit must produce the same file, or every re-sync
  // is a diff that means nothing.
  const provenance = { source: UPSTREAM, commit, files };
  fs.writeFileSync(PROVENANCE, `${JSON.stringify(provenance, null, 2)}\n`);
  process.stdout.write(`copied ${listed.length} files from ${commit.slice(0, 12)} into vendor/dai-memory\n`);
}

try {
  const options = args();
  if (options.check) check();
  else sync(options.source, options.ref);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
