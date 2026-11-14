"""P1 audit remediation tests: atomic batch protocol, multi-instance steps, scope preservation, factory isolation, parser & lock safety."""
import io
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, parse_capability
from muro.routing import validate_stack
from muro.runtime import Coordinator, detect_stack, runtime_main
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts, decision, proposed

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


def test_atomic_step_cli_with_stdin_and_inline_json_completes_without_temp_files(marionette_pkg, tmp_path, monkeypatch, capsys):
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    real_artifact = consumer / "hero.html"
    real_artifact.write_text("<h1>Landing</h1>", encoding="utf-8")

    # 1. Plan without classification
    assert runtime_main(["plan", "--package", str(marionette_pkg), "--project", str(consumer), "--task", "Landing and motion"]) == 0
    req = json.loads(capsys.readouterr().out)
    cls_doc = {
        **req["context"],
        "status": "selected",
        "reason": "Both landing direction and motion spec requested.",
        "questions": [],
        "selections": [
            {"capability": "visual-direction", "intent": "ui.landing-strategy", "reason": "r1"},
            {"capability": "motion-principles", "intent": "ui.motion-design", "reason": "r2"},
        ],
    }

    # Reject multiple "-" stdin consumers in one CLI call
    assert runtime_main([
        "step", "--package", str(marionette_pkg), "--project", str(consumer),
        "--map-id", "m", "--capability", "visual-direction", "--outputs", "-", "--result", "-"
    ]) == 1
    capsys.readouterr()

    # 2. Propose + confirm in one call via inline --classification-json (0 temp files!)
    assert runtime_main([
        "plan", "--package", str(marionette_pkg), "--project", str(consumer),
        "--task", "Landing and motion", "--classification-json", json.dumps(cls_doc), "--confirm"
    ]) == 0
    step1 = json.loads(capsys.readouterr().out)
    assert step1["capability"] == "visual-direction"
    map_id = step1["map_id"]

    # Falsifier: invalid check in atomic `step` leaves state byte-identical (no partial output write!)
    state_file = consumer / ".marionette" / "state.json"
    before_bytes = state_file.read_bytes()
    bad_batch = {
        "outputs": {
            "offer": "Trial", "page_outline": "H1", "palette": "ink",
            "typography": "Inter", "layout": "1440", "constraints": "none", "page": "hero.html",
        },
        "checks": [{"name": "nonexistent_check", "status": "pass", "evidence": "bad"}],
    }
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(bad_batch)))
    assert runtime_main([
        "step", "--package", str(marionette_pkg), "--project", str(consumer),
        "--map-id", map_id, "--capability", "visual-direction", "--step-data", "-"
    ]) == 1
    capsys.readouterr()
    assert state_file.read_bytes() == before_bytes

    # 3. Valid atomic `step` for step 1 via stdin advances immediately to step 2
    c_ref = Coordinator(marionette_pkg, consumer)
    good_batch_1 = {
        "outputs": bad_batch["outputs"],
        "checks": [{"name": chk, "status": "pass", "evidence": "verified"} for chk in step1["checks"]],  # landing-strategy scope (ADR-0018)
    }
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(good_batch_1)))
    assert runtime_main([
        "step", "--package", str(marionette_pkg), "--project", str(consumer),
        "--map-id", map_id, "--capability", "visual-direction", "--step-data", "-"
    ]) == 0
    step2 = json.loads(capsys.readouterr().out)
    assert step2["mode"] == "step" and step2["capability"] == "motion-principles"

    # 4. Valid atomic `step` for final step 2 auto-completes map and reports attestation
    good_batch_2 = {
        "outputs": {"motion-spec": "fade 200ms", "reduced-motion": "opacity only"},
        "checks": [{"name": chk, "status": "pass", "evidence": "verified"} for chk in step2["checks"]],
    }
    assert runtime_main([
        "step", "--package", str(marionette_pkg), "--project", str(consumer),
        "--map-id", map_id, "--capability", "motion-principles", "--step-json", json.dumps(good_batch_2)
    ]) == 0
    final_res = json.loads(capsys.readouterr().out)
    assert final_res["mode"] == "completed"
    assert final_res["output_attestation"]["page"] == "verified-file"
    assert final_res["output_attestation"]["motion-spec"] == "self-attested"
    # A landing-strategy step answers its own checks; palette_applied belongs to a built page (ADR-0018).
    assert final_res["effective_checks"]["visual-direction"] == {"single_primary_action": "pass", "proof_supported": "pass"}


