# muro/project.py
"""The `.mp` project file: one zip that carries a unified plugin's package, inputs and release (ADR-0028).

The first member, stored uncompressed, is `mimetype`. The rest is the package as a folder holds it
(`sources.json`, `ROUTER.md`, `capabilities/`, ...), `project.json`, `records.json`, `history.json`,
`CHANGELOG.md`, `inputs/<source id>/...` (each source's selected files, its license and the NOTICE beside
it, at the pinned commit) and `release/<slug>/...` (a built release as `--build --out` lays it out).
`info` is what the desktop's project page shows, with the release guide's data model for the graph.

A `.mp` may come from elsewhere, so reading one is the security-sensitive side: no member is written
outside its folder (no absolute path, no `..`, no drive letter, no link), no member is outside the layout above
(a coding agent started in the unpacked folder must find there nothing that configures it, such as
`.claude/settings.json`, `.mcp.json` or `CLAUDE.md`), and unpacking stops at `MAX_BYTES` uncompressed or
`MAX_MEMBERS` members. Packing refuses what unpacking would refuse.
Python only carries and checks here; it decides nothing about what a package means.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import stat
import time
import zipfile
import zlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, NamedTuple

from .core import SLUG_PATTERN, is_device_name, validate_plugin_identity
from .custom_instructions import DIRECTORY as CUSTOM_INSTRUCTIONS
from .delivery import FORMS
from .entries import entry_description, load_entries, validate_entries
from .factory import PROMPT_FILES, _selected, prompts_dir
from .guide import guide_data
from .sources import (_validate_source_shape, inspect_source, license_files, notice_paths, parse_capabilities,
                      source_repository, tree_entries)

MIMETYPE = "application/vnd.muro.project+zip"
MAX_BYTES = 2 * 1024 ** 3
MAX_MEMBERS = 50_000
# What `info` reads of a project file, whole and into memory: no one member larger than MAX_TEXT, and
# MAX_READ for all of them in one call. A project file of anyone may carry a member of any size.
MAX_TEXT = 16 * 1024 ** 2
MAX_READ = 256 * 1024 ** 2
# What `verify` says of a release that is not the build of the package beside it.
MISMATCH = "The plugin inside this project does not match the project: it was not built from it"

# What one field of project.json that a person types may hold (a name, an author, an address, a branch): one line of
# at most this many characters. `project_work` checks it as it writes; `info` holds a file from anyone to it.
MAX_FIELD = 200
# What a package folder carries into a project file; anything else in the folder stays out.
_PACKAGE_FILES = ("sources.json", "delivery.json", "ROUTER.md", "entries.json", "guide-examples.json",
                  "eval-cases.json", "project.json", "records.json", "history.json", "CHANGELOG.md")
_PACKAGE_FOLDERS = ("capabilities", "custom-instructions", "prompts")
# The top level of a project file: the package's own files and folders, the copies of the inputs and the built
# release. Nothing else is unpacked, whatever its name.
_LAYOUT_FOLDERS = (*_PACKAGE_FOLDERS, "inputs", "release")
# A project without records, runs or release notes yet says so with empty ones, so a reader can rely on them.
_EMPTY = {"records.json": b'{"records": []}\n', "history.json": b'{"runs": []}\n', "CHANGELOG.md": b""}
_ROOT_KEY = {"records.json": "records", "history.json": "runs"}

_EPOCH = (1980, 1, 1, 0, 0, 0)        # the zip format's earliest time: the same project packs to the same bytes
_CHUNK = 1024 * 1024
_DRIVE = re.compile(r"^[A-Za-z]:")
_FORBIDDEN = frozenset('<>"|?*')
_NOT_A_PROJECT = "Not a Muro project file"
# How long `replace_file` tries again, on Windows, while another program holds one of its files (the waits, in
# seconds): an antivirus scan, a sync client, a reader of the project list. Elsewhere a refusal is not a passing one.
_REPLACE_DELAYS = (0.1, 0.2, 0.4, 0.8, 1.0, 1.0, 1.0) if os.name == "nt" else ()


class _Member(NamedTuple):
    data: bytes | Path
    executable: bool


# --- names and the limits ---------------------------------------------------------------------------

def _unsafe_name(name: str) -> str | None:
    """Why a member name cannot be written under a folder of ours, or None. Lexical: we never create links."""
    if not name or "\0" in name:
        return "empty name"
    if "\\" in name:
        return "backslash"
    if name.startswith("/"):
        return "absolute path"
    if _DRIVE.match(name):
        return "drive letter"
    if any(ord(char) < 32 or ord(char) == 127 or char in _FORBIDDEN for char in name):
        return "a control character or one of < > \" | ? *"
    for part in (name[:-1] if name.endswith("/") else name).split("/"):
        if part in ("", ".", ".."):
            return "empty, . or .. segment"
        if ":" in part:
            return "colon in a name"
        if part.endswith((".", " ")):
            return "name ends in a dot or a space"
        if is_device_name(part):
            return "a device name on Windows"
    return None


def _check_name(name: str) -> None:
    reason = _unsafe_name(name)
    if reason:
        raise ValueError(f"Unsafe member in the project file: {name!r} ({reason})")


def _in_layout(name: str) -> bool:
    """Whether a member name is in the format's layout: a package file at the top, or under one of its folders."""
    parts = name.rstrip("/").split("/")
    if len(parts) == 1 and not name.endswith("/"):
        return parts[0] in _PACKAGE_FILES
    return parts[0] in _LAYOUT_FOLDERS


