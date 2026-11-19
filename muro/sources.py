"""Verify selected files and licensing against pinned Git objects, not the working tree."""
from __future__ import annotations

from contextlib import contextmanager
import fnmatch
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
from typing import Any, Iterator

from .core import BINARY_EXTS, COMMIT_PATTERN, SLUG_PATTERN, parse_capability
from .coverage import source_coverage

_MIT_BODY_SHA = "fe2a9817987f862eaced948f0468c7f51d2fedfc48c5c505b246a49a3870e9a5"
_APACHE_SHA = "0ffddef9e48f8a09aed5caf2d44f7ba1c1be2d9b8e0a6f693b1635b2d5566645"


def _git(path: Path, *args: str) -> bytes:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(["git", "-C", str(path), *args], capture_output=True,
                                env=env, timeout=45, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f"Git unavailable or timed out: {exc}") from exc
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", "replace").strip() or "Git command failed")
    return result.stdout


PIN_MODES = ("release", "head", "static")
_TAG_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*(?:/[A-Za-z0-9][A-Za-z0-9._+-]*)*")


def pin_mode(src: dict[str, Any]) -> tuple[str, str | None]:
    """How the pinned commit is anchored upstream (ADR-0009).

    `release`: the commit a published tag points to. `head`: the upstream HEAD.
    `static`: a reviewed commit that follows nothing. Never inferred or defaulted.
    """
    mode, tag = src.get("pin"), src.get("release")
    if not isinstance(mode, str) or mode not in PIN_MODES:
        raise ValueError("pin must be one of release, head, static")
    if mode != "release":
        if tag is not None:
            raise ValueError("release is only allowed with pin release")
        return mode, None
    if not isinstance(tag, str) or not _TAG_NAME.fullmatch(tag) or ".." in tag:
        raise ValueError("release must be the published tag name when pin is release")
    return mode, tag


def _tagged_commit(lines: str, tag: str) -> str | None:
    """Commit behind a tag in ls-remote/show-ref output; an annotated tag is peeled."""
    found = {parts[1]: parts[0] for parts in (line.split() for line in lines.splitlines()) if len(parts) == 2}
    return found.get(f"refs/tags/{tag}^{{}}") or found.get(f"refs/tags/{tag}")


@contextmanager
def source_repository(src: dict[str, Any], base_dir: Path) -> Iterator[Path]:
    """Resolve a local repository or fetch the specified commit into a temporary bare repo."""
    commit = src.get("commit")
    if not isinstance(commit, str) or not COMMIT_PATTERN.fullmatch(commit):
        raise ValueError("commit must be a 40-character hexadecimal SHA")
    mode, tag = pin_mode(src)
    local, remote = src.get("repo_path"), src.get("repo_url")
    if bool(local) == bool(remote):
        raise ValueError("exactly one of repo_path and repo_url is required")
    if local:
        path = Path(local).expanduser()
        path = (base_dir / path).resolve() if not path.is_absolute() else path.resolve()
        if not path.is_dir():
            raise ValueError(f"repository not found: {path}")
        try:
            _git(path, "cat-file", "-e", f"{commit}^{{commit}}")
            if mode == "head":
                head = _git(path, "rev-parse", "HEAD").decode("ascii").strip()
                if head != commit:
                    raise ValueError(f"pinned commit {commit} does not match local HEAD {head}")
            elif mode == "release":
                try:
                    tagged = _git(path, "rev-parse", "--verify", "-q", f"refs/tags/{tag}^{{commit}}").decode("ascii").strip()
                except ValueError:
                    tagged = ""
                if not tagged:
                    raise ValueError(f"release {tag} not found in the local repository")
                if tagged != commit:
                    raise ValueError(f"pinned commit {commit} is not release {tag} ({tagged})")
        except ValueError as exc:
            raise ValueError(f"cannot verify pinned commit {commit}: {exc}") from exc
        yield path
    else:
        if not isinstance(remote, str) or remote.startswith("-") or not remote.startswith(("https://", "file://")):
            raise ValueError("repo_url must be an HTTPS or file URL")
        with tempfile.TemporaryDirectory(prefix="muro-source-") as temp:
            path = Path(temp)
            _git(path, "init", "--bare", "-q")
            _git(path, "fetch", "--no-tags", "--depth=1", "--", remote, commit)
            _git(path, "cat-file", "-e", f"{commit}^{{commit}}")
            if mode == "head":
                listing = _git(path, "ls-remote", remote, "HEAD").decode("ascii").split()
                if not listing:
                    raise ValueError("upstream reports no HEAD")
                remote_head = listing[0]
                if remote_head != commit:
                    raise ValueError(f"pinned commit {commit} does not match remote HEAD {remote_head}")
            elif mode == "release":
                listing = _git(path, "ls-remote", "--", remote, f"refs/tags/{tag}", f"refs/tags/{tag}^{{}}")
                tagged = _tagged_commit(listing.decode("ascii"), tag)
                if not tagged:
                    raise ValueError(f"release {tag} not found on the remote")
                if tagged != commit:
                    raise ValueError(f"pinned commit {commit} is not release {tag} ({tagged})")
            yield path


