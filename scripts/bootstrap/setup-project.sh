#!/bin/bash
# ============================================================================
# DAI Harness Global Setup — Link any project to the global DAI Harness repo
#
# This script sets up DAI Harness in ANY project WITHOUT needing a git submodule.
# It links to the global DAI Harness repo at a fixed path.
#
# Usage:
#   ./dai-harness/scripts/setup-project.sh           # Setup current directory
#   ./dai-harness/scripts/setup-project.sh /path/to/project  # Setup specific project
#
# What it does:
#   1. Creates .daiharness/ directory in the target project
#   2. Seeds the project policy (.daiharness/)
#   3. Detects tech stack and generates project-profile.json
#   4. Installs the memory layer and indexes the project
#   5. Prints the Cursor MCP config snippet (add to ~/.cursor/mcp.json)
#
# Requirements:
#   - Global DAI Harness repo must exist at DAIHARNESS_PATH (see below)
#   - Node.js >= 20.11 (for the memory layer)
#   - Git repository (memory is scoped to one)
# ============================================================================

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────
# Auto-detect DAI Harness root from script location (supports any clone path)
DAIHARNESS_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# ─────────────────────────────────────────────────────────────────────────

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}ℹ${NC} $1"; }
log_ok()    { echo -e "${GREEN}✓${NC} $1"; }
log_warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

print_header() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  DAI Harness — Global Project Setup                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ─── Detect Target Project ────────────────────────────────────────────────

TARGET_PROJECT="${1:-$(pwd)}"

# Resolve to absolute path
if [ "$TARGET_PROJECT" = "." ] || [ -z "$TARGET_PROJECT" ]; then
    TARGET_PROJECT="$(pwd)"
fi

TARGET_PROJECT="$(cd "$TARGET_PROJECT" && pwd)"

# ─── Validate Prerequisites ───────────────────────────────────────────────

check_prerequisites() {
    print_header
    
    log_info "Target project: ${TARGET_PROJECT}"
    echo ""

    # Check DAI Harness exists
    if [ ! -d "$DAIHARNESS_PATH" ]; then
        log_error "DAI Harness repo not found at: ${DAIHARNESS_PATH}"
        log_info "Edit DAIHARNESS_PATH in this script to point to your DAI Harness repo."
        exit 1
    fi
    log_ok "DAI Harness repo found"

    # Check skills directory
    if [ ! -d "$DAIHARNESS_PATH/skills" ]; then
        log_error "DAI Harness skills directory not found."
        exit 1
    fi
    log_ok "Skills directory found ($(find "$DAIHARNESS_PATH/skills" -maxdepth 1 -type d | tail -n +2 | wc -l | tr -d '[:space:]') skills)"

    # Check git repo
    if ! git -C "$TARGET_PROJECT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        log_warn "Not a git repository. Indexing needs one."
        log_info "Run 'git init' first if you want full code intelligence."
    else
        log_ok "Git repository detected"
    fi

    # Check Node.js
    if command -v node &> /dev/null; then
        log_ok "Node.js: $(node --version)"
    else
        log_warn "Node.js not found. The memory layer will not run."
        log_info "Install Node.js >= 18 for code intelligence."
    fi

    echo ""
}

# ─── Detect Tech Stack ───────────────────────────────────────────────────

