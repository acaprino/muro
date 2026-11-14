"""Report each source's pin against its upstream, without changing anything.

Mechanics only: tag-name version ordering and commit comparison. Whether to
re-pin is the owner's and the AI's documented decision (AGENTS.md, "Adding or
re-pinning a source"); this module never rewrites a manifest.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .sources import _git, pin_mode

_NUMBER = re.compile(r"\d+")
_PRERELEASE = re.compile(r"(?:^|[.\-_])(alpha|beta|rc|pre|preview|dev|canary|nightly|draft)(?:[.\-_]?\d+)?$",
                         re.IGNORECASE)

STATUSES = ("current", "behind", "frozen", "unknown", "error")


def _remote(src: dict[str, Any], base_dir: Path) -> str:
    """The argument `git ls-remote` takes for this source: its URL or local path."""
    repo_path = src.get("repo_path")
    if isinstance(repo_path, str) and repo_path:
        path = Path(repo_path)
        return str(path if path.is_absolute() else (base_dir / path))
    repo_url = src.get("repo_url")
    if isinstance(repo_url, str) and repo_url:
        return repo_url
    raise ValueError("source has neither repo_url nor repo_path")


def _ls_remote(base_dir: Path, remote: str, *refs: str, options: tuple[str, ...] = ()) -> str:
    return _git(base_dir, "ls-remote", *options, remote, *refs).decode("utf-8", "replace")


def _tags(lines: str) -> dict[str, str]:
    """Tag name -> commit from `ls-remote --tags` output; annotated tags are peeled."""
    plain: dict[str, str] = {}
    peeled: dict[str, str] = {}
    for line in lines.splitlines():
        parts = line.split()
        if len(parts) != 2 or not parts[1].startswith("refs/tags/"):
            continue
        sha, ref = parts
        name = ref[len("refs/tags/"):]
        if name.endswith("^{}"):
            peeled[name[:-3]] = sha
        else:
            plain[name] = sha
    plain.update(peeled)
    return plain


def _split_tag(tag: str) -> tuple[str, tuple[int, ...]] | None:
    """A tag as (non-numeric prefix, numeric components), or None without digits."""
    match = _NUMBER.search(tag)
    if not match:
        return None
    prefix = tag[: match.start()]
    numbers = tuple(int(n) for n in _NUMBER.findall(tag[match.start():]))
    return prefix, numbers


def _newest_stable(tags: dict[str, str], pinned_tag: str) -> str | None:
    """The newest same-prefix, non-prerelease tag by numeric order; None when unreadable."""
    pinned = _split_tag(pinned_tag)
    if pinned is None:
        return None
    prefix, _ = pinned
    candidates = []
    for name in tags:
        parts = _split_tag(name)
        if parts is None or parts[0] != prefix or _PRERELEASE.search(name):
            continue
        candidates.append((parts[1], name))
    if not candidates:
        return None
    return max(candidates)[1]


def _check_source(src: dict[str, Any], base_dir: Path) -> dict[str, Any]:
    row: dict[str, Any] = {"id": src.get("id", "?"), "pin": "?", "pinned": "?",
                           "upstream": None, "status": "error", "note": ""}
    try:
        mode, tag = pin_mode(src)
        row["pin"] = mode
        commit = src.get("commit", "")
        if mode == "static":
            row["pinned"] = commit[:12]
            row["status"] = "frozen"
            row["note"] = "a reviewed commit that follows nothing"
            return row
        remote = _remote(src, base_dir)
        if mode == "head":
            row["pinned"] = commit[:12]
            lines = _ls_remote(base_dir, remote, "HEAD")

            head = next((p[0] for p in (l.split() for l in lines.splitlines())
                         if len(p) == 2 and p[1] == "HEAD"), None)
            if head is None:
                row["status"] = "unknown"
                row["note"] = "upstream HEAD not reported"
                return row
            row["upstream"] = head[:12]
            row["status"] = "current" if head == commit else "behind"
            return row
        # mode == "release"
        row["pinned"] = tag
        tags = _tags(_ls_remote(base_dir, remote, options=("--tags",)))
        newest = _newest_stable(tags, tag)
        if newest is None:
            row["status"] = "unknown"
            row["note"] = "no comparable upstream tags (prefix or numbering differ)"
            return row
        row["upstream"] = newest
        row["status"] = "current" if newest == tag else "behind"
        return row
    except ValueError as exc:
        row["note"] = str(exc)
        return row


def baseline_report(manifest: dict[str, Any], base_dir: Path) -> list[dict[str, Any]]:
    """One row per source: how its pin stands against its upstream. Read-only."""
    sources = manifest.get("sources", [])
    return [_check_source(s, base_dir) for s in sources if isinstance(s, dict)]


def render_text(rows: list[dict[str, Any]]) -> str:
    lines = []
    for row in rows:
        upstream = f" upstream {row['upstream']}" if row.get("upstream") else ""
        note = f" ({row['note']})" if row.get("note") else ""
        lines.append(f"{row['status']:<8} {row['id']}: pin {row['pin']} {row['pinned']}{upstream}{note}")
    return "\n".join(lines)


def render_json(rows: list[dict[str, Any]]) -> str:
    return json.dumps({"baseline": rows}, ensure_ascii=False, indent=2)