def test_multi_instance_steps_support_distinct_intents_and_files_with_namespaced_outputs(marionette_pkg, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)
    task = "Extract figures from budget.xlsx then convert report.docx to PDF"
    req = c.propose(task, set())

    # Duplicate bare capability without distinct step_id is still rejected
    dup_cls = {
        **req["context"], "status": "selected", "reason": "dup", "questions": [],
        "selections": [
            {"capability": "office-files", "intent": "office.content-extraction", "reason": "r1"},
            {"capability": "office-files", "intent": "office.format-conversion", "reason": "r2"},
        ],
    }
    with pytest.raises(ValueError, match="Duplicate capability|step_id"):
        c.propose(task, set(), classification=dup_cls)

    # Explicit step_id instances succeed and namespace outputs cleanly
    inst_cls = {
        **req["context"], "status": "selected", "reason": "Two distinct file operations", "questions": [],
        "selections": [
            {"step_id": "office-files#1", "capability": "office-files", "intent": "office.content-extraction", "reason": "Read xlsx"},
            {"step_id": "office-files#2", "capability": "office-files", "intent": "office.format-conversion", "reason": "Convert docx"},
        ],
    }
    prop = c.propose(task, set(), classification=inst_cls)
    assert prop == {"mode": "confirm", "task": task, "plan": ["office-files#1", "office-files#2"]}
    s1 = c.confirm(task, prop["plan"], classification=inst_cls)
    assert s1["step_id"] == "office-files#1" and s1["capability"] == "office-files"

    s2 = c.record({"file_reading": "Sheet1 totals", "file_result": "read-only"}, s1["map_id"], "office-files#1")
    assert s2["step_id"] == "office-files#2"
    assert s2["recorded_outputs"]["office-files#1.file_reading"] == "Sheet1 totals"

    done = c.record({"file_reading": "report blocks", "file_result": "report.pdf"}, s2["map_id"], "office-files#2")
    assert done["mode"] == "checks"
    state = json.loads((consumer / ".marionette" / "state.json").read_text(encoding="utf-8"))
    assert state["outputs"]["office-files#1.file_result"] == "read-only"
    assert state["outputs"]["office-files#2.file_result"] == "report.pdf"


def test_preserve_completed_retains_valid_upstream_outputs_and_rejects_orphaned_downstream(marionette_pkg, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)
    task = "Build landing page with scroll animation"
    prop1 = proposed(c, task, ["visual-direction", "motion-principles", "gsap-scrolltrigger"], {"stack:gsap"})
    s1 = c.confirm(task, prop1["plan"], {"stack:gsap"})
    page_out = {k: f"val_{k}" for k in s1["required_outputs"]}
    s2 = c.record(page_out, s1["map_id"], "visual-direction")
    c.record({"motion-spec": "scrub hero", "reduced-motion": "fade"}, s2["map_id"], "motion-principles")

    # Cannot preserve an incomplete step (gsap-scrolltrigger was not recorded)
    prop_replan = proposed(c, task, ["visual-direction", "motion-principles", "css-scroll"], {"stack:css-only"}, new=True)
    with pytest.raises(ValueError, match="incomplete|not completed|missing"):
        c.confirm(task, prop_replan["plan"], {"stack:css-only"}, preserve_completed=["visual-direction", "gsap-scrolltrigger"])

    # Preserving completed upstream steps jumps directly to css-scroll with preserved outputs!
    s_resumed = c.confirm(task, prop_replan["plan"], {"stack:css-only"}, preserve_completed=["visual-direction", "motion-principles"])
    assert s_resumed["capability"] == "css-scroll"
    assert s_resumed["recorded_outputs"]["motion-spec"] == "scrub hero"
    assert s_resumed["recorded_outputs"]["palette"] == "val_palette"
    assert any((consumer / ".marionette" / "archive").iterdir())

    # Falsifier: cannot preserve figma-design (which needs visual-direction) while dropping visual-direction
    task_f = "Landing in Figma"
    pf1 = proposed(c, task_f, ["visual-direction", "figma-design"], new=True)
    sf1 = c.confirm(task_f, pf1["plan"])
    sf2 = c.record(page_out, sf1["map_id"], "visual-direction")
    c.record({k: "done" for k in sf2["required_outputs"]}, sf2["map_id"], "figma-design")

    pf2 = proposed(c, "Updated Landing in Figma", ["visual-direction", "figma-design"], new=True)
    with pytest.raises(ValueError, match="prerequisite|needs|visual-direction"):
        c.confirm("Updated Landing in Figma", pf2["plan"], preserve_completed=["figma-design"])