detect_tech_stack() {
    local lang="unknown"
    local framework="unknown"
    local project_name
    project_name=$(basename "$TARGET_PROJECT")

    # Detect language/framework from files
    if [ -f "$TARGET_PROJECT/package.json" ]; then
        local pkg_type
        pkg_type=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$TARGET_PROJECT/package.json','utf8')).type||'commonjs')}catch{console.log('commonjs')}" 2>/dev/null)
        if [ -f "$TARGET_PROJECT/tsconfig.json" ]; then
            lang="typescript"
        else
            lang="javascript"
        fi
        # Detect framework from package.json
        local deps
        deps=$(node -e "try{const p=JSON.parse(require('fs').readFileSync('$TARGET_PROJECT/package.json','utf8'));const d={...p.dependencies,...p.devDependencies};console.log(Object.keys(d).join(','))}catch{console.log('')}" 2>/dev/null)
        case "$deps" in
            *next*) framework="nextjs" ;;
            *nuxt*) framework="nuxt" ;;
            *express*) framework="express" ;;
            *fastify*) framework="fastify" ;;
            *nest*) framework="nestjs" ;;
            *react*) framework="react" ;;
            *vue*) framework="vue" ;;
            *angular*) framework="angular" ;;
            *flask*) framework="flask" ;;
            *django*) framework="django" ;;
            *fastapi*) framework="fastapi" ;;
            *gin*) framework="gin" ;;
            *fiber*) framework="fiber" ;;
            *spring*) framework="spring" ;;
            *) framework="node" ;;
        esac
    elif [ -f "$TARGET_PROJECT/go.mod" ]; then
        lang="go"
        framework="go"
    elif [ -f "$TARGET_PROJECT/requirements.txt" ] || [ -f "$TARGET_PROJECT/pyproject.toml" ]; then
        lang="python"
        framework="django"
    elif [ -f "$TARGET_PROJECT/Cargo.toml" ]; then
        lang="rust"
        framework="rust"
    elif [ -f "$TARGET_PROJECT/pom.xml" ] || [ -f "$TARGET_PROJECT/build.gradle" ]; then
        lang="java"
        framework="spring"
    elif [ -f "$TARGET_PROJECT/*.csproj" ] || [ -f "$TARGET_PROJECT/Unity*" ]; then
        lang="csharp"
        framework="unity"
    fi

    echo "$lang $framework"
}

# ─── Create .daiharness Directory ──────────────────────────────────────

create_dai_harness_dir() {
    local fw_dir="$TARGET_PROJECT/.daiharness"
    
    if [ -d "$fw_dir" ]; then
        log_warn ".daiharness/ already exists in this project"
        log_info "Skipping profile generation."
        return
    fi

    log_info "Creating .daiharness/ directory..."
    mkdir -p "$fw_dir"

    # Detect tech stack
    read -r lang framework <<< "$(detect_tech_stack)"
    local project_name
    project_name=$(basename "$TARGET_PROJECT")

    log_ok "Detected: $lang / $framework"

    # Generate project-profile.json
    cat > "$fw_dir/project-profile.json" <<EOF
{
  "project": "$project_name",
  "language": "$lang",
  "framework": "$framework",
  "projectRoot": "$TARGET_PROJECT",
  "dai-harnessRepo": "$DAIHARNESS_PATH",
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dai-harnessVersion": "$(cat "$DAIHARNESS_PATH/VERSION" 2>/dev/null || echo "unknown")"
}
EOF

    log_ok "Generated .daiharness/project-profile.json"
}

ensure_project_policy() {
    local policy_seeder="${DAIHARNESS_PATH}/scripts/lite/ensure-project-policy.sh"
    local policy_result

    if [[ ! -x "$policy_seeder" ]]; then
        log_error "Execution-policy seeder not found: $policy_seeder"
        exit 1
    fi
    if ! policy_result=$(bash "$policy_seeder" "$DAIHARNESS_PATH" "$TARGET_PROJECT"); then
        log_error "Could not seed the project execution policy."
        exit 1
    fi

    case "$policy_result" in
        created:*) log_ok "Seeded .daiharness/execution-policy.yaml" ;;
        preserved:*) log_info "Preserved existing .daiharness/execution-policy.yaml" ;;
        *) log_error "Unexpected policy-seeder result: $policy_result"; exit 1 ;;
    esac
}

# ─── Index with the memory layer ───────────────────────────────────────────

