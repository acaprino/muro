"""Scaffold a single-source package from a repository link, pinned and gated.

Mechanics only: pin resolution follows AGENTS.md ("Adding or re-pinning a
source"): the newest non-prerelease tag, or the upstream HEAD when there is no
tag. The intake goal, the selection and the license declaration are the
caller's; the license gate (`check_sources`) verifies the declaration against
the pinned objects before anything is written as valid.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .baseline import _ls_remote, _split_tag, _tags, _PRERELEASE
from .core import SLUG_PATTERN, validate_plugin_identity
from .sources import check_sources


def resolve_pin(base_dir: Path, remote: str, release: str | None, head: bool) -> dict[str, Any]:
    """The pin fields for a new source: release tag + commit, or HEAD commit."""
    if head:
        lines = _ls_remote(base_dir, remote, "HEAD")
        sha = next((p[0] for p in (l.split() for l in lines.splitlines())
                    if len(p) == 2 and p[1] == "HEAD"), None)
        if not sha:
            raise ValueError("upstream reports no HEAD")
        return {"pin": "head", "commit": sha}
    tags = _tags(_ls_remote(base_dir, remote, options=("--tags",)))
    if release is None:
        candidates = []
        for name in tags:
            parts = _split_tag(name)
            if parts is None or _PRERELEASE.search(name):
                continue
            candidates.append((parts[1], name))
        if not candidates:
            raise ValueError("no release tags found; pass --release <tag> or --head")
        release = max(candidates)[1]
    if release not in tags:
        raise ValueError(f"tag {release} not found upstream")
    return {"pin": "release", "release": release, "commit": tags[release]}


def _source_id(remote: str) -> str:
    tail = remote.rstrip("/").rsplit("/", 1)[-1]
    tail = re.sub(r"\.git$", "", tail).lower()
    tail = re.sub(r"[^a-z0-9]+", "-", tail).strip("-")
    return tail or "source"


def scaffold_package(directory: Path, remote: str, *, slug: str | None, license_name: str,
                     goal: str, selected: list[str], release: str | None, head: bool) -> Path:
    """Write <directory>/sources.json for one pinned source and verify it.

    The directory is the new package's root; it must not already hold a
    manifest. Returns the manifest path. Verification contacts the remote.
    """
    slug = slug or _source_id(remote)
    if not re.fullmatch(SLUG_PATTERN, slug):
        raise ValueError(f"slug {slug!r} is not kebab-case")
    if not selected:
        raise ValueError("at least one --select path is required: the selection is curated, not implicit")
    if not goal.strip():
        raise ValueError("an intake goal is required (--goal): it steers the intake AI")
    directory.mkdir(parents=True, exist_ok=True)
    manifest_path = directory / "sources.json"
    if manifest_path.exists():
        raise ValueError(f"{manifest_path} already exists; edit it or choose another directory")
    pin = resolve_pin(directory, remote, release, head)
    local = Path(remote)
    repo_field = {"repo_path": str(local.resolve())} if local.exists() else {"repo_url": remote}
    source: dict[str, Any] = {
        "id": _source_id(remote),
        **repo_field,
        **pin,
        "license": license_name,
        "selected_paths": list(selected),
        "excluded_paths": [],
        "runtime_deps": [],
        "intake": {"goal": goal.strip()},
    }
    manifest = {
        "plugin": {
            "slug": slug,
            "name": slug.replace("-", " ").title(),
            "command": slug,
            "version": "0.1.0",
        },
        "sources": [source],
    }
    errors = validate_plugin_identity(manifest["plugin"])
    errors += check_sources(manifest, directory)
    if errors:
        raise ValueError("source verification failed:\n" + "\n".join(errors))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path
