#!/usr/bin/env python3
"""
mcp/server.py
DAI Nexus MCP server — zero-dependency Python implementation of the
Model Context Protocol over stdio (JSON-RPC 2.0, newline-delimited).

Exposes pipeline state + memory to any MCP-capable IDE (Claude Code,
Cursor, Zed, Gemini CLI, ...) via 8 dn_* tools.

State: .dainexus/pipeline-state.json (atomic writes)
Memory: the DAI memory layer (sources in vendor/dai-memory, installed by
`python scripts/lite/dai_memory.py install`), store at <project>/.memory

Register in Claude Code via .mcp.json:
    {"mcpServers": {"dai-nexus": {"command": "py", "args": ["-3", "mcp/server.py"]}}}

Smoke test:
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | py -3 mcp/server.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "lite"))
import dai_memory  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "dai-nexus", "version": "0.2.0"}

PROJECT_ROOT = Path(os.environ.get("DAINEXUS_ROOT", ".")).resolve()
STATE_FILE = PROJECT_ROOT / ".dainexus" / "pipeline-state.json"

PHASE_KEYS = ["interpret", "define", "build", "harden", "ship"]
GATES = {"define": ["gate1_brd", "gate2_architecture"], "ship": ["gate3_release"]}

DEFAULT_STATE = {
    "goal": None,
    "mode": None,
    "status": "idle",  # idle | running | blocked_on_gate | failed | done
    "phase_index": -1,
    "phases": [{"key": k, "status": "pending"} for k in PHASE_KEYS],
    "pending_gate": None,
    "gates": {},  # gate name -> {approved, summary, ts}
    "failure_reason": None,
    "updated_at": None,
}


# ── state persistence ─────────────────────────────────────────────────────────


def load_state() -> dict:
    if STATE_FILE.is_file():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return json.loads(json.dumps(DEFAULT_STATE))


def save_state(state: dict) -> None:
    state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(STATE_FILE.parent), suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    os.replace(tmp, str(STATE_FILE))


# ── tool implementations ──────────────────────────────────────────────────────


def tool_start_pipeline(args: dict) -> dict:
    state = json.loads(json.dumps(DEFAULT_STATE))
    state["goal"] = args.get("goal", "")
    state["mode"] = args.get("mode", "FULL_BUILD")
    state["status"] = "running"
    state["phase_index"] = 0
    state["phases"][0]["status"] = "running"
    save_state(state)
    return {"started": True, "phase": PHASE_KEYS[0], "mode": state["mode"]}


def tool_get_state(_args: dict) -> dict:
    return load_state()


def tool_advance_phase(_args: dict) -> dict:
    state = load_state()
    if state["status"] != "running":
        return {"error": f"cannot advance: status is '{state['status']}'"}
    idx = state["phase_index"]
    current_key = PHASE_KEYS[idx] if 0 <= idx < len(PHASE_KEYS) else None
    # Gate discipline: phases with gates need all their gates approved first
    for gate in GATES.get(current_key, []):
        if not state["gates"].get(gate, {}).get("approved"):
            state["status"] = "blocked_on_gate"
            state["pending_gate"] = gate
            save_state(state)
            return {
                "error": f"gate '{gate}' not approved — call dn_request_gate_approval first"
            }
    state["phases"][idx]["status"] = "passed"
    if idx + 1 >= len(PHASE_KEYS):
        state["status"] = "done"
        save_state(state)
        return {"done": True, "message": "pipeline complete"}
    state["phase_index"] = idx + 1
    state["phases"][idx + 1]["status"] = "running"
    save_state(state)
    return {"advanced": True, "phase": PHASE_KEYS[idx + 1]}


def tool_request_gate_approval(args: dict) -> dict:
    state = load_state()
    gate = args.get("gate", "")
    state["pending_gate"] = gate
    state["status"] = "blocked_on_gate"
    state["gates"][gate] = {
        "approved": False,
        "summary": args.get("summary", ""),
        "ts": time.time(),
    }
    save_state(state)
    return {
        "requested": gate,
        "note": "present summary to the user and WAIT; then call dn_approve_gate",
    }


def tool_approve_gate(args: dict) -> dict:
    state = load_state()
    gate = args.get("gate", "")
    approved = bool(args.get("approved", False))
    if gate not in state["gates"]:
        return {"error": f"gate '{gate}' was never requested"}
    state["gates"][gate]["approved"] = approved
    state["gates"][gate]["ts"] = time.time()
    if approved and state["pending_gate"] == gate:
        state["pending_gate"] = None
        state["status"] = "running"
    save_state(state)
    return {"gate": gate, "approved": approved}


def tool_fail_pipeline(args: dict) -> dict:
    state = load_state()
    state["status"] = "failed"
    state["failure_reason"] = args.get("reason", "unspecified")
    idx = state["phase_index"]
    if 0 <= idx < len(PHASE_KEYS):
        state["phases"][idx]["status"] = "failed"
    save_state(state)
    return {"failed": True, "reason": state["failure_reason"]}


# ── memory: the DAI memory layer ───────────────────────────────────────────────
#
# Both tools go through scripts/lite/dai_memory.py, which holds the category
# mapping and the rule that a failure comes back as an error, never as an empty
# result.


def tool_memory_add(args: dict) -> dict:
    text = str(args.get("text", ""))
    if not text.strip():
        return {"error": "dn_memory_add needs text"}
    stamp = time.strftime("%Y-%m-%d", time.gmtime())
    return dai_memory.write(
        text,
        cwd=PROJECT_ROOT,
        category=str(args.get("category", "general")),
        importance=int(args.get("importance", 5)),
        source_ref=f"mcp:{stamp}",
    )


def tool_memory_search(args: dict) -> dict:
    query = str(args.get("query", ""))
    if not query.strip():
        return {"error": "dn_memory_search needs a query"}
    return dai_memory.search(query, cwd=PROJECT_ROOT, limit=int(args.get("limit", 5)))


TOOLS = {
    "dn_start_pipeline": (
        tool_start_pipeline,
        "Start a new pipeline run. Resets state.",
        {
            "type": "object",
            "properties": {
                "goal": {"type": "string"},
                "mode": {
                    "type": "string",
                    "enum": [
                        "QUICK",
                        "REVIEW",
                        "TEST",
                        "FEATURE",
                        "SHIP",
                        "FULL_BUILD",
                    ],
                },
            },
            "required": ["goal"],
        },
    ),
    "dn_get_state": (
        tool_get_state,
        "Get full pipeline state (phases, gates, status).",
        {"type": "object", "properties": {}},
    ),
    "dn_advance_phase": (
        tool_advance_phase,
        "Mark current phase passed and start the next. Blocked if the phase's gates are not approved.",
        {"type": "object", "properties": {}},
    ),
    "dn_request_gate_approval": (
        tool_request_gate_approval,
        "Register a gate approval request (gate1_brd, gate2_architecture, gate3_release).",
        {
            "type": "object",
            "properties": {"gate": {"type": "string"}, "summary": {"type": "string"}},
            "required": ["gate"],
        },
    ),
    "dn_approve_gate": (
        tool_approve_gate,
        "Record the user's gate decision. Only call AFTER the user explicitly decided.",
        {
            "type": "object",
            "properties": {"gate": {"type": "string"}, "approved": {"type": "boolean"}},
            "required": ["gate", "approved"],
        },
    ),
    "dn_fail_pipeline": (
        tool_fail_pipeline,
        "Mark the pipeline failed with a reason.",
        {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    ),
    "dn_memory_add": (
        tool_memory_add,
        "Record an observation in project memory (the DAI memory layer: embedded, "
        "secret-redacted, anchored to the code its source names). category decides the "
        "layer: decision/convention/constraint, error/incident, procedure.",
        {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "category": {"type": "string"},
                "importance": {"type": "integer"},
            },
            "required": ["text"],
        },
    ),
    "dn_memory_search": (
        tool_memory_search,
        "Search project memory: keyword, semantic, recency, code-graph and memory-graph "
        "branches fused by RRF, with a report of which branches contributed.",
        {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
    ),
}


# ── JSON-RPC dispatch ─────────────────────────────────────────────────────────


def handle(msg: dict) -> dict | None:
    method = msg.get("method", "")
    msg_id = msg.get("id")
    params = msg.get("params") or {}

    if method == "initialize":
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        }
    elif method in ("notifications/initialized", "notifications/cancelled"):
        return None
    elif method == "ping":
        result = {}
    elif method == "tools/list":
        result = {
            "tools": [
                {"name": name, "description": desc, "inputSchema": schema}
                for name, (_fn, desc, schema) in TOOLS.items()
            ]
        }
    elif method == "tools/call":
        name = params.get("name", "")
        if name not in TOOLS:
            return _error(msg_id, -32602, f"Unknown tool: {name}")
        try:
            payload = TOOLS[name][0](params.get("arguments") or {})
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(payload, ensure_ascii=False, default=str),
                    }
                ],
                "isError": "error" in payload,
            }
        except Exception as e:
            return _error(msg_id, -32603, f"Tool '{name}' crashed: {e}")
    else:
        if msg_id is None:
            return None  # unknown notification — ignore
        return _error(msg_id, -32601, f"Method not found: {method}")

    if msg_id is None:
        return None
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


def main() -> None:
    # MCP requires UTF-8 regardless of Windows locale
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle(msg)
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
