# Troubleshooting Guide

> **Status: Placeholder** — Content to be added.

## Common Issues

### DAI Nexus not responding

1. Check that `CLAUDE.md` or `AGENTS.md` exists in project root
2. Verify MCP server is running: `bash scripts/dainexus-mcp-setup.sh --check`
3. Check session health: `dai-memory status`

### Wrong mode selected

Add more context to your request. See [Mode Reference](mode-reference.md) for mode descriptions.

### Skills not loading

1. Check skill directory: `ls skills/`
2. Run health check: `bash scripts/skill-health.sh check`
3. Verify skill schema: each skill needs `SKILL.md`

### Memory issues

Run memory middleware:
```bash
dai-memory status
dai-memory ingest
```

### Plan quality score low

See [Research Gate](../skills/_shared/protocols/research-gate.md) for improving plan scores.

### Code graph index stale

```bash
dai-memory ingest
```

## Getting Help

- [Common Issues](common-issues.md) — Detailed solutions
- [GitHub Issues](https://github.com/Exia-thd/DAI-nexus/issues)

---

*Last updated: 2026-05-29*
