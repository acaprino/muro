"""A project's repository is a plugin store built from its `.mp` file (ADR-0034, docs/project-store.md).

The reusable workflow `.github/workflows/project-store.yml` runs only on GitHub, so these tests prove two things
and no more: the functions of `.github/scripts/project_store.py` that read and decide, on small project files
packed by the factory, and what the workflow's text promises (how it is called, what its token may do, which
Muro it runs). Nothing here proves a run.
"""
import importlib.util
import json
import re
import shutil

import pytest

from muro import project
from routing_helpers import ROOT
from test_project_file import PROJECT_JSON, SLUG, build_release, cache, make_package, upstream  # noqa: F401  (fixtures)

WORKFLOWS = ROOT / ".github" / "workflows"
WORKFLOW = WORKFLOWS / "project-store.yml"
SCRIPT = ROOT / ".github" / "scripts" / "project_store.py"
DOC = ROOT / "docs" / "project-store.md"

CALLING = "someone/tester"
REPOSITORY = {"url": "https://github.com/Someone/Tester.git", "branch": "main", "tag_prefix": "tester-v"}
CHANGELOG = ("# Tester 0.1.0\n\nThe second entry.\n\n- capability added: x\n\n```sh\n# a comment in a block, not a heading\n"
             "```\n\n# Tester 0.0.9\n\nThe first entry.\n")
TOP_ENTRY = CHANGELOG.split("\n\n# Tester 0.0.9")[0]


def load():
    spec = importlib.util.spec_from_file_location("project_store", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


store = load()


def packed(root, upstream, cache, *, repository=REPOSITORY, changelog=CHANGELOG, release=True):
    """A store repository's folder with the fixture project's file at its root: `(repository folder, file)`."""
    package = make_package(root / "pkg", *upstream)
    (package / "project.json").write_text(json.dumps({**PROJECT_JSON, "repository": repository}), encoding="utf-8")
    (package / "CHANGELOG.md").write_text(changelog, encoding="utf-8")
    folder = root / "repository"
    folder.mkdir()
    mp = project.pack(package, folder / f"{SLUG}.mp", sources_cache=cache,
                      release_dir=build_release(root / "staged") if release else None)
    return folder, mp


@pytest.fixture(scope="module")
def stored(tmp_path_factory, upstream, cache):
    return packed(tmp_path_factory.mktemp("stored"), upstream, cache)


@pytest.fixture(scope="module")
def found(stored, tmp_path_factory):
    """The identity of the fixture project, read from its file by the factory."""
    return store.identity(project.summary(stored[1], tmp_path_factory.mktemp("cache")))


def info(**repository):
    """What `muro.project.summary` answers, as far as `identity` reads it."""
    return {"plugin": {"slug": "demo", "name": "Demo", "version": "1.2.3"}, "digest": "0" * 64,
            "project": {"repository": repository or None}}


# --- the file ---------------------------------------------------------------------------------------

def test_the_only_project_file_at_the_root_is_found(stored):
    assert store.find_project(stored[0]) == "tester.mp"


def test_no_project_file_is_an_error_that_says_so(tmp_path):
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "deep.mp").write_bytes(b"")
    (tmp_path / "README.md").write_text("a store", encoding="utf-8")
    with pytest.raises(store.Refused, match="holds no .mp file"):
        store.find_project(tmp_path)


def test_several_project_files_are_an_error_that_names_them(tmp_path):
    for name in ("b.mp", "a.mp"):
        (tmp_path / name).write_bytes(b"")
    with pytest.raises(store.Refused, match=r"Several project files .*\(a\.mp, b\.mp\).*input `project`"):
        store.find_project(tmp_path)
    assert store.find_project(tmp_path, "b.mp") == "b.mp"


@pytest.mark.parametrize("named,why", [("nested/a.mp", "at the root"), ("..\\a.mp", "at the root"),
                                       ("notes.txt", "at the root"), ("missing.mp", "not in the repository")])
