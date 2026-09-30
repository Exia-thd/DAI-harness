#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# dai-harness-mcp-launcher — Zero-Friction MCP Workspace Forwarder
#
# A thin bash/stdio bridge for Antigravity MCP integration.
# Detects current workspace, then FORWARDS all MCP protocol traffic
# to the installer-managed canonical DAI Harness MCP server.
#
# HOW IT WORKS:
#   Antigravity → stdio JSON-RPC → launcher → canonical MCP server
#
# USAGE (single entry in claude_desktop_config.json):
#   {
#     "mcpServers": {
#       "dai-harness": {
#         "command": "bash",
#         "args": ["/path/to/scripts/daiharness-mcp-launcher.sh"]
#       }
#     }
#   }
#
# DEBUG MODE:
#   DAIHARNESS_DEBUG=1 daiharness-mcp-launcher.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Debug Logging ─────────────────────────────────────────────

DEBUG="${DAIHARNESS_DEBUG:-0}"

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[dai-harness-launcher DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[dai-harness-launcher ERROR] $*" >&2
}

log_info() {
    echo "[dai-harness-launcher] $*" >&2
}

# ─── Constants ─────────────────────────────────────────────────

DAIHARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DAIHARNESS_DIR="${DAIHARNESS_DIR%/scripts}"
CANONICAL_SERVER_PATH="$HOME/.daiharness/mcp-server/src/index.ts"
CANONICAL_TSX_PATH="$HOME/.daiharness/mcp-server/node_modules/.bin/tsx"

# ─── Workspace Detection ────────────────────────────────────────

