"""P2 audit remediation tests: install policy, offline-pins check, guide localization, dist slimming, and FRD/ADR governance."""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, validate_plugin_identity
from muro.adapters import _skill
from muro.guide import write_release_guide

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"


def test_install_policy_auto_default_vs_confirm_mode_in_skill_md():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    base_plugin = {"slug": "marionette", "name": "Marionette", "command": "marionette", "version": "0.1.0"}

    auto_skill = _skill(base_plugin, "opencode", capabilities=caps)
    assert "runtime dependency that is missing" in auto_skill
    assert "Do not stop to ask whether to install" in auto_skill

    confirm_plugin = {**base_plugin, "install_policy": "confirm"}
    assert validate_plugin_identity(confirm_plugin) == []
    confirm_skill = _skill(confirm_plugin, "opencode", capabilities=caps)
    assert "Do not stop to ask whether to install" not in confirm_skill
    assert "Ask the user for explicit approval before installing" in confirm_skill

    assert any("install_policy" in e for e in validate_plugin_identity({**base_plugin, "install_policy": "silent-root"}))


def test_offline_pins_validates_manifest_and_local_repos_while_disclosing_skipped_remotes(tmp_path):
    script = ROOT / "muro_build.py"
    run = subprocess.run(
        [sys.executable, str(script), "--manifest", str(MARIONETTE / "sources.json"), "--check-sources", "--offline-pins"],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert run.returncode == 0, run.stderr
    assert "skipped remote fetch (--offline-pins)" in run.stdout

    # Malformed SHA or invalid pin mode still fails closed under --offline-pins
    bad_manifest = tmp_path / "sources.json"
    data = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    data["sources"][0]["commit"] = "not-a-sha"
    bad_manifest.write_text(json.dumps(data), encoding="utf-8")
    bad_run = subprocess.run(
        [sys.executable, str(script), "--manifest", str(bad_manifest), "--check-sources", "--offline-pins"],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert bad_run.returncode != 0
    assert "commit" in bad_run.stderr


def test_guide_html_defaults_to_english_and_supports_italian_plugin_language(portable_project):
    manifest = json.loads((portable_project / "sources.json").read_text(encoding="utf-8"))

    # Default English
    en_guide = write_release_guide(portable_project, manifest["plugin"], manifest["sources"]).read_text(encoding="utf-8")
    assert '<html lang="en">' in en_guide
    assert ">Paths<" in en_guide and ">Intents<" in en_guide and ">Reset<" in en_guide
    assert "Declared prerequisites (after)" in en_guide

    # Explicit Italian
    it_plugin = {**manifest["plugin"], "language": "it"}
    assert validate_plugin_identity(it_plugin) == []
    it_guide = write_release_guide(portable_project, it_plugin, manifest["sources"]).read_text(encoding="utf-8")
    assert '<html lang="it">' in it_guide
    assert ">Percorsi<" in it_guide and ">Intenti<" in it_guide and ">Ripristina<" in it_guide

    assert any("language" in e for e in validate_plugin_identity({**manifest["plugin"], "language": "de"}))


def test_dist_runtime_slims_vendored_cytoscape_js_inside_adapter_muro_while_preserving_license(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    assert (release / "GUIDE.html").is_file()
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        skill = release / "adapters" / host / "skills" / "muro"
        assert (skill / "GUIDE.html").is_file()
        assert (skill / "muro" / "vendor" / "cytoscape" / "LICENSE").is_file()
        assert not (skill / "muro" / "vendor" / "cytoscape" / "cytoscape.min.js").exists()
        assert not (skill / "muro" / "guide.html").exists()

    # Packaged launcher still runs cleanly without cytoscape.min.js in skill/muro
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    launcher = release / "adapters" / "opencode" / "skills" / "muro" / "muro.py"
    res = subprocess.run(
        [sys.executable, str(launcher), "plan", "--task", "Check slim runtime", "--project", str(consumer)],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert res.returncode == 0, res.stderr


def test_governance_frd_and_adrs_are_consistent_with_current_contract():
    frd = json.loads((ROOT / "docs" / "frd" / "FRD-0001-muro-factory-and-coordinator.json").read_text(encoding="utf-8"))
    assert frd["version"] >= 2
    all_req_text = " ".join(r["text"] for r in frd["requirements"])
    assert "6-field YAML front matter" not in all_req_text
    assert "resolving direct conflicts by sources.json order" not in all_req_text
    assert "10 mandatory frontmatter fields" in all_req_text or "ten frontmatter fields" in all_req_text.lower()
    assert (ROOT / "docs" / "adr" / "ADR-0013-runtime-lifecycle-discovery-and-factory-isolation.md").is_file()

    required_adr_keys = {
        "adr_id:", "version:", "title:", "status:", "author:",
        "scope:", "governs_symbols:", "depends_on:", "created_from_task:",
        "proposed_on:", "accepted_on:",
    }
    for adr_file in sorted((ROOT / "docs" / "adr").glob("ADR-*.md")):
        lines = adr_file.read_text(encoding="utf-8").splitlines()
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
        fm_block = "\n".join(lines[1:end])
        for key in required_adr_keys:
            assert key in fm_block, f"{adr_file.name} missing frontmatter key {key}"