def tree_entries(repo: Path, commit: str) -> dict[str, tuple[str, int]]:
    """Every path at the pinned commit with its Git mode and its size in bytes (0 for a submodule)."""
    entries: dict[str, tuple[str, int]] = {}
    for item in _git(repo, "ls-tree", "-r", "-l", "-z", commit).split(b"\0"):
        if not item:
            continue
        metadata, name = item.split(b"\t", 1)
        mode, _kind, _object, size = metadata.decode("ascii").split()
        entries[name.decode("utf-8")] = (mode, int(size) if size.isdigit() else 0)
    return entries


def _matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        prefix = pattern[:-3].rstrip("/")
        return path.startswith(prefix + "/")
    return path == pattern or fnmatch.fnmatchcase(path, pattern)


def _covers(path: str, pattern: str) -> bool:
    """A manifest pattern names this path: exactly, by glob, or as a folder above it."""
    return _matches(path, pattern) or path.startswith(pattern.rstrip("/") + "/")


def file_sizes(tree: dict[str, tuple[str, int]]) -> dict[str, int]:
    """The files of the pinned tree with their sizes. A submodule (mode 160000) is another repository."""
    return {name: size for name, (mode, size) in tree.items() if mode != "160000"}


def _safe_pattern(pattern: Any) -> bool:
    if not isinstance(pattern, str) or not pattern or "\\" in pattern or pattern.startswith("/"):
        return False
    return all(part not in (".", "..", "") for part in pattern.split("/")) and not re.match(r"^[A-Za-z]:", pattern)


def _intake_only_patterns(src: dict[str, Any]) -> list[str]:
    """Selected files the intake AI declared as evidence only: read at intake, never packaged."""
    patterns = src.get("intake_only_paths", [])
    if not isinstance(patterns, list):
        raise ValueError("intake_only_paths must be a list")
    if not all(_safe_pattern(pattern) for pattern in patterns):
        raise ValueError("unsafe source path or pattern")
    return patterns


def media_patterns(src: dict[str, Any]) -> list[str]:
    """Selected files that are not text (images, fonts, video, models), declared by the intake (ADR-0027).

    The declaration says the intake AI read how the source licenses them. It lifts the gate's
    refusal of binary files for these paths only; Python never reads the rights themselves.
    """
    patterns = src.get("media_paths", [])
    if not isinstance(patterns, list) or not all(_safe_pattern(pattern) for pattern in patterns):
        raise ValueError("media_paths must be a list of safe repository-relative paths or patterns")
    return patterns


