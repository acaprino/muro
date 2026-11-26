"""Writing a `.mp` project: a new project, a mechanical edit and the commit after an AI run (ADR-0032).

The AI's part (intake, harmonization) is a fixture here: these tests prove the mechanics of writing a file, never
the quality of what an AI writes.
"""
import json
import os
import shutil
import time

import pytest

from muro import project, project_work
from muro.cli import main
from muro.core import validate_plugin_identity
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


@pytest.mark.parametrize("slug", ["con", "prn", "aux", "nul", "com1", "com9", "lpt1", "lpt9"])
def test_a_plugin_id_windows_keeps_for_a_device_is_refused_before_any_run(tmp_path, slug):
    with pytest.raises(ValueError, match="a name Windows keeps for a device"):
        project_work.new_workspace(tmp_path / "new", name="X", slug=slug, author="me")
    assert not (tmp_path / "new").exists()
    errors = validate_plugin_identity({"slug": slug, "name": "X", "command": "x", "version": "1.0.0"})
    assert any("a name Windows keeps for a device" in error for error in errors), errors
    assert validate_plugin_identity({"slug": f"{slug}-kit", "name": "X", "command": "x", "version": "1.0.0"}) == []


# What the host AI writes of a new project: the package. The rest of the work folder is `new_workspace`'s.
AI_FILES = ("sources.json", "delivery.json", "ROUTER.md", "guide-examples.json", "capabilities", "prompts", "custom-instructions")
STARTED = {"slug": SLUG, "name": "Tester", "author": "me"}
AI_RECORD = {"id": "ai-1", "date": "2026-11-23", "subjects": ["x"], "text": "x is the one capability.", "author": "muro",
             "binding": False}
RECORD = {"id": "mine-1", "date": "2026-11-21", "subjects": ["x"], "text": "Keep x first.", "author": "you", "binding": True}


def started(tmp_path, upstream):
    """A new project's work folder once the host AI wrote its package (the fixture stands for that package)."""
    work = project_work.new_workspace(tmp_path / "work", name="Tester", slug=SLUG, author="me")
    pkg = make_package(tmp_path / "ai", *upstream)
    for name in AI_FILES:
        source = pkg / name
        (shutil.copytree if source.is_dir() else shutil.copy2)(source, work / name)
    return work


def test_commit_creates_a_new_project_from_what_the_ai_wrote(tmp_path, upstream):
    work = started(tmp_path, upstream)
    # what the AI could also have written, and is the desktop's: a new project starts with no run and no changelog
    (work / "history.json").write_text(json.dumps({"runs": [{"id": "forged"}]}), encoding="utf-8")
    (work / "CHANGELOG.md").write_text("# Forged by the AI\n", encoding="utf-8")
    (work / "records.json").write_text(json.dumps({"records": [AI_RECORD]}), encoding="utf-8")
    out = tmp_path / "files" / "tester.mp"
    done = project_work.commit(work, out, create=True, operation="New project", summary="The first Tester.",
                               engine="claude-code", budget_usd=2.0, **STARTED)
    assert done["version"] == "0.1.0" and done["digest"] == project.digest(out)
    info = project.info(out, tmp_path / "cache")
    assert [run["id"] for run in info["history"]] == ["tester-v0.1.0"]
    run = info["history"][-1]
    assert run["id"] == "tester-v0.1.0" and run["status"] == "completed" and run["operation"] == "New project"
    assert run["engine"] == "claude-code" and run["budget_usd"] == 2.0 and run["pins"] == {"demo": upstream[1]}
    assert info["changelog"] == "# Tester 0.1.0\n\nThe first Tester.\n\n- First version: 1 capability from 1 input.\n"
    assert info["records"] == [AI_RECORD]
    assert (info["project"]["name"], info["project"]["slug"], info["project"]["author"]) == ("Tester", SLUG, "me")
    assert (project.cached(out, tmp_path / "cache") / "release" / SLUG / "adapters" / "claude-code").is_dir()
    project.verify(out, tmp_path / "cache")
    with pytest.raises(ValueError, match="already exists"):
        project_work.commit(work, out, create=True, operation="Again", **STARTED)


