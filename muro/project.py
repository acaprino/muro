# muro/project.py
"""The `.mp` project file: one zip that carries a unified plugin's package, inputs and release (ADR-0028).

The first member, stored uncompressed, is `mimetype`. The rest is the package as a folder holds it
(`sources.json`, `ROUTER.md`, `capabilities/`, ...), `project.json`, `records.json`, `history.json`,
`CHANGELOG.md`, `inputs/<source id>/...` (each source's selected files and its license at the pinned
commit) and `release/<slug>/...` (a built release as `--build --out` lays it out).

A `.mp` may come from elsewhere, so reading one is the security-sensitive side: no member is written
outside its folder (no absolute path, no `..`, no drive letter, no link), and unpacking stops at
`MAX_BYTES` uncompressed or `MAX_MEMBERS` members. Packing refuses what unpacking would refuse.
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
import zipfile
import zlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterator, NamedTuple

from .core import SLUG_PATTERN
from .factory import _selected
from .sources import _validate_source_shape, inspect_source, source_repository, tree_entries

MIMETYPE = "application/vnd.muro.project+zip"
MAX_BYTES = 2 * 1024 ** 3
MAX_MEMBERS = 50_000

# What a package folder carries into a project file; anything else in the folder stays out.
_PACKAGE_FILES = ("sources.json", "delivery.json", "ROUTER.md", "entries.json", "guide-examples.json",
                  "eval-cases.json", "project.json", "records.json", "history.json", "CHANGELOG.md")
_PACKAGE_FOLDERS = ("capabilities", "custom-instructions", "prompts")
# A project without records, runs or release notes yet says so with empty ones, so a reader can rely on them.
_EMPTY = {"records.json": b'{"records": []}\n', "history.json": b'{"runs": []}\n', "CHANGELOG.md": b""}
_ROOT_KEY = {"records.json": "records", "history.json": "runs"}

_EPOCH = (1980, 1, 1, 0, 0, 0)        # the zip format's earliest time: the same project packs to the same bytes
_CHUNK = 1024 * 1024
_DRIVE = re.compile(r"^[A-Za-z]:")
_NOT_A_PROJECT = "Not a Muro project file"


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
    for part in (name[:-1] if name.endswith("/") else name).split("/"):
        if part in ("", ".", ".."):
            return "empty, . or .. segment"
        if ":" in part:
            return "colon in a name"
        if part.endswith((".", " ")):
            return "name ends in a dot or a space"
    return None


def _check_name(name: str) -> None:
    reason = _unsafe_name(name)
    if reason:
        raise ValueError(f"Unsafe member in the project file: {name!r} ({reason})")


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
    """The members to write, every one checked before anything is written."""
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
    return infos[1:]                                    # the mimetype is the container's, not a file of the project


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


def info(mp: Path, cache_root: Path) -> dict[str, Any]:
    """What a project file says about itself. Reads through `cached`; the full view is added with the guide's data."""
    folder = cached(mp, cache_root)
    path = folder / "project.json"
    if not path.is_file():
        raise ValueError(f"{_NOT_A_PROJECT}: project.json is missing")
    return {"project": json.loads(path.read_text(encoding="utf-8")), "digest": folder.name}


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


def _package_members(package: Path, manifest: dict[str, Any]) -> dict[str, _Member]:
    """The package's own files, project.json first checked: refuse a project that has none."""
    path = package / "project.json"
    if not path.is_file():
        raise ValueError(f"{path} is missing: a project file needs a project.json")
    slug = manifest.get("plugin", {}).get("slug")
    try:
        problem = _project_json_errors(json.loads(path.read_text(encoding="utf-8")), slug)
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
                try:
                    document = json.loads(path.read_text(encoding="utf-8"))
                except (ValueError, UnicodeError) as exc:
                    raise ValueError(f"{name} is not valid JSON ({exc})") from exc
                if not isinstance(document, dict) or not isinstance(document.get(_ROOT_KEY[name]), list):
                    raise ValueError(f"{name} must be an object with a list under {_ROOT_KEY[name]!r}")
            members[name] = _Member(path, False)
        elif name in _EMPTY:
            members[name] = _Member(_EMPTY[name], False)
    for folder in _PACKAGE_FOLDERS:
        path = package / folder
        if path.is_symlink():
            raise ValueError(f"{path} is a link: a project file carries no links")
        if path.is_dir():
            _add_tree(members, path, f"{folder}/")
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


def _source_snapshot(src: dict[str, Any], package: Path, cache: Path | None) -> dict[str, _Member]:
    """A source's selected files and its license at the pinned commit, from the cache or from the pin.

    The pin is fetched and checked as `--check-sources` and `--build` do (the license gate, the coverage
    gate, the pin's release or HEAD), through the same functions; a source already in the cache is not
    fetched again. The cache is a folder per source id and commit, holding the files as `inputs/<id>/`
    does.
    """
    _validate_source_shape(src)
    source_id, commit = src["id"], src["commit"]
    kept = cache / source_id / commit if cache else None
    if kept is not None and kept.is_dir():
        snapshot: dict[str, _Member] = {}
        _add_tree(snapshot, kept, "")
    else:
        license_bytes, _notice = inspect_source(src, package, coverage=True)
        with source_repository(src, package) as repo:
            tree = tree_entries(repo, commit)
            files = _selected(repo, commit, src["selected_paths"], tree)
        snapshot = {name: _Member(data, tree[name][0] == "100755") for name, data in files.items()}
        snapshot.setdefault(src.get("license_path", "LICENSE"), _Member(license_bytes, False))
        for relative in snapshot:
            _check_name(relative)
        if kept is not None:
            _store(kept, snapshot)
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
    folder of a build (`<release_dir>/<slug>/...`); without one the project file carries no release.
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
    _check_limits(len(members) + 1, len(MIMETYPE) + sum(_size(member) for member in members.values()))
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.parent / f".{out.name}.{secrets.token_hex(4)}.tmp"
    try:
        _write(temporary, members)
        os.replace(temporary, out)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise
    return out