def test_a_named_file_is_a_project_file_at_the_root(tmp_path, named, why):
    (tmp_path / "nested").mkdir()
    (tmp_path / "nested" / "a.mp").write_bytes(b"")
    (tmp_path / "notes.txt").write_bytes(b"")
    with pytest.raises(store.Refused, match=why):
        store.find_project(tmp_path, named)


# --- the repository a project names -----------------------------------------------------------------

@pytest.mark.parametrize("address", ["https://github.com/someone/tester", "https://github.com/Someone/Tester",
                                     "https://github.com/someone/tester.git", "https://github.com/someone/tester/",
                                     "https://github.com/SOMEONE/TESTER.GIT/", "someone/tester"])
def test_the_same_repository_whatever_the_case_the_git_suffix_and_the_slash(address):
    assert store.same_repository(address, CALLING)


@pytest.mark.parametrize("address", ["https://github.com/someone/other", "https://github.com/other/tester",
                                     "https://github.com/someone/tester-old"])
def test_another_repository_is_not_the_same(address):
    assert not store.same_repository(address, CALLING)


@pytest.mark.parametrize("address", ["https://example.invalid/tester", "https://github.com/", "tester",
                                     "https://github.com/someone/tester/tree/main", ""])
def test_what_is_not_a_repository_address_is_refused(address):
    with pytest.raises(store.Refused, match="not the address of a repository"):
        store.repository_name(address)


# --- identity ---------------------------------------------------------------------------------------

def test_identity_is_read_from_the_file_by_the_factory(stored, found):
    assert found == {"slug": "tester", "version": "0.1.0", "name": "Tester", "tag": "tester-v0.1.0",
                     "url": REPOSITORY["url"], "branch": "main", "sha256": project.digest(stored[1])}


def test_the_tag_is_the_prefix_of_project_json_and_the_version():
    assert store.identity(info(url="https://github.com/o/demo", branch="main", tag_prefix="v"))["tag"] == "v1.2.3"
    assert store.identity(info(url="https://github.com/o/demo", branch="main", tag_prefix=""))["tag"] == "1.2.3"


def test_a_project_that_names_no_repository_is_tagged_with_its_slug(tmp_path, upstream, cache):
    assert store.identity(info()) == {"slug": "demo", "version": "1.2.3", "name": "Demo", "tag": "demo-v1.2.3",
                                      "url": None, "branch": None, "sha256": "0" * 64}
    folder, mp = packed(tmp_path, upstream, cache, repository=None)     # and the factory passes the null through
    local = store.identity(project.summary(mp, tmp_path / "cache"))
    assert (local["tag"], local["url"], local["branch"]) == ("tester-v0.1.0", None, None)
    assert store.refusals(local, file_name="tester.mp", calling="anyone/anything", branch="any") == []


def test_a_project_pushed_to_its_own_repository_and_branch_is_not_refused(found):
    assert store.refusals(found, file_name="tester.mp", calling=CALLING, branch="main") == []


def refused(found, **changes):
    said = store.refusals(found, **{"file_name": f"{found['slug']}.mp", "calling": CALLING, "branch": "main", **changes})
    assert len(said) == 1, said
    return said[0]


def test_the_file_is_named_after_the_plugin(found):
    assert refused(found, file_name="project.mp") == (
        "The project file is named project.mp, but its plugin is tester: name the file tester.mp")


def test_the_project_names_the_repository_it_is_pushed_to(found):
    assert refused(found, calling="someone/other") == (
        f"project.json names the repository {REPOSITORY['url']}, but this is someone/other: "
        "a project is released from its own repository")
    assert "is not the address of a repository" in refused({**found, "url": "https://example.invalid/tester"})


def test_the_project_names_the_branch_it_is_pushed_to(found):
    assert refused(found, branch="trial") == "project.json names the branch main, but the file was pushed to trial"


@pytest.mark.parametrize("version", ["1.0 && id", "1.0\n2.0", "../1.0", "1..0", "-1.0", "1.0.lock", "$(id)", ""])
def test_a_version_that_cannot_be_a_file_name_or_a_ref_is_refused(found, version):
    assert "cannot be a release" in refused({**found, "version": version, "tag": f"tester-v{version}"})


