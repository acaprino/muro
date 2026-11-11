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
                remote_head = _git(path, "ls-remote", remote, "HEAD").decode("ascii").split()[0]
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


def _matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        prefix = pattern[:-3].rstrip("/")
        return path.startswith(prefix + "/")
    return path == pattern or fnmatch.fnmatchcase(path, pattern)


def _safe_pattern(pattern: Any) -> bool:
    if not isinstance(pattern, str) or not pattern or "\\" in pattern or pattern.startswith("/"):
        return False
    return all(part not in (".", "..", "") for part in pattern.split("/")) and not re.match(r"^[A-Za-z]:", pattern)


def _blob(repo: Path, commit: str, path: str) -> bytes:
    return _git(repo, "show", f"{commit}:{path}")


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


def inspect_source(src: dict[str, Any], base_dir: Path) -> tuple[bytes, bytes | None]:
    """Validate the pinned snapshot and return its actual LICENSE and optional NOTICE."""
    if not isinstance(src.get("id"), str) or not SLUG_PATTERN.fullmatch(src["id"]):
        raise ValueError("source id must be kebab-case")
    commit = src.get("commit", "")
    selected = src.get("selected_paths")
    excluded = src.get("excluded_paths", [])
    if not isinstance(selected, list) or not selected or not isinstance(excluded, list):
        raise ValueError("selected_paths must be a nonempty list; excluded_paths must be a list")
    if not all(_safe_pattern(p) for p in selected + excluded):
        raise ValueError("unsafe source path or pattern")
    # The license is the root LICENSE unless the source declares the file that
    # licenses its own folder; that file then covers only what lies under it.
    license_path = src.get("license_path", "LICENSE")
    if not _safe_pattern(license_path) or any(char in license_path for char in "*?["):
        raise ValueError("license_path must be a plain repository-relative file path")
    scope = PurePosixPath(license_path).parent
    rooted = str(scope) == "."
    license_label = "root LICENSE" if license_path == "LICENSE" else f"license_path {license_path}"
    with source_repository(src, base_dir) as repo:
        raw = _git(repo, "ls-tree", "-r", "-z", commit)
        entries: dict[str, str] = {}
        for item in raw.split(b"\0"):
            if not item:
                continue
            metadata, name = item.split(b"\t", 1)
            entries[name.decode("utf-8")] = metadata.decode("ascii").split()[0]
        if license_path not in entries:
            raise ValueError(f"{license_label} missing at pinned commit")
        if entries[license_path] != "100644" and entries[license_path] != "100755":
            raise ValueError(f"{license_label} is not a regular file")
        license_bytes = _blob(repo, commit, license_path)
        if not _license_matches(license_bytes, src.get("license", "")):
            raise ValueError("LICENSE does not match the complete approved MIT/Apache-2.0 template"
                             + ("" if rooted else f" (license_path {license_path})"))
        for pattern in selected:
            matches = [name for name in entries if _matches(name, pattern) or name.startswith(pattern.rstrip("/") + "/")]
            if not matches:
                raise ValueError(f"selected path/glob matched no files: {pattern}")
            for name in matches:
                if entries[name] not in ("100644", "100755"):
                    raise ValueError(f"selected path is not a regular file: {name}")
                if PurePosixPath(name).suffix.lower() in BINARY_EXTS:
                    raise ValueError(f"selected path is binary media: {name}")
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
                try:
                    content = _blob(repo, commit, name).decode("utf-8-sig")
                except UnicodeDecodeError as exc:
                    raise ValueError(f"selected path is not UTF-8 text: {name}") from exc
                headers = re.findall(r"SPDX-License-Identifier:\s*([^\r\n*<>]+)", content, re.I)
                if any(header.strip() != src["license"] for header in headers):
                    raise ValueError(f"selected path has a conflicting SPDX license: {name}")
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
    license_path = src.get("license_path", "LICENSE")
    if not _safe_pattern(license_path) or any(char in license_path for char in "*?["):
        raise ValueError("license_path must be a plain repository-relative file path")


def check_sources(manifest: dict[str, Any], base_dir: Path, offline_pins: bool = False) -> list[str]:
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
            inspect_source(src, base_dir)
        except (OSError, ValueError, UnicodeError) as exc:
            errors.append(f"[{sid}] {exc}")
    return errors


def fetch_license_text(src: dict[str, Any], base_dir: Path | None = None) -> str:
    license_bytes, _ = inspect_source(src, base_dir or Path.cwd())
    return license_bytes.decode("utf-8-sig")


def parse_capabilities(cap_dir: Path) -> list:
    return [parse_capability(p) for p in sorted(cap_dir.glob("*.md"))]
