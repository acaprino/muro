"""Marionette ships with every Muro as the default project (ADR-0028, decision 5).

`examples/marionette/` carries the project's own files beside the package: `project.json`, `records.json`,
`history.json` and `CHANGELOG.md`. Their content comes from files that already exist (the router's
harmonization record, `docs/releases/marionette-v*.md`, `sources.json`), so these tests compare each file with
its source; the subjects of a record are an AI judgment, which is only checked to name things the package has.
The staging step in `scripts/desktop_resources.py` packs them with the sources it can fetch; its tests run the
step with a recording stand-in for the two commands, because a real run needs the network and a build.
"""
import importlib.util
import json
import re
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


def harmonization_record():
    """The section's date and its bullets, each as Markdown reads an item: its lines joined by one space."""
    lines = (PACKAGE / "ROUTER.md").read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("## Harmonization record"))
    section_date = DAY.search(lines[start]).group()
    bullets = []
    for line in lines[start + 1:]:
        if line.startswith("<!--") or line.startswith("## "):
            break
        if line.startswith("- "):
            bullets.append(line[2:].strip())
        elif line.startswith("  ") and bullets:
            bullets[-1] += " " + line.strip()
    return section_date, bullets


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
    return sorted(notes, key=lambda note: tuple(int(part) for part in note[0].split(".")), reverse=True)


# --- project.json -----------------------------------------------------------------------------------

def test_project_json_describes_marionette_as_the_default_project():
    meta = load("project.json")
    plugin = manifest()["plugin"]
    assert project._project_json_errors(meta, plugin["slug"]) is None      # what `pack` enforces
    assert meta["name"] == "Marionette" == plugin["name"]
    assert meta["slug"] == plugin["slug"]
    assert meta["version"] == plugin["version"]
    assert meta["author"] == "acaprino"
    assert meta["builtin"] is True
    assert meta["repository"] == {"url": "https://github.com/acaprino/marionette", "branch": "main",
                                  "tag_prefix": "marionette-v"}
    assert set(meta) == {"schema", "name", "slug", "version", "author", "created", "changed", "repository", "builtin"}


def test_project_times_are_utc_created_first_and_changed_with_the_last_run():
    meta, runs = load("project.json"), load("history.json")["runs"]
    assert UTC_TIME.fullmatch(meta["created"]) and UTC_TIME.fullmatch(meta["changed"])
    assert meta["created"] <= runs[-1]["time"]              # the first release commit comes before the first note
    assert meta["changed"] == runs[0]["time"]               # the project last changed with its newest run


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


def test_every_record_is_a_bullet_of_the_harmonization_record_with_its_date():
    section_date, bullets = harmonization_record()
    records = load("records.json")["records"]
    texts = [record["text"] for record in records]
    assert len(set(texts)) == len(texts)
    for record in records:
        assert record["text"] in bullets, f"{record['id']} is not a bullet of ROUTER.md, word for word"
        stated = DAY.search(record["text"])
        assert record["date"] == (stated.group() if stated else section_date), record["id"]
    assert texts == [bullet for bullet in bullets if bullet in texts], "records keep the router's order"


def test_every_record_subject_is_a_capability_or_a_source_of_the_package():
    known = {row.id for row in parse_router(PACKAGE / "ROUTER.md")} | {source["id"] for source in manifest()["sources"]}
    assert len(known) > 40
    for record in load("records.json")["records"]:
        assert set(record["subjects"]) <= known, (record["id"], sorted(set(record["subjects"]) - known))


# --- history.json and CHANGELOG.md -------------------------------------------------------------------

def test_history_has_one_completed_run_per_release_note_newest_first():
    runs = load("history.json")["runs"]
    notes = release_notes()
    assert [run["version"] for run in runs] == [note[0] for note in notes]
    assert len({run["id"] for run in runs}) == len(runs)
    assert [run["time"] for run in runs] == sorted((run["time"] for run in runs), reverse=True)
    for run, (version, _title, paragraph) in zip(runs, notes):
        assert set(run) == {"id", "time", "version", "status", "budget_usd", "engine", "pins", "changelog"}
        assert run["id"] == f"marionette-v{version}"
        assert UTC_TIME.fullmatch(run["time"]), run["id"]
        assert (run["status"], run["budget_usd"], run["engine"]) == ("completed", None, None), run["id"]
        assert run["changelog"] == paragraph, run["id"]
        assert run["pins"] and all(COMMIT.fullmatch(commit) for commit in run["pins"].values()), run["id"]
        assert all(isinstance(source_id, str) and source_id for source_id in run["pins"]), run["id"]


def test_the_newest_run_is_the_version_of_the_package():
    plugin = manifest()["plugin"]
    assert load("history.json")["runs"][0]["version"] == plugin["version"] == load("project.json")["version"]


def test_changelog_holds_each_notes_title_and_first_paragraph_newest_first():
    text = (PACKAGE / "CHANGELOG.md").read_text(encoding="utf-8")
    expected = "\n".join(f"# {title}\n\n{paragraph}\n" for _version, title, paragraph in release_notes())
    assert text == expected
    assert [run["changelog"] for run in load("history.json")["runs"]] == [note[2] for note in release_notes()]


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
    return root


def test_muro_project_pack_of_marionette_carries_the_four_files_and_reads_back_as_a_project(tmp_path, capsys):
    mp = tmp_path / "marionette.mp"
    cache = fake_sources_cache(tmp_path / "sources")
    code = main(["project", "pack", "--manifest", str(PACKAGE / "sources.json"), "--out", str(mp),
                 "--sources-cache", str(cache)])
    assert code == 0, capsys.readouterr().err
    folder = project.unpack(mp, tmp_path / "unpacked")
    for name in ("project.json", "records.json", "history.json", "CHANGELOG.md", "sources.json", "ROUTER.md"):
        assert (folder / name).read_bytes() == (PACKAGE / name).read_bytes(), name
    sources = manifest()["sources"]
    for src in sources:
        assert (folder / "inputs" / src["id"] / license_files(src)[0]).is_file(), src["id"]

    shown = project.info(mp, tmp_path / "cache")
    assert shown["project"] == load("project.json")
    assert shown["records"] == load("records.json")["records"]
    assert shown["history"] == load("history.json")["runs"]
    assert shown["changelog"] == (PACKAGE / "CHANGELOG.md").read_text(encoding="utf-8")
    assert [item["id"] for item in shown["inputs"]] == [src["id"] for src in sources]
    rows = {row["part"]: row["detail"] for row in shown["files"]}
    assert rows["Decision records"].startswith(f"{len(shown['records'])} records")
    assert rows["History"].startswith(f"{len(shown['history'])} runs")


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
