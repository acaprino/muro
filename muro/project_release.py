# muro/project_release.py
"""`muro project release`: put a project's file into its repository, where a push of the file is a release (ADR-0034).

The repository of a project is a plugin store, and its workflow releases the `<slug>.mp` that is pushed to it. This
module is the push, from the person's computer, with the person's own Git: its identity, its credentials, its
configuration. Muro handles no token and forces nothing.

What is done, in a scratch folder that is removed at the end:

1. the file is copied, and everything after reads that copy: its digest, its identity (`muro.project.summary`),
   `muro project verify`'s check, and the rules of a store (`muro.project_store`, the ones the workflow applies);
2. the tip of the repository's branch is fetched, one commit deep and with no checkout: a stranger's tree is never
   written to the disk, only the files a rule reads;
3. the same file already there is nothing to do; a version whose tag exists belongs to the file it was released
   from; otherwise the file is committed as `<slug>.mp` on top of that tip and pushed to the branch.

Git is run through `muro.sources._git`: an argv list, no shell, no prompt, a time limit. An address from a project
file is a stranger's: only `https://` and `file://`, and a branch that is a plain name. No address with a user name
or a password in it reaches the output or an error.
"""
from __future__ import annotations

import hashlib
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from . import project, project_store as store
from .project_work import CHANGED
from .sources import _blob, _git, _tagged_commit, read_blobs, tree_entries

# The steps that move a whole project file: the fetch of the tip, the commit and the push. Seconds.
NETWORK_TIMEOUT = 900.0
NO_REPOSITORY = "This project names no repository: give it one with `muro project edit --repository`"
NO_IDENTITY = ('Git does not know who you are ("Please tell me who you are"): set your name and your email with '
               '`git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`')
NO_CALLER = ("No workflow of the repository calls Muro's store workflow, so nothing builds the store or publishes "
             "the release there: run this command with --init, or add the caller of docs/project-store.md as "
             f"{store.CALLER_PATH}")
# The scratch repository's own branch: the name of the project's branch is used only in what is fetched and pushed.
_LOCAL = "refs/heads/muro-release"
# A branch becomes a Git ref, an argument and a line of the caller's YAML.
_BRANCH = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$")
_USERINFO = re.compile(r"(?<=://)[^/\s@]+@")
# Git's own modes of a plain file, as `tree_entries` gives them.
_FILE_MODES = ("100644", "100755")


def public_address(url: str) -> str:
    """The address without a user name or a password: the only form that is printed."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(netloc=parts.netloc.rpartition("@")[2]))


def _scrub(text: str, url: str | None) -> str:
    """An error's text, with no user name or password of an address in it (Git quotes the address it was given)."""
    if url:
        text = text.replace(url, public_address(url))
    return _USERINFO.sub("", text)


def _address(url: Any) -> str:
    """The address Git is given: https, or a folder of this computer. A `file://` address that names a host, or a
    path that starts as a network share does, would have Windows sign in to a machine a stranger's file chose."""
    if (not isinstance(url, str) or not url.startswith(("https://", "file:///")) or url.startswith("file:////")
            or any(char.isspace() or ord(char) < 32 or ord(char) == 127 or char == "\\" for char in url)):
        raise ValueError("The repository address of project.json must be an https:// address (or a file:// one, "
                         "for a repository on this computer)")
    return url


def _branch(name: Any) -> str:
    if (not isinstance(name, str) or not _BRANCH.fullmatch(name) or ".." in name or "//" in name
            or name.endswith(".lock")):
        raise ValueError(f"The branch {name!r} of project.json cannot be pushed to: a branch here is letters, "
                         "digits, dots, underscores, hyphens and slashes")
    return name


def _identity(mp: Path, cache_root: Path) -> dict:
    """The project's identity as a store reads it, once the file is a project that a store can publish."""
    read = project.summary(mp, cache_root)
    if "error" in read:
        raise ValueError(f"The project file cannot be read: {read['error']}")
    found = store.identity(read)
    if found["url"] is None:
        raise ValueError(NO_REPOSITORY)
    said = store.identity_refusals(found)
    if said:
        raise ValueError("; ".join(said))
    project.verify(mp, cache_root)
    problem = store.release_problem(project.cached(mp, cache_root), found["slug"])
    if problem:
        raise ValueError(problem)
    return found


