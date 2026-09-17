"""The harness's one way of talking to its memory: the vendored DAI memory layer.

Memory is the layer in vendor/dai-memory, reached through its CLI rather than
reimplemented in Python. Everything in the harness that records or retrieves
memory -- the MCP tools, the migration from the old SQLite store -- goes
through this module, so the mapping from the harness's categories onto the
layer's layers, and the rule that a failure is an error and never an empty
answer, exist in exactly one place.

Standard library only: it runs from the zero-dependency MCP server.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HARNESS_ROOT = Path(__file__).resolve().parents[2]
VENDOR = HARNESS_ROOT / "vendor" / "dai-memory"
PROVENANCE = VENDOR / "PROVENANCE.json"
TIMEOUT_S = 120


def _cache_root() -> Path:
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        base = Path(os.environ["LOCALAPPDATA"])
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "dai-harness" / "dai-memory"


def engine_dir() -> Path:
    """Where the vendored layer is installed and built.

    Outside the repository on purpose. Installed, the layer is ~500 MB of
    dependencies, and the harness's verifiers copy and fingerprint the whole
    worktree -- ignored files included -- so a build inside vendor/ doubled
    the cost of every one of them. vendor/ holds the pinned sources; each
    pinned version gets its own install directory, named after its record.
    """
    override = os.environ.get("DAI_MEMORY_ENGINE")
    if override:
        return Path(override)
    key = hashlib.sha256(PROVENANCE.read_bytes()).hexdigest()[:16]
    return _cache_root() / key


def memory_cli() -> Path:
    return engine_dir() / "bin" / "dai-memory.mjs"


def installed() -> bool:
    return (engine_dir() / "packages" / "cli" / "dist" / "cli.js").is_file()


INSTALL_HINT = "python scripts/lite/dai_memory.py install"


def install() -> int:
    """Copy the pinned sources out of vendor/ and run the layer's own setup there.

    The copy is built beside its destination and moved into place only once it
    exists, so an interrupted copy never looks like an install. Setup itself is
    re-runnable and skips what is already done.
    """
    node = shutil.which("node")
    if not node:
        print("memory needs Node.js on PATH, and none was found", file=sys.stderr)
        return 1
    target = engine_dir()
    if not target.is_dir():
        files = json.loads(PROVENANCE.read_text(encoding="utf-8"))["files"]
        partial = target.with_name(target.name + ".partial")
        shutil.rmtree(partial, ignore_errors=True)
        for relative in [*files, "PROVENANCE.json"]:
            destination = partial / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(VENDOR / relative, destination)
        partial.rename(target)
    print(f"memory layer: {target}", flush=True)
    return subprocess.run(
        [node, str(target / "bin" / "setup.mjs")], cwd=str(target)
    ).returncode


# The harness's categories, onto the layer's layers. A decision, a convention,
# a constraint or an architectural fact is a judgement that stays true until
# superseded; an error or an incident is something that happened; a procedure
# is how to do a thing. Anything else is a fact about the project, which is the
# semantic layer too.
CATEGORY_LAYERS = {
    "decision": "semantic",
    "decisions": "semantic",
    "convention": "semantic",
    "conventions": "semantic",
    "constraint": "semantic",
    "constraints": "semantic",
    "architecture": "semantic",
    "error": "episodic",
    "errors": "episodic",
    "incident": "episodic",
    "incidents": "episodic",
    "bug": "episodic",
    "session": "episodic",
    "procedure": "procedural",
    "procedures": "procedural",
    "howto": "procedural",
    "process": "procedural",
}


def layer_for(category: str | None) -> str:
    return CATEGORY_LAYERS.get((category or "").strip().lower(), "semantic")


def title_for(text: str, limit: int = 80) -> str:
    """The first non-empty line, cut to a length a list can show."""
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return first if len(first) <= limit else first[: limit - 3].rstrip() + "..."


def run(*argv: str, cwd: Path) -> dict:
    """One CLI call, as JSON, or {"error": reason}.

    Never an empty result in place of a failure. "Nothing is recorded about
    this" and "memory could not be asked" are different answers, and returning
    the first when the second is true is how a memory layer turns into a
    confident liar.
    """
    node = shutil.which("node")
    if not node:
        return {"error": "memory needs Node.js on PATH, and none was found"}
    cli = memory_cli()
    if not cli.is_file():
        return {
            "error": f"the memory layer is not installed at {cli.parent.parent}: run `{INSTALL_HINT}`"
        }
    try:
        done = subprocess.run(
            [node, str(cli), *argv, "--json"],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        return {"error": f"memory did not answer within {TIMEOUT_S}s"}
    if done.returncode != 0:
        reason = (done.stderr or done.stdout).strip() or f"exit {done.returncode}"
        return {"error": reason}
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError:
        return {
            "error": f"memory answered with something that is not JSON: {done.stdout[:200]}"
        }


def write(
    text: str,
    *,
    cwd: Path,
    category: str | None,
    importance: int,
    source_ref: str,
    title: str | None = None,
) -> dict:
    body = text.strip()
    if not body:
        return {"error": "a memory needs text"}
    return run(
        "write",
        "--layer",
        layer_for(category),
        "--title",
        title or title_for(body),
        "--body",
        body,
        "--source-ref",
        source_ref,
        "--importance",
        str(max(0, min(10, int(importance)))),
        cwd=cwd,
    )


def search(query: str, *, cwd: Path, limit: int) -> dict:
    if not query.strip():
        return {"error": "a search needs a query"}
    return run("search", query, "--limit", str(max(1, int(limit))), cwd=cwd)


if __name__ == "__main__":
    if sys.argv[1:] == ["install"]:
        sys.exit(install())
    if sys.argv[1:] == ["where"]:
        print(engine_dir())
        sys.exit(0 if installed() else 1)
    print("usage: dai_memory.py install | where", file=sys.stderr)
    sys.exit(2)
