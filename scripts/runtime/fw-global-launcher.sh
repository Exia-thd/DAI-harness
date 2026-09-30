#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# fw-global-launcher — Global Adaptive MCP Launcher for DAI Harness
#
# A universal launcher that works with ANY project without per-project
# setup. Uses environment variables and git root detection to find
# the current workspace, then loads the appropriate DAI Harness MCP.
#
# HOW IT WORKS:
#   1. Detect workspace (env vars → git root → PWD)
#   2. Check global registry for known projects
#   3. Find dai-harness installation
#   4. Launch MCP server with workspace context
#
# USAGE (single entry in mcp.json):
#   {
#     "mcpServers": {
#       "dai-harness": {
#         "command": "bash",
#         "args": ["/path/to/fw-global-launcher.sh"]
#       }
#     }
#   }
#
# DEBUG MODE:
#   DAIHARNESS_DEBUG=1 fw-global-launcher.sh
#
# TEST MODE:
#   fw-global-launcher.sh --dry-run
#
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Version ─────────────────────────────────────────────────────────────────

VERSION="1.0.0"

# ─── Colors ─────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Debug Logging ───────────────────────────────────────────────────────────

DEBUG="${DAIHARNESS_DEBUG:-0}"
DRY_RUN="${DAIHARNESS_DRY_RUN:-0}"

log_debug() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[fw-global DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[fw-global ERROR] $*" >&2
}

log_info() {
    if [[ "$DEBUG" == "1" ]]; then
        echo "[fw-global] $*" >&2
    fi
}

# ─── Constants ───────────────────────────────────────────────────────────────

# Global config directory
GLOBAL_CONFIG_DIR="${HOME}/.config/dai-harness"
GLOBAL_REGISTRY="${GLOBAL_CONFIG_DIR}/registry.json"
GLOBAL_SETTINGS="${GLOBAL_CONFIG_DIR}/settings.env"

# DAI Harness locations (in order of preference)
DAIHARNESS_CANDIDATES=(
    "${HOME}/Documents/GitHub/dai-harness"
    "${HOME}/GitHub/dai-harness"
    "${HOME}/Projects/dai-harness"
    "${DAIHARNESS_DIR:-}"  # Allow env override
)

# ─── Version/Dry-Run Mode ────────────────────────────────────────────────────

cmd_version() {
    echo "fw-global-launcher v${VERSION}"
    echo "Global config: ${GLOBAL_CONFIG_DIR}"
    exit 0
}

cmd_help() {
    cat << 'EOF'
fw-global-launcher — Global Adaptive MCP Launcher for DAI Harness

USAGE
    fw-global-launcher.sh [OPTIONS]

OPTIONS
    --dry-run     Show what would be launched (no execution)
    --debug       Enable debug output
    --version     Show version
    --help        Show this help

ENVIRONMENT VARIABLES
    DAIHARNESS_DEBUG=1           Enable debug output
    DAIHARNESS_DRY_RUN=1        Dry-run mode
    DAIHARNESS_WORKSPACE=/path  Override workspace detection
    MCP_WORKSPACE_ROOT=/path     MCP standard workspace var
    DAIHARNESS_DIR=/path        Override dai-harness location
    DAIHARNESS_GLOBAL_CONFIG    Override global config dir

WORKSPACE DETECTION (priority order)
    1. DAIHARNESS_WORKSPACE env var
    2. MCP_WORKSPACE_ROOT env var (MCP standard)
    3. CLAUDE_DESKTOP_WORKSPACE env var
    4. Git repository root
    5. Current working directory

DAI-HARNESS DETECTION (priority order)
    1. .daiharness/ directory in workspace
    2. dai-harness/ submodule in workspace
    3. Walk up directory tree
    4. Global config registry
    5. Known locations (HOME/Documents/GitHub/dai-harness, etc.)
EOF
    exit 0
}

# ─── Step 1: Resolve Workspace ────────────────────────────────────────────────

