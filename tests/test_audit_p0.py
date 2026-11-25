"""P0 audit remediation tests: slug handoff, map lifecycle, digest isolation, and host discovery."""
import json
import shutil

import pytest

from muro import build_release, parse_capabilities, parse_capability, parse_router, validate_capabilities_and_router
from muro.runtime import Coordinator, runtime_main
from routing_helpers import FIXTURE, copy_delivery, copy_prompts, proposed


@pytest.fixture
def package(tmp_path):
    # With its manifest, so the copy runs under the fixture's own slug and name, which are not the factory's.
    pkg = tmp_path / "package"
    pkg.mkdir()
    shutil.copytree(FIXTURE / "capabilities", pkg / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", pkg / "ROUTER.md")
    shutil.copy2(FIXTURE / "sources.json", pkg / "sources.json")
    copy_prompts(pkg)
    copy_delivery(pkg)
    return pkg


def test_validator_rejects_a_hardcoded_dot_muro_path_under_another_slug(tmp_path):
    caps = parse_capabilities(FIXTURE / "capabilities")
    rows = parse_router(FIXTURE / "ROUTER.md")
    for cap in caps:
        assert ".muro/" not in cap.body, f"{cap.id} hardcodes .muro/"
    assert validate_capabilities_and_router(caps, rows, plugin_slug="pressroom") == []

    # Even inside a fenced code block, .muro/ is rejected when plugin_slug != "muro"
    leaked = tmp_path / "newsletter-edition.md"
    leaked.write_text(
        (FIXTURE / "capabilities" / "newsletter-edition.md").read_text(encoding="utf-8").replace(
            "## Behavior", "## Behavior\n```sh\ncat .muro/state.json\n```"
        ),
        encoding="utf-8",
    )
    broken_caps = [parse_capability(leaked) if c.id == "newsletter-edition" else c for c in caps]
    errs = validate_capabilities_and_router(broken_caps, rows, plugin_slug="pressroom")
    assert any(".muro/" in e for e in errs)
    assert validate_capabilities_and_router(broken_caps, rows, plugin_slug="muro") == []


def test_step_handoff_injects_state_dir_map_path_and_recorded_outputs_under_package_slug(package, tmp_path, portable_project):
    consumer = tmp_path / "consumer"
    c = Coordinator(package, consumer)
    task = "Plan a new story and write its newsletter edition"
    prop = proposed(c, task, ["story-brief", "newsletter-edition"])
    assert prop == {"mode": "confirm", "task": task, "plan": ["story-brief", "newsletter-edition"]}

    step1 = c.confirm(task, prop["plan"])
    assert step1["state_dir"] == str((consumer / ".pressroom").resolve())
    assert step1["map_path"] == str((consumer / ".pressroom" / "map.md").resolve())
    assert step1["recorded_outputs"] == {}

    brief_out = {
        "audience": "People who never kept bees",
        "angle": "one hive, one year",
        "outline": "Spring, Summer, Autumn, Winter",
        "voice": "plain, warm, exact",
    }
    step2 = c.record(brief_out, step1["map_id"], "story-brief")
    assert step2["capability"] == "newsletter-edition"
    assert step2["recorded_outputs"]["angle"] == "one hive, one year"
    assert step2["recorded_outputs"]["audience"] == "People who never kept bees"
    assert not (consumer / ".muro").exists()
    assert (consumer / ".pressroom" / "map.md").read_text(encoding="utf-8").startswith("# Pressroom work map")

    # Branded NOTICE.md uses plugin.name ("Pressroom" vs "Muro")
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["plugin"] = {"slug": "pressroom", "name": "Pressroom", "command": "pressroom", "version": "0.1.0"}
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    rel = build_release(manifest_path, portable_project, tmp_path / "rel_out")
    notice = (rel / "NOTICE.md").read_text(encoding="utf-8")
    assert "Modified and merged into Pressroom." in notice


def test_completed_map_restores_direct_mode_and_supports_direct_context_handoff(package, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(package, consumer)

    # Virgin direct writes nothing to disk
    d0 = proposed(c, "Convert chapter.docx to PDF", ["manuscript-files"])
    assert d0["mode"] == "direct"
    assert not c.state_dir.exists()

    # Run a 2-step mapped plan
    task = "Check the facts of the draft and edit the manuscript"
    prop = proposed(c, task, ["fact-check", "manuscript-files"])
    s1 = c.confirm(task, prop["plan"])
    s2 = c.record({k: "claims.md" for k in s1["required_outputs"]}, s1["map_id"], "fact-check")
    checks_stage = c.record({k: "chapter.docx" for k in s2["required_outputs"]}, s2["map_id"], "manuscript-files")
    assert checks_stage["mode"] == "checks"

    # Cannot complete while checks are missing or failing
    with pytest.raises(ValueError, match="check"):
        c.complete(s1["map_id"])
    c.record_check({"name": "claims_traced", "status": "fail", "evidence": "one claim has no source"}, s1["map_id"], "fact-check")
    for cap_id in prop["plan"]:
        for chk in checks_stage["checks_by_capability"][cap_id]:  # the step's intent decides its checks (ADR-0018)
            if not (cap_id == "fact-check" and chk == "claims_traced"):
                c.record_check({"name": chk, "status": "pass", "evidence": "ok"}, s1["map_id"], cap_id)
    with pytest.raises(ValueError, match="fail"):
        c.complete(s1["map_id"])

    # Once fixed check passes, complete succeeds and restores direct mode for subsequent 1-step tasks
    c.record_check({"name": "claims_traced", "status": "pass", "evidence": "source found"}, s1["map_id"], "fact-check")
    done = c.complete(s1["map_id"])
    assert done["mode"] == "completed"

    mtime_before = c.state_path.stat().st_mtime_ns
    d1 = proposed(c, "Convert summary.docx to PDF", ["manuscript-files"])
    assert d1["mode"] == "direct"
    assert c.state_path.stat().st_mtime_ns == mtime_before

    # Direct context handoff persists outputs for follow-up single-step turn
    out_file = tmp_path / "direct_out.json"
    out_file.write_text(json.dumps({
        "audience": "subscribers", "angle": "slate", "outline": "not requested", "voice": "dry"
    }), encoding="utf-8")
    assert runtime_main([
        "record", "--package", str(package), "--project", str(consumer),
        "--direct", "--capability", "story-brief", "--outputs", str(out_file)
    ]) == 0
    d2 = proposed(Coordinator(package, consumer), "Write this week's edition as a digest", ["newsletter-edition"])
    assert d2["mode"] == "direct"
    assert d2["recorded_outputs"]["angle"] == "slate"


def test_catalog_upgrade_does_not_block_fresh_task_and_names_state_json_on_active_resume(package, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(package, consumer)
    task_a = "Check the facts of the draft and edit the manuscript"
    prop_a = proposed(c, task_a, ["fact-check", "manuscript-files"])
    c.confirm(task_a, prop_a["plan"])

    # Simulate package upgrade modifying a capability
    cap_path = package / "capabilities" / "manuscript-files.md"
    cap_path.write_text(cap_path.read_text(encoding="utf-8") + "\nUpgraded guidance line.\n", encoding="utf-8")

    upgraded = Coordinator(package, consumer)
    # Resuming the old incomplete active map fails with a clear message naming state.json and --new
    with pytest.raises(ValueError, match=r"state\.json.*--new|--new.*state\.json"):
        upgraded.resume()
    # Same active task without --new also names state.json and --new
    with pytest.raises(ValueError, match=r"state\.json.*--new|--new.*state\.json"):
        proposed(upgraded, task_a, ["fact-check", "manuscript-files"])

    # Brand-new task with valid fresh classification succeeds without crashing on the old digest
    task_b = "Decide how the beekeeping story moves while it is scrolled"
    prop_b = proposed(upgraded, task_b, ["pacing-spec"])
    assert prop_b["mode"] == "confirm"
    step_b = upgraded.confirm(task_b, prop_b["plan"])
    assert step_b["capability"] == "pacing-spec"
    assert any((consumer / ".pressroom" / "archive").iterdir())
