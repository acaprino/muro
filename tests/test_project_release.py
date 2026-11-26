"""`muro project release`: a project's file goes into its repository, where a push of it is a release (ADR-0034).

Every remote here is a bare repository on this disk, named by a `file://` address: nothing reaches the network.
So these tests prove what the command reads, decides, commits and pushes with Git, and what it refuses. They do not
prove a push to GitHub, a credential, or that the repository's workflow starts.
"""
import hashlib
import json
import subprocess
import tempfile
import zipfile

import pytest

import muro
from muro import project, project_release, project_store as rules
from muro.cli import main
from muro.project_work import CHANGED
from routing_helpers import ROOT
from test_project_file import (PROJECT_JSON, SLUG, build_release, cache, git, make_package, upstream,  # noqa: F401
                               with_members)

FILE = f"{SLUG}.mp"
TAG = "tester-v0.1.0"
KEYS = {"repository", "branch", "file", "version", "tag", "pushed", "commit", "initialized", "reason"}
OTHER_CALLER = "name: Store\non: workflow_dispatch\njobs:\n  store:\n    uses: someone/factory/.github/workflows/project-store.yml@abc\n"


@pytest.fixture(autouse=True)
def person(tmp_path, monkeypatch):
    """A person's Git: a name and an email in a configuration of their own, and nothing of this machine's. The
    scratch folders of a release go to a folder that must be empty again when the test ends."""
    config = tmp_path / "gitconfig"
    config.write_text("[user]\n\tname = A Person\n\temail = person@example.invalid\n", encoding="utf-8")
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(config))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.setenv("LC_ALL", "C")
    for name in ("GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"):
        monkeypatch.delenv(name, raising=False)
    temp = tmp_path / "temp"
    temp.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(temp))
    yield config
    assert list(temp.iterdir()) == [], "a release leaves no scratch folder"


@pytest.fixture(scope="module")
def base(tmp_path_factory, upstream, cache):
    """One project file with a built release, packed by the factory: the tests change copies of it."""
    root = tmp_path_factory.mktemp("base")
    return project.pack(make_package(root / "pkg", *upstream), root / "base.mp", sources_cache=cache,
                        release_dir=build_release(root / "staged"))


def variant(base, out, url, *, branch="main", version="0.1.0", changelog=None, built=True, prefix="tester-v"):
    """The project file as its owner would have it for the repository `url` (None: it names none)."""
    with zipfile.ZipFile(base) as archive:
        names = archive.namelist()
        manifest = json.loads(archive.read("sources.json"))
        staged = json.loads(archive.read(f"release/{SLUG}/sources.json"))
    manifest["plugin"]["version"] = staged["plugin"]["version"] = version
    named = None if url is None else {"url": url, "branch": branch, "tag_prefix": prefix}
    changes = {"project.json": json.dumps({**PROJECT_JSON, "version": version, "repository": named}).encode("utf-8"),
               "sources.json": json.dumps(manifest).encode("utf-8"),
               f"release/{SLUG}/sources.json": json.dumps(staged).encode("utf-8")}
    if changelog is not None:
        changes["CHANGELOG.md"] = changelog.encode("utf-8")
    if not built:
        changes.update({name: None for name in names if name.startswith("release/")})
    return with_members(base, out, changes)


def bare(path):
    path.mkdir(parents=True)
    git(path, "init", "-q", "--bare")
    return path


def commit_to(remote, work, files, message="one", branch="main"):
    """A commit with `files` on the branch of `remote`, from a clone of someone else: its id."""
    if not work.exists():
        work.mkdir(parents=True)
        git(work, "init", "-q")
        git(work, "symbolic-ref", "HEAD", f"refs/heads/{branch}")
        if branch in heads(remote):
            git(work, "pull", "-q", remote.as_uri(), f"refs/heads/{branch}")
    for name, text in files.items():
        (work / name).parent.mkdir(parents=True, exist_ok=True)
        (work / name).write_bytes(text.encode("utf-8"))
    git(work, "add", "--all")
    git(work, "commit", "-qm", message)
    git(work, "push", "-q", remote.as_uri(), f"HEAD:refs/heads/{branch}")
    return git(work, "rev-parse", "HEAD")


