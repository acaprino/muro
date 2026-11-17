"""What a pinned source holds outside its selection, as evidence for the intake AI (ADR-0026).

Python resolves paths against the pinned tree and counts files. Whether the generated
plugin needs a file that was left out is the intake AI's judgment, never decided here.
"""
from __future__ import annotations

import posixpath
import re
from typing import Any

_PATH_TOKEN = re.compile(r"[A-Za-z0-9_.@+~/-]+")


def _ancestors(name: str) -> list[str]:
    """The folders above a path, nearest first, ending with the repository root ("")."""
    parts = name.split("/")[:-1]
    return ["/".join(parts[:depth]) for depth in range(len(parts), 0, -1)] + [""]


def _left_out(selected: set[str], sizes: dict[str, int]) -> list[dict[str, Any]]:
    """Every unselected file, with a folder that holds nothing selected rolled into one row."""
    open_folders = {folder for name in selected for folder in _ancestors(name)}
    rows: dict[str, dict[str, Any]] = {}
    for name, size in sizes.items():
        if name in selected:
            continue
        closed = [folder for folder in reversed(_ancestors(name)) if folder not in open_folders]
        path, kind = (closed[0], "directory") if closed else (name, "file")
        row = rows.setdefault(path, {"path": path, "kind": kind, "files": 0, "bytes": 0})
        row["files"] += 1
        row["bytes"] += size
    return [rows[path] for path in sorted(rows)]


def _targets(token: str, roots: list[str], files: dict[str, int], folders: dict[str, list[int]],
             known: set[str]) -> set[str]:
    """The unselected files and folders a path-like token names, read from the folders in `roots`.

    `roots` are the folders above the naming file, nearest first: a path is read from the
    nearest one where it exists in the pinned tree (`known`), selected or not, and those
    folders themselves are the file's own home, never a reference. A leading part may be a
    placeholder, an install location or a link host, so each tail of the token is tried too.
    One word is a path only as a file name with a dot or as a folder written with its
    slash; prose such as "the scripts" names nothing.
    """
    token = token.rstrip(".")          # a sentence can end on the path
    names_folder = token.endswith("/")
    parts = [part for part in token.split("/") if part not in ("", ".")]
    found: set[str] = set()
    for start in range(len(parts)):
        tail = parts[start:]
        if start and len(tail) < 2:
            break
        for root in roots:
            path = posixpath.normpath(posixpath.join(root, *tail))
            if path not in known:
                continue
            if path in files and (len(tail) > 1 or "." in tail[0]):
                found.add(path)
            elif path in folders and path not in roots and (len(tail) > 1 or names_folder):
                found.add(path)
            break
    return found


def source_coverage(selected: dict[str, bytes], sizes: dict[str, int]) -> dict[str, Any]:
    """Report what `selected` leaves out of the pinned tree `sizes` (path -> bytes).

    `referenced` lists the unselected files and folders that a selected file names,
    with the files that name them; `left_out` rolls up everything unselected.
    """
    files = {name: size for name, size in sizes.items() if name not in selected}
    folders: dict[str, list[int]] = {}
    for name, size in files.items():
        for folder in _ancestors(name)[:-1]:
            entry = folders.setdefault(folder, [0, 0])
            entry[0] += 1
            entry[1] += size
    known = set(sizes) | {folder for name in sizes for folder in _ancestors(name)[:-1]}
    named_in: dict[str, set[str]] = {}
    for name, content in selected.items():
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            continue                    # binary media names no path
        roots = _ancestors(name)
        for token in set(_PATH_TOKEN.findall(text)):
            for target in _targets(token, roots, files, folders, known):
                named_in.setdefault(target, set()).add(name)
    referenced = []
    for path in sorted(named_in):
        count, size = (1, files[path]) if path in files else folders[path]
        referenced.append({"path": path, "kind": "file" if path in files else "directory",
                           "files": count, "bytes": size, "named_in": sorted(named_in[path])})
    return {
        "selected": {"files": len(selected), "bytes": sum(sizes.get(name, len(data)) for name, data in selected.items())},
        "unselected": {"files": len(files), "bytes": sum(files.values())},
        "referenced": referenced,
        "left_out": _left_out(set(selected), sizes),
    }