def _who(repo: Path) -> None:
    """Refuse before anything is fetched when the commit would have no author: Git never guesses one here."""
    for ident in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
        try:
            _git(repo, "-c", "user.useConfigOnly=true", "var", ident)
        except ValueError:
            raise ValueError(NO_IDENTITY) from None


def _remote(repo: Path, url: str, tag: str) -> tuple[set[str], bool]:
    """The branches of the repository, and whether the version's tag is there. One call."""
    try:
        listing = _git(repo, "ls-remote", "--", url, timeout=NETWORK_TIMEOUT).decode("utf-8", "replace")
    except ValueError as exc:
        raise ValueError(f"The repository cannot be reached: {exc}") from None
    refs = [parts[1] for parts in (line.split("\t") for line in listing.splitlines()) if len(parts) == 2]
    heads = {ref.removeprefix("refs/heads/") for ref in refs if ref.startswith("refs/heads/")}
    return heads, _tagged_commit(listing, tag) is not None


def _folder_problem(seen: Path, repo: Path, tip: str, entries: dict, slug: str) -> str | None:
    """`store.folder_problem` on the tip, of which only what that rule reads is written: `<slug>/sources.json`."""
    seen.mkdir()
    if slug in entries:                                     # a file where the plugin's folder goes
        (seen / slug).write_bytes(b"")
    elif any(path.startswith(f"{slug}/") for path in entries):
        (seen / slug).mkdir()
        if entries.get(f"{slug}/sources.json", ("",))[0] in _FILE_MODES:
            (seen / slug / "sources.json").write_bytes(_blob(repo, tip, f"{slug}/sources.json"))
    return store.folder_problem(seen, slug)


def _callers(repo: Path, tip: str, entries: dict) -> list[str]:
    """The workflows of the tip that call the store workflow."""
    names = sorted(path for path, (mode, _size) in entries.items()
                   if path.startswith(".github/workflows/") and mode in _FILE_MODES)
    texts = read_blobs(repo, tip, names)
    return [name for name in names if store.calls_store(texts[name].decode("utf-8", "replace"))]


def _stage(repo: Path, path: Path, name: str) -> None:
    """Put a file in the index under `name`, byte for byte: no filter and no line ending of the person's Git."""
    blob = _git(repo, "hash-object", "-w", "--no-filters", "--", str(path), timeout=NETWORK_TIMEOUT)
    _git(repo, "update-index", "--add", "--cacheinfo", f"100644,{blob.decode('ascii').strip()},{name}")


def _push(repo: Path, url: str, branch: str) -> None:
    """The commit to the branch, as a plain push: a branch that moved refuses it, and nothing is forced."""
    _git(repo, "push", "-q", "--", url, f"HEAD:refs/heads/{branch}", timeout=NETWORK_TIMEOUT)


def release(mp: Path, *, cache_root: Path, expect_digest: str | None = None, init: bool = False,
            dry_run: bool = False) -> tuple[dict[str, Any], list[str]]:
    """Put the project file `mp` into the repository its `project.json` names, as `<slug>.mp` on its branch.

    Returns the document `{repository, branch, file, version, tag, pushed, commit, initialized, reason}` and the
    warnings. `pushed` is false when the repository already holds this very file and with `dry_run`; `commit` is
    the pushed commit, or None. `initialized` says that the commit carries the caller workflow (`init`, for a
    repository that has none). Raises ValueError with one sentence when nothing is released.
    """
    mp = Path(mp)
    if not mp.is_file():
        raise ValueError(f"The project file is missing: {mp}")
    url = None
    with tempfile.TemporaryDirectory(prefix="muro-release-", ignore_cleanup_errors=True) as folder:
        scratch = Path(folder)
        try:
            copy = scratch / "project.mp"
            shutil.copyfile(mp, copy)
            sha = project.digest(copy)
            if expect_digest is not None and sha != expect_digest:
                raise ValueError(CHANGED)
            found = _identity(copy, cache_root)
            url, branch = _address(found["url"]), _branch(found["branch"])
            return _release(scratch, copy, sha, found, url, branch, init=init, dry_run=dry_run)
        except (OSError, ValueError) as exc:
            raise ValueError(_scrub(str(exc) or type(exc).__name__, url)) from None