def _check_layout(name: str) -> None:
    if not _in_layout(name):
        folders = ", ".join(f"{folder}/" for folder in _LAYOUT_FOLDERS)
        raise ValueError(f"Unsafe member in the project file: {name!r} (not part of a Muro project: its top level "
                         f"holds only {', '.join(_PACKAGE_FILES)} and the folders {folders})")


def replace_file(source: Path, target: Path) -> None:
    """`os.replace`, tried again for a few seconds on Windows while another program holds one of the files open
    without letting it be replaced (`_REPLACE_DELAYS`); then its error is the error."""
    for delay in _REPLACE_DELAYS:
        try:
            os.replace(source, target)
            return
        except PermissionError:
            time.sleep(delay)
    os.replace(source, target)


def _check_limits(count: int, size: int) -> None:
    if count > MAX_MEMBERS:
        raise ValueError(f"The project file holds more than {MAX_MEMBERS} members")
    if size > MAX_BYTES:
        raise ValueError(f"The project file holds more than {MAX_BYTES} bytes uncompressed")


# --- reading ----------------------------------------------------------------------------------------

def _fresh_dir(parent: Path, prefix: str) -> Path:
    """A new folder beside its destination, with the permissions the user's umask gives any folder."""
    while True:
        path = parent / f"{prefix}{secrets.token_hex(4)}"
        try:
            path.mkdir()
        except FileExistsError:
            continue
        return path.resolve()


def _sha256(handle) -> str:
    digest = hashlib.sha256()
    for chunk in iter(lambda: handle.read(_CHUNK), b""):
        digest.update(chunk)
    return digest.hexdigest()


def digest(mp: Path) -> str:
    """The SHA-256 of the file: a project's identity for the cache and for what was built from it."""
    with open(mp, "rb") as handle:
        return _sha256(handle)


def _open(handle) -> zipfile.ZipFile:
    """The archive, once its first member is the stored `mimetype` with exactly our value."""
    try:
        archive = zipfile.ZipFile(handle)
    except zipfile.BadZipFile as exc:
        raise ValueError(f"{_NOT_A_PROJECT}: it is not a zip archive") from exc
    infos = archive.infolist()
    if (not infos or infos[0].filename != "mimetype" or infos[0].compress_type != zipfile.ZIP_STORED
            or infos[0].flag_bits & 0x1 or infos[0].file_size != len(MIMETYPE) or archive.read(infos[0]) != MIMETYPE.encode("ascii")):
        archive.close()
        raise ValueError(f"{_NOT_A_PROJECT}: its first member is not the stored mimetype {MIMETYPE}")
    return archive


