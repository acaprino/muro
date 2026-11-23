"""The `.mp` project file: one zip that carries a package, its inputs and its release (ADR-0028).

A `.mp` from elsewhere is untrusted input, so most of these tests are about what unpacking refuses.
"""
import json
import os
import shutil
import stat
import subprocess
import zipfile
from pathlib import Path

import pytest

from muro import guide, project
from muro.cli import main
from muro.core import parse_router
from muro.entries import entry_description
from muro.factory import PROMPT_FILES
from routing_helpers import INTENTS, ROOT, ROUTER_HEADER, copy_prompts
from test_apache_notice_gate import filled
from test_custom_instructions import deliver
from test_regressions import MIT
from test_release_guide import read_guide

SLUG = "tester"
PROJECT_JSON = {
    "schema": 1, "name": "Tester", "slug": SLUG, "version": "0.1.0", "author": "someone",
    "created": "2026-11-10T09:00:00Z", "changed": "2026-11-20T10:30:00+00:00",
    "repository": {"url": "https://example.invalid/tester", "branch": "main", "tag_prefix": "tester-v"},
    "builtin": False,
}
# What a package folder holds that travels in a `.mp`, and what it must not take along.
CARRIED = ["sources.json", "delivery.json", "ROUTER.md", "project.json", "records.json", "history.json", "CHANGELOG.md",
           "guide-examples.json", "capabilities/x.md", "custom-instructions/rules.md",
           *[f"prompts/{name}" for name in PROMPT_FILES]]
LEFT_OUT = ["notes.txt", ".muro/factory/PROMPT.md", "dist/old.txt"]
PLUGIN = {"slug": SLUG, "name": "Tester", "command": "tester", "version": "0.1.0"}
CAPABILITY_X = ("---\n" + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n'
                "## Sources\nSource: demo\n")


