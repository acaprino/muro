# muro/project_work.py
"""Writing a `.mp` project file: a new project, a mechanical edit, and the commit after an AI run (ADR-0032).

The format and its reading are `project.py`'s; this module only writes through it. Three operations:

- `new_workspace`: the folder a new project starts from: `project.json`, empty `records.json`, `history.json` and
  `CHANGELOG.md`. The package itself (`sources.json`, capabilities, router, delivery) is the host AI's to write:
  intake and harmonization are never Python's.
- `edit`: what a person changes by hand and no AI judges: the project's name, author and repository, the
  decision records and the changelog. The file is repacked offline from its own copies of the inputs and with
  its own release (the package is unchanged, so the release still is its build), and replaced only while it is
  still the file the edit was asked on.
- `commit`: after the host AI changed a checked-out project (or wrote a new one), the factory builds the
  package, appends the run to `history.json`, writes the changelog entry (the AI's summary, then the
  mechanical differences Python counts), moves the version, packs the file with its release and puts it in
  place: guarded by the digest of the file it was checked out from, or refusing to overwrite a new one. What
  ADR-0032 leaves to the desktop is never taken from the folder the AI wrote: `project.json`, `history.json` and
  the old `CHANGELOG.md` come from the file, the plugin id is the file's (or the one a new project was started
  with), and the decision records are held to `check_run_records`.

A commit or an edit works in a scratch folder beside the project file and writes its new file there before
putting it in place; one that is killed leaves them behind, and the next one beside that file removes them
(`_sweep`). Python counts and checks here; what a change means stays the AI's text.
"""
from __future__ import annotations

import contextlib
import json
import os
import re
import secrets
import shutil
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import project
from .core import SLUG_PATTERN, is_device_name
from .custom_instructions import DIRECTORY as CUSTOM_INSTRUCTIONS
from .sources import parse_capabilities

BUMPS = ("patch", "minor", "major", "none")
AUTHORS = ("muro", "you")
_VERSION = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_RECORD_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
# What a person may type in one field of the project: a name, an author, an address, a branch.
_MAX_FIELD = project.MAX_FIELD
_MAX_RECORD = 20_000
_MAX_CHANGELOG = 1024 ** 2
_KEEP = object()
CHANGED = "The project file changed since it was opened: open it again and repeat the change"
# The scratch folders of a commit and of an edit, made beside the project file, and the file in each that the
# process using it keeps locked: what `_sweep` leaves alone while its process lives.
_SCRATCH_PREFIXES = (".muro-commit-", ".muro-edit-")
_HELD = ".muro-held"
# How old what an earlier commit or edit left beside a project file must be before the next one removes it.
_LEFTOVER_AGE = 60.0


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _write_json(path: Path, document: Any) -> None:
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _text(value: Any, what: str, *, empty: bool = False) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{what} must be text")
    value = value.strip()
    if not value and not empty:
        raise ValueError(f"{what} is required")
    if len(value) > _MAX_FIELD or any(ord(char) < 32 for char in value):
        raise ValueError(f"{what} must be one line of at most {_MAX_FIELD} characters")
    return value


def repository(url: Any, branch: Any, tag_prefix: Any) -> dict[str, str]:
    """The `repository` of `project.json`: an https address of a Git repository, its branch and the prefix of its tags."""
    url = _text(url, "The repository address")
    if not url.startswith("https://") or " " in url:
        raise ValueError("The repository address must be an https:// address")
    return {"url": url, "branch": _text(branch or "main", "The branch"),
            "tag_prefix": _text(tag_prefix if tag_prefix is not None else "", "The tag prefix", empty=True)}


def bump(version: str, step: str) -> str:
    """The version after a `patch`, `minor` or `major` step (`none` keeps it). Versions are `X.Y.Z`."""
    match = _VERSION.fullmatch(version or "")
    if not match:
        raise ValueError(f"The plugin's version {version!r} is not X.Y.Z")
    if step not in BUMPS:
        raise ValueError(f"The version step must be one of {', '.join(BUMPS)}")
    major, minor, patch = (int(part) for part in match.groups())
    if step == "major":
        return f"{major + 1}.0.0"
    if step == "minor":
        return f"{major}.{minor + 1}.0"
    if step == "patch":
        return f"{major}.{minor}.{patch + 1}"
    return version


# --- a new project ------------------------------------------------------------------------------------

