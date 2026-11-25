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
from routing_helpers import FIXTURE, INTENTS, ROUTER_HEADER, copy_delivery, copy_prompts, decision, proposed

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def package(tmp_path):
    # With its manifest, so the copy runs under the fixture's own slug: its state folder is `.pressroom`.
    pkg = tmp_path / "package"
    pkg.mkdir()
    shutil.copytree(FIXTURE / "capabilities", pkg / "capabilities")
    shutil.copy2(FIXTURE / "ROUTER.md", pkg / "ROUTER.md")
    shutil.copy2(FIXTURE / "sources.json", pkg / "sources.json")
    copy_prompts(pkg)
    copy_delivery(pkg)
    return pkg


def test_atomic_step_cli_with_stdin_and_inline_json_completes_without_temp_files(package, tmp_path, monkeypatch, capsys):
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    real_artifact = consumer / "outline.md"
    real_artifact.write_text("# Spring\n# Summer\n", encoding="utf-8")

    # 1. Plan without classification
    assert runtime_main(["plan", "--package", str(package), "--project", str(consumer), "--task", "Story and pacing"]) == 0
    req = json.loads(capsys.readouterr().out)
    cls_doc = {
        **req["context"],
        "status": "selected",
        "reason": "Both the story brief and the pacing spec requested.",
        "questions": [],
        "selections": [
            {"capability": "story-brief", "intent": "story.brief", "reason": "r1"},
            {"capability": "pacing-spec", "intent": "story.pacing", "reason": "r2"},
        ],
    }

    # Reject multiple "-" stdin consumers in one CLI call
    assert runtime_main([
        "step", "--package", str(package), "--project", str(consumer),
        "--map-id", "m", "--capability", "story-brief", "--outputs", "-", "--result", "-"
    ]) == 1
    capsys.readouterr()

    # 2. Propose + confirm in one call via inline --classification-json (0 temp files!)
    assert runtime_main([
        "plan", "--package", str(package), "--project", str(consumer),
        "--task", "Story and pacing", "--classification-json", json.dumps(cls_doc), "--confirm"
    ]) == 0
    step1 = json.loads(capsys.readouterr().out)
    assert step1["capability"] == "story-brief"
    map_id = step1["map_id"]

    # Falsifier: invalid check in atomic `step` leaves state byte-identical (no partial output write!)
    state_file = consumer / ".pressroom" / "state.json"
    before_bytes = state_file.read_bytes()
    bad_batch = {
        "outputs": {
            "audience": "New beekeepers", "angle": "one hive, one year", "outline": "outline.md", "voice": "plain",
        },
        "checks": [{"name": "nonexistent_check", "status": "pass", "evidence": "bad"}],
    }
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(bad_batch)))
    assert runtime_main([
        "step", "--package", str(package), "--project", str(consumer),
        "--map-id", map_id, "--capability", "story-brief", "--step-data", "-"
    ]) == 1
    capsys.readouterr()
    assert state_file.read_bytes() == before_bytes

    # 3. Valid atomic `step` for step 1 via stdin advances immediately to step 2
    c_ref = Coordinator(package, consumer)
    good_batch_1 = {
        "outputs": bad_batch["outputs"],
        "checks": [{"name": chk, "status": "pass", "evidence": "verified"} for chk in step1["checks"]],  # the scope of story.brief (ADR-0018)
    }
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(good_batch_1)))
    assert runtime_main([
        "step", "--package", str(package), "--project", str(consumer),
        "--map-id", map_id, "--capability", "story-brief", "--step-data", "-"
    ]) == 0
    step2 = json.loads(capsys.readouterr().out)
    assert step2["mode"] == "step" and step2["capability"] == "pacing-spec"

    # 4. Valid atomic `step` for final step 2 auto-completes map and reports attestation
    good_batch_2 = {
        "outputs": {"pacing-plan": "fade 200ms", "reduced-motion": "opacity only"},
        "checks": [{"name": chk, "status": "pass", "evidence": "verified"} for chk in step2["checks"]],
    }
    assert runtime_main([
        "step", "--package", str(package), "--project", str(consumer),
        "--map-id", map_id, "--capability", "pacing-spec", "--step-json", json.dumps(good_batch_2)
    ]) == 0
    final_res = json.loads(capsys.readouterr().out)
    assert final_res["mode"] == "completed"
    assert final_res["output_attestation"]["outline"] == "verified-file"
    assert final_res["output_attestation"]["pacing-plan"] == "self-attested"
    # A story.brief step answers its own checks; angle_single belongs to the angle intent (ADR-0018).
    assert final_res["effective_checks"]["story-brief"] == {"audience_named": "pass", "outline_ordered": "pass"}