def git(path, *args):
    return subprocess.run(["git", "-C", str(path), "-c", "user.email=t@test", "-c", "user.name=t", *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def make_upstream(root):
    """A pinned source: a licensed repository with a skill, a reference and a file nobody selects."""
    (root / "references").mkdir(parents=True)
    git(root, "init", "-q")
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    (root / "SKILL.md").write_text("# Skill\n", encoding="utf-8")
    (root / "references" / "guide.md").write_text("A reference.\n", encoding="utf-8")
    (root / "unselected.md").write_text("Not part of the selection.\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-qm", "one")
    return root, git(root, "rev-parse", "HEAD")


@pytest.fixture(scope="module")
def upstream(tmp_path_factory):
    """One repository for the module: spawning Git is the slow part of these tests, and most need it only once."""
    return make_upstream(tmp_path_factory.mktemp("upstream"))


def make_package(pkg, root, commit):
    """A package folder that validates, with its one source pinned at `commit` of the repository `root`."""
    (pkg / "capabilities").mkdir(parents=True)
    (pkg / "capabilities" / "x.md").write_text(CAPABILITY_X, encoding="utf-8")
    (pkg / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(pkg)
    for stale in sorted((pkg / "prompts").iterdir()):      # a package that builds has the prompts it is built with
        if stale.name not in PROMPT_FILES:
            stale.unlink()
    (pkg / "custom-instructions").mkdir()
    (pkg / "custom-instructions" / "rules.md").write_bytes(b"Owner rules\r\nwith CRLF kept\r\n")
    manifest = {"plugin": dict(PLUGIN),
                "sources": [{"id": "demo", "repo_path": str(root), "commit": commit, "pin": "head",
                             "license": "MIT", "selected_paths": ["SKILL.md", "references"],
                             "excluded_paths": [], "intake": {"goal": "Fixture goal"}}]}
    (pkg / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    deliver(pkg)        # every owner file needs its delivery decision, or the package does not validate
    (pkg / "project.json").write_text(json.dumps(PROJECT_JSON), encoding="utf-8")
    (pkg / "records.json").write_text(json.dumps({"records": [{
        "id": "r1", "date": "2026-11-11", "subjects": ["x"], "text": "A decision.", "author": "muro",
        "binding": False}]}), encoding="utf-8")
    (pkg / "history.json").write_text(json.dumps({"runs": []}), encoding="utf-8")
    (pkg / "CHANGELOG.md").write_text("# Changelog\n", encoding="utf-8")
    (pkg / "notes.txt").write_text("a note the project file does not carry", encoding="utf-8")
    (pkg / ".muro" / "factory").mkdir(parents=True)
    (pkg / ".muro" / "factory" / "PROMPT.md").write_text("workbench", encoding="utf-8")
    (pkg / "dist").mkdir()
    (pkg / "dist" / "old.txt").write_text("an earlier build", encoding="utf-8")
    return pkg


@pytest.fixture
def package(tmp_path, upstream):
    return make_package(tmp_path / "pkg", *upstream)


@pytest.fixture(scope="module")
def cache(tmp_path_factory, upstream):
    """The sources cache of that repository, filled by one real pack: later packs read it and spawn no Git."""
    root = tmp_path_factory.mktemp("warm")
    folder = root / "cache"
    project.pack(make_package(root / "pkg", *upstream), root / "warm.mp", sources_cache=folder)
    return folder


def build_release(out):
    """What `--build --out <dir>` lays out: `<dir>/<slug>/...`, with the `sources.json` (the plugin's identity) and the
    capabilities of the package the build was made from: that is what ties a release to its package."""
    built = out / SLUG
    (built / "adapters" / "claude-code").mkdir(parents=True)
    (built / "adapters" / "claude-code" / "INSTALL.md").write_text("# Install\n", encoding="utf-8")
    (built / "GUIDE.html").write_text("<html></html>", encoding="utf-8")
    (built / "sources.json").write_text(json.dumps({"plugin": PLUGIN, "sources": []}), encoding="utf-8")
    (built / "capabilities").mkdir()
    (built / "capabilities" / "x.md").write_text(CAPABILITY_X, encoding="utf-8")
    return out


@pytest.fixture
def release(tmp_path):
    return build_release(tmp_path / "staged")


def names(mp):
    with zipfile.ZipFile(mp) as zf:
        return [info.filename for info in zf.infolist()]


def crafted(path, members, *, mimetype=project.MIMETYPE, mimetype_first=True, mimetype_compressed=False):
    """A zip as a stranger could make it. A member is (name, data) or (name, data, external_attr)."""
    def add(zf, name, data, attr=0):
        info = zipfile.ZipInfo(name)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = attr
        zf.writestr(info, data)

    def add_mimetype(zf):
        if mimetype is None:
            return
        info = zipfile.ZipInfo("mimetype")
        info.compress_type = zipfile.ZIP_DEFLATED if mimetype_compressed else zipfile.ZIP_STORED
        zf.writestr(info, mimetype)

    with zipfile.ZipFile(path, "w") as zf:
        if mimetype_first:
            add_mimetype(zf)
        for member in members:
            add(zf, *member)
        if not mimetype_first:
            add_mimetype(zf)
    return path


# --- the container ----------------------------------------------------------------------------------

def test_pack_then_unpack_gives_the_same_files(tmp_path, package, release, cache):
    mp = project.pack(package, tmp_path / "tester.mp", sources_cache=cache, release_dir=release)
    folder = project.unpack(mp, tmp_path / "out")
    for name in CARRIED:
        assert (folder / name).read_bytes() == (package / name).read_bytes(), name
    for name in LEFT_OUT:
        assert not (folder / name).exists(), name
    assert not (folder / "mimetype").exists()
    for path in ("adapters/claude-code/INSTALL.md", "GUIDE.html", "sources.json", "capabilities/x.md"):
        assert (folder / "release" / SLUG / path).read_bytes() == (release / SLUG / path).read_bytes()
    found = {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}
    assert found == set(CARRIED) | {"inputs/demo/LICENSE", "inputs/demo/SKILL.md", "inputs/demo/references/guide.md",
                                    f"release/{SLUG}/adapters/claude-code/INSTALL.md", f"release/{SLUG}/GUIDE.html",
                                    f"release/{SLUG}/sources.json", f"release/{SLUG}/capabilities/x.md"}


def test_inputs_hold_the_selected_files_and_the_license_at_the_pinned_commit(tmp_path):
    root, commit = make_upstream(tmp_path / "own-upstream")
    package = make_package(tmp_path / "pkg", root, commit)
    # The repository moves on after the pin; the project file must hold the pinned content.
    (root / "SKILL.md").write_text("# Changed after the pin\n", encoding="utf-8")
    git(root, "commit", "-qam", "two")
    manifest = json.loads((package / "sources.json").read_text(encoding="utf-8"))
    manifest["sources"][0]["pin"] = "static"
    (package / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    folder = project.unpack(project.pack(package, tmp_path / "t.mp"), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "SKILL.md").read_text(encoding="utf-8") == "# Skill\n"
    assert (folder / "inputs" / "demo" / "LICENSE").read_text(encoding="utf-8") == MIT
    assert not (folder / "inputs" / "demo" / "unselected.md").exists()


def make_apache_upstream(root, *, nested):
    """An Apache-2.0 repository with a NOTICE beside its license: at the root, or in the folder the license covers.

    With `nested` the root holds another NOTICE, which the folder's license does not cover.
    """
    base = root / "skills" / "demo" if nested else root
    (base / "references").mkdir(parents=True)
    git(root, "init", "-q")
    (base / "LICENSE").write_bytes(filled("Copyright 2026 Mainfunc, Inc."))
    (base / "NOTICE").write_text("Demo\nThis product includes software developed at Mainfunc, Inc.\n", encoding="utf-8")
    (base / "SKILL.md").write_text("# Skill\n", encoding="utf-8")
    (base / "references" / "guide.md").write_text("A reference.\n", encoding="utf-8")
    if nested:
        (root / "NOTICE").write_text("The repository's own notice\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-qm", "apache")
    return root, git(root, "rev-parse", "HEAD")


def repin(package, **changes):
    """Change the package's one source in sources.json."""
    path = package / "sources.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["sources"][0].update(changes)
    path.write_text(json.dumps(manifest), encoding="utf-8")


@pytest.mark.parametrize("nested", [False, True])
def test_inputs_carry_the_license_and_the_notice_the_build_carries(tmp_path, nested):
    # Apache-2.0 asks for the NOTICE to travel with the license: a shared .mp redistributes the sources.
    root, commit = make_apache_upstream(tmp_path / "upstream", nested=nested)
    package = make_package(tmp_path / "pkg", root, commit)
    prefix = "skills/demo/" if nested else ""
    repin(package, license="Apache-2.0", selected_paths=[prefix + "SKILL.md", prefix + "references"],
          **({"license_path": "skills/demo/LICENSE"} if nested else {}))
    folder = project.unpack(project.pack(package, tmp_path / "t.mp"), tmp_path / "out")
    inputs = {p.relative_to(folder / "inputs" / "demo").as_posix() for p in (folder / "inputs" / "demo").rglob("*")
              if p.is_file()}
    assert inputs == {prefix + name for name in ("LICENSE", "NOTICE", "SKILL.md", "references/guide.md")}
    assert (folder / "inputs" / "demo" / (prefix + "NOTICE")).read_text(encoding="utf-8").startswith("Demo\nThis product")
    assert "The repository's own notice" not in "".join(
        p.read_text(encoding="utf-8") for p in (folder / "inputs").rglob("*") if p.is_file())


def test_inputs_carry_the_files_a_source_declares_as_notices(tmp_path):
    root, _ = make_upstream(tmp_path / "upstream")
    (root / "references" / "NOTICES.md").write_text("# Third-party notices\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-qm", "notices")
    package = make_package(tmp_path / "pkg", root, git(root, "rev-parse", "HEAD"))
    repin(package, notice_paths=["references/NOTICES.md"])
    folder = project.unpack(project.pack(package, tmp_path / "t.mp"), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "references" / "NOTICES.md").read_text(encoding="utf-8") == "# Third-party notices\n"


def test_mimetype_is_the_first_member_and_stored(tmp_path, package, cache):
    mp = project.pack(package, tmp_path / "tester.mp", sources_cache=cache)
    assert names(mp)[0] == "mimetype"
    with zipfile.ZipFile(mp) as zf:
        first = zf.infolist()[0]
        assert first.compress_type == zipfile.ZIP_STORED
        assert zf.read("mimetype") == b"application/vnd.muro.project+zip"
    assert mp.read_bytes()[30:38] == b"mimetype"   # readable without a zip library


def test_packing_the_same_project_twice_gives_the_same_bytes(tmp_path, package, release, cache):
    first = project.pack(package, tmp_path / "a.mp", sources_cache=cache, release_dir=release)
    second = project.pack(package, tmp_path / "b.mp", sources_cache=cache, release_dir=release)
    assert first.read_bytes() == second.read_bytes()
    assert project.digest(first) == project.digest(second)


def test_a_package_without_records_history_or_changelog_gets_empty_ones(tmp_path, package, cache):
    for name in ("records.json", "history.json", "CHANGELOG.md"):
        (package / name).unlink()
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=cache), tmp_path / "out")
    assert json.loads((folder / "records.json").read_text(encoding="utf-8")) == {"records": []}
    assert json.loads((folder / "history.json").read_text(encoding="utf-8")) == {"runs": []}
    assert (folder / "CHANGELOG.md").read_text(encoding="utf-8") == ""


def test_pack_refuses_a_package_that_fails_validation(tmp_path, package):
    (package / "ROUTER.md").write_text(ROUTER_HEADER, encoding="utf-8")   # the capability has no router row
    with pytest.raises(ValueError, match="does not validate"):
        project.pack(package, tmp_path / "t.mp")
    assert not (tmp_path / "t.mp").exists()


def test_pack_refuses_a_missing_or_malformed_project_json(tmp_path, package, cache):
    (package / "project.json").unlink()
    with pytest.raises(ValueError, match="project.json"):
        project.pack(package, tmp_path / "t.mp")
    for broken in ({**PROJECT_JSON, "schema": 2}, {**PROJECT_JSON, "name": 3},
                   {k: v for k, v in PROJECT_JSON.items() if k != "builtin"},
                   {**PROJECT_JSON, "created": "yesterday"}, {**PROJECT_JSON, "changed": "2026-11-20T10:30:00+01:00"},
                   {**PROJECT_JSON, "repository": {"url": "u"}}, {**PROJECT_JSON, "slug": "another"}):
        (package / "project.json").write_text(json.dumps(broken), encoding="utf-8")
        with pytest.raises(ValueError, match="project.json"):
            project.pack(package, tmp_path / "t.mp")
    assert [p.name for p in tmp_path.iterdir() if p.name.startswith(".") or p.suffix == ".mp"] == []   # nothing left behind
    (package / "project.json").write_text(json.dumps({**PROJECT_JSON, "repository": None}), encoding="utf-8")
    assert project.pack(package, tmp_path / "t.mp", sources_cache=cache).is_file()   # no repository is valid


def test_pack_refuses_a_release_folder_without_the_plugin(tmp_path, package):
    (tmp_path / "empty").mkdir()
    with pytest.raises(ValueError, match=SLUG):
        project.pack(package, tmp_path / "t.mp", release_dir=tmp_path / "empty")


MISMATCH = "The plugin inside this project does not match the project: it was not built from it"


def damage(built, how):
    """Change a built release folder (`<out>/<slug>`) so that it is no longer the build of the package."""
    manifest_path = built / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else None
    if how == "another version":
        manifest["plugin"]["version"] = "9.9.9"
    elif how == "another plugin":
        manifest["plugin"]["slug"] = "other-plugin"
    elif how == "an extra capability":
        text = (built / "capabilities" / "x.md").read_text(encoding="utf-8")
        (built / "capabilities" / "extra.md").write_text(text.replace("id: x\n", "id: extra\n"), encoding="utf-8")
    elif how == "a capability fewer":
        (built / "capabilities" / "x.md").unlink()
    elif how == "no sources.json":
        manifest_path.unlink()
    elif how == "sources.json that is not JSON":
        manifest_path.write_text("{ not json", encoding="utf-8")
        manifest = None
    elif how == "a plugin that is not an object":
        manifest["plugin"] = "tester"
    elif how == "a capability that does not parse":
        (built / "capabilities" / "x.md").write_text("no front matter", encoding="utf-8")
    else:
        raise AssertionError(how)
    if manifest is not None and manifest_path.exists():
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")


DAMAGES = ["another version", "another plugin", "an extra capability", "a capability fewer", "no sources.json",
           "sources.json that is not JSON", "a plugin that is not an object", "a capability that does not parse"]


@pytest.mark.parametrize("how", DAMAGES)
def test_pack_refuses_a_release_that_was_not_built_from_the_package(tmp_path, package, cache, how):
    staged = build_release(tmp_path / "staged")
    damage(staged / SLUG, how)
    with pytest.raises(ValueError, match=MISMATCH):
        project.pack(package, tmp_path / "t.mp", sources_cache=cache, release_dir=staged)
    assert not (tmp_path / "t.mp").exists()


def test_pack_accepts_the_release_built_from_the_package_whatever_else_it_holds(tmp_path, package, cache):
    staged = build_release(tmp_path / "staged")
    (staged / SLUG / "NOTICE.md").write_text("notices", encoding="utf-8")       # a build adds files the package has not
    text = (staged / SLUG / "capabilities" / "x.md").read_text(encoding="utf-8")
    (staged / SLUG / "capabilities" / "x.md").write_text(text + "\nA line the build adds.\n", encoding="utf-8")
    assert project.pack(package, tmp_path / "t.mp", sources_cache=cache, release_dir=staged).is_file()


def with_members(mp, out, changes):
    """The project file with members replaced (bytes), added, or left out (None): a stranger's edit of a real one."""
    with zipfile.ZipFile(mp) as source:
        members = {info.filename: source.read(info.filename) for info in source.infolist() if info.filename != "mimetype"}
    for name, value in changes.items():
        if value is None:
            members.pop(name, None)
        else:
            members[name] = value
    return crafted(out, list(members.items()))


def test_verify_holds_a_project_file_to_the_plugin_it_carries(tmp_path, package, release, cache):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache, release_dir=release)
    assert project.verify(mp, tmp_path / "kept") is None
    manifest = json.loads((release / SLUG / "sources.json").read_text(encoding="utf-8"))
    other_version = {**manifest, "plugin": {**manifest["plugin"], "version": "0.2.0"}}
    extra = (release / SLUG / "capabilities" / "x.md").read_text(encoding="utf-8").replace("id: x\n", "id: extra\n")
    for number, (why, changes) in enumerate({
            "another version": {f"release/{SLUG}/sources.json": json.dumps(other_version).encode("utf-8")},
            "an extra capability": {f"release/{SLUG}/capabilities/extra.md": extra.encode("utf-8")},
            "a capability fewer": {f"release/{SLUG}/capabilities/x.md": None},
            "no sources.json": {f"release/{SLUG}/sources.json": None},
            "the package changed after the build": {"sources.json": json.dumps(
                {**json.loads((package / "sources.json").read_text(encoding="utf-8")),
                 "plugin": {**manifest["plugin"], "version": "0.3.0"}}).encode("utf-8")}}.items()):
        strange = with_members(mp, tmp_path / f"s{number}.mp", changes)
        with pytest.raises(ValueError, match=MISMATCH):
            project.verify(strange, tmp_path / "kept")
    # a project with no release has nothing to disagree with its package; installing it is refused for that elsewhere
    bare = project.pack(package, tmp_path / "bare.mp", sources_cache=cache)
    assert project.verify(bare, tmp_path / "kept") is None


def test_verify_through_the_command_line(tmp_path, package, release, cache, capsys):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache, release_dir=release)
    assert main(["project", "verify", str(mp), "--cache", str(tmp_path / "kept")]) == 0
    assert json.loads(capsys.readouterr().out) == {"verified": True}
    manifest = json.loads((release / SLUG / "sources.json").read_text(encoding="utf-8"))
    manifest["plugin"]["version"] = "0.2.0"
    strange = with_members(mp, tmp_path / "s.mp", {f"release/{SLUG}/sources.json": json.dumps(manifest).encode("utf-8")})
    assert main(["project", "verify", str(strange), "--cache", str(tmp_path / "kept")]) == 1
    captured = capsys.readouterr()
    assert captured.out == "" and captured.err.startswith("Project verify failed: " + MISMATCH)


def test_pack_refuses_links_in_what_it_carries(tmp_path, package):
    try:
        (package / "capabilities" / "link.md").symlink_to(package / "notes.txt")
    except (OSError, NotImplementedError):
        pytest.skip("symbolic links are not available here")
    with pytest.raises(ValueError, match="link"):
        project.pack(package, tmp_path / "t.mp")
    assert not (tmp_path / "t.mp").exists()


def test_pack_stops_at_the_limits_unpack_enforces(tmp_path, package, cache, monkeypatch):
    monkeypatch.setattr(project, "MAX_MEMBERS", 5)
    with pytest.raises(ValueError, match="members"):
        project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    monkeypatch.undo()
    monkeypatch.setattr(project, "MAX_BYTES", 200)
    with pytest.raises(ValueError, match="uncompressed"):
        project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    assert not (tmp_path / "t.mp").exists()


def test_an_executable_helper_stays_executable(tmp_path, package, cache):
    if os.name == "nt":
        pytest.skip("execute bits are not kept on Windows")
    script = package / "capabilities" / "run.sh"
    script.write_text("#!/bin/sh\n", encoding="utf-8")
    script.chmod(0o755)
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=cache), tmp_path / "out")
    assert (folder / "capabilities" / "run.sh").stat().st_mode & 0o111