def _release(scratch: Path, copy: Path, sha: str, found: dict, url: str, branch: str, *, init: bool,
             dry_run: bool) -> tuple[dict[str, Any], list[str]]:
    slug, version, tag = found["slug"], found["version"], found["tag"]
    name = slug + store.SUFFIX
    document = {"repository": public_address(url), "branch": branch, "file": name, "version": version, "tag": tag,
                "pushed": False, "commit": None, "initialized": False, "reason": ""}
    warnings: list[str] = []
    if "@" in urlsplit(url).netloc:
        warnings.append("The repository address in project.json holds a user name or a password, and the file is "
                        "published with it: take it out with `muro project edit --repository`")

    if shutil.which("git") is None:
        raise ValueError("Git is not installed, or not on PATH: a project is released with your own Git")
    repo = scratch / "store"
    repo.mkdir()
    _git(repo, "init", "-q")
    _git(repo, "symbolic-ref", "HEAD", _LOCAL)
    _who(repo)

    heads, tagged = _remote(repo, url, tag)
    held, callers, entries = None, [], {}
    if branch in heads:
        _git(repo, "fetch", "-q", "--depth=1", "--no-tags", "--", url, f"refs/heads/{branch}", timeout=NETWORK_TIMEOUT)
        tip = _git(repo, "rev-parse", "--verify", "FETCH_HEAD^{commit}").decode("ascii").strip()
        _git(repo, "update-ref", _LOCAL, tip)
        _git(repo, "read-tree", tip)
        entries = tree_entries(repo, tip)
        if entries.get(name, ("",))[0] in _FILE_MODES:
            held = hashlib.sha256(_blob(repo, tip, name)).hexdigest()
        problem = _folder_problem(scratch / "tip", repo, tip, entries, slug)
        if problem:
            raise ValueError(problem)
        callers = _callers(repo, tip, entries)
    elif heads:
        raise ValueError(f"The repository has no branch {branch}: create it there, or name the project's branch with "
                         "`muro project edit --repository URL --branch NAME`")

    action, sentence = store.tag_action(sha, exists=tagged, released=held)
    if action == "fail":
        raise ValueError(f"{tag}: {sentence}")
    same = held == sha
    add_caller = False
    if not callers:
        if not init:
            warnings.append(NO_CALLER)
        elif store.CALLER_PATH in entries:
            raise ValueError(f"{store.CALLER_PATH} is in the repository and does not call Muro's store workflow: "
                             "--init does not replace it. Add the caller of docs/project-store.md to the repository "
                             "by hand")
        else:
            add_caller = True

    if same and not add_caller:
        document["reason"] = " ".join([
            f"{sentence}." if action == "nothing" else
            f"The repository already holds this file as {name}, and its version has no tag yet: nothing to push. "
            "Run the repository's workflow by hand to release it.", *warnings])
        return document, warnings

    if not same:
        _stage(repo, copy, name)
    if add_caller:
        caller = scratch / "caller.yml"
        caller.write_bytes(store.caller_workflow(branch, store.muro_ref()).encode("utf-8"))
        _stage(repo, caller, store.CALLER_PATH)
    message = f"{found['name']} {version}" if not same else f"{found['name']}: the release workflow"
    try:
        _git(repo, "-c", "user.useConfigOnly=true", "commit", "-q", "-m", message, timeout=NETWORK_TIMEOUT)
    except ValueError as exc:
        raise ValueError(f"Git did not make the commit: {exc}") from None
    commit = _git(repo, "rev-parse", "HEAD").decode("ascii").strip()

    carried = " and ".join(([name] if not same else []) + ([store.CALLER_PATH] if add_caller else []))
    document["initialized"] = add_caller
    if dry_run:
        document["reason"] = " ".join([f"Dry run: nothing was pushed. It would push {carried} to {branch} as the "
                                       f"commit \"{message}\".", *warnings])
        return document, warnings
    try:
        _push(repo, url, branch)
    except ValueError as exc:
        raise ValueError(f"The push to {branch} was refused, and nothing was forced: {exc}") from None
    document.update(pushed=True, commit=commit)
    if same:
        said = (f"The repository already holds this file as {name}; {store.CALLER_PATH} was pushed to {branch}. "
                + (f"Its version is already tagged {tag}." if tagged else
                   f"Run that workflow by hand to release it as {tag}."))
    else:
        said = f"Pushed {carried} to {branch}." + (
            f" The repository's workflow releases it as {tag}." if callers or add_caller else "")
    document["reason"] = " ".join([said, *warnings])
    return document, warnings
