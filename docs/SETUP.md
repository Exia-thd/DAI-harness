# DAI Harness MCP Setup Guide

> Complete guide to setting up DAI Harness MCP (Model Context Protocol) for your AI IDE.

## Table of Contents

- [Quick Start (5 minutes)](#quick-start-5-minutes)
- [Prerequisites](#prerequisites)
- [IDE-Specific Setup](#ide-specific-setup)
  - [Cursor](#cursor)
  - [Claude Desktop](#claude-desktop)
  - [Antigravity](#antigravity)
- [Commands Reference](#commands-reference)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Quick Start (5 minutes)

### One-Command Setup

```bash
# Navigate to your project
cd /path/to/your/project

# Run the setup wizard
bash dai-harness/scripts/daiharness-mcp-setup.sh wizard

# Or use quick setup (all defaults)
bash dai-harness/scripts/daiharness-mcp-setup.sh setup
```

### Verify Installation

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
```

Expected output:
```
━━━ MCP Status ━━━
  ➜ Project: /path/to/project
  ✓ Manifest: ✓
  ✓ DAI Harness Launcher: ✓
  ✓ DAI memory: ✓ (code graph indexed at HEAD)
```

---

## Prerequisites

| Tool | Required | Version | Install |
|------|----------|---------|---------|
| Node.js | Yes | 20+ | [nodejs.org](https://nodejs.org) |
| npm | Yes | 8+ | Comes with Node.js |
| git | Recommended | Any | `brew install git` |

### Verify Prerequisites

```bash
node --version    # Should show v20+
npm --version     # Should show 8+
git --version     # Should show 2.x+
```

---

## IDE-Specific Setup

### Cursor

#### Option 1: Automated Setup (Recommended)

```bash
# From your project directory
cd /path/to/project
bash dai-harness/scripts/daiharness-mcp-setup.sh setup
```

This automatically:
1. Creates `.antigravity/mcp-manifest.json`
2. Updates `~/.cursor/mcp.json`

#### Option 2: Manual Setup

1. Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "dai-harness": {
      "command": "bash",
      "args": ["/path/to/dai-harness/scripts/daiharness-mcp-launcher.sh"]
    }
  }
}
```

2. The setup script also registers the code-graph server, `dai-memory`, and
installs its engine if it is missing (`python3 scripts/lite/dai_memory.py install`).
Index the project once:

```bash
dai-memory init
```

3. Restart Cursor

#### Verify Cursor Setup

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
```

Look for:
```
  ➜ IDE: cursor
  ✓ Config: ✓
  ✓ DAI Harness: configured
```

---

### Claude Desktop

#### Option 1: Automated Setup (Recommended)

```bash
cd /path/to/project
bash dai-harness/scripts/daiharness-mcp-setup.sh setup
```

#### Option 2: Manual Setup

1. Find your config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add dai-harness server:

```json
{
  "mcpServers": {
    "dai-harness": {
      "command": "bash",
      "args": ["/absolute/path/to/dai-harness/scripts/daiharness-mcp-launcher.sh"]
    }
  }
}
```

3. The setup script also registers the code-graph server, `dai-memory`, and
installs its engine if it is missing (`python3 scripts/lite/dai_memory.py install`).
Index the project once:

```bash
dai-memory init
```

4. Restart Claude Desktop

#### Verify Claude Setup

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
```

---

### Antigravity CLI

Antigravity CLI cũng dùng **canonical MCP server** tại `~/.daiharness/mcp-server/src/index.ts`. Không có server riêng cho Antigravity.

#### Canonical Server Rule

```
~/.daiharness/mcp-server/src/index.ts  ← CANONICAL (duy nhất, shared)
│
├── ~/.cursor/mcp.json              → Cursor points here
├── ~/.claude/settings.json        → Claude Code points here
└── ~/.cursor/projects/<hash>/mcps/user-dai-harness/  → Antigravity reads manifest for CONTEXT, uses canonical server
```

**Điểm quan trọng:**
- `.antigravity/mcp-manifest.json` chỉ chứa **project context** (workspace path, dai-harness path) — nó KHÔNG chứa server code riêng
- Antigravity launcher sử dụng `~/.daiharness/mcp-server/src/index.ts` — canonical server
- Manifest/isolation theo project chỉ để Antigravity biết workspace hiện tại, không override global server path

#### Automated Setup

```bash
cd /path/to/project
bash dai-harness/scripts/daiharness-mcp-setup.sh --antigravity
```

Hoặc setup tất cả platforms cùng lúc:

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh
```

#### How It Works

```
Antigravity reads .antigravity/mcp-manifest.json
                    ↓
        Reads workspace path + dai-harness path (CONTEXT ONLY)
                    ↓
        Starts daiharness-mcp-launcher.sh
                    ↓
        Launcher uses ~/.daiharness/mcp-server/src/index.ts (CANONICAL)
                    ↓
        MCP server starts with correct workspace context
```

#### Verify Antigravity Setup

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
```

Expected output:
```
━━━ MCP Status (All Platforms) ━━━
  ➜ Project: /path/to/project

  ✓ Cursor: ~/.cursor/mcp.json
    dai-harness: CONFIGURED
    dai-memory: CONFIGURED

  ✓ Claude Code: ~/.claude/settings.json
    dai-harness: CONFIGURED
    dai-memory: CONFIGURED

  ➜ Antigravity:
    ✓ Server: ~/.cursor/projects/<hash>/mcps/user-dai-harness/
    ✓ dai-harness: CONFIGURED

  ✓ Manifest: /path/to/project/.antigravity/mcp-manifest.json
```

#### Manual Config (if needed)

Nếu cần config thủ công, launcher vẫn phải dùng canonical server:

```json
{
  "mcpServers": {
    "dai-harness": {
      "command": "bash",
      "args": ["/path/to/dai-harness/scripts/daiharness-mcp-launcher.sh"],
      "env": {
        "DAIHARNESS_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

**⚠️ Never point Antigravity to a submodule DAI Harness path.** Luôn dùng canonical server hoặc launcher đã được setup script configure đúng.

---

### OpenAI Codex CLI

Codex CLI cũng dùng **canonical MCP server** tại `~/.daiharness/mcp-server/src/index.ts`. Config file: `~/.codex/config.toml` (TOML format).

#### Canonical Server Rule

```
~/.daiharness/mcp-server/src/index.ts  ← CANONICAL (duy nhất, shared)
│
├── ~/.cursor/mcp.json              → Cursor
├── ~/.claude/settings.json        → Claude Code
├── ~/.codex/config.toml           → OpenAI Codex CLI
└── Antigravity project workspace   → Manifest provides context, server là canonical
```

#### Setup Command

```bash
# Codex CLI only
bash dai-harness/scripts/daiharness-mcp-setup.sh --codex
```

Hoặc setup tất cả platforms cùng lúc:

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh
```

#### Verify Codex Setup

```bash
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
```

Hoặc dùng Codex CLI native:

```bash
codex mcp list
codex mcp get dai-harness
```

Expected output trong config:
```toml
[mcp_servers.daiharness]
enabled = true
transport = { type = "stdio" }
command = "~/.daiharness/mcp-server/node_modules/.bin/tsx"
args = ["~/.daiharness/mcp-server/src/index.ts"]
env = { DAIHARNESS_WORKSPACE = "$PROJECT_ROOT" }

[mcp_servers.dai-memory]
enabled = true
transport = { type = "stdio" }
command = "/usr/local/bin/node"
args = ["~/.cache/dai-harness/dai-memory/<commit>/bin/dai-memory.mjs", "serve"]
```

**Lưu ý:** Codex CLI chỉ hỗ trợ **STDIO transport** cho local servers. Remote MCP servers (HTTP/SSE) chưa được hỗ trợ.

---

## Multi-IDE Setup (Cursor + Claude + Antigravity + Codex)

If you use multiple AI IDEs with the same project, here's how it works:

### Architecture Overview

```
Project/
├── .antigravity/mcp-manifest.json    # Antigravity reads this
├── .daiharness/                    # Shared DAI Harness state
└── .memory/                         # DAI memory: code graph + project memory

~/.cursor/mcp.json                   # Cursor MCP config
~/.claude/settings.json             # Claude Code MCP config
~/.codex/config.toml                 # OpenAI Codex CLI MCP config
~/.cache/dai-harness/dai-memory/     # DAI memory engine, one directory per pinned commit
~/.daiharness/mcp-server/           # CANONICAL MCP server (shared by all)
```

### Setup Steps

#### Step 1: Run Setup Once

```bash
cd /path/to/project
bash dai-harness/scripts/daiharness-mcp-setup.sh setup
```

This creates the shared files:
- `.antigravity/mcp-manifest.json`
- `.daiharness/fw-mcp-launcher.sh`
- `.memory/` (after `dai-memory init`: code graph + project memory)

#### Step 2: Restart All IDEs

```
1. Quit Cursor completely (Cmd+Q)
2. Quit Claude Desktop completely
3. Restart Antigravity (if running)
```

#### Step 3: Verify All IDEs

Each IDE will automatically detect the workspace and load the correct context.

### How Each IDE Loads MCP

| IDE | Config Location | Auto-Detection |
|-----|---------------|-----------------|
| **Cursor** | `~/.cursor/mcp.json` | Updated by `daiharness-mcp-setup.sh` |
| **Claude Desktop** | `~/.config/Claude/...` | Updated by `daiharness-mcp-setup.sh` |
| **Antigravity** | `.antigravity/` | Reads manifest automatically |

### Workspace Detection Per IDE

```
┌─────────────────────────────────────────────────────────────┐
│ Cursor                                                      │
│   ↓ ~/.cursor/mcp.json → daiharness-mcp-launcher.sh      │
│   ↓ Workspace: git rev-parse --show-toplevel               │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Claude Desktop                                              │
│   ↓ ~/.config/Claude/... → daiharness-mcp-launcher.sh    │
│   ↓ Workspace: git rev-parse --show-toplevel               │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Antigravity                                                 │
│   ↓ Reads .antigravity/mcp-manifest.json                   │
│   ↓ Sets DAIHARNESS_WORKSPACE env var                     │
│   ↓ daiharness-mcp-launcher.sh uses this env var          │
│   ↓ Project context loaded                                 │
└─────────────────────────────────────────────────────────────┘
```

### Benefits of Shared Setup

| Feature | Benefit |
|---------|---------|
| **Shared code graph** | `.memory/` index works across all IDEs |
| **Shared manifest** | Antigravity auto-detects project |
| **Same launchers** | No duplicate configs to maintain |
| **Consistent context** | All IDEs see same project state |

### Switching Between IDEs

When you switch from one IDE to another:

1. **Workspace is preserved**: All IDEs use the same git root detection
2. **Code index is shared**: No need to re-index
3. **Context is consistent**: Same project files, same skills

### Testing Multi-IDE Setup

```bash
# Check which IDEs are configured
bash dai-harness/scripts/daiharness-mcp-setup.sh --check

# Run diagnostics for detailed view
bash dai-harness/scripts/daiharness-mcp-setup.sh --diagnose
```

---

## Commands Reference

### daiharness-mcp-setup.sh

Unified MCP setup for Cursor + Claude Code + Antigravity + OpenAI Codex CLI.

```bash
# Setup all platforms
bash dai-harness/scripts/daiharness-mcp-setup.sh

# Setup individual platform
bash dai-harness/scripts/daiharness-mcp-setup.sh --cursor
bash dai-harness/scripts/daiharness-mcp-setup.sh --claude-code
bash dai-harness/scripts/daiharness-mcp-setup.sh --antigravity
bash dai-harness/scripts/daiharness-mcp-setup.sh --codex

# Force re-generate MCP server
bash dai-harness/scripts/daiharness-mcp-setup.sh --force

# Status & diagnostics
bash dai-harness/scripts/daiharness-mcp-setup.sh --check
bash dai-harness/scripts/daiharness-mcp-setup.sh --diagnose

# Remove MCP setup from all platforms
bash dai-harness/scripts/daiharness-mcp-setup.sh --uninstall

# Help
bash dai-harness/scripts/daiharness-mcp-setup.sh --help
```

### DAI memory CLI

```bash
# Install the engine (outside the repository, one directory per pinned commit)
python3 scripts/lite/dai_memory.py install

# Index the project
dai-memory init

# Refresh after changes (the post-commit hook does this too)
dai-memory ingest

# Check status: indexed commit, whether it is current
dai-memory status

# Remove this project's store
dai-memory clean --yes

# Repositories grouped as one system
dai-memory group list
```

`dai-memory` is `node "$(python3 scripts/lite/dai_memory.py where)/bin/dai-memory.mjs"`.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DAIHARNESS_WORKSPACE` | Override workspace detection | Auto-detected |
| `MCP_WORKSPACE_ROOT` | MCP standard workspace | Auto-detected |
| `FW_MCP_VERBOSE` | Enable debug output | 0 |
| `FW_MCP_FORCE` | Force operations | 0 |

### Debug Mode

```bash
# Enable verbose output
FW_MCP_VERBOSE=1 bash daiharness-mcp-setup.sh --diagnose

# Or use --verbose flag
bash daiharness-mcp-setup.sh --diagnose
```

---

## Troubleshooting

### MCP Server Not Starting

**Symptoms:** Tools not appearing in IDE

**Solutions:**

1. Check status:
   ```bash
   bash daiharness-mcp-setup.sh --check
   ```

2. Run diagnostics:
   ```bash
   bash daiharness-mcp-setup.sh --diagnose
   ```

3. Restart IDE

4. Check logs in IDE console

### Windows Compatibility (Path & TSX Errors)

On Windows, path structures and command execution differ from macOS. If you encounter errors like `ERR_MODULE_NOT_FOUND` or executables not found:

1. **DAI memory engine path**:
   - `python3 scripts/lite/dai_memory.py where` prints it; the server is `bin/dai-memory.mjs serve` under that directory.
   - **Windows**: it lives under `C:/Users/<YourUsername>/AppData/Local/dai-harness/dai-memory/<commit>/`; use `"command": "node"` with that file as the first argument.

2. **TypeScript Execution (tsx)**:
   - Avoid using bash-style paths `/c/Users/...` directly as the executable `command` on Windows.
   - Instead, configure the server to run with `"command": "npx"` and `"args": ["tsx", "C:/Users/<YourUsername>/.daiharness/mcp-server/src/index.ts"]`.

3. **Claude Code Hooks**:
   - For Windows environments, prefix hook script paths with `bash` to ensure they execute correctly under non-POSIX shells:
     ```json
     "hooks": {
       "PostMessage": "bash D:/path/to/dai-harness/scripts/daiharness-memory-hook.sh tick",
       "PostToolUse": "bash D:/path/to/dai-harness/scripts/daiharness-memory-hook.sh checkpoint"
     }
     ```

4. **OpenAI Codex CLI (`config.toml` on Windows)**:
   - Ensure the TOML configurations use Windows paths and native tools:
     ```toml
     [mcp_servers.daiharness]
     enabled = true
     transport = { type = "stdio" }
     command = "npx"
     args = ["tsx", "C:/Users/<YourUsername>/.daiharness/mcp-server/src/index.ts"]

     [mcp_servers.dai-memory]
     enabled = true
     transport = { type = "stdio" }
     command = "node"
     args = ["C:/Users/<YourUsername>/AppData/Local/dai-harness/dai-memory/<commit>/bin/dai-memory.mjs", "serve"]
     ```

5. **Antigravity CLI & App (`mcp_config.json` on Windows)**:
   - Ensure both `~/.gemini/config/mcp_config.json` and `~/.gemini/antigravity-cli/mcp_config.json` configure the servers correctly:
     ```json
     "dai-harness": {
       "command": "npx",
       "args": [
         "tsx",
         "C:/Users/<YourUsername>/.daiharness/mcp-server/src/index.ts"
       ]
     },
     "dai-memory": {
       "command": "node",
       "args": [
         "C:/Users/<YourUsername>/AppData/Local/dai-harness/dai-memory/<commit>/bin/dai-memory.mjs",
         "serve"
       ]
     }
     ```

### Workspace Detection Issues

**Symptoms:** Wrong project context

**Solutions:**

1. Set workspace explicitly:
   ```bash
   export DAIHARNESS_WORKSPACE=/path/to/project
   bash daiharness-mcp-setup.sh --check
   ```

2. Run from project directory:
   ```bash
   cd /path/to/project
   bash daiharness-mcp-setup.sh --check
   ```

### Code Graph Index Stale

**Symptoms:** Query returns old/outdated results

**Solution:**
```bash
# Re-index with the DAI memory layer
dai-memory ingest --force
```

### Launcher Script Not Found

**Symptoms:** `launcher.sh not found` error

**Solution:** Re-run setup:
```bash
bash daiharness-mcp-setup.sh setup --force
```

### npm Install Failures

**Symptoms:** Dependencies not installing

**Solutions:**

1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

2. Use offline mode:
   ```bash
   npm install --prefer-offline
   ```

3. Check npm version:
   ```bash
   npm --version  # Should be 8+
   ```

---

## FAQ

### Q: What's the difference between DAI Harness and DAI memory?

**A:**
- **DAI Harness** provides project intelligence, skills, and orchestration
- **DAI memory** (`vendor/dai-memory`, a submodule of the plugin's own repository) provides the code graph, context and impact analysis, and the project's recorded memory

The harness installs and registers DAI memory for you.

### Q: Can I use just DAI memory without DAI Harness?

**A:** Yes. It is a Claude Code plugin in its own right; install it from its repository and it registers its own `dai-memory` MCP server.

### Q: How do I update DAI Harness MCP?

**A:**
```bash
cd dai-harness
git pull origin main
bash scripts/daiharness-mcp-setup.sh setup --force
```

### Q: Multiple projects - do I need separate configs?

**A:** No! With Antigravity, one config works for all projects. With Cursor/Claude, launchers auto-detect workspace from git root.

### Q: What if I use VS Code?

**A:** VS Code has MCP support but it's preview. For now, use Cursor or Claude Desktop for best experience.

### Q: How do I uninstall MCP?

**A:**
```bash
bash daiharness-mcp-setup.sh --uninstall
```

### Q: Can I use DAI Harness with multiple IDEs simultaneously?

**A:** Yes! Setup once, use everywhere:

```bash
# Setup once
bash dai-harness/scripts/daiharness-mcp-setup.sh setup

# Restart all IDEs (Cursor + Claude Desktop + Antigravity)
# They all share the same:
#   - .antigravity/mcp-manifest.json
#   - .daiharness/ (state)
#   - .memory/ (code graph + project memory)
```

See [Multi-IDE Setup](#multi-ide-setup-cursor--claude--antigravity) section above for details.

### Q: Where is my data stored?

**A:**
- **Manifest**: `.antigravity/mcp-manifest.json`
- **Code graph + memory**: `.memory/` (in project directory, gitignored)
- **Memory engine**: outside the repository, `python3 scripts/lite/dai_memory.py where`
- **Settings**: `.daiharness/settings.env`

All are in your project directory and can be committed to git.

---

## Support

- **GitHub Issues**: [Report bugs](https://github.com/Exia-thd/DAI-harness/issues)
- **Documentation**: [docs/SETUP-REFERENCE.md](SETUP-REFERENCE.md)

---

## See Also

- [Quick Start Guide](SETUP-QUICK.md) - Fast 1-minute setup
- [Technical Reference](SETUP-REFERENCE.md) - Detailed technical docs
- [DAI memory guide](guides/dai-memory.md) - Code intelligence and memory
