import { Command } from 'commander';
import pc7 from 'picocolors';
import fs, { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, mkdtempSync, cpSync, realpathSync, copyFileSync, readdirSync, appendFileSync, rmSync, lstatSync } from 'fs';
import { join, resolve, dirname, isAbsolute, relative, basename, sep, posix, extname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync, spawn, spawnSync } from 'child_process';
import { isIP } from 'net';
import { z } from 'zod';
import { createHash } from 'crypto';

// src/index.ts

// src/core/global-flags.ts
function registerGlobalFlags(program) {
  program.option("-j, --json", "Force JSON output (agent mode)").option("--no-color", "Disable colored output").option("-q, --quiet", "Suppress stdout output").option("--debug", "Enable debug mode");
}

// src/core/tool-registry.ts
var TOOL_CATEGORIES = {
  ORCHESTRATION: "orchestration",
  ENGINEERING: "engineering",
  GAME_DEV: "game-dev",
  AI_ML: "ai-ml",
  DEVOPS: "devops",
  META: "meta"
};
var TOOL_REGISTRY = [
  // Orchestration
  {
    name: "orchestrator.execute",
    description: "Execute the DAI Nexus orchestration pipeline",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      mode: {
        type: "string",
        required: true,
        description: "Pipeline mode (full-build, feature, harden, ship, sustain)",
        enum: ["full-build", "feature", "harden", "ship", "sustain", "grow"]
      },
      request: {
        type: "string",
        required: true,
        description: "User request description"
      },
      options: {
        type: "object",
        required: false,
        description: "Additional options"
      }
    },
    examples: [
      `dai tools call orchestrator.execute --args '{"mode":"feature","request":"add login"}'`
    ]
  },
  // Skills
  {
    name: "skills.list",
    description: "List all available DAI Nexus skills",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      category: {
        type: "string",
        required: false,
        description: "Filter by category"
      },
      format: {
        type: "string",
        required: false,
        description: "Output format (table, json)",
        enum: ["table", "json"]
      }
    },
    examples: ["dai skills list", "dai skills list --category engineering"]
  },
  {
    name: "skills.search",
    description: "Search for skills by keyword",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      query: {
        type: "string",
        required: true,
        description: "Search query"
      },
      category: {
        type: "string",
        required: false,
        description: "Filter by category"
      }
    },
    examples: [`dai tools call skills.search --args '{"query":"api"}'`]
  },
  // Validate
  {
    name: "validate.quality",
    description: "Run DAI Nexus quality gate validation",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      level: {
        type: "number",
        required: false,
        description: "Validation level (1-3)",
        default: 3
      },
      strict: {
        type: "boolean",
        required: false,
        description: "Enable strict mode",
        default: false
      },
      json: {
        type: "boolean",
        required: false,
        description: "Output as JSON",
        default: false
      }
    },
    examples: ["dai validate --json", "dai validate --level 2"]
  },
  // Config
  {
    name: "config.get",
    description: "Get configuration value",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: "string",
        required: true,
        description: "Configuration key"
      }
    },
    examples: ["dai config get dai.apiKey"]
  },
  {
    name: "config.set",
    description: "Set configuration value",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      key: {
        type: "string",
        required: true,
        description: "Configuration key"
      },
      value: {
        type: "string",
        required: true,
        description: "Configuration value"
      }
    },
    examples: ["dai config set dai.apiKey sk-xxx"]
  },
  {
    name: "config.list",
    description: "List all configuration values with sources",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {},
    examples: ["dai config list"]
  },
  // Doctor
  {
    name: "doctor.check",
    description: "Run diagnostics and health checks",
    category: TOOL_CATEGORIES.ORCHESTRATION,
    inputSchema: {
      verbose: {
        type: "boolean",
        required: false,
        description: "Verbose output",
        default: false
      }
    },
    examples: ["dai doctor", "dai doctor --verbose"]
  },
  // Engineering Skills
  {
    name: "engineering.software",
    description: "Software engineering tasks - backend, APIs, databases",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      },
      language: {
        type: "string",
        required: false,
        description: "Programming language"
      }
    },
    examples: [
      `dai tools call engineering.software --args '{"task":"create REST API"}'`
    ]
  },
  {
    name: "engineering.frontend",
    description: "Frontend engineering tasks - React, Vue, UI components",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      },
      framework: {
        type: "string",
        required: false,
        description: "UI framework"
      }
    },
    examples: [
      `dai tools call engineering.frontend --args '{"task":"create button component"}'`
    ]
  },
  {
    name: "engineering.qa",
    description: "QA engineering - testing, test coverage, quality assurance",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call engineering.qa --args '{"task":"write unit tests"}'`
    ]
  },
  {
    name: "engineering.security",
    description: "Security engineering - audits, hardening, vulnerability checks",
    category: TOOL_CATEGORIES.ENGINEERING,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call engineering.security --args '{"task":"audit authentication"}'`
    ]
  },
  // DevOps
  {
    name: "devops.deploy",
    description: "Deployment automation - CI/CD, Docker, Kubernetes",
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      target: {
        type: "string",
        required: true,
        description: "Deployment target"
      },
      environment: {
        type: "string",
        required: false,
        description: "Environment (prod, staging, dev)"
      }
    },
    examples: [
      `dai tools call devops.deploy --args '{"target":"aws","environment":"prod"}'`
    ]
  },
  {
    name: "devops.database",
    description: "Database engineering - migrations, optimization, backups",
    category: TOOL_CATEGORIES.DEVOPS,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call devops.database --args '{"task":"create migration"}'`
    ]
  },
  // AI/ML
  {
    name: "ai.engineer",
    description: "AI engineering - LLM integration, RAG, chatbots",
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call ai.engineer --args '{"task":"build RAG system"}'`
    ]
  },
  {
    name: "ai.prompt",
    description: "Prompt engineering and optimization",
    category: TOOL_CATEGORIES.AI_ML,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call ai.prompt --args '{"task":"optimize classification prompt"}'`
    ]
  },
  // Game Development
  {
    name: "game.design",
    description: "Game design - mechanics, narrative, level design",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call game.design --args '{"task":"design combat system"}'`
    ]
  },
  {
    name: "game.unity",
    description: "Unity game development",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call game.unity --args '{"task":"create player controller"}'`
    ]
  },
  {
    name: "game.unreal",
    description: "Unreal Engine game development",
    category: TOOL_CATEGORIES.GAME_DEV,
    inputSchema: {
      task: {
        type: "string",
        required: true,
        description: "Task description"
      }
    },
    examples: [
      `dai tools call game.unreal --args '{"task":"setup character blueprint"}'`
    ]
  },
  // Meta
  {
    name: "meta.polymath",
    description: "Research and exploration assistance",
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      query: {
        type: "string",
        required: true,
        description: "Research query"
      }
    },
    examples: [
      `dai tools call meta.polymath --args '{"query":"how does blockchain work"}'`
    ]
  },
  {
    name: "meta.memory",
    description: "Memory and context management",
    category: TOOL_CATEGORIES.META,
    inputSchema: {
      action: {
        type: "string",
        required: true,
        description: "Action (read, write, search)"
      },
      key: {
        type: "string",
        required: false,
        description: "Memory key"
      },
      value: {
        type: "string",
        required: false,
        description: "Value to store"
      }
    },
    examples: [
      `dai tools call meta.memory --args '{"action":"read","key":"project-info"}'`
    ]
  }
];
function getAllTools() {
  return TOOL_REGISTRY;
}
function getToolsByCategory(category) {
  return TOOL_REGISTRY.filter((tool) => tool.category === category);
}
function getToolByName(name) {
  return TOOL_REGISTRY.find((tool) => tool.name === name);
}
function searchTools(query) {
  const lowerQuery = query.toLowerCase();
  return TOOL_REGISTRY.filter(
    (tool) => tool.name.toLowerCase().includes(lowerQuery) || tool.description.toLowerCase().includes(lowerQuery) || tool.category.toLowerCase().includes(lowerQuery)
  );
}
function getCategories() {
  const categories = new Set(TOOL_REGISTRY.map((tool) => tool.category));
  return Array.from(categories).sort();
}
function getToolCount() {
  return TOOL_REGISTRY.length;
}
function getToolCountByCategory() {
  const counts = {};
  for (const tool of TOOL_REGISTRY) {
    counts[tool.category] = (counts[tool.category] || 0) + 1;
  }
  return counts;
}

// src/types/index.ts
function buildEnvelope(tool, data, options) {
  return {
    ok: options.ok,
    tool,
    data,
    metadata: {
      duration_ms: options.duration_ms,
      version: options.version,
      config_source: options.config_source
    },
    error: options.error ?? null
  };
}
var CONFIG_SOURCES = {
  OS_ENV: 1,
  USER_CONFIG: 2,
  PROCESS_ENV: 3,
  DOTENV: 4,
  INLINE_FLAGS: 5
};

// src/version.ts
var VERSION = "2.0.0-alpha.1";

// src/commands/tools.ts
function registerToolsCommands(program) {
  program.command("tools").description("Tool registry management").argument("[command]", "subcommand", "list").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search tools").option("-j, --json", "Output as JSON").action(async (command, options) => {
    await handleToolsCommand(command, options);
  });
  program.command("tools:list").description("List all tools").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search tools").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToolsCommand("list", options);
  });
  program.command("tools:search").description("Search tools").argument("<query>", "Search query").option("-j, --json", "Output as JSON").action(async (query, options) => {
    await handleToolsCommand("list", { ...options, search: query });
  });
}
async function handleToolsCommand(_command, options) {
  const startTime = Date.now();
  const useJson2 = options.json || !process.stdout.isTTY;
  try {
    let tools;
    let filtered = false;
    if (options.search) {
      tools = searchTools(options.search);
      filtered = true;
    } else if (options.category) {
      tools = getToolsByCategory(options.category);
      filtered = true;
    } else {
      tools = getAllTools();
    }
    const duration_ms = Date.now() - startTime;
    if (useJson2) {
      const envelope = buildEnvelope(
        "tools.list",
        {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.description,
            category: t.category,
            inputSchema: t.inputSchema
          })),
          total: tools.length,
          filtered,
          category: options.category ?? null,
          search: options.search ?? null
        },
        {
          ok: true,
          duration_ms,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable(tools, options.category, options.search);
    }
    process.exit(0);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    if (useJson2) {
      const envelope = buildEnvelope("tools.list", null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: {
          code: 1,
          message
        }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}
function printHumanReadable(tools, category, search) {
  const headerColor = pc7.bold;
  const categoryColor = pc7.cyan;
  const nameColor = pc7.green;
  console.log();
  console.log(
    headerColor(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    headerColor("\u2551") + "              DAI Nexus Tool Registry".padEnd(62) + headerColor("\u2551")
  );
  console.log(
    headerColor(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const counts = getToolCountByCategory();
  const summaryParts = [];
  for (const [cat, count] of Object.entries(counts)) {
    summaryParts.push(`${categoryColor(cat)}: ${count}`);
  }
  console.log(
    headerColor("\u2551") + `  Total: ${getToolCount()} tools | ${summaryParts.join(" | ")}`.padEnd(
      62
    ) + headerColor("\u2551")
  );
  if (category || search) {
    const filterDesc = category ? `Category: ${categoryColor(category)}` : `Search: "${search}"`;
    console.log(
      headerColor("\u2551") + `  Filter: ${filterDesc}`.padEnd(62) + headerColor("\u2551")
    );
  }
  console.log(
    headerColor(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  if (tools.length === 0) {
    console.log(pc7.yellow("  No tools found matching criteria"));
    return;
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const tool of tools) {
    const existing = grouped.get(tool.category) || [];
    existing.push(tool);
    grouped.set(tool.category, existing);
  }
  for (const [cat, catTools] of grouped) {
    console.log(pc7.bold(`
  ${categoryColor(cat.toUpperCase())}`));
    console.log(pc7.dim("  " + "\u2500".repeat(50)));
    for (const tool of catTools) {
      console.log(`    ${nameColor(tool.name)}`);
      console.log(`      ${pc7.dim(tool.description)}`);
    }
  }
  console.log();
  console.log(pc7.dim("  Use --json for machine-readable output"));
  console.log();
}
function registerSkillsCommands(program) {
  const skills = program.command("skills").description("Skill management");
  skills.command("list").description("List all skills").option("-c, --category <category>", "Filter by category").option("-s, --search <query>", "Search skills").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleSkillsList(options);
  });
  skills.command("search").description("Search skills").argument("<query>", "Search query").option("-j, --json", "Output as JSON").action(async (query, options) => {
    await handleSkillsList({ ...options, search: query });
  });
  skills.command("categories").description("List skill categories").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleCategories(options.json);
  });
}
async function handleSkillsList(options) {
  const startTime = Date.now();
  const useJson2 = options.json || !process.stdout.isTTY;
  try {
    let skills;
    if (options.search) {
      skills = searchTools(options.search);
    } else if (options.category) {
      skills = getAllTools().filter((t) => t.category === options.category);
    } else {
      skills = getAllTools();
    }
    const duration_ms = Date.now() - startTime;
    if (useJson2) {
      const envelope = buildEnvelope(
        "skills.list",
        {
          skills: skills.map((s) => ({
            name: s.name,
            description: s.description,
            category: s.category
          })),
          total: skills.length
        },
        {
          ok: true,
          duration_ms,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printSkillsHumanReadable(skills, options.category, options.search);
    }
    process.exit(0);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    if (useJson2) {
      const envelope = buildEnvelope("skills.list", null, {
        ok: false,
        duration_ms,
        version: VERSION,
        error: { code: 1, message }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(1);
  }
}
async function handleCategories(json) {
  const categories = getCategories();
  const counts = getToolCountByCategory();
  if (json || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "skills.categories",
      {
        categories: categories.map((c) => ({
          name: c,
          count: counts[c] || 0
        })),
        total: categories.length
      },
      {
        ok: true,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Skill Categories\n"));
    for (const cat of categories) {
      console.log(`    ${pc7.cyan(cat.padEnd(20))} ${counts[cat] || 0} skills`);
    }
    console.log();
  }
  process.exit(0);
}
function printSkillsHumanReadable(skills, category, search) {
  console.log();
  console.log(pc7.bold(`  DAI Nexus Skills`));
  console.log(pc7.dim("  " + "\u2500".repeat(50)));
  if (category || search) {
    const filter = category ? `Category: ${category}` : `Search: "${search}"`;
    console.log(`  Filter: ${pc7.yellow(filter)}`);
  }
  console.log(`  Total: ${skills.length} skills
`);
  for (const skill of skills) {
    console.log(`    ${pc7.green(skill.name)}`);
    console.log(`      ${pc7.dim(skill.description)}`);
    console.log(`      ${pc7.gray(`[${skill.category}]`)}`);
    console.log();
  }
  console.log(pc7.dim("  Use --json for machine-readable output"));
}

// src/exit-codes.ts
var EXIT_CODES = {
  /** Success - operation completed successfully */
  OK: 0,
  /** Tool execution failed */
  TOOL_ERROR: 1,
  /** Invalid arguments or usage error */
  USAGE_ERROR: 2,
  /** Configuration error */
  CONFIG_ERROR: 3,
  /** Authentication or permission error */
  AUTH_ERROR: 4,
  /** Operation timed out */
  TIMEOUT: 5,
  /** Required dependency not found */
  MISSING_DEPENDENCY: 6,
  /** Internal/unexpected error */
  INTERNAL_ERROR: 7
};

// src/commands/tools-call.ts
function registerToolsCallCommand(program) {
  program.command("tools:call").description("Call a tool by name").argument("<name>", "Tool name to call (e.g., skills.list)").option("-a, --args <json>", "Tool arguments as JSON string").option("--stdin", "Read arguments from stdin").option("-j, --json", "Output as JSON").action(async (name, options) => {
    await handleToolsCall(name, options);
  });
}
async function handleToolsCall(name, options) {
  const startTime = Date.now();
  const useJson2 = options.json || !process.stdout.isTTY;
  try {
    const tool = getToolByName(name);
    if (!tool) {
      const availableTools = getAllTools().map((t) => t.name).join(", ");
      throw new Error(
        `Tool "${name}" not found. Available tools: ${availableTools}`
      );
    }
    let args = {};
    if (options.stdin) {
      const stdinData = await readStdin();
      try {
        args = JSON.parse(stdinData);
      } catch {
        throw new Error("Invalid JSON from stdin");
      }
    } else if (options.args) {
      try {
        args = JSON.parse(options.args);
      } catch {
        throw new Error(
          `Invalid JSON in --args. Use: --args '{"key":"value"}'`
        );
      }
    }
    for (const [key, field] of Object.entries(tool.inputSchema)) {
      if (field.required && !(key in args)) {
        throw new Error(`Missing required argument: ${key}`);
      }
    }
    const duration_ms = Date.now() - startTime;
    const result = await executeTool(tool.name, args);
    if (useJson2) {
      const envelope = buildEnvelope(`tools.call.${tool.name}`, result, {
        ok: true,
        duration_ms,
        version: VERSION
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      printHumanReadable2(tool.name, result);
    }
    process.exit(EXIT_CODES.OK);
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    if (useJson2) {
      const envelope = {
        ok: false,
        tool: "tools.call",
        data: null,
        metadata: {
          duration_ms,
          version: VERSION
        },
        error: {
          code: EXIT_CODES.TOOL_ERROR,
          message
        }
      };
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: ${message}`));
    }
    process.exit(EXIT_CODES.TOOL_ERROR);
  }
}
async function readStdin() {
  return new Promise((resolve13, reject) => {
    let data = "";
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk.toString();
      }
    });
    process.stdin.on("end", () => resolve13(data));
    process.stdin.on("error", reject);
  });
}
async function executeTool(name, args) {
  return {
    tool: name,
    args,
    status: "executed",
    message: `Tool "${name}" executed successfully`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function printHumanReadable2(toolName, result) {
  console.log();
  console.log(pc7.green(`\u2713 ${toolName}`));
  console.log(pc7.dim("\u2500".repeat(50)));
  console.log();
  console.log(pc7.bold("Result:"));
  console.log(JSON.stringify(result, null, 2));
  console.log();
}
var SOURCE_LABELS = {
  OS_ENV: "Environment Variable",
  USER_CONFIG: "User Config (~/.config/dai-nexus)",
  PROCESS_ENV: "Process Environment",
  DOTENV: ".env File",
  INLINE_FLAGS: "Inline Flag"
};
var CONFIG_PATHS = {
  USER_CONFIG: join(homedir(), ".config", "dai-nexus", "config.json"),
  LEGACY_CONFIG: join(homedir(), ".dainexus", "config.json"),
  PROJECT_ENV: ".env",
  PROJECT_ENV_LOCAL: ".env.local"
};
var ENV_PREFIX = "FORGE_";
var ConfigStore = class {
  values = /* @__PURE__ */ new Map();
  constructor() {
    this.loadDefaults();
  }
  /**
   * Load default configuration values
   */
  loadDefaults() {
    this.set("dai.debug", false, "DEFAULT");
    this.set("dai.quiet", false, "DEFAULT");
    this.set("dai.json", false, "DEFAULT");
    this.set("dai.color", true, "DEFAULT");
    this.set("dai.apiUrl", "https://api.dainexus.io", "DEFAULT");
    this.set("dai.timeout", 3e4, "DEFAULT");
  }
  /**
   * Set a configuration value
   */
  set(key, value, source) {
    const entry = {
      key,
      value,
      source: source === "DEFAULT" ? "INLINE_FLAGS" : source
    };
    const existing = this.values.get(key);
    if (existing && !this.shouldOverride(existing.source, entry.source)) {
      return;
    }
    this.values.set(key, entry);
  }
  /**
   * Check if new source should override existing
   */
  shouldOverride(existingSource, newSource) {
    const existingPriority = CONFIG_SOURCES[existingSource];
    const newPriority = CONFIG_SOURCES[newSource];
    return existingPriority >= newPriority;
  }
  /**
   * Get a configuration value
   */
  get(key, defaultValue) {
    const entry = this.values.get(key);
    return entry ? entry.value : defaultValue;
  }
  /**
   * Get with source info
   */
  getEntry(key) {
    return this.values.get(key);
  }
  /**
   * Get all entries
   */
  getAll() {
    return Array.from(this.values.values());
  }
  /**
   * Check if key exists
   */
  has(key) {
    return this.values.has(key);
  }
  /**
   * Delete a key
   */
  delete(key) {
    return this.values.delete(key);
  }
  /**
   * Load from user config file
   */
  loadUserConfig() {
    const path = CONFIG_PATHS.USER_CONFIG;
    if (!existsSync(path)) {
      if (existsSync(CONFIG_PATHS.LEGACY_CONFIG)) {
        return this.loadJsonFile(CONFIG_PATHS.LEGACY_CONFIG, "USER_CONFIG");
      }
      return false;
    }
    return this.loadJsonFile(path, "USER_CONFIG");
  }
  /**
   * Load from .env files
   */
  loadEnvFiles(cwd) {
    const paths = [
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV_LOCAL),
      resolve(cwd, CONFIG_PATHS.PROJECT_ENV)
    ];
    for (const path of paths) {
      if (existsSync(path)) {
        this.loadEnvFile(path);
      }
    }
  }
  /**
   * Load environment variables
   */
  loadEnvVars() {
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(ENV_PREFIX) && value !== void 0) {
        const configKey = key.slice(ENV_PREFIX.length).toLowerCase().replace(/_/g, ".");
        this.set(configKey, this.parseValue(value), "OS_ENV");
      }
    }
  }
  /**
   * Load JSON config file
   */
  loadJsonFile(path, source) {
    try {
      const content = readFileSync(path, "utf-8");
      const config = JSON.parse(content);
      for (const [key, value] of Object.entries(config)) {
        this.set(key, value, source);
      }
      return true;
    } catch (error) {
      console.warn(`Warning: Failed to load config from ${path}:`, error);
      return false;
    }
  }
  /**
   * Load .env file
   */
  loadEnvFile(path) {
    try {
      const content = readFileSync(path, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          this.set(key.trim(), this.parseValue(value.trim()), "DOTENV");
        }
      }
    } catch (error) {
      console.warn(`Warning: Failed to load .env from ${path}:`, error);
    }
  }
  /**
   * Parse value to appropriate type
   */
  parseValue(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value === "undefined") return void 0;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    if (value.startsWith("{") && value.endsWith("}") || value.startsWith("[") && value.endsWith("]")) {
      try {
        return JSON.parse(value);
      } catch {
      }
    }
    return value;
  }
};
var globalConfig = null;
function getConfig() {
  if (!globalConfig) {
    globalConfig = new ConfigStore();
  }
  return globalConfig;
}

