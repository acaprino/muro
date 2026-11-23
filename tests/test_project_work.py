"""Writing a `.mp` project: a new project, a mechanical edit and the commit after an AI run (ADR-0032).

The AI's part (intake, harmonization) is a fixture here: these tests prove the mechanics of writing a file, never
the quality of what an AI writes.
"""
import json
import shutil

import pytest

from muro import project, project_work
from muro.cli import main
from test_project_file import PROJECT_JSON, SLUG, make_package, upstream  # noqa: F401  (the fixture)


def packed(tmp_path, upstream):
    """A project file of the fixture package, with a release built by the real factory."""
    from muro.release import build_release
    pkg = make_package(tmp_path / "pkg", *upstream)
    build_release(pkg / "sources.json", pkg, tmp_path / "stage")
    out = tmp_path / "files" / "tester.mp"
    project.pack(pkg, out, release_dir=tmp_path / "stage")
    return pkg, out


@pytest.fixture
def mp(tmp_path, upstream):
    return packed(tmp_path, upstream)[1]


def read(mp, tmp_path, name):
    folder = project.cached(mp, tmp_path / "cache")
    path = folder / name
    return json.loads(path.read_text(encoding="utf-8")) if name.endswith(".json") else path.read_text(encoding="utf-8")


# --- the version and the fields a person types --------------------------------------------------------

@pytest.mark.parametrize("step,expected", [("patch", "1.2.4"), ("minor", "1.3.0"), ("major", "2.0.0"), ("none", "1.2.3")])
def test_bump_moves_the_version_by_its_step(step, expected):
    assert project_work.bump("1.2.3", step) == expected


@pytest.mark.parametrize("version,step", [("1.2", "patch"), ("01.2.3", "patch"), ("1.2.3", "huge")])
def test_bump_refuses_what_is_not_a_version_or_a_step(version, step):
    with pytest.raises(ValueError):
        project_work.bump(version, step)


def test_repository_needs_an_https_address():
    assert project_work.repository("https://github.com/o/r", "", "r-v") == {
        "url": "https://github.com/o/r", "branch": "main", "tag_prefix": "r-v"}
    for bad in ("http://github.com/o/r", "git@github.com:o/r", "https://a b", ""):
        with pytest.raises(ValueError):
            project_work.repository(bad, "main", "")


# --- a new project ------------------------------------------------------------------------------------

def test_new_workspace_writes_the_project_and_empty_records_history_and_changelog(tmp_path):
    folder = project_work.new_workspace(tmp_path / "new", name="My Plugin", slug="my-plugin", author="me",
                                        repo={"url": "https://example.invalid/r", "branch": "main", "tag_prefix": "v"})
    meta = json.loads((folder / "project.json").read_text(encoding="utf-8"))
    assert meta["slug"] == "my-plugin" and meta["version"] == "0.1.0" and meta["builtin"] is False
    assert meta["created"] == meta["changed"] and meta["created"].endswith("Z")
    assert project._project_json_errors(meta, "my-plugin") is None
    assert json.loads((folder / "records.json").read_text()) == {"records": []}
    assert json.loads((folder / "history.json").read_text()) == {"runs": []}
    assert (folder / "CHANGELOG.md").read_text() == ""
    assert not (folder / "sources.json").exists()          # the package is the host AI's to write


@pytest.mark.parametrize("slug", ["My Plugin", "a_b", "-x", ""])
def test_new_workspace_refuses_a_slug_that_is_not_kebab_case(tmp_path, slug):
    with pytest.raises(ValueError, match="kebab-case"):
        project_work.new_workspace(tmp_path / "new", name="X", slug=slug, author="me")


def test_new_workspace_refuses_a_folder_that_holds_anything(tmp_path):
    (tmp_path / "busy").mkdir()
    (tmp_path / "busy" / "file").write_text("x")
    with pytest.raises(ValueError, match="new folder"):
        project_work.new_workspace(tmp_path / "busy", name="X", slug="x", author="me")