def heads(remote):
    return [ref.removeprefix("refs/heads/") for ref in git(remote, "for-each-ref", "--format=%(refname)", "refs/heads").split()]


def tip(remote, branch="main"):
    return git(remote, "rev-parse", f"refs/heads/{branch}")


def files(remote, branch="main"):
    return git(remote, "ls-tree", "-r", "--name-only", branch).splitlines()


def subjects(remote, branch="main"):
    return git(remote, "log", "--format=%s", branch).splitlines()


def blob(remote, path, branch="main"):
    return subprocess.run(["git", "-C", str(remote), "cat-file", "blob", f"{branch}:{path}"], check=True,
                          capture_output=True).stdout


def run(capsys, tmp_path, mp, *options):
    """The command, as the terminal has it: its exit code, the JSON of stdout (None when empty) and stderr."""
    code = main(["project", "release", str(mp), "--cache", str(tmp_path / "unpacked"), *options])
    out, err = capsys.readouterr()
    return code, json.loads(out) if out.strip() else None, err


# --- the first release ------------------------------------------------------------------------------

def test_the_first_release_creates_the_branch_of_an_empty_repository(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "a-local-name.mp", remote.as_uri())
    code, said, err = run(capsys, tmp_path, mp)
    assert code == 0, err
    assert set(said) == KEYS
    assert said == {**said, "repository": remote.as_uri(), "branch": "main", "file": FILE, "version": "0.1.0", "tag": TAG,
                    "pushed": True, "commit": tip(remote), "initialized": False}
    assert heads(remote) == ["main"] and files(remote) == [FILE] and subjects(remote) == ["Tester 0.1.0"]
    assert hashlib.sha256(blob(remote, FILE)).hexdigest() == project.digest(mp)        # byte for byte
    assert git(remote, "log", "--format=%an <%ae>|%cn <%ce>", "main") == (
        "A Person <person@example.invalid>|A Person <person@example.invalid>")
    assert said["reason"].startswith(f"Pushed {FILE} to main.")


