"""P0 audit remediation tests: slug handoff, map lifecycle, digest isolation, and host discovery."""
import json
import shutil
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, parse_router, validate_capabilities_and_router
from muro.adapters import _skill
from muro.runtime import Coordinator, runtime_main
from routing_helpers import copy_prompts, decision, proposed

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"


@pytest.fixture
def marionette_pkg(tmp_path):
    pkg = tmp_path / "marionette_pkg"
    pkg.mkdir()
    shutil.copytree(MARIONETTE / "capabilities", pkg / "capabilities")
    shutil.copy2(MARIONETTE / "ROUTER.md", pkg / "ROUTER.md")
    shutil.copy2(MARIONETTE / "sources.json", pkg / "sources.json")
    copy_prompts(pkg)
    return pkg


def test_marionette_package_has_no_hardcoded_dot_muro_paths_and_validator_rejects_them(tmp_path):
    caps = parse_capabilities(MARIONETTE / "capabilities")
    rows = parse_router(MARIONETTE / "ROUTER.md")
    for cap in caps:
        assert ".muro/" not in cap.body, f"{cap.id} still hardcodes .muro/"
    assert validate_capabilities_and_router(caps, rows, plugin_slug="marionette") == []

    # Even inside a fenced code block, .muro/ is rejected when plugin_slug != "muro"
    leaked = tmp_path / "figma-design.md"
    leaked.write_text(
        (MARIONETTE / "capabilities" / "figma-design.md").read_text(encoding="utf-8").replace(
            "## Behavior", "## Behavior\n```sh\ncat .muro/state.json\n```"
        ),
        encoding="utf-8",
    )
    from muro import parse_capability
    broken_caps = [parse_capability(leaked) if c.id == "figma-design" else c for c in caps]
    errs = validate_capabilities_and_router(broken_caps, rows, plugin_slug="marionette")
    assert any(".muro/" in e for e in errs)
    assert validate_capabilities_and_router(broken_caps, rows, plugin_slug="muro") == []


def test_step_handoff_injects_state_dir_map_path_and_recorded_outputs_under_package_slug(marionette_pkg, tmp_path, portable_project):
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)
    task = "Design a new landing page in Figma"
    prop = proposed(c, task, ["visual-direction", "figma-design"])
    assert prop == {"mode": "confirm", "task": task, "plan": ["visual-direction", "figma-design"]}

    step1 = c.confirm(task, prop["plan"])
    assert step1["state_dir"] == str((consumer / ".marionette").resolve())
    assert step1["map_path"] == str((consumer / ".marionette" / "map.md").resolve())
    assert step1["recorded_outputs"] == {}

    page_out = {
        "offer": "Free 14-day trial",
        "page_outline": "Hero, Proof, Steps, FAQ",
        "palette": "ink-ivory",
        "typography": "Instrument Serif + Inter",
        "layout": "1440 screens",
        "constraints": "no violet",
        "page": "not requested: strategy only",
    }
    step2 = c.record(page_out, step1["map_id"], "visual-direction")
    assert step2["capability"] == "figma-design"
    assert step2["recorded_outputs"]["palette"] == "ink-ivory"
    assert step2["recorded_outputs"]["offer"] == "Free 14-day trial"
    assert not (consumer / ".muro").exists()
    assert (consumer / ".marionette" / "map.md").read_text(encoding="utf-8").startswith("# Marionette work map")

    # Branded NOTICE.md uses plugin.name ("Marionette" vs "Muro")
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["plugin"] = {"slug": "marionette", "name": "Marionette", "command": "marionette", "version": "0.1.0"}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    rel = build_release(manifest_path, portable_project, tmp_path / "rel_out")
    notice = (rel / "NOTICE.md").read_text(encoding="utf-8")
    assert "Modified and merged into Marionette." in notice