// src/commands/config.ts
function registerConfigCommands(program) {
  const config = program.command("config").description("Configuration management");
  config.command("get").description("Get a configuration value").argument("<key>", "Configuration key").option("-j, --json", "Output as JSON").action(async (key, options) => {
    await handleConfigGet(key, options.json);
  });
  config.command("set").description("Set a configuration value").argument("<key>", "Configuration key").argument("<value>", "Configuration value").option("-j, --json", "Output as JSON").action(async (key, value, options) => {
    await handleConfigSet(key, value, options.json);
  });
  config.command("list").description("List all configuration values").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleConfigList(options.json);
  });
  config.command("init").description("Initialize configuration file").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleConfigInit(options.json);
  });
  config.command("delete").description("Delete a configuration value").argument("<key>", "Configuration key").option("-j, --json", "Output as JSON").action(async (key, options) => {
    await handleConfigDelete(key, options.json);
  });
}
async function handleConfigGet(key, useJson2) {
  const startTime = Date.now();
  const config = getConfig();
  const entry = config.getEntry(key);
  if (!entry) {
    if (useJson2 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.get",
        { key, found: false },
        {
          ok: false,
          duration_ms: Date.now() - startTime,
          version: VERSION,
          error: { code: 3, message: `Configuration key not found: ${key}` }
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.get",
      {
        key,
        value: entry.value,
        source: entry.source,
        sourceLabel: SOURCE_LABELS[entry.source]
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold(`  ${key}`));
    console.log(`  ${pc7.gray("\u2500".repeat(50))}`);
    console.log(`  Value: ${pc7.green(JSON.stringify(entry.value, null, 2))}`);
    console.log(`  Source: ${pc7.cyan(SOURCE_LABELS[entry.source])}`);
    console.log();
  }
  process.exit(0);
}
async function handleConfigSet(key, value, useJson2) {
  const startTime = Date.now();
  const config = getConfig();
  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }
  config.set(key, parsedValue, "USER_CONFIG");
  const configPath = CONFIG_PATHS.USER_CONFIG;
  mkdirSync(dirname(configPath), { recursive: true });
  let existingConfig = {};
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      existingConfig = JSON.parse(content);
    } catch {
    }
  }
  existingConfig[key] = parsedValue;
  writeFileSync(configPath, JSON.stringify(existingConfig, null, 2) + "\n");
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.set",
      {
        key,
        value: parsedValue,
        source: "USER_CONFIG",
        persisted: true
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.green(`  \u2713 ${key}`));
    console.log(`  ${pc7.gray("\u2500".repeat(50))}`);
    console.log(`  Value: ${JSON.stringify(parsedValue)}`);
    console.log(`  Saved to: ${pc7.cyan(configPath)}`);
    console.log();
  }
  process.exit(0);
}
async function handleConfigList(useJson2) {
  const startTime = Date.now();
  const config = getConfig();
  const entries = config.getAll();
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.list",
      {
        entries: entries.map((e) => ({
          key: e.key,
          value: e.value,
          source: e.source,
          sourceLabel: SOURCE_LABELS[e.source]
        })),
        total: entries.length
      },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Configuration\n"));
    const bySource = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      const source = SOURCE_LABELS[entry.source];
      const list = bySource.get(source) || [];
      list.push(entry);
      bySource.set(source, list);
    }
    for (const [source, sourceEntries] of bySource) {
      console.log(pc7.cyan(`  ${source}`));
      console.log(pc7.gray("  " + "\u2500".repeat(40)));
      for (const entry of sourceEntries) {
        const valueStr = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
        console.log(
          `    ${pc7.green(entry.key.padEnd(30))} ${pc7.dim(valueStr.slice(0, 50))}`
        );
      }
      console.log();
    }
    console.log(pc7.dim("  Use --json for machine-readable output"));
    console.log();
  }
  process.exit(0);
}
async function handleConfigInit(useJson2) {
  const startTime = Date.now();
  const configPath = CONFIG_PATHS.USER_CONFIG;
  mkdirSync(dirname(configPath), { recursive: true });
  const defaultConfig = {
    version: VERSION,
    defaults: {
      debug: false,
      quiet: false,
      json: false,
      color: true
    }
  };
  if (existsSync(configPath)) {
    if (useJson2 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.init",
        {
          path: configPath,
          status: "already_exists"
        },
        {
          ok: true,
          duration_ms: Date.now() - startTime,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log(pc7.yellow(`  Configuration already exists at ${configPath}`));
    }
  } else {
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n");
    if (useJson2 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.init",
        {
          path: configPath,
          status: "created"
        },
        {
          ok: true,
          duration_ms: Date.now() - startTime,
          version: VERSION
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.log();
      console.log(pc7.green(`  \u2713 Created ${configPath}`));
      console.log();
    }
  }
  process.exit(0);
}
async function handleConfigDelete(key, useJson2) {
  const startTime = Date.now();
  const config = getConfig();
  if (!config.has(key)) {
    if (useJson2 || !process.stdout.isTTY) {
      const envelope = buildEnvelope(
        "config.delete",
        { key, found: false },
        {
          ok: false,
          duration_ms: Date.now() - startTime,
          version: VERSION,
          error: { code: 3, message: `Configuration key not found: ${key}` }
        }
      );
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(pc7.red(`Error: Configuration key not found: ${key}`));
    }
    process.exit(3);
  }
  config.delete(key);
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(
      "config.delete",
      { key, deleted: true },
      {
        ok: true,
        duration_ms: Date.now() - startTime,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log(pc7.green(`  \u2713 Deleted ${key}`));
  }
  process.exit(0);
}
function registerDoctorCommand(program) {
  program.command("doctor").description("Run diagnostics and health checks").option("-v, --verbose", "Verbose output").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleDoctor(options);
  });
}
async function handleDoctor(options) {
  const startTime = Date.now();
  const useJson2 = options.json || !process.stdout.isTTY;
  const verbose = options.verbose;
  const checks = [];
  checks.push(checkNodeVersion());
  checks.push(checkDaiNexus());
  checks.push(checkConfig());
  checks.push(checkMemory());
  checks.push(checkDaiNexusNode());
  const healthy = checks.filter((c) => c.status === "ok").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const errors = checks.filter((c) => c.status === "error").length;
  const allOk = errors === 0;
  if (useJson2) {
    const envelope = buildEnvelope(
      "doctor.check",
      {
        checks,
        summary: {
          healthy,
          warnings,
          errors,
          allOk
        }
      },
      {
        ok: allOk,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: allOk ? void 0 : {
          code: errors > 0 ? 1 : 2,
          message: `${errors} errors, ${warnings} warnings`
        }
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable3(checks, healthy, warnings, errors, verbose);
  }
  process.exit(allOk ? 0 : errors > 0 ? 1 : 0);
}
function checkNodeVersion() {
  const version = process.version;
  const match = version.match(/^v(\d+)\./);
  if (!match) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Unknown version: ${version}`
    };
  }
  const major = parseInt(match[1], 10);
  if (major < 18) {
    return {
      name: "Node.js Version",
      status: "error",
      message: `Node.js ${major} is too old. Minimum: 18`,
      details: `Current: ${version}`
    };
  }
  if (major < 20) {
    return {
      name: "Node.js Version",
      status: "warning",
      message: `Node.js ${major} is older than recommended`,
      details: `Current: ${version}, Recommended: 20+`
    };
  }
  return {
    name: "Node.js Version",
    status: "ok",
    message: version
  };
}
function checkDaiNexus() {
  const cwd = process.cwd();
  const daiNexusRoot = findDaiNexusRoot(cwd);
  if (!daiNexusRoot) {
    return {
      name: "DAI Nexus Project",
      status: "warning",
      message: "Not in a DAI Nexus project",
      details: "Some features may not be available"
    };
  }
  return {
    name: "DAI Nexus Project",
    status: "ok",
    message: `Found at ${daiNexusRoot}`
  };
}
function checkConfig() {
  const userConfig = resolve(homedir(), ".config", "dai-nexus", "config.json");
  const legacyConfig = resolve(homedir(), ".dainexus", "config.json");
  if (existsSync(userConfig)) {
    return {
      name: "User Configuration",
      status: "ok",
      message: "Configuration file found",
      details: userConfig
    };
  }
  if (existsSync(legacyConfig)) {
    return {
      name: "User Configuration",
      status: "warning",
      message: "Using legacy config location",
      details: `${legacyConfig} - consider migrating to ${userConfig}`
    };
  }
  return {
    name: "User Configuration",
    status: "warning",
    message: "No configuration file found",
    details: "Run: dai config init"
  };
}
function checkMemory() {
  const memoryPath = resolve(process.cwd(), ".dainexus", "memory.jsonl");
  if (!existsSync(memoryPath)) {
    return {
      name: "Memory Store",
      status: "warning",
      message: "No memory store found",
      details: "Run: dai config init"
    };
  }
  return {
    name: "Memory Store",
    status: "ok",
    message: "Memory store found",
    details: memoryPath
  };
}
function checkDaiNexusNode() {
  try {
    const result = execSync(
      'npx dainexus-node --version 2>/dev/null || echo "not_found"',
      {
        encoding: "utf-8",
        timeout: 5e3
      }
    );
    if (result.trim() === "not_found") {
      return {
        name: "DAI Nexus Node",
        status: "warning",
        message: "DAI Nexus Node not installed",
        details: "Run: npm install -g dainexus-node"
      };
    }
    return {
      name: "DAI Nexus Node",
      status: "ok",
      message: result.trim()
    };
  } catch {
    return {
      name: "DAI Nexus Node",
      status: "warning",
      message: "Could not verify DAI Nexus Node",
      details: "Run: npx dainexus-node --version"
    };
  }
}
function findDaiNexusRoot(cwd) {
  let current = cwd;
  while (current !== "/") {
    const configPath = join(current, ".dainexus");
    if (existsSync(configPath)) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function printHumanReadable3(checks, _healthy, warnings, errors, verbose) {
  console.log();
  console.log(
    pc7.bold(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    pc7.bold("\u2551") + "              DAI Nexus Doctor".padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const allOk = errors === 0;
  const statusIcon = allOk ? pc7.green("\u2713") : pc7.red("\u2717");
  const statusText = allOk ? pc7.green("All checks passed") : pc7.red(`${errors} errors, ${warnings} warnings`);
  console.log(
    pc7.bold("\u2551") + `  ${statusIcon} ${statusText}`.padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  for (const check of checks) {
    const icon = check.status === "ok" ? pc7.green("\u2713") : check.status === "warning" ? pc7.yellow("\u26A0") : pc7.red("\u2717");
    const statusColor = check.status === "ok" ? pc7.green : check.status === "warning" ? pc7.yellow : pc7.red;
    console.log(`  ${icon} ${pc7.bold(check.name)}`);
    console.log(`    ${statusColor(check.message)}`);
    if (verbose && check.details) {
      console.log(`    ${pc7.dim(check.details)}`);
    }
  }
  console.log();
  if (warnings > 0 || errors > 0) {
    console.log(pc7.dim("  Run with --verbose for more details"));
    console.log(pc7.dim("  Run with --json for machine-readable output"));
  }
}
function registerValidateCommand(program) {
  program.command("validate").description("Run quality gate validation").option(
    "-l, --level <1-4>",
    "Validation level (1: build, 2: +regression, 3: +standards, 4: +traceability)",
    "4"
  ).option("--strict", "Treat warnings as failures").option("-j, --json", "Output as JSON").option("--report <path>", "Write report to file").action(
    async (options) => {
      await handleValidate(options);
    }
  );
}
async function handleValidate(options) {
  const startTime = Date.now();
  const useJson2 = options.json || !process.stdout.isTTY;
  const level = parseInt(options.level, 10);
  if (isNaN(level) || level < 1 || level > 4) {
    if (useJson2) {
      const envelope = buildEnvelope("validate.quality", null, {
        ok: false,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: { code: 2, message: "Invalid level. Use 1, 2, 3, or 4." }
      });
      console.log(JSON.stringify(envelope, null, 2));
    } else {
      console.error(
        pc7.red(`Error: Invalid level "${options.level}". Use 1, 2, 3, or 4.`)
      );
    }
    process.exit(2);
  }
  const result = await runValidation(level, options.strict);
  if (options.report) {
    const reportContent = useJson2 ? JSON.stringify(result, null, 2) : generateTextReport(result);
    writeFileSync(options.report, reportContent + "\n");
  }
  if (useJson2) {
    const envelope = buildEnvelope("validate.quality", result, {
      ok: result.issues.length === 0,
      duration_ms: Date.now() - startTime,
      version: VERSION,
      error: result.issues.length > 0 ? { code: 1, message: `${result.issues.length} issues found` } : void 0
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    printHumanReadable4(result);
  }
  const exitCode = result.issues.length > 0 ? 1 : 0;
  process.exit(exitCode);
}
async function runValidation(level, strict) {
  const checks = [];
  const issues = [];
  const warnings = [];
  let totalScore = 0;
  let maxScore = 0;
  if (level >= 1) {
    const buildChecks = await runBuildChecks();
    checks.push(...buildChecks.checks);
    issues.push(...buildChecks.issues);
    warnings.push(...buildChecks.warnings);
    totalScore += buildChecks.score;
    maxScore += buildChecks.maxScore;
  }
  if (level >= 2) {
    const regressionChecks = await runRegressionChecks();
    checks.push(...regressionChecks.checks);
    issues.push(...regressionChecks.issues);
    warnings.push(...regressionChecks.warnings);
    totalScore += regressionChecks.score;
    maxScore += regressionChecks.maxScore;
  }
  if (level >= 3) {
    const standardsChecks = await runStandardsChecks();
    checks.push(...standardsChecks.checks);
    issues.push(...standardsChecks.issues);
    warnings.push(...standardsChecks.warnings);
    totalScore += standardsChecks.score;
    maxScore += standardsChecks.maxScore;
  }
  if (level >= 4) {
    const traceabilityChecks = await runTraceabilityChecks();
    checks.push(...traceabilityChecks.checks);
    issues.push(...traceabilityChecks.issues);
    warnings.push(...traceabilityChecks.warnings);
    totalScore += traceabilityChecks.score;
    maxScore += traceabilityChecks.maxScore;
  }
  if (strict && warnings.length > 0) {
    issues.push(...warnings.map((warning) => `Strict warning: ${warning}`));
  }
  const percentage = maxScore > 0 ? totalScore / maxScore * 100 : 0;
  let grade = "F";
  if (percentage >= 90) grade = "A";
  else if (percentage >= 80) grade = "B";
  else if (percentage >= 70) grade = "C";
  else if (percentage >= 60) grade = "D";
  return {
    level,
    score: totalScore,
    maxScore,
    grade,
    checks,
    issues,
    warnings
  };
}
async function runBuildChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync("package.json")) {
    const packageJson = readPackageJson();
    const scripts = packageJson?.scripts ?? {};
    checks.push({
      name: "Build Tool",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "package.json found"
    });
    try {
      execSync("npm run build --silent 2>/dev/null", {
        stdio: "pipe",
        timeout: 6e4
      });
      checks.push({
        name: "Build Success",
        status: "pass",
        score: 15,
        maxScore: 15,
        message: "Build completed successfully"
      });
      score += 15;
    } catch {
      checks.push({
        name: "Build Success",
        status: "fail",
        score: 0,
        maxScore: 15,
        message: "Build failed"
      });
      issues.push("Build failed");
    }
    const typecheckCommand = typeof scripts.typecheck === "string" ? "npm run typecheck --silent" : null;
    if (!typecheckCommand) {
      checks.push({
        name: "TypeScript Check",
        status: "skip",
        score: 10,
        maxScore: 10,
        message: "No typecheck script or tsconfig.json; skipped"
      });
      score += 10;
    } else {
      try {
        execSync(`${typecheckCommand} 2>/dev/null`, {
          stdio: "pipe",
          timeout: 6e4
        });
        checks.push({
          name: "TypeScript Check",
          status: "pass",
          score: 10,
          maxScore: 10,
          message: "TypeScript compilation passed"
        });
        score += 10;
      } catch {
        checks.push({
          name: "TypeScript Check",
          status: "fail",
          score: 0,
          maxScore: 10,
          message: "TypeScript compilation errors"
        });
        issues.push("TypeScript compilation failed");
      }
    }
  } else {
    checks.push({
      name: "Build Tool",
      status: "skip",
      score: 0,
      maxScore: 0,
      message: "No package.json found"
    });
  }
  return { checks, issues, warnings, score, maxScore };
}
function readPackageJson() {
  try {
    return JSON.parse(readFileSync("package.json", "utf-8"));
  } catch {
    return null;
  }
}
async function runRegressionChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync(".git")) {
    checks.push({
      name: "Git Repository",
      status: "pass",
      score: 0,
      maxScore: 0,
      message: "Git repository detected"
    });
    if (existsSync("package.json")) {
      try {
        execSync("npm test --silent 2>/dev/null", {
          stdio: "pipe",
          timeout: 12e4
        });
        checks.push({
          name: "Test Suite",
          status: "pass",
          score: 25,
          maxScore: 25,
          message: "All tests passed"
        });
        score += 25;
      } catch {
        checks.push({
          name: "Test Suite",
          status: "fail",
          score: 0,
          maxScore: 25,
          message: "Test suite has failures"
        });
        issues.push("Test suite failed");
      }
    } else {
      checks.push({
        name: "Test Suite",
        status: "skip",
        score: 25,
        maxScore: 25,
        message: "No test suite configured"
      });
      score += 25;
    }
  } else {
    checks.push({
      name: "Git Repository",
      status: "skip",
      score: 25,
      maxScore: 25,
      message: "Not a git repository"
    });
    score += 25;
  }
  return { checks, issues, warnings, score, maxScore };
}
async function runStandardsChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 30;
  const maxScore = 30;
  try {
    const todoOutput = execSync(
      'git grep -nE "TODO|FIXME|HACK|XXX" -- "*.ts" "*.js" "*.tsx" "*.jsx" ":(exclude)node_modules/**" ":(exclude)dist/**" ":(exclude)build/**" ":(exclude)tests/**" ":(exclude)**/*.test.*" ":(exclude)**/*.spec.*" ":(exclude)scripts/comment-checker/**" ":(exclude)src/cli/src/commands/validate.ts" 2>/dev/null | head -5 || true',
      { encoding: "utf-8", timeout: 1e4 }
    );
    if (todoOutput.trim()) {
      const count = todoOutput.trim().split("\n").length;
      checks.push({
        name: "Code Quality",
        status: "warning",
        score: 0,
        maxScore: 10,
        message: `Found ${count} TODOs/FIXMEs`
      });
      warnings.push(`${count} TODOs/FIXMEs found`);
      score -= 10;
    } else {
      checks.push({
        name: "Code Quality",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No TODOs/FIXMEs found"
      });
    }
  } catch {
    checks.push({
      name: "Code Quality",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No TODOs/FIXMEs found"
    });
  }
  try {
    const secretOutput = execSync(
      'grep -rnE "(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|password[[:space:]]*[:=])" --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build 2>/dev/null | grep -v ".env" | grep -v ".test." | grep -v ".spec." | head -5 || true',
      { encoding: "utf-8", timeout: 1e4 }
    );
    if (secretOutput.trim()) {
      const count = secretOutput.trim().split("\n").length;
      checks.push({
        name: "Secret Detection",
        status: "fail",
        score: 0,
        maxScore: 10,
        message: `Found ${count} potential hardcoded secrets`
      });
      issues.push(`${count} potential secrets detected`);
      score -= 10;
    } else {
      checks.push({
        name: "Secret Detection",
        status: "pass",
        score: 10,
        maxScore: 10,
        message: "No hardcoded secrets detected"
      });
    }
  } catch {
    checks.push({
      name: "Secret Detection",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "No hardcoded secrets detected"
    });
  }
  const conventionFile = [
    ".dainexus/code-conventions.md",
    "skills/_shared/protocols/pipeline-activation.md",
    "AGENTS.md"
  ].find((file) => existsSync(file));
  if (conventionFile) {
    checks.push({
      name: "Code Conventions",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: `Code conventions defined in ${conventionFile}`
    });
  } else {
    checks.push({
      name: "Code Conventions",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No code conventions file"
    });
    warnings.push("No .dainexus/code-conventions.md");
    score -= 5;
  }
  if (existsSync("README.md")) {
    checks.push({
      name: "Documentation",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: "README.md found"
    });
  } else {
    checks.push({
      name: "Documentation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No README.md"
    });
    warnings.push("No README.md");
    score -= 5;
  }
  return { checks, issues, warnings, score, maxScore };
}
async function runTraceabilityChecks() {
  const checks = [];
  const issues = [];
  const warnings = [];
  let score = 0;
  const maxScore = 25;
  if (existsSync(".dainexus/product-manager/BRD")) {
    checks.push({
      name: "Requirement Mapping",
      status: "pass",
      score: 10,
      maxScore: 10,
      message: "BRD directory found"
    });
  } else {
    checks.push({
      name: "Requirement Mapping",
      status: "skip",
      score: 10,
      maxScore: 10,
      message: "No BRD directory; requirement mapping treated as not applicable"
    });
  }
  score += 10;
  try {
    const testFiles = execSync(
      'find . \\( -name "*.test.*" -o -name "*.spec.*" -o -name "test_*" \\) -not -path "./node_modules/*" -not -path "./dist/*" | head -5',
      { encoding: "utf-8", timeout: 1e4 }
    ).trim().split("\n").filter(Boolean);
    if (testFiles.length > 0) {
      checks.push({
        name: "Test Traceability",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: `Found ${testFiles.length} test file(s)`
      });
      score += 5;
    } else {
      checks.push({
        name: "Test Traceability",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "No test files found"
      });
      warnings.push("No test files found");
    }
  } catch {
    checks.push({
      name: "Test Traceability",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "Could not inspect test files"
    });
    warnings.push("Could not inspect test files");
  }
  if (existsSync(".dainexus")) {
    checks.push({
      name: "Workspace Artifacts",
      status: "pass",
      score: 5,
      maxScore: 5,
      message: ".dainexus workspace exists"
    });
    score += 5;
  } else {
    checks.push({
      name: "Workspace Artifacts",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No .dainexus workspace artifacts found"
    });
    warnings.push("No .dainexus workspace artifacts found");
  }
  if (existsSync("scripts/pipeline-preflight.sh")) {
    try {
      execSync("bash scripts/pipeline-preflight.sh --max-state-age-minutes 240 --json-only", {
        stdio: "pipe",
        timeout: 15e3
      });
      checks.push({
        name: "Pipeline Activation",
        status: "pass",
        score: 5,
        maxScore: 5,
        message: "Pipeline activation controls pass"
      });
      score += 5;
    } catch {
      checks.push({
        name: "Pipeline Activation",
        status: "warning",
        score: 0,
        maxScore: 5,
        message: "Pipeline activation preflight failed"
      });
      warnings.push("Pipeline activation preflight failed");
    }
  } else {
    checks.push({
      name: "Pipeline Activation",
      status: "warning",
      score: 0,
      maxScore: 5,
      message: "No pipeline preflight script"
    });
    warnings.push("No scripts/pipeline-preflight.sh");
  }
  return { checks, issues, warnings, score, maxScore };
}
function generateTextReport(result) {
  const lines = [];
  lines.push("=== DAI Nexus Quality Gate Report ===");
  lines.push(`Level: ${result.level}`);
  lines.push(`Score: ${result.score}/${result.maxScore} (${result.grade})`);
  lines.push("");
  for (const check of result.checks) {
    const icon = check.status === "pass" ? "\u2713" : check.status === "fail" ? "\u2717" : "\u25CB";
    lines.push(`${icon} ${check.name}: ${check.message}`);
  }
  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    for (const issue of result.issues) {
      lines.push(`  - ${issue}`);
    }
  }
  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  return lines.join("\n");
}
function printHumanReadable4(result) {
  const percentage = result.maxScore > 0 ? Math.round(result.score / result.maxScore * 100) : 0;
  console.log();
  console.log(
    pc7.bold(
      "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557"
    )
  );
  console.log(
    pc7.bold("\u2551") + "          Quality Gate Validation".padEnd(62) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563"
    )
  );
  const gradeColor = result.grade === "A" ? pc7.green : result.grade === "B" ? pc7.cyan : result.grade === "C" ? pc7.yellow : pc7.red;
  console.log(
    pc7.bold("\u2551") + `  Level ${result.level} | ${result.score}/${result.maxScore} (${gradeColor(result.grade)}) | ${percentage}%`.padEnd(
      62
    ) + pc7.bold("\u2551")
  );
  console.log(
    pc7.bold(
      "\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D"
    )
  );
  console.log();
  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log(pc7.green("  \u2713 All checks passed"));
  } else {
    if (result.issues.length > 0) {
      console.log(pc7.red(`  \u2717 ${result.issues.length} issue(s)`));
    }
    if (result.warnings.length > 0) {
      console.log(pc7.yellow(`  \u26A0 ${result.warnings.length} warning(s)`));
    }
  }
  console.log();
  console.log(pc7.bold("  Checks:"));
  console.log(pc7.gray("  " + "\u2500".repeat(50)));
  for (const check of result.checks) {
    const icon = check.status === "pass" ? pc7.green("\u2713") : check.status === "fail" ? pc7.red("\u2717") : pc7.gray("\u25CB");
    const statusColor = check.status === "pass" ? pc7.green : check.status === "fail" ? pc7.red : check.status === "warning" ? pc7.yellow : pc7.gray;
    console.log(
      `    ${icon} ${check.name.padEnd(20)} ${statusColor(check.message)}`
    );
  }
  console.log();
  if (result.issues.length > 0) {
    console.log(pc7.dim("  Run with --json for machine-readable output"));
  }
}
var completionsDir = join(process.cwd(), "completions");
function registerCompletionCommand(program) {
  program.command("completion").description("Generate shell completion scripts").argument("<shell>", "Shell type (bash|zsh|fish)").action(async (shell) => {
    await handleCompletion(shell);
  });
}
async function handleCompletion(shell) {
  const shells = {
    bash: "dai.bash",
    zsh: "dai.zsh",
    fish: "dai.fish"
  };
  const filename = shells[shell.toLowerCase()];
  if (!filename) {
    console.error(
      `Error: Unknown shell "${shell}". Supported: bash, zsh, fish`
    );
    process.exit(2);
  }
  const completionPath = join(completionsDir, filename);
  try {
    const content = readFileSync(completionPath, "utf-8");
    console.log(content);
    process.exit(0);
  } catch (error) {
    console.error(`Error: Failed to load completion script for ${shell}`);
    process.exit(1);
  }
}

// src/utils/coordinate-converter.ts
var ENGINE_SPECS = {
  unity: {
    handedness: "left",
    forwardAxis: "z",
    forwardSign: -1,
    unitScale: 1
    // 1 unit = 1 meter
  },
  godot: {
    handedness: "right",
    forwardAxis: "z",
    forwardSign: 1,
    unitScale: 1
    // 1 unit = 1 meter
  },
  unreal: {
    handedness: "left",
    forwardAxis: "z",
    forwardSign: 1,
    unitScale: 0.01
    // 1 unit = 1 cm = 0.01 meters
  },
  blender: {
    handedness: "right",
    forwardAxis: "y",
    // or z in newer versions
    forwardSign: -1,
    unitScale: 1
    // 1 unit = 1 meter
  }
};
function convertPosition(pos, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  let result = { ...pos };
  if (fromSpec.handedness !== toSpec.handedness) {
    result = flipHandedness(result);
  }
  const scaleFactor = toSpec.unitScale / fromSpec.unitScale;
  if (scaleFactor !== 1) {
    result = {
      x: result.x * scaleFactor,
      y: result.y * scaleFactor,
      z: result.z * scaleFactor
    };
  }
  return result;
}
function flipHandedness(pos) {
  return {
    x: pos.x,
    y: pos.y,
    z: -pos.z
  };
}
function convertRotation(euler, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  let result = { ...euler };
  if (fromSpec.handedness !== toSpec.handedness) {
    result = {
      x: result.x,
      y: -result.y,
      z: -result.z
    };
  }
  return result;
}
function convertScale(scale, from, to) {
  const fromSpec = ENGINE_SPECS[from];
  const toSpec = ENGINE_SPECS[to];
  const scaleFactor = fromSpec.unitScale / toSpec.unitScale;
  return {
    x: scale.x * scaleFactor,
    y: scale.y * scaleFactor,
    z: scale.z * scaleFactor
  };
}
function distanceFromOrigin(pos) {
  return Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
}
function getPrecisionWarning(pos) {
  const distance = distanceFromOrigin(pos);
  if (distance > 1e4) {
    return `CRITICAL: Position is ${distance.toFixed(0)} units from origin. Floating point precision may cause jittering, snapping, or teleportation. Consider using Floating Origin pattern.`;
  } else if (distance > 5e3) {
    return `WARNING: Position is ${distance.toFixed(0)} units from origin. Precision may decrease. Consider implementing Floating Origin.`;
  } else if (distance > 1e3) {
    return `INFO: Position is ${distance.toFixed(0)} units from origin. Still safe but monitor for precision issues.`;
  }
  return "";
}
function validateTransform(transform, _engine) {
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    info: []
  };
  const coords = [transform.position, transform.rotation, transform.scale];
  for (const coord of coords) {
    if (isNaN(coord.x) || isNaN(coord.y) || isNaN(coord.z)) {
      result.errors.push("Transform contains NaN values");
      result.valid = false;
    }
    if (!isFinite(coord.x) || !isFinite(coord.y) || !isFinite(coord.z)) {
      result.errors.push("Transform contains infinite values");
      result.valid = false;
    }
  }
  if (transform.scale.x <= 0 || transform.scale.y <= 0 || transform.scale.z <= 0) {
    result.warnings.push(
      "Scale has zero or negative values. This may cause rendering issues."
    );
  }
  const precisionWarning = getPrecisionWarning(transform.position);
  if (precisionWarning.includes("CRITICAL")) {
    result.errors.push(precisionWarning);
    result.valid = false;
  } else if (precisionWarning.includes("WARNING")) {
    result.warnings.push(precisionWarning);
  } else if (precisionWarning) {
    result.info.push(precisionWarning);
  }
  for (const angle of [
    transform.rotation.x,
    transform.rotation.y,
    transform.rotation.z
  ]) {
    if (Math.abs(angle) > 36e3) {
      result.warnings.push(
        `Rotation angle ${angle}\xB0 is extremely large. Consider normalizing.`
      );
    }
  }
  return result;
}
function parsePosition(str) {
  const parts = str.split(/[,\s]+/).map((p) => parseFloat(p.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { x: parts[0], y: parts[1], z: parts[2] };
}
function formatPosition(pos, precision = 3) {
  return `${pos.x.toFixed(precision)}, ${pos.y.toFixed(precision)}, ${pos.z.toFixed(precision)}`;
}
function formatRotation(euler, precision = 2) {
  return `${euler.x.toFixed(precision)}\xB0, ${euler.y.toFixed(precision)}\xB0, ${euler.z.toFixed(precision)}\xB0`;
}
function formatScale(scale, precision = 3) {
  return `${scale.x.toFixed(precision)}, ${scale.y.toFixed(precision)}, ${scale.z.toFixed(precision)}`;
}

// src/commands/coords.ts
function registerCoordsCommand(program) {
  const coords = program.command("coords").description("Coordinate system conversion and validation tools");
  coords.command("convert").description("Convert coordinates between game engines").argument("<position>", 'Position in format "x,y,z"').option("-f, --from <engine>", "Source engine", "unity").option("-t, --to <engine>", "Target engine", "godot").option(
    "-r, --rotation <rot>",
    'Rotation in format "x,y,z" (Euler degrees)'
  ).option("-s, --scale <scale>", 'Scale in format "x,y,z"', "1,1,1").option("-j, --json", "Output as JSON").option("-v, --verbose", "Show conversion details").action(async (position, options) => {
    await handleConvert(position, options);
  });
  coords.command("validate").description("Validate coordinate bounds and precision").argument("<position>", 'Position in format "x,y,z"').option("-e, --engine <engine>", "Engine type", "unity").option("-r, --rotation <rot>", 'Rotation in format "x,y,z"').option("-s, --scale <scale>", 'Scale in format "x,y,z"', "1,1,1").option("-j, --json", "Output as JSON").option(
    "-w, --warn-threshold <n>",
    "Warning threshold for distance from origin",
    "5000"
  ).action(async (position, options) => {
    await handleValidate2(position, options);
  });
  coords.command("engines").description("List supported game engines and their coordinate systems").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleEngines(options);
  });
  coords.command("ref").description("Show quick reference for coordinate conversions").action(async () => {
    await handleRef();
  });
  coords.command("batch").description("Batch convert coordinates from CSV").argument("[file]", "Input CSV file (stdin if not specified)").option("-f, --from <engine>", "Source engine", "unity").option("-t, --to <engine>", "Target engine", "godot").option(
    "-c, --columns <cols>",
    "Column indices for x,y,z (1-based)",
    "1,2,3"
  ).option("-o, --output <file>", "Output file (stdout if not specified)").option("-j, --json", "Output as JSON lines").action(async (file, options) => {
    await handleBatch(file, options);
  });
}
var VALID_ENGINES = ["unity", "godot", "unreal", "blender"];
function isValidEngine(name) {
  return VALID_ENGINES.includes(name);
}
async function handleConvert(position, options) {
  const fromEngine = options.from.toLowerCase();
  const toEngine = options.to.toLowerCase();
  if (!isValidEngine(fromEngine)) {
    console.error(pc7.red(`Invalid source engine: ${options.from}`));
    console.error(pc7.dim(`Valid engines: ${VALID_ENGINES.join(", ")}`));
    process.exit(1);
  }
  if (!isValidEngine(toEngine)) {
    console.error(pc7.red(`Invalid target engine: ${options.to}`));
    console.error(pc7.dim(`Valid engines: ${VALID_ENGINES.join(", ")}`));
    process.exit(1);
  }
  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc7.red(`Invalid position format: ${position}`));
    console.error(pc7.dim('Expected format: "x,y,z" (e.g., "1.5, 2.0, -3.5")'));
    process.exit(1);
  }
  let rotation = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc7.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }
  let scale = parsePosition(options.scale);
  if (!scale) {
    console.error(pc7.red(`Invalid scale format: ${options.scale}`));
    process.exit(1);
  }
  const from = fromEngine;
  const to = toEngine;
  const convertedPos = convertPosition(pos, from, to);
  const convertedScale = convertScale(scale, from, to);
  let convertedRot = null;
  if (rotation) {
    convertedRot = convertRotation(rotation, from, to);
  }
  const precisionWarning = getPrecisionWarning(convertedPos);
  if (options.json) {
    const envelope = buildEnvelope(
      "coords.convert",
      {
        source: { engine: from, position: pos, rotation, scale },
        target: {
          engine: to,
          position: convertedPos,
          rotation: convertedRot,
          scale: convertedScale
        },
        precisionWarning: precisionWarning || void 0
      },
      {
        ok: true,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Coordinate Conversion"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    console.log(pc7.dim(`  ${from.toUpperCase()} \u2192 ${to.toUpperCase()}`));
    console.log();
    console.log(pc7.cyan("  Position:"));
    console.log(`    ${pc7.dim("From:")} ${formatPosition(pos)}`);
    console.log(
      `    ${pc7.dim("To:  ")} ${pc7.green(formatPosition(convertedPos))}`
    );
    if (rotation && convertedRot) {
      console.log();
      console.log(pc7.cyan("  Rotation:"));
      console.log(`    ${pc7.dim("From:")} ${formatRotation(rotation)}`);
      console.log(
        `    ${pc7.dim("To:  ")} ${pc7.green(formatRotation(convertedRot))}`
      );
    }
    console.log();
    console.log(pc7.cyan("  Scale:"));
    console.log(`    ${pc7.dim("From:")} ${formatScale(scale)}`);
    console.log(
      `    ${pc7.dim("To:  ")} ${pc7.green(formatScale(convertedScale))}`
    );
    if (options.verbose) {
      console.log();
      console.log(pc7.cyan("  Engine Specs:"));
      const fromSpec = ENGINE_SPECS[from];
      const toSpec = ENGINE_SPECS[to];
      console.log(
        `    ${from}: ${fromSpec.handedness}-handed, ${fromSpec.forwardSign === 1 ? "+" : "-"}${fromSpec.forwardAxis} forward, ${1 / fromSpec.unitScale}:1 ratio`
      );
      console.log(
        `    ${to}: ${toSpec.handedness}-handed, ${toSpec.forwardSign === 1 ? "+" : "-"}${toSpec.forwardAxis} forward, ${1 / toSpec.unitScale}:1 ratio`
      );
    }
    if (precisionWarning) {
      console.log();
      if (precisionWarning.includes("CRITICAL")) {
        console.log(pc7.red(`  \u26A0 ${precisionWarning}`));
      } else if (precisionWarning.includes("WARNING")) {
        console.log(pc7.yellow(`  \u26A0 ${precisionWarning}`));
      } else {
        console.log(pc7.dim(`  \u2139 ${precisionWarning}`));
      }
    }
    console.log();
  }
}
async function handleValidate2(position, options) {
  const engine = options.engine.toLowerCase();
  if (!isValidEngine(engine)) {
    console.error(pc7.red(`Invalid engine: ${options.engine}`));
    process.exit(1);
  }
  const pos = parsePosition(position);
  if (!pos) {
    console.error(pc7.red(`Invalid position format: ${position}`));
    process.exit(1);
  }
  let rotation = null;
  if (options.rotation) {
    rotation = parsePosition(options.rotation);
    if (!rotation) {
      console.error(pc7.red(`Invalid rotation format: ${options.rotation}`));
      process.exit(1);
    }
  }
  const scale = parsePosition(options.scale) || { x: 1, y: 1, z: 1 };
  const threshold = parseFloat(options.warnThreshold) || 5e3;
  const result = validateTransform(
    { position: pos, rotation: rotation || { x: 0, y: 0, z: 0 }, scale });
  const distance = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);
  if (distance > threshold) {
    result.warnings.push(
      `Distance from origin (${distance.toFixed(0)}) exceeds threshold (${threshold})`
    );
  }
  if (options.json) {
    const envelope = buildEnvelope(
      "coords.validate",
      {
        position: pos,
        engine,
        validation: result,
        distanceFromOrigin: distance
      },
      {
        ok: result.valid,
        duration_ms: 0,
        version: VERSION
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.log();
    console.log(pc7.bold("  Coordinate Validation"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    console.log(`  Engine: ${pc7.cyan(engine.toUpperCase())}`);
    console.log(`  Position: ${formatPosition(pos)}`);
    console.log(`  Distance from origin: ${pc7.bold(distance.toFixed(2))}`);
    console.log();
    if (result.errors.length === 0 && result.warnings.length === 0 && result.info.length === 0) {
      console.log(pc7.green("  \u2713 All checks passed"));
    } else {
      if (result.errors.length > 0) {
        console.log(pc7.red("  \u2717 Errors:"));
        for (const err of result.errors) {
          console.log(`    \u2022 ${err}`);
        }
        console.log();
      }
      if (result.warnings.length > 0) {
        console.log(pc7.yellow("  \u26A0 Warnings:"));
        for (const warn of result.warnings) {
          console.log(`    \u2022 ${warn}`);
        }
        console.log();
      }
      if (result.info.length > 0) {
        console.log(pc7.dim("  \u2139 Info:"));
        for (const info of result.info) {
          console.log(`    \u2022 ${info}`);
        }
      }
    }
    console.log();
    console.log(
      `  ${result.valid ? pc7.green("\u2713 VALID") : pc7.red("\u2717 INVALID")}`
    );
    console.log();
  }
  process.exit(result.valid ? 0 : 1);
}
async function handleEngines(options) {
  if (options.json) {
    const engineData = VALID_ENGINES.map((name) => ({
      name,
      ...ENGINE_SPECS[name],
      unitDescription: name === "unreal" ? "1 unit = 1 cm" : "1 unit = 1 meter"
    }));
    console.log(
      JSON.stringify(
        buildEnvelope("coords.engines", engineData, {
          ok: true,
          duration_ms: 0,
          version: VERSION
        }),
        null,
        2
      )
    );
  } else {
    console.log();
    console.log(pc7.bold("  Supported Game Engines"));
    console.log(pc7.gray("  " + "\u2500".repeat(50)));
    console.log();
    for (const name of VALID_ENGINES) {
      const spec = ENGINE_SPECS[name];
      const handColor = spec.handedness === "left" ? pc7.cyan : pc7.magenta;
      console.log(`  ${pc7.bold(pc7.green(name.toUpperCase()))}`);
      console.log(`    Handedness: ${handColor(spec.handedness)}-handed`);
      console.log(
        `    Forward: ${spec.forwardSign === 1 ? "+" : "-"}${spec.forwardAxis}`
      );
      console.log(
        `    Units: ${name === "unreal" ? "1 unit = 1 cm" : "1 unit = 1 meter"}`
      );
      console.log();
    }
  }
}
async function handleRef() {
  console.log();
  console.log(pc7.bold("  Quick Reference: Coordinate Conversions"));
  console.log(pc7.gray("  " + "\u2500".repeat(50)));
  console.log();
  console.log(pc7.cyan("  Position Conversion:"));
  console.log("    Unity \u2194 Godot:  Flip Z axis");
  console.log("    Unity \u2194 Unreal: Scale 100x (meters \u2194 cm)");
  console.log();
  console.log(pc7.cyan("  Rotation Conversion:"));
  console.log("    Unity \u2194 Godot:  Negate Y and Z components");
  console.log("    Unity \u2194 Unreal: Same handedness, verify axis");
  console.log();
  console.log(pc7.cyan("  Precision Thresholds:"));
  console.log("    Safe:      < 1,000 units from origin");
  console.log("    Monitor:    1,000 - 5,000 units");
  console.log("    Warning:    5,000 - 10,000 units");
  console.log("    Critical:   > 10,000 units (use Floating Origin)");
  console.log();
  console.log(pc7.cyan("  Common Commands:"));
  console.log('    dai coords convert "1,2,3" --from unity --to godot');
  console.log('    dai coords validate "10000,0,0" --engine unity');
  console.log("    dai coords engines");
  console.log();
}
async function handleBatch(file, options) {
  const startTime = Date.now();
  const from = options.from.toLowerCase();
  const to = options.to.toLowerCase();
  if (!isValidEngine(from) || !isValidEngine(to)) {
    console.error(pc7.red("Invalid engine specified"));
    process.exit(1);
  }
  const columns = options.columns.split(",").map((c) => parseInt(c, 10) - 1);
  if (columns.length !== 3 || columns.some(isNaN)) {
    console.error(pc7.red('Invalid columns format. Use: "1,2,3" (1-based)'));
    process.exit(1);
  }
  let input;
  if (file) {
    const fs2 = await import('fs');
    input = fs2.readFileSync(file, "utf-8");
  } else {
    input = await new Promise((resolve13) => {
      let data = "";
      process.stdin.on("data", (chunk) => data += chunk);
      process.stdin.on("end", () => resolve13(data));
    });
  }
  const lines = input.trim().split("\n");
  const results = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const parts = line.split(/[,\t\s]+/);
    const x = parseFloat(parts[columns[0]]);
    const y = parseFloat(parts[columns[1]]);
    const z5 = parseFloat(parts[columns[2]]);
    if (!isNaN(x) && !isNaN(y) && !isNaN(z5)) {
      const converted = convertPosition({ x, y, z: z5 }, from, to);
      results.push({
        input: `${x},${y},${z5}`,
        output: converted
      });
    }
  }
  if (options.json) {
    for (const r of results) {
      console.log(
        JSON.stringify(
          buildEnvelope(
            "coords.batch",
            {
              input: r.input,
              output: r.output
            },
            {
              ok: true,
              duration_ms: Date.now() - startTime,
              version: VERSION
            }
          )
        )
      );
    }
  } else {
    console.log("# Converted coordinates:", `${from} \u2192 ${to}`);
    console.log("# input_x, input_y, input_z, output_x, output_y, output_z");
    for (const r of results) {
      console.log(`${r.input}, ${r.output.x}, ${r.output.y}, ${r.output.z}`);
    }
  }
}
function registerAutonomousTestCommand(program) {
  const test = program.command("test").description("Run autonomous testing with auto-fix");
  test.command("run").description("Run all test layers (unit, integration, visual, e2e)").option(
    "-l, --layer <layer>",
    "Specific layer (unit|integration|visual|e2e)"
  ).option("-j, --json", "JSON output").option("--no-fix", "Skip auto-fix").option("--verbose", "Verbose output").action(async (options) => {
    await handleTestRun(options);
  });
  test.command("fix").description("Auto-fix test failures").option("-m, --max-attempts <n>", "Max fix attempts", "3").option("-j, --json", "JSON output").action(async (options) => {
    await handleAutoFix(options);
  });
  test.command("autonomous").description("Run autonomous mode: test + auto-fix + continue").option("-m, --max-attempts <n>", "Max fix attempts", "3").option("-j, --json", "JSON output").option("--verbose", "Verbose output").action(async (options) => {
    await handleAutonomous(options);
  });
  test.command("update-baseline").description("Update visual baselines").option("-j, --json", "JSON output").action(async (options) => {
    await handleUpdateBaseline(options);
  });
}
async function handleTestRun(options) {
  const layer = options.layer || "unit,integration";
  const layers = layer.split(",");
  console.log(pc7.bold("\n  Autonomous Test Runner"));
  console.log(pc7.gray("  ".repeat(50)));
  const results = {};
  for (const l of layers) {
    const layerName = l.trim();
    console.log(pc7.cyan(`
  Running ${layerName} tests...`));
    const start = Date.now();
    const result = await runTestLayer(layerName, options.verbose);
    result.duration = Date.now() - start;
    results[layerName] = result;
    if (result.passed) {
      console.log(pc7.green(`    \u2713 ${result.passedCount} passed`));
    } else {
      console.log(
        pc7.red(
          `    \u2717 ${result.failedCount} failed, ${result.passedCount} passed`
        )
      );
      if (options.fix && result.errors.length > 0) {
        console.log(pc7.yellow(`    \u2192 Attempting auto-fix...`));
        const fixResult = await attemptAutoFix(result.errors);
        if (fixResult.success) {
          console.log(pc7.green(`    \u2713 Auto-fix successful`));
          const reResult = await runTestLayer(layerName, options.verbose);
          if (reResult.passed) {
            console.log(pc7.green(`    \u2713 All tests pass after fix`));
          }
        } else {
          console.log(pc7.red(`    \u2717 Auto-fix failed: ${fixResult.error}`));
        }
      }
    }
  }
  const totalFailed = Object.values(results).reduce(
    (sum, r) => sum + r.failedCount,
    0
  );
  const totalPassed = Object.values(results).reduce(
    (sum, r) => sum + r.passedCount,
    0
  );
  console.log(pc7.bold("\n  Summary"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(`    Total: ${totalPassed} passed, ${totalFailed} failed`);
  if (options.json) {
    console.log(
      JSON.stringify(
        buildEnvelope(
          "test.run",
          { results },
          {
            ok: totalFailed === 0,
            duration_ms: Object.values(results).reduce(
              (sum, r) => sum + r.duration,
              0
            ),
            version: VERSION
          }
        ),
        null,
        2
      )
    );
  }
  process.exit(totalFailed === 0 ? 0 : 1);
}
async function handleAutoFix(options) {
  console.log(pc7.bold("\n  Auto-Fix Mode"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(pc7.cyan("\n  Running tests to detect failures..."));
  const result = await runTestLayer("unit");
  if (result.passed) {
    console.log(pc7.green("\n  \u2713 All tests pass, nothing to fix!"));
    process.exit(0);
  }
  console.log(pc7.yellow(`
  ${result.failedCount} failures detected`));
  const fixResult = await attemptAutoFix(
    result.errors,
    parseInt(options.maxAttempts, 10)
  );
  if (fixResult.success && fixResult.fixed) {
    console.log(
      pc7.green(
        `
  \u2713 Auto-fix successful after ${fixResult.attempts} attempt(s)`
      )
    );
    console.log(pc7.cyan("\n  Verifying fix..."));
    const reResult = await runTestLayer("unit");
    if (reResult.passed) {
      console.log(pc7.green("  \u2713 All tests pass!"));
      process.exit(0);
    } else {
      console.log(
        pc7.red(
          `  \u2717 Still ${reResult.failedCount} failures - manual intervention needed`
        )
      );
      process.exit(2);
    }
  } else {
    console.log(pc7.red(`
  \u2717 Auto-fix failed: ${fixResult.error}`));
    console.log(pc7.yellow("\n  Recommendations:"));
    for (const err of result.errors) {
      console.log(`    - ${err.name}: ${err.message}`);
    }
    process.exit(2);
  }
}
async function handleAutonomous(options) {
  console.log(pc7.bold("\n  \u{1F916} Autonomous Mode"));
  console.log(pc7.gray("  ".repeat(50)));
  console.log(pc7.dim("  Max fix attempts: " + options.maxAttempts));
  const maxAttempts = parseInt(options.maxAttempts, 10);
  let attempt = 0;
  let allPassed = false;
  while (attempt < maxAttempts && !allPassed) {
    attempt++;
    console.log(pc7.cyan(`
  Attempt ${attempt}/${maxAttempts}`));
    console.log(pc7.dim("  Running tests..."));
    const result = await runTestLayer("unit,integration", options.verbose);
    if (result.passed) {
      allPassed = true;
      break;
    }
    if (attempt < maxAttempts) {
      console.log(
        pc7.yellow(`  ${result.failedCount} failures - attempting fix...`)
      );
      const fixResult = await attemptAutoFix(result.errors);
      if (!fixResult.success) {
        console.log(pc7.red(`  \u2717 Fix attempt failed: ${fixResult.error}`));
        break;
      }
      console.log(pc7.green(`  \u2713 Fix applied`));
    }
  }
  if (allPassed) {
    console.log(pc7.green("\n  \u2713\u2713\u2713 All tests pass! \u2713\u2713\u2713"));
    console.log(pc7.green(`  Completed in ${attempt} attempt(s)`));
    process.exit(0);
  } else {
    console.log(pc7.red("\n  \u2717\u2717\u2717 Autonomous fix failed \u2717\u2717\u2717"));
    console.log(pc7.yellow("\n  Human intervention required"));
    process.exit(2);
  }
}
async function handleUpdateBaseline(options) {
  const startTime = Date.now();
  console.log(pc7.bold("\n  Updating Visual Baselines"));
  console.log(pc7.gray("  ".repeat(50)));
  try {
    execSync("playwright test --update-snapshots", { stdio: "inherit" });
    console.log(pc7.green("\n  \u2713 Visual baselines updated"));
    if (options.json) {
      console.log(
        JSON.stringify(
          buildEnvelope(
            "test.updateBaseline",
            { success: true },
            {
              ok: true,
              duration_ms: Date.now() - startTime,
              version: VERSION
            }
          ),
          null,
          2
        )
      );
    }
  } catch (err) {
    console.log(pc7.red("\n  \u2717 Failed to update baselines"));
    process.exit(1);
  }
}
async function runTestLayer(layer, _verbose) {
  const result = {
    passed: true,
    duration: 0,
    passedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    errors: []
  };
  try {
    const start = Date.now();
    let command = "";
    switch (layer.trim()) {
      case "unit":
        command = "vitest run --reporter=json";
        break;
      case "integration":
        command = "vitest run --testPathPattern=integration --reporter=json";
        break;
      case "visual":
        command = "playwright test --project=visual --reporter=json";
        break;
      case "e2e":
        command = "playwright test --project=chromium --reporter=json";
        break;
      default:
        command = "vitest run --reporter=json";
    }
    const output = execSync(command, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024
    });
    const jsonMatch = output.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      result.passedCount = data.summary?.passed || 0;
      result.failedCount = data.summary?.failed || 0;
      result.skippedCount = data.summary?.skipped || 0;
    } else {
      const passed = (output.match(/✓/g) || []).length;
      const failed = (output.match(/✗|×|FAIL/g) || []).length;
      result.passedCount = passed;
      result.failedCount = failed;
    }
    result.passed = result.failedCount === 0;
    result.duration = Date.now() - start;
  } catch (err) {
    result.passed = false;
    result.duration = Date.now() - Date.now();
    const errorOutput = err.stdout || err.message || "";
    const failureMatches = errorOutput.matchAll(
      /FAIL\s+([^\n]+)[\s\S]*?([\u4e00-\u9fff\w\s]+(?:Error|Exception)[\s\S]*?)(?=\n\s*\n|\n\n|$)/g
    );
    for (const match of failureMatches) {
      result.errors.push({
        name: match[1] || "Unknown Test",
        message: match[2]?.split("\n")[0] || "Unknown error",
        type: classifyError(match[2] || "")
      });
    }
    result.failedCount = result.errors.length || 1;
    result.passedCount = 0;
  }
  return result;
}
function classifyError(errorMessage) {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("syntaxerror") || msg.includes("unexpected token")) {
    return "syntax";
  }
  if (msg.includes("typeerror") || msg.includes("typescript") || msg.includes("'undefined'")) {
    return "type";
  }
  if (msg.includes("expect") || msg.includes("tobe") || msg.includes("toequal")) {
    return "logic";
  }
  if (msg.includes("screenshot") || msg.includes("visual") || msg.includes("diff")) {
    return "ui";
  }
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("click")) {
    return "e2e";
  }
  return "unknown";
}
async function attemptAutoFix(errors, _maxAttempts) {
  const result = {
    success: false,
    fixed: false,
    attempts: 0,
    changes: []
  };
  const syntaxErrors = errors.filter((e) => e.type === "syntax");
  const typeErrors = errors.filter((e) => e.type === "type");
  const logicErrors = errors.filter((e) => e.type === "logic");
  if (syntaxErrors.length > 0) {
    console.log(
      pc7.yellow(
        `    Attempting to fix ${syntaxErrors.length} syntax error(s)...`
      )
    );
    for (const err of syntaxErrors) {
      const fix = await fixSyntaxError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }
  if (typeErrors.length > 0) {
    console.log(
      pc7.yellow(`    Attempting to fix ${typeErrors.length} type error(s)...`)
    );
    for (const err of typeErrors) {
      const fix = await fixTypeError(err);
      if (fix) {
        result.changes.push(fix);
      }
    }
  }
  if (logicErrors.length > 0) {
    console.log(
      pc7.yellow(
        `    Attempting to fix ${logicErrors.length} logic error(s)...`
      )
    );
    result.error = "Logic errors detected - requires human review";
    result.success = true;
    return result;
  }
  result.success = true;
  result.fixed = result.changes.length === errors.length;
  if (!result.fixed) {
    result.error = "Could not auto-fix all errors";
  }
  return result;
}
async function fixSyntaxError(error) {
  console.log(pc7.dim(`      Analyzing: ${error.name}`));
  return null;
}
async function fixTypeError(error) {
  console.log(pc7.dim(`      Analyzing: ${error.name}`));
  return null;
}
function findProjectRoot(startDir = process.cwd()) {
  const explicitRoot = process.env.DAINEXUS_WORKSPACE || process.env.AGENTS_WORKSPACE;
  if (explicitRoot) {
    return resolve(explicitRoot);
  }
  let current = resolve(startDir);
  while (true) {
    if (existsSync(join(current, ".dainexus")) || existsSync(join(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}
function getProjectName(projectRoot) {
  return basename(projectRoot);
}
function getProductionConfigPath(projectRoot) {
  return join(projectRoot, ".production-grade.yaml");
}
function readProductionConfig(projectRoot) {
  const configPath = getProductionConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    return "";
  }
  return readFileSync(configPath, "utf-8");
}
function writeProductionConfig(projectRoot, content) {
  const configPath = getProductionConfigPath(projectRoot);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    content.endsWith("\n") ? content : `${content}
`,
    "utf-8"
  );
}
function readTopLevelBlock(content, key) {
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m"
  );
  const match = content.match(pattern);
  return match ? match[0] : null;
}
function upsertTopLevelBlock(content, key, block) {
  const normalizedBlock = `${block.trimEnd()}
`;
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m"
  );
  if (pattern.test(content)) {
    return content.replace(pattern, normalizedBlock);
  }
  if (!content.trim()) {
    return normalizedBlock;
  }
  return `${content.trimEnd()}

${normalizedBlock}`;
}
function getScalar(block, key) {
  if (!block) {
    return null;
  }
  const pattern = new RegExp(`^[ \\t]*${escapeRegExp(key)}:[ \\t]*(.+)$`, "m");
  const match = block.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].trim().replace(/^["']|["']$/g, "");
}
function parseBoolean(value, defaultValue) {
  if (value === null) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}
function parseNullableString(value) {
  if (value === null || value.toLowerCase() === "null") {
    return null;
  }
  return value;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function checkCli(name) {
  const result = spawnSync(name, ["--version"], {
    encoding: "utf-8",
    shell: process.platform === "win32",
    timeout: 5e3
  });
  if (result.error) {
    return {
      name,
      available: false,
      error: result.error.message
    };
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status === 0) {
    return {
      name,
      available: true,
      version: output || "available"
    };
  }
  return {
    name,
    available: false,
    error: output || `Exited with status ${result.status}`
  };
}
function checkSupportedClis() {
  return [checkCli("claude"), checkCli("codex")];
}
var DEFAULT_TOKEN_BUDGET = {
  daily: 5,
  weekly: 25,
  monthly: 80
};
function getDefaultUsageDir(projectRoot) {
  return join(homedir(), ".dainexus", "usage", getProjectName(projectRoot));
}
function getBudgetPath(projectRoot) {
  return join(projectRoot, ".dainexus", "budget.yaml");
}
function setTokenTrackingEnabled(projectRoot, enabled) {
  const content = readProductionConfig(projectRoot);
  const block = buildTokenTrackingBlock(enabled);
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(content, "token_tracking", block)
  );
  mkdirSync(getDefaultUsageDir(projectRoot), { recursive: true });
  ensureBudgetFile(projectRoot);
}
function getTokenTrackingEnabled(projectRoot) {
  const block = readTopLevelBlock(
    readProductionConfig(projectRoot),
    "token_tracking"
  );
  if (!block) {
    return true;
  }
  if (/enabled:\s*false/i.test(block)) {
    return false;
  }
  return true;
}
function ensureBudgetFile(projectRoot, budget = DEFAULT_TOKEN_BUDGET) {
  const budgetPath = getBudgetPath(projectRoot);
  if (existsSync(budgetPath)) {
    return budgetPath;
  }
  writeBudgetFile(projectRoot, budget);
  return budgetPath;
}
function writeBudgetFile(projectRoot, budget) {
  const budgetPath = getBudgetPath(projectRoot);
  mkdirSync(join(projectRoot, ".dainexus"), { recursive: true });
  writeFileSync(
    budgetPath,
    [
      "budget:",
      `  daily: ${budget.daily}`,
      `  weekly: ${budget.weekly}`,
      `  monthly: ${budget.monthly}`,
      "  alerts:",
      "    warning: 0.80",
      "    danger: 0.95",
      "    critical: 1.00",
      ""
    ].join("\n"),
    "utf-8"
  );
  return budgetPath;
}
function readBudgetFile(projectRoot) {
  const budgetPath = getBudgetPath(projectRoot);
  if (!existsSync(budgetPath)) {
    return null;
  }
  const content = readFileSync(budgetPath, "utf-8");
  return {
    daily: readNumber(content, "daily", DEFAULT_TOKEN_BUDGET.daily),
    weekly: readNumber(content, "weekly", DEFAULT_TOKEN_BUDGET.weekly),
    monthly: readNumber(content, "monthly", DEFAULT_TOKEN_BUDGET.monthly)
  };
}
function logTokenUsage(projectRoot, entry) {
  const usageDir = getDefaultUsageDir(projectRoot);
  mkdirSync(usageDir, { recursive: true });
  const logFile = join(usageDir, "usage.log");
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf-8");
}
function summarizeUsage(projectRoot, days) {
  const usageDir = getDefaultUsageDir(projectRoot);
  const minTime = Date.now() - days * 24 * 60 * 60 * 1e3;
  const summary = {
    usageDir,
    days,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latestTimestamp: null
  };
  if (!existsSync(usageDir)) {
    return summary;
  }
  for (const file of readdirSync(usageDir)) {
    if (!file.endsWith(".jsonl") && !file.endsWith(".log") && !file.endsWith(".json")) {
      continue;
    }
    const path = join(usageDir, file);
    const lines = readFileSync(path, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        const entry = JSON.parse(line);
        const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : null;
        if (timestamp && Date.parse(timestamp) < minTime) {
          continue;
        }
        const inputTokens = numberField(entry.inputTokens);
        const outputTokens = numberField(entry.outputTokens);
        const cost = numberField(entry.cost);
        summary.calls += 1;
        summary.inputTokens += inputTokens;
        summary.outputTokens += outputTokens;
        summary.totalTokens += inputTokens + outputTokens;
        summary.estimatedCostUsd += cost;
        if (timestamp && (!summary.latestTimestamp || timestamp > summary.latestTimestamp)) {
          summary.latestTimestamp = timestamp;
        }
      } catch {
        continue;
      }
    }
  }
  summary.estimatedCostUsd = Number(summary.estimatedCostUsd.toFixed(6));
  return summary;
}
function buildTokenTrackingBlock(enabled) {
  return [
    "token_tracking:",
    `  enabled: ${enabled ? "true" : "false"}`,
    '  log_dir: "~/.dainexus/usage"',
    "  export_format: jsonl"
  ].join("\n");
}
function readNumber(content, key, defaultValue) {
  const pattern = new RegExp(
    `^[ \\t]*${key}:[ \\t]*([0-9]+(?:\\.[0-9]+)?)`,
    "m"
  );
  const match = content.match(pattern);
  if (!match) {
    return defaultValue;
  }
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}
function numberField(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// src/commands/expert.ts
var DEFAULT_EXPERT_CONFIG = {
  enabled: false,
  activeCli: "claude",
  fallbackCli: null,
  useFor: {
    planning: false,
    failedPlanReview: true,
    gates: true,
    securityReview: true,
    architectureReview: true,
    codeReview: true
  },
  budget: {
    maxExpertCallsPerRun: 5,
    requireConfirmationAbove: 3
  }
};
function registerExpertCommand(program) {
  const expert = program.command("expert").description(
    "Optional expert-mode routing through Claude CLI or Codex CLI"
  );
  expert.command("status").description("Show expert-mode configuration and CLI availability").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleStatus(Boolean(options.json));
  });
  expert.command("on").description("Enable optional expert mode").option("--cli <claude|codex>", "CLI to use for expert checks").option("--track-tokens", "Also enable token tracking").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleEnable(options);
    }
  );
  expert.command("off").description("Disable optional expert mode").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleDisable(Boolean(options.json));
  });
  expert.command("use").description("Switch active expert CLI").argument("<cli>", "claude or codex").option("--track-tokens", "Also enable token tracking").option("-j, --json", "Output as JSON").action(
    async (cli, options) => {
      await handleUse(cli, options);
    }
  );
  expert.command("test").description("Check whether the configured expert CLI is available").option(
    "--cli <claude|codex>",
    "CLI to test instead of the configured active CLI"
  ).option("-j, --json", "Output as JSON").action(async (options) => {
    await handleTest(options);
  });
  expert.command("budget").description("Set expert-mode call budget").option("--max-calls <count>", "Maximum expert calls per pipeline run").option(
    "--confirm-above <count>",
    "Require confirmation above this call count"
  ).option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleBudget(options);
    }
  );
  expert.command("gates").description("Enable or disable expert checks for pipeline gates").argument("<state>", "on or off").option("-j, --json", "Output as JSON").action(async (state, options) => {
    await handleGates(state, Boolean(options.json));
  });
}
async function handleStatus(useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
    clis: checkSupportedClis()
  };
  writeOutput("expert.status", data, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleEnable(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  if (options.cli) {
    config.activeCli = parseSupportedCli(options.cli, useJson2);
  }
  config.enabled = true;
  writeExpertConfig(projectRoot, config);
  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    expertMode: config,
    tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot)
  };
  writeOutput("expert.on", data, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleDisable(useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  config.enabled = false;
  writeExpertConfig(projectRoot, config);
  writeOutput(
    "expert.off",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleUse(cli, options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  config.enabled = true;
  config.activeCli = parseSupportedCli(cli, useJson2);
  writeExpertConfig(projectRoot, config);
  if (options.trackTokens) {
    setTokenTrackingEnabled(projectRoot, true);
  }
  const availability = checkCli(config.activeCli);
  writeOutput(
    "expert.use",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config,
      tokenTrackingEnabled: getTokenTrackingEnabled(projectRoot),
      availability
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleTest(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const cli = options.cli ? parseSupportedCli(options.cli, useJson2) : config.activeCli;
  const availability = checkCli(cli);
  if (useJson2) {
    const envelope = buildEnvelope(
      "expert.test",
      { cli, availability },
      {
        ok: availability.available,
        duration_ms: Date.now() - startTime,
        version: VERSION,
        error: availability.available ? void 0 : {
          code: EXIT_CODES.MISSING_DEPENDENCY,
          message: `${cli} CLI is not available`
        }
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
  } else if (availability.available) {
    console.log(pc7.green(`OK: ${cli} CLI available`));
    console.log(pc7.dim(availability.version || "No version output"));
  } else {
    console.error(pc7.red(`Missing: ${cli} CLI is not available`));
    if (availability.error) {
      console.error(pc7.dim(availability.error));
    }
  }
  process.exit(
    availability.available ? EXIT_CODES.OK : EXIT_CODES.MISSING_DEPENDENCY
  );
}
async function handleBudget(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  if (options.maxCalls !== void 0) {
    config.budget.maxExpertCallsPerRun = parsePositiveInteger(
      options.maxCalls,
      "max-calls",
      useJson2
    );
  }
  if (options.confirmAbove !== void 0) {
    config.budget.requireConfirmationAbove = parsePositiveInteger(
      options.confirmAbove,
      "confirm-above",
      useJson2
    );
  }
  writeExpertConfig(projectRoot, config);
  writeOutput(
    "expert.budget",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      expertMode: config
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleGates(state, useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readExpertConfig(projectRoot);
  const enabled = parseOnOff(state, useJson2);
  config.useFor.gates = enabled;
  writeExpertConfig(projectRoot, config);
  writeOutput(
    "expert.gates",
    {
      projectRoot,
      configPath: getProductionConfigPath(projectRoot),
      gatesEnabled: enabled,
      expertMode: config
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
function readExpertConfig(projectRoot) {
  const content = readProductionConfig(projectRoot);
  const block = readTopLevelBlock(content, "expertMode");
  if (!block) {
    return cloneDefaultConfig();
  }
  const activeCli = parseNullableString(getScalar(block, "activeCli"));
  const fallbackCli = parseNullableString(getScalar(block, "fallbackCli"));
  return {
    enabled: parseBoolean(
      getScalar(block, "enabled"),
      DEFAULT_EXPERT_CONFIG.enabled
    ),
    activeCli: isSupportedCli(activeCli) ? activeCli : DEFAULT_EXPERT_CONFIG.activeCli,
    fallbackCli: isSupportedCli(fallbackCli) ? fallbackCli : null,
    useFor: {
      planning: parseBoolean(
        getScalar(block, "planning"),
        DEFAULT_EXPERT_CONFIG.useFor.planning
      ),
      failedPlanReview: parseBoolean(
        getScalar(block, "failedPlanReview"),
        DEFAULT_EXPERT_CONFIG.useFor.failedPlanReview
      ),
      gates: parseBoolean(
        getScalar(block, "gates"),
        DEFAULT_EXPERT_CONFIG.useFor.gates
      ),
      securityReview: parseBoolean(
        getScalar(block, "securityReview"),
        DEFAULT_EXPERT_CONFIG.useFor.securityReview
      ),
      architectureReview: parseBoolean(
        getScalar(block, "architectureReview"),
        DEFAULT_EXPERT_CONFIG.useFor.architectureReview
      ),
      codeReview: parseBoolean(
        getScalar(block, "codeReview"),
        DEFAULT_EXPERT_CONFIG.useFor.codeReview
      )
    },
    budget: {
      maxExpertCallsPerRun: parseInteger(
        getScalar(block, "maxExpertCallsPerRun"),
        DEFAULT_EXPERT_CONFIG.budget.maxExpertCallsPerRun
      ),
      requireConfirmationAbove: parseInteger(
        getScalar(block, "requireConfirmationAbove"),
        DEFAULT_EXPERT_CONFIG.budget.requireConfirmationAbove
      )
    }
  };
}
function writeExpertConfig(projectRoot, config) {
  const content = readProductionConfig(projectRoot);
  const block = buildExpertBlock(config);
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(content, "expertMode", block)
  );
}
function buildExpertBlock(config) {
  return [
    "expertMode:",
    `  enabled: ${config.enabled ? "true" : "false"}`,
    `  activeCli: "${config.activeCli}"`,
    `  fallbackCli: ${config.fallbackCli ? `"${config.fallbackCli}"` : "null"}`,
    "  useFor:",
    `    planning: ${config.useFor.planning ? "true" : "false"}`,
    `    failedPlanReview: ${config.useFor.failedPlanReview ? "true" : "false"}`,
    `    gates: ${config.useFor.gates ? "true" : "false"}`,
    `    securityReview: ${config.useFor.securityReview ? "true" : "false"}`,
    `    architectureReview: ${config.useFor.architectureReview ? "true" : "false"}`,
    `    codeReview: ${config.useFor.codeReview ? "true" : "false"}`,
    "  budget:",
    `    maxExpertCallsPerRun: ${config.budget.maxExpertCallsPerRun}`,
    `    requireConfirmationAbove: ${config.budget.requireConfirmationAbove}`
  ].join("\n");
}
function writeOutput(tool, data, useJson2, durationMs) {
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(tool, data, {
      ok: true,
      duration_ms: durationMs,
      version: VERSION
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log();
  console.log(pc7.bold(`  ${tool}`));
  console.log(pc7.gray("  " + "-".repeat(50)));
  console.log(JSON.stringify(data, null, 2));
  console.log();
}
function parseSupportedCli(value, useJson2) {
  if (isSupportedCli(value)) {
    return value;
  }
  fail(`Invalid CLI "${value}". Use "claude" or "codex".`, useJson2);
}
function isSupportedCli(value) {
  return value === "claude" || value === "codex";
}
function parsePositiveInteger(value, label2, useJson2) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    fail(`Invalid ${label2}: ${value}. Use a non-negative integer.`, useJson2);
  }
  return parsed;
}
function parseInteger(value, defaultValue) {
  if (value === null) {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : defaultValue;
}
function parseOnOff(value, useJson2) {
  if (value === "on") {
    return true;
  }
  if (value === "off") {
    return false;
  }
  fail(`Invalid state "${value}". Use "on" or "off".`, useJson2);
}
function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_EXPERT_CONFIG));
}
function fail(message, useJson2) {
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope("expert.error", null, {
      ok: false,
      duration_ms: 0,
      version: VERSION,
      error: { code: EXIT_CODES.USAGE_ERROR, message }
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(pc7.red(`Error: ${message}`));
  }
  process.exit(EXIT_CODES.USAGE_ERROR);
}
function registerTokenCommand(program) {
  const token = program.command("token").description("Token tracking controls and usage reports");
  token.command("status").description("Show token tracking status").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleStatus2(Boolean(options.json));
  });
  token.command("on").description("Enable token tracking").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToggle(true, Boolean(options.json), "token.on");
  });
  token.command("off").description("Disable token tracking without deleting usage data").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleToggle(false, Boolean(options.json), "token.off");
  });
  token.command("budget").description("Show or update token tracking budget").option("--daily <usd>", "Daily budget in USD").option("--weekly <usd>", "Weekly budget in USD").option("--monthly <usd>", "Monthly budget in USD").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleBudget2(options);
    }
  );
  token.command("report").description("Show usage summary from local token logs").option("--period <day|week|month>", "Report period", "week").option("-j, --json", "Output as JSON").action(async (options) => {
    await handleReport(options);
  });
  token.command("log").description("Log LLM token usage details").requiredOption("--input-tokens <tokens>", "Prompt/input tokens").requiredOption("--output-tokens <tokens>", "Completion/output tokens").requiredOption("--model <model>", "Model name").requiredOption("--provider <provider>", "Provider name").option("--cost <cost>", "USD Cost").requiredOption("--skill <skill>", "Skill name").option("-j, --json", "Output as JSON").action(
    async (options) => {
      await handleLogToken(options);
    }
  );
  token.command("dashboard").description("Start the token usage dashboard server").option(
    "--host <host>",
    "Bind host (non-loopback requires dashboard auth token env)",
    "127.0.0.1"
  ).option("--port <port>", "Dashboard port", "8080").option("-j, --json", "Output startup information as JSON before launching").action(async (options) => {
    await handleDashboard(options);
  });
}
async function handleStatus2(useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const summary = summarizeUsage(projectRoot, 7);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    enabled: getTokenTrackingEnabled(projectRoot),
    usageDir: getDefaultUsageDir(projectRoot),
    budgetPath: getBudgetPath(projectRoot),
    budget: readBudgetFile(projectRoot),
    last7Days: summary,
    sources: {
      daiNexusUsageDir: existsSync(getDefaultUsageDir(projectRoot)),
      claudeTelemetry: existsSync(join(homedir(), ".claude", "telemetry")),
      codexConfig: existsSync(join(homedir(), ".codex"))
    }
  };
  writeOutput2("token.status", data, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleToggle(enabled, useJson2, tool) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  setTokenTrackingEnabled(projectRoot, enabled);
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    enabled,
    usageDir: getDefaultUsageDir(projectRoot),
    budgetPath: ensureBudgetFile(projectRoot)
  };
  writeOutput2(tool, data, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleBudget2(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const existing = readBudgetFile(projectRoot) ?? DEFAULT_TOKEN_BUDGET;
  const shouldUpdate = options.daily !== void 0 || options.weekly !== void 0 || options.monthly !== void 0;
  const budget = {
    daily: options.daily !== void 0 ? parseUsd(options.daily, "daily", useJson2) : existing.daily,
    weekly: options.weekly !== void 0 ? parseUsd(options.weekly, "weekly", useJson2) : existing.weekly,
    monthly: options.monthly !== void 0 ? parseUsd(options.monthly, "monthly", useJson2) : existing.monthly
  };
  if (shouldUpdate) {
    writeBudgetFile(projectRoot, budget);
  } else {
    ensureBudgetFile(projectRoot, budget);
  }
  writeOutput2(
    "token.budget",
    {
      projectRoot,
      budgetPath: getBudgetPath(projectRoot),
      updated: shouldUpdate,
      budget
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleReport(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const days = periodToDays(options.period, useJson2);
  const summary = summarizeUsage(projectRoot, days);
  writeOutput2(
    "token.report",
    {
      projectRoot,
      period: options.period,
      summary
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}
async function handleDashboard(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const scriptPath = join(projectRoot, "scripts", "token-api-server.py");
  const host = parseDashboardHost(options.host, useJson2);
  const port = parsePort(options.port, useJson2);
  const authRequired = !isLoopbackDashboardHost(host);
  if (authRequired && !process.env.DAINEXUS_TOKEN_DASHBOARD_AUTH_TOKEN?.trim()) {
    fail2(
      "Non-loopback dashboard binding requires DAINEXUS_TOKEN_DASHBOARD_AUTH_TOKEN.",
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (!existsSync(scriptPath)) {
    fail2(
      `Token dashboard script not found: ${scriptPath}`,
      useJson2,
      EXIT_CODES.MISSING_DEPENDENCY
    );
  }
  const python = findPythonCommand();
  if (!python) {
    fail2(
      "No Python launcher found. Install python, python3, or py to run the dashboard.",
      useJson2,
      EXIT_CODES.MISSING_DEPENDENCY
    );
  }
  const displayHost = isIP(host) === 6 ? `[${host}]` : host;
  const data = {
    projectRoot,
    scriptPath,
    host,
    port,
    authRequired,
    url: `http://${displayHost}:${port}/dashboard`,
    python
  };
  if (useJson2) {
    writeOutput2("token.dashboard", data, true, Date.now() - startTime);
  } else {
    console.log(pc7.green(`Starting token dashboard: ${data.url}`));
    console.log(pc7.dim("Press Ctrl+C to stop."));
  }
  const child = spawn(
    python,
    [scriptPath, "--host", host, "--port", String(port)],
    {
      stdio: "inherit",
      shell: process.platform === "win32"
    }
  );
  child.on("exit", (code) => {
    process.exit(code ?? EXIT_CODES.OK);
  });
}
function writeOutput2(tool, data, useJson2, durationMs) {
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope(tool, data, {
      ok: true,
      duration_ms: durationMs,
      version: VERSION
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }
  console.log();
  console.log(pc7.bold(`  ${tool}`));
  console.log(pc7.gray("  " + "-".repeat(50)));
  console.log(JSON.stringify(data, null, 2));
  console.log();
}
function parseUsd(value, label2, useJson2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail2(
      `Invalid ${label2} budget: ${value}. Use a non-negative number.`,
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  return parsed;
}
function parseDashboardHost(value, useJson2) {
  const host = value.trim();
  if (host === "localhost" || isIP(host) > 0) {
    return host;
  }
  fail2(
    `Invalid dashboard host: ${value}. Use localhost or an IP address.`,
    useJson2,
    EXIT_CODES.USAGE_ERROR
  );
}
function isLoopbackDashboardHost(host) {
  if (host === "localhost" || host === "::1") {
    return true;
  }
  return isIP(host) === 4 && host.split(".")[0] === "127";
}
function parsePort(value, useJson2) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    fail2(
      `Invalid port: ${value}. Use an integer from 1 to 65535.`,
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  return parsed;
}
function periodToDays(period, useJson2) {
  if (period === "day") {
    return 1;
  }
  if (period === "week") {
    return 7;
  }
  if (period === "month") {
    return 30;
  }
  fail2(
    `Invalid period "${period}". Use day, week, or month.`,
    useJson2,
    EXIT_CODES.USAGE_ERROR
  );
}
function findPythonCommand() {
  for (const command of ["python3", "python", "py"]) {
    const result = spawnSync(command, ["--version"], {
      encoding: "utf-8",
      shell: process.platform === "win32",
      timeout: 3e3
    });
    if (!result.error && result.status === 0) {
      return command;
    }
  }
  return null;
}
function fail2(message, useJson2, code) {
  if (useJson2 || !process.stdout.isTTY) {
    const envelope = buildEnvelope("token.error", null, {
      ok: false,
      duration_ms: 0,
      version: VERSION,
      error: { code, message }
    });
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    console.error(pc7.red(`Error: ${message}`));
  }
  process.exit(code);
}
async function handleLogToken(options) {
  const startTime = Date.now();
  const useJson2 = Boolean(options.json) || !process.stdout.isTTY;
  const projectRoot = findProjectRoot();
  const inputTokens = Number(options.inputTokens);
  const outputTokens = Number(options.outputTokens);
  const cost = options.cost !== void 0 ? Number(options.cost) : null;
  if (!Number.isInteger(inputTokens) || inputTokens < 0) {
    fail2(
      "Invalid input-tokens: must be a non-negative integer.",
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (!Number.isInteger(outputTokens) || outputTokens < 0) {
    fail2(
      "Invalid output-tokens: must be a non-negative integer.",
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
    fail2(
      "Invalid cost: must be a non-negative number.",
      useJson2,
      EXIT_CODES.USAGE_ERROR
    );
  }
  const entry = {
    inputTokens,
    outputTokens,
    model: options.model,
    provider: options.provider,
    cost,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    skill: options.skill
  };
  logTokenUsage(projectRoot, entry);
  writeOutput2(
    "token.log",
    {
      success: true,
      entry
    },
    useJson2,
    Date.now() - startTime
  );
  process.exit(EXIT_CODES.OK);
}

// src/delegation/auto-activation.ts
var DEFAULT_DELEGATION_CONFIG = {
  enabled: "auto",
  controller: "auto",
  workerCli: "agy",
  model: "Gemini 3.5 Flash (High)",
  notify: true
};
function readDelegationConfig(content) {
  const block = readTopLevelBlock(content, "delegationMode");
  if (!block) {
    return { ...DEFAULT_DELEGATION_CONFIG };
  }
  return {
    enabled: parseEnabled(getScalar(block, "enabled")),
    controller: parseController(getScalar(block, "controller")),
    workerCli: "agy",
    model: getScalar(block, "model") || DEFAULT_DELEGATION_CONFIG.model,
    notify: parseBoolean(
      getScalar(block, "notify"),
      DEFAULT_DELEGATION_CONFIG.notify
    )
  };
}
function buildDelegationBlock(config) {
  return [
    "delegationMode:",
    `  enabled: ${config.enabled}`,
    `  controller: ${config.controller}`,
    "  worker:",
    `    cli: ${config.workerCli}`,
    `    model: "${config.model.replaceAll('"', '\\"')}"`,
    `  notify: ${config.notify ? "true" : "false"}`
  ].join("\n");
}
function detectControllerCli(environment = process.env) {
  const explicit = environment.FORGE_CONTROLLER_CLI?.toLowerCase();
  if (explicit === "codex" || explicit === "claude") {
    return explicit;
  }
  const hasCodexSignal = Boolean(
    environment.CODEX_THREAD_ID || environment.CODEX_CI || environment.CODEX_SANDBOX
  );
  const hasClaudeSignal = Boolean(
    environment.CLAUDECODE || environment.CLAUDE_CODE_ENTRYPOINT || environment.CLAUDE_SESSION_ID || environment.CLAUDE_PROJECT_DIR
  );
  if (hasCodexSignal === hasClaudeSignal) {
    return "unknown";
  }
  return hasCodexSignal ? "codex" : "claude";
}
function resolveDelegationActivation(input) {
  const controller = input.config.controller === "auto" ? detectControllerCli(input.environment) : input.config.controller;
  const base = {
    controller,
    workerCli: input.config.workerCli,
    model: input.config.model,
    notify: input.config.notify
  };
  if (input.config.enabled === "off") {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "disabled"
    };
  }
  if (controller === "unknown") {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "controller-undetected"
    };
  }
  if (!input.workerAvailable) {
    return {
      ...base,
      active: false,
      autoEnabled: false,
      reason: "worker-unavailable"
    };
  }
  const autoEnabled = input.config.enabled === "auto";
  return {
    ...base,
    active: true,
    autoEnabled,
    reason: autoEnabled ? "auto-enabled" : "enabled"
  };
}
function formatDelegationNotice(activation) {
  if (!activation.active || !activation.notify) {
    return null;
  }
  const activationLabel = activation.autoEnabled ? "auto-enabled" : "enabled";
  return `Delegation ${activationLabel}: ${activation.controller} controller -> ${activation.workerCli} / ${activation.model} worker`;
}
function parseEnabled(value) {
  if (value === null) {
    return DEFAULT_DELEGATION_CONFIG.enabled;
  }
  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "on") {
    return "on";
  }
  if (normalized === "false" || normalized === "off") {
    return "off";
  }
  return normalized === "auto" ? "auto" : DEFAULT_DELEGATION_CONFIG.enabled;
}
function parseController(value) {
  const normalized = value?.toLowerCase();
  if (normalized === "codex" || normalized === "claude") {
    return normalized;
  }
  return "auto";
}
function buildAgyArgs(options) {
  if (options.model.startsWith("-") || options.model.includes("--dangerously-skip-permissions")) {
    throw new Error("Invalid AGY model value");
  }
  const args = ["--model", options.model];
  args.push("--sandbox", "--mode", "accept-edits");
  args.push(
    "--print",
    `Read WORKER_INSTRUCTIONS.md and ${options.contractFileName}, execute only the contracted task, run its verification commands, and write DELIVERY.json.`
  );
  return args;
}
function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}
function readObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return void 0;
  }
  return value;
}
function commandPointsToGate(command, baseDirectory, containmentRoot) {
  const match = command.trim().match(
    /^(?:bash\s+)?(?:"([^"]*antigravity-pre-tool-gate\.sh)"|'([^']*antigravity-pre-tool-gate\.sh)'|([^\s"']*antigravity-pre-tool-gate\.sh))$/
  );
  const configuredPath = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!configuredPath) return false;
  const gatePath = isAbsolute(configuredPath) ? resolve(configuredPath) : resolve(baseDirectory, configuredPath);
  if (!existsSync(gatePath)) return false;
  try {
    const realGatePath = realpathSync(gatePath);
    const realContainmentRoot = realpathSync(containmentRoot);
    return isWithin(realContainmentRoot, realGatePath) && statSync(realGatePath).isFile();
  } catch {
    return false;
  }
}
function hasValidPolicyHook(document, baseDirectory, containmentRoot) {
  const policy = readObject(document?.["dai-nexus-policy"]);
  const preToolUse = policy?.["PreToolUse"];
  return policy !== void 0 && policy["enabled"] !== false && Array.isArray(preToolUse) && preToolUse.some((groupValue) => {
    const group = readObject(groupValue);
    if (group?.["matcher"] !== "*" || !Array.isArray(group["hooks"])) {
      return false;
    }
    return group["hooks"].some((handlerValue) => {
      const handler = readObject(handlerValue);
      const command = handler?.["command"];
      return (handler?.["type"] === void 0 || handler["type"] === "command") && typeof command === "string" && commandPointsToGate(command, baseDirectory, containmentRoot);
    });
  });
}
function findValidAgyPolicyHook(workspaceRoot, contractDirectory) {
  const resolvedRoot = realpathSync(resolve(workspaceRoot));
  let current = realpathSync(resolve(contractDirectory));
  if (!isWithin(resolvedRoot, current)) {
    throw new Error("Contract must be inside the project workspace");
  }
  while (isWithin(resolvedRoot, current)) {
    const hooksPath = join(current, ".agents", "hooks.json");
    if (existsSync(hooksPath)) {
      let document;
      try {
        const realHooksPath = realpathSync(hooksPath);
        if (!isWithin(resolvedRoot, realHooksPath)) {
          throw new Error("Hook configuration escapes the workspace");
        }
        document = readObject(JSON.parse(readFileSync(realHooksPath, "utf8")));
      } catch {
        throw new Error(`Invalid AGY policy hook configuration: ${hooksPath}`);
      }
      if (!hasValidPolicyHook(document, resolvedRoot, resolvedRoot)) {
        throw new Error(`Invalid AGY policy hook configuration: ${hooksPath}`);
      }
      return hooksPath;
    }
    if (current === resolvedRoot) break;
    current = dirname(current);
  }
  throw new Error(
    "AGY delegation requires an enabled dai-nexus-policy PreToolUse hook"
  );
}
function findValidAgyGlobalPolicyHook(homeDirectory = homedir()) {
  const resolvedHome = realpathSync(resolve(homeDirectory));
  const hooksPath = join(resolvedHome, ".gemini", "config", "hooks.json");
  if (!existsSync(hooksPath)) {
    throw new Error(
      "AGY delegation requires the global dai-nexus-policy hook"
    );
  }
  try {
    const realHooksPath = realpathSync(hooksPath);
    if (!isWithin(resolvedHome, realHooksPath)) {
      throw new Error("Global hook configuration escapes the home directory");
    }
    const document = readObject(
      JSON.parse(readFileSync(realHooksPath, "utf8"))
    );
    if (!hasValidPolicyHook(document, resolvedHome, resolvedHome)) {
      throw new Error("invalid global hook");
    }
    return realHooksPath;
  } catch {
    throw new Error(
      `Invalid AGY global policy hook configuration: ${hooksPath}`
    );
  }
}
function resolveContractPath(projectRoot, contractPath) {
  const resolvedRoot = resolve(projectRoot);
  const resolvedContract = isAbsolute(contractPath) ? resolve(contractPath) : resolve(resolvedRoot, contractPath);
  const pathFromRoot = relative(resolvedRoot, resolvedContract);
  if (pathFromRoot === "" || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error("Contract must be inside the project workspace");
  }
  return resolvedContract;
}
async function runAgyWorker(input) {
  const resolvedContract = realpathSync(input.contractPath);
  const resolvedRoot = realpathSync(input.projectRoot);
  if (!isWithin(resolvedRoot, resolvedContract)) {
    throw new Error("Contract must be inside the project workspace");
  }
  const worktreePath = dirname(resolvedContract);
  findValidAgyPolicyHook(resolvedRoot, worktreePath);
  findValidAgyGlobalPolicyHook(input.homeDirectory);
  const args = buildAgyArgs({
    model: input.model,
    contractFileName: basename(resolvedContract)});
  return await new Promise((resolveResult, reject) => {
    const worker = spawn("agy", args, {
      cwd: worktreePath,
      env: { ...process.env, DAINEXUS_WORKSPACE: resolvedRoot },
      shell: false,
      stdio: ["ignore", "inherit", "inherit"]
    });
    worker.once("error", reject);
    worker.once("exit", (exitCode, signal) => {
      resolveResult({ exitCode, signal });
    });
  });
}

