#!/usr/bin/env node
/**
 * Diff two graph snapshots produced in the reference JSONL format.
 *
 * This is the measuring stick the previous in-house engine never had: its
 * evaluation dataset cited files that did not exist and ran against a mock, so
 * nobody could say whether the graph it built was right. Here the answer is a
 * set difference against a graph we know was built from this very tree.
 *
 * Both sides are plain JSONL, so an engine only has to emit the same shape to
 * become measurable - it does not have to be finished, or fast, or ours.
 *
 * Usage:
 *   node compare.mjs <expected-dir> <actual-dir> [--kind CALLS] [--limit 20]
 *
 * Exit code is 1 when the actual graph is missing anything the reference has,
 * so this can gate a build once the engine is expected to be complete.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load a snapshot as a multiset.
 *
 * The reference emits one edge per call site, and CodeRelation carries no line
 * or site column, so repeated calls from A to B are distinguishable only by how
 * many there are: 33,375 edge records collapse to 32,426 distinct triples.
 * Keying on the triple alone would silently drop 949 of them and quietly
 * inflate every match rate that follows.
 */
function load(dir, file, keyOf) {
  const path = join(dir, file);
  if (!existsSync(path)) {
    console.error(`compare: missing ${path}`);
    process.exit(2);
  }
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    const key = keyOf(row);
    const seen = map.get(key);
    if (seen) seen.count += 1;
    else map.set(key, { row, count: 1 });
  }
  return map;
}

const nodeKey = (n) => n.id ?? `${n.label}:${n.filePath}:${n.name}`;
const edgeKey = (e) => `${e.from} ${e.type} ${e.to}`;

function report(title, expected, actual, describe, kindOf, kindFilter, limit) {
  // Multiset difference: a key present on both sides but three times on the
  // left and once on the right is two records missing, not zero.
  const missing = [];
  const extra = [];
  let referenceRecords = 0;
  for (const [key, value] of expected) {
    referenceRecords += value.count;
    const short = value.count - (actual.get(key)?.count ?? 0);
    for (let i = 0; i < short; i += 1) missing.push(value.row);
  }
  for (const [key, value] of actual) {
    const over = value.count - (expected.get(key)?.count ?? 0);
    for (let i = 0; i < over; i += 1) extra.push(value.row);
  }

  const keep = (rows) => (kindFilter ? rows.filter((r) => kindOf(r) === kindFilter) : rows);
  const missingKept = keep(missing);
  const extraKept = keep(extra);

  const values = [...expected.values()];
  const scoped = kindFilter ? values.filter((v) => kindOf(v.row) === kindFilter) : values;
  const total = kindFilter ? scoped.reduce((n, v) => n + v.count, 0) : referenceRecords;
  const found = total - missingKept.length;
  const pct = total === 0 ? '100.0' : ((found / total) * 100).toFixed(1);

  console.log(`\n${title}${kindFilter ? ` [${kindFilter}]` : ''}`);
  console.log(
    `  reference ${total} records (${scoped.length} distinct) | ` +
      `matched ${found} (${pct}%) | missing ${missingKept.length} | extra ${extraKept.length}`,
  );

  // Grouping by kind turns "6000 edges missing" into "CALLS is unresolved",
  // which is the difference between a number and a next action.
  if (!kindFilter && missing.length) {
    const byKind = new Map();
    for (const row of missing) byKind.set(kindOf(row), (byKind.get(kindOf(row)) ?? 0) + 1);
    console.log('  missing by kind:');
    for (const [kind, n] of [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`    ${String(kind).padEnd(18)} ${n}`);
    }
  }
  for (const row of missingKept.slice(0, limit)) console.log(`    - ${describe(row)}`);
  return missingKept.length;
}

function main() {
  const args = process.argv.slice(2);
  const [expectedDir, actualDir] = args.filter((a) => !a.startsWith('--'));
  if (!expectedDir || !actualDir) {
    console.error('usage: node compare.mjs <expected-dir> <actual-dir> [--kind KIND] [--limit N]');
    process.exit(2);
  }
  const kindAt = args.indexOf('--kind');
  const limitAt = args.indexOf('--limit');
  const kindFilter = kindAt === -1 ? null : args[kindAt + 1];
  const limit = limitAt === -1 ? 10 : Number(args[limitAt + 1]);

  const missingNodes = report(
    'nodes',
    load(expectedDir, 'nodes.jsonl', nodeKey),
    load(actualDir, 'nodes.jsonl', nodeKey),
    (n) => `${n.label} ${n.name} (${n.filePath}:${n.startLine})`,
    (n) => n.label,
    kindFilter,
    limit,
  );
  const missingEdges = report(
    'edges',
    load(expectedDir, 'edges.jsonl', edgeKey),
    load(actualDir, 'edges.jsonl', edgeKey),
    (e) => `${e.type}  ${e.from}  ->  ${e.to}`,
    (e) => e.type,
    kindFilter,
    limit,
  );
  process.exit(missingNodes + missingEdges > 0 ? 1 : 0);
}

main();