def test_a_release_into_a_repository_with_history_is_one_commit_on_its_tip(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    first = commit_to(remote, tmp_path / "theirs", {"README.md": "A store.\n", ".github/workflows/store.yml": OTHER_CALLER,
                                                    "docs/notes.md": "kept\n"})
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    code, said, err = run(capsys, tmp_path, mp)
    assert code == 0 and err == "", err                      # a repository with a caller gets no warning
    assert subjects(remote) == ["Tester 0.1.0", "one"]
    assert git(remote, "rev-parse", "main^") == first and said["commit"] == tip(remote)
    assert files(remote) == [".github/workflows/store.yml", "README.md", "docs/notes.md", FILE]
    assert git(remote, "diff", "--name-only", "main^", "main") == FILE
    assert said["reason"] == f"Pushed {FILE} to main. The repository's workflow releases it as {TAG}."


# --- the second time --------------------------------------------------------------------------------

def test_the_same_file_already_there_is_nothing_to_do(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    assert run(capsys, tmp_path, mp)[0] == 0
    pushed = tip(remote)
    code, said, _err = run(capsys, tmp_path, mp)
    assert code == 0 and tip(remote) == pushed
    assert (said["pushed"], said["commit"], said["initialized"]) == (False, None, False)
    assert said["reason"].startswith(f"The repository already holds this file as {FILE}, and its version has no tag yet")
    git(remote, "tag", TAG, "main")                          # what the repository's workflow does
    code, said, _err = run(capsys, tmp_path, mp)
    assert code == 0 and tip(remote) == pushed and said["pushed"] is False
    assert said["reason"].startswith("This file is already released under this version: nothing to do.")


def test_a_changed_file_with_a_new_version_is_pushed(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    assert run(capsys, tmp_path, variant(base, tmp_path / "one.mp", remote.as_uri()))[0] == 0
    git(remote, "tag", TAG, "main")
    newer = variant(base, tmp_path / "two.mp", remote.as_uri(), version="0.2.0")
    code, said, _err = run(capsys, tmp_path, newer)
    assert code == 0 and (said["pushed"], said["version"], said["tag"]) == (True, "0.2.0", "tester-v0.2.0")
    assert subjects(remote) == ["Tester 0.2.0", "Tester 0.1.0"] and files(remote) == [FILE]
    assert hashlib.sha256(blob(remote, FILE)).hexdigest() == project.digest(newer)


def test_another_file_under_a_released_version_is_refused(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    assert run(capsys, tmp_path, variant(base, tmp_path / "one.mp", remote.as_uri()))[0] == 0
    released = tip(remote)
    other = variant(base, tmp_path / "other.mp", remote.as_uri(), changelog="# Tester 0.1.0\n\nChanged after.\n")
    git(remote, "tag", TAG, "main")
    code, said, err = run(capsys, tmp_path, other)
    assert (code, said) == (1, None)
    assert err == f"Project release failed: {TAG}: {rules.ALREADY_RELEASED}\n"
    assert tip(remote) == released
    git(remote, "tag", "-d", TAG)                            # a version that was never released is not held
    code, said, _err = run(capsys, tmp_path, other)
    assert code == 0 and said["pushed"] is True and subjects(remote) == ["Tester 0.1.0", "Tester 0.1.0"]


# --- what is refused --------------------------------------------------------------------------------

def refused(capsys, tmp_path, mp, *options):
    code, said, err = run(capsys, tmp_path, mp, *options)
    assert (code, said) == (1, None), "a refusal prints no document"
    assert err.startswith("Project release failed: ") and err.count("\n") == 1, err
    return err.removeprefix("Project release failed: ").rstrip("\n")


def test_a_project_with_no_repository_is_refused(tmp_path, capsys, base):
    assert refused(capsys, tmp_path, variant(base, tmp_path / "t.mp", None)) == (
        "This project names no repository: give it one with `muro project edit --repository`")


def test_a_project_with_no_built_release_is_refused(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri(), built=False)
    assert project.verify(mp, tmp_path / "unpacked") is None            # verify passes it: a store cannot publish it
    assert "The project file carries no built plugin (release/tester/)" in refused(capsys, tmp_path, mp)
    assert heads(remote) == []


def test_a_file_with_another_digest_is_refused_with_the_sentence_of_an_edit(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    assert refused(capsys, tmp_path, mp, "--expect-digest", "0" * 64) == CHANGED
    assert heads(remote) == []
    assert run(capsys, tmp_path, mp, "--expect-digest", project.digest(mp))[0] == 0


def test_what_is_not_a_project_file_is_refused(tmp_path, capsys):
    (tmp_path / "notes.mp").write_bytes(b"not a zip")
    assert refused(capsys, tmp_path, tmp_path / "notes.mp") == (
        "The project file cannot be read: Not a Muro project file: it is not a zip archive")
    assert refused(capsys, tmp_path, tmp_path / "absent.mp").startswith("The project file is missing: ")


def test_a_release_that_was_not_built_from_the_project_is_refused(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    with zipfile.ZipFile(mp) as archive:
        staged = json.loads(archive.read(f"release/{SLUG}/sources.json"))
    staged["plugin"]["version"] = "9.9.9"
    strange = with_members(mp, tmp_path / "s.mp", {f"release/{SLUG}/sources.json": json.dumps(staged).encode("utf-8")})
    assert refused(capsys, tmp_path, strange).startswith(project.MISMATCH)
    assert heads(remote) == []


@pytest.mark.parametrize("url", ["git@example.invalid:someone/tester.git", "ssh://example.invalid/someone/tester.git",
                                 "ext::sh -c id", "--upload-pack=id", "http://example.invalid/someone/tester",
                                 "https://example.invalid/some one/tester", "file://host.invalid/share/tester.git",
                                 "file:////host.invalid/share/tester.git", "file:///\\\\host.invalid\\share"])
def test_an_address_that_is_not_https_or_a_file_is_refused_before_git_sees_it(tmp_path, capsys, base, url, monkeypatch):
    monkeypatch.setattr(project_release, "_git", lambda *args, **options: pytest.fail("Git was run"))
    assert refused(capsys, tmp_path, variant(base, tmp_path / "t.mp", url)).startswith(
        "The repository address of project.json must be an https:// address")


@pytest.mark.parametrize("branch", ["-main", "two words", "main;id", "a..b", "main.lock", "feature//x", "trial/", ""])
def test_a_branch_that_is_not_a_plain_name_is_refused_before_git_sees_it(tmp_path, capsys, base, branch, monkeypatch):
    monkeypatch.setattr(project_release, "_git", lambda *args, **options: pytest.fail("Git was run"))
    mp = variant(base, tmp_path / "t.mp", (tmp_path / "store.git").as_uri(), branch=branch)
    assert f"The branch {branch!r} of project.json cannot be pushed to" in refused(capsys, tmp_path, mp)


@pytest.mark.parametrize("version,prefix,why", [("1.0;id", "tester-v", "cannot be a release"),
                                                ("0.1.0", "v/", "cannot be a Git tag")])
def test_the_rules_of_a_store_hold_the_file_before_it_leaves(tmp_path, capsys, base, version, prefix, why):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri(), version=version, prefix=prefix)
    assert why in refused(capsys, tmp_path, mp)
    assert heads(remote) == []


def test_a_repository_that_lacks_the_branch_is_refused_unless_it_is_empty(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    commit_to(remote, tmp_path / "theirs", {"README.md": "A store.\n"}, branch="trunk")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    assert refused(capsys, tmp_path, mp).startswith("The repository has no branch main: create it there")
    assert heads(remote) == ["trunk"]


def test_a_repository_that_cannot_be_reached_is_said(tmp_path, capsys, base):
    mp = variant(base, tmp_path / "t.mp", (tmp_path / "nowhere.git").as_uri())
    code, said, err = run(capsys, tmp_path, mp)
    assert (code, said) == (1, None) and err.startswith("Project release failed: The repository cannot be reached: ")


def test_a_folder_of_the_repository_that_a_release_would_replace_is_refused(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    held = commit_to(remote, tmp_path / "theirs", {f"{SLUG}/notes.md": "the repository's own\n"})
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    assert refused(capsys, tmp_path, mp) == rules.folder_problem(tmp_path / "theirs", SLUG)
    assert tip(remote) == held
    built = json.dumps({"plugin": {"slug": SLUG}})                  # an earlier build of this plugin is replaced
    commit_to(remote, tmp_path / "theirs", {f"{SLUG}/sources.json": built}, message="two")
    assert run(capsys, tmp_path, mp)[0] == 0
    assert files(remote) == [f"{SLUG}.mp", f"{SLUG}/notes.md", f"{SLUG}/sources.json"]


def test_git_that_does_not_know_the_person_is_refused_before_the_repository_is_asked(tmp_path, capsys, base, person):
    person.write_text("", encoding="utf-8")
    mp = variant(base, tmp_path / "t.mp", (tmp_path / "nowhere.git").as_uri())
    said = refused(capsys, tmp_path, mp)
    assert said == project_release.NO_IDENTITY and "Please tell me who you are" in said and "git config --global user.email" in said


# --- the caller -------------------------------------------------------------------------------------

def test_without_init_a_repository_with_no_caller_is_released_into_with_a_warning(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "t.mp", remote.as_uri()))
    assert code == 0 and said["pushed"] is True and said["initialized"] is False and files(remote) == [FILE]
    assert err == f"Warning: {project_release.NO_CALLER}\n"
    assert "nothing builds the store" in err and "--init" in err and "docs/project-store.md" in err
    assert said["reason"] == f"Pushed {FILE} to main. {project_release.NO_CALLER}"


def test_init_adds_the_caller_once_pinned_to_this_muro(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "one.mp", remote.as_uri()), "--init")
    assert code == 0 and err == "" and said["initialized"] is True and said["pushed"] is True
    assert files(remote) == [rules.CALLER_PATH, FILE] and subjects(remote) == ["Tester 0.1.0"]
    caller = blob(remote, rules.CALLER_PATH)
    assert caller == rules.caller_workflow("main", f"muro-v{muro.__version__}").encode("utf-8") and b"\r" not in caller
    assert f"    uses: acaprino/muro/.github/workflows/project-store.yml@muro-v{muro.__version__}\n".encode() in caller
    assert said["reason"] == (f"Pushed {FILE} and {rules.CALLER_PATH} to main. "
                              f"The repository's workflow releases it as {TAG}.")
    written = git(remote, "rev-parse", f"main:{rules.CALLER_PATH}")
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "two.mp", remote.as_uri(), version="0.2.0"), "--init")
    assert code == 0 and err == "" and said["initialized"] is False
    assert git(remote, "rev-parse", f"main:{rules.CALLER_PATH}") == written
    assert git(remote, "diff", "--name-only", "main^", "main") == FILE


def test_init_leaves_a_caller_under_another_name_and_never_replaces_a_workflow(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    commit_to(remote, tmp_path / "theirs", {".github/workflows/store.yml": OTHER_CALLER})
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    code, said, err = run(capsys, tmp_path, mp, "--init")
    assert code == 0 and err == "" and said["initialized"] is False
    assert files(remote) == [".github/workflows/store.yml", FILE]

    own = bare(tmp_path / "own.git")
    held = commit_to(own, tmp_path / "mine", {rules.CALLER_PATH: "name: Release\non: push\njobs: {}\n"})
    mp = variant(base, tmp_path / "o.mp", own.as_uri())
    assert refused(capsys, tmp_path, mp, "--init").startswith(
        f"{rules.CALLER_PATH} is in the repository and does not call Muro's store workflow: --init does not replace it")
    assert tip(own) == held


def test_init_on_a_file_that_is_already_there_pushes_the_caller_alone(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    assert run(capsys, tmp_path, mp)[0] == 0
    code, said, err = run(capsys, tmp_path, mp, "--init")
    assert code == 0 and err == "" and (said["pushed"], said["initialized"]) == (True, True)
    assert subjects(remote) == ["Tester: the release workflow", "Tester 0.1.0"]
    assert git(remote, "diff", "--name-only", "main^", "main") == rules.CALLER_PATH
    assert said["reason"] == (f"The repository already holds this file as {FILE}; {rules.CALLER_PATH} was pushed to main. "
                              f"Run that workflow by hand to release it as {TAG}.")


@pytest.mark.parametrize("branch,written", [("main", "[main]"), ("release/1.x", "[release/1.x]"), ("on", "['on']"),
                                            ("1.0", "['1.0']"), ("true", "['true']")])
def test_the_caller_names_the_branch_as_yaml_reads_a_name(branch, written):
    assert f"    branches: {written}\n" in rules.caller_workflow(branch, "muro-v1.0.0")


def test_the_page_the_workflow_and_the_release_settings_say_what_the_factory_says():
    page = (ROOT / "docs" / "project-store.md").read_text(encoding="utf-8")
    assert page.split("```yaml\n")[1].split("```")[0] == rules.caller_workflow("main", "<ref>")
    workflow = (ROOT / rules.STORE_WORKFLOW).read_text(encoding="utf-8")
    assert f"job.workflow_repository || '{rules.MURO_REPOSITORY}'" in workflow
    settings = json.loads((ROOT / ".github" / "release.json").read_text(encoding="utf-8"))
    assert settings["tagPrefix"] == rules.MURO_TAG_PREFIX and rules.muro_ref() == f"muro-v{muro.__version__}"
    assert rules.calls_store(rules.caller_workflow("main", "<ref>")) and not rules.calls_store("name: Tests\n")


# --- a dry run --------------------------------------------------------------------------------------

def test_a_dry_run_pushes_nothing_and_says_what_it_would_push(tmp_path, capsys, base):
    remote = bare(tmp_path / "store.git")
    mp = variant(base, tmp_path / "t.mp", remote.as_uri())
    code, said, err = run(capsys, tmp_path, mp, "--dry-run", "--init")
    assert code == 0 and err == "" and heads(remote) == []
    assert (said["pushed"], said["commit"], said["initialized"]) == (False, None, True)
    assert said["reason"] == (f"Dry run: nothing was pushed. It would push {FILE} and {rules.CALLER_PATH} to main as the "
                              'commit "Tester 0.1.0".')
    held = commit_to(remote, tmp_path / "theirs", {"README.md": "A store.\n"})
    code, said, err = run(capsys, tmp_path, mp, "--dry-run")
    assert code == 0 and tip(remote) == held and files(remote) == ["README.md"]
    assert said["reason"].startswith(f'Dry run: nothing was pushed. It would push {FILE} to main as the commit "Tester 0.1.0".')
    assert err.startswith("Warning: ")


# --- a branch that moved ----------------------------------------------------------------------------

def test_a_branch_that_moved_before_the_push_is_reported_and_nothing_is_forced(tmp_path, capsys, base, monkeypatch):
    remote = bare(tmp_path / "store.git")
    commit_to(remote, tmp_path / "theirs", {"README.md": "A store.\n"})
    push, moved = project_release._push, []

    def someone_pushes_first(repo, url, branch):
        moved.append(commit_to(remote, tmp_path / "theirs", {"README.md": "A store, changed.\n"}, message="two"))
        push(repo, url, branch)

    monkeypatch.setattr(project_release, "_push", someone_pushes_first)
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "t.mp", remote.as_uri()))
    assert (code, said) == (1, None)
    assert err.startswith("Project release failed: The push to main was refused, and nothing was forced: ")
    assert "rejected" in err                                  # Git's own words, as they are
    assert [tip(remote)] == moved and files(remote) == ["README.md"] and subjects(remote) == ["two", "one"]


# --- no user name and no password is printed --------------------------------------------------------

SECRET = "https://person:s3cret@example.invalid/someone/tester.git"
PUBLIC = "https://example.invalid/someone/tester.git"


def test_the_address_is_printed_without_its_user_name_and_password(tmp_path, capsys, base, monkeypatch):
    remote = bare(tmp_path / "store.git")
    real = project_release._git

    def elsewhere(path, *args, **options):        # the address of the project is served by the repository on this disk
        return real(path, *[remote.as_uri() if arg == SECRET else arg for arg in args], **options)

    monkeypatch.setattr(project_release, "_git", elsewhere)
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "t.mp", SECRET))
    assert code == 0 and files(remote) == [FILE]
    assert set(said) == KEYS and said["repository"] == PUBLIC
    assert "holds a user name or a password" in err
    for text in (json.dumps(said), err):
        assert "s3cret" not in text and "person:" not in text and "@example" not in text


def test_an_error_of_git_is_printed_without_the_user_name_and_password(tmp_path, capsys, base, monkeypatch):
    real = project_release._git

    def denied(path, *args, **options):
        if "ls-remote" in args:
            raise ValueError(f"fatal: unable to access '{SECRET}/': The requested URL returned error: 403")
        return real(path, *args, **options)

    monkeypatch.setattr(project_release, "_git", denied)
    code, said, err = run(capsys, tmp_path, variant(base, tmp_path / "t.mp", SECRET))
    assert (code, said) == (1, None)
    assert err == (f"Project release failed: The repository cannot be reached: fatal: unable to access '{PUBLIC}/': "
                   "The requested URL returned error: 403\n")
    assert project_release.public_address(SECRET) == PUBLIC
    assert project_release.public_address("https://token@example.invalid/a/b") == "https://example.invalid/a/b"
    assert project_release._scrub("see https://x:y@host.invalid/a and https://z@host.invalid/b", None) == (
        "see https://host.invalid/a and https://host.invalid/b")
