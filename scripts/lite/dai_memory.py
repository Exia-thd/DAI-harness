"""The harness's one way of talking to its memory: the DAI memory layer.

Memory is the layer in vendor/dai-memory -- a git submodule of the plugin's own
repository, pinned to one commit -- reached through its CLI rather than
reimplemented in Python. Everything in the harness that records or retrieves
memory -- the MCP tools, the migration from the old SQLite store -- goes
through this module, so the mapping from the harness's categories onto the
layer's layers, and the rule that a failure is an error and never an empty
answer, exist in exactly one place.

Standard library only: it runs from the zero-dependency MCP server.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HARNESS_ROOT = Path(__file__).resolve().parents[2]
VENDOR = HARNESS_ROOT / "vendor" / "dai-memory"
SUBMODULE = "vendor/dai-memory"
TIMEOUT_S = 120


def _git(*args: str, cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, timeout=TIMEOUT_S
    )


def pinned_commit() -> str | None:
    """The plugin commit the submodule has checked out, or None before `init`.

    The harness records which commit it uses in the submodule pointer; the
    checkout is that commit unless somebody moved it on purpose, and then the
    install directory follows what they moved it to.
    """
    if not (VENDOR / "bin" / "dai-memory.mjs").is_file():
        return None
    try:
        result = _git("rev-parse", "HEAD", cwd=VENDOR)
    except (OSError, subprocess.SubprocessError):
        return None
    commit = result.stdout.strip()
    return commit if result.returncode == 0 and len(commit) == 40 else None


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
    pinned commit gets its own install directory, named after the commit.
    Before the submodule is initialised there is no commit, and the directory
    named here never exists -- so installed() answers False instead of raising.
    """
    override = os.environ.get("DAI_MEMORY_ENGINE")
    if override:
        return Path(override)
    commit = pinned_commit()
    return _cache_root() / (commit[:16] if commit else "submodule-not-initialized")


def memory_cli() -> Path:
    return engine_dir() / "bin" / "dai-memory.mjs"


def installed() -> bool:
    return (engine_dir() / "packages" / "cli" / "dist" / "cli.js").is_file()


INSTALL_HINT = "python scripts/lite/dai_memory.py install"


def install() -> int:
    """Copy the pinned sources out of vendor/ and run the layer's own setup there.

    A clone made without --recurse-submodules has an empty vendor/dai-memory;
    that is initialised first rather than reported, since the fix is one
    command this script can run. Only files the plugin's repository tracks are
    copied -- never a node_modules or a build somebody left in the checkout.

    The copy is built beside its destination and moved into place only once it
    exists, so an interrupted copy never looks like an install. Setup itself is
    re-runnable and skips what is already done.
    """
    node = shutil.which("node")
    if not node:
        print("memory needs Node.js on PATH, and none was found", file=sys.stderr)
        return 1
    if pinned_commit() is None and not os.environ.get("DAI_MEMORY_ENGINE"):
        init = _git("submodule", "update", "--init", SUBMODULE, cwd=HARNESS_ROOT)
        if init.returncode != 0 or pinned_commit() is None:
            print(
                f"could not initialise {SUBMODULE}: {init.stderr.strip()}\n"
                f"run: git submodule update --init {SUBMODULE}",
                file=sys.stderr,
            )
            return 1
    target = engine_dir()
    if not target.is_dir():
        listed = _git("ls-files", "-z", cwd=VENDOR)
        if listed.returncode != 0:
            print(
                f"could not list {SUBMODULE}: {listed.stderr.strip()}", file=sys.stderr
            )
            return 1
        files = [name for name in listed.stdout.split("\0") if name]
        partial = target.with_name(target.name + ".partial")
        shutil.rmtree(partial, ignore_errors=True)
        for relative in files:
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


USAGE = (
    "usage: dai_memory.py install | where\n"
    "       dai_memory.py add <text> [--category C] [--importance 0-10] [--source S]\n"
    "       dai_memory.py search <query> [--limit N]"
)


def _cli(argv: list[str]) -> int:
    """The shell's way in: the scripts and hooks that record or recall memory.

    They used to call scripts/lite/memory.py; this is its replacement, so they
    keep one line each and land in the same store the MCP tools use. The
    answer is JSON on stdout; a failure is JSON with "error" and exit 1, never
    an empty success.
    """
    import argparse

    parser = argparse.ArgumentParser(prog="dai_memory.py", usage=USAGE)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("install")
    sub.add_parser("where")
    add = sub.add_parser("add")
    add.add_argument("text")
    add.add_argument("--category", default=None)
    add.add_argument("--importance", type=int, default=5)
    add.add_argument("--source", default="harness:script")
    find = sub.add_parser("search")
    find.add_argument("query")
    find.add_argument("--limit", type=int, default=5)
    args = parser.parse_args(argv)

    if args.command == "install":
        return install()
    if args.command == "where":
        print(engine_dir())
        return 0 if installed() else 1
    cwd = Path.cwd()
    if args.command == "add":
        result = write(
            args.text,
            cwd=cwd,
            category=args.category,
            importance=args.importance,
            source_ref=args.source,
        )
    else:
        result = search(args.query, cwd=cwd, limit=args.limit)
    print(json.dumps(result, ensure_ascii=False))
    return 1 if isinstance(result, dict) and "error" in result else 0


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
