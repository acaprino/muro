"""Binary media travels when the intake declares it (ADR-0027).

The license gate refused every image, font and video by its extension, whatever its
license, so a source whose method ships a kit of images could never be absorbed whole
(taste-skill: 151 images, each credited in a file the source carries). `media_paths` is
the intake AI's declaration that it read how the source licenses those files. Python
lifts the refusal for what is declared and nothing else; it never reads the rights.
"""
import json
from pathlib import Path
import subprocess

import pytest

from muro import build_release, check_sources
from muro.factory import prepare_intake
from routing_helpers import copy_prompts
from test_license_path_gate import manifest
from test_regressions import MIT

PNG = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\xff\xfe\x00"
TEXT = {"LICENSE": MIT, "SKILL.md": "# Demo\n", "kit/credits.json": '{"photos": []}\n', "kit/style.css": "a{}\n"}
BINARY = {"kit/photo.png": PNG, "kit/model.glb": b"glTF\x02\x00\x00\x00\xff\xfe"}
SELECTED = ["SKILL.md", "kit/**"]


def make_repo(tmp_path):
    root = tmp_path / "source"
    root.mkdir()

    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True).stdout.strip()

    git("init", "-q")
    for name, text in TEXT.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(text, encoding="utf-8")
    for name, data in BINARY.items():
        (root / name).write_bytes(data)
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "kit with media")
    return root, git("rev-parse", "HEAD")


def errors_for(tmp_path, **changes):
    root, commit = make_repo(tmp_path)
    return check_sources(manifest(root, commit, **{"selected_paths": SELECTED, **changes}), tmp_path)


def test_selected_media_is_still_refused_until_it_is_declared(tmp_path):
    errors = errors_for(tmp_path, selected_paths=["SKILL.md", "kit/photo.png"])
    assert errors and "kit/photo.png" in errors[0] and "media_paths" in errors[0]


def test_declared_media_passes_the_source_check(tmp_path):
    assert errors_for(tmp_path, media_paths=["kit/*.png", "kit/model.glb"]) == []


def test_a_binary_file_of_any_extension_needs_the_declaration(tmp_path):
    errors = errors_for(tmp_path, media_paths=["kit/*.png"])
    assert errors and "kit/model.glb" in errors[0] and "media_paths" in errors[0]


def test_a_text_file_declared_as_media_keeps_its_license_check(tmp_path):
    root, commit = make_repo(tmp_path)
    (root / "kit" / "style.css").write_text("/* SPDX-License-Identifier: GPL-3.0-only */\na{}\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(root), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                    "commit", "-qam", "a stylesheet under another license"], check=True, capture_output=True)
    commit = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    errors = check_sources(manifest(root, commit, selected_paths=SELECTED, media_paths=["kit/**"]), tmp_path)
    assert errors and "conflicting SPDX license: kit/style.css" in errors[0]


def test_a_media_declaration_that_matches_no_selected_file_is_refused(tmp_path):
    errors = errors_for(tmp_path, media_paths=["kit/*.png", "kit/model.glb", "photos/**"])
    assert errors and "media_paths matched no selected file: photos/**" in errors[0]


@pytest.mark.parametrize("value", ["kit/*.png", 42, None, [42], ["../kit/*.png"], ["/abs/*.png"], [""]])
def test_unsafe_or_malformed_media_paths_fail_closed(tmp_path, value):
    errors = errors_for(tmp_path, media_paths=value)
    assert errors and "media_paths" in errors[0]


def test_excluded_paths_still_refuse_declared_media(tmp_path):
    errors = errors_for(tmp_path, media_paths=["kit/*.png", "kit/model.glb"], excluded_paths=["kit/*.png"])
    assert errors and "selected path matches excluded_paths: kit/photo.png" in errors[0]


def test_intake_receives_declared_media_as_files_and_reads_no_paths_out_of_them(tmp_path):
    root, commit = make_repo(tmp_path)
    src = {**manifest(root, commit, selected_paths=SELECTED, media_paths=["kit/*.png", "kit/model.glb"])["sources"][0],
           "intake": {"goal": "Absorb the kit"}}
    copy_prompts(tmp_path)
    workbench = prepare_intake(src, tmp_path, tmp_path / "intake")
    assert (workbench / "files" / "kit" / "photo.png").read_bytes() == PNG
    assert json.loads((workbench / "coverage.json").read_text(encoding="utf-8"))["referenced"] == []


def test_a_release_carries_declared_media_byte_for_byte_in_every_host(portable_project, tmp_path):
    manifest_path = portable_project / "sources.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    repo = Path(data["sources"][0]["repo_path"])

    def git(*args):
        return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    (repo / "kit").mkdir()
    (repo / "kit" / "photo.png").write_bytes(PNG)
    (repo / "kit" / "credits.json").write_text('{"photos": [{"file": "photo.png", "licence": "CC0"}]}\n', encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "kit with a credited photo")
    data["sources"][0].update(commit=git("rev-parse", "HEAD"), selected_paths=["SKILL.md", "kit/**"],
                              media_paths=["kit/photo.png"], notice_paths=["kit/credits.json"])
    manifest_path.write_text(json.dumps(data), encoding="utf-8")
    release = build_release(manifest_path, portable_project, tmp_path / "out")
    roots = [release] + [release / "adapters" / host / "skills" / "muro"
                         for host in ("claude-code", "codex", "pi", "opencode", "hermes")]
    for root in roots:
        assert (root / "scripts" / "demo" / "kit" / "photo.png").read_bytes() == PNG
    assert "scripts/demo/kit/credits.json" in (release / "NOTICE.md").read_text(encoding="utf-8")
