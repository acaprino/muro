#!/usr/bin/env python3
"""What the project store workflow reads and decides (.github/workflows/project-store.yml, ADR-0034).

A store repository holds one Muro project file, `<slug>.mp`, and what a release generates from it. The
workflow's shell steps run commands; what reads a value of the file or decides something is here, as
functions that tests/test_project_store.py calls. Reading and checking a project file is the factory's
(`muro.project`): this script asks it, and adds only what a repository needs.

The pushed file is a stranger's until it is checked: no value of it reaches a shell variable, a path, a Git
ref or the workflow's outputs before `refusals` has held it to one safe line.

Standard library only. It runs from a checkout of Muro, whose root it puts on the import path.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from muro import project  # noqa: E402  (the factory, from the checkout this script is in)

SUFFIX = ".mp"
# Where the release notes of a store are kept, one file per tag. A plugin cannot have this id: its folder
# would be the same one.
NOTES_FOLDER = "releases"
ALREADY_RELEASED = "the same version was already released from another file: change the version"
# A version or a tag becomes a file name, a Git ref and a shell argument: letters, digits, dot, underscore
# and hyphen, starting and ending with a letter or a digit.
_SAFE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$")
_FENCE = re.compile(r"^\s*(```|~~~)")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class Refused(ValueError):
    """One plain sentence that says why nothing is released."""


# --- the file and the repository ---------------------------------------------------------------------

def find_project(repository: Path, named: str = "") -> str:
    """The name of the project file at the root of `repository`: the one `named`, or the only `.mp` there."""
    if named:
        if "/" in named or "\\" in named or not named.endswith(SUFFIX):
            raise Refused(f"{named!r} is not a {SUFFIX} file at the root of the repository, "
                          "where a store keeps its project file")
        if not (repository / named).is_file():
            raise Refused(f"{named} is not in the repository")
        return named
    found = sorted(path.name for path in repository.iterdir() if path.is_file() and path.name.endswith(SUFFIX))
    if not found:
        raise Refused(f"No project file: the root of the repository holds no {SUFFIX} file")
    if len(found) > 1:
        raise Refused(f"Several project files at the root of the repository ({', '.join(found)}): "
                      "name one with the input `project`")
    return found[0]


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


def refusals(found: dict, *, file_name: str, calling: str, branch: str) -> list[str]:
    """Why this project is not released from this file, repository and branch: one sentence each, none when it is."""
    slug, version, tag, name = found["slug"], found["version"], found["tag"], found["name"]
    said = []
    if file_name != slug + SUFFIX:
        said.append(f"The project file is named {file_name}, but its plugin is {slug}: name the file {slug}{SUFFIX}")
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


# --- the notes ---------------------------------------------------------------------------------------

def _headings(lines: list[str]) -> list[int]:
    """The indexes of the `# ` headings, without the lines of a fenced block that only look like one."""
    found, fenced = [], False
    for index, line in enumerate(lines):
        if _FENCE.match(line):
            fenced = not fenced
        elif not fenced and line.startswith("# "):
            found.append(index)
    return found


def changelog_entry(text: str, name: str, version: str) -> str:
    """The top entry of a project's `CHANGELOG.md`: from its first `# ` heading to the next one.

    An empty changelog gives the one line `# <name> <version>`; text under no heading is given that heading.
    """
    default = f"# {name} {version}"
    lines = text.splitlines()
    headings = _headings(lines)
    if not headings:
        body = text.strip()
        return f"{default}\n\n{body}" if body else default
    end = headings[1] if len(headings) > 1 else len(lines)
    return "\n".join(lines[headings[0]:end]).strip()


def release_notes(entry: str, *, file_name: str, sha256: str, repository: str, commit: str, muro: str) -> str:
    """The notes of a release: the changelog entry and one line that says where the release comes from."""
    return (f"{entry}\n\nReleased from `{file_name}` (SHA-256 `{sha256}`) as pushed to {repository} at commit "
            f"`{commit}`; the store was written by Muro at commit `{muro}`.\n")


# --- the workflow's side -----------------------------------------------------------------------------

def _emit(values: dict[str, str]) -> None:
    """The step's outputs: appended to the file GitHub names, printed where there is none."""
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    target = os.environ.get("GITHUB_OUTPUT")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(lines)
    else:
        sys.stdout.write(lines)


