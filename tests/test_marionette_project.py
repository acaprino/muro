"""Marionette ships with every Muro as the default project (ADR-0028, decision 5).

`examples/marionette/` carries the project's own files beside the package: `project.json`, `records.json`,
`history.json` and `CHANGELOG.md`. What they contain is checked for consistency (a run has its release note, a
changelog entry a title and a text, a record's date is its own text's); never for completeness and never for
equality with what the package or a note says now, so a release made by someone else, a note without a run, an
edited note or router bullet, a removed source or capability fails nothing here: they are history.
The version lives once, in `sources.json`: `muro project pack` writes it into the packed `project.json`.
The subjects of a record are an AI judgment and may name what the package no longer has.
The staging step in `scripts/desktop_resources.py` packs the project with the sources it can fetch; its tests run
the step with a recording stand-in for the two commands, because a real run needs the network and a build.
"""
import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from muro import project
from muro.cli import main
from muro.core import parse_router
from muro.sources import license_files, notice_paths
from routing_helpers import ROOT

PACKAGE = ROOT / "examples" / "marionette"
RELEASES = ROOT / "docs" / "releases"
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
UTC_TIME = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")
COMMIT = re.compile(r"[0-9a-f]{40}")

spec = importlib.util.spec_from_file_location("desktop_resources", ROOT / "scripts" / "desktop_resources.py")
resources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)