def test_commit_refuses_a_work_folder_without_a_package(tmp_path):
    work = project_work.new_workspace(tmp_path / "work", name="X", slug="x", author="me")
    with pytest.raises(ValueError, match="sources.json"):
        project_work.commit(work, tmp_path / "x.mp", create=True, operation="New project", slug="x", name="X", author="me")
    assert not (tmp_path / "x.mp").exists()


@pytest.mark.parametrize("asked,message", [
    ({}, "names the plugin id, the name and the author"),
    ({"slug": SLUG, "name": "Tester"}, "names the plugin id, the name and the author"),
    ({**STARTED, "author": " "}, "names the plugin id, the name and the author"),
    ({**STARTED, "name": "Another"}, "no longer has the name the project was started with"),
    ({**STARTED, "author": "someone"}, "no longer has the author the project was started with"),
    ({**STARTED, "slug": "another"}, "no longer has the plugin id the project was started with"),
])
def test_a_new_project_is_held_to_what_it_was_started_as(tmp_path, upstream, asked, message):
    work = started(tmp_path, upstream)
    out = tmp_path / "files" / "tester.mp"
    with pytest.raises(ValueError, match=message):
        project_work.commit(work, out, create=True, operation="New project", **asked)
    assert not out.exists()


def test_a_new_project_whose_project_json_or_plugin_id_the_ai_changed_is_refused(tmp_path, upstream):
    work = started(tmp_path, upstream)
    meta = json.loads((work / "project.json").read_text(encoding="utf-8"))
    (work / "project.json").write_text(json.dumps({**meta, "name": "Renamed by the AI"}), encoding="utf-8")
    with pytest.raises(ValueError, match="no longer has the name"):
        project_work.commit(work, tmp_path / "t.mp", create=True, operation="New project", **STARTED)
    (work / "project.json").write_text(json.dumps(meta), encoding="utf-8")
    manifest = json.loads((work / "sources.json").read_text(encoding="utf-8"))
    manifest["plugin"]["slug"] = "another"
    (work / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="keeps its id"):
        project_work.commit(work, tmp_path / "t.mp", create=True, operation="New project", **STARTED)
    assert not (tmp_path / "t.mp").exists()


def test_what_a_new_project_was_started_as_is_not_given_to_a_change(tmp_path):
    with pytest.raises(ValueError, match="a change keeps the file's own"):
        project_work.commit(tmp_path, tmp_path / "x.mp", expect_digest="0" * 64, operation="Harmonize again", slug="x")


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


# The records of the fixture's file once its owner added theirs by hand: the AI's (r1), one the owner wrote, and one
# that binds every run.
AI_OWN = {"id": "r1", "date": "2026-11-11", "subjects": ["x"], "text": "A decision.", "author": "muro", "binding": False}
RULE = {"id": "rule-1", "date": "2026-11-20", "subjects": [], "text": "Never drop x.", "author": "muro", "binding": True}


def test_commit_takes_what_the_desktop_owns_from_the_file_not_from_the_work_folder(tmp_path, mp):
    project_work.edit(mp, expect_digest=project.digest(mp), records=[AI_OWN, RECORD])
    work, digest = checkout(mp, tmp_path)
    meta = json.loads((work / "project.json").read_text(encoding="utf-8"))
    # what the AI could write, and must not decide: the project's details, its history, its changelog
    (work / "project.json").write_text(json.dumps({**meta, "name": "Renamed by the AI", "author": "the AI",
                                                   "repository": None, "builtin": True}), encoding="utf-8")
    (work / "history.json").write_text(json.dumps({"runs": [{"id": "forged"}]}), encoding="utf-8")
    (work / "CHANGELOG.md").write_text("# Rewritten by the AI\n", encoding="utf-8")
    # what it may do with the records: revise its own and add one, leaving the owner's as they are
    revised, added = {**AI_OWN, "text": "A decision, revised."}, {**AI_RECORD, "id": "ai-2"}
    (work / "records.json").write_text(json.dumps({"records": [revised, RECORD, added]}), encoding="utf-8")
    done = project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again", summary="Same package.")
    info = project.info(mp, tmp_path / "cache")
    assert info["project"] == {**meta, "version": done["version"], "changed": info["project"]["changed"]}
    assert [run["id"] for run in info["history"]] == [f"{SLUG}-v0.1.1"]
    assert info["changelog"].startswith("# Tester 0.1.1\n\nSame package.\n\n")
    assert info["changelog"].rstrip().endswith("# Changelog") and "Rewritten by the AI" not in info["changelog"]
    assert info["records"] == [revised, RECORD, added]