# --- sources and their cache -----------------------------------------------------------------------

def test_pack_fills_the_sources_cache_and_reads_it_without_the_network(tmp_path, package, monkeypatch):
    cache = tmp_path / "cache"
    first = project.pack(package, tmp_path / "a.mp", sources_cache=cache)
    commit = json.loads((package / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    assert (cache / "demo" / commit / "SKILL.md").is_file() and (cache / "demo" / commit / "LICENSE").is_file()

    def refuse(*_args, **_kwargs):
        raise AssertionError("a source in the cache must not be fetched again")
    monkeypatch.setattr(project, "source_repository", refuse)
    monkeypatch.setattr(project, "inspect_source", refuse)
    second = project.pack(package, tmp_path / "b.mp", sources_cache=cache)
    assert first.read_bytes() == second.read_bytes()
    assert (project.unpack(second, tmp_path / "out") / "inputs" / "demo" / "references" / "guide.md").is_file()


def unreachable(package):
    """The package's source can no longer be fetched: only a cache made for it can serve it."""
    manifest = json.loads((package / "sources.json").read_text(encoding="utf-8"))
    manifest["sources"][0].pop("repo_path")
    manifest["sources"][0]["repo_url"] = "https://invalid.invalid/never-fetched.git"
    (package / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")


def test_pack_takes_a_cache_made_by_an_earlier_pack_for_a_source_it_cannot_reach(tmp_path, package, cache):
    shutil.copytree(cache, tmp_path / "prepared")            # a cache carried to a machine without the network
    unreachable(package)
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=tmp_path / "prepared"), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "SKILL.md").read_text(encoding="utf-8") == "# Skill\n"
    assert (folder / "inputs" / "demo" / "references" / "guide.md").is_file()


def test_pack_refuses_a_cached_source_that_lacks_a_file_it_declares_as_a_notice(tmp_path, package):
    repin(package, notice_paths=["references/guide.md"])
    cache = tmp_path / "cache"
    project.pack(package, tmp_path / "a.mp", sources_cache=cache)
    commit = json.loads((package / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    (cache / "demo" / commit / "references" / "guide.md").unlink()       # an entry that lost a file since
    unreachable(package)
    with pytest.raises(ValueError, match=r"demo.*references/guide\.md"):
        project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    assert not (tmp_path / "t.mp").exists()


# --- a cached source is held to what it was made for ------------------------------------------------------

def test_a_cache_made_for_a_smaller_selection_is_fetched_again(tmp_path, package):
    cache = tmp_path / "cache"
    repin(package, selected_paths=["SKILL.md"])
    small = project.unpack(project.pack(package, tmp_path / "a.mp", sources_cache=cache), tmp_path / "a")
    assert not (small / "inputs" / "demo" / "references").exists()
    repin(package, selected_paths=["SKILL.md", "references"])
    larger = project.unpack(project.pack(package, tmp_path / "b.mp", sources_cache=cache), tmp_path / "b")
    assert (larger / "inputs" / "demo" / "references" / "guide.md").read_text(encoding="utf-8") == "A reference.\n"
    # back to the smaller one: nothing of the larger copy stays in the project or in the cache
    repin(package, selected_paths=["SKILL.md"])
    again = project.unpack(project.pack(package, tmp_path / "c.mp", sources_cache=cache), tmp_path / "c")
    assert not (again / "inputs" / "demo" / "references").exists()
    commit = json.loads((package / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    assert not (cache / "demo" / commit / "references").exists()


def test_a_cache_without_a_stamp_is_fetched_again(tmp_path, package, cache):
    kept = tmp_path / "kept"
    shutil.copytree(cache, kept)
    commit = json.loads((package / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    (kept / "demo" / commit / "SKILL.md").write_text("# Not what the pin holds\n", encoding="utf-8")
    for beside in (kept / "demo").iterdir():                 # an entry made before entries carried a stamp
        if beside.name != commit:
            beside.unlink()
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=kept), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "SKILL.md").read_text(encoding="utf-8") == "# Skill\n"
    assert (kept / "demo" / commit / "SKILL.md").read_text(encoding="utf-8") == "# Skill\n"
    assert sorted(p.name for p in (kept / "demo").iterdir()) != [commit], "the entry carries its stamp again"


def test_a_cache_with_a_stamp_that_matches_is_used_without_the_network(tmp_path, package, cache, monkeypatch):
    kept = tmp_path / "kept"
    shutil.copytree(cache, kept)

    def refuse(*_args, **_kwargs):
        raise AssertionError("an entry made for this very selection must not be fetched again")
    monkeypatch.setattr(project, "source_repository", refuse)
    monkeypatch.setattr(project, "inspect_source", refuse)
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=kept), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "references" / "guide.md").is_file()


def test_the_stamp_is_a_digest_of_what_picks_a_sources_files_and_of_its_commit():
    src = {"id": "demo", "commit": "a" * 40, "license": "MIT", "selected_paths": ["SKILL.md"], "excluded_paths": [],
           "media_paths": [], "notice_paths": [], "license_path": "LICENSE", "repo_url": "https://example.invalid/a.git",
           "intake": {"goal": "One goal"}}
    stamp = project._stamp(src)
    assert stamp == project._stamp(dict(src)) and len(stamp) == 64 and set(stamp) <= set("0123456789abcdef")
    # what does not pick files does not change it: where the source is fetched from, the goal
    assert project._stamp({**src, "repo_url": "https://example.invalid/b.git", "intake": {"goal": "Another"}}) == stamp
    for change in ({"selected_paths": ["SKILL.md", "references"]}, {"selected_paths": ["references", "SKILL.md"]},
                   {"media_paths": ["a.png"]}, {"notice_paths": ["NOTICES.md"]}, {"license_path": "sub/LICENSE"},
                   {"excluded_paths": ["x"]}, {"commit": "b" * 40}, {"license": "Apache-2.0"}):
        assert project._stamp({**src, **change}) != stamp, change
    without_keys = {k: v for k, v in src.items() if k not in ("media_paths", "notice_paths", "license_path", "excluded_paths")}
    assert project._stamp(without_keys) == project._stamp(dict(without_keys))   # absent keys: a valid source, not an error


def test_pack_refuses_a_source_that_fails_its_check(tmp_path, package):
    manifest = json.loads((package / "sources.json").read_text(encoding="utf-8"))
    manifest["sources"][0]["license"] = "GPL-3.0"
    (package / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="demo"):
        project.pack(package, tmp_path / "t.mp")
    assert not (tmp_path / "t.mp").exists()


# --- unpacking a stranger's file -------------------------------------------------------------------

UNSAFE = ["../x", "/x", "C:/x", "a/../../x", "..\\x", "a\\..\\..\\x", "a/./b", "dir//x", "ok/..", "name:stream", "a/b."]


@pytest.mark.parametrize("name", UNSAFE)
def test_unpack_refuses_traversal_absolute_drive_and_links_by_name(tmp_path, name):
    mp = crafted(tmp_path / "evil.mp", [("fine.txt", b"fine"), (name, b"escaped")])
    with pytest.raises(ValueError, match="Unsafe member"):
        project.unpack(mp, tmp_path / "out")
    assert not (tmp_path / "out").exists()                      # nothing is left, not even the first member
    assert not (tmp_path / "x").exists()
    assert [p.name for p in tmp_path.iterdir()] == ["evil.mp"]  # and no half-unpacked sibling


# Names Windows cannot create, or creates as something else: a device, a character it forbids, a control character.
WINDOWS = (["CON", "con", "PRN", "AUX", "NUL", "Nul", *[f"COM{n}" for n in range(1, 10)], *[f"LPT{n}" for n in range(1, 10)],
            "inputs/aux.txt", "NUL.md", "capabilities/com1", "COM9.x.y", "lpt1.txt", "a/Lpt9/b", "con.d/x.md", "CON.tar.gz"]
           + [f"a{bad}b" for bad in '<>"|?*'] + ["a\x01b", "a\x1fb", "a\x7fb", "dir/\x08name", "x/y\tz", "a\nb"])
# Names that only look like those: they are files.
ORDINARY = ["console.md", "communication.md", "com10.txt", "lpt10", "auxiliary/x", "nul-terminated.md", "a-con.md",
            "inputs/demo/references/guide.md", "release/tester/adapters/claude-code/INSTALL.md", "x.con", "COM.txt",
            "con-tent/it", "naïve/ünïcode.md", "a b/c d.md", "it's.md", "a(1)[2]{3}.md", "a&b=c,d;e.md", "~tilde.md"]


@pytest.mark.parametrize("name", WINDOWS)
def test_unpack_refuses_a_name_windows_cannot_make_and_says_which(tmp_path, name):
    mp = crafted(tmp_path / "evil.mp", [("fine.txt", b"fine"), (name, b"x")])
    with pytest.raises(ValueError, match="Unsafe member") as refused:
        project.unpack(mp, tmp_path / "out")
    assert repr(name) in str(refused.value), "the member is named"
    assert not (tmp_path / "out").exists() and [p.name for p in tmp_path.iterdir()] == ["evil.mp"]


@pytest.mark.parametrize("name", ORDINARY)
def test_a_name_that_only_looks_like_a_device_or_holds_ordinary_characters_is_fine(tmp_path, name):
    assert project._unsafe_name(name) is None
    folder = project.unpack(crafted(tmp_path / "ok.mp", [(name, b"x")]), tmp_path / "out")
    assert (folder.joinpath(*name.split("/"))).read_bytes() == b"x"


def test_unpack_refuses_traversal_absolute_drive_and_links(tmp_path):
    """The brief's list in one place: `../x`, `/x`, `C:/x`, `a/../../x` and a symlink entry."""
    link = (stat.S_IFLNK | 0o777) << 16
    for index, member in enumerate([("../x", b"."), ("/x", b"."), ("C:/x", b"."), ("a/../../x", b"."),
                                    ("link", b"../../etc/passwd", link)]):
        mp = crafted(tmp_path / f"evil{index}.mp", [member])
        with pytest.raises(ValueError, match="Unsafe member"):
            project.unpack(mp, tmp_path / f"out{index}")
        assert not (tmp_path / f"out{index}").exists()
    assert not (tmp_path / "x").exists()


@pytest.mark.parametrize("kind", [stat.S_IFCHR, stat.S_IFIFO, stat.S_IFSOCK])
def test_unpack_refuses_other_than_files_and_folders(tmp_path, kind):
    mp = crafted(tmp_path / "evil.mp", [("special", b"", (kind | 0o644) << 16)])
    with pytest.raises(ValueError, match="Unsafe member"):
        project.unpack(mp, tmp_path / "out")


@pytest.mark.filterwarnings("ignore:Duplicate name")      # the stranger's zip repeats a name on purpose
def test_unpack_refuses_encrypted_duplicate_and_unusual_members(tmp_path):
    mp = crafted(tmp_path / "dup.mp", [("a.txt", b"1"), ("A.TXT", b"2")])    # one file on a case-folding disk
    with pytest.raises(ValueError, match="twice"):
        project.unpack(mp, tmp_path / "out")
    mp = crafted(tmp_path / "again.mp", [("mimetype", b"again")])
    with pytest.raises(ValueError, match="twice"):
        project.unpack(mp, tmp_path / "out")
    mp = crafted(tmp_path / "enc.mp", [("a.txt", b"1")])
    raw = bytearray(mp.read_bytes())
    for marker in (b"PK\x03\x04", b"PK\x01\x02"):          # set the encryption flag in the header and the directory
        start = raw.rfind(marker)
        raw[start + (6 if marker == b"PK\x03\x04" else 8)] |= 1
    mp.write_bytes(bytes(raw))
    with pytest.raises(ValueError, match="encrypted"):
        project.unpack(mp, tmp_path / "out")


def test_unpack_stops_at_the_size_and_count_limits(tmp_path, monkeypatch):
    members = [(f"f{index}.txt", b"x" * 50) for index in range(5)]
    mp = crafted(tmp_path / "big.mp", members)
    monkeypatch.setattr(project, "MAX_MEMBERS", 5)             # the five files and the mimetype are six
    with pytest.raises(ValueError, match="more than 5 members"):
        project.unpack(mp, tmp_path / "out")
    monkeypatch.setattr(project, "MAX_MEMBERS", 6)             # exactly the limit is allowed
    monkeypatch.setattr(project, "MAX_BYTES", 250)             # 5 x 50 bytes + the mimetype is over it
    with pytest.raises(ValueError, match="more than 250 bytes uncompressed"):
        project.unpack(mp, tmp_path / "out")
    assert not (tmp_path / "out").exists()
    monkeypatch.setattr(project, "MAX_BYTES", 250 + len(project.MIMETYPE))   # exactly the limit is allowed
    assert (project.unpack(mp, tmp_path / "out") / "f4.txt").read_bytes() == b"x" * 50


def test_the_published_limits_are_two_gib_and_fifty_thousand_members():
    assert project.MAX_BYTES == 2 * 1024 ** 3
    assert project.MAX_MEMBERS == 50_000


@pytest.mark.parametrize("variant", ["no-mimetype", "other-value", "not-first", "compressed", "not-a-zip", "empty"])
def test_a_file_that_is_not_a_project_file_is_refused(tmp_path, variant):
    members = [("project.json", b"{}")]
    if variant == "no-mimetype":
        mp = crafted(tmp_path / "x.mp", members, mimetype=None)
    elif variant == "other-value":
        mp = crafted(tmp_path / "x.mp", members, mimetype=b"application/zip")
    elif variant == "not-first":
        mp = crafted(tmp_path / "x.mp", members, mimetype_first=False)
    elif variant == "compressed":
        mp = crafted(tmp_path / "x.mp", members, mimetype_compressed=True)
    elif variant == "not-a-zip":
        mp = tmp_path / "x.mp"
        mp.write_text("plain text", encoding="utf-8")
    else:
        mp = tmp_path / "x.mp"
        mp.write_bytes(b"")
    with pytest.raises(ValueError, match="Not a Muro project file"):
        project.unpack(mp, tmp_path / "out")
    assert not (tmp_path / "out").exists()


@pytest.mark.parametrize("compression", [zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED])
def test_a_corrupted_member_is_refused_and_leaves_nothing(tmp_path, compression):
    mp = tmp_path / "bad.mp"
    with zipfile.ZipFile(mp, "w") as archive:
        first = zipfile.ZipInfo("mimetype")
        first.compress_type = zipfile.ZIP_STORED
        archive.writestr(first, project.MIMETYPE)
        member = zipfile.ZipInfo("a.txt")
        member.compress_type = compression
        archive.writestr(member, b"hello world, " * 20)
    raw = bytearray(mp.read_bytes())
    start = raw.index(b"a.txt") + len(b"a.txt")                    # the member's data follows its local header
    for offset in range(start, start + 6):
        raw[offset] ^= 0xFF
    mp.write_bytes(bytes(raw))
    with pytest.raises(ValueError, match="Not a Muro project file"):
        project.unpack(mp, tmp_path / "out")
    assert [p.name for p in tmp_path.iterdir()] == ["bad.mp"]


def test_a_missing_file_is_an_os_error_not_a_project_error(tmp_path):
    with pytest.raises(OSError):
        project.unpack(tmp_path / "missing.mp", tmp_path / "out")


def test_unpack_needs_a_fresh_folder(tmp_path):
    mp = crafted(tmp_path / "x.mp", [("a.txt", b"a")])
    taken = tmp_path / "taken"
    taken.mkdir()
    (taken / "mine.txt").write_text("keep", encoding="utf-8")
    with pytest.raises(ValueError, match="new folder"):
        project.unpack(mp, taken)
    assert (taken / "mine.txt").read_text(encoding="utf-8") == "keep" and not (taken / "a.txt").exists()
    with pytest.raises(ValueError, match="new folder"):
        project.unpack(mp, tmp_path / "x.mp")                  # a file is not a folder
    empty = tmp_path / "empty"
    empty.mkdir()
    assert (project.unpack(mp, empty) / "a.txt").read_bytes() == b"a"
    assert (project.unpack(mp, tmp_path / "deep" / "er" / "out") / "a.txt").read_bytes() == b"a"


def test_unpack_keeps_folders_the_zip_lists(tmp_path):
    mp = crafted(tmp_path / "x.mp", [("empty-dir/", b""), ("sub/inner/a.txt", b"a")])
    folder = project.unpack(mp, tmp_path / "out")
    assert (folder / "empty-dir").is_dir() and (folder / "sub" / "inner" / "a.txt").is_file()


# --- the cache by content --------------------------------------------------------------------------

def test_cached_unpacks_once_for_the_same_bytes_and_again_after_a_change(tmp_path, package, cache):
    kept = tmp_path / "kept"
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    folder = project.cached(mp, kept)
    assert folder == kept / project.digest(mp)
    assert (folder / "project.json").is_file()
    (folder / "marker").write_text("unpacked once", encoding="utf-8")
    assert project.cached(mp, kept) == folder
    assert (folder / "marker").read_text(encoding="utf-8") == "unpacked once"   # not unpacked again
    other = tmp_path / "copy.mp"
    other.write_bytes(mp.read_bytes())
    assert project.cached(other, kept) == folder                                 # same bytes, same folder

    (package / "CHANGELOG.md").write_text("# Changelog\n\nA change.\n", encoding="utf-8")
    project.pack(package, mp, sources_cache=cache)                               # the same path, other bytes
    changed = project.cached(mp, kept)
    assert changed != folder and not (changed / "marker").exists()
    assert (changed / "CHANGELOG.md").read_text(encoding="utf-8").endswith("A change.\n")
    assert (folder / "marker").exists()                                          # the old one is left alone


def test_cached_refuses_a_file_that_is_not_a_project_and_keeps_no_folder(tmp_path):
    mp = tmp_path / "x.mp"
    mp.write_bytes(b"not a zip")
    with pytest.raises(ValueError, match="Not a Muro project file"):
        project.cached(mp, tmp_path / "cache")
    assert not (tmp_path / "cache").exists() or not any((tmp_path / "cache").iterdir())


def test_the_default_cache_root_is_per_user(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    monkeypatch.setenv("XDG_CACHE_HOME", str(tmp_path / "xdg"))
    root = project.default_cache_root()
    assert root.name == "projects" and root.parent.name == "muro"
    assert str(root).startswith(str(tmp_path / ("local" if os.name == "nt" else "xdg")))


# --- info: everything the project page shows ---------------------------------------------------------

INFO_KEYS = {"project", "plugin", "inputs", "decisions", "records", "history", "changelog", "prompts", "instructions",
             "graph", "files", "digest"}
FILE_PARTS = ["Identity", "Author and dates", "Repository", "Inputs", "Choices", "Result", "Your instructions", "History",
              "Changelog", "Decision records", "Input copies", "Built plugin"]
RUN = {"id": "run-1", "time": "2026-11-12T10:00:00Z", "version": "0.1.0", "status": "completed", "budget_usd": None,
       "engine": None, "pins": {"demo": "a" * 40}, "changelog": "First harmonization."}
ENTRY = {"name": "tester-main", "description": "Use when testing the tester.", "capabilities": ["x"],
         "absorbs": ["old-tester"]}
EXAMPLE = {"title": "Verify a test artifact", "task": "Verify the requested test artifact", "stack_tokens": [],
           "status": "selected", "reason": "The request asks for the one capability.", "questions": [],
           "selections": [{"capability": "x", "intent": "testing.verify", "reason": "It verifies the artifact."}]}


@pytest.fixture
def described(tmp_path, upstream):
    """The fixture package with what a project page shows of one: entries, a documented request, more choices, a run."""
    pkg = make_package(tmp_path / "pkg", *upstream)
    manifest = json.loads((pkg / "sources.json").read_text(encoding="utf-8"))
    manifest["plugin"].update(description="A plugin for the tests.", replaces=["old-tester"])
    (pkg / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    (pkg / "entries.json").write_text(json.dumps({"entries": [ENTRY]}), encoding="utf-8")
    (pkg / "guide-examples.json").write_text(json.dumps({"examples": [EXAMPLE]}), encoding="utf-8")
    delivery = json.loads((pkg / "delivery.json").read_text(encoding="utf-8"))
    delivery["decisions"] += [
        {"source": "demo", "content": "The guide", "form": "dropped", "targets": [], "reason": "Not needed at run time."},
        {"source": "demo", "content": "The notes", "form": "dropped", "targets": [], "reason": "Evidence only."},
        {"source": "demo", "content": "A rule", "form": "always-on", "targets": [], "reason": "Applies throughout."}]
    (pkg / "delivery.json").write_text(json.dumps(delivery), encoding="utf-8")
    (pkg / "history.json").write_text(json.dumps({"runs": [RUN]}), encoding="utf-8")
    return pkg


def info_of(tmp_path, package, cache, **options):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache, **options)
    return project.info(mp, tmp_path / "kept"), mp


def test_info_reads_the_project_through_the_cache(tmp_path, package, cache):
    result, mp = info_of(tmp_path, package, cache)
    assert result["project"] == PROJECT_JSON
    assert result["digest"] == project.digest(mp)
    assert (tmp_path / "kept" / result["digest"] / "project.json").is_file()


def test_info_has_everything_the_project_page_shows(tmp_path, described, cache):
    result, mp = info_of(tmp_path, described, cache)
    assert set(result) == INFO_KEYS
    assert result["plugin"] == {"name": "Tester", "slug": SLUG, "version": "0.1.0", "description": "A plugin for the tests."}
    assert result["records"] == json.loads((described / "records.json").read_text(encoding="utf-8"))["records"]
    assert result["history"] == [RUN]
    assert result["changelog"] == "# Changelog\n"
    assert result["decisions"] == json.loads((described / "delivery.json").read_text(encoding="utf-8"))["decisions"]
    # the owner's instruction files whole, for the page to show and edit (the CRLF is kept: they are bytes the owner wrote)
    assert result["instructions"] == [{"path": "rules.md", "text": "Owner rules\r\nwith CRLF kept\r\n"}]


def test_info_of_a_package_without_delivery_choices_has_none(tmp_path, package, cache):
    (package / "delivery.json").unlink()
    (package / "custom-instructions" / "rules.md").unlink()
    result, _ = info_of(tmp_path, package, cache)
    assert result["decisions"] == []
    assert result["inputs"][0]["became"] == {"capability": 0, "always-on": 0, "hook": 0, "mcp-server": 0, "dropped": 0}


def test_each_input_says_what_it_became_by_the_delivery_document(tmp_path, described, cache):
    result, _ = info_of(tmp_path, described, cache)
    delivery = json.loads((described / "delivery.json").read_text(encoding="utf-8"))
    (entry,) = result["inputs"]
    commit = json.loads((described / "sources.json").read_text(encoding="utf-8"))["sources"][0]["commit"]
    assert entry == {"id": "demo", "url": None, "pin": "head", "release": None, "commit": commit, "license": "MIT",
                     "paths": ["SKILL.md", "references"],
                     "became": {"capability": 1, "always-on": 1, "hook": 0, "mcp-server": 0, "dropped": 2}}
    for item in result["inputs"]:
        counted = {form: sum(1 for d in delivery["decisions"] if d["source"] == item["id"] and d["form"] == form)
                   for form in ("capability", "always-on", "hook", "mcp-server", "dropped")}
        assert item["became"] == counted        # and no field carries the local checkout path: the entry is exactly the above


def test_an_input_from_a_public_repository_shows_its_address_and_release(tmp_path, described, cache):
    manifest = json.loads((described / "sources.json").read_text(encoding="utf-8"))
    manifest["sources"][0].pop("repo_path")
    manifest["sources"][0].update(repo_url="https://example.invalid/demo.git", pin="release", release="v1.2.0")
    (described / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    result, _ = info_of(tmp_path, described, cache)
    assert result["inputs"][0]["url"] == "https://example.invalid/demo.git"
    assert (result["inputs"][0]["pin"], result["inputs"][0]["release"]) == ("release", "v1.2.0")


def test_the_graph_is_the_guides_data_not_a_second_computation(tmp_path, described, cache):
    result, mp = info_of(tmp_path, described, cache)
    folder = project.cached(mp, tmp_path / "kept")
    manifest = json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    data = guide.guide_data(folder, manifest["plugin"], manifest["sources"], packaged=False)
    assert result["graph"]["capabilities"] == data["capabilities"]
    assert result["graph"]["examples"] == data["examples"]
    (capability,) = result["graph"]["capabilities"]
    assert capability["id"] == "x" and capability["title"] == "x"        # no heading in the body: the id
    assert [intent["id"] for intent in capability["intents"]] == ["testing.verify"]
    assert capability["checks"] == ["ok"] and capability["outputs"] == ["x"] and "Source: demo" in capability["body"]
    (example,) = result["graph"]["examples"]
    assert example["path"] == ["x"] and example["steps"] == [{"step": "x", "capability": "x", "intent": "testing.verify"}]


def test_the_graph_names_its_entries_with_what_they_absorb(tmp_path, described, cache):
    result, _ = info_of(tmp_path, described, cache)
    (entry,) = result["graph"]["entries"]
    assert entry["name"] == "tester-main" and entry["capabilities"] == ["x"]
    assert entry["description"] == entry_description(ENTRY)               # what a host reads, built the way the build does
    assert entry["description"].startswith("Use when testing the tester.") and "old-tester" in entry["description"]


def test_a_package_without_entries_has_none(tmp_path, package, cache):
    result, _ = info_of(tmp_path, package, cache)
    assert result["graph"]["entries"] == []
    assert [item["id"] for item in result["graph"]["capabilities"]] == ["x"]
    assert result["graph"]["examples"][0]["status"] == "no_match" and result["graph"]["examples"][0]["steps"] == []


def test_the_prompts_are_the_packages_own_and_else_the_factorys(tmp_path, described, cache):
    own = (described / "prompts" / "harmonizer.md")
    own.write_text(own.read_text(encoding="utf-8") + "\nA line only this package has.\n", encoding="utf-8")
    result, _ = info_of(tmp_path, described, cache)
    assert [item["file"] for item in result["prompts"]] == list(PROMPT_FILES)
    assert {item["file"]: item["text"] for item in result["prompts"]} == {
        name: (described / "prompts" / name).read_text(encoding="utf-8") for name in PROMPT_FILES}
    assert "A line only this package has." in result["prompts"][1]["text"]

    shutil.rmtree(described / "prompts")
    (tmp_path / "t.mp").unlink()
    result, _ = info_of(tmp_path, described, cache)
    assert {item["file"]: item["text"] for item in result["prompts"]} == {
        name: (ROOT / "prompts" / name).read_text(encoding="utf-8") for name in PROMPT_FILES}


def test_info_of_a_package_with_a_partial_prompts_folder_says_which_is_missing(tmp_path, package, cache):
    (package / "prompts" / "classify.md").unlink()
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)     # packing does not build, so it packs
    with pytest.raises(OSError, match="classify.md"):
        project.info(mp, tmp_path / "kept")


def test_the_file_list_follows_the_mockup_with_the_projects_numbers(tmp_path, described, cache, release):
    result, _ = info_of(tmp_path, described, cache, release_dir=release)
    rows = {row["part"]: row for row in result["files"]}
    assert list(rows) == FILE_PARTS and all(set(row) == {"part", "path", "detail"} for row in result["files"])
    detail = {part: row["detail"] for part, row in rows.items()}
    assert detail["Identity"] == "The final plugin: Tester, installed as tester, version 0.1.0"
    assert detail["Author and dates"] == "someone · created 2026-11-10 · last changed 2026-11-20"
    assert detail["Repository"] == ("https://example.invalid/tester · branch main · releases tagged tester-v<version>")
    assert detail["Inputs"].startswith("1 plugin or skill set composes it: ")
    assert detail["Choices"].startswith("5 decisions: ")        # demo: 1 capability, 1 always-on, 2 dropped; rules.md: 1
    assert detail["Result"] == "1 capability in 1 entry, the router and 1 documented request"
    assert detail["Your instructions"] == "rules.md"
    assert detail["History"].startswith("1 run: ")
    assert detail["Decision records"].startswith("1 record: ")
    assert detail["Built plugin"] == "Ready to install on every harness, with its guide"
    assert rows["Identity"]["path"] == "sources.json · plugin"
    assert rows["Result"]["path"] == "capabilities/ · ROUTER.md · entries.json · guide-examples.json"
    assert rows["Built plugin"]["path"] == "release/" and rows["Input copies"]["path"] == "inputs/"
    assert rows["Choices"]["path"] == "delivery.json" and rows["History"]["path"] == "history.json"
    assert rows["Changelog"]["path"] == "CHANGELOG.md" and rows["Decision records"]["path"] == "records.json"
    assert rows["Author and dates"]["path"] == "project.json · author, created, changed"
    assert rows["Repository"]["path"] == "project.json · repository"


def test_the_file_list_of_a_project_not_yet_harmonized_or_built_says_so(tmp_path, package, cache):
    (package / "delivery.json").unlink()
    (package / "custom-instructions" / "rules.md").unlink()
    (package / "records.json").write_text('{"records": []}', encoding="utf-8")
    repository_free = json.loads((package / "project.json").read_text(encoding="utf-8"))
    repository_free["repository"] = None
    (package / "project.json").write_text(json.dumps(repository_free), encoding="utf-8")
    result, _ = info_of(tmp_path, package, cache)
    detail = {row["part"]: row["detail"] for row in result["files"]}
    assert detail["Repository"] == "None set: the project lives on this computer only"
    assert detail["Choices"] == detail["Decision records"] == "Written by the first harmonization"
    assert detail["Built plugin"] == "Built by the first harmonization"
    assert detail["Your instructions"] == "None yet"
    assert detail["History"].startswith("0 runs: ")


def without(mp, name, out):
    """The project file with one member left out, as a stranger's incomplete one."""
    with zipfile.ZipFile(mp) as source, zipfile.ZipFile(out, "w") as target:
        for info in source.infolist():
            if info.filename != name:
                target.writestr(info, source.read(info.filename))
    return out


@pytest.mark.parametrize("member", ["project.json", "records.json", "history.json", "CHANGELOG.md", "sources.json"])
def test_info_refuses_a_project_file_that_lacks_a_member_the_page_reads(tmp_path, package, cache, member):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    with pytest.raises((ValueError, OSError), match=member):
        project.info(without(mp, member, tmp_path / "x.mp"), tmp_path / "kept")


def test_info_refuses_a_project_file_that_does_not_describe_itself_right(tmp_path, package, cache):
    (package / "records.json").write_text('{"records": []}', encoding="utf-8")
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    with zipfile.ZipFile(mp) as source:
        members = {info.filename: source.read(info.filename) for info in source.infolist() if info.filename != "mimetype"}

    def stranger(**changes):
        data = {**members, **{name: value.encode("utf-8") for name, value in changes.items()}}
        path = tmp_path / f"s{len(list(tmp_path.glob('s*.mp')))}.mp"
        return crafted(path, [(name, value) for name, value in data.items()])

    bad_project = json.dumps({**PROJECT_JSON, "schema": 2})
    with pytest.raises(ValueError, match="project.json is not valid"):
        project.info(stranger(**{"project.json": bad_project}), tmp_path / "k1")
    with pytest.raises(ValueError, match="records.json"):
        project.info(stranger(**{"records.json": '{"records": 3}'}), tmp_path / "k2")
    with pytest.raises(ValueError, match="history.json"):
        project.info(stranger(**{"history.json": "[]"}), tmp_path / "k3")
    manifest = json.loads(members["sources.json"])
    manifest["plugin"]["version"] = ""
    with pytest.raises(ValueError, match=r"Invalid plugin.*plugin.version"):
        project.info(stranger(**{"sources.json": json.dumps(manifest)}), tmp_path / "k4")
    manifest = json.loads(members["sources.json"])
    manifest["sources"][0]["license"] = "GPL-3.0"
    with pytest.raises(ValueError, match="license must be MIT or Apache-2.0"):
        project.info(stranger(**{"sources.json": json.dumps(manifest)}), tmp_path / "k5")


MIB = 1024 ** 2


def test_info_reads_no_text_member_larger_than_sixteen_mebibytes_and_names_it(tmp_path, package, cache):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    assert (project.MAX_TEXT, project.MAX_READ) == (16 * MIB, 256 * MIB)
    for name in ("CHANGELOG.md", "capabilities/huge.md", "records.json", "custom-instructions/rules.md", "prompts/classify.md"):
        huge = with_members(mp, tmp_path / "big.mp", {name: b"x" * (16 * MIB + 1)})
        with pytest.raises(ValueError, match=rf"{name.replace('.', '[.]')} is larger than 16 MiB"):
            project.info(huge, tmp_path / "kept")
    # exactly the limit is not over it
    exact = with_members(mp, tmp_path / "exact.mp", {"CHANGELOG.md": b"x" * (16 * MIB)})
    assert project.info(exact, tmp_path / "kept")["changelog"] == "x" * (16 * MIB)


def test_a_list_of_projects_shows_a_file_with_a_huge_member_as_an_error_not_a_crash(tmp_path, package, cache):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    huge = with_members(mp, tmp_path / "big.mp", {"CHANGELOG.md": b"x" * (16 * MIB + 1)})
    assert project.summary(huge, tmp_path / "kept") == {"error": "CHANGELOG.md is larger than 16 MiB"}


def test_info_stops_when_the_files_it_reads_add_up_to_more_than_the_total(tmp_path, package, cache, monkeypatch):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    monkeypatch.setattr(project, "MAX_READ", 2 * MIB)
    assert project.info(mp, tmp_path / "kept")["changelog"] == "# Changelog\n", "an ordinary project is far below it"
    members = {"CHANGELOG.md": b"x" * MIB, "capabilities/a.md": b"y" * MIB, "custom-instructions/more.md": b"z" * MIB}
    wide = with_members(mp, tmp_path / "wide.mp", members)
    with pytest.raises(ValueError, match="add up to more than 2 MiB"):
        project.info(wide, tmp_path / "kept")
    assert "add up to more than 2 MiB" in project.summary(wide, tmp_path / "kept")["error"]


def test_what_info_never_reads_does_not_count_against_it(tmp_path, package, cache):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    # the inputs and the release are carried, not read by info: a large copy of a source is no reason to refuse the project
    big = with_members(mp, tmp_path / "big.mp", {"inputs/demo/big.bin": b"0" * (17 * MIB), f"release/{SLUG}/big.bin": b"0" * (17 * MIB)})
    assert project.info(big, tmp_path / "kept")["plugin"]["slug"] == SLUG


# --- the guide's data model: one function, used by the page and by the project view ---------------------

def test_the_guide_page_carries_exactly_the_data_guide_data_returns(portable_project):
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))
    data = guide.guide_data(portable_project, manifest["plugin"], manifest["sources"])
    _, parsed = read_guide(guide.write_release_guide(portable_project, manifest["plugin"], manifest["sources"]))
    payload = parsed.payload
    for key in ("plugin", "capabilities", "sources", "catalog_digest", "examples"):
        assert payload[key] == data[key], key
    assert "generated_at" in payload and "generated_at" not in data      # the time belongs to the rendered page
    assert "delivery" not in payload and "i18n" in payload and "graph_library" in payload
    assert data["capabilities"][0]["title"] == "x" and data["capabilities"][0]["body"]
    assert data["delivery"] is None                                      # this fixture declares no delivery


def test_guide_data_reads_the_real_marionette_package_as_a_package_folder():
    package = ROOT / "examples" / "marionette"
    manifest = json.loads((package / "sources.json").read_text(encoding="utf-8"))
    data = guide.guide_data(package, manifest["plugin"], manifest["sources"], packaged=False)
    assert [cap["id"] for cap in data["capabilities"]] == [row.id for row in parse_router(package / "ROUTER.md")]
    assert data["delivery"] == json.loads((package / "delivery.json").read_text(encoding="utf-8"))
    assert len(data["examples"]) == len(json.loads((package / "guide-examples.json").read_text(encoding="utf-8"))["examples"])
    assert [source["id"] for source in data["sources"]] == [source["id"] for source in manifest["sources"]]
    assert all("repo_path" not in source for source in data["sources"])


# --- the subcommands --------------------------------------------------------------------------------

def test_project_subcommands_pack_unpack_and_info(tmp_path, package, release, cache, capsys):
    mp = tmp_path / "out" / "t.mp"
    assert main(["project", "pack", "--manifest", str(package / "sources.json"), "--out", str(mp),
                 "--sources-cache", str(cache), "--release", str(release)]) == 0
    assert capsys.readouterr().out.strip() == str(mp)
    assert names(mp)[0] == "mimetype"

    assert main(["project", "unpack", str(mp), "--out", str(tmp_path / "un")]) == 0
    assert capsys.readouterr().out.strip() == str(tmp_path / "un")
    assert (tmp_path / "un" / "release" / SLUG / "GUIDE.html").is_file()

    assert main(["project", "info", str(mp), "--cache", str(tmp_path / "cache")]) == 0
    shown = json.loads(capsys.readouterr().out)
    assert shown["project"]["slug"] == SLUG and set(shown) == INFO_KEYS
    assert [cap["id"] for cap in shown["graph"]["capabilities"]] == ["x"]


def test_project_subcommands_report_failures_on_stderr_with_exit_1(tmp_path, package, capsys):
    stranger = tmp_path / "x.mp"
    stranger.write_bytes(b"not a zip")
    assert main(["project", "unpack", str(stranger), "--out", str(tmp_path / "o")]) == 1
    assert "Not a Muro project file" in capsys.readouterr().err
    assert main(["project", "info", str(stranger), "--cache", str(tmp_path / "c")]) == 1
    assert "Not a Muro project file" in capsys.readouterr().err
    assert main(["project", "info", str(tmp_path / "none.mp"), "--cache", str(tmp_path / "c")]) == 1
    assert capsys.readouterr().err.strip()
    (package / "project.json").unlink()
    assert main(["project", "pack", "--manifest", str(package / "sources.json"), "--out", str(tmp_path / "t.mp")]) == 1
    assert "project.json" in capsys.readouterr().err
    assert main(["project", "pack", "--manifest", str(tmp_path / "missing" / "sources.json"),
                 "--out", str(tmp_path / "t.mp")]) == 1
    assert "Manifest not found" in capsys.readouterr().err
    assert not (tmp_path / "t.mp").exists()


# --- info --summary: what the projects list shows, without the capability bodies ----------------------

COUNTS = ("inputs", "capabilities", "entries", "examples", "records", "runs")
SUMMARY_KEYS = {"project", "plugin", "digest", *COUNTS}


def test_summary_is_the_identity_and_the_counts_and_none_of_the_content(tmp_path, described, cache):
    full, mp = info_of(tmp_path, described, cache)
    shown = project.summary(mp, tmp_path / "kept")
    assert set(shown) == SUMMARY_KEYS
    assert shown["project"] == PROJECT_JSON
    assert shown["plugin"] == {"name": "Tester", "slug": SLUG, "version": "0.1.0"}
    assert {key: shown[key] for key in COUNTS} == {"inputs": 1, "capabilities": 1, "entries": 1, "examples": 1,
                                                    "records": 1, "runs": 1}
    assert shown["digest"] == project.digest(mp) == full["digest"]
    # the counts are the full info's own, not a second computation
    assert {key: shown[key] for key in COUNTS} == {
        "inputs": len(full["inputs"]), "capabilities": len(full["graph"]["capabilities"]),
        "entries": len(full["graph"]["entries"]), "examples": len(full["graph"]["examples"]),
        "records": len(full["records"]), "runs": len(full["history"])}
    assert "Source: demo" not in json.dumps(shown)        # a capability body is what makes the full info large


def test_summary_of_a_project_without_entries_counts_none(tmp_path, package, cache):
    shown = project.summary(project.pack(package, tmp_path / "t.mp", sources_cache=cache), tmp_path / "kept")
    assert shown["entries"] == 0 and shown["capabilities"] == 1


def test_summary_of_a_file_that_is_missing_or_invalid_is_an_error_not_a_failure(tmp_path, package, cache):
    stranger = tmp_path / "stranger.mp"
    stranger.write_bytes(b"not a zip")
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    cases = {
        "missing": tmp_path / "none.mp",
        "not a zip": stranger,
        "lacks a member": without(mp, "records.json", tmp_path / "incomplete.mp"),
    }
    for what, path in cases.items():
        shown = project.summary(path, tmp_path / "kept")
        assert set(shown) == {"error"}, what
        assert isinstance(shown["error"], str) and shown["error"], what
    assert "records.json" in project.summary(cases["lacks a member"], tmp_path / "kept")["error"]
    assert "Not a Muro project file" in project.summary(stranger, tmp_path / "kept")["error"]


def test_summary_subcommand_prints_the_summary_and_exits_0_even_for_a_bad_file(tmp_path, described, cache, capsys):
    mp = project.pack(described, tmp_path / "t.mp", sources_cache=cache)
    assert main(["project", "info", str(mp), "--summary", "--cache", str(tmp_path / "c")]) == 0
    shown = json.loads(capsys.readouterr().out)
    assert set(shown) == SUMMARY_KEYS and shown["plugin"]["slug"] == SLUG
    assert main(["project", "info", str(tmp_path / "none.mp"), "--summary", "--cache", str(tmp_path / "c")]) == 0
    assert set(json.loads(capsys.readouterr().out)) == {"error"}
    # without --summary a bad file still fails with its reason on stderr
    assert main(["project", "info", str(tmp_path / "none.mp"), "--cache", str(tmp_path / "c")]) == 1
    assert capsys.readouterr().err.strip()
