#!/bin/bash
# MCP & Tool Status Checker

echo "=========================================="
echo "   DAI Harness Environment Status"
echo "=========================================="
echo ""

# 1. Code intelligence: the DAI memory layer
echo "🔮 DAI memory (code graph + memory)"
echo "-----------------------------------"
engine=""
for python_cmd in "py -3" python3 python; do
    engine="$(${python_cmd} scripts/lite/dai_memory.py where 2>/dev/null)" && break
    engine=""
done
if [ -n "$engine" ] && [ -f "$engine/bin/dai-memory.mjs" ]; then
    echo "  Engine: ✅ Installed ($engine)"
    node "$engine/bin/dai-memory.mjs" status 2>/dev/null | sed 's/^/  /' | head -6
else
    echo "  Engine: ❌ Not installed (python scripts/lite/dai_memory.py install)"
fi

if [ -f ".memory/meta.json" ]; then
    echo "  Index: ✅ Present (.memory/)"
else
    echo "  Index: ❌ Missing (.memory/) — run: dai-memory init"
fi
echo ""

# 2. DAI Harness MCP
echo "🛠️  DAI Harness MCP Server"
echo "-----------------------------------"
if ls ~/.cursor/projects/*/mcps/user-dai-harness/*.json 2>/dev/null | head -1 > /dev/null; then
    echo "  Config: ✅ Found"
else
    echo "  Config: ⚠️  Missing"
fi

# 3. mmx-cli
echo "⚡ mmx-cli (Antigravity CLI)"
echo "-----------------------------------"
if which mmx > /dev/null 2>&1; then
    VERSION=$(mmx --version 2>/dev/null || echo "unknown")
    echo "  Status: ✅ Installed ($VERSION)"
else
    echo "  Status: ❌ Not installed"
fi
echo ""

# 4. Current Workspace
echo "📁 Current Workspace"
echo "-----------------------------------"
echo "  Path: $(pwd)"
echo "  Git: $(git branch --show-current 2>/dev/null || echo 'N/A')"

# Check manifest
if [ -f ".antigravity/mcp-manifest.json" ]; then
    echo "  MCP Manifest: ✅ Present"
    SERVERS=$(grep -c '"name"' .antigravity/mcp-manifest.json 2>/dev/null || echo "0")
    echo "  Servers configured: $((SERVERS/2))"
else
    echo "  MCP Manifest: ❌ Missing"
fi
echo ""

# 5. Node & Package Managers
echo "📦 Package Managers"
echo "-----------------------------------"
echo "  Node: $(node --version 2>/dev/null || echo 'not found')"
echo "  npm: $(npm --version 2>/dev/null || echo 'not found')"
echo "  pnpm: $(pnpm --version 2>/dev/null || echo 'not found')"
echo ""

# 6. Quick Health Check
echo "🏥 Quick Health Check"
echo "-----------------------------------"

# Check Cursor MCP
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "  Board UI: ✅ Running on port 3000"
else
    echo "  Board UI: ⚠️  Not running"
fi

if curl -s http://localhost:4000 > /dev/null 2>&1; then
    echo "  Multica Hub: ✅ Running on port 4000"
else
    echo "  Multica Hub: ⚠️  Not running"
fi
echo ""

echo "=========================================="
echo "   Ready to work: $([ $? -eq 0 ] && echo '✅ YES' || echo '❌ NO')"
echo "=========================================="
