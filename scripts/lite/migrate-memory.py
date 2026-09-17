#!/usr/bin/env python3
"""Moves what people recorded in the old SQLite memory into the DAI memory layer.

    python scripts/lite/migrate-memory.py [--project DIR] [--dry-run]

The harness used to keep memory in <project>/.dainexus/memory.db. It now keeps
it in the DAI memory layer, at <project>/.memory. This copies the old records
across, once, and changes nothing in the old database: it is opened read-only
and left exactly as it was, so nothing is lost if the migration is wrong.

What moves: every observation that was not archived, with its title, content
and importance, into the layer its category belongs to. Each lands with a
source reference naming the row it came from, `legacy:memory.db#<id>`. The
layer derives a memory's id from its layer, source and text, so running this
again writes the same ids and creates no duplicates.

What does not move, and why -- all of it reported, none of it silent:

* Archived observations. Somebody retired them; bringing them back would
  undo that.
* Observations of type `ingested`. Those were copied out of files, and the
  memory layer reads files itself when `init` scans the project. Migrating them
  would turn a file's contents into something that looks recorded by a person.

The project needs a memory store first (`init`), and the layer needs its model:
this refuses to start without either, before reading anything.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dai_memory  # noqa: E402

DERIVED_TYPES = {"ingested"}


def legacy_rows(db: Path) -> list[sqlite3.Row]:
    # Read-only by URI: a migration that could write to the store it is
    # migrating from is one bug away from damaging the only other copy.
    conn = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        return conn.execute(
            "SELECT id, type, title, content, importance, archived FROM observations ORDER BY id"
        ).fetchall()
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument(
        "--project", default=".", help="project root (default: current directory)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="report what would move, write nothing"
    )
    args = parser.parse_args()

    project = Path(args.project).resolve()
    db = project / ".dainexus" / "memory.db"
    if not db.is_file():
        print(f"nothing to migrate: {db} does not exist")
        return 0

    rows = legacy_rows(db)
    moving = [r for r in rows if not r["archived"] and r["type"] not in DERIVED_TYPES]
    archived = [r for r in rows if r["archived"]]
    derived = [r for r in rows if not r["archived"] and r["type"] in DERIVED_TYPES]

    print(f"{db}: {len(rows)} observations")
    print(f"  {len(moving)} to migrate")
    print(f"  {len(archived)} archived -- left behind, somebody retired them")
    print(
        f"  {len(derived)} copied from files -- left behind, `init` re-reads the files"
    )

    if args.dry_run:
        for row in moving:
            print(
                f"  would move #{row['id']} [{dai_memory.layer_for(row['type'])}] {row['title']}"
            )
        return 0

    # Checked before the first write, so a missing store or model is one clear
    # refusal rather than the same failure repeated once per row.
    probe = dai_memory.run("doctor", cwd=project)
    if "error" in probe:
        print(
            f"\nthe memory layer is not ready in {project}:\n{probe['error']}",
            file=sys.stderr,
        )
        print(
            f"run `node {dai_memory.memory_cli()} init` in the project first.",
            file=sys.stderr,
        )
        return 1

    moved: list[tuple[int, str]] = []
    failed: list[tuple[int, str]] = []
    for index, row in enumerate(moving, start=1):
        text = row["content"] if row["content"].strip() else row["title"]
        result = dai_memory.write(
            text,
            cwd=project,
            category=row["type"],
            importance=row["importance"],
            source_ref=f"legacy:memory.db#{row['id']}",
            title=dai_memory.title_for(row["title"] or text),
        )
        if "error" in result:
            failed.append((row["id"], result["error"]))
            print(
                f"  [{index}/{len(moving)}] #{row['id']} FAILED: {result['error'].splitlines()[0]}"
            )
        else:
            moved.append((row["id"], result["id"]))
            print(f"  [{index}/{len(moving)}] #{row['id']} -> {result['id']}")

    print(f"\nmigrated {len(moved)} of {len(moving)}; {db} is unchanged.")
    if failed:
        print(
            f"{len(failed)} failed -- run again after fixing the cause; migrated rows are not duplicated:"
        )
        for row_id, reason in failed:
            print(f"  #{row_id}: {reason.splitlines()[0]}")
        return 1
    print(
        json.dumps(
            {"migrated": len(moved), "archived": len(archived), "derived": len(derived)}
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