resolve_workspace() {
    local workspace=""
    
    log_debug "Resolving workspace..."
    
    # Priority 1: Environment variable (set by Antigravity or user)
    if [[ -n "${DAIHARNESS_WORKSPACE:-}" ]]; then
        workspace="$DAIHARNESS_WORKSPACE"
        log_debug "  → DAIHARNESS_WORKSPACE: $workspace"
    
    # Priority 2: MCP standard workspace root
    elif [[ -n "${MCP_WORKSPACE_ROOT:-}" ]]; then
        workspace="$MCP_WORKSPACE_ROOT"
        log_debug "  → MCP_WORKSPACE_ROOT: $workspace"
    
    # Priority 3: Claude Desktop workspace
    elif [[ -n "${CLAUDE_DESKTOP_WORKSPACE:-}" ]]; then
        workspace="$CLAUDE_DESKTOP_WORKSPACE"
        log_debug "  → CLAUDE_DESKTOP_WORKSPACE: $workspace"
    
    # Priority 4: Git repository root
    elif git -C "${HOME}" rev-parse --show-toplevel 2>/dev/null | grep -q '^/'; then
        # We're in a git repo
        workspace="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
        if [[ -n "$workspace" ]]; then
            log_debug "  → Git root: $workspace"
        fi
    fi
    
    # Priority 5: Fallback to PWD
    if [[ -z "$workspace" ]]; then
        workspace="$(pwd -P)"
        log_debug "  → PWD: $workspace"
    fi
    
    # Validate and normalize
    if [[ -z "$workspace" ]]; then
        log_error "Could not determine workspace"
        exit 1
    fi
    
    # Convert relative to absolute
    if [[ "$workspace" != /* ]]; then
        workspace="$(pwd)/$workspace"
    fi
    
    # Normalize (resolve symlinks)
    workspace="$(cd "$workspace" 2>/dev/null && pwd -P)" || {
        log_error "Invalid workspace path: $workspace"
        exit 1
    }
    
    # Verify exists
    if [[ ! -d "$workspace" ]]; then
        log_error "Workspace does not exist: $workspace"
        exit 1
    fi
    
    log_debug "Resolved workspace: $workspace"
    echo "$workspace"
}

# ─── Step 2: Find DAI Harness ────────────────────────────────────────────────

find_dai_harness() {
    local workspace="$1"
    local dai_harness=""
    
    log_debug "Searching for dai-harness in $workspace..."
    
    # Pattern 1: .daiharness/ directory (sibling to project)
    if [[ -d "$workspace/.daiharness" ]]; then
        # .daiharness might contain dai-harness itself, or be project config
        if [[ -f "$workspace/.daiharness/AGENTS.md" ]] || [[ -f "$workspace/.daiharness/CLAUDE.md" ]]; then
            dai_harness="$workspace/.daiharness"
            log_debug "  → .daiharness in workspace: $dai_harness"
        fi
    fi
    
    # Pattern 2: dai-harness/ submodule
    if [[ -z "$dai_harness" ]] && [[ -d "$workspace/dai-harness" ]]; then
        if [[ -f "$workspace/dai-harness/AGENTS.md" ]] || [[ -f "$workspace/dai-harness/CLAUDE.md" ]]; then
            dai_harness="$workspace/dai-harness"
            log_debug "  → dai-harness submodule: $dai_harness"
        fi
    fi
    
    # Pattern 3: Walk up directory tree
    if [[ -z "$dai_harness" ]]; then
        local current="$workspace"
        while [[ "$current" != "/" ]] && [[ "$current" != "$HOME" ]]; do
            # Check for dai-harness markers
            if [[ -f "$current/AGENTS.md" ]] || [[ -f "$current/CLAUDE.md" ]]; then
                dai_harness="$current"
                log_debug "  → Found by walking up: $dai_harness"
                break
            fi
            # Check for .daiharness containing dai-harness
            if [[ -d "$current/.daiharness" ]] && [[ -f "$current/.daiharness/AGENTS.md" ]]; then
                dai_harness="$current/.daiharness"
                log_debug "  → Found .daiharness: $dai_harness"
                break
            fi
            current="$(dirname "$current")"
        done
    fi
    
    # Pattern 4: Check global registry
    if [[ -z "$dai_harness" ]] && [[ -f "$GLOBAL_REGISTRY" ]]; then
        local registered
        registered=$(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    // Find dai-harness in projects
    for (var p in reg.projects || {}) {
        if (reg.projects[p].daiharness_path) {
            console.log(reg.projects[p].daiharness_path);
            break;
        }
    }
} catch(e) {}
" 2>/dev/null || echo "")
        
        if [[ -n "$registered" ]] && [[ -d "$registered" ]]; then
            dai_harness="$registered"
            log_debug "  → From registry: $dai_harness"
        fi
    fi
    
    # Pattern 5: Known locations
    if [[ -z "$dai_harness" ]]; then
        for candidate in "${DAIHARNESS_CANDIDATES[@]}"; do
            if [[ -n "$candidate" ]] && [[ -d "$candidate" ]]; then
                if [[ -f "$candidate/AGENTS.md" ]] || [[ -f "$candidate/CLAUDE.md" ]]; then
                    dai_harness="$candidate"
                    log_debug "  → Known location: $dai_harness"
                    break
                fi
            fi
        done
    fi
    
    # Pattern 6: Check script's own location (for development)
    if [[ -z "$dai_harness" ]]; then
        local script_path
        script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
        local script_dai_harness="${script_path%/*}"
        
        if [[ -f "${script_dai_harness}/AGENTS.md" ]] || [[ -f "${script_dai_harness}/CLAUDE.md" ]]; then
            dai_harness="$script_dai_harness"
            log_debug "  → From script location: $dai_harness"
        fi
    fi
    
    if [[ -z "$dai_harness" ]]; then
        log_debug "  → No dai-harness found"
        echo ""
        return 1
    fi
    
    echo "$dai_harness"
}

# ─── Step 3: Find MCP Server ─────────────────────────────────────────────────

find_mcp_server() {
    local workspace="$1"
    local dai_harness="$2"
    
    log_debug "Finding MCP server..."
    
    local server_path=""
    
    # Priority 1: Global MCP server
    if [[ -d "${GLOBAL_CONFIG_DIR}/mcp-server" ]]; then
        if [[ -f "${GLOBAL_CONFIG_DIR}/mcp-server/src/index.ts" ]]; then
            server_path="${GLOBAL_CONFIG_DIR}/mcp-server/src/index.ts"
            log_debug "  → Global MCP server: $server_path"
        fi
    fi
    
    # Priority 2: DAI Harness's own MCP server
    if [[ -z "$server_path" ]] && [[ -f "${dai_harness}/mcp-server/src/index.ts" ]]; then
        server_path="${dai_harness}/mcp-server/src/index.ts"
        log_debug "  → DAI Harness MCP server: $server_path"
    fi
    
    # Priority 3: Project's MCP server
    if [[ -z "$server_path" ]] && [[ -f "$workspace/.daiharness/mcp-server/src/index.ts" ]]; then
        server_path="$workspace/.daiharness/mcp-server/src/index.ts"
        log_debug "  → Project MCP server: $server_path"
    fi
    
    # Priority 4: Legacy dai-harness MCP server path
    if [[ -z "$server_path" ]] && [[ -f "${dai_harness}/mcp/src/index.ts" ]]; then
        server_path="${dai_harness}/mcp/src/index.ts"
        log_debug "  → Legacy MCP server: $server_path"
    fi
    
    if [[ -z "$server_path" ]]; then
        log_debug "  → No MCP server found"
        echo ""
        return 1
    fi
    
    echo "$server_path"
}

# --- Step 4: Check the code graph --------------------------------------------

# The DAI memory layer keeps each workspace's graph in its own .memory/.
check_code_graph() {
    local workspace="$1"

    if [[ -f "$workspace/.memory/meta.json" ]]; then
        log_debug "Code graph: workspace is indexed (.memory/)"
        return 0
    fi

    log_debug "Code graph: workspace not indexed (run: dai-memory init)"
    return 1
}

# ─── Step 5: Load Project Settings ───────────────────────────────────────────

load_project_settings() {
    local workspace="$1"
    local dai_harness="$2"
    
    log_debug "Loading project settings..."
    
    local settings_file=""
    
    # Check project settings
    if [[ -f "$workspace/.daiharness/settings.env" ]]; then
        settings_file="$workspace/.daiharness/settings.env"
    elif [[ -f "$workspace/.daiharness/.env" ]]; then
        settings_file="$workspace/.daiharness/.env"
    fi
    
    # Load settings if exists
    if [[ -n "$settings_file" ]] && [[ -f "$settings_file" ]]; then
        log_debug "  → Loading: $settings_file"
        set -a  # Auto-export
        source "$settings_file"
        set +a
    fi
    
    # Load global settings if exists
    if [[ -f "$GLOBAL_SETTINGS" ]]; then
        log_debug "  → Loading global: $GLOBAL_SETTINGS"
        set -a
        source "$GLOBAL_SETTINGS"
        set +a
    fi
}

# ─── Step 6: Register Project (optional) ─────────────────────────────────────

register_project() {
    local workspace="$1"
    local dai_harness="$2"
    
    # Skip if registry doesn't exist
    [[ ! -f "$GLOBAL_REGISTRY" ]] && return 0
    
    # Check if already registered
    local already_registered
    already_registered=$(node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    console.log(reg.projects['${workspace}'] ? '1' : '0');
} catch(e) { console.log('0'); }
" 2>/dev/null)
    
    [[ "$already_registered" == "1" ]] && return 0
    
    log_debug "Registering project: $workspace"
    
    node -e "
var fs = require('fs');
try {
    var reg = JSON.parse(fs.readFileSync('${GLOBAL_REGISTRY}', 'utf8'));
    if (!reg.projects) reg.projects = {};
    reg.projects['${workspace}'] = {
        dai_harness_path: '${dai_harness}',
        registered_at: new Date().toISOString(),
        last_used: new Date().toISOString()
    };
    fs.writeFileSync('${GLOBAL_REGISTRY}', JSON.stringify(reg, null, 2));
} catch(e) {}
" 2>/dev/null
}

# ─── Step 7: Build Launch Command ─────────────────────────────────────────────

build_launch_command() {
    local workspace="$1"
    local dai_harness="$2"
    local server_path="$3"
    
    # Determine the launch command
    local cmd=""
    
    # Check if tsx is available (preferred)
    if command -v tsx &> /dev/null; then
        cmd="tsx '$server_path'"
    # Check for npx
    elif command -v npx &> /dev/null; then
        cmd="npx tsx '$server_path'"
    # Try direct node (if already compiled)
    elif [[ "$server_path" == *.js ]]; then
        cmd="node '$server_path'"
    else
        # Fallback to npx tsx (will be slower)
        cmd="npx tsx '$server_path'"
    fi
    
    # Add workspace context via environment
    cmd="DAIHARNESS_WORKSPACE='$workspace' DAIHARNESS_DIR='$dai_harness' $cmd"
    
    echo "$cmd"
}

# ─── Step 8: Dry Run ─────────────────────────────────────────────────────────

cmd_dry_run() {
    local workspace="$1"
    local dai_harness="$2"
    local server_path="$3"
    local launch_cmd="$4"
    
    echo ""
    echo -e "${CYAN}━━━ fw-global-launcher Dry Run ━━━${NC}"
    echo ""
    echo "  Workspace:    $workspace"
    echo "  DAI Harness:  $dai_harness"
    echo "  MCP Server:   $server_path"
    echo ""
    echo "  Launch command:"
    echo "    $launch_cmd"
    echo ""
    echo -e "${GREEN}✓ Dry run complete${NC}"
    echo ""
    exit 0
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
    local dry_run=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)   dry_run=true; shift ;;
            --debug)     DEBUG=1; shift ;;
            --version)   cmd_version ;;
            --help)      cmd_help ;;
            *)           shift ;;
        esac
    done
    
    log_debug "=== fw-global-launcher v${VERSION} ==="
    log_debug "DAIHARNESS_WORKSPACE: ${DAIHARNESS_WORKSPACE:-<not set>}"
    log_debug "MCP_WORKSPACE_ROOT: ${MCP_WORKSPACE_ROOT:-<not set>}"
    log_debug "PWD: $(pwd)"
    log_debug "GLOBAL_CONFIG: ${GLOBAL_CONFIG_DIR}"
    
    # Step 1: Resolve workspace
    local workspace
    workspace="$(resolve_workspace)" || exit 1
    
    # Step 2: Find dai-harness
    local dai-harness
    dai_harness="$(find_dai_harness "$workspace")" || {
        log_error "DAI Harness not found"
        log_info ""
        log_info "Install DAI Harness:"
        log_info "  git clone https://github.com/Exia-thd/DAI-harness"
        log_info ""
        log_info "Or set DAIHARNESS_DIR environment variable"
        exit 1
    }
    
    # Step 3: Find MCP server
    local server_path
    server_path="$(find_mcp_server "$workspace" "$dai_harness")" || {
        log_error "MCP server not found"
        log_info ""
        log_info "Run global setup first:"
        log_info "  bash scripts/fw-global-setup.sh"
        exit 1
    }
    
    # Step 4: Check the code graph (optional)
    if check_code_graph "$workspace"; then
        log_debug "Code graph is available for this workspace"
    fi
    
    # Step 5: Load settings
    load_project_settings "$workspace" "$dai_harness"
    
    # Step 6: Register project (optional)
    register_project "$workspace" "$dai_harness"
    
    # Step 7: Build launch command
    local launch_cmd
    launch_cmd="$(build_launch_command "$workspace" "$dai_harness" "$server_path")"
    
    # Step 8: Dry run or execute
    if [[ "$dry_run" == "true" ]] || [[ "${DAIHARNESS_DRY_RUN:-0}" == "1" ]]; then
        cmd_dry_run "$workspace" "$dai_harness" "$server_path" "$launch_cmd"
    fi
    
    log_debug "Launching MCP server..."
    log_debug "Command: $launch_cmd"
    
    # Execute the MCP server
    eval "$launch_cmd"
}

# ─── Entry Point ──────────────────────────────────────────────────────────────

main "$@"