def test_commit_compares_the_plugin_id_with_the_files_project_json(tmp_path, mp):
    work, digest = checkout(mp, tmp_path)
    meta = json.loads((work / "project.json").read_text(encoding="utf-8"))
    (work / "project.json").write_text(json.dumps({**meta, "slug": "other"}), encoding="utf-8")
    manifest = json.loads((work / "sources.json").read_text(encoding="utf-8"))
    manifest["plugin"]["slug"] = "other"
    (work / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    original = mp.read_bytes()
    with pytest.raises(ValueError, match="changed from tester to other: a project keeps its id"):
        project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again")
    assert mp.read_bytes() == original


@pytest.mark.parametrize("records,message", [
    ([AI_OWN, RULE], "removed or changed the record mine-1"),
    ([AI_OWN, {**RECORD, "text": "Keep y first."}, RULE], "removed or changed the record mine-1"),
    ([AI_OWN, {**RECORD, "binding": False}, RULE], "removed or changed the record mine-1"),
    ([AI_OWN, RECORD], "removed or changed the record rule-1"),
    ([AI_OWN, RECORD, {**RULE, "binding": False}], "removed or changed the record rule-1"),
    ([{**AI_OWN, "binding": True}, RECORD, RULE], "wrote the record r1 as the owner's or as binding"),
    ([{**AI_OWN, "author": "you"}, RECORD, RULE], "wrote the record r1 as the owner's or as binding"),
    ([AI_OWN, RECORD, RULE, {**AI_RECORD, "author": "you"}], "wrote the record ai-1 as the owner's or as binding"),
    ([AI_OWN, RECORD, RULE, {**AI_RECORD, "binding": True}], "wrote the record ai-1 as the owner's or as binding"),
    ([AI_OWN, RECORD, RULE, {"id": "ai-1", "text": "No date."}], "needs a date"),
    ([AI_OWN, RECORD, RULE, {**AI_RECORD, "id": "r1"}], "Two records have the id r1"),
])
def test_a_run_may_not_touch_the_owners_records_or_make_one_bind(tmp_path, mp, records, message):
    project_work.edit(mp, expect_digest=project.digest(mp), records=[AI_OWN, RECORD, RULE])
    work, digest = checkout(mp, tmp_path)
    (work / "records.json").write_text(json.dumps({"records": records}), encoding="utf-8")
    original = mp.read_bytes()
    with pytest.raises(ValueError, match=message):
        project_work.commit(work, mp, expect_digest=digest, operation="Harmonize again")
    assert mp.read_bytes() == original


def test_a_run_may_remove_a_record_of_its_own_that_does_not_bind():
    project_work.check_run_records([AI_OWN, RECORD], [RECORD])
    project_work.check_run_records([AI_OWN], [{**AI_OWN, "subjects": ["x", "y"]}])
    project_work.check_run_records([{"id": "old", "text": "a record of another shape"}], [{"id": "old", "text": "a record of another shape"}])


# --- what a killed commit or edit leaves beside the file --------------------------------------------------

def aged(path, seconds=3600):
    moment = time.time() - seconds
    os.utime(path, (moment, moment))
    return path


def test_a_commit_or_an_edit_removes_what_a_killed_one_left_beside_the_file(tmp_path, mp):
    folder = mp.parent
    left = []
    for name in (".muro-commit-abcd1234", ".muro-edit-efgh5678"):
        (folder / name / "release").mkdir(parents=True)
        (folder / name / "release" / "big.bin").write_bytes(b"0" * 1024)
        left.append(aged(folder / name))
    for name in (f".{mp.name}.0123abcd.tmp", f"..{mp.name}.0123abcd.tmp.89abcdef.tmp"):
        (folder / name).write_bytes(b"half a project file")
        left.append(aged(folder / name))
    # what is not this code's, or not this file's, stays however old
    kept = [folder / "notes.txt", folder / ".other.mp.0123abcd.tmp", folder / ".muro-unpack-1234"]
    kept[0].write_bytes(b"not ours")
    kept[1].write_bytes(b"another project's")
    kept[2].mkdir()
    for path in kept:
        aged(path)
    fresh = folder / ".muro-commit-fresh000"
    fresh.mkdir()
    # a scratch folder a live commit holds stays, however old: its build may run for an hour
    live = folder / ".muro-commit-live0000"
    live.mkdir()
    held = os.open(live / ".muro-held", os.O_RDWR | os.O_CREAT)
    assert project_work._try_lock(held)
    aged(live)
    try:
        project_work.edit(mp, expect_digest=project.digest(mp), name="Renamed")
    finally:
        project_work._unlock(held)
        os.close(held)
    for path in left:
        assert not path.exists(), path.name
    for path in [*kept, fresh, live]:
        assert path.exists(), path.name
    assert project.info(mp, tmp_path / "cache")["project"]["name"] == "Renamed"
    assert not [path.name for path in folder.iterdir() if path.name.startswith(".muro-edit-")], "the edit's own is gone"


def test_replacing_a_file_is_tried_again_while_another_program_holds_it(tmp_path, monkeypatch):
    source, target = tmp_path / "new", tmp_path / "old"
    source.write_text("new", encoding="utf-8")
    target.write_text("old", encoding="utf-8")
    real, refused = os.replace, []

    def held(old, new):
        if len(refused) < 2:
            refused.append(old)
            raise PermissionError(13, "The process cannot access the file")
        real(old, new)
    monkeypatch.setattr(project, "_REPLACE_DELAYS", (0, 0, 0))
    monkeypatch.setattr(project.os, "replace", held)
    project.replace_file(source, target)
    assert target.read_text(encoding="utf-8") == "new" and len(refused) == 2
    # past its tries the error is the error
    refused.clear()
    monkeypatch.setattr(project, "_REPLACE_DELAYS", ())
    (tmp_path / "again").write_text("again", encoding="utf-8")
    with pytest.raises(PermissionError):
        project.replace_file(tmp_path / "again", target)
    assert target.read_text(encoding="utf-8") == "new"


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


def test_an_edit_and_a_commit_keep_the_executable_files_on_a_disk_that_has_no_such_bit(tmp_path, monkeypatch):
    """Windows: the unpacked folder cannot say which files were executable. The inputs keep what the file they came
    from says, and the helpers of the build are marked by the build's own rule."""
    from muro.release import build_release
    from test_project_file import make_scripts_upstream, scripts_package
    pkg = scripts_package(tmp_path / "pkg", *make_scripts_upstream(tmp_path / "upstream"))
    build_release(pkg / "sources.json", pkg, tmp_path / "stage")
    mp = project.pack(pkg, tmp_path / "files" / "tester.mp", release_dir=tmp_path / "stage")
    marked = project.executable_members(mp)
    assert "inputs/demo/bin/run" in marked and "inputs/demo/bin/plain.sh" not in marked              # Git's mode
    assert {f"release/{SLUG}/scripts/demo/bin/{name}" for name in ("run", "plain.sh")} <= marked      # the build's rule
    monkeypatch.setattr(project, "_executable", lambda path: False)
    project_work.edit(mp, expect_digest=project.digest(mp), author="someone else")
    assert project.executable_members(mp) == marked
    work, digest = checkout(mp, tmp_path)
    project_work.commit(work, mp, expect_digest=digest, step="none", operation="Again")
    assert project.executable_members(mp) == marked


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


def test_cli_commit_of_a_new_project_names_what_it_was_started_as(tmp_path, capsys):
    work = project_work.new_workspace(tmp_path / "w", name="-Draft", slug="d", author="me")
    out = tmp_path / "d.mp"
    assert main(["project", "commit", str(work), "--out", str(out), "--create", "--operation=New project"]) == 1
    assert "names the plugin id, the name and the author" in capsys.readouterr().err
    # `--name=-Draft`: a value that begins with a dash is still the value; what is missing then is the package
    assert main(["project", "commit", str(work), "--out", str(out), "--create", "--operation=New project -Draft",
                 "--slug=d", "--name=-Draft", "--author=me"]) == 1
    assert "The AI did not write sources.json" in capsys.readouterr().err
    assert not out.exists()