def _summary(line: str) -> None:
    print(line, file=sys.stderr)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def _stop(sentences: list[str]) -> int:
    """Each sentence as an error of the run. A sentence may quote the file, so it is held to one line: a line
    of its own in the log could be read as a command of the workflow."""
    for sentence in sentences:
        print("::error::" + _CONTROL.sub(" ", sentence), file=sys.stderr)
    return 1


def _run_find(args: argparse.Namespace) -> int:
    print(find_project(args.repository, args.project))
    return 0


def _run_identity(args: argparse.Namespace) -> int:
    read = project.summary(args.repository / args.file, args.cache)       # the factory's own reading and checks
    if "error" in read:
        return _stop([f"The project file cannot be read: {read['error']}"])
    found = identity(read)
    said = refusals(found, file_name=args.file, calling=args.calling, branch=args.branch)
    if not said:        # the slug is safe as a folder name only once the rules above hold
        said = [problem for problem in (release_problem(args.unpacked, found["slug"]),
                                        folder_problem(args.repository, found["slug"])) if problem]
    if said:
        return _stop(said)
    _emit({"file": args.file, **{key: found[key] for key in ("slug", "version", "name", "tag", "sha256")}})
    return 0


def _run_decide(args: argparse.Namespace) -> int:
    action, sentence = tag_action(args.pushed, exists=args.exists == "yes", released=args.released or None,
                                  tagged=args.tagged or None)
    if action == "fail":
        return _stop([f"{args.tag}: {sentence}"])
    _emit({"action": action})
    _summary(f"{args.tag}: {sentence}.")
    return 0


def _run_notes(args: argparse.Namespace) -> int:
    text = (args.unpacked / "CHANGELOG.md").read_text(encoding="utf-8")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(release_notes(changelog_entry(text, args.name, args.version), file_name=args.file,
                                      sha256=args.sha256, repository=args.calling, commit=args.commit,
                                      muro=args.muro), encoding="utf-8", newline="\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="What the project store workflow reads and decides")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("find", help="Print the name of the project file at the root of a repository")
    p.add_argument("repository", type=Path)
    p.add_argument("--project", default="", help="Its name, when the root holds several")
    p = sub.add_parser("identity", help="Check a project file against the repository it was pushed to "
                                        "and give the step its slug, version, name, tag and SHA-256")
    p.add_argument("repository", type=Path)
    p.add_argument("file", help="The project file's name, at the root of the repository")
    p.add_argument("--cache", type=Path, required=True, help="The cache `muro project verify` unpacked it into")
    p.add_argument("--unpacked", type=Path, required=True, help="The folder `muro project unpack` wrote")
    p.add_argument("--calling", required=True, help="The repository that runs the workflow, owner/name")
    p.add_argument("--branch", required=True, help="The branch the file was pushed to")
    p = sub.add_parser("decide", help="Release, finish, do nothing or fail, from what the version's tag holds")
    p.add_argument("--tag", required=True)
    p.add_argument("--pushed", required=True, help="The SHA-256 of the pushed file")
    p.add_argument("--exists", required=True, choices=("yes", "no"), help="Whether the tag exists")
    p.add_argument("--released", default="", help="The SHA-256 of the project file in the tag's release")
    p.add_argument("--tagged", default="", help="The SHA-256 of the project file in the tagged commit")
    p = sub.add_parser("notes", help="Write the release notes from the top entry of the project's changelog")
    p.add_argument("--unpacked", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    for option in ("name", "version", "file", "sha256", "calling", "commit", "muro"):
        p.add_argument(f"--{option}", required=True)
    args = parser.parse_args(argv)
    try:
        return {"find": _run_find, "identity": _run_identity, "decide": _run_decide, "notes": _run_notes}[args.command](args)
    except Refused as exc:
        return _stop([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