@pytest.mark.parametrize("prefix", ["v/", "a b", "x;", "refs/tags/", "-", "é"])
def test_a_tag_prefix_that_cannot_be_a_git_tag_is_refused(found, prefix):
    assert "cannot be a Git tag" in refused({**found, "tag": f"{prefix}0.1.0"})


@pytest.mark.parametrize("name", ["Two\nlines", "tab\there", " ", "bell\x07"])
def test_a_name_that_is_not_one_line_is_refused(found, name):
    assert refused({**found, "name": name}) == "The plugin's name must be one line of text"


def test_a_plugin_cannot_take_the_folder_of_the_release_notes(found):
    taken = {**found, "slug": "releases", "tag": "releases-v0.1.0"}
    assert "releases/ is where the release notes are" in refused(taken, calling="someone/tester")


def test_a_file_with_no_built_plugin_has_nothing_to_publish(tmp_path):
    assert "carries no built plugin (release/tester/)" in store.release_problem(tmp_path, "tester")
    (tmp_path / "release" / "tester").mkdir(parents=True)
    assert store.release_problem(tmp_path, "tester") is None


def test_the_folder_a_release_replaces_is_absent_or_an_earlier_build_of_the_plugin(stored, tmp_path):
    assert store.folder_problem(tmp_path, "tester") is None
    unpacked = project.unpack(stored[1], tmp_path / "unpacked")
    shutil.copytree(unpacked / "release" / "tester", tmp_path / "tester")
    assert store.folder_problem(tmp_path, "tester") is None
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "notes.md").write_text("the repository's own", encoding="utf-8")
    assert "docs/ is in the repository and is not the plugin docs built by Muro" in store.folder_problem(tmp_path, "docs")
    shutil.copytree(unpacked / "release" / "tester", tmp_path / "other")      # a build, but of another plugin
    assert store.folder_problem(tmp_path, "other") is not None
    (tmp_path / "plain").write_text("a file", encoding="utf-8")
    assert store.folder_problem(tmp_path, "plain") is not None


# --- the tag ----------------------------------------------------------------------------------------

A, B = "a" * 64, "b" * 64


def test_a_version_with_no_tag_is_released():
    assert store.tag_action(A, exists=False)[0] == "release"


def test_the_same_file_under_a_released_version_does_nothing():
    assert store.tag_action(A, exists=True, released=A, tagged=A)[0] == "nothing"


@pytest.mark.parametrize("released,tagged", [(B, B), (B, A), (None, B), (None, None)])
def test_another_file_under_a_released_version_fails(released, tagged):
    assert store.tag_action(A, exists=True, released=released, tagged=tagged) == (
        "fail", "the same version was already released from another file: change the version")


def test_a_tag_made_from_this_file_whose_release_lacks_it_is_finished():
    action, sentence = store.tag_action(A, exists=True, released=None, tagged=A)
    assert action == "finish" and "finishes the release" in sentence


# --- the notes --------------------------------------------------------------------------------------

def test_the_entry_runs_from_the_first_heading_to_the_next(stored, tmp_path):
    assert store.changelog_entry(CHANGELOG, "Tester", "0.1.0") == TOP_ENTRY
    assert "# a comment in a block" in TOP_ENTRY and "0.0.9" not in TOP_ENTRY
    carried = (project.unpack(stored[1], tmp_path / "unpacked") / "CHANGELOG.md").read_text(encoding="utf-8")
    assert store.changelog_entry(carried, "Tester", "0.1.0") == TOP_ENTRY


def test_the_only_entry_is_the_whole_changelog_without_what_precedes_its_heading():
    assert store.changelog_entry("An opening line.\n\n# Tester 0.1.0\n\nFirst.\n\n", "Tester", "0.1.0") == (
        "# Tester 0.1.0\n\nFirst.")


@pytest.mark.parametrize("text", ["", "\n \n"])
def test_an_empty_changelog_gives_the_name_and_the_version(text):
    assert store.changelog_entry(text, "Tester", "0.1.0") == "# Tester 0.1.0"


