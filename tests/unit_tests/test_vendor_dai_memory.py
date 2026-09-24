"""The memory layer is the plugin's own repository, pinned as a submodule.

vendor/dai-memory used to be a hashed copy, refreshed by a sync script, so
every change to the layer was made twice. It is now a git submodule of the
plugin's repository: the harness records one commit, and changes land in the
plugin first. These tests hold the parts of that arrangement the harness owns:
where the submodule points, that the checkout is the recorded commit, and that
the install directory is named after that commit, so two pins never share one.

The upstream-name guard the sync script ran before copying is the smoke suite's
tree scan, which walks the submodule's checkout like any other directory.
"""

from __future__ import annotations

import configparser
import importlib.util
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SUBMODULE = "vendor/dai-memory"
PLUGIN_URL = "https://github.com/Exia-thd/DAI-memory-layer-plugin.git"


def _git(*args: str, cwd: Path = ROOT) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True
    ).stdout.strip()


def _load_dai_memory():
    spec = importlib.util.spec_from_file_location(
        "dai_memory_under_test", ROOT / "scripts" / "lite" / "dai_memory.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_submodule_points_at_the_plugin_repository():
    config = configparser.ConfigParser()
    config.read(ROOT / ".gitmodules", encoding="utf-8")
    section = f'submodule "{SUBMODULE}"'
    assert config[section]["path"] == SUBMODULE
    assert config[section]["url"] == PLUGIN_URL


def test_the_harness_records_a_commit_not_a_copy():
    # A gitlink (mode 160000) in the tree: a pointer, with no files beneath it.
    entry = _git("ls-files", "--stage", "--", SUBMODULE)
    assert entry.startswith("160000 "), entry
    assert _git("ls-files", "--", f"{SUBMODULE}/package.json") == ""


def test_the_checkout_is_the_recorded_commit():
    if not (ROOT / SUBMODULE / "bin" / "dai-memory.mjs").is_file():
        pytest.skip("submodule not initialised in this checkout")
    recorded = _git("ls-files", "--stage", "--", SUBMODULE).split()[1]
    checked_out = _git("rev-parse", "HEAD", cwd=ROOT / SUBMODULE)
    assert checked_out == recorded, (
        f"{SUBMODULE} is at {checked_out[:12]} but the harness records {recorded[:12]}; "
        "commit the new pointer or run `git submodule update`"
    )


def test_the_install_directory_is_named_after_the_pinned_commit(monkeypatch):
    dai_memory = _load_dai_memory()
    monkeypatch.delenv("DAI_MEMORY_ENGINE", raising=False)
    monkeypatch.setattr(dai_memory, "pinned_commit", lambda: "a" * 40)
    first = dai_memory.engine_dir()
    monkeypatch.setattr(dai_memory, "pinned_commit", lambda: "b" * 40)
    second = dai_memory.engine_dir()
    assert first.name == "a" * 16
    assert second.name == "b" * 16


def test_an_uninitialised_submodule_reads_as_not_installed(monkeypatch):
    # installed() is how the gate and the tests decide whether memory is
    # available; before `git submodule update --init` it must say no, not raise.
    dai_memory = _load_dai_memory()
    monkeypatch.delenv("DAI_MEMORY_ENGINE", raising=False)
    monkeypatch.setattr(dai_memory, "pinned_commit", lambda: None)
    assert dai_memory.installed() is False
    assert dai_memory.engine_dir().name == "submodule-not-initialized"