run_memory_index() {
    if ! command -v node &> /dev/null; then
        log_warn "Node.js not found — skipping indexing."
        return
    fi

    if ! git -C "$TARGET_PROJECT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        log_warn "Not a git repo — skipping indexing."
        return
    fi

    # The engine is installed outside the repository, one directory per pinned
    # version, so the resolver is asked rather than a path guessed.
    local resolver="${DAIHARNESS_PATH}/scripts/lite/dai_memory.py"
    if [[ ! -f "$resolver" ]]; then
        log_warn "No scripts/lite/dai_memory.py in ${DAIHARNESS_PATH} — skipping indexing."
        return
    fi

    local python_bin=""
    for candidate in py python3 python; do
        if command -v "$candidate" &> /dev/null; then python_bin="$candidate"; break; fi
    done
    if [[ -z "$python_bin" ]]; then
        log_warn "No Python found — skipping indexing."
        return
    fi
    [[ "$python_bin" == "py" ]] && python_bin="py -3"

    log_info "Installing the memory layer (dependencies, build, embedding model)..."
    if ! $python_bin "$resolver" install > /dev/null 2>&1; then
        log_warn "The memory layer did not install. Run: $python_bin scripts/lite/dai_memory.py install"
        return
    fi

    local engine
    engine="$($python_bin "$resolver" where 2>/dev/null)" || engine=""
    if [[ -z "$engine" ]]; then
        log_warn "The memory layer reported no install directory — skipping indexing."
        return
    fi

    log_info "Indexing the project..."
    if (cd "$TARGET_PROJECT" && node "${engine}/bin/dai-memory.mjs" init > /dev/null 2>&1); then
        log_ok "Indexed"
    else
        log_warn "Indexing failed. Run: node \"${engine}/bin/dai-memory.mjs\" init"
    fi
}

# ─── Print Cursor MCP Config ─────────────────────────────────────────────

print_cursor_config() {
    echo ""
    echo -e " ${YELLOW}Cursor MCP Config${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Your global dai-harness MCP is already configured at:"
    echo "  ${CYAN}~/.cursor/mcp.json${NC}"
    echo ""
    echo "  MCP server path: ${DAIHARNESS_PATH}/mcp/build/index.js"
    echo ""
    echo "  ⚠️  Restart Cursor for MCP changes to take effect."
    echo ""
}

# ─── Main ───────────────────────────────────────────────────────────────

update_gitignore() {
    local gitignore_file="${TARGET_PROJECT}/.gitignore"
    log_info "Updating .gitignore in target project..."
    
    # Create .gitignore if it doesn't exist
    if [ ! -f "$gitignore_file" ]; then
        touch "$gitignore_file"
    fi

    # Append DAI Harness if not present
    if ! grep -q "memory.db\*" "$gitignore_file" 2>/dev/null; then
        echo "" >> "$gitignore_file"
        echo "# DAI Harness local state and binary memory databases" >> "$gitignore_file"
        echo ".daiharness/memory.db*" >> "$gitignore_file"
        echo ".daiharness/session-log.json" >> "$gitignore_file"
        echo ".daiharness/quality-history.json" >> "$gitignore_file"
        echo ".daiharness/quality-report-*.json" >> "$gitignore_file"
        echo ".daiharness/baseline-*.json" >> "$gitignore_file"
        echo ".daiharness/change-manifest-*.json" >> "$gitignore_file"
        log_ok "Added DAI Harness local state and memory files to target project's .gitignore"
    fi

    # The memory layer's store. It holds the index and what people recorded;
    # it is machine-specific and rebuilt by `init`, so it is never committed.
    if ! grep -q "^\.memory/" "$gitignore_file" 2>/dev/null; then
        echo "" >> "$gitignore_file"
        echo "# Memory layer store (index, recorded memory, viewer)" >> "$gitignore_file"
        echo ".memory/" >> "$gitignore_file"
        log_ok "Added the memory store to the target project's .gitignore"
    fi
}

setup_llm_wiki_integration() {
    log_info "Setting up llm_wiki integration..."
    
    local target_scripts_dir="${TARGET_PROJECT}/scripts"
    mkdir -p "$target_scripts_dir"
    
    # 1. Copy daiharness-wiki-sync.sh to target project scripts
    cp "${DAIHARNESS_PATH}/scripts/daiharness-wiki-sync.sh" "${target_scripts_dir}/daiharness-wiki-sync.sh"
    chmod +x "${target_scripts_dir}/daiharness-wiki-sync.sh"
    log_ok "Copied daiharness-wiki-sync.sh to target project"
    
    # 2. Setup Git Hook (Husky or standard git)
    if [ -d "${TARGET_PROJECT}/.husky" ]; then
        local husky_hook="${TARGET_PROJECT}/.husky/post-commit"
        log_info "Husky detected. Adding post-commit hook..."
        cat > "$husky_hook" <<'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.daiharness/project-profile\.json|\.daiharness/code-conventions\.md)'; then
  echo "📄 [DAI Harness] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/daiharness-wiki-sync.sh" ]; then
    ./scripts/daiharness-wiki-sync.sh
  fi
fi