def load(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def manifest():
    return load("sources.json")


def version_key(version):
    return tuple(int(part) for part in version.split("."))


def release_notes():
    """(version, title, first paragraph) of each published note: the first block of lines after the title."""
    notes = []
    for path in sorted(RELEASES.glob("marionette-v*.md")):
        lines = path.read_text(encoding="utf-8").splitlines()
        assert lines[0].startswith("# "), path
        rest = [line.rstrip() for line in lines[1:]]
        while rest and not rest[0]:
            rest.pop(0)
        block = []
        for line in rest:
            if not line:
                break
            block.append(line)
        notes.append((path.stem.removeprefix("marionette-v"), lines[0][2:].strip(), "\n".join(block)))
    return sorted(notes, key=lambda note: version_key(note[0]), reverse=True)


# --- project.json -----------------------------------------------------------------------------------

def test_project_json_describes_marionette_as_the_default_project():
    meta = load("project.json")
    plugin = manifest()["plugin"]
    assert project._project_json_errors(meta, plugin["slug"]) is None      # what `pack` enforces
    assert meta["name"] == "Marionette" == plugin["name"]                  # its version is not compared: see pack
    assert meta["slug"] == plugin["slug"]
    assert meta["author"] == "acaprino"
    assert meta["builtin"] is True
    assert meta["repository"] == {"url": "https://github.com/acaprino/marionette", "branch": "main",
                                  "tag_prefix": "marionette-v"}
    assert set(meta) == {"schema", "name", "slug", "version", "author", "created", "changed", "repository", "builtin"}


def test_project_times_are_utc_and_created_comes_first():
    meta, runs = load("project.json"), load("history.json")["runs"]
    assert UTC_TIME.fullmatch(meta["created"]) and UTC_TIME.fullmatch(meta["changed"])
    assert meta["created"] <= meta["changed"]
    assert meta["created"] <= min(run["time"] for run in runs)      # the first release commit comes before any note


# --- records.json -----------------------------------------------------------------------------------

def test_records_have_the_project_schema():
    records = load("records.json")["records"]
    assert records and set(load("records.json")) == {"records"}
    assert len({record["id"] for record in records}) == len(records)
    for record in records:
        assert set(record) == {"id", "date", "subjects", "text", "author", "binding"}, record["id"]
        assert isinstance(record["id"], str) and record["id"]
        assert DAY.fullmatch(record["date"]), record["id"]
        assert isinstance(record["subjects"], list) and all(isinstance(s, str) for s in record["subjects"])
        assert len(set(record["subjects"])) == len(record["subjects"]), record["id"]
        assert record["author"] == "muro" and record["binding"] is False
        assert record["text"].strip() == record["text"] and record["text"], record["id"]


def test_a_record_that_states_a_date_has_that_date():
    """The rule for a record's date: the first date its text states. The router is not read: a bullet edited
    there later is a decision of its own, and a text without a date takes the section's date, which a new
    harmonization moves."""
    for record in load("records.json")["records"]:
        stated = DAY.search(record["text"])
        if stated:
            assert record["date"] == stated.group(), record["id"]


def record_errors(record):
    """What makes a record not a record: its shape. What its subjects name is not part of it."""
    errors = []
    if set(record) != {"id", "date", "subjects", "text", "author", "binding"}:
        errors.append("fields")
    elif not (isinstance(record["subjects"], list) and all(isinstance(s, str) and s for s in record["subjects"])
              and len(set(record["subjects"])) == len(record["subjects"])):
        errors.append("subjects must be distinct names")
    return errors


def test_a_record_may_name_a_capability_or_a_source_the_package_no_longer_has():
    """A record is history: the package moves on (a source is removed, a capability is replaced) and what
    it decided then stays true of that time. Nothing here compares its subjects with the package."""
    for record in load("records.json")["records"]:
        assert record_errors(record) == [], record["id"]
    historic = {**load("records.json")["records"][0], "subjects": ["a-capability-removed-since", "a-source-removed-since"]}
    assert record_errors(historic) == []
    known = {row.id for row in parse_router(PACKAGE / "ROUTER.md")} | {source["id"] for source in manifest()["sources"]}
    assert not set(historic["subjects"]) & known          # they are no ids of the package, and that is accepted
    assert record_errors({**historic, "subjects": ["x", "x"]}) == ["subjects must be distinct names"]
    assert record_errors({**historic, "subjects": [""]}) == ["subjects must be distinct names"]


# --- history.json and CHANGELOG.md -------------------------------------------------------------------

def test_each_history_run_matches_its_release_note_and_runs_are_newest_first():
    """A run needs its note; a note needs no run (a release made later has none until its history is written)."""
    runs = load("history.json")["runs"]
    paragraphs = {version: paragraph for version, _title, paragraph in release_notes()}
    assert runs and set(load("history.json")) == {"runs"}
    versions = [version_key(run["version"]) for run in runs]
    assert versions == sorted(set(versions), reverse=True)              # newest first, none twice
    assert [run["time"] for run in runs] == sorted((run["time"] for run in runs), reverse=True)
    assert len({run["id"] for run in runs}) == len(runs)
    for run in runs:
        assert set(run) == {"id", "time", "version", "status", "budget_usd", "engine", "pins", "changelog"}
        assert run["id"] == f"marionette-v{run['version']}"
        assert run["version"] in paragraphs, f"{run['id']} has no docs/releases note"
        # the text is the note's as it was when the run was written: present, not equal to the note as it reads now
        assert isinstance(run["changelog"], str) and run["changelog"].strip(), run["id"]
        assert UTC_TIME.fullmatch(run["time"]), run["id"]
        assert (run["status"], run["budget_usd"], run["engine"]) == ("completed", None, None), run["id"]
        assert run["pins"] and all(COMMIT.fullmatch(commit) for commit in run["pins"].values()), run["id"]
        assert all(isinstance(source_id, str) and source_id for source_id in run["pins"]), run["id"]


def test_the_changelog_is_a_list_of_titled_entries_newest_first():
    """Entries are history, written from a note when the version was released: each has a title and a text, and
    those that still match a note's title come newest first. A note edited later is that note's own matter."""
    notes = {title: version for version, title, _paragraph in release_notes()}
    text = (PACKAGE / "CHANGELOG.md").read_text(encoding="utf-8")
    entries = re.split(r"(?m)^# ", text)
    assert entries[0] == "" and len(entries) > 1, "CHANGELOG.md is a list of '# <note title>' entries"
    seen, titles = [], []
    for entry in entries[1:]:
        title, _, rest = entry.partition("\n\n")
        assert title.strip() and rest.strip(), f"{title!r} has no text"
        titles.append(title)
        if title in notes:
            seen.append(version_key(notes[title]))
    assert len(set(titles)) == len(titles), "an entry twice"
    assert seen == sorted(set(seen), reverse=True)                      # newest first, none twice
    assert seen, "at least one entry is a published note's"


# --- the package as a project ------------------------------------------------------------------------

def test_the_package_still_validates_with_the_project_files(capsys):
    assert main(["validate", "--manifest", str(PACKAGE / "sources.json")]) == 0
    assert "OK" in capsys.readouterr().out


def fake_sources_cache(root):
    """A sources cache with what a cache hit needs of each real pin: its license and its declared notice files."""
    for src in manifest()["sources"]:
        snapshot = root / src["id"] / src["commit"]
        for relative in [license_files(src)[0], *notice_paths(src)]:
            target = snapshot / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f"{src['id']}: stand-in for a pinned file\n", encoding="utf-8")
        project._seal(root, src)          # an entry nobody sealed is fetched again: this one stands in for a fetch
    return root