def new_workspace(folder: Path, *, name: str, slug: str, author: str,
                  repo: dict[str, str] | None = None, version: str = "0.1.0") -> Path:
    """The folder a new project starts from, before any AI work: its `project.json` and the empty records, history
    and changelog. `folder` must be new or empty; the package files are the host AI's to write."""
    folder = Path(folder)
    if folder.exists() and (not folder.is_dir() or any(folder.iterdir())):
        raise ValueError(f"{folder} already exists: a new project starts in a new folder")
    if not isinstance(slug, str) or not SLUG_PATTERN.fullmatch(slug):
        raise ValueError("The plugin id must be a kebab-case slug such as my-plugin")
    if is_device_name(slug):
        raise ValueError(f"The plugin id {slug} is a name Windows keeps for a device: choose another")
    if not _VERSION.fullmatch(version):
        raise ValueError(f"The first version {version!r} is not X.Y.Z")
    now = _now()
    meta = {"schema": 1, "name": _text(name, "The project name"), "slug": slug, "version": version,
            "author": _text(author, "The author"), "created": now, "changed": now, "repository": repo,
            "builtin": False}
    folder.mkdir(parents=True, exist_ok=True)
    _write_json(folder / "project.json", meta)
    _write_json(folder / "records.json", {"records": []})
    _write_json(folder / "history.json", {"runs": []})
    (folder / "CHANGELOG.md").write_text("", encoding="utf-8")
    return folder


# --- the inputs a file already carries ----------------------------------------------------------------

def seed_cache(unpacked: Path, cache: Path) -> list[str]:
    """Fill a pack's sources cache from the copies of the inputs an unpacked project carries (`inputs/<id>/`), each
    stamped for its source as `sources.json` declares it there. A source whose pin or selection is later changed
    no longer matches its stamp and is fetched again; the others repack without the network. Returns the ids."""
    manifest = _read_json(unpacked / "sources.json")
    seeded = []
    for src in manifest.get("sources", []):
        if not isinstance(src, dict) or not isinstance(src.get("id"), str) or not isinstance(src.get("commit"), str):
            continue
        copy = unpacked / "inputs" / src["id"]
        if not copy.is_dir():
            continue
        folder, _stamp = project._entry(cache, src)
        if project._current(cache, src):
            seeded.append(src["id"])
            continue
        if folder.exists():
            shutil.rmtree(folder)
        folder.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(copy, folder)
        project._seal(cache, src)
        seeded.append(src["id"])
    return seeded


def _replace(out: Path, built: Path, expect_digest: str | None) -> None:
    """Put `built` at `out`: over the file only while it is still the one with `expect_digest`, or where there is none.

    On Windows a program that holds the file for a moment (an antivirus scan, a sync client) does not fail it
    (`project.replace_file`); once the file is in place nothing that follows can fail the operation."""
    if expect_digest is None:
        try:
            os.link(built, out)          # never over a file that appeared in the meantime
        except FileExistsError:
            raise ValueError(f"{out} already exists: choose another name for the new project") from None
        except OSError:
            if out.exists():
                raise ValueError(f"{out} already exists: choose another name for the new project") from None
            project.replace_file(built, out)
            return
        _discard(built)
        return
    if not out.is_file() or project.digest(out) != expect_digest:
        raise ValueError(CHANGED)
    project.replace_file(built, out)