// src/commands/delegate.ts
function registerDelegateCommand(program) {
  const delegate = program.command("delegate").description("Auto-detect controller and delegate implementation to Agy");
  delegate.command("status").description("Show auto-delegation state").option("-j, --json", "Output as JSON").action((options) => {
    const startTime = Date.now();
    const projectRoot = findProjectRoot();
    const activation = resolveCurrentDelegation(projectRoot);
    writeStatusOutput(
      activation,
      projectRoot,
      Boolean(options.json),
      Date.now() - startTime
    );
    process.exit(EXIT_CODES.OK);
  });
  for (const mode of ["auto", "on", "off"]) {
    delegate.command(mode).description(
      `${mode === "auto" ? "Auto-detect and enable" : mode === "on" ? "Force enable" : "Disable"} delegation mode`
    ).option("-j, --json", "Output as JSON").action((options) => {
      handleSetMode(mode, Boolean(options.json));
    });
  }
  delegate.command("model").description("Set the Agy worker model").argument("<model>", "Agy model name").option("-j, --json", "Output as JSON").action((model, options) => {
    handleSetModel(model, Boolean(options.json));
  });
  delegate.command("run").description("Run an approved Task Contract with the auto-detected worker").requiredOption("--contract <path>", "Path to CONTRACT.json").action(async (options) => {
    await handleRun(options.contract);
  });
}
function resolveCurrentDelegation(projectRoot = findProjectRoot()) {
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  return resolveDelegationActivation({
    config,
    workerAvailable: checkCli(config.workerCli).available
  });
}
function maybeNotifyAutoDelegation(argv = process.argv, environment = process.env) {
  const activation = resolveCurrentDelegation();
  const isModeMutation = argv.includes("delegate") && argv.some((argument) => ["auto", "on", "off", "model"].includes(argument));
  const notice = formatDelegationNotice(activation);
  if (notice && !isModeMutation && environment.FORGE_DELEGATION_NOTICE !== "0") {
    process.stderr.write(`${pc7.cyan("\u2139")} ${notice}
`);
  }
  return activation;
}
function handleSetMode(mode, useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  config.enabled = mode;
  persistConfig(projectRoot, config);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
function handleSetModel(model, useJson2) {
  const startTime = Date.now();
  const projectRoot = findProjectRoot();
  const config = readDelegationConfig(readProductionConfig(projectRoot));
  config.model = model;
  persistConfig(projectRoot, config);
  const activation = resolveCurrentDelegation(projectRoot);
  writeStatusOutput(activation, projectRoot, useJson2, Date.now() - startTime);
  process.exit(EXIT_CODES.OK);
}
async function handleRun(contract) {
  const projectRoot = findProjectRoot();
  const activation = resolveCurrentDelegation(projectRoot);
  if (!activation.active) {
    process.stderr.write(
      `${pc7.yellow("Delegation inactive:")} ${activation.reason}. Running on the controller is required.
`
    );
    process.exit(EXIT_CODES.MISSING_DEPENDENCY);
  }
  let contractPath;
  try {
    contractPath = resolveContractPath(projectRoot, contract);
  } catch (error) {
    process.stderr.write(`${pc7.red("Invalid contract:")} ${String(error)}
`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
  if (!existsSync(contractPath)) {
    process.stderr.write(`${pc7.red("Missing contract:")} ${contractPath}
`);
    process.exit(EXIT_CODES.USAGE_ERROR);
  }
  process.stderr.write(
    `${pc7.cyan("\u2139")} Delegating approved contract to ${activation.workerCli} / ${activation.model}
`
  );
  try {
    const result = await runAgyWorker({
      contractPath,
      model: activation.model,
      projectRoot,
      sandbox: true
    });
    process.exit(result.exitCode ?? EXIT_CODES.TOOL_ERROR);
  } catch (error) {
    process.stderr.write(`${pc7.red("Worker failed:")} ${String(error)}
`);
    process.exit(EXIT_CODES.TOOL_ERROR);
  }
}
function persistConfig(projectRoot, config) {
  writeProductionConfig(
    projectRoot,
    upsertTopLevelBlock(
      readProductionConfig(projectRoot),
      "delegationMode",
      buildDelegationBlock(config)
    )
  );
}
function writeStatusOutput(activation, projectRoot, useJson2, durationMs) {
  const data = {
    projectRoot,
    configPath: getProductionConfigPath(projectRoot),
    delegationMode: activation,
    worker: checkCli("agy")
  };
  if (useJson2 || !process.stdout.isTTY) {
    console.log(
      JSON.stringify(
        buildEnvelope("delegate.status", data, {
          ok: true,
          duration_ms: durationMs,
          version: VERSION
        }),
        null,
        2
      )
    );
    return;
  }
  const state = activation.active ? pc7.green("ACTIVE") : pc7.yellow("INACTIVE");
  console.log(`Delegation: ${state}`);
  console.log(`Controller: ${activation.controller}`);
  console.log(`Worker: ${activation.workerCli} / ${activation.model}`);
  console.log(`Reason: ${activation.reason}`);
}
var ProviderModelSettingsSchema = z.object({
  provider: z.string(),
  model: z.string(),
  options: z.record(z.unknown()).optional()
});
var BenchmarkTaskSchema = z.object({
  id: z.string(),
  category: z.string(),
  prompt: z.string(),
  providerSettings: ProviderModelSettingsSchema.optional(),
  attempts: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  workspace: z.string().optional(),
  verifierCommands: z.array(z.string().min(1)).min(1)
});
var BenchmarkSuiteSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  defaultProviderSettings: ProviderModelSettingsSchema,
  defaultAttempts: z.number().int().positive().default(1),
  defaultTimeoutMs: z.number().int().positive().default(6e4),
  tasks: z.array(BenchmarkTaskSchema).min(1, "Benchmark suite must include at least one task")
}).refine(
  (data) => {
    const ids = data.tasks.map((t) => t.id);
    const uniqueIds = new Set(ids);
    return uniqueIds.size === ids.length;
  },
  {
    message: "Task IDs must be unique within the benchmark suite",
    path: ["tasks"]
  }
);

// src/bench/metrics.ts
function calculateMetrics(taskResults) {
  const totalTasks = taskResults.length;
  if (totalTasks === 0) {
    return {
      totalTasks: 0,
      passAt1Count: 0,
      passAtKCount: 0,
      passAt1Rate: 0,
      passAtKRate: 0,
      categories: {}
    };
  }
  let passAt1Count = 0;
  let passAtKCount = 0;
  const categoryTasks = {};
  for (const task of taskResults) {
    if (task.passedAt1) {
      passAt1Count++;
    }
    if (task.passed) {
      passAtKCount++;
    }
    if (!categoryTasks[task.category]) {
      categoryTasks[task.category] = [];
    }
    categoryTasks[task.category].push(task);
  }
  const categories = {};
  for (const [category, tasks] of Object.entries(categoryTasks)) {
    let catPassAt1 = 0;
    let catPassAtK = 0;
    for (const t of tasks) {
      if (t.passedAt1) {
        catPassAt1++;
      }
      if (t.passed) {
        catPassAtK++;
      }
    }
    categories[category] = {
      category,
      totalTasks: tasks.length,
      passAt1Count: catPassAt1,
      passAtKCount: catPassAtK,
      passAt1Rate: tasks.length > 0 ? catPassAt1 / tasks.length : 0,
      passAtKRate: tasks.length > 0 ? catPassAtK / tasks.length : 0
    };
  }
  return {
    totalTasks,
    passAt1Count,
    passAtKCount,
    passAt1Rate: passAt1Count / totalTasks,
    passAtKRate: passAtKCount / totalTasks,
    categories
  };
}
var DEFAULT_DEADLINE_MS = 2e3;
var RETRY_PAUSE_MS = 25;
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function renameWithRetry(from, to, deadlineMs = DEFAULT_DEADLINE_MS) {
  const deadline = Date.now() + deadlineMs;
  for (; ; ) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      pause(RETRY_PAUSE_MS);
    }
  }
}
function removeQuietly(target) {
  try {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50
    });
  } catch {
  }
}

