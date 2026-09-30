#!/usr/bin/env bash
# One-time move of runtime state kept under the product's former name.
#
# DAI Harness was called DAI Nexus until v0.x, and its runtime state lived in
# .dainexus/ (per project), ~/.dainexus/ and ~/.dainexus-console/. The code now
# reads only the new names, so without this move an existing install would start
# over with an empty state directory and silently orphan its sessions, usage
# logs and memory bank.
#
# Sourced by bootstrap/daiharness-install.sh (home) and
# bootstrap/daiharness-setup.sh (project). Safe to run repeatedly: it moves a
# legacy path only when the new one does not exist yet, and never merges or
# overwrites. When both exist it leaves both and says so, because choosing which
# one holds the live state is the owner's call.

migrate_legacy_path() {
    local old="$1" new="$2"
    [[ -e "$old" ]] || return 0
    if [[ -e "$new" ]]; then
        echo "  legacy path kept: $old (both it and $new exist; move what you need by hand)" >&2
        return 0
    fi
    if mv "$old" "$new"; then
        echo "  migrated $old -> $new" >&2
    else
        echo "  could not move $old -> $new; is a process holding it open?" >&2
        return 1
    fi
}

# Home-level state: sessions, usage logs, memory bank, installed MCP server.
migrate_legacy_home() {
    local home="${1:-$HOME}"
    migrate_legacy_path "$home/.dainexus" "$home/.daiharness"
    migrate_legacy_path "$home/.dainexus-console" "$home/.daiharness-console"
}

# Project-level state and config.
migrate_legacy_project() {
    local project="$1"
    [[ -n "$project" ]] || return 0
    migrate_legacy_path "$project/.dainexus" "$project/.daiharness"
    migrate_legacy_path "$project/.dainexus.yaml" "$project/.daiharness.yaml"
}
