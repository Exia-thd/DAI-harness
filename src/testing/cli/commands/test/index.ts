/**
 * DAI Test CLI Commands
 * 
 * Usage:
 *   dai test setup     - Initialize test infrastructure
 *   dai test run       - Run all tests
 *   dai test unit       - Run unit tests
 *   dai test e2e        - Run E2E tests
 *   dai test heal       - Run self-healing
 *   dai test agents     - Run agentic testing
 */

export interface TestCLIConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'minimax';
  model?: string;
  verbose?: boolean;
  ci?: boolean;
}

export const CLI_COMMANDS = {
  setup: {
    name: 'setup',
    description: 'Initialize test infrastructure',
    options: [
      { name: '--provider', description: 'LLM provider (openai|anthropic|gemini|ollama|minimax)' },
      { name: '--skip-install', description: 'Skip npm install' },
    ],
  },
  run: {
    name: 'run',
    description: 'Run all tests with auto-fix',
    options: [
      { name: '--layer', description: 'Test layer (unit|e2e|integration|all)' },
      { name: '--provider', description: 'LLM provider' },
      { name: '--heal', description: 'Enable self-healing' },
      { name: '--agents', description: 'Enable agentic testing' },
    ],
  },
  heal: {
    name: 'heal',
    description: 'Run self-healing engine',
    options: [
      { name: '--threshold', description: 'Similarity threshold (0-1)' },
      { name: '--cache', description: 'Enable healing cache' },
    ],
  },
  agents: {
    name: 'agents',
    description: 'Run SEER agentic orchestration',
    options: [
      { name: '--role', description: 'Agent role (test-pilot|api-builder|rover|healer)' },
      { name: '--rounds', description: 'Committee voting rounds' },
    ],
  },
  autonomous: {
    name: 'autonomous',
    description: 'Full autonomous testing mode',
    options: [
      { name: '--monitor', description: 'Enable production monitoring' },
      { name: '--red-team', description: 'Enable AI Red Teamer' },
    ],
  },
} as const;

export type CLICommand = keyof typeof CLI_COMMANDS;

/**
 * Parse CLI arguments
 */
export function parseArgs(args: string[]): {
  command: CLICommand | null;
  config: TestCLIConfig;
  rawArgs: string[];
} {
  const [command, ...rest] = args;
  
  const config: TestCLIConfig = {
    provider: 'openai',
    verbose: false,
    ci: process.env.CI === 'true',
  };
  
  const rawArgs: string[] = [];
  
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    
    if (arg === '--provider') {
      const provider = rest[++i];
      if (['openai', 'anthropic', 'gemini', 'ollama', 'minimax'].includes(provider)) {
        config.provider = provider as TestCLIConfig['provider'];
      }
    } else if (arg === '--model') {
      config.model = rest[++i];
    } else if (arg === '--verbose') {
      config.verbose = true;
    } else if (arg === '--ci') {
      config.ci = true;
    } else {
      rawArgs.push(arg);
    }
  }
  
  return {
    command: command as CLICommand,
    config,
    rawArgs,
  };
}

/**
 * Print CLI help
 */
export function printHelp(): void {
  console.log(`
DAI Harness Testing CLI

Usage:
  dai test <command> [options]

Commands:
${Object.entries(CLI_COMMANDS)
  .map(([_, cmd]) => `  ${cmd.name.padEnd(15)} ${cmd.description}`)
  .join('\n')}

Options:
  --provider <name>   LLM provider (openai|anthropic|gemini|ollama|minimax)
  --model <name>      Specific model to use
  --verbose           Verbose output
  --ci                CI mode (optimized for CI)

Examples:
  dai test setup --provider minimax
  dai test run --layer unit --heal
  dai test agents --role healer
  dai test autonomous --monitor --red-team

For more information, see: https://github.com/Exia-thd/DAI-harness
`);
}