def test_muro_project_pack_of_marionette_carries_the_four_files_and_reads_back_as_a_project(tmp_path, capsys):
    mp = tmp_path / "marionette.mp"
    cache = fake_sources_cache(tmp_path / "sources")
    code = main(["project", "pack", "--manifest", str(PACKAGE / "sources.json"), "--out", str(mp),
                 "--sources-cache", str(cache)])
    assert code == 0, capsys.readouterr().err
    folder = project.unpack(mp, tmp_path / "unpacked")
    for name in ("records.json", "history.json", "CHANGELOG.md", "sources.json", "ROUTER.md"):
        assert (folder / name).read_bytes() == (PACKAGE / name).read_bytes(), name
    packed = {**load("project.json"), "version": manifest()["plugin"]["version"]}   # the version is sources.json's
    assert json.loads((folder / "project.json").read_text(encoding="utf-8")) == packed
    sources = manifest()["sources"]
    for src in sources:
        assert (folder / "inputs" / src["id"] / license_files(src)[0]).is_file(), src["id"]

    shown = project.info(mp, tmp_path / "cache")
    assert shown["project"] == packed
    assert shown["records"] == load("records.json")["records"]
    assert shown["history"] == load("history.json")["runs"]
    assert shown["changelog"] == (PACKAGE / "CHANGELOG.md").read_text(encoding="utf-8")
    assert [item["id"] for item in shown["inputs"]] == [src["id"] for src in sources]
    rows = {row["part"]: row["detail"] for row in shown["files"]}
    assert rows["Decision records"].startswith(f"{len(shown['records'])} records")
    assert rows["History"].startswith(f"{len(shown['history'])} runs")