def test_commit_creates_a_new_project_from_what_the_ai_wrote(tmp_path, upstream):
    work = project_work.new_workspace(tmp_path / "work", name="Tester", slug=SLUG, author="me")
    pkg = make_package(tmp_path / "ai", *upstream)       # stands for the package the host AI wrote
    for name in ("sources.json", "delivery.json", "ROUTER.md", "guide-examples.json", "capabilities", "prompts",
                 "custom-instructions"):
        source = pkg / name
        (shutil.copytree if source.is_dir() else shutil.copy2)(source, work / name)
    out = tmp_path / "files" / "tester.mp"
    done = project_work.commit(work, out, create=True, operation="New project", summary="The first Tester.",
                               engine="claude-code", budget_usd=2.0)
    assert done["version"] == "0.1.0" and done["digest"] == project.digest(out)
    info = project.info(out, tmp_path / "cache")
    run = info["history"][-1]
    assert run["id"] == "tester-v0.1.0" and run["status"] == "completed" and run["operation"] == "New project"
    assert run["engine"] == "claude-code" and run["budget_usd"] == 2.0 and run["pins"] == {"demo": upstream[1]}
    assert info["changelog"].startswith("# Tester 0.1.0\n\nThe first Tester.\n\n- First version: 1 capability from 1 input.")
    assert (project.cached(out, tmp_path / "cache") / "release" / SLUG / "adapters" / "claude-code").is_dir()
    project.verify(out, tmp_path / "cache")
    with pytest.raises(ValueError, match="already exists"):
        project_work.commit(work, out, create=True, operation="Again")


def test_commit_refuses_a_work_folder_without_a_package(tmp_path):
    work = project_work.new_workspace(tmp_path / "work", name="X", slug="x", author="me")
    with pytest.raises(ValueError, match="sources.json"):
        project_work.commit(work, tmp_path / "x.mp", create=True, operation="New project")
    assert not (tmp_path / "x.mp").exists()


# --- the commit after a change --------------------------------------------------------------------------

def checkout(mp, tmp_path):
    return project.unpack(mp, tmp_path / "work"), project.digest(mp)


def test_commit_after_a_change_moves_the_version_records_the_run_and_lists_what_changed(tmp_path, mp):
    work, digest = checkout(mp, tmp_path)
    capability = (work / "capabilities" / "x.md").read_text(encoding="utf-8")
    (work / "capabilities" / "y.md").write_text(capability.replace("id: x", "id: y").replace('["x"]', '["y"]'), encoding="utf-8")
    with open(work / "ROUTER.md", "a", encoding="utf-8") as router:
        router.write("| y | testing | — | — | y | testing.verify |\n")
    (work / "custom-instructions" / "rules.md").write_bytes(b"Changed rules\n")
    from test_custom_instructions import deliver
    deliver(work)                                         # the AI re-records the instruction's delivery
    done = project_work.commit(work, mp, expect_digest=digest, step="minor", operation="Harmonize again",
                               summary="Tester gains y.")
    assert done["version"] == "0.2.0"
    info = project.info(mp, tmp_path / "cache")
    assert info["plugin"]["version"] == "0.2.0" and info["project"]["version"] == "0.2.0"
    assert [run["version"] for run in info["history"]] == ["0.2.0"]
    entry = info["changelog"].split("\n\n# ")[0]
    assert entry.startswith("# Tester 0.2.0\n\nTester gains y.\n\n")
    assert "- New capabilities: y." in entry and "- Changes the instructions file rules.md." in entry
    assert info["changelog"].rstrip().endswith("# Changelog")      # the old text stays below the new entry
    project.verify(mp, tmp_path / "cache")


def test_commit_refuses_a_file_that_changed_since_the_checkout(tmp_path, mp):
    work, digest = checkout(mp, tmp_path)
    before = mp.read_bytes()
    with open(mp, "ab") as handle:                        # someone else wrote the file meanwhile
        handle.write(b"\0")
    changed = mp.read_bytes()
    with pytest.raises(ValueError, match="changed since it was opened"):
        project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again")
    assert mp.read_bytes() == changed != before


