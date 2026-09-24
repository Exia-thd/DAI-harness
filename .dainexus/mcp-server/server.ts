#!/usr/bin/env node
/**
 * dai-nexus — global MCP server.
 *
 * It used to import GitNexus's server. The code intelligence now comes from
 * the vendored DAI memory layer, which ships its own MCP server, so this file
 * is a launcher: it finds the installed engine and hands stdio to it.
 *
 * The engine is installed outside the repository, one directory per pinned
 * version, and this file is copied to ~/.dainexus by the installer — so it
 * cannot compute the path itself. It asks the workspace, in this order:
 *
 *   1. DAI_MEMORY_ENGINE, when somebody set it deliberately;
 *   2. `python scripts/lite/dai_memory.py where` in the workspace, which is
 *      the same answer the harness's own tools use;
 *
 * and refuses with the command to run when neither answers. A launcher that
 * starts a server with no engine behind it produces a client that connects,
 * lists no tools, and looks like a configuration problem somewhere else.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKSPACE = process.env.DAINEXUS_WORKSPACE ?? resolve(__dirname, "../..");

function engineFromWorkspace(): string | null {
  const resolver = join(WORKSPACE, "scripts", "lite", "dai_memory.py");
  if (!existsSync(resolver)) return null;
  for (const python of [["py", "-3"], ["python3"], ["python"]]) {
    const [command, ...prefix] = python;
    const probe = spawnSync(command!, [...prefix, resolver, "where"], {
      cwd: WORKSPACE,
      encoding: "utf8",
    });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  return null;
}

const engine = process.env.DAI_MEMORY_ENGINE ?? engineFromWorkspace();
const cli = engine ? join(engine, "bin", "dai-memory.mjs") : null;

if (!cli || !existsSync(cli)) {
  console.error(
    "[DAI Nexus MCP] The memory layer is not installed, so there is no server to start.\n"
      + `[DAI Nexus MCP] Workspace: ${WORKSPACE}\n`
      + "[DAI Nexus MCP] Run: python scripts/lite/dai_memory.py install",
  );
  process.exit(1);
}

console.error(`[DAI Nexus MCP] workspace ${WORKSPACE}`);
console.error(`[DAI Nexus MCP] engine ${engine}`);

// stdio is the protocol: the child owns it entirely, and this process only
// waits. Anything written to stdout here would corrupt the framing.
const child = spawn(process.execPath, [cli, "serve"], {
  cwd: WORKSPACE,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on("error", (error: Error) => {
  console.error(`[DAI Nexus MCP] could not start the memory layer: ${error.message}`);
  process.exit(1);
});
