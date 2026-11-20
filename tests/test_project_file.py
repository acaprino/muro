"""The `.mp` project file: one zip that carries a package, its inputs and its release (ADR-0028).

A `.mp` from elsewhere is untrusted input, so most of these tests are about what unpacking refuses.
"""
import json
import os
import stat
import subprocess
import zipfile
from pathlib import Path

import pytest

from muro import project
from muro.cli import main
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts
from test_custom_instructions import deliver
from test_regressions import MIT

SLUG = "tester"
PROJECT_JSON = {
    "schema": 1, "name": "Tester", "slug": SLUG, "version": "0.1.0", "author": "someone",
    "created": "2026-11-10T09:00:00Z", "changed": "2026-11-20T10:30:00+00:00",
    "repository": {"url": "https://example.invalid/tester", "branch": "main", "tag_prefix": "tester-v"},
    "builtin": False,
}
# What a package folder holds that travels in a `.mp`, and what it must not take along.
CARRIED = ["sources.json", "delivery.json", "ROUTER.md", "project.json", "records.json", "history.json", "CHANGELOG.md",
           "guide-examples.json", "capabilities/x.md", "custom-instructions/rules.md", "prompts/intake.md"]
LEFT_OUT = ["notes.txt", ".muro/factory/PROMPT.md", "dist/old.txt"]


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
    (pkg / "capabilities" / "x.md").write_text(
        "---\n" + INTENTS + 'id: x\nrole: testing\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: ["ok"]\n---\n'
        "## Sources\nSource: demo\n", encoding="utf-8")
    (pkg / "ROUTER.md").write_text(ROUTER_HEADER + "| x | testing | — | — | x | testing.verify |\n", encoding="utf-8")
    copy_prompts(pkg)
    for stale in sorted((pkg / "prompts").iterdir()):
        if stale.name != "intake.md":
            stale.unlink()
    (pkg / "custom-instructions").mkdir()
    (pkg / "custom-instructions" / "rules.md").write_bytes(b"Owner rules\r\nwith CRLF kept\r\n")
    manifest = {"plugin": {"slug": SLUG, "name": "Tester", "command": "tester", "version": "0.1.0"},
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


@pytest.fixture
def release(tmp_path):
    """What `--build --out <dir>` lays out: `<dir>/<slug>/...`."""
    out = tmp_path / "staged"
    (out / SLUG / "adapters" / "claude-code").mkdir(parents=True)
    (out / SLUG / "adapters" / "claude-code" / "INSTALL.md").write_text("# Install\n", encoding="utf-8")
    (out / SLUG / "GUIDE.html").write_text("<html></html>", encoding="utf-8")
    return out


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
    for path in ("adapters/claude-code/INSTALL.md", "GUIDE.html"):
        assert (folder / "release" / SLUG / path).read_bytes() == (release / SLUG / path).read_bytes()
    found = {p.relative_to(folder).as_posix() for p in folder.rglob("*") if p.is_file()}
    assert found == set(CARRIED) | {"inputs/demo/LICENSE", "inputs/demo/SKILL.md", "inputs/demo/references/guide.md",
                                    f"release/{SLUG}/adapters/claude-code/INSTALL.md", f"release/{SLUG}/GUIDE.html"}


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


def test_pack_takes_a_prepared_cache_for_a_source_it_cannot_reach(tmp_path, package):
    manifest = json.loads((package / "sources.json").read_text(encoding="utf-8"))
    manifest["sources"][0].pop("repo_path")
    manifest["sources"][0]["repo_url"] = "https://invalid.invalid/never-fetched.git"
    (package / "sources.json").write_text(json.dumps(manifest), encoding="utf-8")
    commit = manifest["sources"][0]["commit"]
    snapshot = tmp_path / "cache" / "demo" / commit
    (snapshot / "references").mkdir(parents=True)
    (snapshot / "SKILL.md").write_text("# Prepared\n", encoding="utf-8")
    (snapshot / "LICENSE").write_text(MIT, encoding="utf-8")
    folder = project.unpack(project.pack(package, tmp_path / "t.mp", sources_cache=tmp_path / "cache"), tmp_path / "out")
    assert (folder / "inputs" / "demo" / "SKILL.md").read_text(encoding="utf-8") == "# Prepared\n"


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


# --- info (what Task 2 extends) ---------------------------------------------------------------------

def test_info_reads_the_project_through_the_cache(tmp_path, package, cache):
    mp = project.pack(package, tmp_path / "t.mp", sources_cache=cache)
    result = project.info(mp, tmp_path / "kept")
    assert result["project"] == PROJECT_JSON
    assert result["digest"] == project.digest(mp)
    assert (tmp_path / "kept" / result["digest"] / "project.json").is_file()


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
    assert json.loads(capsys.readouterr().out)["project"]["slug"] == SLUG


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