def test_pack_writes_the_version_of_sources_json_into_the_packed_project_json(tmp_path, capsys):
    """The version lives once, in sources.json: a release bumps it there and nowhere else."""
    copy = tmp_path / "marionette"
    shutil.copytree(PACKAGE, copy)
    stale = json.loads((copy / "project.json").read_text(encoding="utf-8"))
    stale["version"] = "0.0.1"
    (copy / "project.json").write_text(json.dumps(stale, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    cache = fake_sources_cache(tmp_path / "sources")
    code = main(["project", "pack", "--manifest", str(copy / "sources.json"), "--out", str(tmp_path / "m.mp"),
                 "--sources-cache", str(cache)])
    assert code == 0, capsys.readouterr().err
    packed = json.loads((project.unpack(tmp_path / "m.mp", tmp_path / "unpacked") / "project.json").read_text(encoding="utf-8"))
    assert packed == {**stale, "version": manifest()["plugin"]["version"]}
    assert list(packed) == list(stale)                                   # same fields, same order: only the version moved
    assert json.loads((copy / "project.json").read_text(encoding="utf-8"))["version"] == "0.0.1"   # the source is not touched


# --- the staging step ---------------------------------------------------------------------------------

class Recorder:
    """Stands in for `subprocess.run`: records each command and does what the real one writes."""

    def __init__(self, fail_on=None):
        self.calls = []
        self.fail_on = fail_on

    def __call__(self, argv, **options):
        self.calls.append((list(argv), options))
        command = "pack" if "pack" in argv else "build"
        if command == self.fail_on:
            raise subprocess.CalledProcessError(1, argv)
        value = lambda flag: Path(argv[argv.index(flag) + 1])
        if command == "build":
            (value("--out") / "marionette").mkdir(parents=True)
        else:
            assert (value("--release") / "marionette").is_dir(), "the release is built before it is packed"
            value("--out").write_bytes(b"a project file")
        return subprocess.CompletedProcess(argv, 0)


def test_staging_builds_a_fresh_release_and_packs_the_default_project_into_the_resources(tmp_path):
    out = tmp_path / "staging" / "resources"
    out.mkdir(parents=True)
    run, cache = Recorder(), tmp_path / "sources-cache"
    target = resources.pack_default_project(out, ROOT, cache, run)
    assert target == out / "projects" / "marionette.mp" and target.read_bytes() == b"a project file"

    (build, build_options), (pack, pack_options) = run.calls
    manifest_path = str(ROOT / "examples" / "marionette" / "sources.json")
    release = Path(build[build.index("--out") + 1])
    assert build[build.index("-m"):] == ["-m", "muro", "build", "--manifest", manifest_path, "--out", str(release)]
    assert pack[pack.index("-m"):] == ["-m", "muro", "project", "pack", "--manifest", manifest_path,
                                      "--out", str(target), "--sources-cache", str(cache), "--release", str(release)]
    assert build_options["cwd"] == pack_options["cwd"] == ROOT      # the checkout's own `muro` package
    assert build_options["check"] is pack_options["check"] is True
    assert out not in release.parents and release.parent == out.parent   # the shipped folder never holds the build
    assert not release.exists()                                          # and the build is gone once packed


def test_staging_stops_and_removes_the_release_when_a_command_fails(tmp_path):
    out = tmp_path / "staging" / "resources"
    out.mkdir(parents=True)
    for fail_on in ("build", "pack"):
        with pytest.raises(subprocess.CalledProcessError):
            resources.pack_default_project(out, ROOT, tmp_path / "cache", Recorder(fail_on=fail_on))
        assert not (out / "projects" / "marionette.mp").exists()
        assert [path.name for path in out.parent.iterdir()] == ["resources"]    # no build left beside it


def test_a_failed_project_step_leaves_no_half_staged_folder_and_never_removes_an_existing_one(tmp_path, monkeypatch):
    def staged(out, archive, root):
        out.mkdir(parents=True)
        (out / "factory").mkdir()

    monkeypatch.setattr(resources, "stage", staged)
    out = tmp_path / "resources"
    with pytest.raises(subprocess.CalledProcessError):
        resources.stage_resources(out, b"archive", ROOT, tmp_path / "cache", Recorder(fail_on="pack"))
    assert not out.exists()

    assert resources.stage_resources(out, b"archive", ROOT, tmp_path / "cache", Recorder()) == out / "projects" / "marionette.mp"
    monkeypatch.undo()
    monkeypatch.setattr(resources, "PYTHON_SHA256", resources.hashlib.sha256(b"archive").hexdigest())
    with pytest.raises(FileExistsError):                  # a folder that was there before is never touched
        resources.stage_resources(out, b"archive", ROOT, tmp_path / "cache", Recorder())
    assert (out / "factory").is_dir() and (out / "projects" / "marionette.mp").is_file()


def test_the_help_says_the_default_project_needs_the_network():
    text = " ".join(resources.__doc__.split())
    assert "default project" in text and "network" in text