def omission_patterns(src: dict[str, Any]) -> list[str]:
    """Unselected files the intake AI declared the generated plugin does not need (ADR-0026).

    Each `omissions` entry is `{paths, reason}`: patterns and the source-grounded reason they
    are left out. Python requires the reason to exist; it never judges it.
    """
    entries = src.get("omissions", [])
    shape = "omissions must be a list of {paths, reason}: safe patterns and a nonempty reason"
    if not isinstance(entries, list):
        raise ValueError(shape)
    patterns: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"paths", "reason"}:
            raise ValueError(shape)
        paths, reason = entry["paths"], entry["reason"]
        if not isinstance(paths, list) or not paths or not all(_safe_pattern(path) for path in paths):
            raise ValueError(shape)
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError(shape)
        patterns += paths
    return patterns


def _coverage_errors(src: dict[str, Any], selected: dict[str, bytes], sizes: dict[str, int]) -> str | None:
    """Why this selection cannot be checked or released as it is, or None (ADR-0026).

    A file that a selected file names must be selected or declared in `omissions`; a named
    folder stands for every unselected file under it. A path check: what the method needs
    is judged by the intake AI, which answers by selecting the file or giving the reason.
    """
    patterns = omission_patterns(src)
    unselected = [name for name in sizes if name not in selected]
    for pattern in patterns:
        if any(_covers(name, pattern) for name in selected):
            return f"omissions pattern matches a selected file: {pattern}"
        if not any(_covers(name, pattern) for name in unselected):
            return f"omissions matched no unselected file: {pattern}"
    unexplained: dict[str, list[str]] = {}
    for row in source_coverage(selected, sizes)["referenced"]:
        under = [row["path"]] if row["kind"] == "file" else [n for n in unselected if n.startswith(row["path"] + "/")]
        for name in under:
            if not any(_covers(name, pattern) for pattern in patterns):
                unexplained.setdefault(name, row["named_in"])
    if not unexplained:
        return None
    names = sorted(unexplained)
    shown = ", ".join(f"{name} (named in {', '.join(unexplained[name][:2])})" for name in names[:8])
    more = f" (+{len(names) - 8} more)" if len(names) > 8 else ""
    plural = "file" if len(names) == 1 else "files"
    return (f"selected files name {len(names)} unselected {plural} with no declared omission: {shown}{more}. "
            "Select what the method uses at run time, or declare the rest in omissions with a reason (ADR-0026)")


def notice_paths(src: dict[str, Any]) -> list[str]:
    """Selected files the source declares as carrying third-party notices for what it ships (ADR-0025).

    A prebuilt artifact can embed code under other licenses than the verified one; the gate cannot see
    inside it. The manifest names the file that lists those notices, and the release points at it.
    Declared, never guessed from a file name.
    """
    paths = src.get("notice_paths", [])
    if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
        raise ValueError("notice_paths must be a list of file paths")
    if not all(_safe_pattern(path) and not any(char in path for char in "*?[") for path in paths):
        raise ValueError("notice_paths entries must be plain repository-relative file paths")
    if len(set(paths)) != len(paths):
        raise ValueError("notice_paths lists a file twice")
    return paths


def _blob(repo: Path, commit: str, path: str) -> bytes:
    return _git(repo, "show", f"{commit}:{path}")


def read_blobs(repo: Path, commit: str, names: list[str]) -> dict[str, bytes]:
    """The contents of many files of the pinned commit, read by one Git process.

    One `git show` per file cost about 0.2 s on Windows; a source absorbed whole can
    select over a thousand files (ADR-0026).
    """
    if not names:
        return {}
    if any("\n" in name for name in names):
        raise ValueError("source path contains a line break")
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    request = "".join(f"{commit}:{name}\n" for name in names).encode("utf-8")
    try:
        result = subprocess.run(["git", "-C", str(repo), "cat-file", "--batch"], input=request,
                                capture_output=True, env=env, timeout=600, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f"Git unavailable or timed out: {exc}") from exc
    if result.returncode:
        raise ValueError(result.stderr.decode("utf-8", "replace").strip() or "Git command failed")
    data, offset, blobs = result.stdout, 0, {}
    for name in names:
        end = data.index(b"\n", offset)
        header = data[offset:end].split()
        if len(header) != 3 or header[1] != b"blob":
            raise ValueError(f"cannot read a file at the pinned commit: {name}")
        start, size = end + 1, int(header[2])
        blobs[name] = data[start:start + size]
        offset = start + size + 1
    return blobs


