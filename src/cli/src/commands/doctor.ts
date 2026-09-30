/**
 * Doctor Command - Diagnostics and health checks
 */
import type { Command } from "commander";
import pc from "picocolors";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { buildEnvelope } from "../types/index.js";
import { VERSION } from "../version.js";

export interface HealthCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run diagnostics and health checks")
    .option("-v, --verbose", "Verbose output")
    .option("-j, --json", "Output as JSON")
    .action(async (options: { verbose: boolean; json: boolean }) => {
      await handleDoctor(options);
    });
}

async function handleDoctor(options: {
  verbose: boolean;
  json: boolean;
}): Promise<void> {
  const startTime = Date.now();
  const useJson = options.json || !process.stdout.isTTY;
  const verbose = options.verbose;

  const checks: HealthCheck[] = [];

  // Run all health checks
  checks.push(checkNodeVersion());
  checks.push(checkDaiHarness());
  checks.push(checkConfig());
  checks.push(checkMemory());
  checks.push(checkDaiHarnessNode());

  const healthy = checks.filter((c) => c.status === "ok").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const errors = checks.filter((c) => c.status === "error").length;

  const allOk = errors === 0;

  if (useJson) {
    const envelope = buildEnvelope(
      "doctor.check",
      {
        checks,
        summary: {
          healthy,
          warnings,
          errors,
          allOk,
        },
      },
      {
        ok: allOk,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: allOk
          ? undefined
          : {
              code: errors > 0 ? 1 : 2,
              message: `${errors} errors, ${warnings} warnings`,
            },
      },
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable(checks, healthy, warnings, errors, verbose);
  }

  process.exit(allOk ? 0 : errors > 0 ? 1 : 0);
}

function checkNodeVersion(): HealthCheck {
  const version = process.version;
  const match = version.match(/^v(\d+)\./);

  if (!match) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Unknown version: ${version}`,
    };
  }

  const major = parseInt(match[1], 10);

  if (major < 18) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Node.js ${major} is too old. Minimum: 18`,
      details: `Current: ${version}`,
    };
  }

  if (major < 20) {
    return {
      name: "Node.js Version",
      status: "warning",
      message: `Node.js ${major} is older than recommended`,
      details: `Current: ${version}, Recommended: 20+`,
    };
  }

  return {
    name: "Node.js Version",
    status: "ok",
    message: version,
  };
}

function checkDaiHarness(): HealthCheck {
  // Check if we're in a dai-harness project
  const cwd = process.cwd();
  const daiHarnessRoot = findDaiHarnessRoot(cwd);

  if (!daiHarnessRoot) {
    return {
      name: "DAI Harness Project",
      status: "warning",
      message: "Not in a DAI Harness project",
      details: "Some features may not be available",
    };
  }

  return {
    name: "DAI Harness Project",
    status: "ok",
    message: `Found at ${daiHarnessRoot}`,
  };
}

function checkConfig(): HealthCheck {
  const userConfig = resolve(
    homedir(),
    ".config",
    "dai-harness",
    "config.json",
  );
  const legacyConfig = resolve(homedir(), ".daiharness", "config.json");

  if (existsSync(userConfig)) {
    return {
      name: "User Configuration",
      status: "ok",
      message: "Configuration file found",
      details: userConfig,
    };
  }

  if (existsSync(legacyConfig)) {
    return {
      name: "User Configuration",
      status: "warning",
      message: "Using legacy config location",
      details: `${legacyConfig} - consider migrating to ${userConfig}`,
    };
  }

  return {
    name: "User Configuration",
    status: "warning",
    message: "No configuration file found",
    details: "Run: dai config init",
  };
}

function checkMemory(): HealthCheck {
  const memoryPath = resolve(process.cwd(), ".daiharness", "memory.jsonl");

  if (!existsSync(memoryPath)) {
    return {
      name: "Memory Store",
      status: "warning",
      message: "No memory store found",
      details: "Run: dai config init",
    };
  }

  return {
    name: "Memory Store",
    status: "ok",
    message: "Memory store found",
    details: memoryPath,
  };
}

function checkDaiHarnessNode(): HealthCheck {
  try {
    // Try to find daiharness-node
    const result = execSync(
      'npx daiharness-node --version 2>/dev/null || echo "not_found"',
      {
        encoding: "utf-8",
        timeout: 5000,
      },
    );

    if (result.trim() === "not_found") {
      return {
        name: "DAI Harness Node",
        status: "warning",
        message: "DAI Harness Node not installed",
        details: "Run: npm install -g daiharness-node",
      };
    }

    return {
      name: "DAI Harness Node",
      status: "ok",
      message: result.trim(),
    };
  } catch {
    return {
      name: "DAI Harness Node",
      status: "warning",
      message: "Could not verify DAI Harness Node",
      details: "Run: npx daiharness-node --version",
    };
  }
}

function findDaiHarnessRoot(cwd: string): string | null {
  let current = cwd;

  while (current !== "/") {
    const configPath = join(current, ".daiharness");
    if (existsSync(configPath)) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function printHumanReadable(
  checks: HealthCheck[],
  _healthy: number,
  warnings: number,
  errors: number,
  verbose: boolean,
): void {
  console.log();
  console.log(
    pc.bold(
      "╔════════════════════════════════════════════════════════════════╗",
    ),
  );
  console.log(
    pc.bold("║") + "              DAI Harness Doctor".padEnd(62) + pc.bold("║"),
  );
  console.log(
    pc.bold(
      "╠════════════════════════════════════════════════════════════════╣",
    ),
  );

  const allOk = errors === 0;
  const statusIcon = allOk ? pc.green("✓") : pc.red("✗");
  const statusText = allOk
    ? pc.green("All checks passed")
    : pc.red(`${errors} errors, ${warnings} warnings`);

  console.log(
    pc.bold("║") + `  ${statusIcon} ${statusText}`.padEnd(62) + pc.bold("║"),
  );
  console.log(
    pc.bold(
      "╚════════════════════════════════════════════════════════════════╝",
    ),
  );
  console.log();

  for (const check of checks) {
    const icon =
      check.status === "ok"
        ? pc.green("✓")
        : check.status === "warning"
          ? pc.yellow("⚠")
          : pc.red("✗");

    const statusColor =
      check.status === "ok"
        ? pc.green
        : check.status === "warning"
          ? pc.yellow
          : pc.red;

    console.log(`  ${icon} ${pc.bold(check.name)}`);
    console.log(`    ${statusColor(check.message)}`);

    if (verbose && check.details) {
      console.log(`    ${pc.dim(check.details)}`);
    }
  }

  console.log();

  if (warnings > 0 || errors > 0) {
    console.log(pc.dim("  Run with --verbose for more details"));
    console.log(pc.dim("  Run with --json for machine-readable output"));
  }
}