def test_factory_and_prompts_have_no_domain_leaks_and_use_manifest_stack_rules(tmp_path):
    for p_name in ("intake.md", "harmonizer.md", "classify.md"):
        text = (ROOT / "prompts" / p_name).read_text(encoding="utf-8")
        assert not re.search(r"\b(?:gsap|figma|marionette|work-map)\b", text, re.I), f"Domain leak in prompts/{p_name}"

    proj = tmp_path / "rust_proj"
    proj.mkdir()
    (proj / "package.json").write_text('{"dependencies":{"gsap":"3.12.0"}}', encoding="utf-8")
    (proj / "Cargo.toml").write_text('[dependencies]\ntokio = "1"\n', encoding="utf-8")

    # Legacy None fallback vs explicit empty rules=[] vs custom Rust rules
    assert detect_stack(proj) == {"stack:gsap"}
    assert detect_stack(proj, rules=[]) == set()
    rust_rules = [{"file": "Cargo.toml", "contains": "tokio", "emits": "stack:tokio", "unless": ["stack:sync-only"]}]
    assert detect_stack(proj, rules=rust_rules) == {"stack:tokio"}
    assert detect_stack(proj, {"stack:sync-only"}, rules=rust_rules) == {"stack:sync-only"}
    with pytest.raises(ValueError, match="Conflicting stack"):
        validate_stack({"stack:tokio", "stack:sync-only"}, conflict_groups=[["stack:tokio", "stack:sync-only"]])


def test_strict_frontmatter_parser_tokened_lock_unlock_and_safe_launcher(marionette_pkg, portable_project, tmp_path):
    # Every Marionette capability passes the strict parser (29 after the Ponytail intake)
    assert len(parse_capabilities(MARIONETTE / "capabilities")) == 29

    # Unknown frontmatter key (`need` typo) is rejected
    typo_cap = tmp_path / "typo.md"
    typo_cap.write_text(
        '---\n' + INTENTS + 'id: typo\nrole: test\nwhen: "—"\nafter: []\noutputs: ["x"]\nchecks: []\nneed: []\n---\n## Sources\nSource: demo\n',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="[Uu]nknown frontmatter|unexpected"):
        parse_capability(typo_cap)

    # Multiline YAML list line (`- item`) is rejected clearly
    yaml_list_cap = tmp_path / "yamllist.md"
    yaml_list_cap.write_text(
        '---\n' + INTENTS + 'id: yamllist\nrole: test\nwhen: "—"\nafter: []\noutputs:\n  - key: val\nchecks: []\n---\n## Sources\nSource: demo\n',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="multiline|YAML|frontmatter"):
        parse_capability(yaml_list_cap)

    # Tokened lock & explicit unlock
    consumer = tmp_path / "consumer"
    c = Coordinator(marionette_pkg, consumer)
    lock_file = c.state_dir / ".write-lock"
    c.state_dir.mkdir(parents=True, exist_ok=True)

    # Plain-text lock stays busy and cannot be unlocked by token
    lock_file.write_text("another process", encoding="utf-8")
    with pytest.raises(ValueError, match="busy"):
        c.unlock("any-token")
    assert lock_file.exists()

    # JSON tokened lock reports token in busy error and unlocks only with exact matching token
    lock_file.write_text(json.dumps({"pid": 999999, "token": "tok-123", "host": "local", "created_at": 1000.0}), encoding="utf-8")
    prop = proposed(c, "Create workbook and convert", ["office-authoring", "office-files"])
    with pytest.raises(ValueError, match="tok-123"):
        c.confirm("Create workbook and convert", prop["plan"])
    with pytest.raises(ValueError, match="token"):
        c.unlock("wrong-token")
    assert lock_file.exists()
    assert c.unlock("tok-123")["unlocked"] is True
    assert not lock_file.exists()

    # Safe _LAUNCHER works even if skill directory itself is named "opencode"
    rel = build_release(portable_project / "sources.json", portable_project, tmp_path / "rel")
    copied_skill = tmp_path / "opencode"
    shutil.copytree(rel / "adapters" / "opencode" / "skills" / "muro", copied_skill)
    run = subprocess.run(
        [sys.executable, str(copied_skill / "muro.py"), "plan", "--task", "Test launcher", "--project", str(consumer)],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert run.returncode == 0, run.stderr
    assert json.loads(run.stdout)["mode"] == "classification-required"