def test_completed_map_restores_direct_mode_and_supports_direct_context_handoff(marionette_pkg, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)

    # Virgin direct writes nothing to disk
    d0 = proposed(c, "Convert a.docx to PDF", ["office-files"])
    assert d0["mode"] == "direct"
    assert not c.state_dir.exists()

    # Run a 2-step mapped plan
    task = "Create workbook and convert it"
    prop = proposed(c, task, ["office-authoring", "office-files"])
    s1 = c.confirm(task, prop["plan"])
    s2 = c.record({k: "budget.xlsx" for k in s1["required_outputs"]}, s1["map_id"], "office-authoring")
    checks_stage = c.record({k: "budget.pdf" for k in s2["required_outputs"]}, s2["map_id"], "office-files")
    assert checks_stage["mode"] == "checks"

    # Cannot complete while checks are missing or failing
    with pytest.raises(ValueError, match="check"):
        c.complete(s1["map_id"])
    c.record_check({"name": "engine_check_clean", "status": "fail", "evidence": "broken formula"}, s1["map_id"], "office-authoring")
    for cap_id in prop["plan"]:
        for chk in checks_stage["checks_by_capability"][cap_id]:  # the step's intent decides its checks (ADR-0018)
            if not (cap_id == "office-authoring" and chk == "engine_check_clean"):
                c.record_check({"name": chk, "status": "pass", "evidence": "ok"}, s1["map_id"], cap_id)
    with pytest.raises(ValueError, match="fail"):
        c.complete(s1["map_id"])

    # Once fixed check passes, complete succeeds and restores direct mode for subsequent 1-step tasks
    c.record_check({"name": "engine_check_clean", "status": "pass", "evidence": "fixed formula"}, s1["map_id"], "office-authoring")
    done = c.complete(s1["map_id"])
    assert done["mode"] == "completed"

    mtime_before = c.state_path.stat().st_mtime_ns
    d1 = proposed(c, "Convert summary.docx to PDF", ["office-files"])
    assert d1["mode"] == "direct"
    assert c.state_path.stat().st_mtime_ns == mtime_before

    # Direct context handoff persists outputs for follow-up single-step turn
    out_file = tmp_path / "direct_out.json"
    out_file.write_text(json.dumps({
        "offer": "Pro plan", "page_outline": "Hero+FAQ", "palette": "slate",
        "typography": "Inter", "layout": "screens", "constraints": "none", "page": "not requested"
    }), encoding="utf-8")
    assert runtime_main([
        "record", "--package", str(marionette_pkg), "--project", str(consumer),
        "--direct", "--capability", "visual-direction", "--outputs", str(out_file)
    ]) == 0
    d2 = proposed(Coordinator(marionette_pkg, consumer), "Edit existing Figma button", ["figma-design"])
    assert d2["mode"] == "direct"
    assert d2["recorded_outputs"]["palette"] == "slate"


def test_catalog_upgrade_does_not_block_fresh_task_and_names_state_json_on_active_resume(marionette_pkg, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)
    task_a = "Create workbook and convert it"
    prop_a = proposed(c, task_a, ["office-authoring", "office-files"])
    c.confirm(task_a, prop_a["plan"])

    # Simulate package upgrade modifying a capability
    cap_path = marionette_pkg / "capabilities" / "office-files.md"
    cap_path.write_text(cap_path.read_text(encoding="utf-8") + "\nUpgraded guidance line.\n", encoding="utf-8")

    upgraded = Coordinator(marionette_pkg, consumer)
    # Resuming the old incomplete active map fails with a clear message naming state.json and --new
    with pytest.raises(ValueError, match=r"state\.json.*--new|--new.*state\.json"):
        upgraded.resume()
    # Same active task without --new also names state.json and --new
    with pytest.raises(ValueError, match=r"state\.json.*--new|--new.*state\.json"):
        proposed(upgraded, task_a, ["office-authoring", "office-files"])

    # Brand-new task with valid fresh classification succeeds without crashing on the old digest
    task_b = "Explain how routing works as interactive HTML"
    prop_b = proposed(upgraded, task_b, ["interactive-explainer"])
    assert prop_b["mode"] == "confirm"
    step_b = upgraded.confirm(task_b, prop_b["plan"])
    assert step_b["capability"] == "interactive-explainer"
    assert any((consumer / ".marionette" / "archive").iterdir())


def test_skill_md_synthesizes_domain_rich_bounded_discovery_description():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    caps = parse_capabilities(MARIONETTE / "capabilities")
    skill_text = _skill(manifest["plugin"], "opencode", capabilities=caps)
    fm = skill_text.split("---")[1]
    desc_line = next(line for line in fm.splitlines() if line.startswith("description:"))
    desc = desc_line.split(":", 1)[1].strip()
    assert len(desc) <= 1024
    assert "Use when" in desc
    for keyword in ("landing", "Figma", "scroll", "Office", "explainer"):
        assert keyword.lower() in desc.lower(), keyword
    assert "AI-routed coordinator" in skill_text
    assert "--classification" in skill_text
