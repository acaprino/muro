#!/usr/bin/env python3
"""What the project store workflow reads and decides (.github/workflows/project-store.yml, ADR-0034).

A store repository holds one Muro project file, `<slug>.mp`, and what a release generates from it. The
workflow's shell steps run commands; what reads a value of the file or decides something is Python, as
functions that tests/test_project_store.py calls. The rules a project file is held to are the factory's
(`muro.project_store`), where `muro project release` applies the same ones before a file is pushed; reading and
checking a project file is the factory's too (`muro.project`). This script is the workflow's side: finding the
file in the repository, the notes of a release, and the step's outputs.

The pushed file is a stranger's until it is checked: no value of it reaches a shell variable, a path, a Git
ref or the workflow's outputs before `refusals` has held it to one safe line.

Standard library only. It runs from a checkout of Muro, whose root it puts on the import path.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from muro import project  # noqa: E402  (the factory, from the checkout this script is in)
from muro.project_store import (  # noqa: E402, F401  (the rules, which the tests reach through this script)
    ALREADY_RELEASED, NOTES_FOLDER, SUFFIX, Refused, folder_problem, identity, identity_refusals, refusals,
    release_problem, repository_name, same_repository, tag_action)

_FENCE = re.compile(r"^\s*(```|~~~)")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


# --- the file in the repository ----------------------------------------------------------------------

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