_LICENSE_NAMES = ("LICENSE", "LICENSE.txt", "LICENSE.md", "LICENCE", "LICENCE.txt", "LICENCE.md", "COPYING")
_APACHE_APPENDIX = "APPENDIX: How to apply the Apache License to your work."
_APACHE_PLACEHOLDER = "Copyright [yyyy] [name of copyright owner]"
_APACHE_NOTICE = re.compile(r"Copyright (?:\(c\) |© )?\d{4}(?:-\d{4})? [^\[\]\r\n]{1,100}")


def _apache_template(text: str) -> str:
    """Restore the appendix placeholder when it holds one plain copyright line.

    The appendix asks licensors to replace its bracketed fields with their own
    identifying information, so a filled notice is still the approved license.
    Nothing else is normalized: the terms remain compared with the template.
    """
    head, found, appendix = text.partition(_APACHE_APPENDIX)
    if not found or _APACHE_PLACEHOLDER in appendix:
        return text
    lines = appendix.splitlines()
    notices = [index for index, line in enumerate(lines) if line.strip().startswith("Copyright")]
    if len(notices) != 1 or not _APACHE_NOTICE.fullmatch(lines[notices[0]].strip()):
        return text
    lines[notices[0]] = _APACHE_PLACEHOLDER
    return head + found + "\n".join(lines)


def copyright_notices(data: bytes, license_type: str) -> list[str]:
    """Copyright notices carried by a verified license, never its prose.

    License terms contain wrapped lines that merely begin with "copyright";
    only the MIT header and the filled Apache appendix line are notices.
    """
    text = data.decode("utf-8-sig")
    if license_type == "MIT":
        header = text.split("Permission is hereby granted, free of charge", 1)[0]
        return [line.strip() for line in header.splitlines() if re.match(r"Copyright\b", line.strip(), re.I)]
    if license_type == "Apache-2.0":
        _, found, appendix = text.partition(_APACHE_APPENDIX)
        return [line.strip() for line in appendix.splitlines() if _APACHE_NOTICE.fullmatch(line.strip())] if found else []
    return []


def _license_matches(data: bytes, license_type: str) -> bool:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    if license_type == "MIT":
        marker = "Permission is hereby granted, free of charge"
        if marker not in text:
            return False
        header = text[:text.index(marker)].strip().splitlines()
        header = [line.strip() for line in header if line.strip()]
        if len(header) < 2 or header[0] != "MIT License" or any(not re.match(r"Copyright\b", line, re.I) for line in header[1:]):
            return False
        text = text[text.index(marker):]
        expected = _MIT_BODY_SHA
    elif license_type == "Apache-2.0":
        text = _apache_template(text)
        expected = _APACHE_SHA
    else:
        return False
    return hashlib.sha256(" ".join(text.split()).encode("utf-8")).hexdigest() == expected


