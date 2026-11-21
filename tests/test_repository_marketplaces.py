"""A package repository that publishes its release in a subfolder is a marketplace at its root.

Owner, 2026-11-21: Muro (the desktop app) did not find Marionette from the address of its own
repository, acaprino/marionette, because the release sits in `marionette/` and nothing at the
root says where the plugin is. Claude Code and Codex find a plugin in a repository the same way:
through their marketplace file at its root. `muro marketplace` writes those files, derived from
the marketplaces the build already wrote in each adapter folder, so the format lives in one place.
"""
import json
import shutil

import pytest

from muro import build_release
from muro.adapters import MARKETPLACE_FILES, write_repository_marketplaces
from muro.cli import main


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def repository(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    repo = tmp_path / "repository"
    shutil.copytree(release, repo / "published")
    return repo


def test_each_root_marketplace_is_the_adapter_one_pointing_at_the_adapter_folder(repository):
    written = write_repository_marketplaces(repository, "published")
    assert sorted(written) == sorted(repository / f for f in MARKETPLACE_FILES.values())
    claude = read(repository / ".claude-plugin" / "marketplace.json")
    adapter = read(repository / "published" / "adapters" / "claude-code" / ".claude-plugin" / "marketplace.json")
    assert [p.pop("source") for p in claude["plugins"]] == ["./published/adapters/claude-code"]
    assert [p.pop("source") for p in adapter["plugins"]] == ["./"]
    assert claude == adapter
    codex = read(repository / ".agents" / "plugins" / "marketplace.json")
    adapter = read(repository / "published" / "adapters" / "codex" / ".agents" / "plugins" / "marketplace.json")
    assert [p.pop("source") for p in codex["plugins"]] == [{"source": "local", "path": "./published/adapters/codex"}]
    assert [p.pop("source") for p in adapter["plugins"]] == [{"source": "local", "path": "./"}]
    assert codex == adapter


def test_the_adapter_marketplaces_are_left_as_they_are(repository):
    adapter = repository / "published" / "adapters" / "claude-code" / ".claude-plugin" / "marketplace.json"
    before = adapter.read_bytes()
    write_repository_marketplaces(repository, "published")
    assert adapter.read_bytes() == before


@pytest.mark.parametrize("folder", ["../published", "/published", "", "published/../.."])
def test_a_folder_outside_the_repository_is_refused(repository, folder):
    with pytest.raises(ValueError, match="folder inside the repository"):
        write_repository_marketplaces(repository, folder)
    assert not (repository / ".claude-plugin").exists()


def test_a_folder_without_a_release_is_refused_and_writes_nothing(repository):
    shutil.rmtree(repository / "published" / "adapters" / "codex")
    with pytest.raises(ValueError, match="codex"):
        write_repository_marketplaces(repository, "published")
    assert not (repository / ".claude-plugin").exists()


def test_the_command_writes_them_and_names_each_file(repository, capsys):
    assert main(["marketplace", str(repository), "published"]) == 0
    out = capsys.readouterr().out
    for relative in MARKETPLACE_FILES.values():
        assert (repository / relative).is_file()
        assert str(repository / relative) in out


def test_the_command_refuses_with_exit_1(repository, capsys):
    assert main(["marketplace", str(repository), "missing"]) == 1
    assert "marketplace failed" in capsys.readouterr().err
