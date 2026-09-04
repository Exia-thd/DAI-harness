#!/usr/bin/env node
/**
 * Freeze a GitNexus-built index into a neutral, tool-independent reference.
 *
 * This exists because `.gitnexus/lbug` is the only ground truth we have for
 * whether our own resolver produces the right graph, and we are dropping the
 * tool that made it. A JSONL snapshot survives losing the reader, the tool, and
 * the schema; the binary index does not.
 *
 * The snapshot deliberately carries identity and location only. `content` and
 * `description` hold source text we already have in git, and including them
 * would make the fixture larger than the repository it describes.
 *
 * Usage:
 *   node src/codegraph/reference/extract.mjs <index-path> <out-dir>
 */

import { Database, Connection, VERSION, STORAGE_VERSION } from '@ladybugdb/core';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const BUFFER_POOL_BYTES = 1 << 30;

/** Columns worth freezing: who a node is and where it lives. Never its text. */
const IDENTITY_COLUMNS = [
  'id', 'name', 'filePath', 'startLine', 'endLine', 'isExported',
];

function usage(message) {
  console.error(`extract: ${message}`);
  console.error('usage: node extract.mjs <index-path> <out-dir>');
  process.exit(2);
}

async function tableNames(conn) {
  const rows = await (await conn.query('CALL show_tables() RETURN *;')).getAll();
  return {
    nodes: rows.filter((r) => r.type === 'NODE').map((r) => r.name).sort(),
    rels: rows.filter((r) => r.type === 'REL').map((r) => r.name).sort(),
  };
}

async function columnsOf(conn, table) {
  const rows = await (await conn.query(`CALL table_info("${table}") RETURN *;`)).getAll();
  return rows.map((r) => r.name);
}

/** Provenance. A reference graph is only meaningful against the tree it saw. */
function provenance(indexPath) {
  const metaPath = join(dirname(resolve(indexPath)), 'meta.json');
  if (!existsSync(metaPath)) return { warning: 'meta.json absent; commit unknown' };
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  return {
    lastCommit: meta.lastCommit,
    indexedAt: meta.indexedAt,
    branch: meta.branch,
    schemaVersion: meta.schemaVersion,
    fileCount: Object.keys(meta.fileHashes ?? {}).length,
    stats: meta.stats,
  };
}

async function main() {
  const [indexPath, outDir] = process.argv.slice(2);
  if (!indexPath || !outDir) usage('expected <index-path> and <out-dir>');
  if (!existsSync(indexPath)) usage(`no index at ${indexPath}`);

  // Read-only: the reference must never be mutated by the thing measuring it.
  const db = new Database(resolve(indexPath), BUFFER_POOL_BYTES, true, true);
  const conn = new Connection(db);
  const { nodes: nodeTables, rels: relTables } = await tableNames(conn);

  const nodeLines = [];
  const counts = {};
  for (const table of nodeTables) {
    const present = new Set(await columnsOf(conn, table));
    const cols = IDENTITY_COLUMNS.filter((c) => present.has(c));
    if (cols.length === 0) continue;
    const projection = cols.map((c) => `n.${c} AS ${c}`).join(', ');
    const rows = await (
      await conn.query(`MATCH (n:\`${table}\`) RETURN ${projection};`)
    ).getAll();
    if (rows.length === 0) continue;
    counts[table] = rows.length;
    for (const row of rows) nodeLines.push(JSON.stringify({ label: table, ...row }));
  }

  const edgeLines = [];
  for (const table of relTables) {
    const rows = await (
      await conn.query(
        `MATCH (a)-[r:\`${table}\`]->(b) ` +
          'RETURN a.id AS from, label(a) AS fromLabel, r.type AS type, ' +
          'b.id AS to, label(b) AS toLabel, r.confidence AS confidence;',
      )
    ).getAll();
    if (rows.length === 0) continue;
    counts[table] = rows.length;
    for (const row of rows) edgeLines.push(JSON.stringify(row));
  }

  // Sorted so two snapshots of the same graph are byte-identical and a diff
  // between engines reads as added/removed lines rather than reordering noise.
  nodeLines.sort();
  edgeLines.sort();

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'nodes.jsonl'), nodeLines.join('\n') + '\n');
  writeFileSync(join(outDir, 'edges.jsonl'), edgeLines.join('\n') + '\n');
  writeFileSync(
    join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        source: resolve(indexPath),
        reader: { ladybugdb: VERSION, storageVersion: STORAGE_VERSION },
        extractedAt: new Date().toISOString(),
        provenance: provenance(indexPath),
        counts,
        totals: { nodes: nodeLines.length, edges: edgeLines.length },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`nodes: ${nodeLines.length}  edges: ${edgeLines.length}  -> ${outDir}`);
}

await main();