def test_commit_refuses_a_package_that_changed_its_plugin_id(tmp_path, mp):
    work, digest = checkout(mp, tmp_path)
    manifest = json.loads((work / "sources.json").read_text(encoding="utf-8"))
    manifest["plugin"]["slug"] = "other"
    (work / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    original = mp.read_bytes()
    with pytest.raises(ValueError, match="keeps its id"):
        project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again")
    assert mp.read_bytes() == original


def test_commit_leaves_the_file_as_it_was_when_the_build_fails(tmp_path, mp):
    work, digest = checkout(mp, tmp_path)
    (work / "ROUTER.md").write_text("not a router\n", encoding="utf-8")
    original = mp.read_bytes()
    with pytest.raises(ValueError):
        project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again")
    assert mp.read_bytes() == original


def test_changes_lists_inputs_added_removed_and_moved(tmp_path):
    before, after = tmp_path / "before", tmp_path / "after"
    for folder, sources in ((before, [{"id": "a", "commit": "1" * 40, "release": "v1"}, {"id": "b", "commit": "2" * 40}]),
                            (after, [{"id": "a", "commit": "3" * 40, "release": "v2"}, {"id": "c", "commit": "4" * 40}])):
        folder.mkdir()
        (folder / "sources.json").write_text(json.dumps({"sources": sources}), encoding="utf-8")
    lines = project_work.changes(before, after)
    assert "Adds the input c (commit 4444444)." in lines
    assert "Removes the input b." in lines
    assert "Moves a from v1 to v2." in lines
    assert lines[-1] == "The catalog is 0 capabilities from 2 inputs."


# --- what a person edits by hand ----------------------------------------------------------------------

RECORD = {"id": "mine-1", "date": "2026-11-21", "subjects": ["x"], "text": "Keep x first.", "author": "you", "binding": True}


def test_edit_changes_the_details_records_and_changelog_offline_and_keeps_the_release(tmp_path, mp, monkeypatch):
    digest = project.digest(mp)
    fetched = []
    monkeypatch.setattr(project, "inspect_source", lambda *a, **k: fetched.append(a) or (_ for _ in ()).throw(AssertionError))
    done = project_work.edit(mp, expect_digest=digest, name="Renamed", author="someone else",
                             repo={"url": "https://example.invalid/new", "branch": "dev", "tag_prefix": "t-"},
                             records=[RECORD], changelog="# Tester 0.1.0\n\nEdited by hand.")
    assert not fetched                                   # the inputs came from the file's own copies
    assert done["digest"] == project.digest(mp) != digest
    info = project.info(mp, tmp_path / "cache")
    assert info["project"]["name"] == "Renamed" and info["project"]["author"] == "someone else"
    assert info["project"]["repository"] == {"url": "https://example.invalid/new", "branch": "dev", "tag_prefix": "t-"}
    assert info["records"] == [RECORD]
    assert info["changelog"] == "# Tester 0.1.0\n\nEdited by hand.\n"
    assert info["plugin"]["version"] == "0.1.0"
    folder = project.cached(mp, tmp_path / "cache")
    assert (folder / "release" / SLUG / "adapters" / "claude-code").is_dir()
    assert (folder / "inputs" / "demo" / "SKILL.md").is_file()
    project.verify(mp, tmp_path / "cache")


def test_edit_can_take_the_repository_away(tmp_path, mp):
    project_work.edit(mp, expect_digest=project.digest(mp), repo=None)
    assert project.info(mp, tmp_path / "cache")["project"]["repository"] is None


def test_edit_refuses_a_file_that_changed_and_writes_nothing(tmp_path, mp):
    original = mp.read_bytes()
    with pytest.raises(ValueError, match="changed since it was opened"):
        project_work.edit(mp, expect_digest="0" * 64, name="Renamed")
    assert mp.read_bytes() == original


@pytest.mark.parametrize("records,message", [
    ({"id": "a"}, "a list"),
    ([{**RECORD, "id": "bad id"}], "an id"),
    ([RECORD, RECORD], "Two records"),
    ([{**RECORD, "date": "2026-13-40"}], "real date"),
    ([{**RECORD, "text": "  "}], "needs a text"),
    ([{**RECORD, "author": "someone"}], "author"),
    ([{**RECORD, "binding": "yes"}], "binding"),
    ([{**RECORD, "subjects": "x"}], "subjects"),
])
def test_edit_refuses_records_that_are_not_records(tmp_path, mp, records, message):
    original = mp.read_bytes()
    with pytest.raises(ValueError, match=message):
        project_work.edit(mp, expect_digest=project.digest(mp), records=records)
    assert mp.read_bytes() == original


# --- the command line ---------------------------------------------------------------------------------

def test_cli_new_edit_and_their_errors(tmp_path, mp, capsys):
    assert main(["project", "new", str(tmp_path / "n"), "--name", "N", "--slug", "n", "--author", "me",
                 "--repository", "https://example.invalid/n", "--tag-prefix", "n-v"]) == 0
    meta = json.loads((tmp_path / "n" / "project.json").read_text(encoding="utf-8"))
    assert meta["repository"] == {"url": "https://example.invalid/n", "branch": "main", "tag_prefix": "n-v"}
    (tmp_path / "records.json").write_text(json.dumps({"records": [RECORD]}), encoding="utf-8")
    capsys.readouterr()
    assert main(["project", "edit", str(mp), "--expect-digest", project.digest(mp), "--name", "Via CLI",
                 "--records", str(tmp_path / "records.json")]) == 0
    assert json.loads(capsys.readouterr().out)["digest"] == project.digest(mp)
    assert main(["project", "edit", str(mp), "--expect-digest", "0" * 64, "--name", "x"]) == 1
    assert "changed since it was opened" in capsys.readouterr().err
    assert main(["project", "edit", str(mp), "--expect-digest", project.digest(mp), "--branch", "x"]) == 1
    assert "--branch and --tag-prefix need --repository" in capsys.readouterr().err
