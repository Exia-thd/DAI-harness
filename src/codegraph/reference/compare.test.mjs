/**
 * The comparator is the only thing standing between "our engine works" and
 * ForgeNexus's 0/30 that meant nothing. So it is tested for the property that
 * actually matters: it must fail when the graph is wrong, and say why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPARE = join(dirname(fileURLToPath(import.meta.url)), 'compare.mjs');

function snapshot(dir, nodes, edges) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'nodes.jsonl'), nodes.map((n) => JSON.stringify(n)).join('\n') + '\n');
  writeFileSync(join(dir, 'edges.jsonl'), edges.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return dir;
}

function compare(expected, actual, ...args) {
  const r = spawnSync(process.execPath, [COMPARE, expected, actual, ...args], {
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const NODES = [
  { label: 'Function', id: 'Function:a.ts:alpha', name: 'alpha', filePath: 'a.ts', startLine: 1 },
  { label: 'Function', id: 'Function:b.ts:beta', name: 'beta', filePath: 'b.ts', startLine: 2 },
];
// alpha calls beta twice: one triple, two records. CodeRelation has no line
// column, so multiplicity is the only thing telling them apart.
const EDGES = [
  { from: 'Function:a.ts:alpha', type: 'CALLS', to: 'Function:b.ts:beta', confidence: 0.85 },
  { from: 'Function:a.ts:alpha', type: 'CALLS', to: 'Function:b.ts:beta', confidence: 0.85 },
  { from: 'Function:a.ts:alpha', type: 'IMPORTS', to: 'Function:b.ts:beta', confidence: 1 },
];

test('an identical graph scores 100% and passes', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codegraph-cmp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ref = snapshot(join(root, 'ref'), NODES, EDGES);
  const { status, out } = compare(ref, ref);
  assert.equal(status, 0, out);
  assert.match(out, /edges\n {2}reference 3 records \(2 distinct\)/);
  assert.match(out, /matched 3 \(100\.0%\)/);
});

test('a repeated call site that goes missing is still reported', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codegraph-cmp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ref = snapshot(join(root, 'ref'), NODES, EDGES);
  // Keeps the CALLS triple but only once. Set semantics would call this a
  // perfect match and hide a real loss.
  const actual = snapshot(join(root, 'actual'), NODES, [EDGES[0], EDGES[2]]);
  const { status, out } = compare(ref, actual);
  assert.equal(status, 1, out);
  assert.match(out, /missing 1/);
  assert.match(out, /CALLS {14}1/);
});

test('a missing edge kind is named, counted, and fails the run', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codegraph-cmp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ref = snapshot(join(root, 'ref'), NODES, EDGES);
  const actual = snapshot(join(root, 'actual'), NODES, EDGES.filter((e) => e.type !== 'CALLS'));
  const { status, out } = compare(ref, actual);
  assert.equal(status, 1, out);
  assert.match(out, /missing by kind:/);
  assert.match(out, /CALLS {14}2/);
  assert.match(out, /- CALLS {2}Function:a\.ts:alpha {2}-> {2}Function:b\.ts:beta/);
});

test('a missing node is reported against the reference', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codegraph-cmp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ref = snapshot(join(root, 'ref'), NODES, EDGES);
  const actual = snapshot(join(root, 'actual'), [NODES[0]], EDGES);
  const { status, out } = compare(ref, actual);
  assert.equal(status, 1, out);
  assert.match(out, /- Function beta \(b\.ts:2\)/);
});

test('an engine inventing edges is reported as extra, not silently accepted', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codegraph-cmp-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const ref = snapshot(join(root, 'ref'), NODES, EDGES);
  const invented = { from: 'Function:b.ts:beta', type: 'CALLS', to: 'Function:a.ts:alpha' };
  const actual = snapshot(join(root, 'actual'), NODES, [...EDGES, invented]);
  const { status, out } = compare(ref, actual);
  assert.equal(status, 0, out); // nothing missing; hallucination is not yet a failure
  assert.match(out, /extra 1/);
});