def inspect_source(src: dict[str, Any], base_dir: Path, *, coverage: bool = False) -> tuple[bytes, bytes | None]:
    """Validate the pinned snapshot and return its actual LICENSE and optional NOTICE.

    With `coverage`, also refuse a selection that leaves out, unexplained, a file its own
    files name (ADR-0026). The source check and the build ask for it; preparing an intake
    does not, because the workbench is where the intake AI learns what is missing.
    """
    if not isinstance(src.get("id"), str) or not SLUG_PATTERN.fullmatch(src["id"]):
        raise ValueError("source id must be kebab-case")
    commit = src.get("commit", "")
    selected = src.get("selected_paths")
    excluded = src.get("excluded_paths", [])
    if not isinstance(selected, list) or not selected or not isinstance(excluded, list):
        raise ValueError("selected_paths must be a nonempty list; excluded_paths must be a list")
    if not all(_safe_pattern(p) for p in selected + excluded):
        raise ValueError("unsafe source path or pattern")
    intake_only = _intake_only_patterns(src)
    media = media_patterns(src)
    omission_patterns(src)
    # The license is the root LICENSE unless the source declares the file that
    # licenses its own folder; that file then covers only what lies under it.
    license_path = src.get("license_path", "LICENSE")
    if not _safe_pattern(license_path) or any(char in license_path for char in "*?["):
        raise ValueError("license_path must be a plain repository-relative file path")
    scope = PurePosixPath(license_path).parent
    rooted = str(scope) == "."
    license_label = "root LICENSE" if license_path == "LICENSE" else f"license_path {license_path}"
    with source_repository(src, base_dir) as repo:
        tree = tree_entries(repo, commit)
        entries = {name: mode for name, (mode, _size) in tree.items()}
        if license_path not in entries:
            raise ValueError(f"{license_label} missing at pinned commit")
        if entries[license_path] != "100644" and entries[license_path] != "100755":
            raise ValueError(f"{license_label} is not a regular file")
        license_bytes = _blob(repo, commit, license_path)
        if not _license_matches(license_bytes, src.get("license", "")):
            raise ValueError("LICENSE does not match the complete approved MIT/Apache-2.0 template"
                             + ("" if rooted else f" (license_path {license_path})"))
        declared_media: dict[str, bool] = {}
        for pattern in selected:
            matches = [name for name in entries if _covers(name, pattern)]
            if not matches:
                raise ValueError(f"selected path/glob matched no files: {pattern}")
            for name in matches:
                if name in declared_media:
                    continue
                if entries[name] not in ("100644", "100755"):
                    raise ValueError(f"selected path is not a regular file: {name}")
                declared_media[name] = any(_covers(name, pattern) for pattern in media)
                if PurePosixPath(name).suffix.lower() in BINARY_EXTS and not declared_media[name]:
                    raise ValueError(f"selected path is binary media not declared in media_paths: {name}")
                if any(_matches(name, pattern) for pattern in excluded):
                    raise ValueError(f"selected path matches excluded_paths: {name}")
                parents = PurePosixPath(name).parents
                if not rooted and scope not in parents:
                    raise ValueError(f"selected path is outside the folder covered by license_path: {name}")
                # A license deeper than the verified one needs separate rights
                # review; no silent inheritance. Declaring it is that review.
                deeper = [parent for parent in parents if parent != scope and (rooted or scope in parent.parents)]
                if any(str(parent / licence) in entries for parent in deeper for licence in _LICENSE_NAMES):
                    raise ValueError(f"nested LICENSE requires review for selected path: {name}")
        blobs = read_blobs(repo, commit, list(declared_media))
        for name, data in blobs.items():
            try:
                content = data.decode("utf-8-sig")
            except UnicodeDecodeError as exc:
                if declared_media[name]:
                    blobs[name] = b""      # no text in it: no SPDX header to read, no path it could name
                    continue
                raise ValueError(f"selected path is not UTF-8 text (binary media is declared in media_paths): {name}") from exc
            headers = re.findall(r"SPDX-License-Identifier:\s*([^\r\n*<>]+)", content, re.I)
            # An HTML comment closes with "-->": the "--" is not part of the identifier.
            if any(header.strip().rstrip("-").strip() != src["license"] for header in headers):
                raise ValueError(f"selected path has a conflicting SPDX license: {name}")
        for pattern in intake_only:
            if not any(_covers(name, pattern) for name in blobs):
                raise ValueError(f"intake_only_paths matched no selected file: {pattern}")
        for pattern in media:
            if not any(_covers(name, pattern) for name in blobs):
                raise ValueError(f"media_paths matched no selected file: {pattern}")
        for declared in notice_paths(src):
            if declared not in blobs:
                raise ValueError(f"notice_paths entry is not a selected file: {declared}")
            if any(_covers(declared, pattern) for pattern in intake_only):
                raise ValueError(f"notice_paths entry is read at intake only and would not ship: {declared}")
        problem = _coverage_errors(src, blobs, file_sizes(tree)) if coverage else None
        if problem:
            raise ValueError(problem)
        # The NOTICE that travels with a license is the one beside it.
        notice_path = "NOTICE" if rooted else str(scope / "NOTICE")
        notice = _blob(repo, commit, notice_path) if notice_path in entries else None
        return license_bytes, notice


