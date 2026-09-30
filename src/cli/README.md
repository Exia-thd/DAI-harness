# DAI Harness CLI - Agent-First Command Line Interface

> **Version:** 2.0.0-alpha.1
> **Status:** Alpha

Dual-purpose CLI designed for both humans and AI agents.

## Features

- **Tool Registry** - Discover and invoke 21+ tools
- **JSON Output** - Machine-readable for AI agents
- **Standardized Exit Codes** - 0-7 for error handling
- **Config Layering** - 5-source priority system
- **Shell Completions** - bash, zsh, fish

## Installation

```bash
# From source
cd src/cli
npm install
npm run build

# Link globally
npm link
```

## Quick Start

### Human Mode

```bash
dai tools list
dai skills list
dai doctor
dai validate --level 3
```

### Agent Mode

```bash
# Tool discovery
dai tools list --json | jq '.data.tools[].name'

# Structured output
dai doctor --json

# Quality gate
dai validate --level 3 --json | jq '.data.score'
```

## Commands

### Tools

```bash
dai tools list                          # List all tools
dai tools list --category engineering    # Filter by category
dai tools list --search api             # Search tools
dai tools:call skills.list              # Call a tool
dai tools:call skills.list --args '{}'   # Call with args
```

### Skills

```bash
dai skills list                          # List all skills
dai skills list --category engineering  # Filter by category
dai skills search api                   # Search skills
dai skills categories                   # List categories
```

### Config

```bash
dai config list                          # List all config
dai config get dai.debug              # Get value
dai config set dai.debug true         # Set value
dai config init                          # Create config file
dai config delete dai.debug           # Delete value
```

### Doctor

```bash
dai doctor                               # Run diagnostics
dai doctor --verbose                    # Verbose output
dai doctor --json                       # JSON output
```

### Validate

```bash
dai validate                             # Run all checks
dai validate --level 1                  # Build only
dai validate --level 2                  # + Regression
dai validate --level 3                  # + Standards
dai validate --strict                   # Treat warnings as errors
dai validate --json                     # JSON output
dai validate --report report.json       # Save report
```

### Completion

```bash
# Bash
source <(dai completion bash)

# Zsh
source <(dai completion zsh)

# Fish
dai completion fish > ~/.config/fish/completions/dai.fish
```

## Global Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--json` | `-j` | Force JSON output (agent mode) |
| `--no-color` | | Disable colored output |
| `--quiet` | `-q` | Suppress stdout |
| `--debug` | | Enable debug mode |
| `--version` | `-V` | Show version |
| `--help` | `-h` | Show help |

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | OK | Success |
| 1 | TOOL_ERROR | Tool execution failed |
| 2 | USAGE_ERROR | Invalid arguments |
| 3 | CONFIG_ERROR | Configuration error |
| 4 | AUTH_ERROR | Authentication error |
| 5 | TIMEOUT | Operation timed out |
| 6 | MISSING_DEPENDENCY | Required dependency not found |
| 7 | INTERNAL_ERROR | Internal error |

## Configuration

### Config Sources (Priority)

1. Environment variables (`FORGE_*`)
2. User config (`~/.config/dai-harness/config.json`)
3. Process environment
4. `.env` files
5. Inline flags

### Environment Variables

```bash
FORGE_DEBUG=1           # Enable debug mode
FORGE_LEGACY_OUTPUT=1   # Force legacy output
NO_COLOR=1              # Disable colors
```

## JSON Envelope

All commands return a standardized JSON envelope:

```json
{
  "ok": true,
  "tool": "doctor.check",
  "data": { ... },
  "metadata": {
    "duration_ms": 123,
    "version": "2.0.0-alpha.1"
  },
  "error": null
}
```

## Tool Registry

| Category | Tools |
|----------|-------|
| orchestration | orchestrator.execute, skills.list, skills.search, validate.quality, config.*, doctor.check |
| engineering | engineering.software, engineering.frontend, engineering.qa, engineering.security |
| devops | devops.deploy, devops.database |
| ai-ml | ai.engineer, ai.prompt |
| game-dev | game.design, game.unity, game.unreal |
| meta | meta.polymath, meta.memory |

## Examples

### AI Agent Workflow

```bash
#!/bin/bash

# 1. Check system
dai doctor --json || exit 1

# 2. List tools
TOOLS=$(dai tools list --json | jq -r '.data.tools[].name')

# 3. Run validation
dai validate --level 3 --json || {
  echo "Validation failed"
  exit 1
}

# 4. Get results
SCORE=$(dai validate --level 3 --json | jq '.data.score')
echo "Score: $SCORE"
```

### Python Integration

```python
import subprocess
import json

def dai_command(cmd: list) -> dict:
    result = subprocess.run(
        ["dai", "--json"] + cmd,
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

# Usage
tools = dai_command(["tools", "list"])
doctor = dai_command(["doctor"])
validate = dai_command(["validate", "--level", "3"])
```

## Development

```bash
cd src/cli

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Test
npm test
```

## License

MIT