def _discard(path: Path) -> None:
    """Remove a temporary file, if it is there and can be: one left behind is the next run's to sweep."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _temporary(out: Path) -> Path:
    return out.parent / f".{out.name}.{secrets.token_hex(4)}.tmp"


# --- what a killed commit or edit leaves beside the project file -----------------------------------------

def _try_lock(fd: int) -> bool:
    """Lock the first byte of an open file for this handle alone, without waiting: False when another holds it."""
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


def _unlock(fd: int) -> None:
    try:
        os.lseek(fd, 0, os.SEEK_SET)
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_UN)
    except OSError:
        pass


@contextlib.contextmanager
def _scratch(prefix: str, parent: Path | None) -> Iterator[Path]:
    """A scratch folder beside the project file, held (its `_HELD` file locked) for as long as this process uses it.

    The system ends the lock with the process, so a commit or an edit that is killed leaves an unheld folder, which
    the next one beside that file removes (`_sweep`); a live one's is never taken from under it, however long its
    build runs. Removing the folder at the end never fails the operation: the file is in place by then.
    """
    with tempfile.TemporaryDirectory(prefix=prefix, dir=parent, ignore_cleanup_errors=True) as folder:
        folder = Path(folder)
        fd = os.open(folder / _HELD, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            _try_lock(fd)
            try:
                yield folder
            finally:
                _unlock(fd)
        finally:
            os.close(fd)


def _held(folder: Path) -> bool:
    """Whether a live commit or edit holds this scratch folder. One without the file is from before the file existed."""
    try:
        fd = os.open(folder / _HELD, os.O_RDWR)
    except FileNotFoundError:
        return False
    except OSError:
        return True                 # it cannot be told: leave it
    try:
        if _try_lock(fd):
            _unlock(fd)
            return False
        return True
    finally:
        os.close(fd)


def _sweep(parent: Path, name: str) -> None:
    """Remove what an earlier commit or edit of the project file `name` in `parent` left there when it was killed.

    Its scratch folders (`.muro-commit-*`, `.muro-edit-*`) that no live process holds, and the temporary files of that
    project file: `.<name>.<hex>.tmp` (`_temporary`) and the one `project.pack` writes it through,
    `..<name>.<hex>.tmp.<hex>.tmp`. Only these names, and only what is older than `_LEFTOVER_AGE`; best effort.
    """
    escaped = re.escape(name)
    temporary = re.compile(rf"\.{escaped}\.[0-9a-f]{{8}}\.tmp|\.\.{escaped}\.[0-9a-f]{{8}}\.tmp\.[0-9a-f]{{8}}\.tmp")
    now = time.time()
    try:
        entries = list(os.scandir(parent))
    except OSError:
        return
    for entry in entries:
        path = Path(entry.path)
        try:
            if now - os.stat(path, follow_symlinks=False).st_mtime < _LEFTOVER_AGE:
                continue
            if entry.name.startswith(_SCRATCH_PREFIXES) and entry.is_dir(follow_symlinks=False):
                if not _held(path):
                    shutil.rmtree(path, ignore_errors=True)
            elif temporary.fullmatch(entry.name) and entry.is_file(follow_symlinks=False):
                path.unlink()
        except OSError:
            continue


def _checked_out(mp: Path, expect_digest: str, scratch: Path) -> Path:
    mp = Path(mp)
    if not mp.is_file():
        raise ValueError(f"The project file is missing: {mp}")
    if project.digest(mp) != expect_digest:
        raise ValueError(CHANGED)
    return project.unpack(mp, scratch / "project")


# --- what a person edits by hand ----------------------------------------------------------------------

def check_records(records: Any) -> list[dict[str, Any]]:
    """The decision records as `records.json` holds them, each `{id, date, subjects, text, author, binding}`."""
    if not isinstance(records, list):
        raise ValueError("The records must be a list")
    seen: set[str] = set()
    checked = []
    for index, record in enumerate(records, 1):
        if not isinstance(record, dict):
            raise ValueError(f"Record {index} must be an object")
        rid = record.get("id")
        if not isinstance(rid, str) or not _RECORD_ID.fullmatch(rid):
            raise ValueError(f"Record {index} needs an id of letters, digits, dots, dashes or underscores")
        if rid in seen:
            raise ValueError(f"Two records have the id {rid}")
        seen.add(rid)
        date = record.get("date")
        if not isinstance(date, str) or not _DATE.fullmatch(date):
            raise ValueError(f"Record {rid} needs a date as YYYY-MM-DD")
        try:
            datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise ValueError(f"Record {rid} needs a real date") from None
        subjects = record.get("subjects", [])
        if not isinstance(subjects, list) or not all(isinstance(s, str) and s.strip() for s in subjects):
            raise ValueError(f"Record {rid}: subjects must be a list of names")
        text = record.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"Record {rid} needs a text")
        if len(text) > _MAX_RECORD:
            raise ValueError(f"Record {rid} is longer than {_MAX_RECORD} characters")
        if record.get("author") not in AUTHORS:
            raise ValueError(f"Record {rid}: the author is muro or you")
        if type(record.get("binding")) is not bool:
            raise ValueError(f"Record {rid}: binding must be true or false")
        checked.append({"id": rid, "date": date, "subjects": [s.strip() for s in subjects], "text": text.strip(),
                        "author": record["author"], "binding": record["binding"]})
    return checked


def _owners(record: Any) -> bool:
    """Whether a record is the owner's to change: one they wrote (author `you`) or one that binds every run."""
    return isinstance(record, dict) and (record.get("author") != "muro" or record.get("binding") is not False)


