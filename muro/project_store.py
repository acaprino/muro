# muro/project_store.py
"""The rules of a project store: what a project file must be to be released from its repository (ADR-0034).

A project's repository is a plugin store built from its `<slug>.mp`, and a push of the file is a release. Two
callers hold a file to these rules, and each rule lives here once:

- the store workflow, on GitHub, through `.github/scripts/project_store.py` (the workflow's side: finding the
  file, the notes, the step's outputs);
- `muro project release` (`muro/project_release.py`), on the person's computer, before the file leaves.

Pure functions: nothing here runs Git, reads the network or writes a file. Reading and checking a project file
stays `muro.project`'s; `identity` takes what `muro.project.summary` answers.

A project file is a stranger's until it is checked: no value of it becomes a path, a Git ref, a shell argument
or a line of a workflow before `identity_refusals` has held it to one safe line.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from . import __version__

SUFFIX = ".mp"
# Where the release notes of a store are kept, one file per tag. A plugin cannot have this id: its folder
# would be the same one.
NOTES_FOLDER = "releases"
ALREADY_RELEASED = "the same version was already released from another file: change the version"
# The factory's own repository on GitHub and the prefix of its release tags (`.github/release.json`): what the
# caller of a store names. The workflow that a store calls, and the file a store keeps its caller in.
MURO_REPOSITORY = "acaprino/muro"
MURO_TAG_PREFIX = "muro-v"
STORE_WORKFLOW = ".github/workflows/project-store.yml"
CALLER_PATH = ".github/workflows/release.yml"
# A version or a tag becomes a file name, a Git ref and a shell argument: letters, digits, dot, underscore
# and hyphen, starting and ending with a letter or a digit.
_SAFE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$")
# A branch name written as it is in the caller's YAML: anything else is quoted.
_PLAIN = re.compile(r"^[A-Za-z][A-Za-z0-9._/-]*$")
_YAML_WORDS = frozenset(("true", "false", "null", "yes", "no", "on", "off", "y", "n"))


class Refused(ValueError):
    """One plain sentence that says why nothing is released."""


# --- the repository a project names ------------------------------------------------------------------

def repository_name(address: str) -> str:
    """`owner/name` in lower case, from a repository's https address or from `owner/name` itself.

    A trailing slash and a final `.git` are not part of the name. The host is not compared: a store is
    called from the repository it is in, and that repository is on the host that runs the workflow.
    """
    path = urlsplit(address).path if "://" in address else address
    parts = [part for part in path.strip().split("/") if part]
    if parts and parts[-1].lower().endswith(".git"):
        parts[-1] = parts[-1][:-4]
    if len(parts) != 2 or not all(parts):
        raise Refused(f"{address!r} is not the address of a repository (https://<host>/<owner>/<name>)")
    return "/".join(parts).lower()


def same_repository(address: str, calling: str) -> bool:
    """Whether the address a project names is the repository `calling` (`owner/name`) that runs the workflow."""
    return repository_name(address) == repository_name(calling)


# --- identity ----------------------------------------------------------------------------------------

def identity(info: dict) -> dict:
    """What a store needs to know of a project, from `muro.project.summary` of its file.

    The version is the plugin's (it lives once, in `sources.json`); the tag is `repository.tag_prefix` of
    `project.json` and the version, or `<slug>-v<version>` for a project that names no repository.
    """
    plugin, meta = info["plugin"], info["project"]
    named = meta.get("repository")
    slug, version = plugin["slug"], plugin["version"]
    prefix = named["tag_prefix"] if named else f"{slug}-v"
    return {"slug": slug, "version": version, "name": plugin["name"], "tag": f"{prefix}{version}",
            "url": named["url"] if named else None, "branch": named["branch"] if named else None,
            "sha256": info["digest"]}


def _safe(value: str) -> bool:
    return bool(_SAFE.fullmatch(value)) and ".." not in value and not value.endswith(".lock")


def identity_refusals(found: dict) -> list[str]:
    """Why this project cannot be released from any repository: its plugin id, its version, its tag, its name."""
    slug, version, tag, name = found["slug"], found["version"], found["tag"], found["name"]
    said = []
    if slug == NOTES_FOLDER:
        said.append(f"A plugin named {NOTES_FOLDER} cannot have a store: {NOTES_FOLDER}/ is where the release notes are")
    if not _safe(version):
        said.append(f"The version {version!r} cannot be a release: it must be letters, digits, dots, "
                    "underscores and hyphens")
    elif not _safe(tag):
        said.append(f"The tag {tag!r} cannot be a Git tag: the tag prefix of project.json must be letters, digits, "
                    "dots, underscores and hyphens")
    if not name.strip() or any(ord(char) < 32 or ord(char) == 127 for char in name):
        said.append("The plugin's name must be one line of text")
    return said


def refusals(found: dict, *, file_name: str, calling: str, branch: str) -> list[str]:
    """Why this project is not released from this file, repository and branch: one sentence each, none when it is."""
    slug = found["slug"]
    said = []
    if file_name != slug + SUFFIX:
        said.append(f"The project file is named {file_name}, but its plugin is {slug}: name the file {slug}{SUFFIX}")
    said.extend(identity_refusals(found))
    if found["url"] is not None:
        try:
            same = same_repository(found["url"], calling)
        except Refused as exc:
            said.append(f"project.json: {exc}")
        else:
            if not same:
                said.append(f"project.json names the repository {found['url']}, but this is {calling}: "
                            "a project is released from its own repository")
        if found["branch"] != branch:
            said.append(f"project.json names the branch {found['branch']}, but the file was pushed to {branch}")
    return said


def release_problem(unpacked: Path, slug: str) -> str | None:
    """A project file with no built plugin has nothing to publish (`muro project verify` passes it)."""
    if (unpacked / "release" / slug).is_dir():
        return None
    return (f"The project file carries no built plugin (release/{slug}/): harmonize the project in Muro, "
            "which builds it, and push the file again")


def folder_problem(repository: Path, slug: str) -> str | None:
    """`<slug>/` is replaced whole at every release, so what is there must be an earlier build of this plugin."""
    folder = repository / slug
    if not folder.exists():
        return None
    try:
        built = json.loads((folder / "sources.json").read_text(encoding="utf-8"))["plugin"]["slug"]
    except (OSError, ValueError, KeyError, TypeError):
        built = None
    if folder.is_dir() and built == slug:
        return None
    return (f"{slug}/ is in the repository and is not the plugin {slug} built by Muro: a release replaces "
            "that folder, so move what is there")


# --- the tag -----------------------------------------------------------------------------------------

def tag_action(pushed: str, *, exists: bool, released: str | None = None, tagged: str | None = None) -> tuple[str, str]:
    """What a push does, from the SHA-256 of the pushed file and what the version's tag already holds.

    `released` is the SHA-256 of the project file among the assets of the tag's GitHub release, `tagged`
    the one of the project file in the tagged commit; each is None when there is none. The answers:
    `release` (no tag yet), `nothing` (this very file is released), `finish` (an earlier run made the tag
    from this file and stopped before the release had it) and `fail` (the version belongs to another file).
    """
    if not exists:
        return "release", "This version has no tag yet: it is released"
    if released == pushed:
        return "nothing", "This file is already released under this version: nothing to do"
    if released is None and tagged == pushed:
        return "finish", ("The tag was made from this file, but its release does not hold it: an earlier run "
                          "stopped half way, and this one finishes the release")
    return "fail", ALREADY_RELEASED


# --- the caller --------------------------------------------------------------------------------------

def muro_ref() -> str:
    """The tag of this Muro's own release: the ref a caller written by this Muro pins the store workflow to."""
    return f"{MURO_TAG_PREFIX}{__version__}"


def calls_store(text: str) -> bool:
    """Whether a workflow's text calls the store workflow."""
    return STORE_WORKFLOW.rsplit("/", 1)[1] in text


def _yaml_branch(branch: str) -> str:
    if _PLAIN.fullmatch(branch) and branch.lower() not in _YAML_WORDS:
        return branch
    return "'" + branch.replace("'", "''") + "'"


def caller_workflow(branch: str, ref: str) -> str:
    """The workflow a store repository keeps as `CALLER_PATH`: a push of a `.mp` on `branch` calls Muro's store
    workflow at `ref` (a Muro tag or a full commit). The page docs/project-store.md shows this very text."""
    return ("name: Release\n"
            "on:\n"
            "  push:\n"
            f"    branches: [{_yaml_branch(branch)}]\n"
            "    paths: ['*.mp']\n"
            "  workflow_dispatch:\n"
            "permissions: { contents: write }\n"
            "jobs:\n"
            "  store:\n"
            f"    uses: {MURO_REPOSITORY}/{STORE_WORKFLOW}@{ref}\n")
