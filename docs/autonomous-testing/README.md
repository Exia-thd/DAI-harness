# Autonomous Testing System

> Self-healing test workflow for vibe coding: Code → Test → Detect Bug → Auto-Fix → Continue

## Quick Start

```bash
# Run tests with auto-fix of implementation/infrastructure only.
# Behavioral assertions/baselines remain requirement-locked.
dai test autonomous

# Run specific layers
dai test run --layer unit
dai test run --layer integration,visual

# Auto-fix implementation or test-infrastructure failures without changing behavioral oracles
dai test fix

# Update visual baselines ONLY after an explicit current visual requirement/reference change
dai test update-baseline
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AUTONOMOUS LOOP                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Code Feature ──► Run Tests ──► Bug Found?                │
│        ▲               │          │                          │
│        │               │         Yes                          │
│        │               │          ▼                          │
│        │          ┌────┴────┐                              │
│        │          │  Classify │                              │
│        │          │   Error   │                              │
│        │          └────┬────┘                              │
│        │               │                                    │
│        │    ┌─────────┼─────────┐                         │
│        │    │         │         │                          │
│        │    ▼         ▼         ▼                          │
│        │ ┌─────┐ ┌──────┐ ┌────────┐                     │
│        │ │Syntax│ │ Type │ │ Logic │                     │
│        │ │Error │ │ Error│ │  Bug  │                     │
│        │ └──┬──┘ └──┬───┘ └───┬────┘                     │
│        │    │        │         │                            │
│        │    ▼        ▼         ▼                            │
│        │ Auto-fix  Auto-fix Human review                    │
│        │    │        │         │                            │
│        │    └────────┼─────────┘                         │
│        │              │                                    │
│        │              ▼                                    │
│        │      All Fixed? ──No──► Continue (log issue)     │
│        │         │                                          │
│        │        Yes                                          │
│        │         │                                          │
│        └─────────┴──────────────────────────────────────► ✓ Continue
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Test Layers

| Layer | Tool | Speed | Auto-Fix Rate |
|-------|------|-------|---------------|
| Unit | Vitest | ~10ms | 90% |
| Integration | Vitest | ~100ms | 60% |
| Visual | Playwright + Applitools | ~1s | 40% |
| E2E | Playwright | ~10s | 30% |

## Auto-Fix Capabilities

### ✅ Auto-Fix (No Approval Needed)

- Syntax errors
- TypeScript type errors
- Import path errors
- Simple null checks
- Test assertion typos

### ⚠️ Auto-Fix (With Context)

- Complex logic bugs
- API response changes
- UI layout changes

### ❌ Human Required

- Architectural changes
- Security vulnerabilities
- Database migrations
- Breaking API changes

## CI/CD Integration

```yaml
# .github/workflows/autonomous.yml
- name: Autonomous Test
  run: dai test autonomous --max-attempts 3
```

## Configuration

```yaml
# .daiharness/autonomous.yaml
autonomous:
  enabled: true
  maxAutoFixAttempts: 3
  requireHumanApproval: false
```

## Files

```
docs/autonomous-testing/
├── autonomous-workflow.md     # Complete guide

skills/autonomous-testing/
└── SKILL.md                   # Skill definition

src/cli/src/commands/
└── test.ts                   # CLI commands
```