def check_run_records(before: list, after: list) -> None:
    """Refuse what an AI run did to the decision records that only the owner may do (ADR-0032), by hand (`edit`).

    `before` is the list the project file holds, `after` the one the run left. A record the owner wrote (author
    `you`) or that binds (`binding: true`) is kept exactly as it was: not removed, not changed. A record the run
    wrote or changed is a record (`check_records`) of author `muro` that does not bind: a run never makes one
    binding, never writes one as the owner's. A record the run left as it was is not checked again.
    """
    if not isinstance(after, list):
        raise ValueError("The records must be a list")
    previous = {record["id"]: record for record in before
                if isinstance(record, dict) and isinstance(record.get("id"), str)}
    ids = [record["id"] for record in after if isinstance(record, dict) and isinstance(record.get("id"), str)]
    for rid in ids:
        if ids.count(rid) > 1:
            raise ValueError(f"Two records have the id {rid}")
    written = [record for record in after
               if not (isinstance(record, dict) and isinstance(record.get("id"), str) and previous.get(record["id"]) == record)]
    check_records(written)
    kept = {record["id"]: record for record in after if isinstance(record, dict) and isinstance(record.get("id"), str)}
    for rid, record in previous.items():
        if _owners(record) and kept.get(rid) != record:
            raise ValueError(f"The AI removed or changed the record {rid}, which is the owner's (author you, or binding): "
                             "only the owner changes it, by hand")
    for record in written:
        if _owners(record):
            raise ValueError(f"The AI wrote the record {record['id']} as the owner's or as binding: a run writes only "
                             "records of author muro that do not bind")


def edit(mp: Path, *, expect_digest: str, name: Any = _KEEP, author: Any = _KEEP, repo: Any = _KEEP,
         records: Any = _KEEP, changelog: Any = _KEEP) -> dict[str, Any]:
    """Change what a person owns in a project file, without an AI and without the network.

    `name` and `author` are `project.json`'s; `repo` is its `repository` (`None` takes it away); `records` the whole
    list of `records.json`; `changelog` the text of `CHANGELOG.md`. The package is not touched, so the file's own
    release is still its build and travels as it is; the inputs come from the file's own copies (`seed_cache`).
    The file is replaced only while it still has `expect_digest`. Returns `{path, digest}`.
    """
    mp = Path(mp)
    _sweep(mp.parent, mp.name)
    with _scratch(".muro-edit-", mp.parent) as scratch:
        folder = _checked_out(mp, expect_digest, scratch)
        meta = _read_json(folder / "project.json")
        if name is not _KEEP:
            meta["name"] = _text(name, "The project name")
        if author is not _KEEP:
            meta["author"] = _text(author, "The author")
        if repo is not _KEEP:
            meta["repository"] = None if repo is None else repository(repo.get("url"), repo.get("branch"), repo.get("tag_prefix"))
        meta["changed"] = _now()
        _write_json(folder / "project.json", meta)
        if records is not _KEEP:
            _write_json(folder / "records.json", {"records": check_records(records)})
        if changelog is not _KEEP:
            if not isinstance(changelog, str) or len(changelog.encode("utf-8")) > _MAX_CHANGELOG:
                raise ValueError("The changelog must be text of at most 1 MiB")
            (folder / "CHANGELOG.md").write_text(changelog if not changelog or changelog.endswith("\n") else changelog + "\n",
                                                 encoding="utf-8")
        cache = scratch / "sources"            # this file's own copies only: never a cache other projects read
        seed_cache(folder, cache)
        release = folder / "release"
        built = _temporary(mp)
        try:
            project.pack(folder, built, sources_cache=cache, release_dir=release if release.is_dir() else None)
            digest = project.digest(built)     # the new file's, read before it is in place: nothing after can fail
            _replace(mp, built, expect_digest)
        finally:
            _discard(built)
    return {"path": str(mp), "digest": digest}


# --- the commit after an AI run -----------------------------------------------------------------------

def _pins(manifest: dict[str, Any]) -> dict[str, str]:
    return {src["id"]: src["commit"] for src in manifest.get("sources", [])
            if isinstance(src, dict) and isinstance(src.get("id"), str) and isinstance(src.get("commit"), str)}


def _pin_label(src: dict[str, Any]) -> str:
    return src.get("release") or f"commit {str(src.get('commit', ''))[:7]}"


def _instructions(folder: Path) -> dict[str, bytes]:
    root = folder / CUSTOM_INSTRUCTIONS
    if not root.is_dir():
        return {}
    return {relative: path.read_bytes() for relative, path in project._walk(root)}


