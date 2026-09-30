#!/usr/bin/env bash
# Install idempotent parent-repository hooks that keep a DAI Harness submodule current.

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"

if ! git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "DAI Harness hook install denied: target is not a Git working tree: $PROJECT_ROOT" >&2
    exit 2
fi
if [[ ! -f "$PROJECT_ROOT/.gitmodules" ]]; then
    echo "DAI Harness hook install skipped: no .gitmodules in $PROJECT_ROOT" >&2
    exit 2
fi

if [[ -d "$PROJECT_ROOT/.husky" ]]; then
    HOOKS_DIR="$PROJECT_ROOT/.husky"
else
    HOOKS_DIR="$(git -C "$PROJECT_ROOT" rev-parse --git-path hooks)"
    if [[ "$HOOKS_DIR" != /* ]]; then
        HOOKS_DIR="$PROJECT_ROOT/$HOOKS_DIR"
    fi
fi
mkdir -p "$HOOKS_DIR"

install_hook() {
    local event="$1"
    local hook_file="$HOOKS_DIR/$event"
    local marker="# DAI Harness managed submodule auto-update"

    if [[ -f "$hook_file" ]] && grep -qF "$marker" "$hook_file"; then
        echo "DAI Harness $event hook already installed: $hook_file"
        return
    fi
    if [[ ! -f "$hook_file" ]]; then
        printf '%s\n' '#!/usr/bin/env sh' > "$hook_file"
    fi

    cat >> "$hook_file" <<'HOOK_BLOCK'

# DAI Harness managed submodule auto-update
DAIHARNESS_PARENT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ -f "$DAIHARNESS_PARENT_ROOT/.gitmodules" ]; then
    DAIHARNESS_SUBMODULE_PATH=$(
        git -C "$DAIHARNESS_PARENT_ROOT" config --file .gitmodules --name-only --get-regexp '^submodule\..*\.path$' 2>/dev/null |
        while IFS= read -r DAIHARNESS_PATH_KEY; do
            DAIHARNESS_PATH_VALUE=$(git -C "$DAIHARNESS_PARENT_ROOT" config --file .gitmodules --get "$DAIHARNESS_PATH_KEY" 2>/dev/null || true)
            if printf '%s' "$DAIHARNESS_PATH_VALUE" | grep -qi dai-harness; then
                printf '%s\n' "$DAIHARNESS_PATH_VALUE"
                break
            fi
        done
    )
    if [ -z "$DAIHARNESS_SUBMODULE_PATH" ]; then
        DAIHARNESS_SUBMODULE_PATH=$(
            git -C "$DAIHARNESS_PARENT_ROOT" config --file .gitmodules --name-only --get-regexp '^submodule\..*\.url$' 2>/dev/null |
            while IFS= read -r DAIHARNESS_URL_KEY; do
                DAIHARNESS_URL_VALUE=$(git -C "$DAIHARNESS_PARENT_ROOT" config --file .gitmodules --get "$DAIHARNESS_URL_KEY" 2>/dev/null || true)
                if printf '%s' "$DAIHARNESS_URL_VALUE" | grep -qi dai-harness; then
                    DAIHARNESS_PATH_KEY=${DAIHARNESS_URL_KEY%.url}.path
                    git -C "$DAIHARNESS_PARENT_ROOT" config --file .gitmodules --get "$DAIHARNESS_PATH_KEY" 2>/dev/null || true
                    break
                fi
            done
        )
    fi
    if [ -z "$DAIHARNESS_SUBMODULE_PATH" ]; then
        DAIHARNESS_SUBMODULE_PATH=dai-harness
    fi
    DAIHARNESS_UPDATER="$DAIHARNESS_PARENT_ROOT/$DAIHARNESS_SUBMODULE_PATH/scripts/lite/submodule-auto-update.sh"
    if [ -x "$DAIHARNESS_UPDATER" ]; then
        bash "$DAIHARNESS_UPDATER" --pull
    fi
fi
# End DAI Harness managed submodule auto-update
HOOK_BLOCK
    chmod +x "$hook_file"
    echo "Installed DAI Harness $event hook: $hook_file"
}

install_hook post-merge
install_hook post-checkout
