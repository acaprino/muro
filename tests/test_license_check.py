"""`muro license-check FOLDER`: does a folder hold any complete MIT or Apache-2.0 text the factory accepts?

A preflight for a caller that would otherwise pay for an AI run the license gate then refuses. It walks
the folder with no Git command, tries the files named like a license with the gate's own template
check, and says so on stdout (JSON) or stderr (the bare reason, so a caller can print it after its own
words). The pinned gate itself stays `check_sources`.
"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from muro.cli import main
from muro.sources import licenses_in
from test_regressions import MIT

ROOT = Path(__file__).resolve().parent.parent
APACHE = (Path(__file__).parent / "fixtures" / "apache-2.0.txt").read_text(encoding="utf-8")
FILLED_APACHE = APACHE.replace("Copyright [yyyy] [name of copyright owner]", "Copyright 2026 Example, PBC.")
OLD_MIT_TITLE = MIT.replace("MIT License", "The MIT License (MIT)", 1)
NONE_FOUND = "no file in the source is the complete MIT or Apache-2.0 text the factory accepts"


def folder_with(tmp_path, files):
    root = tmp_path / "source"
    for name, text in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(text if isinstance(text, bytes) else text.encode("utf-8"))
    root.mkdir(exist_ok=True)
    return root


def test_a_root_mit_file_is_listed(tmp_path):
    root = folder_with(tmp_path, {"LICENSE": MIT, "README.md": "# Skill"})
    assert licenses_in(root) == [{"path": "LICENSE", "license": "MIT"}]


def test_an_apache_file_in_a_subfolder_is_listed_with_its_relative_path(tmp_path):
    root = folder_with(tmp_path, {"README.md": "# Skill", "skills/demo/LICENSE.txt": FILLED_APACHE})
    assert licenses_in(root) == [{"path": "skills/demo/LICENSE.txt", "license": "Apache-2.0"}]


def test_a_file_that_opens_with_the_old_mit_title_is_refused(tmp_path):
    root = folder_with(tmp_path, {"LICENSE": OLD_MIT_TITLE})
    assert licenses_in(root) == []


def test_a_folder_without_a_license_file_lists_nothing(tmp_path):
    root = folder_with(tmp_path, {"README.md": "# Skill", "skills/demo/SKILL.md": "# Demo"})
    assert licenses_in(root) == []


def test_a_license_text_under_another_name_is_not_tried(tmp_path):
    root = folder_with(tmp_path, {"MIT.txt": MIT, "docs/terms.md": APACHE, "README.md": MIT})
    assert licenses_in(root) == []


def test_the_git_folder_is_not_entered_at_any_depth(tmp_path):
    root = folder_with(tmp_path, {".git/LICENSE": MIT, "vendor/dep/.git/LICENSE": APACHE, "README.md": "# Skill"})
    assert licenses_in(root) == []
    (root / "LICENSE").write_text(MIT, encoding="utf-8")
    assert licenses_in(root) == [{"path": "LICENSE", "license": "MIT"}]


def test_names_are_matched_in_any_letter_case_by_their_start(tmp_path):
    root = folder_with(tmp_path, {"license.md": MIT, "Licence": MIT, "COPYING.txt": APACHE,
                                  "LICENSE-APACHE": FILLED_APACHE, "LiCeNsEs/readme.txt": MIT})
    assert [item["path"] for item in licenses_in(root)] == ["COPYING.txt", "LICENSE-APACHE", "Licence", "license.md"]


def test_the_list_is_sorted_by_path_with_slash_separators(tmp_path):
    root = folder_with(tmp_path, {"z/LICENSE": MIT, "a/b/COPYING": APACHE, "LICENSE": MIT, "a/LICENSE": MIT})
    assert licenses_in(root) == [{"path": "LICENSE", "license": "MIT"},
                                 {"path": "a/LICENSE", "license": "MIT"},
                                 {"path": "a/b/COPYING", "license": "Apache-2.0"},
                                 {"path": "z/LICENSE", "license": "MIT"}]


def test_a_folder_named_like_a_license_and_a_file_that_is_not_text_are_skipped(tmp_path):
    root = folder_with(tmp_path, {"LICENSE/NOTES.md": "# not a license", "COPYING": b"\xff\xfe\x00 not utf-8",
                                  "LICENCE.md": MIT})
    assert licenses_in(root) == [{"path": "LICENCE.md", "license": "MIT"}]


def test_an_unreadable_file_is_skipped_and_the_others_are_still_listed(tmp_path, monkeypatch):
    root = folder_with(tmp_path, {"LICENSE": MIT, "vendor/LICENSE": MIT})
    real = Path.read_bytes

    def read_bytes(self):
        if self.parent.name == "vendor":
            raise PermissionError("denied")
        return real(self)

    monkeypatch.setattr(Path, "read_bytes", read_bytes)
    assert licenses_in(root) == [{"path": "LICENSE", "license": "MIT"}]


def test_the_repository_own_license_file_is_listed(tmp_path):
    root = folder_with(tmp_path, {"LICENSE": (ROOT / "LICENSE").read_bytes()})
    assert licenses_in(root) == [{"path": "LICENSE", "license": "Apache-2.0"}]


def run_command(monkeypatch, *argv):
    """The subcommand with every subprocess refused, so a Git command (or any other) would fail the test."""
    def refuse(*args, **kwargs):
        raise AssertionError("license-check ran a subprocess")

    monkeypatch.setattr(subprocess, "run", refuse)
    monkeypatch.setattr(subprocess, "Popen", refuse)
    return main(list(argv))


def test_the_command_prints_the_list_as_json_and_exits_0(tmp_path, capsys, monkeypatch):
    root = folder_with(tmp_path, {"LICENSE": MIT, "vendor/dep/LICENSE": FILLED_APACHE})
    assert run_command(monkeypatch, "license-check", str(root)) == 0
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"licenses": [{"path": "LICENSE", "license": "MIT"},
                                                     {"path": "vendor/dep/LICENSE", "license": "Apache-2.0"}]}
    assert captured.err == ""


def test_the_command_without_a_passing_file_prints_the_bare_line_on_stderr_and_exits_1(tmp_path, capsys, monkeypatch):
    root = folder_with(tmp_path, {"LICENSE": OLD_MIT_TITLE, "README.md": "# Skill"})
    assert run_command(monkeypatch, "license-check", str(root)) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == NONE_FOUND + "\n"


@pytest.mark.parametrize("kind", ["missing", "file"])
def test_a_folder_that_does_not_exist_is_named_on_stderr_and_exits_1(tmp_path, capsys, monkeypatch, kind):
    target = tmp_path / "no-such-folder"
    if kind == "file":
        target = tmp_path / "LICENSE"
        target.write_text(MIT, encoding="utf-8")
    assert run_command(monkeypatch, "license-check", str(target)) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == f"folder not found: {target}\n"


def test_the_factory_script_reaches_the_command_without_a_manifest(tmp_path):
    root = folder_with(tmp_path, {"LICENSE": MIT})
    empty = folder_with(tmp_path / "other", {"README.md": "# Skill"})

    def run(folder):
        return subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "muro_build.py"), "license-check", str(folder)],
                              capture_output=True, text=True, encoding="utf-8", cwd=tmp_path)

    found = run(root)
    assert found.returncode == 0 and found.stderr == ""
    assert json.loads(found.stdout) == {"licenses": [{"path": "LICENSE", "license": "MIT"}]}
    refused = run(empty)
    assert refused.returncode == 1 and refused.stdout == ""
    assert refused.stderr == NONE_FOUND + "\n"