def test_text_under_no_heading_is_given_the_name_and_the_version():
    assert store.changelog_entry("## Smaller\n\nNotes.\n", "Tester", "0.1.0") == "# Tester 0.1.0\n\n## Smaller\n\nNotes."


def test_the_notes_end_with_one_line_that_says_where_the_release_comes_from():
    notes = store.release_notes("# Tester 0.1.0\n\nFirst.", file_name="tester.mp", sha256=A, repository=CALLING,
                                commit="c" * 40, muro="d" * 40)
    entry, provenance = notes.rstrip("\n").rsplit("\n\n", 1)
    assert entry == "# Tester 0.1.0\n\nFirst." and notes.endswith(".\n") and "\n" not in provenance
    for part in ("`tester.mp`", A, CALLING, "c" * 40, "d" * 40):
        assert part in provenance


# --- the commands the workflow runs -----------------------------------------------------------------

@pytest.fixture
def step(tmp_path, monkeypatch):
    """A step of a workflow: the files GitHub names for its outputs and its summary."""
    outputs, summary = tmp_path / "outputs", tmp_path / "summary"
    monkeypatch.setenv("GITHUB_OUTPUT", str(outputs))
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))

    def read():
        lines = outputs.read_text(encoding="utf-8").splitlines() if outputs.is_file() else []
        return dict(line.split("=", 1) for line in lines), summary.read_text(encoding="utf-8") if summary.is_file() else ""
    return read


def identity_arguments(stored, tmp_path, **changes):
    folder, mp = stored
    if "unpacked" not in changes:
        changes["unpacked"] = project.unpack(mp, tmp_path / "unpacked")
    options = {"cache": tmp_path / "cache", "calling": CALLING, "branch": "main", **changes}
    return ["identity", str(folder), mp.name, *[part for key, value in options.items() for part in (f"--{key}", str(value))]]


def test_find_prints_the_file_for_the_shell(stored, capsys):
    assert store.main(["find", str(stored[0])]) == 0
    assert capsys.readouterr().out == "tester.mp\n"
    assert store.main(["find", str(stored[0]), "--project", "other.mp"]) == 1
    assert "::error::other.mp is not in the repository" in capsys.readouterr().err


def test_identity_gives_the_step_its_outputs(stored, tmp_path, step):
    assert store.main(identity_arguments(stored, tmp_path)) == 0
    assert step()[0] == {"file": "tester.mp", "slug": "tester", "version": "0.1.0", "name": "Tester",
                         "tag": "tester-v0.1.0", "sha256": project.digest(stored[1])}


def test_identity_fails_with_a_sentence_and_gives_no_output(stored, tmp_path, step, capsys):
    assert store.main(identity_arguments(stored, tmp_path, calling="someone/other", branch="trial")) == 1
    said = capsys.readouterr().err
    assert "::error::project.json names the repository" in said and "::error::project.json names the branch" in said
    assert step()[0] == {}


def test_identity_refuses_a_file_with_no_release_and_a_folder_that_is_not_a_build(tmp_path, upstream, cache, step, capsys):
    folder, mp = packed(tmp_path, upstream, cache, release=False)
    (folder / "tester").mkdir()
    assert store.main(identity_arguments((folder, mp), tmp_path)) == 1
    said = capsys.readouterr().err
    assert "carries no built plugin" in said and "tester/ is in the repository and is not the plugin" in said
    assert step()[0] == {}


def test_a_sentence_that_quotes_the_file_stays_on_one_line(capsys):
    assert store._stop(["project.json names the branch main\n::add-mask::x\r, but the file was pushed to trial"]) == 1
    assert capsys.readouterr().err == (
        "::error::project.json names the branch main ::add-mask::x , but the file was pushed to trial\n")


def test_identity_says_why_a_file_cannot_be_read(tmp_path, step, capsys):
    (tmp_path / "tester.mp").write_bytes(b"not a zip")
    assert store.main(identity_arguments((tmp_path, tmp_path / "tester.mp"), tmp_path, unpacked=tmp_path)) == 1
    assert "::error::The project file cannot be read: Not a Muro project file" in capsys.readouterr().err


