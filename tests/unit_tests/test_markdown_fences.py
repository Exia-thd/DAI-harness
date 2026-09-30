"""Every tracked Markdown file must close the code fences it opens.

An odd number of ``` markers is not a cosmetic problem here. Markdown pairs the
markers in order, so one missing or one extra marker inverts every block after it:
prose is rendered as code, code is rendered as prose, and the file keeps looking
plausible in an editor that highlights per-line. README.md lost one opening fence
and the last 170 lines of it rendered as a single code block on the repository's
front page.

In `skills/**/SKILL.md` it is worse than cosmetic. Those files are read as
instructions, and a block boundary is what separates an instruction from an example
of one.

Nine files were already broken when this test was written. They are listed in
tests/markdown_fence_baseline.txt with where each inversion starts, so the check
can be enforced now instead of after a sweep: new breakage fails, inherited
breakage is pinned, and a baselined file that starts passing also fails -- which is
how the list shrinks rather than rots.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "tests" / "markdown_fence_baseline.txt"


def tracked_markdown() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "*.md"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def fence_markers(path: Path) -> list[int]:
    """Line numbers of every ``` marker, in order."""
    text = path.read_text(encoding="utf-8", errors="replace")
    return [
        index
        for index, line in enumerate(text.split("\n"), 1)
        if line.lstrip().startswith("```")
    ]


def unbalanced() -> dict[str, int]:
    found: dict[str, int] = {}
    for relative in tracked_markdown():
        path = ROOT / relative
        if not path.is_file():
            continue
        markers = fence_markers(path)
        if len(markers) % 2 == 1:
            found[relative] = len(markers)
    return found


def baselined() -> set[str]:
    if not BASELINE.is_file():
        return set()
    entries = set()
    for line in BASELINE.read_text(encoding="utf-8").splitlines():
        entry = line.split("#", 1)[0].strip()
        if entry:
            entries.add(entry)
    return entries


def test_no_markdown_file_has_an_unbalanced_code_fence():
    broken = unbalanced()
    known = baselined()
    new = {path: count for path, count in broken.items() if path not in known}
    assert not new, "Markdown files with an odd number of ``` markers:\n" + "\n".join(
        f"  {path}  ({count} markers) -- every block after the first mistake is inverted"
        for path, count in sorted(new.items())
    )


def test_the_baseline_names_only_files_that_are_still_broken():
    broken = set(unbalanced())
    known = baselined()
    fixed = sorted(known - broken)
    assert not fixed, (
        "These files pair their fences now; delete them from "
        "tests/markdown_fence_baseline.txt so the list keeps shrinking:\n"
        + "\n".join(f"  {path}" for path in fixed)
    )


def test_the_baseline_only_names_tracked_files():
    tracked = set(tracked_markdown())
    missing = sorted(path for path in baselined() if path not in tracked)
    assert not missing, (
        "The baseline names files git does not track; a renamed or deleted file "
        "leaves an entry that can never be cleared:\n"
        + "\n".join(f"  {path}" for path in missing)
    )