def test_multi_instance_steps_support_distinct_intents_and_files_with_namespaced_outputs(package, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(package, consumer)
    task = "Extract the notes from draft.docx then convert chapter.docx to PDF"
    req = c.propose(task, set())

    # Duplicate bare capability without distinct step_id is still rejected
    dup_cls = {
        **req["context"], "status": "selected", "reason": "dup", "questions": [],
        "selections": [
            {"capability": "manuscript-files", "intent": "files.extraction", "reason": "r1"},
            {"capability": "manuscript-files", "intent": "files.conversion", "reason": "r2"},
        ],
    }
    with pytest.raises(ValueError, match="Duplicate capability|step_id"):
        c.propose(task, set(), classification=dup_cls)

    # Explicit step_id instances succeed and namespace outputs cleanly
    inst_cls = {
        **req["context"], "status": "selected", "reason": "Two distinct file operations", "questions": [],
        "selections": [
            {"step_id": "manuscript-files#1", "capability": "manuscript-files", "intent": "files.extraction", "reason": "Read the draft"},
            {"step_id": "manuscript-files#2", "capability": "manuscript-files", "intent": "files.conversion", "reason": "Convert docx"},
        ],
    }
    prop = c.propose(task, set(), classification=inst_cls)
    assert prop == {"mode": "confirm", "task": task, "plan": ["manuscript-files#1", "manuscript-files#2"]}
    s1 = c.confirm(task, prop["plan"], classification=inst_cls)
    assert s1["step_id"] == "manuscript-files#1" and s1["capability"] == "manuscript-files"

    s2 = c.record({"file_reading": "Draft notes", "file_result": "read-only"}, s1["map_id"], "manuscript-files#1")
    assert s2["step_id"] == "manuscript-files#2"
    assert s2["recorded_outputs"]["manuscript-files#1.file_reading"] == "Draft notes"

    done = c.record({"file_reading": "chapter blocks", "file_result": "chapter.pdf"}, s2["map_id"], "manuscript-files#2")
    assert done["mode"] == "checks"
    state = json.loads((consumer / ".pressroom" / "state.json").read_text(encoding="utf-8"))
    assert state["outputs"]["manuscript-files#1.file_result"] == "read-only"
    assert state["outputs"]["manuscript-files#2.file_result"] == "chapter.pdf"


def test_preserve_completed_retains_valid_upstream_outputs_and_rejects_orphaned_downstream(package, tmp_path):
    consumer = tmp_path / "consumer"
    c = Coordinator(package, consumer)
    task = "Plan a story and build its scroll movement"
    prop1 = proposed(c, task, ["story-brief", "pacing-spec", "scroll-build-gsap"], {"stack:gsap"})
    s1 = c.confirm(task, prop1["plan"], {"stack:gsap"})
    brief_out = {k: f"val_{k}" for k in s1["required_outputs"]}
    s2 = c.record(brief_out, s1["map_id"], "story-brief")
    c.record({"pacing-plan": "scrub opening", "reduced-motion": "fade"}, s2["map_id"], "pacing-spec")

    # Cannot preserve an incomplete step (scroll-build-gsap was not recorded)
    prop_replan = proposed(c, task, ["story-brief", "pacing-spec", "scroll-build-css"], {"stack:css-only"}, new=True)
    with pytest.raises(ValueError, match="incomplete|not completed|missing"):
        c.confirm(task, prop_replan["plan"], {"stack:css-only"}, preserve_completed=["story-brief", "scroll-build-gsap"])

    # Preserving completed upstream steps jumps directly to scroll-build-css with preserved outputs!
    s_resumed = c.confirm(task, prop_replan["plan"], {"stack:css-only"}, preserve_completed=["story-brief", "pacing-spec"])
    assert s_resumed["capability"] == "scroll-build-css"
    assert s_resumed["recorded_outputs"]["pacing-plan"] == "scrub opening"
    assert s_resumed["recorded_outputs"]["angle"] == "val_angle"
    assert any((consumer / ".pressroom" / "archive").iterdir())

    # Falsifier: cannot preserve newsletter-edition (which needs story-brief) while dropping story-brief
    task_f = "New story in the newsletter"
    pf1 = proposed(c, task_f, ["story-brief", "newsletter-edition"], new=True)
    sf1 = c.confirm(task_f, pf1["plan"])
    sf2 = c.record(brief_out, sf1["map_id"], "story-brief")
    c.record({k: "done" for k in sf2["required_outputs"]}, sf2["map_id"], "newsletter-edition")

    pf2 = proposed(c, "Updated story in the newsletter", ["story-brief", "newsletter-edition"], new=True)
    with pytest.raises(ValueError, match="prerequisite|needs|story-brief"):
        c.confirm("Updated story in the newsletter", pf2["plan"], preserve_completed=["newsletter-edition"])


def test_factory_and_prompts_have_no_domain_leaks_and_use_manifest_stack_rules(tmp_path):
    for p_name in ("intake.md", "harmonizer.md", "classify.md"):
        text = (ROOT / "prompts" / p_name).read_text(encoding="utf-8")
        assert not re.search(r"\b(?:gsap|figma)\b", text, re.I), f"Domain leak in prompts/{p_name}"

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


def test_strict_frontmatter_parser_tokened_lock_unlock_and_safe_launcher(package, portable_project, tmp_path):
    # Every capability of a whole package passes the strict parser
    assert len(parse_capabilities(package / "capabilities")) == 8

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
    c = Coordinator(package, consumer)
    lock_file = c.state_dir / ".write-lock"
    c.state_dir.mkdir(parents=True, exist_ok=True)

    # Plain-text lock stays busy and cannot be unlocked by token
    lock_file.write_text("another process", encoding="utf-8")
    with pytest.raises(ValueError, match="busy"):
        c.unlock("any-token")
    assert lock_file.exists()

    # JSON tokened lock reports token in busy error and unlocks only with exact matching token
    lock_file.write_text(json.dumps({"pid": 999999, "token": "tok-123", "host": "local", "created_at": 1000.0}), encoding="utf-8")
    prop = proposed(c, "Check the facts and convert", ["fact-check", "manuscript-files"])
    with pytest.raises(ValueError, match="tok-123"):
        c.confirm("Check the facts and convert", prop["plan"])
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
