#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DAI Harness Updater — Update existing DAI Harness installation
#
# WHAT THIS DOES:
#   1. Pull latest changes from GitHub
#   2. Update submodules
#   3. Re-index codebases with the memory layer
#
# USAGE:
#   bash daiharness-update.sh              # Update DAI Harness
#   bash daiharness-update.sh --migrate    # Force database migration
#   bash daiharness-update.sh --reindex    # Full re-index after update
#   bash daiharness-update.sh --check      # Check for updates
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

VERSION="1.0.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}➜${NC} $1"; }
success()  { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✗${NC} $1"; }

# ═══════════════════════════════════════════════════════════════════════════════
# SETUP
# ═══════════════════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAIHARNESS_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ═══════════════════════════════════════════════════════════════════════════════
# GIT OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

git_pull() {
    info "Pulling latest changes..."

    if [[ ! -d ".git" ]]; then
        error "Not a git repository: ${DAIHARNESS_DIR}"
        return 1
    fi

    cd "$DAIHARNESS_DIR"

    local current_branch
    current_branch=$(git branch --show-current)
    [[ -z "$current_branch" ]] && current_branch="main"

    info "Current branch: $current_branch"

    # Fetch latest
    git fetch origin

    # Check for updates
    local behind
    behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")

    if [[ "$behind" == "0" ]]; then
        success "Already up to date"
        return 0
    fi

    info "Updates available: $behind commits behind"

    # Pull
    git pull origin "$current_branch"

    success "Pulled latest changes"
    return 0
}

update_submodules() {
    info "Updating submodules..."

    if [[ -f ".gitmodules" ]]; then
        git submodule update --init --recursive
        success "Submodules updated"
    else
        info "No submodules found"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════════════════════════

rebuild_mcp_server() {
    info "Rebuilding DAI Harness MCP Server..."

    local mcp_dir="${DAIHARNESS_DIR}/mcp"

    if [[ ! -d "$mcp_dir" ]]; then
        warn "MCP Server directory not found"
        return 1
    fi

    cd "$mcp_dir"

    # Install deps
    npm install --prefer-offline 2>&1 | tail -3 || true

    # Build
    npm run build 2>&1 | tail -5

    success "MCP Server rebuilt"

    cd "$DAIHARNESS_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# MIGRATION
# ═══════════════════════════════════════════════════════════════════════════════

check_migration_needed() {
    local project_root="$1"

    # Check if project has old SQLite index
    local sqlite_db="${project_root}/.gitnexus/codebase.db"
    local kuzu_db="${project_root}/.daiharness-node/codebase.db"

    if [[ -f "$sqlite_db" ]] && [[ ! -f "$kuzu_db" ]]; then
        echo "sqlite"
        return 0
    fi

    return 1
}

run_migration() {
    local project_root="$1"

    info "Running SQLite → KuzuDB migration..."

    local sqlite_db="${project_root}/.gitnexus/codebase.db"
    local kuzu_db="${project_root}/.daiharness-node/codebase.db"

    # Check if migration script exists
    local migration_script="${DAIHARNESS_DIR}/daiharness-node/scripts/migrate-sqlite-to-kuzu.js"

    if [[ ! -f "$migration_script" ]]; then
        warn "Migration script not found"
        return 1
    fi

    # Run migration
    cd "${DAIHARNESS_DIR}/daiharness-node"

    if [[ -f "$sqlite_db" ]]; then
        info "Migrating: $sqlite_db → $kuzu_db"
        node "$migration_script" "$sqlite_db" "$kuzu_db" || {
            warn "Migration failed, will re-index from scratch"
            return 1
        }
        success "Migration complete"
    fi

    cd "$DAIHARNESS_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# INDEXING
# ═══════════════════════════════════════════════════════════════════════════════

reindex_project() {
    local project_root="$1"

    info "Re-indexing project: $project_root"

    cd "${DAIHARNESS_DIR}"

    # The memory layer, installed outside the repository. `ingest --force`
    # re-reads every file; `init` would also rebuild the store, which is not
    # what re-indexing means.
    local engine=""
    for candidate in py python3 python; do
        if command -v "$candidate" &> /dev/null; then
            local prefix=""
            [[ "$candidate" == "py" ]] && prefix="-3"
            engine="$("$candidate" $prefix "${project_root}/scripts/lite/dai_memory.py" where 2>/dev/null)" || engine=""
            [[ -n "$engine" ]] && break
        fi
    done
    if [[ -z "$engine" ]]; then
        warn "The memory layer is not installed for ${project_root}; nothing was re-indexed."
        return
    fi
    (cd "$project_root" && node "${engine}/bin/dai-memory.mjs" ingest --force --quiet) 2>&1 | tail -20

    success "Re-index complete"

    cd "$DAIHARNESS_DIR"
}

# ═══════════════════════════════════════════════════════════════════════════════
# UPDATE ALL PROJECT INDICES
# ═══════════════════════════════════════════════════════════════════════════════

update_all_indices() {
    info "Finding projects with DAI Harness Node index..."

    # Find all .daiharness-node directories
    local indices
    indices=$(find "${HOME}" -name ".daiharness-node" -type d 2>/dev/null | head -20)

    if [[ -z "$indices" ]]; then
        info "No indexed projects found"
        return 0
    fi

    local count=0
    for idx in $indices; do
        local project_root
        project_root="$(dirname "$idx")"

        # Skip if it's the dai-harness itself
        if [[ "$project_root" == "$DAIHARNESS_DIR" ]]; then
            continue
        fi

        ((count++))
        info "[$count] Found: $project_root"

        # Migrate if needed
        if check_migration_needed "$project_root"; then
            warn "Migration needed for: $project_root"
            run_migration "$project_root" || true
        fi

        # Re-index
        reindex_project "$project_root"
    done

    success "Updated $count projects"
}

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK FOR UPDATES
# ═══════════════════════════════════════════════════════════════════════════════

check_updates() {
    info "Checking for updates..."

    cd "$DAIHARNESS_DIR"

    if [[ ! -d ".git" ]]; then
        error "Not a git repository"
        return 1
    fi

    local current_branch
    current_branch=$(git branch --show-current)
    [[ -z "$current_branch" ]] && current_branch="main"

    git fetch origin 2>/dev/null || true

    local behind
    behind=$(git rev-list --count "HEAD..origin/${current_branch}" 2>/dev/null || echo "0")

    if [[ "$behind" == "0" ]]; then
        success "DAI Harness is up to date"
    else
        warn "DAI Harness is $behind commits behind origin/${current_branch}"
        info "Run without --check to update"
    fi

    # Check for KuzuDB migration
    local has_sqlite=false
    while IFS= read -r idx; do
        local project_root
        project_root="$(dirname "$idx")"
        if [[ "$project_root" != "$DAIHARNESS_DIR" ]] && [[ -f "${project_root}/.gitnexus/codebase.db" ]]; then
            has_sqlite=true
            warn "Found project needing migration: $project_root"
        fi
    done < <(find "${HOME}" -name ".daiharness-node" -o -name ".gitnexus" -type d 2>/dev/null | head -20)

    if [[ "$has_sqlite" == "true" ]]; then
        info "Run with --migrate to update databases"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

show_help() {
    cat << 'EOF'
DAI Harness Updater — Update existing installation

USAGE:
  daiharness-update.sh [OPTIONS]

OPTIONS:
  --check       Check for updates only (don't update)
  --migrate     Run database migration (SQLite → KuzuDB)
  --reindex     Re-index all projects after update
  --all         Update + migrate + reindex everything
  --help        Show this help

EXAMPLES:
  # Check what needs updating
  bash daiharness-update.sh --check

  # Update DAI Harness
  bash daiharness-update.sh

  # Update + migrate databases + reindex
  bash daiharness-update.sh --all
EOF
}

main() {
    local do_migrate=false
    local do_reindex=false
    local do_check=false
    local do_all=false

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)      do_check=true; shift ;;
            --migrate)    do_migrate=true; shift ;;
            --reindex)    do_reindex=true; shift ;;
            --all)        do_all=true; shift ;;
            --help|-h)    show_help; exit 0 ;;
            *)            shift ;;
        esac
    done

    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}DAI Harness Updater v${VERSION}${NC}                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check mode
    if [[ "$do_check" == "true" ]]; then
        check_updates
        exit 0
    fi

    # Git pull
    if ! git_pull; then
        error "Git pull failed"
        exit 1
    fi
    echo ""

    # Update submodules
    update_submodules
    echo ""

    # Rebuild MCP Server
    rebuild_mcp_server
    echo ""

    # Migration
    if [[ "$do_migrate" == "true" ]] || [[ "$do_all" == "true" ]]; then
        update_all_indices
        echo ""
    fi

    # Re-index
    if [[ "$do_reindex" == "true" ]] || [[ "$do_all" == "true" ]]; then
        reindex_project "${HOME}/Documents"
        echo ""
    fi

    # Sync projects in the global registry
    info "Synchronizing registered projects..."
    node "$DAIHARNESS_DIR/scripts/daiharness-sync-projects.js"
    echo ""

    echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║${NC}  ${GREEN}✓ Update Complete${NC}                                    ${GREEN}║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
}

main "$@"