# Code changed: re-read it into the memory layer, then refresh the sequence flow.
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [DAI Harness] Code changed. Re-indexing with the memory layer..."
  ENGINE="$(py -3 ./scripts/lite/dai_memory.py where 2>/dev/null || python3 ./scripts/lite/dai_memory.py where 2>/dev/null || true)"
  if [ -n "$ENGINE" ]; then
    node "$ENGINE/bin/dai-memory.mjs" ingest --quiet
  else
    echo "   the memory layer is not installed: python scripts/lite/dai_memory.py install"
  fi
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$husky_hook"
        log_ok "Husky post-commit hook configured: .husky/post-commit"
    elif [ -d "${TARGET_PROJECT}/.git" ]; then
        local git_hook="${TARGET_PROJECT}/.git/hooks/post-commit"
        log_info "Standard Git detected. Adding post-commit hook..."
        cat > "$git_hook" <<'EOF'
#!/bin/sh
# Auto-generated by DAI Harness Setup

# Kiểm tra xem commit vừa rồi có thay đổi tài liệu không
if git diff-tree --no-commit-id --name-only -r HEAD | grep -q -E '^(docs/|README\.md|README\.vi\.md|TASKS\.md|\.daiharness/project-profile\.json|\.daiharness/code-conventions\.md)'; then
  echo "📄 [DAI Harness] Phát hiện thay đổi tài liệu. Đang tự động đồng bộ sang llm_wiki..."
  if [ -x "./scripts/daiharness-wiki-sync.sh" ]; then
    ./scripts/daiharness-wiki-sync.sh
  fi
fi

# Code changed: re-read it into the memory layer, then refresh the sequence flow.
if git diff-tree --no-commit-id --name-only -r HEAD | grep -E '^(src/|mcp/|scripts/).*\.(ts|py|js|cs|gd|go|rs)$' | grep -v -E '(test|spec)' > /dev/null; then
  echo "🔍 [DAI Harness] Code changed. Re-indexing with the memory layer..."
  ENGINE="$(py -3 ./scripts/lite/dai_memory.py where 2>/dev/null || python3 ./scripts/lite/dai_memory.py where 2>/dev/null || true)"
  if [ -n "$ENGINE" ]; then
    node "$ENGINE/bin/dai-memory.mjs" ingest --quiet
  else
    echo "   the memory layer is not installed: python scripts/lite/dai_memory.py install"
  fi
  if [ -f "./scripts/generate-sequence.ts" ]; then
    npx tsx ./scripts/generate-sequence.ts
  fi
fi
EOF
        chmod +x "$git_hook"
        log_ok "Git post-commit hook configured: .git/hooks/post-commit"
    else
        log_warn "Git repository not found. Skipping git hook installation."
    fi
}

setup_submodule_auto_update() {
    log_info "Setting up submodule auto-update hooks..."
    local hook_installer="${DAIHARNESS_PATH}/scripts/lite/install-submodule-update-hooks.sh"
    if [[ ! -x "$hook_installer" ]]; then
        log_warn "Submodule hook installer not found: $hook_installer"
    elif [[ ! -f "${TARGET_PROJECT}/.gitmodules" ]]; then
        log_info "No .gitmodules found; submodule auto-update hooks are not required."
    elif bash "$hook_installer" "$TARGET_PROJECT"; then
        log_ok "Git hooks configured: post-merge, post-checkout"
    else
        log_warn "Could not install submodule auto-update hooks."
    fi
}

main() {
    check_prerequisites
    create_dai_harness_dir
    ensure_project_policy
    update_gitignore
    setup_llm_wiki_integration
    setup_submodule_auto_update
    run_memory_index
    print_cursor_config

    echo ""
    log_ok "Setup complete!"
    echo ""
    echo -e "  ${BOLD}Next steps:${NC}"
    echo -e "  1. Restart Cursor (required for MCP server)"
    echo -e "  2. Type '${CYAN}/dai-harness${NC}' in Cursor chat to activate the skill"
    echo -e "  3. Say '${CYAN}Build a production-grade SaaS for [your idea]${NC}'"
    echo ""
    echo -e "  ${BOLD}For code intelligence (DAI memory):${NC}"
    echo -e "  Run ${CYAN}dai-memory ingest${NC} in this project anytime."
    echo ""
}

main "$@"