resolve_workspace() {
    local workspace=""

    log_debug "Detecting workspace..."

    # Priority 1: Environment variable (set by Antigravity or user)
    if [[ -n "${DAIHARNESS_WORKSPACE:-}" ]]; then
        workspace="$DAIHARNESS_WORKSPACE"
        log_debug "  → Using DAIHARNESS_WORKSPACE: $workspace"
    # Priority 2: MCP standard workspace root
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
        log_debug "  → Using MCP_WORKSPACE_ROOT: $workspace"
    # Priority 3: Claude Desktop workspace (standard env var)
    elif [[ -n "${CLAUDE_DESKTOP_WORKSPACE:-}" ]]; then
        workspace="$CLAUDE_DESKTOP_WORKSPACE"
        log_debug "  → Using CLAUDE_DESKTOP_WORKSPACE: $workspace"
    # Priority 4: Git repository root
    elif git rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
        workspace="$(git rev-parse --show-toplevel)"
        log_debug "  → Using git root: $workspace"
    # Priority 5: Current working directory
    else
        workspace="$(pwd -P)"
        log_debug "  → Using PWD: $workspace"
    fi

    # Validate and normalize path
    if [[ -z "$workspace" ]]; then
        log_error "Could not determine workspace"
        exit 1
    fi

    # Convert relative to absolute
    if [[ "$workspace" != /* ]]; then
        workspace="$(pwd)/$workspace"
    fi

    # Normalize (resolve symlinks, remove trailing slashes)
    workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || {
        log_error "Invalid workspace path: $workspace"
        exit 1
    }

    log_debug "  → Resolved workspace: $workspace"

    # Verify workspace exists and is accessible
    if [[ ! -d "$workspace" ]]; then
        log_error "Workspace does not exist or is not accessible: $workspace"
        exit 1
    fi

    echo "$workspace"
}

# ─── Manifest Detection ─────────────────────────────────────────

find_manifest() {
    local workspace="$1"

    log_debug "Searching for manifest in $workspace..."

    # Check .antigravity/ first (Antigravity standard)
    if [[ -f "$workspace/.antigravity/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/.antigravity/mcp-manifest.json"
        echo "$workspace/.antigravity/mcp-manifest.json"
        return 0
    fi

    # Check .daiharness/ (legacy/project-level)
    if [[ -f "$workspace/.daiharness/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/.daiharness/mcp-manifest.json"
        echo "$workspace/.daiharness/mcp-manifest.json"
        return 0
    fi

    # Check root level
    if [[ -f "$workspace/mcp-manifest.json" ]]; then
        log_debug "  → Found: $workspace/mcp-manifest.json"
        echo "$workspace/mcp-manifest.json"
        return 0
    fi

    log_debug "  → No manifest found"
    echo ""
    return 1
}

validate_manifest() {
    local manifest="$1"
    local workspace="$2"

    log_debug "Validating manifest: $manifest"

    # Check file exists
    if [[ ! -f "$manifest" ]]; then
        log_debug "  → Manifest file not found"
        return 1
    fi

    # Check workspace matches
    local manifest_workspace
    manifest_workspace="$(node - "$manifest" <<'NODE'
try {
  const manifest = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(typeof manifest.workspace === 'string' ? manifest.workspace : '');
} catch (error) {
  process.exit(1);
}
NODE
    )" || manifest_workspace=""

    if [[ -n "$manifest_workspace" ]]; then
        # Normalize for comparison
        local normalized_manifest
        local normalized_workspace
        normalized_manifest="$(cd "$manifest_workspace" 2>/dev/null && pwd -P)" || normalized_manifest="$manifest_workspace"
        normalized_workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || normalized_workspace="$workspace"

        if [[ "$normalized_manifest" != "$normalized_workspace" ]]; then
            log_debug "  → Workspace mismatch (expected: $workspace, found: $normalized_manifest)"
            log_debug "  → Manifest may be stale - will regenerate"
            return 2  # Special code for stale manifest
        fi
    fi

    # Check manifest has servers
    local server_count
    server_count="$(node - "$manifest" <<'NODE'
try {
  const manifest = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(String(Array.isArray(manifest.servers) ? manifest.servers.length : 0));
} catch (error) {
  process.exit(1);
}
NODE
    )" || server_count="0"

    if [[ "$server_count" == "0" ]]; then
        log_debug "  → No servers defined in manifest"
        return 1
    fi

    log_debug "  → Valid manifest with $server_count server(s)"
    return 0
}

# ─── DAI Harness Detection ──────────────────────────────────────

find_dai_harness() {
    local workspace="$1"

    log_debug "Searching for dai-harness in $workspace..."

    # Pattern 1: Use DAIHARNESS_DIR (from script location)
    if [[ -d "${DAIHARNESS_DIR}" ]]; then
        log_debug "  → Using DAIHARNESS_DIR: $DAIHARNESS_DIR"
        echo "$DAIHARNESS_DIR"
        return 0
    fi

    # Pattern 2: .daiharness/ directory in workspace
    if [[ -d "$workspace/.daiharness" ]]; then
        log_debug "  → Found .daiharness in workspace"
        echo "$workspace/.daiharness"
        return 0
    fi

    # Pattern 3: dai-harness/ submodule
    if [[ -d "$workspace/dai-harness" ]]; then
        log_debug "  → Found dai-harness/ submodule"
        echo "$workspace/dai-harness"
        return 0
    fi

    # Pattern 4: Look up directory tree for dai-harness
    local current="$workspace"
    while [[ "$current" != "/" ]]; do
        if [[ -d "$current/.daiharness" ]]; then
            log_debug "  → Found .daiharness at $current"
            echo "$current/.daiharness"
            return 0
        fi
        if [[ -f "$current/AGENTS.md" ]] || [[ -f "$current/CLAUDE.md" ]]; then
            # This is the dai-harness project itself
            log_debug "  → Workspace IS the dai-harness project"
            echo "$current"
            return 0
        fi
        current="$(dirname "$current")"
    done

    log_debug "  → No dai-harness found"
    echo ""
    return 1
}

# ─── Server Resolution ─────────────────────────────────────────

resolve_server_cmd() {
    local workspace="$1"
    local manifest="$2"
    local dai_harness="$3"

    log_debug "Resolving server command..."

    # ── Path A: Use manifest to find server ──────────────────────

    if [[ -n "$manifest" ]] && [[ -f "$manifest" ]]; then
        log_debug "  → Parsing manifest..."

        # Find dai-harness-mcp-server from manifest
        local server_path
        server_path="$(node - "$manifest" "$CANONICAL_SERVER_PATH" <<'NODE'
var fs = require('fs');
try {
  var m = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  var server = (m.servers || []).find(function(s){
    return (s.type === 'dai-harness-mcp-server' || s.name === 'dai-harness') && s.enabled !== false && s.auto_start !== false;
  });
  if (server) {
    var scriptPath = server.path;
    if (typeof scriptPath !== 'string') {
      var sp = server.command;
      if (typeof sp !== 'string' || !sp.startsWith('npx tsx ')) {
        process.exit(1);
      }
      scriptPath = sp.slice('npx tsx '.length);
    }
    var canonicalPath = process.argv[3];
    if (scriptPath.startsWith('/') && !/[\r\n\0]/.test(scriptPath) &&
        fs.statSync(scriptPath).isFile() && fs.realpathSync(scriptPath) === fs.realpathSync(canonicalPath)) {
        process.stdout.write(fs.realpathSync(scriptPath));
    } else {
        process.exit(1);
    }
  } else {
    process.exit(1);
  }
} catch(e) { process.exit(1); }
NODE
        )" || server_path=""

        if [[ -n "$server_path" ]] && [[ -f "$server_path" ]]; then
            log_debug "  → Found dai-harness-mcp-server: $server_path"
            if [[ ! -x "$CANONICAL_TSX_PATH" ]]; then
                log_error "Canonical tsx executable missing: $CANONICAL_TSX_PATH"
                return 1
            fi
            SERVER_ARGV=("$CANONICAL_TSX_PATH" "$server_path")
            return 0
        fi
        log_error "Rejected unsafe or unsupported MCP server command in manifest"
        return 1
    fi

    # Never execute workspace-owned TypeScript. The setup command owns and
    # verifies the canonical server and its local tsx runtime.
    if [[ -f "$CANONICAL_SERVER_PATH" ]] && [[ -x "$CANONICAL_TSX_PATH" ]]; then
        SERVER_ARGV=("$CANONICAL_TSX_PATH" "$CANONICAL_SERVER_PATH")
        return 0
    fi

    log_debug "  → No server found"
    return 1
}

# ─── Manifest Auto-Generation ─────────────────────────────────

auto_generate_manifest() {
    local workspace="$1"
    local dai_harness="$2"

    log_debug "Attempting auto-generation of manifest..."

    local dai_harness_path=""
    if [[ -d "$workspace/dai-harness" ]]; then
        dai_harness_path="$workspace/dai-harness"
    elif [[ "$dai_harness" != "$workspace" ]]; then
        dai_harness_path="$dai_harness"
    fi

    if [[ -z "$dai_harness_path" ]] || [[ ! -f "$dai_harness_path/scripts/mcp-generate.sh" ]]; then
        log_debug "  → Cannot auto-generate: mcp-generate.sh not found"
        return 1
    fi

    log_info "Auto-generating MCP manifest for $workspace..."

    # Run generation script
    if bash "$dai_harness_path/scripts/mcp-generate.sh" > /dev/null 2>&1; then
        log_info "  → Manifest generated successfully"
        return 0
    else
        log_error "  → Failed to generate manifest"
        return 1
    fi
}

# ─── Main ─────────────────────────────────────────────────────

main() {
    local workspace manifest dai-harness server_cmd

    log_debug "=== DAI Harness MCP Launcher Started ==="
    log_debug "DAIHARNESS_WORKSPACE: ${DAIHARNESS_WORKSPACE:-<not set>}"
    log_debug "MCP_WORKSPACE_ROOT: ${MCP_WORKSPACE_ROOT:-<not set>}"
    log_debug "PWD: $(pwd)"
    log_debug "DAIHARNESS_DIR: $DAIHARNESS_DIR"

    # Step 1: Detect workspace
    workspace="$(resolve_workspace)" || exit 1

    # Step 2: Find dai-harness
    dai_harness="$(find_dai_harness "$workspace")" || {
        log_error "DAI Harness not found in workspace: $workspace"
        log_info "To fix: Run 'daiharness-mcp-setup.sh' in the project directory"
        exit 1
    }

    # Step 3: Find manifest
    manifest="$(find_manifest "$workspace")" || manifest=""

    # Step 4: Validate manifest
    if [[ -n "$manifest" ]]; then
        if ! validate_manifest "$manifest" "$workspace"; then
            # Try to auto-generate
            if auto_generate_manifest "$workspace" "$dai_harness"; then
                manifest="$(find_manifest "$workspace")" || manifest=""
            else
                manifest=""
            fi
        fi
    fi

    # Step 5: Resolve server command
    SERVER_ARGV=()
    resolve_server_cmd "$workspace" "$manifest" "$dai_harness" || {
        log_error "Could not find MCP server in workspace: $workspace"
        log_info ""
        log_info "Possible solutions:"
        log_info "  1. Run 'daiharness-mcp-setup.sh' in the project"
        log_info "  2. Ensure canonical src/index.ts and node_modules/.bin/tsx exist"
        log_info "  3. Check that the project has been onboarded"
        exit 1
    }

    log_debug "=== Launching MCP Server ==="
    log_debug "Command: ${SERVER_ARGV[*]}"

    # Step 6: Execute MCP server
    # The MCP server communicates via stdio JSON-RPC
    exec "${SERVER_ARGV[@]}"
}

# ─── Entry Point ────────────────────────────────────────────────

main "$@"