def test_decide_gives_the_action_and_a_line_of_summary(step):
    assert store.main(["decide", "--tag", "tester-v0.1.0", "--pushed", A, "--exists", "yes", "--released", A]) == 0
    outputs, summary = step()
    assert outputs == {"action": "nothing"}
    assert summary == "tester-v0.1.0: This file is already released under this version: nothing to do.\n"


def test_decide_fails_for_another_file_under_a_released_version(step, capsys):
    assert store.main(["decide", "--tag", "tester-v0.1.0", "--pushed", A, "--exists", "yes", "--released", B,
                       "--tagged", B]) == 1
    assert capsys.readouterr().err == (
        "::error::tester-v0.1.0: the same version was already released from another file: change the version\n")
    assert step() == ({}, "")


def test_decide_reads_an_empty_digest_as_none(step):
    assert store.main(["decide", "--tag", "t", "--pushed", A, "--exists", "no", "--released", "", "--tagged", ""]) == 0
    assert store.main(["decide", "--tag", "t", "--pushed", A, "--exists", "yes", "--released", "", "--tagged", A]) == 0
    assert step()[0] == {"action": "finish"}       # the later line of the file is the later step's


def test_notes_writes_the_top_entry_and_the_provenance(stored, tmp_path):
    unpacked = project.unpack(stored[1], tmp_path / "unpacked")
    out = tmp_path / "repository" / "releases" / "tester-v0.1.0.md"
    assert store.main(["notes", "--unpacked", str(unpacked), "--out", str(out), "--name", "Tester", "--version", "0.1.0",
                       "--file", "tester.mp", "--sha256", A, "--calling", CALLING, "--commit", "c" * 40,
                       "--muro", "d" * 40]) == 0
    written = out.read_bytes().decode("utf-8")
    assert written.startswith(TOP_ENTRY + "\n\nReleased from `tester.mp`") and "\r" not in written
    assert "0.0.9" not in written and "d" * 40 in written


# --- what the workflow's text promises --------------------------------------------------------------

TEXT = WORKFLOW.read_text(encoding="utf-8")
GATE, PUBLISH = TEXT.split("\n  publish:\n")[0].split("\n  gate:\n")[1], TEXT.split("\n  publish:\n")[1]
USES = re.compile(r"uses:\s*(\S+)@(\S+)(?:\s+#\s*(\S+))?")


def shell(text):
    """The shell of every `run:` step, without the YAML around it."""
    lines, block = [], None
    for line in text.splitlines():
        depth = len(line) - len(line.lstrip())
        if block is not None:
            if line.strip() and depth <= block:
                block = None
            else:
                lines.append(line)
                continue
        stripped = line.strip().removeprefix("- ")
        if stripped.startswith("run:"):
            rest = stripped.removeprefix("run:").strip()
            if rest == "|":
                block = depth
            else:
                lines.append(rest)
    return "\n".join(lines)


def test_it_is_called_by_another_workflow_and_by_nothing_else():
    triggers = TEXT.split("\non:\n")[1].split("\npermissions:\n")[0]
    assert triggers.startswith("  workflow_call:\n")
    assert not re.search(r"^  (push|pull_request|pull_request_target|schedule|workflow_dispatch):", triggers, re.M)
    for name in ("project", "tests", "muro_ref"):
        assert f"\n      {name}:\n" in triggers


def test_it_uses_no_secret():
    assert "secrets" not in TEXT
    assert TEXT.count("${{ github.token }}") == 2


def test_only_the_job_that_publishes_may_write():
    assert "\npermissions:\n  contents: read\n" in TEXT
    assert TEXT.count("contents: write") == 2          # the comment that tells the caller, and the one job
    assert "permissions:" not in GATE and "    permissions:\n      contents: write\n" in PUBLISH
    assert "needs: gate\n" in PUBLISH
    assert GATE.count("persist-credentials: false") == 2      # nothing the gate runs finds a token in the checkout
    # what the pushed file and the repository bring is run where the token only reads
    for run in ("muro_build.py", "pytest"):
        assert run in shell(GATE) and run not in shell(PUBLISH)


