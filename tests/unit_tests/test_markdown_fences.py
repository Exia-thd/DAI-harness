"""Every tracked Markdown file must close the code fences it opens.

A fence left open is not a cosmetic problem here. Markdown pairs fences in order, so
one wrong marker inverts every block after it: prose is rendered as code, code is
rendered as prose, and the file keeps looking plausible in an editor that highlights
per line. README.md lost one opening fence and the last 170 lines of it rendered as a
single code block on the repository's front page.

In `skills/**/SKILL.md` it is worse than cosmetic. Those files are read as
instructions, and a block boundary is what separates an instruction from an example
of one.

The check follows CommonMark rather than counting markers. Counting was the first
version of this test and it missed five broken files: a missing closer and a stray
one cancel out, and an example written as ```markdown with another ``` block inside
it has an even count while the inner opener closes the outer block. CommonMark's rule
is exact and short -- a fence opened by N backticks closes only at a later fence of
at least N backticks that carries no info string.

A file is broken when a block is still open at its end, and also when a block that is
already open meets a fence of its own length carrying an info string. CommonMark reads
that line as content, but nobody writes ```bash meaning "the text ```bash": it is an
inner example opener the outer block swallowed. Its closer then closes the outer
block early, and the outer's own closer opens a new one. With a second nested example
further down the file ends balanced, so the end-of-file rule alone passes it.

Most breakage in this tree was that nesting: the fix is to give the outer block a
longer fence (````markdown ... ````) than anything inside it.

tests/markdown_fence_baseline.txt exists for inherited breakage that cannot be fixed
in the change that finds it. It is empty. A baselined file that starts passing fails
the second test, the same contract scripts/ci/pytest_gate.py uses for red tests, so
the list can only shrink.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "tests" / "markdown_fence_baseline.txt"
FENCE = "```"


def tracked_markdown() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "*.md"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def unclosed_fence(path: Path) -> int | None:
    """Line of a fenced block still open at end of file, by CommonMark's rule."""
    text = path.read_text(encoding="utf-8", errors="replace")
    opened: tuple[int, int] | None = None
    for index, line in enumerate(text.split("\n"), 1):
        stripped = line.lstrip()
        if not stripped.startswith(FENCE):
            continue
        run = len(stripped) - len(stripped.lstrip("`"))
        info = stripped[run:].strip()
        if opened is None:
            opened = (index, run)
        elif run >= opened[1] and not info:
            opened = None
    return opened[0] if opened else None


def swallowed_opener(path: Path) -> int | None:
    """Line of the first tagged fence read as content of an equal-length open block."""
    text = path.read_text(encoding="utf-8", errors="replace")
    opened: tuple[int, int] | None = None
    for index, line in enumerate(text.split("\n"), 1):
        stripped = line.lstrip()
        if not stripped.startswith(FENCE):
            continue
        run = len(stripped) - len(stripped.lstrip("`"))
        info = stripped[run:].strip()
        if opened is None:
            opened = (index, run)
        elif run >= opened[1] and not info:
            opened = None
        elif run == opened[1] and info:
            return index
    return None


def broken() -> dict[str, tuple[int, str]]:
    found: dict[str, tuple[int, str]] = {}
    for relative in tracked_markdown():
        path = ROOT / relative
        if not path.is_file():
            continue
        line = swallowed_opener(path)
        if line is not None:
            found[relative] = (
                line,
                "is an inner opener inside a block of the same length",
            )
            continue
        line = unclosed_fence(path)
        if line is not None:
            found[relative] = (line, "opens a block that never closes")
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


def test_no_markdown_file_leaves_a_code_fence_open():
    known = baselined()
    new = {path: found for path, found in broken().items() if path not in known}
    assert not new, "Markdown files that leave a code fence open:\n" + "\n".join(
        f"  {path}: line {line} {why}; give the outer example a longer fence "
        "(````markdown ... ````) than anything inside it"
        for path, (line, why) in sorted(new.items())
    )


def test_the_baseline_names_only_files_that_are_still_broken():
    fixed = sorted(baselined() - set(broken()))
    assert not fixed, (
        "These files close their fences now; delete them from "
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


def test_a_nested_example_is_only_closed_by_a_matching_fence(tmp_path: Path):
    # The shape most of this tree's breakage had, pinned so the rule itself cannot
    # regress to counting markers. Four backticks outside, three inside: the inner
    # closer does not close the outer block.
    nested = tmp_path / "nested.md"
    nested.write_text(
        "````markdown\n## Example\n```bash\necho hi\n```\n````\n",
        encoding="utf-8",
    )
    assert unclosed_fence(nested) is None

    # The same text with an equal-length outer fence: the inner opener is content,
    # the inner closer closes the outer block, and the real outer closer opens a
    # block that never ends.
    equal = tmp_path / "equal.md"
    equal.write_text(
        "```markdown\n## Example\n```bash\necho hi\n```\n```\n",
        encoding="utf-8",
    )
    assert unclosed_fence(equal) == 6

    # A closer carrying an info string is not a closer.
    tagged = tmp_path / "tagged.md"
    tagged.write_text("```\ncode\n```text\n", encoding="utf-8")
    assert unclosed_fence(tagged) == 1


def test_an_inner_opener_the_same_length_as_its_block_is_caught(tmp_path: Path):
    # The shape the end-of-file rule misses: an example with an equal-length inner
    # block, then an ordinary code block. The inner closer ends the example early, the
    # example's own closer opens a block, and the next opener -- read as content --
    # has a closer that ends it. The counts cancel and nothing is left open.
    after_example = tmp_path / "after_example.md"
    after_example.write_text(
        "```markdown\n## Example\n```bash\necho hi\n```\n```\n"
        "\nprose\n\n```bash\nls\n```\n",
        encoding="utf-8",
    )
    assert unclosed_fence(after_example) is None
    assert swallowed_opener(after_example) == 3

    nested = tmp_path / "nested.md"
    nested.write_text("````markdown\n```bash\necho hi\n```\n````\n", encoding="utf-8")
    assert swallowed_opener(nested) is None
