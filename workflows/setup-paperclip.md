---
description: Set up Paperclip multi-agent orchestration alongside DAI Harness
---

# Setup Paperclip (Multi-Agent Orchestration)

Paperclip is an **optional** business orchestration layer that manages multiple AI agents as a company. DAI Harness provides the engineering skills; Paperclip provides the management layer.

**Prerequisites:** Node.js 22+, pnpm 9.15+

## Steps

### 1. Install Paperclip

// turbo
```bash
npx paperclipai onboard --yes
```

This installs the Paperclip server with an embedded PostgreSQL database. No additional setup required.

### 2. Start the server

```bash
cd paperclip && pnpm dev
```

Server starts at `http://localhost:3100`.

### 3. Open Dashboard

Open `http://localhost:3100` in your browser.

### 4. Create a Company

In the dashboard:
1. Click "New Company"
2. Set a name (e.g., "My SaaS Team")
3. Set monthly budget (e.g., $50)

### 5. Add Agents

For each AI agent you want to manage:
1. Click "Add Agent"
2. Choose agent type (OpenClaw, Antigravity, Codex, etc.)
3. Set heartbeat schedule (e.g., every 5 minutes)
4. Point working directory to your project (where DAI Harness is installed)

### 6. Set Goals

Create company goals in the dashboard:
- "Build MVP of payment feature"
- "Increase test coverage to 80%"
- "Fix all security vulnerabilities"

Paperclip's AI CEO will break goals into tickets and assign them to agents.

### 7. Verify Integration

Agents should:
1. Receive tickets from Paperclip (via heartbeat)
2. Read `AGENTS.md` in your project → DAI Harness routes to skills
3. Execute using DAI Harness's pipeline (DEFINE → BUILD → HARDEN → SHIP)
4. Report completion back to Paperclip dashboard

## Architecture

```
Paperclip Server (localhost:3100)     ← Business layer (goals, tickets, budget)
    ↓ assigns tickets
AI Agents (OpenClaw, Antigravity)     ← Execution layer
    ↓ reads AGENTS.md
DAI Harness (git submodule)           ← Engineering layer (53 skills)
    ↓ writes code
Your Project (git repo)              ← Your codebase
```

## Useful Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start Paperclip server |
| `pnpm build` | Production build |
| `pnpm test:run` | Run tests |

## Notes

- Paperclip runs as a **separate server** — it does NOT modify your git repo
- DAI Harness skills auto-detect Paperclip context via the `paperclip-integration` protocol
- Budget tracking is handled by Paperclip, not DAI Harness
- To stop Paperclip, just stop the server — your project continues working with DAI Harness alone