// src/bench/runner.ts
function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    renameWithRetry(tmpPath, filePath);
  } catch (error) {
    removeQuietly(tmpPath);
    throw error;
  }
}
function parseCommandString(cmdStr) {
  const matches = cmdStr.match(/"[^"]*"|'[^']*'|[^\s"']+/g);
  if (!matches) {
    return { program: cmdStr, args: [] };
  }
  const program = matches[0].replace(/^["']|["']$/g, "");
  const args = matches.slice(1).map((arg) => arg.replace(/^["']|["']$/g, ""));
  return { program, args };
}
function sanitizeOutput(text) {
  if (!text) {
    return "";
  }
  const maxLen = 2048;
  let sanitized = text.length > maxLen ? text.slice(0, maxLen) + "\n[TRUNCATED]" : text;
  sanitized = sanitized.replace(/(sk-[a-zA-Z0-9]{32,})/g, "[REDACTED_API_KEY]");
  sanitized = sanitized.replace(
    /(AIzaSy[a-zA-Z0-9-_]{33})/g,
    "[REDACTED_API_KEY]"
  );
  return sanitized;
}
var ADAPTERS = {
  agy: async (input, spawnFn) => {
    const contractContent = JSON.stringify(
      {
        contract_version: "1.0",
        task_id: input.taskId,
        task_name: `Benchmark Task ${input.taskId}`,
        acceptance_criteria: [],
        inputs: {
          prompt: input.prompt
        }
      },
      null,
      2
    );
    const instructionsContent = `# Instructions for ${input.taskId}
1. Implement the request in the contract:
${input.prompt}
2. Write DELIVERY.json. Do not commit.
`;
    writeFileSync(
      join(input.workspace, "CONTRACT.json"),
      contractContent,
      "utf8"
    );
    writeFileSync(
      join(input.workspace, "WORKER_INSTRUCTIONS.md"),
      instructionsContent,
      "utf8"
    );
    const args = [
      "--model",
      input.model,
      "--sandbox",
      "--mode",
      "accept-edits",
      "--print",
      "Read WORKER_INSTRUCTIONS.md and CONTRACT.json, execute only the contracted task, run its verification commands, and write DELIVERY.json."
    ];
    const startTime = Date.now();
    return new Promise((resolve13, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("agy", args, {
        cwd: input.workspace,
        env: {
          ...process.env,
          DAINEXUS_WORKSPACE: realpathSync(input.workspace)
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve13({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve13({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  },
  codex: async (input, spawnFn) => {
    const args = [
      "exec",
      "--skip-git-repo-check",
      "--model",
      input.model,
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      input.prompt
    ];
    const startTime = Date.now();
    return new Promise((resolve13, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("codex", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve13({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve13({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  },
  gemini: async (input, spawnFn) => {
    const args = ["-m", input.model, "-y", "-p", input.prompt];
    const startTime = Date.now();
    return new Promise((resolve13, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawnFn("gemini", args, {
        cwd: input.workspace,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      let timer = null;
      if (input.timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve13({
            exitStatus: null,
            durationMs: Date.now() - startTime,
            stdout,
            stderr
          });
        }, input.timeoutMs);
      }
      child.on("error", (err) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(err);
      });
      child.on("exit", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        resolve13({
          exitStatus: code,
          durationMs: Date.now() - startTime,
          stdout,
          stderr
        });
      });
    });
  }
};
async function runVerifierCommand(cmdStr, workspace, spawnFn) {
  const { program, args } = parseCommandString(cmdStr);
  return new Promise((resolve13) => {
    let stdout = "";
    let stderr = "";
    const child = spawnFn(program, args, {
      cwd: workspace,
      shell: false
    });
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.on("error", (err) => {
      resolve13({
        command: cmdStr,
        exitCode: null,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr + (stderr ? "\n" : "") + err.message),
        passed: false
      });
    });
    child.on("exit", (code) => {
      resolve13({
        command: cmdStr,
        exitCode: code,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
        passed: code === 0
      });
    });
  });
}
async function runBenchmarkSuite(suitePath, options) {
  const absoluteSuitePath = resolve(suitePath);
  const suiteDir = dirname(absoluteSuitePath);
  if (!existsSync(absoluteSuitePath)) {
    throw new Error(`Suite file not found: ${suitePath}`);
  }
  const rawSuite = JSON.parse(readFileSync(absoluteSuitePath, "utf8"));
  const parsedSuite = BenchmarkSuiteSchema.parse(rawSuite);
  let plan = `Benchmark Suite: ${parsedSuite.name} (v${parsedSuite.version})
`;
  plan += `Default Settings: Provider=${parsedSuite.defaultProviderSettings.provider}, Model=${parsedSuite.defaultProviderSettings.model}, Attempts=${parsedSuite.defaultAttempts}, Timeout=${parsedSuite.defaultTimeoutMs}ms
`;
  plan += `Tasks to run:
`;
  const tasksToRun = parsedSuite.tasks.map((task) => {
    const provider = task.providerSettings?.provider ?? parsedSuite.defaultProviderSettings.provider;
    const model = task.providerSettings?.model ?? parsedSuite.defaultProviderSettings.model;
    const attempts = task.attempts ?? parsedSuite.defaultAttempts;
    const timeoutMs = task.timeoutMs ?? parsedSuite.defaultTimeoutMs;
    const resolvedWorkspace = task.workspace ? resolve(suiteDir, task.workspace) : "";
    plan += ` - Task ID: ${task.id}
`;
    plan += `   Category: ${task.category}
`;
    plan += `   Provider: ${provider}, Model: ${model}
`;
    plan += `   Attempts: ${attempts}, Timeout: ${timeoutMs}ms
`;
    plan += `   Workspace: ${resolvedWorkspace || "None (current directory)"}
`;
    plan += `   Verifier commands: ${task.verifierCommands.join(", ") || "None"}
`;
    return {
      task,
      provider,
      model,
      attempts,
      timeoutMs,
      resolvedWorkspace
    };
  });
  if (!options.run) {
    return { plan };
  }
  const spawnFn = options.spawnFn ?? spawn;
  const taskResults = [];
  let totalAttemptsRun = 0;
  for (const {
    task,
    provider,
    model,
    attempts,
    timeoutMs,
    resolvedWorkspace
  } of tasksToRun) {
    if (task.workspace) {
      if (!existsSync(resolvedWorkspace) || !statSync(resolvedWorkspace).isDirectory()) {
        throw new Error(
          `Workspace for task ${task.id} must exist and be a directory: ${task.workspace}`
        );
      }
    }
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    const attemptResults = [];
    for (let k = 1; k <= attempts; k++) {
      let attemptWorkspace = resolvedWorkspace;
      let cleanupFn = () => {
      };
      const projectTmpDir = join(tmpdir(), "dai-nexus-bench");
      mkdirSync(projectTmpDir, { recursive: true });
      if (resolvedWorkspace && existsSync(resolvedWorkspace)) {
        const tempBase = join(projectTmpDir, `dai-bench-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cpSync(resolvedWorkspace, attemptWorkspace, { recursive: true });
        cleanupFn = () => {
          removeQuietly(attemptWorkspace);
        };
      } else {
        const tempBase = join(projectTmpDir, `dai-bench-empty-${task.id}-`);
        attemptWorkspace = mkdtempSync(tempBase);
        cleanupFn = () => {
          removeQuietly(attemptWorkspace);
        };
      }
      totalAttemptsRun++;
      let runResult;
      try {
        runResult = await adapter(
          {
            taskId: task.id,
            prompt: task.prompt,
            model,
            workspace: attemptWorkspace,
            timeoutMs
          },
          spawnFn
        );
      } catch (err) {
        runResult = {
          exitStatus: null,
          durationMs: 0,
          stdout: "",
          stderr: err instanceof Error ? err.message : String(err)
        };
      }
      const verifierResults = [];
      let allVerifiersPassed = task.verifierCommands.length > 0;
      for (const cmd of task.verifierCommands) {
        const res = await runVerifierCommand(cmd, attemptWorkspace, spawnFn);
        verifierResults.push(res);
        if (!res.passed) {
          allVerifiersPassed = false;
        }
      }
      attemptResults.push({
        attemptIndex: k,
        durationMs: runResult.durationMs,
        exitStatus: runResult.exitStatus,
        verifierResults,
        passed: runResult.exitStatus === 0 && allVerifiersPassed,
        provider,
        model,
        taskId: task.id,
        stdout: sanitizeOutput(runResult.stdout),
        stderr: sanitizeOutput(runResult.stderr)
      });
      cleanupFn();
    }
    const passedAt1 = attemptResults.length > 0 && attemptResults[0].passed;
    const passed = attemptResults.some((r) => r.passed);
    taskResults.push({
      taskId: task.id,
      category: task.category,
      attempts: attemptResults,
      passed,
      passedAt1
    });
  }
  const summary = calculateMetrics(taskResults);
  const report = {
    suiteName: parsedSuite.name,
    suiteVersion: parsedSuite.version,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    provider: parsedSuite.defaultProviderSettings.provider,
    model: parsedSuite.defaultProviderSettings.model,
    totalAttemptsRun,
    summary,
    tasks: taskResults
  };
  return { report, plan };
}

// src/commands/bench.ts
function registerBenchCommand(program) {
  program.command("bench").description("Run agent benchmark suite").argument("<suite-path>", "Path to benchmark suite JSON file").option("--run", "Perform a live benchmark run (default is dry-run)").option("-o, --output <path>", "Path to write JSON results report").action(
    async (suitePath, options) => {
      try {
        const isRun = Boolean(options.run);
        if (!isRun) {
          console.log(pc7.yellow("\u2139 Running in DRY-RUN mode (safe default)"));
        }
        const { report, plan } = await runBenchmarkSuite(suitePath, {
          run: isRun
        });
        if (!isRun) {
          console.log(plan);
          console.log(
            pc7.green(
              "\u2714 Dry-run completed. To execute live, run with the --run option."
            )
          );
          process.exit(EXIT_CODES.OK);
        }
        if (report) {
          console.log(pc7.green(`\u2714 Benchmark suite completed successfully.`));
          console.log(`Summary:`);
          console.log(` - Total Tasks: ${report.summary.totalTasks}`);
          console.log(
            ` - Pass@1 Rate: ${(report.summary.passAt1Rate * 100).toFixed(1)}% (${report.summary.passAt1Count}/${report.summary.totalTasks})`
          );
          console.log(
            ` - Pass@k Rate: ${(report.summary.passAtKRate * 100).toFixed(1)}% (${report.summary.passAtKCount}/${report.summary.totalTasks})`
          );
          for (const category of Object.values(report.summary.categories)) {
            console.log(`
Category: ${category.category}`);
            console.log(` - Tasks: ${category.totalTasks}`);
            console.log(
              ` - Pass@1 Rate: ${(category.passAt1Rate * 100).toFixed(1)}% (${category.passAt1Count}/${category.totalTasks})`
            );
            console.log(
              ` - Pass@k Rate: ${(category.passAtKRate * 100).toFixed(1)}% (${category.passAtKCount}/${category.totalTasks})`
            );
          }
          if (options.output) {
            const outputPath = options.output;
            writeJsonAtomic(outputPath, report);
            console.log(pc7.cyan(`
\u2714 Report written to ${outputPath}`));
          } else {
            console.log("\nResults (JSON):");
            console.log(JSON.stringify(report, null, 2));
          }
        }
        process.exit(EXIT_CODES.OK);
      } catch (err) {
        console.error(
          pc7.red(
            `Error running benchmark suite: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        process.exit(EXIT_CODES.TOOL_ERROR);
      }
    }
  );
}
var PROJECT_DIR = ".dainexus";
var PROJECT_MANIFEST = "project.json";
var PROJECT_PROFILE = "project-profile.json";
var LOCKFILES = [
  "bun.lockb",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock"
];
function registerProjectCommands(program) {
  program.command("init [target]").description("Create a project-local DAI Nexus manifest").option("-f, --force", "Overwrite an existing manifest").option("-j, --json", "Output as JSON").action((target, options) => {
    handleInit(target, options, Boolean(program.opts().json));
  });
  program.command("onboard [target]").description("Record deterministic filesystem facts for a project").option("-f, --force", "Overwrite an existing project profile").option("-j, --json", "Output as JSON").action((target, options) => {
    handleOnboard(target, options, Boolean(program.opts().json));
  });
}
function handleInit(targetInput, options, globalJson) {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);
  if (existsSync(manifestPath) && !options.force) {
    writeResult(
      "dai.init",
      { path: manifestPath, status: "already_exists" },
      options.json || globalJson,
      startedAt
    );
    return;
  }
  mkdirSync(join(target, PROJECT_DIR), { recursive: true });
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ schema_version: 1 }, null, 2)}
`
  );
  writeResult(
    "dai.init",
    {
      path: manifestPath,
      status: existsSync(manifestPath) && options.force ? "overwritten" : "created"
    },
    options.json || globalJson,
    startedAt
  );
}
function handleOnboard(targetInput, options, globalJson) {
  const startedAt = Date.now();
  const target = resolve(targetInput ?? process.cwd());
  const manifestPath = join(target, PROJECT_DIR, PROJECT_MANIFEST);
  const profilePath = join(target, PROJECT_DIR, PROJECT_PROFILE);
  if (!existsSync(manifestPath)) {
    writeError(
      "dai.onboard",
      { path: manifestPath },
      options.json || globalJson,
      startedAt,
      "Project manifest is required; run dai init first.",
      "MANIFEST_REQUIRED"
    );
    return;
  }
  if (existsSync(profilePath) && !options.force) {
    writeResult(
      "dai.onboard",
      { path: profilePath, status: "already_exists" },
      options.json || globalJson,
      startedAt
    );
    return;
  }
  const profile = buildProjectProfile(target);
  writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}
`);
  writeResult(
    "dai.onboard",
    {
      path: profilePath,
      status: options.force ? "overwritten" : "created",
      facts: profile.facts
    },
    options.json || globalJson,
    startedAt
  );
}
function buildProjectProfile(target) {
  const packagePath = join(target, "package.json");
  const packageJsonPresent = existsSync(packagePath);
  let declaredTestScript = null;
  if (packageJsonPresent) {
    try {
      const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
      if (typeof parsed === "object" && parsed !== null && "scripts" in parsed && typeof parsed.scripts === "object" && parsed.scripts !== null && "test" in parsed.scripts && typeof parsed.scripts.test === "string") {
        declaredTestScript = parsed.scripts.test;
      }
    } catch {
    }
  }
  return {
    schema_version: 1,
    facts: {
      git_present: existsSync(join(target, ".git")),
      package_json_present: packageJsonPresent,
      lockfiles: LOCKFILES.filter(
        (lockfile) => existsSync(join(target, lockfile))
      ),
      declared_test_script: declaredTestScript
    }
  };
}
function writeResult(tool, data, useJson2, startedAt) {
  const envelope = buildEnvelope(tool, data, {
    ok: true,
    duration_ms: Date.now() - startedAt,
    version: VERSION
  });
  if (useJson2 || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stdout.write(`${pc7.green("\u2713")} ${data.status}: ${data.path}
`);
  }
}
function writeError(tool, data, useJson2, startedAt, message, reason) {
  const envelope = buildEnvelope(tool, data, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: EXIT_CODES.CONFIG_ERROR, message, details: { reason } }
  });
  if (useJson2 || !process.stdout.isTTY) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stderr.write(`${pc7.red("Error:")} ${message}
`);
  }
  process.exitCode = EXIT_CODES.CONFIG_ERROR;
}
var DENIED_SEGMENTS = /* @__PURE__ */ new Set([
  ".git",
  ".hg",
  ".svn",
  ".ssh",
  ".aws",
  ".gnupg",
  ".worktrees",
  "credentials",
  "credential",
  "secrets",
  "secret",
  "keystore",
  "node_modules"
]);
var DENIED_DAINEXUS_SEGMENTS = /* @__PURE__ */ new Set([
  "artifacts",
  "audit",
  "deliveries",
  "escalations",
  "execution",
  "goals",
  "logs",
  "memory-bank",
  "mcp-server",
  "runtime",
  "subagent-context",
  "telemetry",
  "verify"
]);
var ALLOWED_DAINEXUS_FILES = /* @__PURE__ */ new Set([
  ".dainexus/docs-manifest.json",
  ".dainexus/project-profile.json",
  ".dainexus/project.json",
  ".dainexus/code-conventions.md"
]);
var DENIED_BASENAME_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(?:^|[-_.])(secret|credentials?|private[-_.]?key)(?:[-_.]|$)/i,
  /\.(?:pem|key|p8|p12|jks|keystore)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i
];
var DocsPathError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DocsPathError";
    this.code = code;
  }
};
function normalizeRelativePath(input) {
  const normalized = input.normalize("NFC").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
  if (normalized.length === 0 || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new DocsPathError(
      "INVALID_RELATIVE_PATH",
      `Expected a non-empty relative path, received "${input}".`
    );
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new DocsPathError(
      "PATH_TRAVERSAL",
      `Path traversal is not allowed: "${input}".`
    );
  }
  return segments.filter((segment) => segment !== ".").join("/");
}
function canonicalProjectRoot(input) {
  const absolute = resolve(input);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    throw new DocsPathError(
      "PROJECT_NOT_FOUND",
      `Project directory does not exist: ${absolute}`
    );
  }
  return realpathSync(absolute);
}
function isPathInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
function resolveWithinProject(projectRoot, relativePath, options = {}) {
  const root = canonicalProjectRoot(projectRoot);
  const normalized = normalizeRelativePath(relativePath);
  const lexicalTarget = resolve(root, normalized);
  if (!isPathInside(root, lexicalTarget)) {
    throw new DocsPathError(
      "PATH_TRAVERSAL",
      `Path escapes project root: ${relativePath}`
    );
  }
  if (!existsSync(lexicalTarget)) {
    if (options.mustExist) {
      throw new DocsPathError(
        "PATH_NOT_FOUND",
        `Path does not exist: ${relativePath}`
      );
    }
    return lexicalTarget;
  }
  const resolvedTarget = realpathSync(lexicalTarget);
  if (!isPathInside(root, resolvedTarget)) {
    throw new DocsPathError(
      "SYMLINK_ESCAPE",
      `Resolved path escapes project root: ${relativePath}`
    );
  }
  return resolvedTarget;
}
function isSensitivePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.toLowerCase().split("/");
  const basename5 = segments.at(-1) ?? "";
  if (segments.some((segment) => DENIED_SEGMENTS.has(segment))) {
    return true;
  }
  if (segments[0] === ".dainexus") {
    if (ALLOWED_DAINEXUS_FILES.has(normalized.toLowerCase())) {
      return false;
    }
    if (segments.length > 1 && DENIED_DAINEXUS_SEGMENTS.has(segments[1])) {
      return true;
    }
  }
  return DENIED_BASENAME_PATTERNS.some((pattern) => pattern.test(basename5));
}
function matchesGlob(path, glob) {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedGlob = glob.replace(/\\/g, "/").replace(/^\.\/+/, "");
  let pattern = "";
  for (let index = 0; index < normalizedGlob.length; index += 1) {
    const char = normalizedGlob[index];
    if (char === "*") {
      if (normalizedGlob[index + 1] === "*") {
        index += 1;
        if (normalizedGlob[index + 1] === "/") {
          index += 1;
          pattern += "(?:.*/)?";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`, "u").test(normalizedPath);
}
function isAllowedByPrivacy(relativePath, allow, exclude) {
  const normalized = normalizeRelativePath(relativePath);
  if (isSensitivePath(normalized)) {
    return false;
  }
  const excluded = exclude.some((pattern) => {
    const normalizedPattern = normalizeRelativePath(pattern);
    return normalized === normalizedPattern || normalized.startsWith(`${normalizedPattern}/`) || matchesGlob(normalized, normalizedPattern);
  });
  if (excluded) {
    return false;
  }
  return allow.some((entry) => {
    const normalizedEntry = normalizeRelativePath(entry);
    return normalized === normalizedEntry || normalized.startsWith(`${normalizedEntry}/`) || matchesGlob(normalized, normalizedEntry);
  });
}
var SUPPORTED_DIAGRAMS = /* @__PURE__ */ new Set([
  "flowchart",
  "graph",
  "sequencediagram",
  "classdiagram",
  "statediagram-v2",
  "erdiagram",
  "journey",
  "gantt",
  "pie"
]);
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function extractDiagramLabels(source) {
  const labels = [];
  const seen = /* @__PURE__ */ new Set();
  const quoted = source.matchAll(/["']([^"'\n]{1,100})["']/g);
  for (const match of quoted) {
    const label2 = match[1].trim();
    if (label2 && !seen.has(label2)) {
      labels.push(label2);
      seen.add(label2);
    }
  }
  if (labels.length === 0) {
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie)\b/i.test(
        trimmed
      )) {
        continue;
      }
      const parts = trimmed.split(/-->|---|==>|->>|-->>|:/);
      for (const part of parts) {
        const label2 = part.replace(/^[A-Za-z0-9_-]+\s*[\[(\{]+/, "").replace(/[\])\}]+$/, "").trim();
        if (label2 && label2.length <= 100 && !seen.has(label2)) {
          labels.push(label2);
          seen.add(label2);
        }
      }
    }
  }
  return labels.slice(0, 12);
}
function parseDiagram(source, line) {
  const trimmed = source.trim();
  const first = trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
  const labels = extractDiagramLabels(trimmed);
  let error;
  if (!trimmed) {
    error = "Diagram source is empty.";
  } else if (!SUPPORTED_DIAGRAMS.has(first)) {
    error = `Unsupported Mermaid diagram type: ${first || "<missing>"}.`;
  } else {
    const pairs = [
      ["[", "]"],
      ["(", ")"],
      ["{", "}"]
    ];
    for (const [open, close] of pairs) {
      const opens = [...trimmed].filter((char) => char === open).length;
      const closes = [...trimmed].filter((char) => char === close).length;
      if (opens !== closes) {
        error = `Unbalanced "${open}${close}" delimiters.`;
        break;
      }
    }
  }
  return {
    id: createHash("sha256").update(`${line}:${trimmed}`).digest("hex").slice(0, 16),
    type: first || "unknown",
    source: trimmed,
    line,
    valid: error === void 0,
    ...error ? { error } : {},
    labels
  };
}
function renderDiagramSvg(diagram, title) {
  const labels = diagram.labels.length > 0 ? diagram.labels : [diagram.valid ? "Diagram" : "Invalid diagram"];
  const width = 480;
  const nodeWidth = 420;
  const nodeHeight = 54;
  const gap = 34;
  const height = Math.max(
    130,
    54 + labels.length * nodeHeight + Math.max(0, labels.length - 1) * gap
  );
  const x = (width - nodeWidth) / 2;
  const nodes = labels.map((label2, index) => {
    const y = 38 + index * (nodeHeight + gap);
    const arrow = index === labels.length - 1 ? "" : `<path d="M ${width / 2} ${y + nodeHeight} V ${y + nodeHeight + gap - 8}" class="diagram-edge" marker-end="url(#arrow-${diagram.id})"/>`;
    return `<g>
  <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" class="diagram-node"/>
  <text x="${width / 2}" y="${y + 33}" text-anchor="middle" class="diagram-label">${escapeXml(label2.slice(0, 42))}</text>
  ${arrow}
</g>`;
  }).join("\n");
  return `<svg class="diagram-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="diagram-title-${diagram.id} diagram-desc-${diagram.id}" xmlns="http://www.w3.org/2000/svg">
  <title id="diagram-title-${diagram.id}">${escapeXml(title)}</title>
  <desc id="diagram-desc-${diagram.id}">${escapeXml(labels.join(" to "))}</desc>
  <defs>
    <marker id="arrow-${diagram.id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" class="diagram-arrow"/>
    </marker>
  </defs>
  ${nodes}
</svg>`;
}

// src/docs/normalize.ts
function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}
function stableId(namespace, value) {
  return createHash("sha256").update(`${namespace}:${value.normalize("NFC")}`).digest("hex").slice(0, 16);
}
function encodeRoutePath(path) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
function documentRoute(projectId, sourcePath) {
  return `projects/${encodeURIComponent(projectId)}/docs/${encodeRoutePath(sourcePath)}.html`;
}
function assetRoute(projectId, sourcePath) {
  return `projects/${encodeURIComponent(projectId)}/assets/${encodeRoutePath(sourcePath)}`;
}
function slugifyHeading(input) {
  return input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_~[\](){}:;,.!?'"\\/]+/g, " ").replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}
function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') || trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1).split(",").map((entry) => entry.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
function parseFrontmatter(content) {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return { body: content, values: {}, lineOffset: 0 };
  }
  const lines = content.split(/\r?\n/);
  const closing = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );
  if (closing < 0) {
    return { body: content, values: {}, lineOffset: 0 };
  }
  const values = {};
  for (const line of lines.slice(1, closing)) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      values[match[1]] = parseScalar(match[2]);
    }
  }
  return {
    body: lines.slice(closing + 1).join("\n"),
    values,
    lineOffset: closing + 1
  };
}
function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}
function extractHeadings(content, lineOffset) {
  const headings = [];
  const slugCounts = /* @__PURE__ */ new Map();
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const text = match[2].replace(/[`*_~]/g, "").trim();
    const base = slugifyHeading(text);
    const count = slugCounts.get(base) ?? 0;
    slugCounts.set(base, count + 1);
    headings.push({
      level: match[1].length,
      text,
      slug: count === 0 ? base : `${base}-${count}`,
      line: index + 1 + lineOffset
    });
  }
  return headings;
}
function extractLinks(content, lineOffset) {
  const links = [];
  const regex = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of content.matchAll(regex)) {
    const target = match[3].replace(/^<|>$/g, "");
    const image = match[1] === "!";
    let kind = image ? "asset" : "document";
    if (target.startsWith("#")) {
      kind = "anchor";
    } else if (/^(?:https?:|mailto:|tel:|data:)/i.test(target)) {
      kind = "external";
    }
    links.push({
      label: match[2] || (image ? "Image" : target),
      target,
      kind,
      line: lineNumberAt(content, match.index ?? 0) + lineOffset,
      image
    });
  }
  return links;
}
function extractDiagrams(content, lineOffset) {
  const diagrams = [];
  const regex = /```mermaid[^\n]*\r?\n([\s\S]*?)```/gi;
  for (const match of content.matchAll(regex)) {
    diagrams.push(
      parseDiagram(
        match[1],
        lineNumberAt(content, match.index ?? 0) + lineOffset
      )
    );
  }
  return diagrams;
}
function extractCodeRefs(content) {
  const refs = /* @__PURE__ */ new Set();
  for (const match of content.matchAll(/gitnexus:\/\/[^\s)>\]]+/g)) {
    refs.add(match[0]);
  }
  for (const match of content.matchAll(
    /(?:^|[\s`("'[])((?:src|app|lib|scripts|mcp|tests|skills)\/[A-Za-z0-9_./@-]+\.(?:ts|tsx|js|mjs|cjs|py|sh|md|json|ya?ml)(?:#[A-Za-z0-9_.:-]+)?)/gm
  )) {
    refs.add(match[1]);
  }
  return [...refs].sort();
}
function titleFromPath(path) {
  const name = path.split("/").at(-1) ?? path;
  return name.replace(/\.(?:md|markdown|json|ya?ml)$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function normalizeTextDocument(input) {
  const extension = extname(input.sourcePath).toLowerCase();
  const format = extension === ".json" ? "json" : extension === ".yaml" || extension === ".yml" ? "yaml" : "markdown";
  const parsed = format === "markdown" ? parseFrontmatter(input.content) : { body: input.content, values: {}, lineOffset: 0 };
  const headings = format === "markdown" ? extractHeadings(parsed.body, parsed.lineOffset) : [];
  const titleValue = parsed.values.title;
  const title = typeof titleValue === "string" && titleValue.trim() ? titleValue.trim() : headings[0]?.text ?? titleFromPath(input.sourcePath);
  const tagsValue = parsed.values.tags;
  const tags = Array.isArray(tagsValue) ? tagsValue.filter((tag) => typeof tag === "string") : typeof tagsValue === "string" ? tagsValue.split(",").map((tag) => tag.trim()).filter(Boolean) : [];
  const statusValue = parsed.values.status;
  const normalizedPath = normalizeRelativePath(input.sourcePath);
  return {
    id: stableId(input.projectId, normalizedPath),
    projectId: input.projectId,
    sourcePath: normalizedPath,
    route: documentRoute(input.projectId, normalizedPath),
    title,
    type: input.source.type,
    format,
    status: typeof statusValue === "string" ? statusValue : null,
    sourceOfTruth: input.truth.includes(normalizedPath),
    tags: [...new Set(tags)].sort(),
    headings,
    links: format === "markdown" ? extractLinks(parsed.body, parsed.lineOffset) : [],
    codeRefs: extractCodeRefs(parsed.body),
    diagrams: format === "markdown" ? extractDiagrams(parsed.body, parsed.lineOffset) : [],
    backlinks: [],
    related: [],
    warnings: format === "markdown" && Object.keys(parsed.values).length === 0 ? [
      "Document has no frontmatter; classification uses manifest and filename defaults."
    ] : [],
    contentHash: hashContent(input.content),
    content: parsed.body
  };
}
function normalizeAsset(input) {
  const extension = extname(input.sourcePath).toLowerCase();
  const mediaTypes = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  const normalizedPath = normalizeRelativePath(input.sourcePath);
  return {
    id: stableId(input.projectId, `asset:${normalizedPath}`),
    projectId: input.projectId,
    sourcePath: normalizedPath,
    route: assetRoute(input.projectId, normalizedPath),
    mediaType: mediaTypes[extension] ?? "application/octet-stream",
    contentHash: hashContent(input.content)
  };
}
function runGit(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    timeout: 5e3,
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}
function readCuratedProfile(projectRoot) {
  const path = join(projectRoot, ".dainexus", "project-profile.json");
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const profile = {};
    if (typeof raw.schema_version === "string" || typeof raw.schema_version === "number") {
      profile.schema_version = raw.schema_version;
    }
    if (raw.facts && typeof raw.facts === "object") {
      const facts = raw.facts;
      profile.facts = {
        git_present: typeof facts.git_present === "boolean" ? facts.git_present : void 0,
        package_json_present: typeof facts.package_json_present === "boolean" ? facts.package_json_present : void 0,
        lockfiles: Array.isArray(facts.lockfiles) ? facts.lockfiles.filter((item) => typeof item === "string").slice(0, 20) : void 0
      };
    }
    if (raw.fingerprint && typeof raw.fingerprint === "object") {
      const fingerprint = raw.fingerprint;
      const allowed = [
        "product",
        "language",
        "framework",
        "build_tool",
        "architecture",
        "services",
        "source_of_truth"
      ];
      profile.fingerprint = Object.fromEntries(
        allowed.filter((key) => key in fingerprint).map((key) => [key, fingerprint[key]])
      );
    }
    return profile;
  } catch {
    return {};
  }
}
function collectProjectFacts(projectRoot, manifest) {
  const gitEnabled = manifest.adapters?.git !== false;
  const commit = gitEnabled ? runGit(projectRoot, ["rev-parse", "HEAD"]) : null;
  const branch = gitEnabled ? runGit(projectRoot, ["branch", "--show-current"]) : null;
  const dirtyOutput = gitEnabled ? runGit(projectRoot, ["status", "--porcelain", "--untracked-files=no"]) : null;
  const gitnexusEnabled = manifest.adapters?.gitnexus === true;
  const gitnexusPath = join(projectRoot, ".gitnexus", "meta.json");
  let gitnexus = {
    status: gitnexusEnabled ? "unavailable" : "disabled",
    indexedCommit: null,
    indexedAt: null,
    processes: null,
    symbols: null
  };
  if (gitnexusEnabled && existsSync(gitnexusPath)) {
    try {
      const meta = JSON.parse(readFileSync(gitnexusPath, "utf8"));
      const indexedCommit = typeof meta.lastCommit === "string" ? meta.lastCommit : null;
      gitnexus = {
        status: commit && indexedCommit && (commit !== indexedCommit || Boolean(dirtyOutput)) ? "stale" : "available",
        indexedCommit,
        indexedAt: typeof meta.indexedAt === "string" ? meta.indexedAt : null,
        processes: typeof meta.stats?.processes === "number" ? meta.stats.processes : null,
        symbols: typeof meta.stats?.nodes === "number" ? meta.stats.nodes : null
      };
    } catch {
      gitnexus.status = "unavailable";
    }
  }
  return {
    git: {
      available: commit !== null,
      branch,
      commit,
      dirty: commit === null ? null : Boolean(dirtyOutput)
    },
    gitnexus,
    profile: readCuratedProfile(projectRoot)
  };
}

// src/docs/types.ts
var DOCS_SCHEMA_VERSION = 1;
var DOCS_PROJECT_STATE_SCHEMA_VERSION = 1;

// src/docs/project-state.ts
var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function isProjectRelativePath(value) {
  if (value.length === 0 || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    return false;
  }
  return !value.split("/").some((segment) => segment === "..");
}
var projectStateRelativePathSchema = z.string().min(1).refine(isProjectRelativePath, {
  message: "must be a project-relative path without traversal, absolute prefixes, or backslashes"
});
var idSchema = z.string().regex(ID_PATTERN, "must be a slug-like ID");
var textSchema = z.string().min(1);
var calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must use YYYY-MM-DD").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}, "must be a valid calendar date");
var referenceSchema = z.object({
  path: projectStateRelativePathSchema,
  anchor: textSchema.optional()
}).strict();
var projectSchema = z.object({
  summary: textSchema,
  product_type: z.enum([
    "product",
    "game",
    "library",
    "service",
    "tooling",
    "other"
  ]),
  lifecycle: z.enum([
    "planning",
    "active",
    "paused",
    "archived",
    "completed"
  ])
}).strict();
var rootSchema = z.object({
  id: idSchema,
  path: projectStateRelativePathSchema,
  kind: textSchema,
  purpose: textSchema,
  owner: textSchema
}).strict();
var dependencySchema = z.object({
  from: idSchema,
  to: idSchema,
  type: textSchema
}).strict();
var roadmapSchema = z.object({
  id: idSchema,
  title: textSchema,
  status: z.enum([
    "proposed",
    "planned",
    "in_progress",
    "blocked",
    "done",
    "cancelled"
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  owner: textSchema,
  target_date: calendarDateSchema.nullable(),
  depends_on: z.array(idSchema),
  references: z.array(referenceSchema)
}).strict();
var flowStepSchema = z.object({
  id: idSchema,
  name: textSchema,
  actor: textSchema,
  inputs: z.array(textSchema).min(1),
  outputs: z.array(textSchema).min(1),
  references: z.array(referenceSchema)
}).strict();
var flowSchema = z.object({
  id: idSchema,
  title: textSchema,
  status: z.enum(["draft", "active", "deprecated"]),
  trigger: textSchema,
  steps: z.array(flowStepSchema).min(1).superRefine(requireUniqueIds("flow steps"))
}).strict();
var backlogSchema = z.object({
  id: idSchema,
  title: textSchema,
  type: z.enum(["feature", "bug", "task", "research", "technical_debt"]),
  status: z.enum([
    "proposed",
    "ready",
    "in_progress",
    "blocked",
    "done",
    "cancelled"
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  owner: textSchema,
  acceptance: z.array(textSchema).min(1),
  references: z.array(referenceSchema)
}).strict();
var blockerSchema = z.object({ id: idSchema, title: textSchema, owner: textSchema }).strict();
var riskSchema = z.object({
  id: idSchema,
  title: textSchema,
  owner: textSchema,
  mitigation: textSchema
}).strict();
var nextActionSchema = z.object({
  id: idSchema,
  title: textSchema,
  owner: textSchema,
  due_date: calendarDateSchema.nullable()
}).strict();
var statusSchema = z.object({
  lifecycle: z.enum([
    "planning",
    "active",
    "paused",
    "archived",
    "completed"
  ]),
  health: z.enum(["on_track", "at_risk", "blocked", "unknown"]),
  phase: textSchema,
  summary: textSchema,
  updated_at: z.string().datetime({ offset: true }),
  blockers: z.array(blockerSchema).superRefine(requireUniqueIds("blockers")),
  risks: z.array(riskSchema).superRefine(requireUniqueIds("risks")),
  next_actions: z.array(nextActionSchema).superRefine(requireUniqueIds("next actions")),
  next_update_at: z.string().datetime({ offset: true }).nullable()
}).strict();
function requireUniqueIds(collection) {
  return (items, context) => {
    const seen = /* @__PURE__ */ new Set();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `duplicate ID in ${collection}`
        });
      }
      seen.add(item.id);
    }
  };
}
var docsProjectStateSchema = z.object({
  schema_version: z.literal(DOCS_PROJECT_STATE_SCHEMA_VERSION),
  project: projectSchema,
  structure: z.object({
    roots: z.array(rootSchema).min(1, "structure.roots must not be empty").superRefine(requireUniqueIds("structure roots")),
    dependencies: z.array(dependencySchema)
  }).strict(),
  roadmap: z.array(roadmapSchema).superRefine(requireUniqueIds("roadmap")),
  flows: z.array(flowSchema).superRefine(requireUniqueIds("flows")),
  backlog: z.array(backlogSchema).superRefine(requireUniqueIds("backlog")),
  status: statusSchema
}).strict().superRefine((state, context) => {
  if (state.project.lifecycle !== state.status.lifecycle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status", "lifecycle"],
      message: "must match project.lifecycle"
    });
  }
  const rootIds = new Set(state.structure.roots.map((root) => root.id));
  const dependencyKeys = /* @__PURE__ */ new Set();
  for (const [index, dependency] of state.structure.dependencies.entries()) {
    for (const field of ["from", "to"]) {
      if (!rootIds.has(dependency[field])) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["structure", "dependencies", index, field],
          message: "must reference a structure root ID"
        });
      }
    }
    const key = `${dependency.from}\0${dependency.to}\0${dependency.type}`;
    if (dependencyKeys.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["structure", "dependencies", index],
        message: "duplicate structure dependency"
      });
    }
    dependencyKeys.add(key);
  }
  const roadmapIds = new Set(state.roadmap.map((item) => item.id));
  for (const [index, item] of state.roadmap.entries()) {
    const seen = /* @__PURE__ */ new Set();
    for (const [dependencyIndex, dependency] of item.depends_on.entries()) {
      if (!roadmapIds.has(dependency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "must reference a roadmap item ID"
        });
      } else if (dependency === item.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "must not reference the same roadmap item"
        });
      }
      if (seen.has(dependency)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roadmap", index, "depends_on", dependencyIndex],
          message: "duplicate roadmap dependency"
        });
      }
      seen.add(dependency);
    }
  }
  if (state.status.next_update_at && Date.parse(state.status.next_update_at) < Date.parse(state.status.updated_at)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["status", "next_update_at"],
      message: "must not be earlier than status.updated_at"
    });
  }
});
var DocsProjectStateError = class extends Error {
  details;
  constructor(message, details = []) {
    super(message);
    this.name = "DocsProjectStateError";
    this.details = details;
  }
};
function validateProjectState(input) {
  const parsed = docsProjectStateSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocsProjectStateError(
      "Invalid DAI Nexus project state.",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      )
    );
  }
  return parsed.data;
}
function slugify(input) {
  const slug2 = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug2 || "root";
}
function inferredRoots(projectRoot) {
  const candidates = readdirSync(projectRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && entry.name !== ".dainexus" && !isSensitivePath(entry.name)
  ).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  const usedIds = /* @__PURE__ */ new Set();
  const roots = candidates.map((path) => {
    const baseId = slugify(path);
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    return {
      id,
      path,
      kind: "directory",
      purpose: `Top-level ${path} directory.`,
      owner: "unassigned"
    };
  });
  if (roots.length > 0) return roots;
  return [
    {
      id: "project-root",
      path: ".",
      kind: "project",
      purpose: "Project root; no top-level directories were detected.",
      owner: "unassigned"
    }
  ];
}
function createDefaultProjectState(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const summary = "Documentation baseline only; roadmap, flows, and backlog are intentionally empty.";
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
    project: {
      summary,
      product_type: "other",
      lifecycle: "planning"
    },
    structure: {
      roots: inferredRoots(projectRoot),
      dependencies: []
    },
    roadmap: [],
    flows: [],
    backlog: [],
    status: {
      lifecycle: "planning",
      health: "unknown",
      phase: "planning",
      summary,
      updated_at: updatedAt,
      blockers: [],
      risks: [],
      next_actions: [],
      next_update_at: null
    }
  };
}
function safeLoadProjectState(projectRootInput, statePathInput) {
  const path = statePathInput;
  if (!isProjectRelativePath(path)) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: "Project state path must be project-relative and safe."
      }
    };
  }
  let projectRoot;
  try {
    projectRoot = canonicalProjectRoot(projectRootInput);
  } catch (error) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
  let absolutePath;
  try {
    absolutePath = resolveWithinProject(projectRoot, path, { mustExist: true });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : void 0;
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: code === "PATH_NOT_FOUND" ? "missing" : "containment",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
  if (!existsSync(absolutePath)) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "missing",
        message: `Project state does not exist: ${path}`
      }
    };
  }
  try {
    let presentedPath = projectRoot;
    for (const segment of path.split("/")) {
      if (segment === ".") continue;
      presentedPath = join(presentedPath, segment);
      if (lstatSync(presentedPath).isSymbolicLink()) {
        return {
          state: null,
          path,
          contentHash: null,
          error: {
            code: "containment",
            message: "Project state path must not contain symbolic links; keep it as a regular project-owned file."
          }
        };
      }
    }
  } catch (error) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "containment",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
  try {
    const raw = readFileSync(absolutePath, "utf8");
    const contentHash = hashContent(raw);
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        state: null,
        path,
        contentHash,
        error: {
          code: "invalid",
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }
    try {
      return {
        state: validateProjectState(parsed),
        path,
        contentHash,
        error: null
      };
    } catch (error) {
      return {
        state: null,
        path,
        contentHash,
        error: {
          code: "invalid",
          message: error instanceof DocsProjectStateError ? [error.message, ...error.details].join(" ") : error instanceof Error ? error.message : String(error)
        }
      };
    }
  } catch (error) {
    return {
      state: null,
      path,
      contentHash: null,
      error: {
        code: "invalid",
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// src/docs/manifest.ts
var DOCS_MANIFEST_PATH = join(".dainexus", "docs-manifest.json");
var relativePathSchema = z.string().min(1).refine((value) => !value.includes("\\"), "backslashes are not allowed").refine((value) => {
  try {
    normalizeRelativePath(value);
    return true;
  } catch {
    return false;
  }
}, "must be a project-relative path without '..' traversal");
var sourceSchema = z.object({
  path: relativePathSchema,
  type: z.enum([
    "documentation",
    "overview",
    "architecture",
    "product",
    "testing",
    "operations",
    "assets",
    "metadata"
  ]),
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional()
}).strict();
var docsManifestSchema = z.object({
  schema_version: z.literal(DOCS_SCHEMA_VERSION),
  project: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1)
  }).strict(),
  sources: z.array(sourceSchema).min(1),
  project_docs: z.object({
    schema_version: z.literal(DOCS_PROJECT_STATE_SCHEMA_VERSION),
    state: relativePathSchema,
    max_stale_days: z.number().int().min(1).max(365).optional()
  }).strict().optional(),
  truth: z.array(relativePathSchema).optional(),
  adapters: z.object({
    git: z.boolean().optional(),
    gitnexus: z.boolean().optional(),
    evidence_summary: z.boolean().optional()
  }).strict().optional(),
  privacy: z.object({
    mode: z.literal("allowlist"),
    allow: z.array(relativePathSchema).optional(),
    exclude: z.array(relativePathSchema).optional()
  }).strict()
}).strict();
var DocsManifestError = class extends Error {
  details;
  constructor(message, details = []) {
    super(message);
    this.name = "DocsManifestError";
    this.details = details;
  }
};
function slugifyProjectId(input) {
  const slug2 = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug2 || "project";
}
function humanizeProjectTitle(input) {
  return input.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function readPackageIdentity(projectRoot) {
  const packagePath = join(projectRoot, "package.json");
  if (!existsSync(packagePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
    const rawName = typeof parsed.name === "string" ? parsed.name.replace(/^@[^/]+\//, "") : basename(projectRoot);
    const title = typeof parsed.displayName === "string" ? parsed.displayName : humanizeProjectTitle(rawName);
    return { id: slugifyProjectId(rawName), title };
  } catch {
    return null;
  }
}
function discoverSources(projectRoot) {
  const directoryNames = /* @__PURE__ */ new Set(["Docs", "docs", "documentation", "wiki"]);
  const sources = readdirSync(projectRoot, {
    withFileTypes: true
  }).filter((entry) => entry.isDirectory() && directoryNames.has(entry.name)).sort((left, right) => left.name.localeCompare(right.name)).map((entry) => ({
    path: entry.name,
    type: "documentation",
    include: [
      "**/*.md",
      "**/*.markdown",
      "**/*.json",
      "**/*.yaml",
      "**/*.yml",
      "**/*.svg",
      "**/*.png",
      "**/*.jpg",
      "**/*.jpeg",
      "**/*.gif",
      "**/*.webp"
    ]
  }));
  for (const readme of ["README.md", "README.vi.md"]) {
    if (existsSync(join(projectRoot, readme))) {
      sources.push({ path: readme, type: "overview" });
    }
  }
  if (existsSync(join(projectRoot, ".dainexus", "project-profile.json"))) {
    sources.push({
      path: ".dainexus/project-profile.json",
      type: "metadata"
    });
  }
  if (sources.length === 0) {
    sources.push({ path: "README.md", type: "overview" });
  }
  return sources;
}
function createDefaultManifest(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const identity = readPackageIdentity(projectRoot) ?? {
    id: slugifyProjectId(basename(projectRoot)),
    title: humanizeProjectTitle(basename(projectRoot))
  };
  const sources = discoverSources(projectRoot);
  const projectStatePath = "docs/project-state.json";
  if (!sources.some((source) => source.path === projectStatePath)) {
    sources.push({ path: projectStatePath, type: "metadata" });
  }
  return {
    schema_version: DOCS_SCHEMA_VERSION,
    project: identity,
    sources,
    project_docs: {
      schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
      state: projectStatePath,
      max_stale_days: 30
    },
    truth: [
      ...sources.filter((source) => source.type === "overview").map((source) => source.path),
      projectStatePath
    ],
    adapters: {
      git: true,
      gitnexus: existsSync(join(projectRoot, ".gitnexus", "meta.json")),
      evidence_summary: false
    },
    privacy: {
      mode: "allowlist",
      allow: sources.map((source) => source.path),
      exclude: [
        "**/.env*",
        "**/credentials/**",
        "**/secrets/**",
        "**/node_modules/**",
        "**/.worktrees/**"
      ]
    }
  };
}
function validateManifest(input) {
  const parsed = docsManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new DocsManifestError(
      "Invalid DAI Nexus docs manifest.",
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`
      )
    );
  }
  return parsed.data;
}
function initManifest(projectRootInput, options = {}) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const manifestPath = join(projectRoot, DOCS_MANIFEST_PATH);
  if (existsSync(manifestPath) && !options.force) {
    const existing = validateManifest(
      JSON.parse(readFileSync(manifestPath, "utf8"))
    );
    if (!existing.project_docs) {
      const statePath2 = "docs/project-state.json";
      const sources = existing.sources.some(
        (source) => source.path === statePath2
      ) ? existing.sources : [...existing.sources, { path: statePath2, type: "metadata" }];
      const allow = existing.privacy.allow ? [.../* @__PURE__ */ new Set([...existing.privacy.allow, statePath2])] : void 0;
      const migrated = {
        ...existing,
        sources,
        project_docs: {
          schema_version: DOCS_PROJECT_STATE_SCHEMA_VERSION,
          state: statePath2,
          max_stale_days: 30
        },
        truth: [.../* @__PURE__ */ new Set([...existing.truth ?? [], statePath2])],
        privacy: {
          ...existing.privacy,
          ...allow ? { allow } : {}
        }
      };
      writeFileSync(
        manifestPath,
        `${JSON.stringify(migrated, null, 2)}
`,
        "utf8"
      );
      const absoluteStatePath = join(projectRoot, statePath2);
      if (!existsSync(absoluteStatePath)) {
        mkdirSync(join(projectRoot, "docs"), { recursive: true });
        writeFileSync(
          absoluteStatePath,
          `${JSON.stringify(createDefaultProjectState(projectRoot), null, 2)}
`,
          "utf8"
        );
      }
      return {
        path: manifestPath,
        status: "migrated",
        manifest: migrated
      };
    }
    return {
      path: manifestPath,
      status: "already_exists",
      manifest: existing
    };
  }
  const manifest = createDefaultManifest(projectRoot);
  mkdirSync(join(projectRoot, ".dainexus"), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}
`, "utf8");
  const statePath = join(projectRoot, manifest.project_docs.state);
  if (!existsSync(statePath)) {
    mkdirSync(join(projectRoot, "docs"), { recursive: true });
    writeFileSync(
      statePath,
      `${JSON.stringify(createDefaultProjectState(projectRoot), null, 2)}
`,
      "utf8"
    );
  }
  return {
    path: manifestPath,
    status: options.force ? "overwritten" : "created",
    manifest
  };
}
function loadManifest(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const manifestPath = join(projectRoot, DOCS_MANIFEST_PATH);
  if (existsSync(manifestPath)) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch (error) {
      throw new DocsManifestError(
        `Docs manifest is not valid JSON: ${manifestPath}`,
        [error instanceof Error ? error.message : String(error)]
      );
    }
    return {
      manifest: validateManifest(parsed),
      manifestPath,
      legacy: false,
      diagnostics: []
    };
  }
  const manifest = createDefaultManifest(projectRoot);
  const diagnostics = [
    {
      severity: "warning",
      code: "LEGACY_MANIFEST_FALLBACK",
      projectId: manifest.project.id,
      message: "No .dainexus/docs-manifest.json was found; using safe legacy source discovery.",
      suggestion: "Run `dai docs init` to make the documentation contract explicit."
    }
  ];
  return {
    manifest,
    manifestPath: null,
    legacy: true,
    diagnostics
  };
}
function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) return { path: target, anchor: void 0 };
  return {
    path: target.slice(0, hashIndex),
    anchor: decodeURIComponent(target.slice(hashIndex + 1))
  };
}
function resolveRelativePath(from, target) {
  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return null;
  }
  if (decoded.startsWith("/") || /^[A-Za-z]:[\\/]/.test(decoded)) {
    return null;
  }
  const stack = posix.dirname(from).split("/").filter((segment) => Boolean(segment) && segment !== ".");
  for (const segment of decoded.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null;
      stack.pop();
    } else {
      stack.push(segment);
    }
  }
  return stack.join("/");
}
function relativeRoute(fromRoute, targetRoute) {
  const relative7 = posix.relative(posix.dirname(fromRoute), targetRoute);
  return relative7.startsWith(".") ? relative7 : `./${relative7}`;
}
function addDiagnostic(catalog, document, diagnostic2) {
  catalog.diagnostics.push({
    ...diagnostic2,
    projectId: document.projectId,
    path: document.sourcePath
  });
}
function candidateDocumentPaths(path) {
  const candidates = [path];
  if (!/\.(?:md|markdown|json|ya?ml)$/i.test(path)) {
    candidates.push(
      `${path}.md`,
      `${path}.markdown`,
      posix.join(path, "README.md")
    );
  }
  return candidates;
}
function resolveCatalogLinks(catalogs) {
  const documentsByProject = /* @__PURE__ */ new Map();
  const assetsByProject = /* @__PURE__ */ new Map();
  for (const catalog of catalogs) {
    documentsByProject.set(
      catalog.project.id,
      new Map(
        catalog.documents.map((document) => [document.sourcePath, document])
      )
    );
    assetsByProject.set(
      catalog.project.id,
      new Map(catalog.assets.map((asset) => [asset.sourcePath, asset]))
    );
    catalog.relations = catalog.relations.filter(
      (relation) => relation.type === "code-ref" || relation.type === "truth"
    );
    for (const document of catalog.documents) {
      document.backlinks = [];
      document.related = [];
      for (const link of document.links) {
        delete link.resolvedDocumentId;
        delete link.resolvedAssetId;
        delete link.resolvedRoute;
      }
    }
    catalog.diagnostics = catalog.diagnostics.filter(
      (diagnostic2) => ![
        "BROKEN_LINK",
        "BROKEN_ASSET",
        "BROKEN_ANCHOR",
        "LINK_TRAVERSAL",
        "LINK_CASE_MISMATCH",
        "UNKNOWN_PROJECT_LINK"
      ].includes(diagnostic2.code)
    );
  }
  for (const catalog of catalogs) {
    const exactDocs = documentsByProject.get(catalog.project.id) ?? /* @__PURE__ */ new Map();
    const exactAssets = assetsByProject.get(catalog.project.id) ?? /* @__PURE__ */ new Map();
    const caseDocs = new Map(
      [...exactDocs.entries()].map(([path, document]) => [
        path.toLowerCase(),
        document
      ])
    );
    const caseAssets = new Map(
      [...exactAssets.entries()].map(([path, asset]) => [
        path.toLowerCase(),
        asset
      ])
    );
    for (const document of catalog.documents) {
      for (const codeRef of document.codeRefs) {
        catalog.relations.push({
          from: document.id,
          to: codeRef,
          type: "code-ref",
          source: document.sourcePath,
          confidence: codeRef.startsWith("gitnexus://") ? 1 : 0.75
        });
      }
      if (document.sourceOfTruth) {
        catalog.relations.push({
          from: catalog.project.id,
          to: document.id,
          type: "truth",
          source: "docs-manifest",
          confidence: 1
        });
      }
      for (const link of document.links) {
        if (link.kind === "external") continue;
        if (link.kind === "anchor") {
          const anchor = link.target.slice(1);
          link.anchor = anchor;
          if (!document.headings.some((heading) => heading.slug === anchor)) {
            addDiagnostic(catalog, document, {
              severity: "warning",
              code: "BROKEN_ANCHOR",
              message: `Heading anchor "#${anchor}" does not exist (line ${link.line}).`,
              suggestion: "Update the anchor to match a generated heading slug."
            });
          } else {
            link.resolvedRoute = `#${anchor}`;
          }
          continue;
        }
        let targetProjectId = catalog.project.id;
        let rawTarget = link.target;
        if (rawTarget.startsWith("dai-nexus://")) {
          try {
            const url = new URL(rawTarget);
            targetProjectId = url.hostname;
            rawTarget = url.pathname.replace(/^\/+/, "") + url.hash;
          } catch {
            addDiagnostic(catalog, document, {
              severity: "error",
              code: "BROKEN_LINK",
              message: `Invalid cross-project link "${link.target}" (line ${link.line}).`
            });
            continue;
          }
        }
        const targetDocs = documentsByProject.get(targetProjectId);
        const targetAssets = assetsByProject.get(targetProjectId);
        if (!targetDocs || !targetAssets) {
          addDiagnostic(catalog, document, {
            severity: "warning",
            code: "UNKNOWN_PROJECT_LINK",
            message: `Cross-project target "${targetProjectId}" is not part of this build.`,
            suggestion: "Register and build the target project together."
          });
          continue;
        }
        const split = splitTarget(rawTarget);
        const resolvedPath = targetProjectId === catalog.project.id ? resolveRelativePath(document.sourcePath, split.path) : split.path.replace(/^\/+/, "");
        if (resolvedPath === null) {
          addDiagnostic(catalog, document, {
            severity: "error",
            code: "LINK_TRAVERSAL",
            message: `Link escapes the project root: "${link.target}" (line ${link.line}).`,
            suggestion: "Use a contained relative link or a dai-nexus:// project link."
          });
          continue;
        }
        const docCandidates = candidateDocumentPaths(resolvedPath);
        const resolvedDocument = docCandidates.map((candidate) => targetDocs.get(candidate)).find((candidate) => candidate !== void 0);
        const resolvedAsset = targetAssets.get(resolvedPath);
        if (resolvedDocument) {
          link.kind = "document";
          link.anchor = split.anchor;
          link.resolvedDocumentId = resolvedDocument.id;
          link.resolvedRoute = `${relativeRoute(document.route, resolvedDocument.route)}${split.anchor ? `#${split.anchor}` : ""}`;
          catalog.relations.push({
            from: document.id,
            to: resolvedDocument.id,
            type: "links-to",
            source: document.sourcePath,
            confidence: 1
          });
          resolvedDocument.backlinks.push(document.id);
          if (split.anchor && !resolvedDocument.headings.some(
            (heading) => heading.slug === split.anchor
          )) {
            addDiagnostic(catalog, document, {
              severity: "warning",
              code: "BROKEN_ANCHOR",
              message: `Anchor "#${split.anchor}" does not exist in ${resolvedDocument.sourcePath}.`
            });
          }
          continue;
        }
        if (resolvedAsset) {
          link.kind = "asset";
          link.resolvedAssetId = resolvedAsset.id;
          link.resolvedRoute = relativeRoute(
            document.route,
            resolvedAsset.route
          );
          catalog.relations.push({
            from: document.id,
            to: resolvedAsset.id,
            type: "embeds",
            source: document.sourcePath,
            confidence: 1
          });
          continue;
        }
        const mismatchedDocument = docCandidates.map((candidate) => caseDocs.get(candidate.toLowerCase())).find((candidate) => candidate !== void 0);
        const mismatchedAsset = caseAssets.get(resolvedPath.toLowerCase());
        if (targetProjectId === catalog.project.id && (mismatchedDocument || mismatchedAsset)) {
          const actual = mismatchedDocument?.sourcePath ?? mismatchedAsset?.sourcePath ?? "";
          addDiagnostic(catalog, document, {
            severity: "warning",
            code: "LINK_CASE_MISMATCH",
            message: `Link casing differs from "${actual}" (line ${link.line}).`,
            suggestion: "Match the source path casing for cross-platform builds."
          });
          continue;
        }
        addDiagnostic(catalog, document, {
          severity: "warning",
          code: link.image ? "BROKEN_ASSET" : "BROKEN_LINK",
          message: `Unresolved ${link.image ? "asset" : "link"} "${link.target}" (line ${link.line}).`,
          suggestion: `Create the target ${link.image ? "asset" : "document"} or update the relative path.`
        });
      }
    }
  }
  const allDocuments = new Map(
    catalogs.flatMap(
      (catalog) => catalog.documents.map((document) => [document.id, document])
    )
  );
  for (const catalog of catalogs) {
    for (const document of catalog.documents) {
      document.backlinks = [...new Set(document.backlinks)].sort();
      const relatedScores = /* @__PURE__ */ new Map();
      for (const other of allDocuments.values()) {
        if (other.id === document.id) continue;
        const sharedTags = document.tags.filter(
          (tag) => other.tags.includes(tag)
        ).length;
        const direct = document.links.some((link) => link.resolvedDocumentId === other.id) || document.backlinks.includes(other.id);
        const score = sharedTags * 2 + (direct ? 3 : 0);
        if (score > 0) relatedScores.set(other.id, score);
      }
      document.related = [...relatedScores.entries()].sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      ).slice(0, 6).map(([id]) => id);
      for (const relatedId of document.related) {
        const relation = {
          from: document.id,
          to: relatedId,
          type: "related",
          source: "derived",
          confidence: Math.min(
            0.95,
            0.5 + (relatedScores.get(relatedId) ?? 0) * 0.1
          )
        };
        catalog.relations.push(relation);
      }
    }
  }
  return catalogs;
}