def changes(before: Path | None, after: Path) -> list[str]:
    """The mechanical differences between two packages, as changelog lines: inputs added, removed or re-pinned,
    capabilities added or removed, custom instruction files added, changed or removed. Counts and names only."""
    new = _read_json(after / "sources.json")
    new_sources = {src["id"]: src for src in new.get("sources", []) if isinstance(src, dict) and "id" in src}
    new_caps = {cap.id for cap in parse_capabilities(after / "capabilities")} if (after / "capabilities").is_dir() else set()
    if before is None:
        return [f"First version: {len(new_caps)} {'capability' if len(new_caps) == 1 else 'capabilities'} "
                f"from {len(new_sources)} {'input' if len(new_sources) == 1 else 'inputs'}."]
    old = _read_json(before / "sources.json")
    old_sources = {src["id"]: src for src in old.get("sources", []) if isinstance(src, dict) and "id" in src}
    old_caps = {cap.id for cap in parse_capabilities(before / "capabilities")} if (before / "capabilities").is_dir() else set()
    lines = []
    for sid in sorted(new_sources.keys() - old_sources.keys()):
        lines.append(f"Adds the input {sid} ({_pin_label(new_sources[sid])}).")
    for sid in sorted(old_sources.keys() - new_sources.keys()):
        lines.append(f"Removes the input {sid}.")
    for sid in sorted(new_sources.keys() & old_sources.keys()):
        if new_sources[sid].get("commit") != old_sources[sid].get("commit"):
            lines.append(f"Moves {sid} from {_pin_label(old_sources[sid])} to {_pin_label(new_sources[sid])}.")
    added, removed = sorted(new_caps - old_caps), sorted(old_caps - new_caps)
    if added:
        lines.append(f"New capabilities: {', '.join(added)}.")
    if removed:
        lines.append(f"Capabilities removed: {', '.join(removed)}.")
    old_notes, new_notes = _instructions(before), _instructions(after)
    for relative in sorted(new_notes.keys() - old_notes.keys()):
        lines.append(f"Adds the instructions file {relative}.")
    for relative in sorted(old_notes.keys() - new_notes.keys()):
        lines.append(f"Removes the instructions file {relative}.")
    for relative in sorted(new_notes.keys() & old_notes.keys()):
        if new_notes[relative] != old_notes[relative]:
            lines.append(f"Changes the instructions file {relative}.")
    lines.append(f"The catalog is {len(new_caps)} {'capability' if len(new_caps) == 1 else 'capabilities'} "
                 f"from {len(new_sources)} {'input' if len(new_sources) == 1 else 'inputs'}.")
    return lines


def _run_id(runs: list, slug: str, version: str) -> str:
    taken = {run.get("id") for run in runs if isinstance(run, dict)}
    base, number, candidate = f"{slug}-v{version}", 2, f"{slug}-v{version}"
    while candidate in taken:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


def _started_as(meta: Any, slug: str, name: str, author: str) -> None:
    """A new project's `project.json`, which the AI could write, still names the project it was started as."""
    if not isinstance(meta, dict):
        raise ValueError("project.json is not valid: it must be an object")
    for key, label, asked in (("slug", "plugin id", slug), ("name", "name", name), ("author", "author", author)):
        if meta.get(key) != asked.strip():
            raise ValueError(f"project.json no longer has the {label} the project was started with ({asked.strip()}): "
                             "it is the desktop's to write, not the AI's")