def _plan(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    """The members to write, every one checked before anything is written: its name, its kind, then the layout."""
    infos = archive.infolist()
    _check_limits(len(infos), sum(info.file_size for info in infos))
    seen: set[str] = set()
    for info in infos:
        _check_name(info.filename)
        mode = info.external_attr >> 16
        if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise ValueError(f"Unsafe member in the project file: {info.filename!r} (not a plain file or folder)")
        if info.flag_bits & 0x1:
            raise ValueError(f"Unsafe member in the project file: {info.filename!r} (encrypted)")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise ValueError(f"Unsafe member in the project file: {info.filename!r} (unsupported compression)")
        key = info.filename.rstrip("/").casefold()      # one file on a case-folding disk
        if key in seen:
            raise ValueError(f"Member {info.filename!r} appears twice in the project file")
        seen.add(key)
    members = infos[1:]                                 # the mimetype is the container's, not a file of the project
    for info in members:
        _check_layout(info.filename)
    return members


def _extract(handle, out: Path) -> Path:
    """Unpack into a fresh folder, all or nothing: the folder appears complete or not at all."""
    if out.exists() and (not out.is_dir() or any(out.iterdir())):
        raise ValueError(f"{out} already exists: unpack into a new folder")
    with _open(handle) as archive:
        members = _plan(archive)
        out.parent.mkdir(parents=True, exist_ok=True)
        staging = _fresh_dir(out.parent, ".muro-unpack-")
        try:
            for info in members:
                target = staging.joinpath(*info.filename.rstrip("/").split("/"))
                try:
                    target.resolve().relative_to(staging)
                except ValueError:
                    raise ValueError(f"Unsafe member in the project file: {info.filename!r} (outside the folder)") from None
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as source, open(target, "xb") as sink:   # "x": never overwrite
                    shutil.copyfileobj(source, sink, _CHUNK)
                mode = info.external_attr >> 16
                target.chmod(0o755 if mode & 0o111 else 0o644)
            if out.exists():
                out.rmdir()
            os.replace(staging, out)
        except BaseException as exc:
            shutil.rmtree(staging, ignore_errors=True)
            if isinstance(exc, (zipfile.BadZipFile, zlib.error)):     # a member that does not decompress or check
                raise ValueError(f"{_NOT_A_PROJECT}: {exc}") from exc
            raise
    return out


def unpack(mp: Path, out: Path) -> Path:
    """The project file's members as files under a new folder `out`."""
    with open(mp, "rb") as handle:
        return _extract(handle, Path(out))


def cached(mp: Path, cache_root: Path) -> Path:
    """The unpacked folder of this exact file, unpacked once: its name is the SHA-256 of the bytes."""
    with open(mp, "rb") as handle:
        folder = Path(cache_root) / _sha256(handle)
        if not folder.is_dir():
            handle.seek(0)        # the folder is made from the very bytes the name was taken from
            try:
                _extract(handle, folder)
            except (OSError, ValueError):
                if not folder.is_dir():      # another process may have finished the same folder first
                    raise
    return folder


def default_cache_root() -> Path:
    """Where `cached` unpacks when the caller names no folder: one per user, never a shared temp folder."""
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local")
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    return base / "muro" / "projects"


def _member(folder: Path, name: str) -> Path:
    path = folder / name
    if not path.is_file():
        raise ValueError(f"{_NOT_A_PROJECT}: {name} is missing")
    return path


def _mib(size: int) -> str:
    return f"{size // 1024 ** 2} MiB"


def _check_read_sizes(folder: Path) -> None:
    """Refuse a project whose package members `info` would read are too large to read into memory.

    `info` reads the package's own files whole (`_PACKAGE_FILES`, and what is under `_PACKAGE_FOLDERS`): the
    inputs and the release are carried, never read here. No member may be larger than `MAX_TEXT`, and all of
    them together at most `MAX_READ`, so a hostile file cannot make one call hold gigabytes. Sizes only: nothing is read.
    """
    members = [(name, folder / name) for name in _PACKAGE_FILES]
    for name in _PACKAGE_FOLDERS:
        root = folder / name
        if root.is_dir():
            members.extend((f"{name}/{relative}", path) for relative, path in _walk(root))
    total = 0
    for name, path in members:
        if not path.is_file():
            continue
        size = path.stat().st_size
        if size > MAX_TEXT:
            raise ValueError(f"{name} is larger than {_mib(MAX_TEXT)}")
        total += size
        if total > MAX_READ:
            raise ValueError(f"The project's files add up to more than {_mib(MAX_READ)}")


def _day(moment: str) -> str:
    return datetime.fromisoformat(moment.replace("Z", "+00:00")).date().isoformat()


def _count(number: int, one: str, many: str | None = None) -> str:
    return f"{number} {one if number == 1 else many or one + 's'}"


_FIRST = "Written by the first harmonization"


def _file_rows(identity: dict[str, Any], meta: dict[str, Any], *, inputs: int, decisions: int, capabilities: int,
               entries: int | None, examples: int, instructions: list[str], runs: int, records: int,
               built: bool) -> list[dict[str, str]]:
    """The list under "What this project file holds": each part, the files it lives in and what it holds now.

    Counts only: nothing here judges what a part means.
    """
    repository = meta["repository"]
    result = (f"{_count(capabilities, 'capability', 'capabilities')}"
              + (f" in {_count(entries, 'entry', 'entries')}" if entries is not None else "")
              + f", the router and {_count(examples, 'documented request')}") if capabilities or decisions else _FIRST
    rows = [
        ("Identity", "sources.json · plugin",
         f"The final plugin: {identity['name']}, installed as {identity['slug']}, version {identity['version']}"),
        ("Author and dates", "project.json · author, created, changed",
         f"{meta['author']} · created {_day(meta['created'])} · last changed {_day(meta['changed'])}"),
        ("Repository", "project.json · repository",
         f"{repository['url']} · branch {repository['branch']} · releases tagged {repository['tag_prefix']}<version>"
         if repository else "None set: the project lives on this computer only"),
        ("Inputs", "sources.json · sources",
         f"{_count(inputs, 'plugin or skill set', 'plugins and skill sets')} compose{'s' if inputs == 1 else ''} it: "
         "repository, pin, license, selected paths"),
        ("Choices", "delivery.json",
         f"{_count(decisions, 'decision')}: what each part of each input became, and why" if decisions else _FIRST),
        ("Result", "capabilities/ · ROUTER.md · entries.json · guide-examples.json", result),
        ("Your instructions", f"{CUSTOM_INSTRUCTIONS}/", ", ".join(instructions) or "None yet"),
        ("History", "history.json",
         f"{_count(runs, 'run')}: date, version, the pins it used, its prompt and its result"),
        ("Changelog", "CHANGELOG.md",
         "One entry per version. Muro writes it at each harmonization from what changed in inputs, choices and "
         "capabilities; you can edit it."),
        ("Decision records", "records.json",
         f"{_count(records, 'record')}: why the project is the way it is. The AI writes them, you can edit them "
         "or add your own" if records else _FIRST),
        ("Input copies", "inputs/",
         "Every input as it was at its pin, with its license and notices, so the project rebuilds without the network"),
        ("Built plugin", "release/",
         "Ready to install on every harness, with its guide" if built else "Built by the first harmonization"),
    ]
    return [{"part": part, "path": path, "detail": detail} for part, path, detail in rows]


def _instruction_texts(folder: Path) -> list[dict[str, str]]:
    """The owner's custom instruction files as the project holds them, `[{path, text}]`, `path` relative to
    `custom-instructions/`: what the page shows and edits. Markdown only, as the factory reads them; a file that
    is not UTF-8 is refused like any other member that is not what its name says."""
    root = folder / CUSTOM_INSTRUCTIONS
    if not root.is_dir():
        return []
    shown = []
    for relative, path in _walk(root):
        if not relative.lower().endswith(".md"):
            continue
        try:
            text = path.read_bytes().decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError(f"{CUSTOM_INSTRUCTIONS}/{relative} is not UTF-8 text") from exc
        shown.append({"path": relative, "text": text})
    return shown


def info(mp: Path, cache_root: Path) -> dict[str, Any]:
    """Everything the project page shows of a project file, read through `cached` (unpacked once per content).

    The graph is `guide_data`'s, computed on the package as the file holds it (not on the built release it
    may carry, which can be absent or older), with the package's own prompts or else the factory's. A file
    that lacks a member the page reads, or holds one that is not what its name says, is refused.
    """
    folder = cached(mp, cache_root)
    _check_read_sizes(folder)
    meta = json.loads(_member(folder, "project.json").read_text(encoding="utf-8"))
    manifest = json.loads(_member(folder, "sources.json").read_text(encoding="utf-8"))
    plugin = manifest.get("plugin") if isinstance(manifest, dict) else None
    sources = manifest.get("sources") if isinstance(manifest, dict) else None
    if not isinstance(plugin, dict) or not isinstance(sources, list) or not all(isinstance(s, dict) for s in sources):
        raise ValueError("sources.json must hold a plugin and a list of sources")
    errors = validate_plugin_identity(plugin)
    if errors:
        raise ValueError("Invalid plugin: " + "; ".join(errors))
    for src in sources:
        _validate_source_shape(src)
    problem = _project_json_errors(meta, plugin["slug"])
    if problem:
        raise ValueError(f"project.json is not valid: {problem}")
    records = _listed(_member(folder, "records.json"), "records.json")
    runs = _listed(_member(folder, "history.json"), "history.json")
    changelog = _member(folder, "CHANGELOG.md").read_text(encoding="utf-8")

    data = guide_data(folder, plugin, sources, packaged=False)
    delivery = data["delivery"]
    decisions = delivery["decisions"] if delivery else []
    entries_doc = load_entries(folder)
    if entries_doc is not None:
        errors = validate_entries(entries_doc, parse_capabilities(folder / "capabilities"), plugin)
        if errors:
            raise ValueError("Invalid discovery entries: " + "; ".join(errors))
    entries = [{"name": entry["name"], "description": entry_description(entry), "capabilities": entry["capabilities"]}
               for entry in entries_doc["entries"]] if entries_doc else []
    paths = {src["id"]: src["selected_paths"] for src in sources}
    inputs = [{"id": shown["id"], "url": shown.get("repo_url"), "pin": shown["pin"], "release": shown.get("release"),
               "commit": shown["commit"], "license": shown["license"], "paths": paths[shown["id"]],
               "became": {form: sum(1 for d in decisions if d["source"] == shown["id"] and d["form"] == form)
                          for form in FORMS}}
              for shown in data["sources"]]
    kept = ((delivery or {}).get("custom_instructions") or {}).get("files", {})
    prompts_folder = prompts_dir(folder)
    return {
        "project": meta,
        "plugin": {"name": plugin["name"], "slug": plugin["slug"], "version": plugin["version"],
                   "description": plugin.get("description", "")},
        "inputs": inputs,
        "decisions": decisions,
        "records": records,
        "history": runs,
        "changelog": changelog,
        "prompts": [{"file": name, "text": (prompts_folder / name).read_text(encoding="utf-8")} for name in PROMPT_FILES],
        "instructions": _instruction_texts(folder),
        "graph": {"entries": entries, "capabilities": data["capabilities"], "examples": data["examples"]},
        "files": _file_rows(
            plugin, meta, inputs=len(sources), decisions=len(decisions), capabilities=len(data["capabilities"]),
            entries=len(entries) if entries_doc else None, examples=len(data["examples"]),
            instructions=[name.removeprefix(f"{CUSTOM_INSTRUCTIONS}/") for name in sorted(kept)], runs=len(runs),
            records=len(records), built=(folder / "release" / plugin["slug"]).is_dir()),
        "digest": folder.name,
    }


def summary(mp: Path, cache_root: Path) -> dict[str, Any]:
    """What a list of projects shows of one, without the capability bodies that make `info` large.

    `project.json`, the plugin's name, slug and version, the counts of inputs, capabilities, entries,
    examples, records and runs, and the digest: all taken from `info`, so the counts are its own. A file
    that is missing or invalid is `{"error": reason}` rather than a failure, so one bad file never hides
    the others from a list.
    """
    try:
        full = info(mp, cache_root)
    except (OSError, ValueError) as exc:
        return {"error": str(exc) or type(exc).__name__}
    except Exception as exc:        # a hostile structure the validators do not cover: still one bad file, not a crash
        return {"error": f"{type(exc).__name__}: {exc}"}
    graph = full["graph"]
    return {
        "project": full["project"],
        "plugin": {key: full["plugin"][key] for key in ("name", "slug", "version")},
        "inputs": len(full["inputs"]),
        "capabilities": len(graph["capabilities"]),
        "entries": len(graph["entries"]),
        "examples": len(graph["examples"]),
        "records": len(full["records"]),
        "runs": len(full["history"]),
        "digest": full["digest"],
    }


# --- the release and the package it was built from --------------------------------------------------

def _identity(folder: Path) -> tuple[str, str, frozenset[str]]:
    """The plugin a folder is: the slug and the version its `sources.json` names, and the ids of its capabilities."""
    plugin = json.loads((folder / "sources.json").read_text(encoding="utf-8"))["plugin"]
    slug, version = plugin["slug"], plugin["version"]
    if not isinstance(slug, str) or not isinstance(version, str):
        raise ValueError("the plugin's slug and version must be text")
    return slug, version, frozenset(capability.id for capability in parse_capabilities(folder / "capabilities"))


def check_release(package: Path, built: Path) -> None:
    """Refuse a release that is not the build of the package: another plugin, another version, other capabilities.

    `package` is a folder that holds the package's `sources.json` and `capabilities/` (a package folder, or the
    unpacked project), `built` the folder of the release (`<out>/<slug>`, a build copies both from the package).
    What the release carries beyond them (adapters, guide, notices) is the build's own and is not compared.
    The one check for `pack`, which will not carry another release, and for `verify`, which a project file
    from anyone gets before its plugin is installed.
    """
    try:
        wanted, found = _identity(package), _identity(built)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ValueError(f"{MISMATCH} (the release cannot be compared: {type(exc).__name__}: {exc})") from None
    if found == wanted:
        return
    differences = []
    if found[0] != wanted[0]:
        differences.append(f"it is the plugin {found[0]}, the project's is {wanted[0]}")
    if found[1] != wanted[1]:
        differences.append(f"it is version {found[1]}, the project's is {wanted[1]}")
    if found[2] != wanted[2]:
        extra, missing = sorted(found[2] - wanted[2]), sorted(wanted[2] - found[2])
        differences.append("its capabilities differ" + (f", extra: {', '.join(extra)}" if extra else "")
                           + (f", missing: {', '.join(missing)}" if missing else ""))
    raise ValueError(f"{MISMATCH} ({'; '.join(differences)})")


def verify(mp: Path, cache_root: Path) -> None:
    """Check, as `check_release` does, the plugin a project file carries against the package it carries.

    Read through `cached`, so it is the very file the digest names. A project that carries no release for its
    plugin has nothing to disagree with: installing it is refused where the release is looked for.
    """
    folder = cached(mp, cache_root)
    try:
        slug = json.loads(_member(folder, "sources.json").read_text(encoding="utf-8"))["plugin"]["slug"]
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError(f"{MISMATCH} (the project's plugin cannot be read: {type(exc).__name__}: {exc})") from None
    if not isinstance(slug, str) or not SLUG_PATTERN.fullmatch(slug):   # it names a folder: never a path
        raise ValueError(f"{MISMATCH} (the project's plugin slug is not a kebab-case slug)")
    built = folder / "release" / slug
    if built.is_dir():
        check_release(folder, built)


# --- writing ----------------------------------------------------------------------------------------

def _walk(root: Path) -> Iterator[tuple[str, Path]]:
    """Every file under `root` as (posix path relative to it, path), links and special files refused."""
    def below(directory: Path, prefix: str) -> Iterator[tuple[str, Path]]:
        with os.scandir(directory) as scan:
            entries = sorted(scan, key=lambda entry: entry.name)
        for entry in entries:
            path = Path(entry.path)
            if entry.is_symlink():
                raise ValueError(f"{path} is a link: a project file carries no links")
            if entry.is_dir(follow_symlinks=False):
                yield from below(path, f"{prefix}{entry.name}/")
            elif entry.is_file(follow_symlinks=False):
                yield f"{prefix}{entry.name}", path
            else:
                raise ValueError(f"{path} is not a plain file or folder")
    yield from below(root, "")


def _executable(path: Path) -> bool:
    return bool(path.stat().st_mode & 0o111)


def _add_tree(members: dict[str, _Member], root: Path, prefix: str) -> None:
    for relative, path in _walk(root):
        members[prefix + relative] = _Member(path, _executable(path))


def _project_json_errors(data: Any, slug: str) -> str | None:
    if not isinstance(data, dict):
        return "it must be an object"
    for key, kind in (("name", str), ("slug", str), ("version", str), ("author", str), ("created", str),
                      ("changed", str), ("builtin", bool)):
        if type(data.get(key)) is not kind:
            return f"{key} must be {kind.__name__}"
    # the name is shown in every list and enters the AI's prompt: one line, as a person types it
    if len(data["name"]) > MAX_FIELD or any(ord(char) < 32 or ord(char) == 127 for char in data["name"]):
        return f"name must be one line of at most {MAX_FIELD} characters"
    if type(data.get("schema")) is not int or data["schema"] != 1:
        return "schema must be 1"
    if not isinstance(slug, str) or not SLUG_PATTERN.fullmatch(slug):
        return "the plugin's slug in sources.json is not a kebab-case slug"
    if data["slug"] != slug:
        return f"slug {data['slug']!r} is not the plugin's slug {slug!r}"
    for key in ("created", "changed"):
        try:
            moment = datetime.fromisoformat(data[key].replace("Z", "+00:00"))
        except ValueError:
            return f"{key} must be an ISO 8601 time"
        if moment.utcoffset() != timedelta(0):
            return f"{key} must be in UTC"
    repository = data.get("repository", "missing")
    if repository is not None and not (isinstance(repository, dict) and all(
            isinstance(repository.get(key), str) for key in ("url", "branch", "tag_prefix"))):
        return "repository must be null or {url, branch, tag_prefix}"
    return None


def _listed(path: Path, name: str) -> list:
    """The list inside `records.json` or `history.json`: an object holding it under one key."""
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:       # not JSON, or not UTF-8
        raise ValueError(f"{name} is not valid JSON ({exc})") from exc
    if not isinstance(document, dict) or not isinstance(document.get(_ROOT_KEY[name]), list):
        raise ValueError(f"{name} must be an object with a list under {_ROOT_KEY[name]!r}")
    return document[_ROOT_KEY[name]]


def _package_members(package: Path, manifest: dict[str, Any]) -> dict[str, _Member]:
    """The package's own files, project.json first checked: refuse a project that has none.

    The version lives once, in `sources.json`: the packed `project.json` carries that version whatever the
    source file says (the source keeps a `version` for the schema). When they agree the file travels as it is.
    """
    path = package / "project.json"
    if not path.is_file():
        raise ValueError(f"{path} is missing: a project file needs a project.json")
    slug = manifest.get("plugin", {}).get("slug")
    try:
        meta = json.loads(path.read_text(encoding="utf-8"))
        problem = _project_json_errors(meta, slug)
    except (ValueError, UnicodeError) as exc:
        problem = f"it is not valid JSON ({exc})"
    if problem:
        raise ValueError(f"project.json is not valid: {problem}")
    members: dict[str, _Member] = {}
    for name in _PACKAGE_FILES:
        path = package / name
        if path.is_symlink():
            raise ValueError(f"{path} is a link: a project file carries no links")
        if path.is_file():
            if name in _ROOT_KEY:
                _listed(path, name)
            members[name] = _Member(path, False)
        elif name in _EMPTY:
            members[name] = _Member(_EMPTY[name], False)
    for folder in _PACKAGE_FOLDERS:
        path = package / folder
        if path.is_symlink():
            raise ValueError(f"{path} is a link: a project file carries no links")
        if path.is_dir():
            _add_tree(members, path, f"{folder}/")
    version = manifest.get("plugin", {}).get("version")
    if isinstance(version, str) and meta["version"] != version:
        text = json.dumps({**meta, "version": version}, ensure_ascii=False, indent=2) + "\n"
        members["project.json"] = _Member(text.encode("utf-8"), False)
    return members


def _store(destination: Path, snapshot: dict[str, _Member]) -> None:
    """Keep a fetched source for the next pack: the folder appears complete or not at all."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = _fresh_dir(destination.parent, ".muro-source-")
    try:
        for relative, member in snapshot.items():
            target = staging.joinpath(*relative.split("/"))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(member.data)      # bytes: it came from the pinned commit
            if member.executable:
                target.chmod(0o755)
        os.replace(staging, destination)
    except OSError:
        shutil.rmtree(staging, ignore_errors=True)
        if not destination.is_dir():             # another pack may have stored the same commit first
            raise
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise


# What picks the files a cached copy of a source holds, and what it was fetched and checked for.
_STAMPED = ("selected_paths", "media_paths", "notice_paths", "license_path", "excluded_paths", "license")


def _stamp(src: dict[str, Any]) -> str:
    """The digest of what a cached copy of `src` was made for: its commit and what selects its files.

    A copy fetched for another selection (a path added, a notice declared, a license changed) is not the copy
    this source asks for, however the commit matches. Where the source is fetched from, and its goal, pick no file.
    """
    document = {key: src.get(key) for key in _STAMPED}
    document["commit"] = src["commit"]
    return hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _entry(cache: Path, src: dict[str, Any]) -> tuple[Path, Path]:
    """A source's cache entry: the folder of its files, and the stamp file beside it (not inside: the folder is the files)."""
    return cache / src["id"] / src["commit"], cache / src["id"] / f"{src['commit']}.stamp"


def _seal(cache: Path, src: dict[str, Any]) -> None:
    """Mark the entry as made for `src`'s selection: the stamp appears whole or not at all, after the files are in place."""
    stamp = _entry(cache, src)[1]
    temporary = stamp.parent / f".{stamp.name}.{secrets.token_hex(4)}.tmp"
    try:
        temporary.write_text(_stamp(src), encoding="ascii")
        os.replace(temporary, stamp)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def _current(cache: Path, src: dict[str, Any]) -> bool:
    """Whether the cache holds an entry made for exactly this source. An entry without a stamp (made before
    entries carried one) or with another is not: it is fetched again."""
    folder, stamp = _entry(cache, src)
    try:
        return folder.is_dir() and stamp.read_text(encoding="ascii") == _stamp(src)
    except (OSError, ValueError):
        return False


def _source_snapshot(src: dict[str, Any], package: Path, cache: Path | None) -> dict[str, _Member]:
    """A source's selected files, its license and the NOTICE beside it at the pinned commit, from the cache or the pin.

    The pin is fetched and checked as `--check-sources` and `--build` do (the license gate, the coverage
    gate, the pin's release or HEAD), through the same functions, and the files that gate carries with the
    source travel here too: the license (`license_files`), the NOTICE beside it (Apache-2.0 asks for it to
    travel) and the files `notice_paths` declares, which are selected files. A source already in the cache,
    made for this very selection (`_stamp`), is not fetched again; an entry made for another, or with no stamp,
    is replaced. The cache is a folder per source id and commit, holding the files as `inputs/<id>/` does,
    with its stamp beside it.
    """
    _validate_source_shape(src)
    kept = _entry(cache, src)[0] if cache else None
    if cache is not None and _current(cache, src):
        snapshot: dict[str, _Member] = {}
        _add_tree(snapshot, kept, "")
    else:
        license_bytes, notice = inspect_source(src, package, coverage=True)
        with source_repository(src, package) as repo:
            tree = tree_entries(repo, src["commit"])
            files = _selected(repo, src["commit"], src["selected_paths"], tree)
        snapshot = {name: _Member(data, tree[name][0] == "100755") for name, data in files.items()}
        license_path, notice_path = license_files(src)
        snapshot.setdefault(license_path, _Member(license_bytes, False))
        if notice is not None:
            snapshot.setdefault(notice_path, _Member(notice, False))
        for relative in snapshot:
            _check_name(relative)
        if kept is not None:
            _entry(cache, src)[1].unlink(missing_ok=True)       # nobody trusts the old entry while it is replaced
            if kept.exists():
                shutil.rmtree(kept)
            _store(kept, snapshot)
            _seal(cache, src)
    missing = [path for path in notice_paths(src) if path not in snapshot]
    if missing:
        raise ValueError(f"notice_paths names {', '.join(missing)}, which the source's files do not hold")
    return snapshot


def _info(name: str, executable: bool) -> zipfile.ZipInfo:
    entry = zipfile.ZipInfo(name, _EPOCH)
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.create_system = 3                                  # Unix: the mode below is read as one
    entry.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    return entry


def _write(out: Path, members: dict[str, _Member]) -> None:
    mimetype = zipfile.ZipInfo("mimetype", _EPOCH)
    mimetype.compress_type = zipfile.ZIP_STORED
    mimetype.create_system = 3
    mimetype.external_attr = (stat.S_IFREG | 0o644) << 16
    with zipfile.ZipFile(out, "x", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(mimetype, MIMETYPE.encode("ascii"))
        for name in sorted(members):
            member = members[name]
            entry = _info(name, member.executable)
            if isinstance(member.data, bytes):
                archive.writestr(entry, member.data)
                continue
            size = member.data.stat().st_size
            entry.file_size = size
            with member.data.open("rb") as source, archive.open(entry, "w", force_zip64=size >= zipfile.ZIP64_LIMIT) as sink:
                shutil.copyfileobj(source, sink, _CHUNK)


def _size(member: _Member) -> int:
    return len(member.data) if isinstance(member.data, bytes) else member.data.stat().st_size


def pack(package_dir: Path, out: Path, *, sources_cache: Path | None = None,
         release_dir: Path | None = None) -> Path:
    """The package folder, its inputs at their pins and (when given) its built release, as one `.mp`.

    Refuses a package that does not validate (as `--validate` does), a missing or malformed project.json,
    a source that fails its check, and anything unpacking would refuse. `release_dir` is the `--out`
    folder of a build (`<release_dir>/<slug>/...`); without one the project file carries no release. A
    release that is not the build of this package (`check_release`) is refused, so the plugin a project
    file shows is the plugin it carries.
    The file is written whole or not at all.
    """
    from .cli import _captured, _run_validate
    package = Path(package_dir).resolve()
    out = Path(out)
    manifest_path = package / "sources.json"
    if not manifest_path.is_file():
        raise ValueError(f"{manifest_path} is missing: a project is a package with a sources.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    code, report = _captured(lambda: _run_validate(manifest, package))
    if code:
        raise ValueError(f"The package does not validate:\n{report}")
    members = _package_members(package, manifest)
    built = None
    if release_dir is not None:      # fail before any source is fetched
        slug = manifest["plugin"]["slug"]
        built = Path(release_dir) / slug
        if not built.is_dir():
            raise ValueError(f"{built} is missing: release_dir is the --out folder of a build of {slug}")
        check_release(package, built)
    cache = Path(sources_cache) if sources_cache else None
    for src in manifest.get("sources", []):
        if not isinstance(src, dict):
            raise ValueError("Every source in sources.json must be an object")
        try:
            snapshot = _source_snapshot(src, package, cache)
        except (OSError, ValueError) as exc:
            raise ValueError(f"Source {src.get('id', '?')}: {exc}") from exc
        for relative, member in snapshot.items():
            members[f"inputs/{src['id']}/{relative}"] = member
    if built is not None:
        _add_tree(members, built, f"release/{built.name}/")
    for name in members:
        _check_name(name)
        _check_layout(name)
    _check_limits(len(members) + 1, len(MIMETYPE) + sum(_size(member) for member in members.values()))
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.parent / f".{out.name}.{secrets.token_hex(4)}.tmp"
    try:
        _write(temporary, members)
        replace_file(temporary, out)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return out