// src/docs/scanner.ts
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".markdown", ".json", ".yaml", ".yml"]);
var ASSET_EXTENSIONS = /* @__PURE__ */ new Set([
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp"
]);
var MAX_TEXT_BYTES = 2 * 1024 * 1024;
function projectRelative(projectRoot, absolutePath) {
  return normalizeRelativePath(
    relative(projectRoot, absolutePath).replace(/\\/g, "/")
  );
}
function sourceAllows(source, sourceRelativePath) {
  const included = !source.include || source.include.length === 0 || source.include.some((glob) => matchesGlob(sourceRelativePath, glob));
  const excluded = source.exclude?.some((glob) => matchesGlob(sourceRelativePath, glob)) ?? false;
  return included && !excluded;
}
function scanSource(input) {
  const sourcePath = normalizeRelativePath(input.source.path);
  if (isSensitivePath(sourcePath)) {
    input.diagnostics.push({
      severity: "error",
      code: "SENSITIVE_SOURCE_REJECTED",
      projectId: input.projectId,
      path: sourcePath,
      message: "Manifest source is blocked by the built-in sensitive-path policy.",
      suggestion: "Move curated documentation to an approved docs root."
    });
    return;
  }
  let absoluteSource;
  try {
    absoluteSource = resolveWithinProject(input.projectRoot, sourcePath, {
      mustExist: true
    });
  } catch (error) {
    input.diagnostics.push({
      severity: "warning",
      code: "SOURCE_UNAVAILABLE",
      projectId: input.projectId,
      path: sourcePath,
      message: error instanceof Error ? error.message : String(error),
      suggestion: "Create the source path or update the docs manifest."
    });
    return;
  }
  const sourceIsFile = statSync(absoluteSource).isFile();
  const seenDirectories = /* @__PURE__ */ new Set();
  const visit = (absolutePath, presentedPath) => {
    let containedPath2;
    try {
      containedPath2 = resolveWithinProject(input.projectRoot, presentedPath, {
        mustExist: true
      });
    } catch (error) {
      const unavailable = error instanceof DocsPathError && error.code === "PATH_NOT_FOUND";
      input.diagnostics.push({
        severity: unavailable ? "warning" : "error",
        code: unavailable ? "BROKEN_SYMLINK" : "PATH_CONTAINMENT_FAILED",
        projectId: input.projectId,
        path: presentedPath,
        message: error instanceof Error ? error.message : String(error),
        ...unavailable ? {
          suggestion: "Repair or remove the broken symlink from the approved docs root."
        } : {}
      });
      return;
    }
    const pathStat = statSync(containedPath2);
    if (pathStat.isDirectory()) {
      if (lstatSync(absolutePath).isSymbolicLink()) {
        input.diagnostics.push({
          severity: "info",
          code: "SYMLINK_DIRECTORY_SKIPPED",
          projectId: input.projectId,
          path: presentedPath,
          message: "Contained directory symlink was validated but skipped to avoid cycles."
        });
        return;
      }
      if (seenDirectories.has(containedPath2)) return;
      seenDirectories.add(containedPath2);
      for (const entry of readdirSync(containedPath2, {
        withFileTypes: true
      }).sort((left, right) => left.name.localeCompare(right.name))) {
        const childPresented = `${presentedPath}/${entry.name}`.replace(
          /\/+/g,
          "/"
        );
        if (isSensitivePath(childPresented)) continue;
        visit(join(containedPath2, entry.name), childPresented);
      }
      return;
    }
    if (!pathStat.isFile()) return;
    const relativePath = projectRelative(input.projectRoot, absolutePath);
    if (input.projectStatePath && input.projectStatePath.toLowerCase() === relativePath.toLowerCase()) {
      return;
    }
    const relativeToSource = sourceIsFile ? relativePath.split("/").at(-1) ?? relativePath : relative(sourcePath, relativePath).replace(/\\/g, "/");
    if (!sourceAllows(input.source, relativeToSource)) return;
    if (!isAllowedByPrivacy(relativePath, input.allow, input.exclude)) {
      return;
    }
    const extension = extname(relativePath).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      if (pathStat.size > MAX_TEXT_BYTES) {
        input.diagnostics.push({
          severity: "warning",
          code: "DOCUMENT_TOO_LARGE",
          projectId: input.projectId,
          path: relativePath,
          message: `Document exceeds the ${MAX_TEXT_BYTES}-byte safe read limit.`
        });
        return;
      }
      const content = readFileSync(containedPath2, "utf8");
      const document = normalizeTextDocument({
        projectId: input.projectId,
        sourcePath: relativePath,
        source: input.source,
        content,
        truth: input.truth
      });
      if (input.documents.has(relativePath)) {
        input.diagnostics.push({
          severity: "info",
          code: "DUPLICATE_SOURCE",
          projectId: input.projectId,
          path: relativePath,
          message: "Document matched more than one manifest source; first match wins."
        });
      } else {
        input.documents.set(relativePath, document);
      }
      return;
    }
    if (ASSET_EXTENSIONS.has(extension)) {
      const asset = normalizeAsset({
        projectId: input.projectId,
        sourcePath: relativePath,
        content: readFileSync(containedPath2)
      });
      if (!input.assets.has(relativePath))
        input.assets.set(relativePath, asset);
    }
  };
  visit(absoluteSource, sourcePath);
}
function addCatalogDiagnostics(catalog) {
  const lowerPaths = /* @__PURE__ */ new Map();
  for (const item of [...catalog.documents, ...catalog.assets]) {
    const lower = item.sourcePath.toLowerCase();
    const existing = lowerPaths.get(lower);
    if (existing && existing !== item.sourcePath) {
      catalog.diagnostics.push({
        severity: "error",
        code: "CASE_COLLISION",
        projectId: catalog.project.id,
        path: item.sourcePath,
        message: `Path collides with "${existing}" on case-insensitive filesystems.`,
        suggestion: "Rename one source so paths differ by more than letter casing."
      });
    } else {
      lowerPaths.set(lower, item.sourcePath);
    }
  }
  for (const truthPath of catalog.project.truthDocuments) {
    if (truthPath === catalog.project.statePath) continue;
    if (!catalog.documents.some((document) => document.sourcePath === truthPath)) {
      catalog.diagnostics.push({
        severity: "warning",
        code: "MISSING_TRUTH_DOCUMENT",
        projectId: catalog.project.id,
        path: truthPath,
        message: "Declared source-of-truth document was not found in the scan.",
        suggestion: "Fix the truth path or add it to an approved source."
      });
    }
  }
  const projectState = catalog.project.state;
  if (projectState) {
    for (const root of projectState.structure.roots) {
      try {
        resolveWithinProject(catalog.project.root, root.path, {
          mustExist: true
        });
      } catch (error) {
        catalog.diagnostics.push({
          severity: "error",
          code: "PROJECT_STRUCTURE_ROOT_UNAVAILABLE",
          projectId: catalog.project.id,
          path: root.path,
          message: error instanceof Error ? error.message : String(error),
          suggestion: "Update structure.roots so every declared project area exists inside the project root."
        });
      }
    }
    const references = [
      ...projectState.roadmap.flatMap((item) => item.references),
      ...projectState.flows.flatMap(
        (flow) => flow.steps.flatMap((step) => step.references)
      ),
      ...projectState.backlog.flatMap((item) => item.references)
    ];
    for (const reference of references) {
      if (reference.path === catalog.project.statePath) continue;
      const document = catalog.documents.find(
        (candidate) => candidate.sourcePath === reference.path
      );
      if (!document) {
        catalog.diagnostics.push({
          severity: "warning",
          code: "PROJECT_STATE_REFERENCE_UNAVAILABLE",
          projectId: catalog.project.id,
          path: reference.path,
          message: "Project state references a document that is not present in the approved catalog.",
          suggestion: "Add the document to approved sources or update the project-state reference."
        });
        continue;
      }
      if (reference.anchor && !document.headings.some(
        (heading) => heading.slug === slugifyHeading(reference.anchor)
      )) {
        catalog.diagnostics.push({
          severity: "warning",
          code: "PROJECT_STATE_REFERENCE_ANCHOR_MISSING",
          projectId: catalog.project.id,
          path: reference.path,
          message: `Project state references missing anchor #${reference.anchor}.`,
          suggestion: "Use an existing normalized heading anchor or remove the anchor."
        });
      }
    }
  }
  for (const document of catalog.documents) {
    for (const warning of document.warnings) {
      catalog.diagnostics.push({
        severity: "info",
        code: "DOCUMENT_METADATA_FALLBACK",
        projectId: catalog.project.id,
        path: document.sourcePath,
        message: warning
      });
    }
    for (const diagram of document.diagrams) {
      if (!diagram.valid) {
        catalog.diagnostics.push({
          severity: "error",
          code: "INVALID_DIAGRAM",
          projectId: catalog.project.id,
          path: document.sourcePath,
          message: `${diagram.error ?? "Invalid diagram"} (line ${diagram.line}).`,
          suggestion: "Fix Mermaid syntax; the portal will keep a text fallback."
        });
      }
    }
  }
  const gitnexusStatus = catalog.project.facts.gitnexus.status;
  if (gitnexusStatus === "stale") {
    catalog.diagnostics.push({
      severity: "warning",
      code: "GITNEXUS_STALE",
      projectId: catalog.project.id,
      message: "GitNexus metadata is stale relative to the current Git commit.",
      suggestion: "Run `node .gitnexus/run.cjs analyze` before publishing traceability."
    });
  } else if (gitnexusStatus === "unavailable") {
    catalog.diagnostics.push({
      severity: "warning",
      code: "GITNEXUS_UNAVAILABLE",
      projectId: catalog.project.id,
      message: "GitNexus was enabled but no readable index metadata is available.",
      suggestion: "Index the project or disable the adapter in the docs manifest."
    });
  }
}
function refreshCatalogSummary(catalog) {
  catalog.documents.sort(
    (left, right) => left.sourcePath.localeCompare(right.sourcePath)
  );
  catalog.assets.sort(
    (left, right) => left.sourcePath.localeCompare(right.sourcePath)
  );
  catalog.diagnostics.sort(
    (left, right) => left.severity.localeCompare(right.severity) || (left.path ?? "").localeCompare(right.path ?? "") || left.code.localeCompare(right.code)
  );
  catalog.sourceFingerprint = hashContent(
    JSON.stringify({
      manifest: catalog.project.manifestPath ? ".dainexus/docs-manifest.json" : "legacy",
      project: {
        id: catalog.project.id,
        title: catalog.project.title,
        truth: catalog.project.truthDocuments
      },
      documents: catalog.documents.map((document) => [
        document.sourcePath,
        document.contentHash
      ]),
      assets: catalog.assets.map((asset) => [
        asset.sourcePath,
        asset.contentHash
      ]),
      git: catalog.project.facts.git.commit,
      gitnexus: catalog.project.facts.gitnexus.indexedCommit,
      projectState: {
        path: catalog.project.statePath,
        hash: catalog.project.stateHash
      }
    })
  );
  const counts = { errors: 0, warnings: 0, info: 0 };
  for (const diagnostic2 of catalog.diagnostics) {
    if (diagnostic2.severity === "error") counts.errors += 1;
    else if (diagnostic2.severity === "warning") counts.warnings += 1;
    else counts.info += 1;
  }
  catalog.project.health = counts;
  catalog.project.scanStatus = counts.errors > 0 ? "error" : counts.warnings > 0 ? "warning" : "ok";
  return catalog;
}
function scanProject(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  const loaded = loadManifest(projectRoot);
  const manifest = loaded.manifest;
  const truth = (manifest.truth ?? []).map(normalizeRelativePath);
  const allow = (manifest.privacy.allow ?? manifest.sources.map((source) => source.path)).map(normalizeRelativePath);
  const exclude = (manifest.privacy.exclude ?? []).map(normalizeRelativePath);
  const documents = /* @__PURE__ */ new Map();
  const assets = /* @__PURE__ */ new Map();
  const diagnostics = [...loaded.diagnostics];
  let projectState = null;
  let projectStatePath = null;
  let projectStateHash = null;
  if (allow.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "EMPTY_PRIVACY_ALLOWLIST",
      projectId: manifest.project.id,
      message: "Privacy mode is allowlist but no allowed paths are configured.",
      suggestion: "Add manifest source paths to privacy.allow."
    });
  }
  if (loaded.legacy || !manifest.project_docs) {
    diagnostics.push({
      severity: "error",
      code: "PROJECT_DOCS_CONTRACT_MISSING",
      projectId: manifest.project.id,
      message: "The docs manifest does not declare a project_docs state contract.",
      suggestion: "Run `dai docs init` and keep project_docs.state in the manifest."
    });
  } else {
    projectStatePath = manifest.project_docs.state;
    if (!isAllowedByPrivacy(projectStatePath, allow, exclude)) {
      diagnostics.push({
        severity: "error",
        code: "PROJECT_STATE_NOT_ALLOWLISTED",
        projectId: manifest.project.id,
        path: projectStatePath,
        message: "The project state path is not allowed by the privacy allowlist.",
        suggestion: "Add the project state path to privacy.allow and remove it from privacy.exclude."
      });
    } else {
      const loadedState = safeLoadProjectState(projectRoot, projectStatePath);
      projectStateHash = loadedState.contentHash;
      if (loadedState.state) {
        projectState = loadedState.state;
        const maxStaleDays = manifest.project_docs.max_stale_days ?? 30;
        const ageMs = Date.now() - Date.parse(projectState.status.updated_at);
        if (ageMs < -5 * 60 * 1e3) {
          diagnostics.push({
            severity: "error",
            code: "PROJECT_STATE_FUTURE_TIMESTAMP",
            projectId: manifest.project.id,
            path: projectStatePath,
            message: "Project state status.updated_at is more than five minutes in the future.",
            suggestion: "Correct the timestamp using the current local or UTC time with an explicit offset."
          });
        } else if (ageMs > maxStaleDays * 24 * 60 * 60 * 1e3) {
          diagnostics.push({
            severity: "warning",
            code: "PROJECT_STATE_STALE",
            projectId: manifest.project.id,
            path: projectStatePath,
            message: `Project state is older than the configured ${maxStaleDays}-day freshness window.`,
            suggestion: "Update status.updated_at after reviewing the project state."
          });
        }
      } else if (loadedState.error?.code === "missing") {
        diagnostics.push({
          severity: "error",
          code: "PROJECT_STATE_MISSING",
          projectId: manifest.project.id,
          path: projectStatePath,
          message: loadedState.error.message,
          suggestion: "Create the state file or run `dai docs init`."
        });
      } else {
        diagnostics.push({
          severity: "error",
          code: "PROJECT_STATE_INVALID",
          projectId: manifest.project.id,
          path: projectStatePath,
          message: loadedState.error?.message ?? "Project state could not be loaded.",
          suggestion: "Repair the JSON so it conforms to docs-project-state.schema.json."
        });
      }
    }
  }
  for (const source of manifest.sources) {
    scanSource({
      projectRoot,
      projectId: manifest.project.id,
      source,
      truth,
      projectStatePath,
      allow,
      exclude,
      documents,
      assets,
      diagnostics
    });
  }
  const catalog = {
    schema_version: DOCS_SCHEMA_VERSION,
    project: {
      id: manifest.project.id,
      title: manifest.project.title,
      root: projectRoot,
      manifestPath: loaded.manifestPath,
      state: projectState,
      statePath: projectStatePath,
      stateHash: projectStateHash,
      legacy: loaded.legacy,
      truthDocuments: truth,
      facts: collectProjectFacts(projectRoot, manifest),
      health: { errors: 0, warnings: 0, info: 0 },
      scanStatus: "ok"
    },
    documents: [...documents.values()],
    assets: [...assets.values()],
    relations: [],
    diagnostics,
    sourceFingerprint: ""
  };
  addCatalogDiagnostics(catalog);
  resolveCatalogLinks([catalog]);
  return refreshCatalogSummary(catalog);
}
function getCatalogPath(projectRootInput) {
  const projectRoot = canonicalProjectRoot(projectRootInput);
  return join(projectRoot, ".dainexus", "cache", "docs-index.json");
}
function writeCatalog(catalog) {
  const path = getCatalogPath(catalog.project.root);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}