def commit(work: Path, out: Path, *, expect_digest: str | None = None, create: bool = False, step: str = "patch",
           operation: str, summary: str = "", engine: str | None = None, budget_usd: float | None = None,
           slug: str | None = None, name: str | None = None, author: str | None = None) -> dict[str, Any]:
    """Build the package in `work`, record the run and write the project file `out`.

    Exactly one of `create` (a new file: refused where one exists) and `expect_digest` (the digest of the file `work`
    was checked out from: refused when the file changed since). The version moves by `step` from the file's version
    (a new project keeps its own). The run goes to `history.json` with the pins it used, `project.json` gets the time
    and the version, `CHANGELOG.md` a new entry on top: the AI's `summary`, then the mechanical `changes`. Then the
    package is built (`build_release`: validation, license and coverage gates, every adapter) and packed with that
    release. Nothing is written to `out` unless all of it succeeds. Returns `{path, digest, version, run}`.

    What ADR-0032 decision 2 leaves to the desktop is not taken from `work`, which the AI could write. For a change,
    `project.json` (but its version and time), `history.json` and the old `CHANGELOG.md` are the file's, and the
    plugin id must be the one the file's `project.json` names. A new project (`create`) names the `slug`, `name` and
    `author` it was started with: its `project.json` and plugin id must still be those, and it starts with no run
    and an empty changelog whatever `work` holds. The decision records are held to `check_run_records`.
    """
    from .release import build_release
    work, out = Path(work).resolve(), Path(out)
    if create == (expect_digest is not None):
        raise ValueError("Name the file a project was checked out from, or create a new one")
    if not isinstance(operation, str) or not operation.strip():
        raise ValueError("Say what the run did (operation)")
    asked = (slug, name, author)
    if create and not all(isinstance(value, str) and value.strip() for value in asked):
        raise ValueError("A new project names the plugin id, the name and the author it was started with "
                         "(--slug, --name, --author)")
    if not create and any(value is not None for value in asked):
        raise ValueError("--slug, --name and --author name a new project: a change keeps the file's own")
    manifest_path = work / "sources.json"
    if not manifest_path.is_file():
        raise ValueError("The AI did not write sources.json: there is no package to build")
    if create and not (work / "project.json").is_file():
        raise ValueError("project.json is missing from the work folder")
    if create and out.exists():
        raise ValueError(f"{out} already exists: choose another name for the new project")
    parent = out.parent if out.parent.is_dir() else None
    if parent is not None:
        _sweep(parent, out.name)
    with _scratch(".muro-commit-", parent) as scratch:
        before = None
        if expect_digest is not None:
            before = _checked_out(out, expect_digest, scratch)
        manifest = _read_json(manifest_path)
        plugin = manifest.get("plugin") if isinstance(manifest, dict) else None
        if not isinstance(plugin, dict):
            raise ValueError("sources.json names no plugin")
        if before is not None:
            meta = _read_json(before / "project.json")
            if not isinstance(meta, dict):
                raise ValueError("project.json is not valid: it must be an object")
            history = _read_json(before / "history.json")
            old_log = (before / "CHANGELOG.md").read_text(encoding="utf-8")
            records_before = project._listed(before / "records.json", "records.json")
        else:
            meta = _read_json(work / "project.json")
            _started_as(meta, slug, name, author)
            history, old_log, records_before = {"runs": []}, "", []
        if plugin.get("slug") != meta.get("slug"):
            raise ValueError(f"The plugin id changed from {meta.get('slug')} to {plugin.get('slug')}: a project keeps its id")
        records_path = work / "records.json"
        check_run_records(records_before,
                          project._listed(records_path, "records.json") if records_path.is_file() else [])
        runs = history.get("runs") if isinstance(history, dict) else None
        if not isinstance(runs, list):
            raise ValueError("history.json must hold a list of runs")
        if before is not None:
            previous = _read_json(before / "sources.json")["plugin"]["version"]
            version = bump(previous, step)
        else:
            version = bump(plugin.get("version") or meta["version"], "none")
        if plugin.get("version") != version:
            plugin["version"] = version
            _write_json(manifest_path, manifest)
        now = _now()
        lines = changes(before, work)
        text = summary.strip()
        run = {"id": _run_id(runs, plugin["slug"], version), "time": now, "version": version, "status": "completed",
               "budget_usd": budget_usd, "engine": engine, "operation": operation.strip(), "pins": _pins(manifest),
               "changelog": text or " ".join(lines)}
        release = scratch / "release"
        build_release(manifest_path, work, release)
        runs.append(run)
        _write_json(work / "history.json", {**history, "runs": runs})
        meta.update({"version": version, "changed": now})
        _write_json(work / "project.json", meta)
        entry = f"# {plugin['name']} {version}\n\n" + (f"{text}\n\n" if text else "") + "".join(f"- {line}\n" for line in lines)
        (work / "CHANGELOG.md").write_text(entry + ("\n" + old_log if old_log.strip() else ""), encoding="utf-8")
        cache = scratch / "sources"           # the old file's own copies: an input it already carried is not fetched again
        if before is not None:
            seed_cache(before, cache)
        out.parent.mkdir(parents=True, exist_ok=True)
        built = _temporary(out)
        try:
            project.pack(work, built, sources_cache=cache, release_dir=release)
            digest = project.digest(built)    # the new file's, read before it is in place: nothing after can fail
            _replace(out, built, expect_digest)
        finally:
            _discard(built)
    return {"path": str(out), "digest": digest, "version": version, "run": run}