def _validate_source_shape(src: dict[str, Any]) -> None:
    if not isinstance(src.get("id"), str) or not SLUG_PATTERN.fullmatch(src["id"]):
        raise ValueError("source id must be kebab-case")
    commit = src.get("commit", "")
    if not isinstance(commit, str) or not COMMIT_PATTERN.fullmatch(commit):
        raise ValueError("commit must be a 40-character hexadecimal SHA")
    pin_mode(src)
    local, remote = src.get("repo_path"), src.get("repo_url")
    if bool(local) == bool(remote):
        raise ValueError("exactly one of repo_path and repo_url is required")
    if remote and (not isinstance(remote, str) or remote.startswith("-") or not remote.startswith(("https://", "file://"))):
        raise ValueError("repo_url must be an HTTPS or file URL")
    if src.get("license") not in {"MIT", "Apache-2.0"}:
        raise ValueError("license must be MIT or Apache-2.0")
    selected = src.get("selected_paths")
    excluded = src.get("excluded_paths", [])
    if not isinstance(selected, list) or not selected or not isinstance(excluded, list):
        raise ValueError("selected_paths must be a nonempty list; excluded_paths must be a list")
    if not all(_safe_pattern(p) for p in selected + excluded):
        raise ValueError("unsafe source path or pattern")
    _intake_only_patterns(src)
    media_patterns(src)
    omission_patterns(src)
    notice_paths(src)
    license_path = src.get("license_path", "LICENSE")
    if not _safe_pattern(license_path) or any(char in license_path for char in "*?["):
        raise ValueError("license_path must be a plain repository-relative file path")


def check_sources(manifest: dict[str, Any], base_dir: Path, offline_pins: bool = False,
                  coverage: bool = True) -> list[str]:
    """Every problem of the manifest's sources. `coverage` off only where an intake has not yet run (a scaffold)."""
    errors: list[str] = []
    sources = manifest.get("sources", [])
    if not isinstance(sources, list) or not sources:
        return ["sources.json must contain at least one source"]
    seen: set[str] = set()
    for src in sources:
        sid = src.get("id", "unknown") if isinstance(src, dict) else "unknown"
        if not isinstance(src, dict):
            errors.append("[unknown] invalid source entry")
            continue
        if sid in seen:
            errors.append(f"[{sid}] duplicate source id")
            continue
        seen.add(sid)
        try:
            _validate_source_shape(src)
            if offline_pins and isinstance(src.get("repo_url"), str) and src["repo_url"].startswith("https://"):
                continue
            inspect_source(src, base_dir, coverage=coverage)
        except (OSError, ValueError, UnicodeError) as exc:
            errors.append(f"[{sid}] {exc}")
    return errors


def fetch_license_text(src: dict[str, Any], base_dir: Path | None = None) -> str:
    license_bytes, _ = inspect_source(src, base_dir or Path.cwd())
    return license_bytes.decode("utf-8-sig")


def parse_capabilities(cap_dir: Path) -> list:
    return [parse_capability(p) for p in sorted(cap_dir.glob("*.md"))]