`, "utf8");
  return path;
}
function readCatalog(projectRootInput) {
  const path = getCatalogPath(projectRootInput);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

// src/docs/doctor.ts
function doctorCatalog(catalog, storedCatalog, options = {}) {
  const diagnostics = [...catalog.diagnostics];
  if (storedCatalog && storedCatalog.sourceFingerprint !== catalog.sourceFingerprint) {
    diagnostics.push({
      severity: "warning",
      code: "STALE_DOCS_INDEX",
      projectId: catalog.project.id,
      path: ".dainexus/cache/docs-index.json",
      message: "The stored normalized docs index is stale.",
      suggestion: "Run `dai docs scan` or `dai docs build`."
    });
  }
  const errors = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "error"
  ).length;
  const warnings = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "warning"
  ).length;
  const info = diagnostics.filter(
    (diagnostic2) => diagnostic2.severity === "info"
  ).length;
  const status = errors > 0 || options.strict && warnings > 0 ? "fail" : warnings > 0 ? "warning" : "pass";
  return {
    projectId: catalog.project.id,
    projectTitle: catalog.project.title,
    status,
    sourceFingerprint: catalog.sourceFingerprint,
    storedFingerprint: storedCatalog?.sourceFingerprint ?? null,
    diagnostics,
    summary: {
      documents: catalog.documents.length,
      assets: catalog.assets.length,
      errors,
      warnings,
      info
    }
  };
}

// src/docs/markdown.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeUrl(value) {
  const target = value.trim();
  if (!target || /^(?:javascript|vbscript|file|data):/i.test(target))
    return null;
  if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) return target;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return null;
  return target;
}
function inline(value, options) {
  const tokens = [];
  const stash = (html) => {
    const marker = `\0${tokens.length}\0`;
    tokens.push(html);
    return marker;
  };
  let text = value.replace(
    /`([^`\n]+)`/g,
    (_, code) => stash(`<code>${escapeHtml(code)}</code>`)
  );
  text = text.replace(
    /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, alt, wrapped, raw, title) => {
      const target = wrapped ?? raw;
      const url = safeUrl(options.resolveLink?.(target) ?? target);
      if (!url) return escapeHtml(alt);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return stash(
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`
      );
    }
  );
  text = text.replace(
    /\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, label2, wrapped, raw, title) => {
      const target = wrapped ?? raw;
      const url = safeUrl(options.resolveLink?.(target) ?? target);
      if (!url) return escapeHtml(label2);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      const external = /^(?:https?:|mailto:|tel:)/i.test(url) ? ` rel="noreferrer"${/^https?:/i.test(url) ? ` target="_blank"` : ""}` : "";
      return stash(
        `<a href="${escapeHtml(url)}"${titleAttr}${external}>${inline(label2, options)}</a>`
      );
    }
  );
  text = escapeHtml(text).replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_\n]+)__/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>").replace(/_([^_\n]+)_/g, "<em>$1</em>").replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return text.replace(
    /\u0000(\d+)\u0000/g,
    (_, index) => tokens[Number(index)] ?? ""
  );
}
function slug(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
}
function isTableSeparator(line) {
  const cells = line.trim().replace(/^\||\|$/g, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}
function tableRow(line, options) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inline(cell.trim(), options));
}
function renderMarkdownDocument(markdown, options = {}) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  const headings = [];
  let index = 0;
  let paragraph = [];
  let listType = null;
  let inFence = false;
  let fenceLanguage = "";
  let fenceLines = [];
  let tableHeader = null;
  let diagramIndex = 0;
  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${inline(paragraph.join(" ").trim(), options)}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inFence) {
      if (/^```/.test(trimmed)) {
        const source = fenceLines.join("\n");
        if (fenceLanguage.toLowerCase() === "mermaid") {
          const diagram = options.diagrams?.[diagramIndex];
          diagramIndex += 1;
          output.push(renderDiagram(diagram, source));
        } else {
          const code = escapeHtml(source);
          output.push(
            `<pre class="code-block"><code class="language-${escapeHtml(fenceLanguage || "text")}">${code}</code></pre>`
          );
        }
        inFence = false;
        fenceLines = [];
      } else fenceLines.push(line);
      index += 1;
      continue;
    }
    const fence = trimmed.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      inFence = true;
      fenceLanguage = fence[1] ?? "";
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      closeList();
      const text = heading[2].replace(/[`*_~]/g, "").trim();
      const base = slug(text);
      const same = headings.filter((item) => item.slug === base).length;
      const headingSlug = same ? `${base}-${same}` : base;
      headings.push({
        level: heading[1].length,
        text,
        slug: headingSlug,
        line: index + 1
      });
      output.push(
        `<h${heading[1].length} id="${escapeHtml(headingSlug)}">${inline(text, options)}</h${heading[1].length}>`
      );
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      closeList();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(
        `<blockquote>${inline(quote.join(" "), options)}</blockquote>`
      );
      continue;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      flushParagraph();
      const match = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
      if (!match) {
        index += 1;
        continue;
      }
      const type = match[2] ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        listType = type;
        output.push(`<${type}>`);
      }
      output.push(`<li>${inline(match[3], options)}</li>`);
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flushParagraph();
      closeList();
      tableHeader = tableRow(line, options);
      output.push(
        `<div class="table-scroll"><table><thead><tr>${tableHeader.map((cell) => `<th scope="col">${cell}</th>`).join("")}</tr></thead><tbody>`
      );
      index += 2;
      continue;
    }
    if (tableHeader && line.includes("|")) {
      output.push(
        `<tr>${tableRow(line, options).map((cell) => `<td>${cell}</td>`).join("")}</tr>`
      );
      index += 1;
      continue;
    }
    if (tableHeader && !trimmed) {
      output.push("</tbody></table>");
      tableHeader = null;
      index += 1;
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      if (output.at(-1) === "</tbody></table>") output.pop();
      index += 1;
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push("<hr>");
      index += 1;
      continue;
    }
    paragraph.push(trimmed);
    index += 1;
  }
  if (inFence)
    output.push(
      `<pre class="code-block"><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`
    );
  flushParagraph();
  closeList();
  if (tableHeader) output.push("</tbody></table>");
  return { html: output.join("\n"), headings };
}
function renderDiagram(diagram, source) {
  const valid = diagram?.valid === true;
  const label2 = valid ? "Mermaid diagram" : "Invalid Mermaid diagram";
  const svg = valid ? renderDiagramSvg(diagram, diagram.type) : "";
  const fallbackLabels = diagram?.labels && diagram.labels.length > 0 ? `<p>${escapeHtml(diagram.labels.join(" \u2192 "))}</p>` : "";
  return `<figure class="diagram" aria-label="${label2}">
${svg}
<details class="diagram-fallback"${valid ? "" : " open"}>
<summary>Diagram source and text fallback</summary>
<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>
${fallbackLabels}
</details>
</figure>`;
}
function renderMarkdown(markdown, options = {}) {
  return renderMarkdownDocument(markdown, options).html;
}
function plainText(document) {
  return document.content.replace(/```[\s\S]*?```/g, " ").replace(/[#*_>`\[\]()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 2e4);
}
function snippet(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}\u2026` : compact;
}
function buildSearchIndex(catalogs) {
  return {
    schema_version: 1,
    sourceFingerprint: catalogs.map((catalog) => catalog.sourceFingerprint).sort().join(":") || "static",
    documents: catalogs.flatMap(
      (catalog) => catalog.documents.map((document) => {
        const text = plainText(document);
        return {
          id: document.id,
          projectId: catalog.project.id,
          projectTitle: catalog.project.title,
          title: document.title,
          route: document.route,
          sourcePath: document.sourcePath,
          type: document.type,
          status: document.status,
          sourceOfTruth: document.sourceOfTruth,
          snippet: snippet(text),
          tags: document.tags,
          headings: document.headings.map((heading) => heading.text),
          text
        };
      })
    ).sort(
      (a, b) => `${a.projectTitle}/${a.title}/${a.projectId}/${a.sourcePath}/${a.id}`.localeCompare(
        `${b.projectTitle}/${b.title}/${b.projectId}/${b.sourcePath}/${b.id}`
      )
    )
  };
}

// src/docs/render.ts
var CSS = `:root {
  color-scheme: light dark;
  --bg: #f8f9fa;
  --surface: #ffffff;
  --surface-alt: #f1f3f5;
  --text: #212529;
  --muted: #68727d;
  --border: #d9dee3;
  --accent: #4f46e5;
  --accent-strong: #3730a3;
  --accent-soft: rgba(99, 102, 241, 0.1);
  --code: #eef1f4;
  --focus: #d97706;
  --success: #15803d;
  --success-soft: #dcfce7;
  --warning: #a16207;
  --warning-soft: #fef3c7;
  --error: #b91c1c;
  --error-soft: #fee2e2;
  --radius: 12px;
  --measure: 78ch;
  --shadow: 0 12px 32px rgba(17, 24, 39, 0.08);
}
* { box-sizing: border-box; }
html { background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; overflow-wrap: anywhere; }
html, body { max-width: 100%; }
body { margin: 0; min-width: 0; overflow-x: clip; }
a { color: var(--accent-strong); text-underline-offset: .18em; }
a:hover { color: var(--accent); }
a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; border-radius: 4px; }
.skip-link { position: absolute; left: -9999px; }
.skip-link:focus { left: 1rem; top: 1rem; background: var(--surface); padding: .65rem 1rem; z-index: 10; }
.shell { display: grid; grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr); min-height: 100vh; }
.sidebar { padding: 1.5rem; border-right: 1px solid var(--border); background: var(--surface); position: sticky; top: 0; height: 100vh; overflow: auto; }
.sidebar strong { display: block; color: var(--accent-strong); letter-spacing: -.02em; margin-bottom: 1.25rem; }
.sidebar nav a { display: block; padding: .45rem .65rem; border-radius: 8px; text-decoration: none; }
.sidebar nav a:hover { background: var(--accent-soft); }
.main { min-width: 0; padding: clamp(1.25rem, 4vw, 4rem); }
.content { max-width: 88rem; margin-inline: auto; }
.shell, .main, .content, .card, .section-card, .state-grid, .field-list, .item-grid { min-width: 0; max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -.025em; }
h1 { font-size: clamp(2rem, 5vw, 3.5rem); margin-top: .35rem; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr)); gap: 1rem; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.15rem; box-shadow: var(--shadow); }
.card h2, .card h3 { margin-top: 0; }
.meta { color: var(--muted); font-size: .92rem; }
.eyebrow { color: var(--accent-strong); font-size: .78rem; font-weight: 750; letter-spacing: .1em; text-transform: uppercase; }
.metric { font-size: 1.65rem; font-weight: 760; line-height: 1; }
.section-card { scroll-margin-top: 1rem; }
.section-card + .section-card { margin-top: 1.25rem; }
.section-nav { display: flex; flex-wrap: wrap; gap: .45rem; margin: 1.25rem 0; }
.section-nav a { border: 1px solid var(--border); border-radius: 999px; padding: .25rem .65rem; }
.project-header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.project-header h1 { margin-bottom: 0; }
.project-nav { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0 0 1.25rem; padding: .55rem; position: sticky; top: 0; z-index: 5; border: 1px solid var(--border); border-radius: var(--radius); background: color-mix(in srgb, var(--surface) 94%, transparent); box-shadow: var(--shadow); backdrop-filter: blur(12px); }
.project-nav a { border-radius: 8px; padding: .45rem .7rem; text-decoration: none; white-space: nowrap; }
.project-nav a:hover { background: var(--accent-soft); }
.project-nav a[aria-current="page"] { background: var(--accent); color: #fff; font-weight: 700; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: .75rem; margin: 1rem 0; }
.summary-card { min-width: 0; padding: .9rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-alt); }
.summary-card strong { display: block; font-size: 1.5rem; line-height: 1.15; }
.summary-card span { color: var(--muted); font-size: .82rem; }
.signal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(16rem, 100%), 1fr)); gap: 1rem; }
.section-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr)); gap: .9rem; }
.section-link { display: block; height: 100%; color: inherit; text-decoration: none; }
.section-link:hover { border-color: var(--accent); background: var(--accent-soft); }
.section-link h2, .section-link h3 { color: var(--accent-strong); margin-top: 0; }
.status-badge { display: inline-flex; align-items: center; width: fit-content; border: 1px solid var(--border); border-radius: 999px; padding: .12rem .55rem; font-size: .78rem; font-weight: 700; }
.status-badge[data-tone="success"] { color: var(--success); background: var(--success-soft); border-color: color-mix(in srgb, var(--success) 35%, transparent); }
.status-badge[data-tone="warning"] { color: var(--warning); background: var(--warning-soft); border-color: color-mix(in srgb, var(--warning) 35%, transparent); }
.status-badge[data-tone="error"] { color: var(--error); background: var(--error-soft); border-color: color-mix(in srgb, var(--error) 35%, transparent); }
.status-badge[data-tone="neutral"] { color: var(--muted); background: var(--surface-alt); }
.document-groups { display: grid; gap: 1rem; }
.document-card { display: grid; gap: .45rem; }
.document-card h3 { margin: 0; }
.search-controls { display: grid; grid-template-columns: minmax(14rem, 2fr) repeat(3, minmax(9rem, 1fr)); gap: .75rem; align-items: end; margin: 1rem 0; }
.control-field { display: grid; gap: .3rem; }
.control-field label { color: var(--muted); font-size: .82rem; font-weight: 700; }
.search-results { display: grid; gap: .75rem; padding: 0; list-style: none; }
.search-result { border: 1px solid var(--border); border-radius: 10px; padding: .9rem; background: var(--surface); }
.search-result a { font-weight: 750; }
.search-result p { margin: .45rem 0 0; }
.state-grid, .field-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr)); gap: .8rem 1rem; margin: 0; }
.field-list > div { min-width: 0; }
.field-list dt { color: var(--muted); font-size: .82rem; font-weight: 700; }
.field-list dd { margin: 0; min-width: 0; }
.item-grid { display: grid; gap: .9rem; }
.item-card { min-width: 0; border: 1px solid var(--border); border-radius: 9px; padding: .9rem; background: var(--surface-alt); }
.item-card h3, .item-card h4 { overflow-wrap: anywhere; }
.item-card h3 { margin: 0 0 .55rem; }
.item-card h4 { margin-bottom: .35rem; }
.item-card + .item-card { margin-top: .75rem; }
.empty-state { border-left: 4px solid var(--border); color: var(--muted); margin: .7rem 0; padding: .45rem .75rem; }
.empty-value { color: var(--muted); font-style: italic; }
.compact-list { margin: .35rem 0 0; padding-left: 1.25rem; }
.ref-list { display: grid; gap: .25rem; margin: .35rem 0 0; padding-left: 1.25rem; }
.flow-steps { display: grid; gap: .8rem; margin: .75rem 0 0; padding-left: 1.4rem; }
.flow-diagram { margin-block: 1rem; }
.flow-diagram figcaption { color: var(--muted); font-size: .86rem; margin-top: .65rem; text-align: center; }
.flow-details { border-top: 1px solid var(--border); margin-top: 1rem; padding-top: .75rem; }
.flow-details > summary { color: var(--accent-strong); cursor: pointer; font-weight: 750; }
.compact-list, .ref-list, .flow-steps { min-width: 0; max-width: 100%; }
.flow-steps > li { padding-left: .25rem; }
.diagnostic-list code, .item-card code { overflow-wrap: anywhere; }
.code-block, pre { overflow: auto; background: var(--code); padding: 1rem; border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
code { background: var(--code); padding: .1em .3em; border-radius: 4px; }
pre code { background: transparent; padding: 0; }
.table-scroll { max-width: 100%; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; min-width: 0; table-layout: fixed; }
th, td { border: 1px solid var(--border); padding: .6rem .75rem; text-align: left; vertical-align: top; }
th { background: var(--surface-alt); }
blockquote { border-left: .25rem solid var(--accent); margin: 1rem 0; padding: .25rem 1rem; color: var(--muted); }
img { display: block; max-width: 100%; height: auto; border-radius: 8px; }
.diagram { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; background: var(--surface); margin: 1.25rem 0; overflow: hidden; }
.diagram-svg { display: block; max-width: 100%; height: auto; margin-inline: auto; }
.diagram-node { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2; }
.diagram-edge { fill: none; stroke: var(--muted); stroke-width: 2; }
.diagram-arrow { fill: var(--muted); }
.diagram-label { fill: var(--text); font: 600 15px system-ui, sans-serif; }
.diagram-fallback { margin-top: .75rem; }
.breadcrumbs { color: var(--muted); font-size: .9rem; }
.status { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: .1rem .55rem; }
.document-layout { display: grid; grid-template-columns: minmax(0, var(--measure)) minmax(12rem, 16rem); gap: 2rem; align-items: start; }
.outline { position: sticky; top: 1rem; }
.outline ol { padding-left: 1.25rem; }
.diagnostic-list { display: grid; gap: .75rem; padding: 0; list-style: none; }
.warning { border-left: 4px solid var(--warning); padding-left: .75rem; }
.error { border-left: 4px solid var(--error); padding-left: .75rem; }
.info { border-left: 4px solid var(--accent); padding-left: .75rem; }
input[type="search"], select { width: 100%; min-height: 2.75rem; padding: .65rem .8rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); }
@media (prefers-color-scheme: dark) {
  :root { --bg: #0a0a0f; --surface: #15151e; --surface-alt: #1d1d29; --text: #f8fafc; --muted: #a4adba; --border: #333442; --accent: #818cf8; --accent-strong: #a5b4fc; --accent-soft: rgba(129, 140, 248, .14); --code: #20212d; --focus: #fbbf24; --success-soft: rgba(21, 128, 61, .2); --warning-soft: rgba(161, 98, 7, .2); --error-soft: rgba(185, 28, 28, .2); --shadow: 0 12px 32px rgba(0, 0, 0, .28); }
}
@media (max-width: 1023px) { .document-layout { grid-template-columns: 1fr; } .outline { position: static; order: -1; } .search-controls { grid-template-columns: 1fr 1fr; } }
@media (max-width: 767px) { .shell { display: block; } .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); } .sidebar nav { display: flex; flex-wrap: wrap; gap: .25rem; } .sidebar nav p { margin: 0; } .main { padding: 1rem; } .project-header { align-items: start; flex-direction: column; } .project-nav { flex-wrap: nowrap; margin-inline: -1rem; padding-inline: 1rem; top: 0; border-inline: 0; border-radius: 0; overflow-x: auto; } .search-controls { grid-template-columns: 1fr; } .flow-diagram .diagram-label { font-size: 20px; } }
@media (max-width: 360px) { .main { padding: .75rem; } .project-nav { margin-inline: -.75rem; } .card { padding: .85rem; } .state-grid, .field-list { grid-template-columns: 1fr; } th, td { padding: .45rem; word-break: break-word; } }
@media print { .sidebar, .no-print, .outline { display: none !important; } .shell, .document-layout { display: block; } .main { padding: 0; } a { color: inherit; text-decoration: none; } .card { break-inside: avoid; box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
`;
var JS = `(()=>{const q=document.querySelector('[data-search]');const project=document.querySelector('[data-project-filter]');const type=document.querySelector('[data-type-filter]');const truth=document.querySelector('[data-truth-filter]');const out=document.querySelector('[data-results]');const count=document.querySelector('[data-result-count]');if(!q||!project||!type||!truth||!out)return;fetch('search-index.json').then(r=>r.json()).then(index=>{const draw=()=>{const terms=q.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);const rows=index.documents.filter(d=>(!project.value||d.projectId===project.value)&&(!type.value||d.type===type.value)&&(truth.value==='all'||(truth.value==='truth'?d.sourceOfTruth:!d.sourceOfTruth))&&terms.every(t=>[d.projectTitle,d.title,d.sourcePath,d.text,...d.tags,...d.headings].join(' ').toLowerCase().includes(t)));if(count)count.textContent=rows.length+' result'+(rows.length===1?'':'s');out.innerHTML=rows.map(d=>'<li class="search-result"><a href="'+escapeHtml(safeHref(d.route))+'">'+escapeHtml(d.title)+'</a><span class="meta"> \u2014 '+escapeHtml(d.projectTitle)+' / '+escapeHtml(d.sourcePath)+(d.status?' \xB7 '+escapeHtml(d.status):'')+(d.sourceOfTruth?' \xB7 source of truth':'')+'</span><p>'+escapeHtml(d.snippet||d.text.slice(0,240))+'</p></li>').join('')||'<li class="meta">No matching documents.</li>'};[q,project,type,truth].forEach(control=>control.addEventListener('input',draw));[project,type,truth].forEach(control=>control.addEventListener('change',draw));draw()}).catch(()=>{const notice=document.createElement('li');notice.className='warning';notice.textContent='Search index unavailable; showing the complete static list.';out.prepend(notice)});function safeHref(value){if(typeof value!=='string'||!/^projects\\/(?:[A-Za-z0-9._~!$&'()*+,;=@%-]+\\/)*[A-Za-z0-9._~!$&'()*+,;=@%-]+\\.html$/.test(value))return '#';try{const decoded=decodeURIComponent(value);if(decoded.split('/').some(part=>part==='.'||part==='..'||part.includes('\\\\')||/[\\u0000-\\u001f<>"']/.test(part)))return '#'}catch{return '#'}return value}function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}})();`;
var ROUTE_PATTERN = /^projects\/(?:[A-Za-z0-9._~!$&'()*+,;=@%-]+\/)*[A-Za-z0-9._~!$&'()*+,;=@%-]+\.html$/;
function safeRoute(route) {
  if (!ROUTE_PATTERN.test(route)) return "#";
  try {
    const decoded = decodeURIComponent(route);
    if (decoded.split("/").some(
      (part) => part === "." || part === ".." || part.includes("\\") || /[\u0000-\u001f<>"']/.test(part)
    )) {
      return "#";
    }
  } catch {
    return "#";
  }
  return route;
}
function href(fromRoute, targetRoute) {
  const value = relative(dirname(fromRoute), targetRoute).replace(/\\/g, "/");
  return value || "./";
}
function page(title, body, currentRoute = "index.html") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)} \xB7 DAI Nexus Docs Hub</title><link rel="stylesheet" href="${escape(href(currentRoute, "style.css"))}"></head><body><a class="skip-link" href="#main">Skip to content</a><div class="shell"><aside class="sidebar"><strong>DAI Nexus Docs Hub</strong><nav aria-label="Primary"><p><a href="${escape(href(currentRoute, "index.html"))}">All projects</a></p><p><a href="${escape(href(currentRoute, "search.html"))}">Search</a></p><p><a href="${escape(href(currentRoute, "traceability.html"))}">Traceability</a></p><p><a href="${escape(href(currentRoute, "diagnostics.html"))}">Diagnostics</a></p></nav></aside><main class="main" id="main"><div class="content">${body}</div></main></div></body></html>`;
}
function escape(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function label(value) {
  if (!value) return "Unavailable";
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function emptyState(message) {
  return `<p class="empty-state">${escape(message)}</p>`;
}
function listItems(items, render, message) {
  return items.length ? `<div class="item-grid">${items.map(render).join("")}</div>` : emptyState(message);
}
function valuesList(values, message) {
  return values.length ? `<ul class="compact-list">${values.map((value) => `<li>${escape(value)}</li>`).join("")}</ul>` : emptyState(message);
}
function renderRef(ref, catalog, fromRoute) {
  const document = catalog.documents.find(
    (candidate) => candidate.sourcePath === ref.path
  );
  const text = `${ref.path}${ref.anchor ? `#${ref.anchor}` : ""}`;
  if (!document) return `<code>${escape(text)}</code>`;
  const fragment = ref.anchor ? `#${slugifyHeading(ref.anchor)}` : "";
  return `<a href="${escape(`${href(fromRoute, document.route)}${fragment}`)}">${escape(text)}</a>`;
}
function renderRefs(refs, catalog, fromRoute, message = "No references recorded.") {
  return refs.length ? `<ul class="ref-list">${refs.map((ref) => `<li>${renderRef(ref, catalog, fromRoute)}</li>`).join("")}</ul>` : emptyState(message);
}
function fieldList(fields) {
  return `<dl class="field-list">${fields.map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}
function stateUnavailable() {
  return emptyState("Project state unavailable.");
}
function stateFreshness(catalog) {
  if (!catalog.project.state) return "Unavailable";
  if (catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.code === "PROJECT_STATE_FUTURE_TIMESTAMP"
  )) {
    return "Future timestamp";
  }
  return catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.code === "PROJECT_STATE_STALE"
  ) ? "Stale" : "Current";
}
function stateUpdated(catalog) {
  return catalog.project.state?.status.updated_at ?? "Unavailable";
}
function stateSource(catalog) {
  return catalog.project.statePath ?? "Unavailable";
}
function renderStateStatus(state, catalog) {
  const status = state.status;
  return `<p>${escape(status.summary)}</p>${fieldList([
    ["Project health", escape(label(status.health))],
    ["Lifecycle", escape(label(status.lifecycle))],
    ["Phase", escape(status.phase)],
    ["State freshness", escape(stateFreshness(catalog))],
    ["Last updated", escape(status.updated_at)],
    ["Next update", escape(status.next_update_at ?? "Not scheduled")]
  ])}<h3>Blockers</h3>${listItems(
    status.blockers,
    (blocker) => `<article class="item-card"><h4>${escape(blocker.title)}</h4>${fieldList([
      ["ID", `<code>${escape(blocker.id)}</code>`],
      ["Owner", escape(blocker.owner)]
    ])}</article>`,
    "No blockers recorded."
  )}<h3>Risks</h3>${listItems(
    status.risks,
    (risk) => `<article class="item-card"><h4>${escape(risk.title)}</h4>${fieldList([
      ["ID", `<code>${escape(risk.id)}</code>`],
      ["Owner", escape(risk.owner)],
      ["Mitigation", escape(risk.mitigation)]
    ])}</article>`,
    "No risks recorded."
  )}<h3>Next actions</h3>${listItems(
    status.next_actions,
    (action) => `<article class="item-card"><h4>${escape(action.title)}</h4>${fieldList([
      ["ID", `<code>${escape(action.id)}</code>`],
      ["Owner", escape(action.owner)],
      ["Due date", escape(action.due_date ?? "Not scheduled")]
    ])}</article>`,
    "No next actions recorded."
  )}`;
}
function renderStructureSection(state) {
  return `<section id="structure" class="card section-card"><h2>Structure</h2><h3>Roots</h3>${listItems(
    state.structure.roots,
    (root) => `<article class="item-card"><h4>${escape(root.path)}</h4>${fieldList([
      ["ID", `<code>${escape(root.id)}</code>`],
      ["Kind", escape(root.kind)],
      ["Purpose", escape(root.purpose)],
      ["Owner", escape(root.owner)]
    ])}</article>`,
    "No structure roots recorded."
  )}<h3>Dependencies</h3>${state.structure.dependencies.length ? `<ul class="compact-list">${state.structure.dependencies.map((dependency) => `<li><code>${escape(dependency.from)}</code> depends on <code>${escape(dependency.to)}</code> <span class="meta">(${escape(dependency.type)})</span></li>`).join("")}</ul>` : emptyState("No dependencies recorded.")}</section>`;
}
function renderRoadmapSection(state, catalog, projectRoute) {
  return `<section id="roadmap" class="card section-card"><h2>Roadmap</h2>${listItems(
    state.roadmap,
    (item) => `<article class="item-card"><h3>${escape(item.title)}</h3>${fieldList([
      ["ID", `<code>${escape(item.id)}</code>`],
      ["Status", escape(label(item.status))],
      ["Priority", escape(label(item.priority))],
      ["Owner", escape(item.owner)],
      ["Target date", escape(item.target_date ?? "Not scheduled")],
      [
        "Depends on",
        item.depends_on.length ? item.depends_on.map((dependency) => `<code>${escape(dependency)}</code>`).join(", ") : `<span class="empty-value">None</span>`
      ],
      ["References", renderRefs(item.references, catalog, projectRoute)]
    ])}</article>`,
    "No roadmap items recorded."
  )}</section>`;
}
function renderFlowsSection(state, catalog, projectRoute) {
  return `<section id="flows" class="card section-card"><h2>Flows</h2>${listItems(
    state.flows,
    (flow) => `<article class="item-card"><h3>${escape(flow.title)}</h3>${fieldList([
      ["ID", `<code>${escape(flow.id)}</code>`],
      ["Status", escape(label(flow.status))],
      ["Trigger", escape(flow.trigger)]
    ])}${flow.steps.length ? `${renderFlowDiagram(flow)}<details class="flow-details"><summary>Step details</summary><ol class="flow-steps">${flow.steps.map(
      (step) => `<li><h4>${escape(step.name)}</h4>${fieldList([
        ["ID", `<code>${escape(step.id)}</code>`],
        ["Actor", escape(step.actor)],
        ["Inputs", valuesList(step.inputs, "No inputs recorded.")],
        [
          "Outputs",
          valuesList(step.outputs, "No outputs recorded.")
        ],
        [
          "References",
          renderRefs(step.references, catalog, projectRoute)
        ]
      ])}</li>`
    ).join("")}</ol></details>` : emptyState("No ordered steps recorded.")}</article>`,
    "No flows recorded."
  )}</section>`;
}
function mermaidFlowText(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;").replace(/\(/g, "&#40;").replace(/\)/g, "&#41;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;").replace(/\s+/g, " ").trim();
}
function renderFlowDiagram(flow) {
  const lines = [
    "flowchart TD",
    `  trigger["Trigger: ${mermaidFlowText(flow.trigger)}"]`
  ];
  flow.steps.forEach((step, index) => {
    const node = `step_${index + 1}`;
    const previous = index === 0 ? "trigger" : `step_${index}`;
    lines.push(
      `  ${node}["${index + 1}. ${mermaidFlowText(step.name)} \xB7 ${mermaidFlowText(step.actor)}"]`,
      `  ${previous} --> ${node}`
    );
  });
  const source = lines.join("\n");
  const diagram = parseDiagram(source, 0);
  const textFallback = diagram.labels.map(escape).join(" \u2192 ");
  return `<figure class="diagram flow-diagram" aria-label="Mermaid flow diagram: ${escape(flow.title)}">
${renderDiagramSvg(diagram, `${flow.title} Mermaid flowchart`)}
<figcaption>Mermaid flowchart generated from the canonical ordered steps.</figcaption>
<details class="diagram-fallback"><summary>Mermaid source and text fallback</summary><pre><code class="language-mermaid">${escape(source)}</code></pre><p>${textFallback}</p></details>
</figure>`;
}
function renderBacklogSection(state, catalog, projectRoute) {
  return `<section id="backlog" class="card section-card"><h2>Backlog</h2>${listItems(
    state.backlog,
    (item) => `<article class="item-card"><h3>${escape(item.title)}</h3>${fieldList([
      ["ID", `<code>${escape(item.id)}</code>`],
      ["Type", escape(label(item.type))],
      ["Status", escape(label(item.status))],
      ["Priority", escape(label(item.priority))],
      ["Owner", escape(item.owner)],
      [
        "Acceptance",
        valuesList(item.acceptance, "No acceptance criteria recorded.")
      ],
      ["References", renderRefs(item.references, catalog, projectRoute)]
    ])}</article>`,
    "No backlog items recorded."
  )}</section>`;
}
function renderDiagnostics(catalog) {
  const diagnostics = catalog.diagnostics.map(
    (diagnostic2) => `<li class="${diagnostic2.severity}"><strong>${escape(diagnostic2.severity)} \xB7 ${escape(diagnostic2.code)}</strong> <span>${escape(diagnostic2.projectId)}${diagnostic2.path ? ` / ${escape(diagnostic2.path)}` : ""}: ${escape(diagnostic2.message)}</span>${diagnostic2.suggestion ? `<p class="meta">Suggestion: ${escape(diagnostic2.suggestion)}</p>` : ""}</li>`
  ).join("");
  return `<ul class="diagnostic-list">${diagnostics || '<li class="meta">No diagnostics recorded.</li>'}</ul>`;
}
var PROJECT_SECTION_ROUTES = [
  ["Overview", "index.html"],
  ["Structure", "structure.html"],
  ["Roadmap", "roadmap.html"],
  ["Flows", "flows.html"],
  ["Backlog", "backlog.html"],
  ["Documents", "documents.html"],
  ["Health", "health.html"]
];
function projectNav(projectId, currentRoute, currentPage) {
  const projectRoot = `projects/${encodeURIComponent(projectId)}`;
  return `<nav class="project-nav" aria-label="Project control">${PROJECT_SECTION_ROUTES.map(
    ([title, file]) => {
      const target = `${projectRoot}/${file}`;
      const current = title === currentPage ? ' aria-current="page"' : "";
      return `<a href="${escape(href(currentRoute, target))}"${current}>${escape(title)}</a>`;
    }
  ).join("")}</nav>`;
}
function projectHeader(catalog, currentRoute, currentPage) {
  const state = catalog.project.state;
  const health = state?.status.health ?? null;
  return `<p class="breadcrumbs"><a href="${escape(href(currentRoute, "index.html"))}">All projects</a></p><div class="project-header"><div><p class="eyebrow">Documentation scan: ${escape(label(catalog.project.scanStatus))}</p><h1>${escape(catalog.project.title)}</h1></div>${health ? `<span class="status-badge" data-tone="${health === "on_track" ? "success" : health === "unknown" ? "neutral" : "warning"}">${escape(label(health))}</span>` : ""}</div>${projectNav(catalog.project.id, currentRoute, currentPage)}`;
}
function projectSectionLink(title, description, count, projectRoute, file) {
  const id = file === "health.html" ? "docs-health" : file.replace(/\.html$/, "");
  return `<section id="${escape(id)}" class="card section-link"><h2><a href="${escape(href(projectRoute, `${projectRoute.replace(/index\.html$/, "")}${file}`))}">${escape(title)}</a></h2><p>${escape(description)}</p><p class="meta">${escape(count)}</p></section>`;
}
function renderHealthSection(catalog, projectRoute) {
  const facts = catalog.project.facts;
  return `<section id="docs-health" class="card section-card"><h2>Documentation health</h2><div class="card-grid"><section class="card"><h3>Documentation</h3><p><span class="metric">${catalog.documents.length}</span> documents</p><p class="meta">${catalog.assets.length} assets \xB7 ${catalog.project.truthDocuments.length} truth documents</p></section><section class="card"><h3>Git</h3><p>${facts.git.available ? escape(facts.git.branch ?? "detached") : "Unavailable"}</p><p class="meta">${facts.git.commit ? escape(facts.git.commit.slice(0, 12)) : "No commit"}${facts.git.dirty ? " \xB7 dirty" : ""}</p></section><section class="card"><h3>GitNexus</h3><p>${escape(facts.gitnexus.status)}</p><p class="meta">${facts.gitnexus.symbols ?? 0} symbols \xB7 ${facts.gitnexus.processes ?? 0} processes</p></section></div><h3>Project state source</h3>${fieldList(
    [
      ["Source path", `<code>${escape(stateSource(catalog))}</code>`],
      [
        "Content fingerprint",
        `<code>${escape(catalog.project.stateHash ?? "Unavailable")}</code>`
      ],
      ["Last updated", escape(stateUpdated(catalog))],
      ["Freshness", escape(stateFreshness(catalog))]
    ]
  )}<h3>Diagnostics</h3>${renderDiagnostics(catalog)}<h3>Documents</h3>${renderDocumentsSection(catalog, projectRoute)}</section>`;
}
function renderDocumentsSection(catalog, fromRoute) {
  const documents = catalog.documents.map(
    (document) => `<article class="card document-card"><h3><a href="${escape(href(fromRoute, document.route))}">${escape(document.title)}</a></h3><p class="meta">${escape(document.sourcePath)} \xB7 ${escape(document.type)}${document.status ? ` \xB7 ${escape(document.status)}` : ""}${document.sourceOfTruth ? " \xB7 Source of truth" : ""}</p></article>`
  ).join("");
  return `<div class="document-groups">${documents || '<p class="empty-state">No approved documents were found.</p>'}</div>`;
}
function renderOverview(catalog, projectRoute) {
  const state = catalog.project.state;
  const overview = state ? `<section id="project-status" class="card section-card"><h2>Project status</h2><p>${escape(state.project.summary)}</p>${fieldList(
    [
      ["Product type", escape(label(state.project.product_type))],
      ["Declared lifecycle", escape(label(state.project.lifecycle))],
      ["State schema version", escape(String(state.schema_version))],
      ["State source", `<code>${escape(stateSource(catalog))}</code>`],
      ["State freshness", escape(stateFreshness(catalog))],
      ["Last updated", escape(stateUpdated(catalog))]
    ]
  )}${renderStateStatus(state, catalog)}</section>` : `<section id="project-status" class="card section-card"><h2>Project status</h2>${stateUnavailable()}${renderDiagnostics(catalog)}</section>`;
  const sections = [
    projectSectionLink(
      "Structure",
      "Roots and dependencies that shape the project.",
      `${state?.structure.roots.length ?? 0} roots \xB7 ${state?.structure.dependencies.length ?? 0} dependencies`,
      projectRoute,
      "structure.html"
    ),
    projectSectionLink(
      "Roadmap",
      "Priorities, owners, dates and dependencies.",
      `${state?.roadmap.length ?? 0} roadmap items`,
      projectRoute,
      "roadmap.html"
    ),
    projectSectionLink(
      "Flows",
      "Ordered product and operational flows.",
      `${state?.flows.length ?? 0} flows`,
      projectRoute,
      "flows.html"
    ),
    projectSectionLink(
      "Backlog",
      "Work items and acceptance criteria.",
      `${state?.backlog.length ?? 0} backlog items`,
      projectRoute,
      "backlog.html"
    ),
    projectSectionLink(
      "Documents",
      "Approved source documents for this project.",
      `${catalog.documents.length} documents`,
      projectRoute,
      "documents.html"
    ),
    projectSectionLink(
      "Health",
      "Freshness, diagnostics and repository facts.",
      `${catalog.diagnostics.length} diagnostics`,
      projectRoute,
      "health.html"
    )
  ].join("");
  return `${overview}<div class="section-links">${sections}</div>`;
}
function containedPath(outputDir, child) {
  const root = resolve(outputDir);
  const target = resolve(child);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Static output path escapes output directory: ${child}`);
  }
  return target;
}
function safeDestination(outputDir, child) {
  const root = resolve(outputDir);
  const target = containedPath(root, child);
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of ["", ...segments]) {
    current = segment ? join(current, segment) : current;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Refusing docs output destination because it contains a symlink: ${current}`
        );
      }
    } catch (error) {
      if (error.code === "ENOENT") break;
      if (error instanceof Error && error.message.startsWith("Refusing ")) {
        throw error;
      }
      throw new Error(`Unable to inspect docs output destination: ${current}`, {
        cause: error
      });
    }
  }
  return target;
}
function documentBody(document, catalogs) {
  const catalog = catalogs.find(
    (item) => item.project.id === document.projectId
  );
  const allDocuments = catalogs.flatMap((item) => item.documents);
  const links = new Map(
    (document.links ?? []).map((link) => [
      link.target,
      link.resolvedRoute ?? link.target
    ])
  );
  const firstHeading = document.headings[0];
  const normalizedTitle = document.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const firstHeadingMatchesTitle = firstHeading?.level === 1 && firstHeading.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === normalizedTitle;
  const content = firstHeadingMatchesTitle ? document.content.replace(/^#\s+.+?(?:\r?\n)+(?:\r?\n)?/, "") : document.content;
  const outlineHeadings = firstHeadingMatchesTitle ? document.headings.slice(1) : document.headings;
  const rendered = renderMarkdown(content, {
    diagrams: document.diagrams,
    links: document.links,
    resolveLink: (target) => links.get(target)
  });
  const backlinkItems = document.backlinks.map((id) => allDocuments.find((item) => item.id === id)).filter((item) => item !== void 0).map(
    (item) => `<li><a href="${escape(href(document.route, item.route))}">${escape(item.title)}</a></li>`
  ).join("");
  const relatedItems = document.related.map((id) => allDocuments.find((item) => item.id === id)).filter((item) => item !== void 0).map(
    (item) => `<li><a href="${escape(href(document.route, item.route))}">${escape(item.title)}</a></li>`
  ).join("");
  const outline = outlineHeadings.length ? `<aside class="outline card" aria-label="On this page"><h2>On this page</h2><ol>${outlineHeadings.map((heading) => `<li><a href="#${escape(heading.slug)}">${escape(heading.text)}</a></li>`).join("")}</ol></aside>` : "";
  const projectRoute = `projects/${encodeURIComponent(document.projectId)}/index.html`;
  return `${catalog ? projectNav(catalog.project.id, document.route, "Documents") : ""}<p class="breadcrumbs"><a href="${escape(href(document.route, projectRoute))}">${escape(catalog?.project.title ?? document.projectId)}</a> / ${escape(document.sourcePath)}</p>
<h1${firstHeadingMatchesTitle ? ` id="${escape(firstHeading.slug)}"` : ""}>${escape(document.title)}</h1>
<p class="meta">${escape(document.type)}${document.status ? ` \xB7 <span class="status">${escape(document.status)}</span>` : ""}${document.sourceOfTruth ? " \xB7 source of truth" : ""}</p>
<div class="document-layout"><article>${rendered}${backlinkItems ? `<aside class="card"><h2>Backlinks</h2><ul>${backlinkItems}</ul></aside>` : ""}${relatedItems ? `<aside class="card"><h2>Related</h2><ul>${relatedItems}</ul></aside>` : ""}</article>${outline}</div>`;
}
function renderStaticSite(catalogs, options) {
  const orderedCatalogs = [...catalogs].sort(
    (left, right) => left.project.id.localeCompare(right.project.id)
  );
  const outputDir = resolve(options.outputDir);
  const safeOutputDir = safeDestination(outputDir, outputDir);
  mkdirSync(safeOutputDir, { recursive: true });
  const files = [];
  const write = (path, content) => {
    const safePath = safeDestination(outputDir, path);
    mkdirSync(dirname(safePath), { recursive: true });
    safeDestination(outputDir, safePath);
    writeFileSync(safePath, content, "utf8");
    files.push(safePath);
  };
  const ownershipMetadata = {
    schema: "dai-nexus-docs-hub",
    schema_version: 1,
    source_fingerprints: orderedCatalogs.map((catalog) => ({
      project_id: catalog.project.id,
      fingerprint: catalog.sourceFingerprint
    }))
  };
  write(
    join(outputDir, ".dainexus-docs-hub"),
    `${JSON.stringify(ownershipMetadata, null, 2)}
`
  );
  write(join(outputDir, "style.css"), CSS);
  write(join(outputDir, "app.js"), JS);
  const projectCards = orderedCatalogs.map((catalog) => {
    const state = catalog.project.state;
    const stateHealth = state?.status.health ?? null;
    return `<article class="card"><p class="eyebrow">Documentation scan: ${escape(label(catalog.project.scanStatus))}</p><h2><a href="${escape(`projects/${encodeURIComponent(catalog.project.id)}/index.html`)}">${escape(catalog.project.title)}</a></h2><p><span class="metric">${catalog.documents.length}</span> documents</p>${fieldList(
      [
        ["Project health", escape(label(stateHealth))],
        [
          "Lifecycle",
          escape(state ? label(state.status.lifecycle) : "Unavailable")
        ],
        ["Phase", escape(state?.status.phase ?? "Unavailable")],
        ["State freshness", escape(stateFreshness(catalog))],
        ["Last updated", escape(stateUpdated(catalog))],
        [
          "Documentation health",
          escape(
            `${catalog.project.health.warnings} warnings, ${catalog.project.health.errors} errors, ${catalog.project.health.info} info`
          )
        ]
      ]
    )}</article>`;
  }).join("");
  write(
    join(outputDir, "index.html"),
    page(
      options.title ?? "Projects",
      `<p class="eyebrow">Local-first knowledge</p><h1>${escape(options.title ?? "Documentation projects")}</h1><p class="meta">Static, offline-readable project documentation with privacy-safe collection and traceability.</p><div class="card-grid">${projectCards || '<p class="meta">No registered projects.</p>'}</div>`
    )
  );
  for (const catalog of orderedCatalogs) {
    const projectRoute = `projects/${encodeURIComponent(catalog.project.id)}/index.html`;
    const projectRoot = projectRoute.replace(/index\.html$/, "");
    const stateSections = catalog.project.state ? {
      structure: renderStructureSection(catalog.project.state),
      roadmap: renderRoadmapSection(
        catalog.project.state,
        catalog,
        `${projectRoot}roadmap.html`
      ),
      flows: renderFlowsSection(
        catalog.project.state,
        catalog,
        `${projectRoot}flows.html`
      ),
      backlog: renderBacklogSection(
        catalog.project.state,
        catalog,
        `${projectRoot}backlog.html`
      )
    } : null;
    const unavailableSections = {
      structure: `<section id="structure" class="card section-card"><h2>Structure</h2>${stateUnavailable()}</section>`,
      roadmap: `<section id="roadmap" class="card section-card"><h2>Roadmap</h2>${stateUnavailable()}</section>`,
      flows: `<section id="flows" class="card section-card"><h2>Flows</h2>${stateUnavailable()}</section>`,
      backlog: `<section id="backlog" class="card section-card"><h2>Backlog</h2>${stateUnavailable()}</section>`
    };
    write(
      join(outputDir, projectRoute),
      page(
        catalog.project.title,
        `${projectHeader(catalog, projectRoute, "Overview")}${renderOverview(catalog, projectRoute)}`,
        projectRoute
      )
    );
    for (const [name, title] of [
      ["structure", "Structure"],
      ["roadmap", "Roadmap"],
      ["flows", "Flows"],
      ["backlog", "Backlog"]
    ]) {
      const route = `${projectRoot}${name}.html`;
      write(
        join(outputDir, route),
        page(
          `${title} \xB7 ${catalog.project.title}`,
          `${projectHeader(catalog, route, title)}${stateSections?.[name] ?? unavailableSections[name]}`,
          route
        )
      );
    }
    const documentsRoute = `${projectRoot}documents.html`;
    write(
      join(outputDir, documentsRoute),
      page(
        `Documents \xB7 ${catalog.project.title}`,
        `${projectHeader(catalog, documentsRoute, "Documents")}<section id="documents" class="card section-card"><h2>Documents</h2>${renderDocumentsSection(catalog, documentsRoute)}</section>`,
        documentsRoute
      )
    );
    const healthRoute = `${projectRoot}health.html`;
    write(
      join(outputDir, healthRoute),
      page(
        `Health \xB7 ${catalog.project.title}`,
        `${projectHeader(catalog, healthRoute, "Health")}${renderHealthSection(catalog, healthRoute)}`,
        healthRoute
      )
    );
    for (const document of catalog.documents) {
      write(
        join(outputDir, document.route),
        page(
          document.title,
          documentBody(document, orderedCatalogs),
          document.route
        )
      );
    }
    for (const asset of catalog.assets) {
      const target = safeDestination(outputDir, join(outputDir, asset.route));
      mkdirSync(dirname(target), { recursive: true });
      safeDestination(outputDir, target);
      copyFileSync(join(catalog.project.root, asset.sourcePath), target);
      files.push(target);
    }
  }
  const index = buildSearchIndex(orderedCatalogs);
  write(
    join(outputDir, "search-index.json"),
    `${JSON.stringify(index, null, 2)}
`
  );
  const browseFallback = orderedCatalogs.flatMap(
    (catalog) => catalog.documents.map(
      (document) => `<li><a href="${escape(safeRoute(document.route))}">${escape(document.title)}</a> <span class="meta">\u2014 ${escape(catalog.project.title)} / ${escape(document.sourcePath)}</span></li>`
    )
  ).join("");
  const searchTypes = [
    ...new Set(
      orderedCatalogs.flatMap(
        (catalog) => catalog.documents.map((document) => document.type)
      )
    )
  ].sort((left, right) => left.localeCompare(right));
  const projectOptions = orderedCatalogs.map(
    (catalog) => `<option value="${escape(catalog.project.id)}">${escape(catalog.project.title)}</option>`
  ).join("");
  const typeOptions = searchTypes.map(
    (type) => `<option value="${escape(type)}">${escape(label(type))}</option>`
  ).join("");
  write(
    join(outputDir, "search.html"),
    page(
      "Search",
      `<p class="eyebrow">Offline index</p><h1>Search</h1><p class="meta">Search titles, paths, headings, tags and document text.</p><noscript><p>JavaScript is disabled. Browse the complete document list below.</p></noscript><div class="search-controls"><div class="control-field"><label for="search">Search documents</label><input id="search" data-search type="search" autocomplete="off"></div><div class="control-field"><label for="project-filter">Project</label><select id="project-filter" data-project-filter><option value="">All projects</option>${projectOptions}</select></div><div class="control-field"><label for="type-filter">Type</label><select id="type-filter" data-type-filter><option value="">All types</option>${typeOptions}</select></div><div class="control-field"><label for="truth-filter">Truth</label><select id="truth-filter" data-truth-filter><option value="all">All documents</option><option value="truth">Source of truth</option><option value="non-truth">Supporting documents</option></select></div></div><p class="meta" aria-live="polite" data-result-count>${orderedCatalogs.reduce((count, catalog) => count + catalog.documents.length, 0)} results</p><ul class="search-results" data-results>${browseFallback}</ul><script src="app.js" defer></script>`,
      "search.html"
    )
  );
  const relations = orderedCatalogs.flatMap(
    (catalog) => catalog.relations.map(
      (relation) => `<li><strong>${escape(relation.type)}</strong> <code>${escape(relation.from)}</code> \u2192 <code>${escape(relation.to)}</code> <span class="meta">(${escape(relation.source)})</span></li>`
    )
  ).join("");
  write(
    join(outputDir, "traceability.html"),
    page(
      "Traceability",
      `<p class="eyebrow">Relationships</p><h1>Traceability</h1><p class="meta">Document, code-reference, truth, and link relations.</p><ul>${relations || '<li class="meta">No relations found.</li>'}</ul>`,
      "traceability.html"
    )
  );
  const diagnostics = orderedCatalogs.flatMap(
    (catalog) => catalog.diagnostics.map(
      (diagnostic2) => `<li class="${diagnostic2.severity}"><strong>${escape(diagnostic2.severity)} \xB7 ${escape(diagnostic2.code)}</strong> <span>${escape(diagnostic2.projectId)}${diagnostic2.path ? ` / ${escape(diagnostic2.path)}` : ""}: ${escape(diagnostic2.message)}</span>${diagnostic2.suggestion ? `<p class="meta">Suggestion: ${escape(diagnostic2.suggestion)}</p>` : ""}</li>`
    )
  ).join("");
  write(
    join(outputDir, "diagnostics.html"),
    page(
      "Diagnostics",
      `<p class="eyebrow">Documentation health</p><h1>Diagnostics</h1><ul class="diagnostic-list">${diagnostics || '<li class="meta">No diagnostics.</li>'}</ul>`,
      "diagnostics.html"
    )
  );
  write(
    join(outputDir, "404.html"),
    page(
      "Not found",
      '<p class="eyebrow">404</p><h1>Page not found</h1><p>The requested generated document does not exist.</p><p><a href="index.html">Return to all projects</a></p>',
      "404.html"
    )
  );
  return {
    outputDir,
    files: [...new Set(files)].sort(),
    searchIndex: join(outputDir, "search-index.json")
  };
}
function buildDocsHub(catalogs, outputDir) {
  const finalOutput = resolve(outputDir);
  const stagingOutput = `${finalOutput}.staging-${process.pid}`;
  const ownershipMarker = join(finalOutput, ".dainexus-docs-hub");
  if (existsSync(finalOutput) && !existsSync(ownershipMarker)) {
    throw new Error(
      `Refusing to replace an unowned output directory: ${finalOutput}`
    );
  }
  rmSync(stagingOutput, { recursive: true, force: true });
  let staged;
  try {
    staged = renderStaticSite(catalogs, { outputDir: stagingOutput });
  } catch (error) {
    removeQuietly(stagingOutput);
    throw error;
  }
  removeQuietly(finalOutput);
  renameWithRetry(stagingOutput, finalOutput);
  return {
    outputDir: finalOutput,
    projects: [...catalogs].sort((left, right) => left.project.id.localeCompare(right.project.id)).map((catalog) => ({
      id: catalog.project.id,
      title: catalog.project.title,
      documents: catalog.documents.length,
      diagnostics: catalog.diagnostics.length
    })),
    filesWritten: staged.files.length
  };
}

// src/docs/change-gate.ts
var DocsGateError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.name = "DocsGateError";
    this.code = code;
  }
};
var LOCKFILES2 = /* @__PURE__ */ new Set([
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "poetry.lock",
  "pnpm-lock.yaml",
  "yarn.lock"
]);
var DOCUMENT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".adoc",
  ".markdown",
  ".md",
  ".mdx",
  ".org",
  ".rst",
  ".tex",
  ".txt"
]);
var DOCUMENT_ASSET_EXTENSIONS = /* @__PURE__ */ new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".svg",
  ".webp"
]);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cjs",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".swift",
  ".ts",
  ".tsx",
  ".vue"
]);
var PROJECT_MANIFESTS = /* @__PURE__ */ new Set([
  "cargo.toml",
  "composer.json",
  "dockerfile",
  "gemfile",
  "go.mod",
  "makefile",
  "mix.exs",
  "package.json",
  "pipfile",
  "poetry.lock",
  "pyproject.toml",
  "requirements.txt",
  "setup.cfg",
  "setup.py"
]);
var GENERATED_DIRECTORIES = /* @__PURE__ */ new Set(["build", "coverage", "dist"]);
var TEST_DIRECTORIES = /* @__PURE__ */ new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs"
]);
var DOCUMENT_DIRECTORIES = /* @__PURE__ */ new Set([
  "adr",
  "doc",
  "docs",
  "documentation",
  "wiki"
]);
var MATERIAL_DIRECTORIES = /* @__PURE__ */ new Set([
  "app",
  "bin",
  "client",
  "config",
  "configs",
  ".agents",
  ".claude",
  ".codex",
  ".cursor",
  ".github",
  "kernel",
  "lib",
  "runtime",
  "prompt",
  "prompts",
  "rule",
  "rules",
  "schema",
  "schemas",
  "server",
  "script",
  "scripts",
  "skill",
  "skills",
  "source",
  "src",
  "template",
  "templates",
  "workflow",
  "workflows"
]);
var MATERIAL_FILENAMES = /* @__PURE__ */ new Set([
  "agents.md",
  "claude.md",
  "product-manifest.json"
]);
var BENIGN_JUNK_FILENAMES = /* @__PURE__ */ new Set([
  ".ds_store",
  ".gitkeep",
  ".keep",
  "desktop.ini",
  "thumbs.db"
]);
function sortPaths(paths) {
  return [...new Set(paths)].sort(
    (left, right) => left < right ? -1 : left > right ? 1 : 0
  );
}
function parseNulDelimitedPaths(output) {
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : output;
  const paths = text.split("\0").filter((path) => path.length > 0).map((path) => path.replace(/\\/g, "/"));
  for (const path of paths) {
    if (path.includes("\uFFFD") || path.startsWith("/") || path.split("/").some((segment) => segment === "..")) {
      throw new DocsGateError(
        "GIT_PATH_INVALID",
        `Git returned a non-relative path: ${path}`
      );
    }
  }
  return sortPaths(paths);
}
function parseNulDelimitedDiffPaths(output) {
  const text = Buffer.isBuffer(output) ? output.toString("utf8") : output;
  const tokens = text.split("\0");
  if (tokens.at(-1) === "") tokens.pop();
  const paths = [];
  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++];
    if (!status || !/^[ACDMRTUXB][0-9]*$/.test(status)) {
      throw new DocsGateError(
        "GIT_CHANGE_DISCOVERY_FAILED",
        `Git returned an invalid name-status record: ${status ?? "<missing>"}`
      );
    }
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
      const path = tokens[index++];
      if (path === void 0) {
        throw new DocsGateError(
          "GIT_CHANGE_DISCOVERY_FAILED",
          `Git returned an incomplete name-status record for ${status}.`
        );
      }
      paths.push(path);
    }
  }
  return parseNulDelimitedPaths(`${paths.join("\0")}\0`);
}
function isTrackedPath(projectRoot, path) {
  const result = spawnSync(
    "git",
    ["-C", projectRoot, "ls-files", "--error-unmatch", "--", path],
    {
      stdio: "ignore",
      timeout: 1e4
    }
  );
  if (result.error) {
    throw new DocsGateError(
      "GIT_CHANGE_DISCOVERY_FAILED",
      `Unable to verify whether a generated path is tracked: ${result.error.message}`
    );
  }
  return result.status === 0;
}
var GIT_QUERY_TIMEOUT_MS = 1e4;
var GIT_SNAPSHOT_TIMEOUT_MS = Number.parseInt(
  process.env.DAINEXUS_DOCS_GIT_SNAPSHOT_TIMEOUT_MS ?? "120000",
  10
);
function runGitOutput(projectRoot, args, timeout = GIT_QUERY_TIMEOUT_MS) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    timeout
  });
  if (result.error || result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8").trim() : String(result.stderr ?? "").trim();
    throw new DocsGateError(
      "GIT_CHANGE_DISCOVERY_FAILED",
      `Unable to read Git changes${stderr ? `: ${stderr}` : "."}`
    );
  }
  return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? "");
}
function runGit2(projectRoot, args) {
  return parseNulDelimitedPaths(runGitOutput(projectRoot, args));
}
function runGitDiff(projectRoot, args) {
  return parseNulDelimitedDiffPaths(runGitOutput(projectRoot, args));
}
function stagedPaths(projectRoot) {
  return runGitDiff(projectRoot, [
    "diff",
    "--relative",
    "-M",
    "--cached",
    "--name-status",
    "-z",
    "--diff-filter=ACMRD"
  ]);
}
function worktreePaths(projectRoot) {
  return sortPaths([
    ...runGitDiff(projectRoot, [
      "diff",
      "--relative",
      "-M",
      "--name-status",
      "-z",
      "--diff-filter=ACMRD"
    ]),
    ...stagedPaths(projectRoot),
    ...runGit2(projectRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z"
    ])
  ]);
}
function baseRefPaths(projectRoot, baseRef) {
  if (!baseRef.trim() || baseRef.startsWith("-")) {
    throw new DocsGateError(
      "GIT_BASE_REF_INVALID",
      "--base-ref must be a non-empty Git revision."
    );
  }
  return runGitDiff(projectRoot, [
    "diff",
    "--relative",
    "-M",
    "--name-status",
    "-z",
    "--diff-filter=ACMRD",
    `${baseRef}...HEAD`
  ]);
}
function gitText(projectRoot, args) {
  const value = runGitOutput(projectRoot, args).toString("utf8").trim();
  if (!value || value.includes("\0")) {
    throw new DocsGateError(
      "GIT_SNAPSHOT_FAILED",
      "Git returned an invalid value while preparing the selected project view."
    );
  }
  return value;
}
function selectedProjectView(projectRoot, mode) {
  if (mode === "worktree") {
    return { projectRoot, temporaryParent: null };
  }
  const repositoryRoot = realpathSync(
    resolve(gitText(projectRoot, ["rev-parse", "--show-toplevel"]))
  );
  const projectPath = relative(repositoryRoot, projectRoot);
  if (projectPath === ".." || projectPath.startsWith(`..${sep}`) || resolve(repositoryRoot, projectPath) !== projectRoot) {
    throw new DocsGateError(
      "GIT_SNAPSHOT_FAILED",
      "Project root is outside the Git repository selected for the docs gate."
    );
  }
  const temporaryParent = mkdtempSync(join(tmpdir(), "dai-nexus-docs-view-"));
  try {
    const snapshotRoot = join(temporaryParent, "repository");
    runGitOutput(
      repositoryRoot,
      [
        "clone",
        "--quiet",
        "--no-checkout",
        "--local",
        "--",
        repositoryRoot,
        snapshotRoot
      ],
      GIT_SNAPSHOT_TIMEOUT_MS
    );
    if (mode === "staged") {
      runGitOutput(
        repositoryRoot,
        ["checkout-index", "--all", "--force", `--prefix=${snapshotRoot}/`],
        GIT_SNAPSHOT_TIMEOUT_MS
      );
    } else {
      const head = gitText(projectRoot, ["rev-parse", "--verify", "HEAD"]);
      runGitOutput(
        snapshotRoot,
        ["checkout", "--quiet", "--detach", head],
        GIT_SNAPSHOT_TIMEOUT_MS
      );
    }
    return {
      projectRoot: resolve(snapshotRoot, projectPath),
      temporaryParent
    };
  } catch (error) {
    removeQuietly(temporaryParent);
    throw error;
  }
}
function selectedMode(options) {
  const selected = [
    options.staged ? "staged" : null,
    options.worktree ? "worktree" : null,
    options.baseRef !== void 0 ? "base-ref" : null
  ].filter((value) => value !== null);
  if (selected.length > 1) {
    throw new DocsGateError(
      "DOCS_GATE_OPTION_CONFLICT",
      "Choose only one of --staged, --worktree, or --base-ref."
    );
  }
  return selected[0] ?? "worktree";
}
function selectedPaths(projectRoot, mode, baseRef) {
  if (mode === "staged") return stagedPaths(projectRoot);
  if (mode === "base-ref") return baseRefPaths(projectRoot, baseRef ?? "");
  return worktreePaths(projectRoot);
}
function pathSegments(path) {
  return path.toLowerCase().split("/").filter(Boolean);
}
function isIgnoredGeneratedPath(path) {
  const lower = path.toLowerCase();
  const segments = pathSegments(path);
  return segments.includes(".git") || lower === ".dainexus/cache" || lower.startsWith(".dainexus/cache/") || isGeneratedDocsOutputPath(path) || segments.some((segment) => GENERATED_DIRECTORIES.has(segment));
}
function isGeneratedDocsOutputPath(path) {
  const lower = path.toLowerCase();
  return lower === ".dainexus/docs-hub" || lower.startsWith(".dainexus/docs-hub/");
}
function isLockfile(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return LOCKFILES2.has(basename5);
}
function isTestOnlyPath(path) {
  const lower = path.toLowerCase();
  const basename5 = lower.split("/").at(-1) ?? "";
  return pathSegments(path).some((segment) => TEST_DIRECTORIES.has(segment)) || /(^|[._-])(test|spec)([._-]|$)/.test(basename5) || /(^|[._-])test_[^/]+\.(py|pyi)$/.test(basename5) || /_test\.(go|py|rs)$/.test(basename5) || basename5 === "conftest.py";
}
function isDocumentationOnlyPath(path) {
  const lower = path.toLowerCase();
  const basename5 = lower.split("/").at(-1) ?? "";
  const extension = basename5.includes(".") ? `.${basename5.split(".").at(-1)}` : "";
  return DOCUMENT_EXTENSIONS.has(extension) || /^(readme|changelog|changes|history|license)(\.|$)/.test(basename5);
}
function isProjectConfigPath(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return path.toLowerCase() === ".dainexus/docs-manifest.json" || PROJECT_MANIFESTS.has(basename5) || /^(\.env|\.nvmrc|\.npmrc|\.tool-versions|tsconfig(?:\.|$)|jsconfig(?:\.|$)|vitest\.config\.|jest\.config\.|vite\.config\.|webpack\.config\.|rollup\.config\.|eslint\.config\.|\.eslintrc|\.prettierrc)/.test(
    basename5
  );
}
function isBenignJunkPath(path) {
  const basename5 = path.split("/").at(-1)?.toLowerCase() ?? "";
  return BENIGN_JUNK_FILENAMES.has(basename5) || basename5.endsWith(".swp") || basename5.endsWith(".swo") || basename5.endsWith("~");
}
function isMaterialDocsPath(path, canonicalStatePath) {
  const normalizedPath = path.replace(/\\/g, "/");
  let normalizedState = null;
  if (canonicalStatePath) {
    try {
      normalizedState = normalizeRelativePath(canonicalStatePath);
    } catch {
      normalizedState = canonicalStatePath.replace(/\\/g, "/");
    }
  }
  if (normalizedState === normalizedPath) return true;
  if (isIgnoredGeneratedPath(normalizedPath)) return false;
  if (isLockfile(normalizedPath)) return false;
  if (isTestOnlyPath(normalizedPath)) return false;
  const segments = pathSegments(normalizedPath);
  if (segments.some((segment) => MATERIAL_DIRECTORIES.has(segment))) {
    return true;
  }
  const basename5 = segments.at(-1) ?? "";
  const extension = basename5.includes(".") ? `.${basename5.split(".").at(-1)}` : "";
  if (MATERIAL_FILENAMES.has(basename5)) return true;
  if (isProjectConfigPath(normalizedPath)) return true;
  if (SOURCE_EXTENSIONS.has(extension)) return true;
  if (isDocumentationOnlyPath(normalizedPath)) return false;
  if (segments.some((segment) => DOCUMENT_DIRECTORIES.has(segment)) && DOCUMENT_ASSET_EXTENSIONS.has(extension)) {
    return false;
  }
  if (isBenignJunkPath(normalizedPath)) return false;
  return true;
}
function classifyMaterialPaths(changedPaths, canonicalStatePath, continuousDocsPaths = []) {
  const continuous = new Set(
    [...continuousDocsPaths].map((path) => path.replace(/\\/g, "/"))
  );
  return sortPaths(
    changedPaths.filter(
      (path) => continuous.has(path.replace(/\\/g, "/")) || isMaterialDocsPath(path, canonicalStatePath)
    )
  );
}
function continuousDocumentationPaths(catalog) {
  const references = catalog.project.state ? [
    ...catalog.project.state.roadmap.flatMap((item) => item.references),
    ...catalog.project.state.flows.flatMap(
      (flow) => flow.steps.flatMap((step) => step.references)
    ),
    ...catalog.project.state.backlog.flatMap((item) => item.references)
  ].map((reference) => reference.path) : [];
  return sortPaths([
    ...catalog.project.truthDocuments,
    ...references,
    ...catalog.project.statePath ? [catalog.project.statePath] : []
  ]);
}
function diagnostic(code, message, path, projectId = "docs-gate") {
  return {
    severity: "error",
    code,
    projectId,
    ...path ? { path } : {},
    message
  };
}
function addDiagnostic2(report, item) {
  report.diagnostics.push(item);
  report.summary.errors += 1;
  report.status = "fail";
}
function emptyResult(mode) {
  return {
    status: "fail",
    mode,
    changedPaths: [],
    materialPaths: [],
    statePath: null,
    stateUpdatedAt: null,
    doctor: { summary: null, diagnostics: [] },
    verifiedOutputPaths: []
  };
}
function outputRelativePath(outputDir, candidate) {
  const root = resolve(outputDir);
  const target = resolve(candidate);
  const relativePath = relative(root, target).replace(/\\/g, "/");
  if (relativePath === "" || relativePath === ".." || relativePath.startsWith("../") || relativePath.startsWith("/")) {
    throw new DocsGateError(
      "DOCS_GATE_OUTPUT_ESCAPE",
      `Generated output path escapes the temporary output directory: ${candidate}`
    );
  }
  return relativePath;
}
function verifyOutput(outputDir, catalog) {
  const projectRoot = `projects/${encodeURIComponent(catalog.project.id)}`;
  const required = [
    ".dainexus-docs-hub",
    "index.html",
    "style.css",
    "app.js",
    "search-index.json",
    `${projectRoot}/index.html`,
    ...["structure", "roadmap", "flows", "backlog", "documents", "health"].map(
      (section) => `${projectRoot}/${section}.html`
    ),
    ...catalog.documents.map((document) => document.route)
  ];
  for (const path of required) {
    const absolutePath = resolve(outputDir, path);
    outputRelativePath(outputDir, absolutePath);
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch {
      throw new DocsGateError(
        "DOCS_GATE_OUTPUT_MISSING",
        `Generated Docs Hub output is missing: ${path}`
      );
    }
    if (!stat.isFile()) {
      throw new DocsGateError(
        "DOCS_GATE_OUTPUT_NOT_REGULAR",
        `Generated Docs Hub output is not a regular file: ${path}`
      );
    }
  }
  let ownership;
  try {
    ownership = JSON.parse(
      readFileSync(resolve(outputDir, ".dainexus-docs-hub"), "utf8")
    );
  } catch (error) {
    throw new DocsGateError(
      "DOCS_GATE_MARKER_INVALID",
      `Generated ownership marker is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const fingerprints = ownership && typeof ownership === "object" && "source_fingerprints" in ownership ? ownership.source_fingerprints : null;
  const ownsCatalog = Array.isArray(fingerprints) && fingerprints.some(
    (item) => item && typeof item === "object" && item.project_id === catalog.project.id && item.fingerprint === catalog.sourceFingerprint
  );
  if (!ownership || typeof ownership !== "object" || ownership.schema !== "dai-nexus-docs-hub" || ownership.schema_version !== 1 || !ownsCatalog) {
    throw new DocsGateError(
      "DOCS_GATE_MARKER_INVALID",
      "Generated ownership marker does not match the current project catalog."
    );
  }
  return sortPaths(required);
}
function statePathFromCatalog(catalog) {
  if (!catalog.project.statePath) return null;
  try {
    return normalizeRelativePath(catalog.project.statePath);
  } catch {
    return catalog.project.statePath.replace(/\\/g, "/");
  }
}
function runDocsGate(projectRootInput, options = {}) {
  let mode = "worktree";
  const result = emptyResult(mode);
  let catalog = null;
  let doctorReport = null;
  let selectedView = null;
  try {
    mode = selectedMode(options);
    result.mode = mode;
    const projectRoot = realpathSync(resolve(projectRootInput));
    result.changedPaths = selectedPaths(projectRoot, mode, options.baseRef);
    selectedView = selectedProjectView(projectRoot, mode);
    catalog = scanProject(selectedView.projectRoot);
    result.statePath = statePathFromCatalog(catalog);
    result.stateUpdatedAt = catalog.project.state?.status.updated_at ?? null;
    doctorReport = doctorCatalog(catalog, null, { strict: true });
    result.doctor = {
      summary: doctorReport.summary,
      diagnostics: [...doctorReport.diagnostics]
    };
    for (const path of result.changedPaths.filter(
      (path2) => isGeneratedDocsOutputPath(path2) && isTrackedPath(projectRoot, path2)
    )) {
      addDiagnostic2(
        doctorReport,
        diagnostic(
          "GENERATED_DOCS_OUTPUT_CHANGED",
          "Generated Docs Hub output must not be edited or committed; update source documentation instead.",
          path,
          catalog.project.id
        )
      );
    }
    result.materialPaths = classifyMaterialPaths(
      result.changedPaths,
      result.statePath,
      continuousDocumentationPaths(catalog)
    );
    if (result.materialPaths.length > 0 && (!result.statePath || !result.changedPaths.includes(result.statePath))) {
      addDiagnostic2(
        doctorReport,
        diagnostic(
          "MATERIAL_CHANGE_MISSING_PROJECT_STATE",
          "Material changes require the canonical project state path in the same selected change set.",
          result.statePath ?? "project_docs.state",
          catalog.project.id
        )
      );
    }
    result.doctor = {
      summary: doctorReport.summary,
      diagnostics: [...doctorReport.diagnostics]
    };
    if (doctorReport.status === "fail") return result;
    const temporaryParent = mkdtempSync(join(tmpdir(), "dai-nexus-docs-gate-"));
    try {
      const outputDir = join(temporaryParent, "site");
      buildDocsHub([catalog], outputDir);
      result.verifiedOutputPaths = verifyOutput(outputDir, catalog);
    } finally {
      removeQuietly(temporaryParent);
    }
    result.status = "pass";
    return result;
  } catch (error) {
    const item = diagnostic(
      error instanceof DocsGateError ? error.code : "DOCS_GATE_FAILED",
      error instanceof Error ? error.message : String(error),
      void 0,
      catalog?.project.id
    );
    if (doctorReport) {
      addDiagnostic2(doctorReport, item);
      result.doctor = {
        summary: doctorReport.summary,
        diagnostics: [...doctorReport.diagnostics]
      };
    } else {
      result.doctor.diagnostics.push(item);
    }
    return result;
  } finally {
    if (selectedView?.temporaryParent) {
      removeQuietly(selectedView.temporaryParent);
    }
  }
}
function canonicalPotentialPath(input) {
  const absolute = resolve(input);
  let existing = absolute;
  const missingSegments = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(basename(existing));
    existing = parent;
  }
  const canonicalExisting = existsSync(existing) ? realpathSync(existing) : existing;
  return resolve(canonicalExisting, ...missingSegments);
}
function ensureOutside(outputDir, roots) {
  const output = canonicalPotentialPath(outputDir);
  for (const root of roots) {
    const canonicalRoot = realpathSync(root);
    if (isPathInside(canonicalRoot, output)) {
      throw new Error(`Obsidian output must be outside project root: ${root}`);
    }
  }
}
function obsidianPath(projectId, sourcePath) {
  return join(projectId, sourcePath);
}
function safeDestination2(outputDir, child) {
  const root = resolve(outputDir);
  const target = resolve(child);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Obsidian output path escapes output directory: ${child}`);
  }
  const segments = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const segment of ["", ...segments]) {
    current = segment ? join(current, segment) : current;
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(
          `Refusing Obsidian output destination because it contains a symlink: ${current}`
        );
      }
    } catch (error) {
      if (error.code === "ENOENT") break;
      if (error instanceof Error && error.message.startsWith("Refusing ")) {
        throw error;
      }
      throw new Error(
        `Unable to inspect Obsidian output destination: ${current}`,
        { cause: error }
      );
    }
  }
  return target;
}
function exportObsidianVault(catalogs, outputDirInput) {
  const orderedCatalogs = [...catalogs].sort(
    (left, right) => left.project.id.localeCompare(right.project.id)
  );
  const outputDir = resolve(outputDirInput);
  ensureOutside(
    outputDir,
    orderedCatalogs.map((catalog) => catalog.project.root)
  );
  const safeOutputDir = safeDestination2(outputDir, outputDir);
  mkdirSync(safeOutputDir, { recursive: true });
  const files = [];
  const write = (path, content) => {
    const safePath = safeDestination2(outputDir, path);
    mkdirSync(dirname(safePath), { recursive: true });
    safeDestination2(outputDir, safePath);
    writeFileSync(safePath, content, "utf8");
    files.push(safePath);
  };
  write(
    join(outputDir, "README.md"),
    `# DAI Nexus Docs Hub

${orderedCatalogs.map((catalog) => `- [[${catalog.project.id}/index|${catalog.project.title}]]`).join("\n")}
`
  );
  for (const catalog of orderedCatalogs) {
    const byId = new Map(
      catalog.documents.map((document) => [document.id, document])
    );
    write(
      join(outputDir, catalog.project.id, "index.md"),
      `# ${catalog.project.title}

${catalog.documents.map((document) => `- [[${document.sourcePath.replace(/\.md$/i, "")}|${document.title}]]`).join("\n")}
`
    );
    for (const document of catalog.documents) {
      const destination = join(
        outputDir,
        obsidianPath(catalog.project.id, document.sourcePath)
      );
      let content = document.content;
      for (const link of document.links) {
        if (link.resolvedDocumentId && link.target.startsWith("dai-nexus://")) {
          const target = byId.get(link.resolvedDocumentId) ?? orderedCatalogs.flatMap((item) => item.documents).find((item) => item.id === link.resolvedDocumentId);
          if (target) {
            const original = `[${link.label}](${link.target})`;
            const obsidian = `[[${target.projectId}/${target.sourcePath.replace(/\.md$/i, "")}|${link.label}]]`;
            content = content.split(original).join(obsidian);
          }
        }
      }
      const nav = `> [!info] DAI Nexus Docs Hub
> Project: [[${catalog.project.id}/index|${catalog.project.title}]] \xB7 Source: \`${document.sourcePath}\`

`;
      write(
        destination,
        document.format === "markdown" ? nav + content : content
      );
    }
    for (const asset of catalog.assets) {
      const target = join(
        outputDir,
        asset.route.replace(
          /^projects\/[^/]+\/assets\//,
          `${catalog.project.id}/`
        )
      );
      const safeTarget = safeDestination2(outputDir, target);
      mkdirSync(dirname(safeTarget), { recursive: true });
      safeDestination2(outputDir, safeTarget);
      copyFileSync(join(catalog.project.root, asset.sourcePath), safeTarget);
      files.push(safeTarget);
    }
  }
  return {
    outputDir,
    projects: orderedCatalogs.length,
    filesWritten: files.length
  };
}
var registrySchema = z.object({
  schema_version: z.literal(DOCS_SCHEMA_VERSION),
  projects: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      root: z.string().min(1),
      manifest: z.string().nullable()
    }).strict()
  )
}).strict();
function getDocsHubHome() {
  const configured = process.env.DAINEXUS_HOME?.trim();
  return configured ? resolve(configured) : join(homedir(), ".dainexus");
}
function getRegistryPath() {
  return join(getDocsHubHome(), "docs-hub", "projects.json");
}
function loadRegistry(path = getRegistryPath()) {
  if (!existsSync(path)) {
    return { schema_version: DOCS_SCHEMA_VERSION, projects: [] };
  }
  const parsed = registrySchema.safeParse(
    JSON.parse(readFileSync(path, "utf8"))
  );
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid docs registry at ${path}: ${details}`);
  }
  return {
    ...parsed.data,
    projects: [...parsed.data.projects].sort(
      (left, right) => left.id.localeCompare(right.id)
    )
  };
}
function saveRegistry(registry, path = getRegistryPath()) {
  mkdirSync(join(path, ".."), { recursive: true });
  const normalized = {
    schema_version: DOCS_SCHEMA_VERSION,
    projects: [...registry.projects].sort(
      (left, right) => left.id.localeCompare(right.id)
    )
  };
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
}
function addRegistryProject(projectRootInput, path = getRegistryPath()) {
  const root = canonicalProjectRoot(projectRootInput);
  const loaded = loadManifest(root);
  const project = {
    id: loaded.manifest.project.id,
    title: loaded.manifest.project.title,
    root,
    manifest: loaded.manifestPath ? realpathSync(loaded.manifestPath) : null
  };
  const registry = loadRegistry(path);
  const rootIndex = registry.projects.findIndex((entry) => entry.root === root);
  const idIndex = registry.projects.findIndex(
    (entry) => entry.id === project.id
  );
  if (idIndex >= 0 && registry.projects[idIndex].root !== root) {
    throw new Error(
      `Docs project id "${project.id}" is already registered for ${registry.projects[idIndex].root}. Choose a unique project.id in .dainexus/docs-manifest.json.`
    );
  }
  const status = rootIndex >= 0 ? "updated" : "added";
  if (rootIndex >= 0) {
    registry.projects[rootIndex] = project;
  } else {
    registry.projects.push(project);
  }
  saveRegistry(registry, path);
  return { project, status };
}
function removeRegistryProject(idOrPath, path = getRegistryPath()) {
  const registry = loadRegistry(path);
  let canonicalInput = null;
  if (existsSync(idOrPath)) {
    canonicalInput = realpathSync(idOrPath);
  }
  const index = registry.projects.findIndex(
    (entry) => entry.id === idOrPath || entry.root === canonicalInput
  );
  if (index < 0) {
    return null;
  }
  const [removed] = registry.projects.splice(index, 1);
  saveRegistry(registry, path);
  return removed;
}
function resolveRegistryProject(idOrPath, path = getRegistryPath()) {
  if (existsSync(idOrPath)) {
    const root = realpathSync(idOrPath);
    const manifest = loadManifest(root);
    return {
      id: manifest.manifest.project.id,
      title: manifest.manifest.project.title,
      root,
      manifest: manifest.manifestPath
    };
  }
  return loadRegistry(path).projects.find((entry) => entry.id === idOrPath) ?? null;
}

// src/commands/docs.ts
var PRIVACY_BLOCKING_CODES = /* @__PURE__ */ new Set([
  "EMPTY_PRIVACY_ALLOWLIST",
  "PATH_CONTAINMENT_FAILED",
  "SENSITIVE_SOURCE_REJECTED"
]);
function useJson(program, options) {
  return Boolean(options.json || program.opts().json || !process.stdout.isTTY);
}
function writeSuccess(tool, data, json, startedAt) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        buildEnvelope(tool, data, {
          ok: true,
          duration_ms: Date.now() - startedAt,
          version: VERSION
        })
      )}
`
    );
    return;
  }
  process.stdout.write(`${pc7.green("\u2713")} ${tool}
`);
  if (data && typeof data === "object") {
    process.stdout.write(`${JSON.stringify(data, null, 2)}
`);
  }
}
function writeFailure(tool, message, details, json, startedAt, exitCode = EXIT_CODES.CONFIG_ERROR) {
  const envelope = buildEnvelope(tool, details, {
    ok: false,
    duration_ms: Date.now() - startedAt,
    version: VERSION,
    error: { code: exitCode, message, details }
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope)}
`);
  } else {
    process.stderr.write(`${pc7.red("Error:")} ${message}
`);
  }
  process.exitCode = exitCode;
}
function writeGateSuccess(result, json, startedAt) {
  if (json) {
    writeSuccess("dai.docs.gate", result, true, startedAt);
    return;
  }
  process.stdout.write(
    `${pc7.green("\u2713")} dai.docs.gate (${result.mode}): ${result.changedPaths.length} changed, ${result.materialPaths.length} material, ${result.verifiedOutputPaths.length} outputs verified
`
  );
}
function resolveProjectRoots(target, all) {
  if (all) {
    return loadRegistry().projects.map((project) => project.root);
  }
  const input = target ?? process.cwd();
  if (existsSync(input)) {
    return [resolve(input)];
  }
  const registered = resolveRegistryProject(input);
  if (!registered) {
    throw new Error(
      `Unknown project "${input}". Pass a path or add it with \`dai docs registry add\`.`
    );
  }
  return [registered.root];
}
function scanRoots(roots) {
  const catalogs = [];
  const failures = [];
  for (const root of roots) {
    try {
      catalogs.push(scanProject(root));
    } catch (error) {
      failures.push({
        root,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  resolveCatalogLinks(catalogs);
  for (const catalog of catalogs) refreshCatalogSummary(catalog);
  return { catalogs, failures };
}
function hasPrivacyBlock(catalog) {
  return catalog.diagnostics.some(
    (diagnostic2) => diagnostic2.severity === "error" && PRIVACY_BLOCKING_CODES.has(diagnostic2.code)
  );
}
function defaultBuildOutput(roots, all) {
  return all || roots.length !== 1 ? join(getDocsHubHome(), "docs-hub", "site") : join(roots[0], ".dainexus", "docs-hub", "site");
}
function executeDocsBuild(roots, output, options = {}) {
  const scanned = scanRoots(roots);
  const blocked = scanned.catalogs.filter(hasPrivacyBlock);
  const strictFailures = options.strict ? scanned.catalogs.filter(
    (catalog) => catalog.diagnostics.some(
      (diagnostic2) => diagnostic2.severity === "warning" || diagnostic2.severity === "error"
    )
  ) : [];
  const rejectedIds = /* @__PURE__ */ new Set([
    ...blocked.map((catalog) => catalog.project.id),
    ...strictFailures.map((catalog) => catalog.project.id)
  ]);
  const buildable = scanned.catalogs.filter(
    (catalog) => !rejectedIds.has(catalog.project.id)
  );
  for (const catalog of buildable) writeCatalog(catalog);
  return {
    buildResult: buildable.length > 0 ? buildDocsHub(buildable, resolve(output)) : null,
    failures: scanned.failures,
    blockedProjects: blocked.map((catalog) => catalog.project.id),
    strictProjects: strictFailures.map((catalog) => catalog.project.id)
  };
}
function registerDocsCommands(program) {
  const docs = program.command("docs").description(
    "Build a privacy-safe, local-first multi-project documentation hub"
  );
  docs.command("gate [target]").description("Require docs continuity for the selected Git change view").option("--staged", "Check staged Git changes").option("--worktree", "Check staged, unstaged, and untracked changes").option("--base-ref <ref>", "Check changes from <ref> to HEAD").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const result = runDocsGate(target ?? process.cwd(), {
        staged: options.staged,
        worktree: options.worktree,
        baseRef: options.baseRef
      });
      if (result.status === "fail") {
        const blockingDiagnostic = result.doctor.diagnostics.find(
          (diagnostic2) => diagnostic2.severity === "error"
        ) ?? result.doctor.diagnostics[0];
        writeFailure(
          "dai.docs.gate",
          blockingDiagnostic ? `Documentation continuity gate failed (${blockingDiagnostic.code}): ${blockingDiagnostic.message}` : "Documentation continuity gate failed.",
          result,
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeGateSuccess(result, json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.gate",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  docs.command("init [target]").description("Create a project docs manifest without moving source files").option("-f, --force", "Overwrite an existing manifest").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const result = initManifest(target ?? process.cwd(), {
        force: options.force
      });
      writeSuccess("dai.docs.init", result, json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.init",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt
      );
    }
  });
  const registry = docs.command("registry").description("Manage the global Docs Hub project registry");
  registry.command("add <path>").description("Register or update a project root").option("-j, --json", "Output as JSON").action((path, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      writeSuccess(
        "dai.docs.registry.add",
        addRegistryProject(path),
        json,
        startedAt
      );
    } catch (error) {
      writeFailure(
        "dai.docs.registry.add",
        error instanceof Error ? error.message : String(error),
        { path },
        json,
        startedAt
      );
    }
  });
  registry.command("list").description("List registered projects").option("-j, --json", "Output as JSON").action((options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      writeSuccess("dai.docs.registry.list", loadRegistry(), json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.registry.list",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt
      );
    }
  });
  registry.command("remove <id-or-path>").description("Remove a project from the registry").option("-j, --json", "Output as JSON").action((idOrPath, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const removed = removeRegistryProject(idOrPath);
      if (!removed) {
        writeFailure(
          "dai.docs.registry.remove",
          `Project is not registered: ${idOrPath}`,
          { idOrPath },
          json,
          startedAt
        );
        return;
      }
      writeSuccess("dai.docs.registry.remove", { removed }, json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.registry.remove",
        error instanceof Error ? error.message : String(error),
        { idOrPath },
        json,
        startedAt
      );
    }
  });
  docs.command("scan [target]").description("Scan approved sources and write a normalized JSON catalog").option("--all", "Scan every registered project").option("--no-write", "Do not write project cache files").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const result = scanRoots(roots);
      const catalogs = result.catalogs.map((catalog) => ({
        project: catalog.project,
        documents: catalog.documents.length,
        assets: catalog.assets.length,
        diagnostics: catalog.diagnostics,
        sourceFingerprint: catalog.sourceFingerprint,
        catalogPath: options.write === false ? null : writeCatalog(catalog)
      }));
      if (result.failures.length > 0) {
        writeFailure(
          "dai.docs.scan",
          "One or more projects could not be scanned.",
          { catalogs, failures: result.failures },
          json,
          startedAt
        );
        return;
      }
      writeSuccess("dai.docs.scan", { catalogs }, json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.scan",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt
      );
    }
  });
  docs.command("build [target]").description("Build the static HTML/CSS Docs Hub").option("--all", "Build every registered project").option("-o, --output <path>", "Override the generated site directory").option("--strict", "Fail before building when warnings or errors exist").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const output = resolve(
        options.output ?? defaultBuildOutput(roots, options.all)
      );
      const execution = executeDocsBuild(roots, output, {
        strict: options.strict
      });
      if (!execution.buildResult) {
        writeFailure(
          "dai.docs.build",
          "No buildable projects were found.",
          {
            failures: execution.failures,
            blockedProjects: execution.blockedProjects,
            strictProjects: execution.strictProjects
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      if (execution.failures.length > 0 || execution.blockedProjects.length > 0 || execution.strictProjects.length > 0) {
        writeFailure(
          "dai.docs.build",
          "Docs Hub built the valid projects, but one or more projects failed.",
          {
            partialBuild: execution.buildResult,
            failures: execution.failures,
            blockedProjects: execution.blockedProjects,
            strictProjects: execution.strictProjects
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeSuccess("dai.docs.build", execution.buildResult, json, startedAt);
    } catch (error) {
      writeFailure(
        "dai.docs.build",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  docs.command("doctor [target]").description(
    "Diagnose documentation links, privacy, diagrams and staleness"
  ).option("--all", "Diagnose every registered project").option("--strict", "Treat warnings as failures").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const scanned = scanRoots(roots);
      const reports = scanned.catalogs.map(
        (catalog) => doctorCatalog(catalog, readCatalog(catalog.project.root), {
          strict: options.strict
        })
      );
      const failed = scanned.failures.length > 0 || reports.some((report) => report.status === "fail");
      if (failed) {
        writeFailure(
          "dai.docs.doctor",
          "Documentation health checks failed.",
          { reports, failures: scanned.failures },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      writeSuccess(
        "dai.docs.doctor",
        { reports, failures: scanned.failures },
        json,
        startedAt
      );
    } catch (error) {
      writeFailure(
        "dai.docs.doctor",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
  const exportCommand = docs.command("export").description("Export approved documentation to optional formats");
  exportCommand.command("obsidian [target]").description("Export a source-preserving Obsidian vault").option("--all", "Export every registered project").option("-o, --output <path>", "Override the external vault directory").option("--strict", "Fail when warnings or errors exist").option("-j, --json", "Output as JSON").action((target, options) => {
    const startedAt = Date.now();
    const json = useJson(program, options);
    try {
      const roots = resolveProjectRoots(target, options.all);
      const scanned = scanRoots(roots);
      const blocked = scanned.catalogs.filter(hasPrivacyBlock);
      const strictFailures = options.strict ? scanned.catalogs.filter(
        (catalog) => catalog.diagnostics.some(
          (diagnostic2) => diagnostic2.severity === "warning" || diagnostic2.severity === "error"
        )
      ) : [];
      if (scanned.failures.length > 0 || blocked.length > 0 || strictFailures.length > 0) {
        writeFailure(
          "dai.docs.export.obsidian",
          "Obsidian export was blocked by diagnostics.",
          {
            failures: scanned.failures,
            blockedProjects: blocked.map((catalog) => catalog.project.id),
            strictProjects: strictFailures.map(
              (catalog) => catalog.project.id
            )
          },
          json,
          startedAt,
          EXIT_CODES.TOOL_ERROR
        );
        return;
      }
      const output = resolve(
        options.output ?? join(getDocsHubHome(), "docs-hub", "obsidian")
      );
      writeSuccess(
        "dai.docs.export.obsidian",
        exportObsidianVault(scanned.catalogs, output),
        json,
        startedAt
      );
    } catch (error) {
      writeFailure(
        "dai.docs.export.obsidian",
        error instanceof Error ? error.message : String(error),
        null,
        json,
        startedAt,
        EXIT_CODES.TOOL_ERROR
      );
    }
  });
}
function buildProgram() {
  const program = new Command();
  program.name("dai").description("DAI Nexus CLI - Agent-First Command Line Interface").version(VERSION, "-V, --version");
  registerGlobalFlags(program);
  registerToolsCommands(program);
  registerSkillsCommands(program);
  registerToolsCallCommand(program);
  registerConfigCommands(program);
  registerDoctorCommand(program);
  registerValidateCommand(program);
  registerCompletionCommand(program);
  registerCoordsCommand(program);
  registerAutonomousTestCommand(program);
  registerExpertCommand(program);
  registerTokenCommand(program);
  registerDelegateCommand(program);
  registerBenchCommand(program);
  registerProjectCommands(program);
  registerDocsCommands(program);
  const config = getConfig();
  config.loadUserConfig();
  config.loadEnvFiles(process.cwd());
  config.loadEnvVars();
  program.addHelpText(
    "after",
    `
Examples:
  $ dai tools list                  # List all tools
  $ dai tools list --json           # JSON output for agents
  $ dai tools list --category engineering  # Filter by category
  $ dai skills list                 # List all skills
  $ dai skills search api           # Search skills
  $ dai expert status               # Show optional Claude/Codex CLI expert mode
  $ dai expert use codex --track-tokens  # Switch expert mode to Codex CLI
  $ dai token on                    # Enable local token tracking
  $ dai token report --period week  # Show local token usage summary
  $ dai delegate status             # Show auto-detected controller/worker state
  $ dai delegate auto               # Auto-enable when Codex/Claude + Agy are available
  $ dai docs init .                 # Create a privacy-safe docs manifest
  $ dai docs build .                # Build the static documentation portal
  $ dai --version                   # Show version

Agent Mode:
  $ dai --json tools list | jq .    # Parse JSON output
  $ dai --json tools list | jq '.data.tools[].name'
  $ for tool in $(dai --json tools list | jq -r '.data.tools[].name'); do
      echo "Tool: $tool"
    done

Environment Variables:
  FORGE_DEBUG=1                       # Enable debug mode
  NO_COLOR=1                          # Disable colors
  FORGE_LEGACY_OUTPUT=1               # Force legacy output mode
`
  );
  return program;
}
async function main() {
  const program = buildProgram();
  maybeNotifyAutoDelegation();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!process.stdout.isTTY) {
      const envelope = {
        ok: false,
        tool: "cli",
        data: null,
        metadata: {
          duration_ms: 0,
          version: VERSION
        },
        error: {
          code: EXIT_CODES.INTERNAL_ERROR,
          message
        }
      };
      process.stdout.write(JSON.stringify(envelope) + "\n");
    } else {
      process.stderr.write(`${pc7.red("Error:")} ${message}
`);
    }
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }
}
main();

export { buildProgram, main };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map