"""Tests for the `muro` subcommand CLI, the baseline report and the review preparation."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from muro.baseline import _newest_stable, baseline_report
from muro.cli import main
from muro.factory import review_prompt

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"  # the example plugin the factory builds


def git(path, *args):
    return subprocess.run(["git", "-C", str(path), "-c", "user.email=t@test", "-c", "user.name=t", *args],
                          check=True, capture_output=True, text=True).stdout.strip()


def make_repo(tmp_path, tags=()):
    root = tmp_path / "upstream"
    root.mkdir()
    git(root, "init", "-q")
    (root / "SKILL.md").write_text("# skill", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-q", "-m", "one")
    first = git(root, "rev-parse", "HEAD")
    for tag in tags:
        git(root, "tag", tag)
    (root / "SKILL.md").write_text("# skill v2", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-q", "-m", "two")
    head = git(root, "rev-parse", "HEAD")
    return root, first, head


def manifest_for(root, commit, pin, release=None):
    src = {"id": "s", "repo_path": str(root), "commit": commit, "pin": pin}
    if release:
        src["release"] = release
    return {"plugin": {}, "sources": [src]}


def test_baseline_release_pin_behind_and_prereleases_skipped(tmp_path):
    root, first, _ = make_repo(tmp_path, tags=["v1.0.0", "v1.1.0", "v2.0.0-rc1"])
    rows = baseline_report(manifest_for(root, first, "release", "v1.0.0"), tmp_path)
    assert rows[0]["status"] == "behind"
    assert rows[0]["upstream"] == "v1.1.0"  # the rc tag is not a candidate
    rows = baseline_report(manifest_for(root, first, "release", "v1.1.0"), tmp_path)
    assert rows[0]["status"] == "current"


def test_baseline_head_and_static_pins(tmp_path):
    root, first, head = make_repo(tmp_path)
    rows = baseline_report(manifest_for(root, first, "head"), tmp_path)
    assert rows[0]["status"] == "behind" and rows[0]["upstream"] == head[:12]
    rows = baseline_report(manifest_for(root, head, "head"), tmp_path)
    assert rows[0]["status"] == "current"
    rows = baseline_report(manifest_for(root, first, "static"), tmp_path)
    assert rows[0]["status"] == "frozen"


def test_baseline_unreachable_remote_is_an_error_row_not_a_crash(tmp_path):
    manifest = manifest_for(tmp_path / "missing", "a" * 40, "head")
    rows = baseline_report(manifest, tmp_path)
    assert rows[0]["status"] == "error" and rows[0]["note"]


def test_baseline_unreadable_tag_scheme_is_unknown():
    assert _newest_stable({"release-one": "a" * 40}, "release-one") is None


def test_subcommand_and_legacy_validate_agree(capsys):
    assert main(["validate", "--manifest", str(PACKAGE / "sources.json")]) == 0
    modern = capsys.readouterr().out
    assert main(["--manifest", str(PACKAGE / "sources.json"), "--validate"]) == 0
    assert capsys.readouterr().out == modern


def test_unknown_command_is_rejected():
    with pytest.raises(SystemExit):
        main(["frobnicate"])


def test_missing_manifest_fails(capsys):
    assert main(["validate", "--manifest", "no-such-sources.json"]) == 1
    assert "Manifest not found" in capsys.readouterr().err


def test_module_entry_point_prints_help():
    result = subprocess.run([sys.executable, "-m", "muro", "--help"],
                            capture_output=True, text=True, cwd=ROOT)
    assert result.returncode == 0 and "baseline" in result.stdout


def test_baseline_cli_json_and_exit_codes(tmp_path, capsys):
    root, first, _ = make_repo(tmp_path, tags=["v1.0.0", "v1.2.0"])
    current = manifest_for(root, first, "release", "v1.2.0")
    path = tmp_path / "sources.json"
    path.write_text(json.dumps(current), encoding="utf-8")
    assert main(["baseline", "--manifest", str(path), "--json"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["baseline"][0]["status"] == "current"
    behind = manifest_for(root, first, "release", "v1.0.0")
    path.write_text(json.dumps(behind), encoding="utf-8")
    assert main(["baseline", "--manifest", str(path)]) == 1
    assert "behind" in capsys.readouterr().out


def review_package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(PACKAGE / "capabilities", root / "capabilities")
    for name in ("ROUTER.md", "sources.json", "delivery.json", "entries.json", "guide-examples.json"):
        shutil.copy2(PACKAGE / name, root / name)
    return root


def test_review_prompt_bundles_recorded_decisions(tmp_path):
    root = review_package(tmp_path)
    out = review_prompt(root, root / ".muro" / "factory" / "review")
    text = (out / "PROMPT.md").read_text(encoding="utf-8")
    assert "Review AI" in text
    assert "REVIEW.md" in text  # the protocol names the expected artifact
    assert "Current delivery decisions (delivery.json)" in text
    assert "rewrites no capability" in text


def test_review_workbench_replaces_its_own_artifacts_only(tmp_path):
    root = review_package(tmp_path)
    out = review_prompt(root, root / ".muro" / "factory" / "review")
    (out / "REVIEW.md").write_text("findings", encoding="utf-8")
    review_prompt(root, out)  # a previous review's artifact may be replaced
    assert not (out / "REVIEW.md").exists()
    (out / "notes.txt").write_text("mine", encoding="utf-8")
    with pytest.raises(ValueError):
        review_prompt(root, out)


def test_review_cli_runs_on_a_package_copy(tmp_path, capsys):
    root = review_package(tmp_path)
    assert main(["review", "--manifest", str(root / "sources.json")]) == 0
    printed = capsys.readouterr().out.strip()
    assert Path(printed, "PROMPT.md").is_file()
