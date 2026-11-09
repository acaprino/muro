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


@contextmanager
def source_repository(src: dict[str, Any], base_dir: Path) -> Iterator[Path]:
    """Resolve a local repository or fetch the specified commit into a temporary bare repo."""
    commit = src.get("commit")
    if not isinstance(commit, str) or not COMMIT_PATTERN.fullmatch(commit):
        raise ValueError("commit must be a 40-character hexadecimal SHA")
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
            head = _git(path, "rev-parse", "HEAD").decode("ascii").strip()
            if head != commit:
                raise ValueError(f"pinned commit {commit} does not match local HEAD {head}")
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
            remote_head = _git(path, "ls-remote", remote, "HEAD").decode("ascii").split()[0]
            if remote_head != commit:
                raise ValueError(f"pinned commit {commit} does not match remote HEAD {remote_head}")
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
    with source_repository(src, base_dir) as repo:
        raw = _git(repo, "ls-tree", "-r", "-z", commit)
        entries: dict[str, str] = {}
        for item in raw.split(b"\0"):
            if not item:
                continue
            metadata, name = item.split(b"\t", 1)
            entries[name.decode("utf-8")] = metadata.decode("ascii").split()[0]
        if "LICENSE" not in entries:
            raise ValueError("root LICENSE missing at pinned commit")
        if entries["LICENSE"] != "100644" and entries["LICENSE"] != "100755":
            raise ValueError("root LICENSE is not a regular file")
        license_bytes = _blob(repo, commit, "LICENSE")
        if not _license_matches(license_bytes, src.get("license", "")):
            raise ValueError("LICENSE does not match the complete approved MIT/Apache-2.0 template")
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
                # A nested license needs separate rights review; no silent inheritance.
                parents = PurePosixPath(name).parents
                if any(str(parent / "LICENSE") in entries for parent in parents if str(parent) != "."):
                    raise ValueError(f"nested LICENSE requires review for selected path: {name}")
                try:
                    content = _blob(repo, commit, name).decode("utf-8-sig")
                except UnicodeDecodeError as exc:
                    raise ValueError(f"selected path is not UTF-8 text: {name}") from exc
                headers = re.findall(r"SPDX-License-Identifier:\s*([^\r\n*<>]+)", content, re.I)
                if any(header.strip() != src["license"] for header in headers):
                    raise ValueError(f"selected path has a conflicting SPDX license: {name}")
        notice = _blob(repo, commit, "NOTICE") if "NOTICE" in entries else None
        return license_bytes, notice


def check_sources(manifest: dict[str, Any], base_dir: Path) -> list[str]:
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
            inspect_source(src, base_dir)
        except (OSError, ValueError, UnicodeError) as exc:
            errors.append(f"[{sid}] {exc}")
    return errors


def fetch_license_text(src: dict[str, Any], base_dir: Path | None = None) -> str:
    license_bytes, _ = inspect_source(src, base_dir or Path.cwd())
    return license_bytes.decode("utf-8-sig")


def parse_capabilities(cap_dir: Path) -> list:
    return [parse_capability(p) for p in sorted(cap_dir.glob("*.md"))]
