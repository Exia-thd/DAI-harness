# MCP Setup Technical Reference

> Detailed technical documentation for DAI Nexus MCP setup across Cursor, Claude Code, Antigravity, and OpenAI Codex CLI.

## Table of Contents

- [Architecture](#architecture)
- [File Structure](#file-structure)
- [Launcher Scripts](#launcher-scripts)
- [Manifest Format](#manifest-format)
- [IDE Configuration](#ide-configuration)
- [Environment Variables](#environment-variables)
- [Exit Codes](#exit-codes)
- [ShellCheck Compliance](#shellcheck-compliance)

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AI IDE (Cursor/Claude)               │
└─────────────────────────────────────────────────────────┘
                           │
                           │ MCP Protocol (stdio)
                           ▼
┌─────────────────────────────────────────────────────────┐
│              dainexus-mcp-launcher.sh                │
│                                                         │
│  Detects workspace:                                     │
│  1. DAINEXUS_WORKSPACE env var                       │
│  2. MCP_WORKSPACE_ROOT env var                          │
│  3. Git repository root                                │
│  4. Current working directory                           │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ DAI Nexus │ │ DAI Nexus Node│ │ Antigrav │
        │   MCP      │ │   MCP    │ │  Manifest│
        └──────────┘ └──────────┘ └──────────┘
```

### Multi-Project Support

Each project has isolated configuration:

```
~/.cursor/mcp.json (global)
└── dai-nexus → dainexus-mcp-launcher.sh

Project A/.antigravity/mcp-manifest.json
Project B/.antigravity/mcp-manifest.json
Project C/.antigravity/mcp-manifest.json
```

---

## File Structure

### Setup Creates

```
project/
├── .antigravity/
│   └── mcp-manifest.json      # MCP server manifest
├── .dainexus/
│   ├── settings.env            # DAI Nexus settings
│   └── mcp-server/            # Generated MCP server
└── .memory/                      # DAI memory: code graph + project memory
    ├── meta.json
    └── store.lbug
```

### Script Location

```
dai-nexus/
├── scripts/
│   ├── dainexus-mcp-setup.sh                    # Unified MCP manager
│   ├── dainexus-mcp-launcher.sh                 # MCP launcher
│   └── templates/
│       ├── mcp.cursor.json          # Cursor config template
│       ├── mcp.claude.json          # Claude config template
│       └── mcp.antigravity.json    # Antigravity template
```

---

## Launcher Scripts

### dainexus-mcp-launcher.sh

Main launcher that routes to DAI Nexus MCP server.

**Key Functions:**
1. Detect DAI Nexus directory
2. Detect workspace (env/git/cwd)
3. Find/create manifest
4. Execute MCP server

**Environment Variables:**
- `DAINEXUS_WORKSPACE` - Override workspace
- `DAINEXUS_DEBUG=1` - Enable debug output

### Code-intelligence launcher — not shipped

Earlier revisions documented a second launcher for a bundled code-intelligence
server. That module is not part of this repository: code intelligence is
provided by the DAI memory layer (`vendor/dai-memory`), which the setup script
registers as its own `dai-memory` server. `.cursor/` still
carries a dead entry point for the removed module — see the audit notes in
`.dainexus/plan-lessons.md`.

---

## Manifest Format

### Version 2.0

```json
{
  "manifest_version": "2.0",
  "workspace": "/absolute/path/to/project",
  "dai-nexus_path": "/path/to/dai-nexus",
  "generated_at": "2026-05-07T10:00:00Z",
  "dai-nexus_version": "8.3.0",
  "servers": [
    {
      "name": "dai-nexus",
      "type": "dai-nexus",
      "enabled": true,
      "description": "DAI Nexus project intelligence"
    },
    {
      "name": "dainexus-node",
      "type": "dainexus-node",
      "enabled": true,
      "description": "Code intelligence graph"
    }
  ]
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `manifest_version` | Yes | Version of manifest format (2.0) |
| `workspace` | Yes | Absolute path to project |
| `dai-nexus_path` | Yes | Absolute path to DAI Nexus |
| `generated_at` | Yes | ISO-8601 timestamp |
| `dai-nexus_version` | No | DAI Nexus version |
| `servers` | Yes | Array of MCP servers |

### Server Entry

```json
{
  "name": "server-name",
  "type": "dai-nexus|dainexus-node|custom",
  "enabled": true,
  "description": "What this server does",
  "config": {}
}
```

---

## IDE Configuration

### Cursor

**Config File:** `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "dai-nexus": {
      "command": "bash",
      "args": ["/path/to/dai-nexus/scripts/dainexus-mcp-launcher.sh"]
    }
  }
}
```

### Claude Desktop

**Config File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dai-nexus": {
      "command": "bash",
      "args": ["/path/to/dai-nexus/scripts/dainexus-mcp-launcher.sh"]
    }
  }
}
```

### Antigravity

**Config Location:** `~/.cursor/projects/<hash>/mcps/user-dai-nexus/`

Antigravity uses the **canonical MCP server** at `~/.dainexus/mcp-server/src/index.ts`. The per-project manifest (`.antigravity/mcp-manifest.json`) provides workspace context only — it does NOT contain a separate server.

#### Canonical Server Rule

```
~/.dainexus/mcp-server/src/index.ts  ← CANONICAL (single source of truth)
│
├── ~/.cursor/mcp.json              → Cursor
├── ~/.claude/settings.json        → Claude Code
└── Antigravity project workspace   → Manifest provides context, server is canonical
```

**Key points:**
- `.antigravity/mcp-manifest.json` stores project metadata (workspace, dai-nexus path) — NOT server code
- Antigravity launcher `~/.cursor/projects/<hash>/mcps/user-dai-nexus/launcher.sh` uses the canonical server
- Never point Antigravity to a submodule DAI Nexus path

#### Setup Command

```bash
bash dai-nexus/scripts/dainexus-mcp-setup.sh --antigravity
```

#### Verify

```bash
bash dai-nexus/scripts/dainexus-mcp-setup.sh --check
```

### OpenAI Codex CLI

**Config Location:** `~/.codex/config.toml`

OpenAI Codex CLI uses the **canonical MCP server** at `~/.dainexus/mcp-server/src/index.ts`. Codex uses TOML config format.

#### Canonical Server Rule

```
~/.dainexus/mcp-server/src/index.ts  ← CANONICAL (single source of truth)
│
├── ~/.cursor/mcp.json              → Cursor
├── ~/.claude/settings.json        → Claude Code
└── ~/.codex/config.toml            → OpenAI Codex CLI (TOML)
```

#### Config Format

```toml
[mcp_servers.dainexus]
enabled = true
transport = { type = "stdio" }
command = "~/.dainexus/mcp-server/node_modules/.bin/tsx"
args = ["~/.dainexus/mcp-server/src/index.ts"]
env = { DAINEXUS_WORKSPACE = "$PROJECT_ROOT" }

[mcp_servers.dai-memory]
enabled = true
transport = { type = "stdio" }
command = "/usr/local/bin/node"
args = ["~/.cache/dai-harness/dai-memory/<commit>/bin/dai-memory.mjs", "serve"]
```

**Note:** Codex CLI only supports **STDIO transport** for local MCP servers. Remote HTTP/SSE servers are not yet supported.

#### Setup Command

```bash
bash dai-nexus/scripts/dainexus-mcp-setup.sh --codex
```

#### Verify

```bash
bash dai-nexus/scripts/dainexus-mcp-setup.sh --check
# or native
codex mcp list
```

---

## Environment Variables

### Workspace Detection

| Variable | Priority | Description |
|----------|----------|-------------|
| `DAINEXUS_WORKSPACE` | 1 | DAI Nexus workspace override |
| `MCP_WORKSPACE_ROOT` | 2 | MCP standard workspace |
| `CLAUDE_DESKTOP_WORKSPACE` | 3 | Claude Desktop workspace |
| Git root | 4 | Auto-detected from `.git` |
| PWD | 5 | Current directory |

### Debug Options

| Variable | Values | Effect |
|----------|--------|--------|
| `DAINEXUS_DEBUG` | 0, 1 | Enable debug output in launcher |
| `FW_MCP_VERBOSE` | 0, 1 | Verbose output for dainexus-mcp-setup.sh |

---

## Exit Codes

### dainexus-mcp-setup.sh

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Prerequisites missing |

---

## ShellCheck Compliance

All scripts comply with ShellCheck standards:

### Shebang
```bash
#!/usr/bin/env bash  # Not #!/bin/bash
```

### Error Handling
```bash
set -euo pipefail  # Strict error handling
```

### Variable Quoting
```bash
# Always quote
echo "$variable"
[[ -f "$file" ]]

# Use ${var:-default} for defaults
path="${DAINEXUS_DIR:-/default}"
```

### Path Handling
```bash
# Use absolute paths
resolved="$(cd "$(dirname "$script")" && pwd -P)"

# Quote all expansions
command -v "$cmd" &> /dev/null
```

### No Bash-isms
```bash
# Avoid (breaks on sh):
[[ ]]           # Use [ ]
${var//a/b}    # Use external tools
arrays          # Use positional params

# Use instead:
[ "$a" = "$b" ]
echo "$var" | sed 's/a/b/'
set -- "item1" "item2"
```

---

## Testing

### Test Scripts

```bash
# Test help
bash dainexus-mcp-setup.sh --help

# Test check
bash dainexus-mcp-setup.sh --check

# Test diagnose
bash dainexus-mcp-setup.sh --diagnose

# Test wizard (non-interactive)
echo "" | bash dainexus-mcp-setup.sh wizard
```

### ShellCheck

```bash
# Check scripts
shellcheck scripts/dainexus-mcp-setup.sh
shellcheck scripts/dainexus-mcp-launcher.sh
```

### Integration Test

```bash
# Create test project
mkdir /tmp/fw-test
cd /tmp/fw-test
git init

# Run setup
bash /path/to/dai-nexus/scripts/dainexus-mcp-setup.sh setup

# Verify
bash /path/to/dai-nexus/scripts/dainexus-mcp-setup.sh --check

# Clean up
cd /
rm -rf /tmp/fw-test
```

---

## Troubleshooting Reference

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `command not found: node` | Node.js not installed | Install from nodejs.org |
| `launcher not found` | Wrong path | Re-run setup |
| `workspace mismatch` | Manifest stale | `dainexus-mcp-setup.sh setup --force` |
| `npm install failed` | Network/proxy | Check npm config |

### Debug Commands

```bash
# Verbose output
FW_MCP_VERBOSE=1 bash dainexus-mcp-setup.sh --diagnose

# Debug launcher
DAINEXUS_DEBUG=1 bash scripts/dainexus-mcp-launcher.sh

# Debug DAI Nexus Node
```

---

## See Also

- [Setup Guide](SETUP.md) - User documentation
- [Quick Start](SETUP-QUICK.md) - Fast setup
- Code intelligence is provided by the DAI memory layer — see `.claude/skills/dai-memory/dai-memory-guide/SKILL.md` and [the guide](guides/dai-memory.md)
