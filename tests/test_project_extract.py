"""`muro project extract`: the built plugin of one harness, from a project file into a folder (ADR-0035)."""
import json

import pytest

from muro import project
from muro.cli import main
from test_project_file import SLUG, build_release, cache, make_package, upstream, with_members  # noqa: F401  (fixtures)


@pytest.fixture(scope="module")
def mp(tmp_path_factory, upstream, cache):
    """A project file whose build has the adapters of three harnesses, and the server package Hermes reads."""
    root = tmp_path_factory.mktemp("extract")
    staged = build_release(root / "staged")
    adapters = staged / SLUG / "adapters"
    for name in ("codex", "hermes"):
        (adapters / name).mkdir()
        (adapters / name / "INSTALL.md").write_text(f"# {name}\n", encoding="utf-8")
    (adapters / "codex" / "skills" / "x").mkdir(parents=True)
    (adapters / "codex" / "skills" / "x" / "SKILL.md").write_bytes(b"line\r\nkept\n")
    (adapters / "hermes-mcp").mkdir()
    (adapters / "hermes-mcp" / "plugin.json").write_text("{}", encoding="utf-8")
    return project.pack(make_package(root / "pkg", *upstream), root / "t.mp", sources_cache=cache, release_dir=staged)


def files(folder):
    return sorted(path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file())


def test_only_the_named_harness_is_written_byte_for_byte(tmp_path, mp):
    written = project.extract(mp, "codex", tmp_path / "out", tmp_path / "kept")
    assert written == [tmp_path / "out" / "codex"]
    assert files(tmp_path / "out") == ["codex/INSTALL.md", "codex/skills/x/SKILL.md"]
    assert (tmp_path / "out" / "codex" / "skills" / "x" / "SKILL.md").read_bytes() == b"line\r\nkept\n"


def test_hermes_comes_with_the_server_package_beside_it(tmp_path, mp):
    written = project.extract(mp, "hermes", tmp_path / "out", tmp_path / "kept")
    assert written == [tmp_path / "out" / "hermes", tmp_path / "out" / "hermes-mcp"]
    assert files(tmp_path / "out") == ["hermes-mcp/plugin.json", "hermes/INSTALL.md"]


def test_a_folder_with_other_files_is_fine_and_they_stay(tmp_path, mp):
    (tmp_path / "note.txt").write_text("mine", encoding="utf-8")
    project.extract(mp, "claude-code", tmp_path, tmp_path / "kept")
    assert (tmp_path / "note.txt").read_text(encoding="utf-8") == "mine"
    assert (tmp_path / "claude-code" / "INSTALL.md").is_file()


@pytest.mark.parametrize("taken", ["hermes", "hermes-mcp"])
def test_nothing_is_overwritten_and_nothing_else_is_written(tmp_path, mp, taken):
    (tmp_path / "out" / taken).mkdir(parents=True)
    (tmp_path / "out" / taken / "mine.txt").write_text("mine", encoding="utf-8")
    with pytest.raises(ValueError, match="already exists"):
        project.extract(mp, "hermes", tmp_path / "out", tmp_path / "kept")
    assert files(tmp_path / "out") == [f"{taken}/mine.txt"]


@pytest.mark.parametrize("harness", ["pi", "hermes-mcp", "..", "codex/skills"])
def test_a_harness_the_build_does_not_have_is_refused_with_the_ones_it_has(tmp_path, mp, harness):
    with pytest.raises(ValueError, match="it has claude-code, codex, hermes$"):
        project.extract(mp, harness, tmp_path / "out", tmp_path / "kept")
    assert not (tmp_path / "out").exists()


def test_a_file_with_no_built_plugin_has_nothing_to_extract(tmp_path, upstream, cache):
    bare = project.pack(make_package(tmp_path / "pkg", *upstream), tmp_path / "bare.mp", sources_cache=cache)
    with pytest.raises(ValueError, match="no built plugin"):
        project.extract(bare, "codex", tmp_path / "out", tmp_path / "kept")


def test_a_plugin_that_was_not_built_from_the_project_is_refused(tmp_path, mp):
    manifest = json.dumps({"plugin": {"slug": SLUG, "version": "9.9.9"}, "sources": []}).encode("utf-8")
    strange = with_members(mp, tmp_path / "strange.mp", {f"release/{SLUG}/sources.json": manifest})
    with pytest.raises(ValueError, match=project.MISMATCH):
        project.extract(strange, "codex", tmp_path / "out", tmp_path / "kept")
    assert not (tmp_path / "out").exists()


def test_the_command_prints_what_it_wrote_and_says_why_it_refused(tmp_path, mp, capsys):
    args = ["project", "extract", str(mp), "--harness", "codex", "--out", str(tmp_path / "out"),
            "--cache", str(tmp_path / "kept")]
    assert main(args) == 0
    assert json.loads(capsys.readouterr().out) == {"harness": "codex", "folders": [str(tmp_path / "out" / "codex")]}
    assert main(args) == 1
    assert capsys.readouterr().err.startswith("Project extract failed: ")