def test_muro_is_checked_out_at_the_commit_of_the_called_workflow():
    assert "COMMIT: ${{ inputs.muro_ref || job.workflow_sha || github.job_workflow_sha }}" in GATE
    assert 'if [ -z "$COMMIT" ]; then' in shell(GATE)
    for job, commit in ((GATE, "${{ steps.muro.outputs.commit }}"), (PUBLISH, "${{ needs.gate.outputs.muro_commit }}")):
        assert f"ref: {commit}\n          path: factory\n" in job
    # the caller's commit is never taken for Muro's
    assert "github.workflow_sha" not in TEXT.replace("`github.workflow_sha`", "")
    assert "path: muro" not in TEXT and "path: store\n" in GATE and "path: store\n" in PUBLISH


def test_every_action_is_pinned_by_commit_as_in_the_other_workflows():
    known = {match.groups() for path in WORKFLOWS.glob("*.yml") if path != WORKFLOW
             for match in USES.finditer(path.read_text(encoding="utf-8"))}
    used = [match.groups() for match in USES.finditer(TEXT)]
    assert len(used) == 6
    for action, ref, version in used:
        assert re.fullmatch(r"[0-9a-f]{40}", ref) and version, (action, ref)
        assert (action, ref, version) in known, f"{action}@{ref} is pinned nowhere else in this repository"


def test_no_value_reaches_a_shell_except_through_the_environment():
    for job in (GATE, PUBLISH):
        assert "${{" not in shell(job)


def test_two_pushes_do_not_release_at_once():
    assert re.search(r"\nconcurrency:\n  group: project-store-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false\n", TEXT)


def test_the_gate_runs_the_checks_in_order_and_gives_the_tests_their_two_folders():
    run = shell(GATE)
    order = ["project verify", "project unpack", " identity ", " decide ", "--validate", "--check-sources", "--build --out",
             "python -m pytest -q"]
    assert [run.index(step) for step in order] == sorted(run.index(step) for step in order)
    assert 'MURO_PROJECT="$RUNNER_TEMP/project" python -m pytest -q "$TESTS"' in run
    assert "MURO_ROOT: ${{ github.workspace }}/factory" in GATE
    assert GATE.count("if: steps.tag.outputs.action == 'release'") == 4      # a file already released is not gated again


def test_the_store_is_what_the_file_carries_and_only_generated_paths_are_committed():
    run = shell(PUBLISH)
    assert 'cp -a "$RUNNER_TEMP/project/release/$SLUG" "$SLUG"' in run and 'python -m muro marketplace . "$SLUG"' in run
    assert ('git add --all --force -- "$SLUG" .claude-plugin/marketplace.json .agents/plugins/marketplace.json '
            '"releases/$TAG.md"') in run
    assert "git add ." not in run and "git add -A\n" not in run and "commit -a" not in run
    assert 'git push --atomic origin "HEAD:refs/heads/$GITHUB_REF_NAME" "refs/tags/$TAG"' in run
    assert "github-actions[bot]" in run
    for asset in ('"$assets/$FILE"', '"$assets/$SLUG-$VERSION.zip"', '"$name.sha256"'):
        assert asset in run
    assert "does not start the caller again" in TEXT and "starts no workflow" in TEXT and "touches no *.mp file" in TEXT


# --- the page a store repository copies its caller from ---------------------------------------------

def test_the_page_gives_the_caller_to_copy():
    page = DOC.read_text(encoding="utf-8")
    caller = page.split("```yaml\n")[1].split("```")[0]
    assert len(caller.splitlines()) == 10
    assert "    uses: acaprino/muro/.github/workflows/project-store.yml@" in caller
    assert "contents: write" in caller and "paths: ['*.mp']" in caller and "workflow_dispatch:" in caller
    assert "secrets" not in caller
