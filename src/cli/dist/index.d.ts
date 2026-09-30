import { Command } from 'commander';

/**
 * DAI Harness CLI - Agent-First Command Line Interface
 *
 * Dual-purpose:
 * • Humans: colored pretty output, spinners, sensible defaults
 * • Agents: --json for structured envelopes, non-TTY auto-detection, stable exit codes
 */

declare function buildProgram(): Command;
declare function main(): Promise<void>;

export { buildProgram, main };
