"""AI handoff regressions; supplied decisions are fixtures, not an LLM evaluation."""
import copy
import json
import shutil
from pathlib import Path

import pytest

from muro.runtime import Coordinator
from routing_helpers import INTENTS, ROUTER_HEADER, copy_prompts, decision, proposed

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree(ROOT / directory, package / directory)
    shutil.copy2(ROOT / "ROUTER.md", package / "ROUTER.md")
    return Coordinator(package, tmp_path / "consumer")


@pytest.mark.parametrize("task", ["Design a static hero without animation", "rinomina questa funzione", "检查订单导出"])
def test_missing_ai_decision_never_executes_or_falls_back(coordinator, task):
    result = coordinator.propose(task, {"stack:gsap"})
    assert result["mode"] == "classification-required"
    assert "catalog" in result and "classification" in result["instructions"].lower()
    assert "plan" not in result and "capability" not in result
    assert not coordinator.state_dir.exists()


def test_ai_selects_static_hero_without_python_adding_motion(coordinator):
    task = "Design a static hero without animation"
    route = decision(coordinator, task, ["visual-direction"], {"stack:gsap"})
    result = coordinator.propose(task, {"stack:gsap"}, classification=route)
    assert result["mode"] == "direct"
    assert result["capability"] == "visual-direction"


def test_motion_spec_does_not_imply_scroll_implementation(coordinator):
    task = "Describe hover timing, no implementation"
    route = decision(coordinator, task, ["motion-principles"], {"stack:gsap"})
    result = coordinator.propose(task, {"stack:gsap"}, classification=route)
    assert result["plan"] == ["visual-direction", "motion-principles"]


@pytest.mark.parametrize("status", ["no_match", "needs_clarification"])
def test_unmatched_or_uncertain_ai_decisions_do_not_create_maps(coordinator, status):
    task = "An unclear or unsupported request"
    route = decision(coordinator, task, [], status=status)
    result = coordinator.propose(task, classification=route)
    assert result["mode"] == status
    assert result["reason"] == route["reason"]
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("change", [
    {"task": "a different task"}, {"catalog_digest": "outdated"},
    {"stack_tokens": ["stack:css-only"]}, {"selections": []}, {"reason": ""},
    {"selections": [{"capability": "invented", "intent": "invented", "reason": "test"}]},
    {"selections": [{"capability": "visual-direction", "intent": "invented", "reason": "test"}]},
])
def test_invalid_ai_decision_is_rejected_without_side_effects(coordinator, change):
    task = "Make the screen readable"
    route = decision(coordinator, task, ["visual-direction"])
    route.update(change)
    with pytest.raises(ValueError):
        coordinator.propose(task, classification=route)
    assert not coordinator.state_dir.exists()


def test_incompatible_variant_is_not_replaced(coordinator):
    task = "Animate the section on scroll"
    route = decision(coordinator, task, ["gsap-scrolltrigger"], {"stack:css-only"})
    with pytest.raises(ValueError, match="compatible|constraint"):
        coordinator.propose(task, {"stack:css-only"}, classification=route)
    assert not coordinator.state_dir.exists()


def test_catalog_change_requires_reclassification(coordinator):
    task = "Arrange the screen"
    route = decision(coordinator, task, ["visual-direction"])
    path = coordinator.package_root / "capabilities" / "visual-direction.md"
    path.write_text(path.read_text(encoding="utf-8") + "\nNew instruction.\n", encoding="utf-8")
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    with pytest.raises(ValueError, match="catalog"):
        current.propose(task, classification=route)


def test_resume_retains_ai_selection_and_rejects_legacy_state(coordinator):
    task = "Specify hover behavior"
    route = decision(coordinator, task, ["motion-principles"])
    proposal = coordinator.propose(task, classification=route)
    coordinator.confirm(task, proposal["plan"])
    state = json.loads(coordinator.state_path.read_text(encoding="utf-8"))
    assert state["classification"] == route
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    assert current.resume()["capability"] == "visual-direction"
    del state["classification"]
    coordinator.state_path.write_text(json.dumps(state), encoding="utf-8")
    with pytest.raises(ValueError, match="classif|legacy|Legacy"):
        current.resume()


def test_new_non_ui_intent_routes_without_python_changes(tmp_path):
    package = tmp_path / "package"
    (package / "capabilities").mkdir(parents=True)
    (package / "capabilities" / "query-review.md").write_text(
        '---\nid: query-review\nrole: sql-analysis\nwhen: —\nafter: []\n'
        'outputs: ["query_findings"]\nchecks: ["query_verified"]\ntools: []\nhooks: []\nconflicts: []\n'
        'intents: [{"id":"data.query-efficiency","description":"Analyze query performance and indexes.","excludes":["Do not execute production migrations."]}]\n'
        '---\n# Query review\nInspect the query and explain the evidence.\n## Sources\nSource: demo\n', encoding="utf-8")
    (package / "ROUTER.md").write_text(ROUTER_HEADER +
        "| query-review | sql-analysis | — | — | query_findings | data.query-efficiency |\n", encoding="utf-8")
    copy_prompts(package)
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Perché l'estrazione impiega così tanto?", ["query-review"])
    assert result["mode"] == "direct"
    assert result["required_outputs"] == ["query_findings"]
    assert not coordinator.state_dir.exists()


def test_duplicate_role_selection_is_rejected_even_if_both_are_compatible(coordinator):
    path = coordinator.package_root / "capabilities" / "alternative.md"
    path.write_text('---\nid: alternative\nrole: art-direction\nwhen: —\nafter: []\n'
                    'outputs: ["alternative"]\nchecks: []\n' + INTENTS +
                    '---\n## Sources\nSource: demo\n', encoding="utf-8")
    router = coordinator.package_root / "ROUTER.md"
    router.write_text(router.read_text(encoding="utf-8") +
                      "\n| alternative | art-direction | — | — | alternative | testing.verify |\n", encoding="utf-8")
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    with pytest.raises(ValueError, match="Conflicting variants"):
        proposed(current, "Improve the screen", ["visual-direction", "alternative"])


def test_stack_constraints_on_implicit_prerequisites_are_enforced(coordinator):
    path = coordinator.package_root / "capabilities" / "figma-design.md"
    path.write_text(path.read_text(encoding="utf-8").replace('after: ["visual-direction"]',
                    'after: ["gsap-scrolltrigger"]'), encoding="utf-8")
    router = coordinator.package_root / "ROUTER.md"
    router.write_text(router.read_text(encoding="utf-8").replace(
        "| figma-design | figma-design | — | visual-direction |",
        "| figma-design | figma-design | — | gsap-scrolltrigger |"), encoding="utf-8")
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    with pytest.raises(ValueError, match="[Ii]ncompatible"):
        proposed(current, "Build the approved design", ["figma-design"])


def test_legacy_map_can_be_archived_without_interpreting_or_overwriting_it(coordinator):
    coordinator.state_dir.mkdir(parents=True)
    original = '{"task":"old", "outputs":{"palette":"preserve"}}'
    coordinator.state_path.write_text(original, encoding="utf-8")
    task = "A new screen"
    proposal = proposed(coordinator, task, ["visual-direction"], new=True)
    assert proposal["mode"] == "confirm"
    assert coordinator.state_path.read_text(encoding="utf-8") == original
    coordinator.confirm(task, proposal["plan"])
    archive = list((coordinator.state_dir / "archive").glob("*/state.json"))
    assert len(archive) == 1 and archive[0].read_text(encoding="utf-8") == original
    assert coordinator._state()["outputs"] == {}


def test_changed_classification_cannot_reuse_old_outputs(coordinator):
    task = "Improve the interface"
    proposal = proposed(coordinator, task, ["motion-principles"])
    coordinator.confirm(task, proposal["plan"])
    before = coordinator.state_path.read_bytes()
    with pytest.raises(ValueError, match="--new"):
        proposed(coordinator, task, ["figma-design"])
    assert coordinator.state_path.read_bytes() == before


def test_confirm_cannot_bypass_ai_handoff(coordinator):
    with pytest.raises(ValueError, match="classification"):
        coordinator.confirm("Design a page", ["visual-direction"])
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("value", [None, [], "selected", 12, {"status": []}])
def test_malformed_classification_values_are_errors_not_tracebacks(coordinator, value):
    if value is None:
        assert coordinator.propose("task", classification=value)["mode"] == "classification-required"
    else:
        with pytest.raises(ValueError, match="classification"):
            coordinator.propose("task", classification=value)


def test_empty_manifest_does_not_invent_css_only_preference(tmp_path):
    from muro.runtime import detect_stack
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    assert detect_stack(tmp_path) == set()
    (tmp_path / "package.json").write_text('{"dependencies":{"gsap":"3"}}', encoding="utf-8")
    assert detect_stack(tmp_path) == {"stack:gsap"}
    assert detect_stack(tmp_path, {"stack:css-only"}) == {"stack:css-only"}
    with pytest.raises(ValueError, match="Conflicting"):
        detect_stack(tmp_path, {"stack:css-only", "stack:gsap"})


def test_factory_validation_requires_intents_and_router_agreement(tmp_path):
    from muro.core import parse_capability, parse_router, validate_capabilities_and_router
    cap = tmp_path / "x.md"
    text = '---\nid: x\nrole: testing\nwhen: —\nafter: []\noutputs: ["x"]\nchecks: []\n---\n## Sources\nSource: demo\n'
    cap.write_text(text, encoding="utf-8")
    with pytest.raises(ValueError, match="intents"):
        parse_capability(cap)
    cap.write_text(text.replace("id: x", INTENTS + "id: x"), encoding="utf-8")
    router = tmp_path / "ROUTER.md"
    router.write_text(ROUTER_HEADER + "| x | testing | — | — | x | wrong.intent |\n", encoding="utf-8")
    assert any("disagrees" in error for error in validate_capabilities_and_router([parse_capability(cap)], parse_router(router)))


@pytest.mark.parametrize("intents", [[], ["ui"], [{"id":"x"}],
                                    [{"id":"x", "description":"", "excludes":[]}],
                                    [{"id":"x", "description":"valid", "excludes":"words"}]])
def test_malformed_intent_metadata_is_rejected(tmp_path, intents):
    from muro.core import parse_capability
    cap = tmp_path / "x.md"
    cap.write_text('---\nid: x\nrole: testing\nwhen: —\nafter: []\noutputs: ["x"]\nchecks: []\n'
                   f'intents: {json.dumps(intents)}\ntools: []\nhooks: []\nconflicts: []\n---\n## Sources\nSource: demo\n', encoding="utf-8")
    with pytest.raises(ValueError, match="intent"):
        parse_capability(cap)


def test_stack_cli_cannot_smuggle_an_intent_token(coordinator):
    with pytest.raises(ValueError, match="stack"):
        coordinator.propose("task", {"intent:ui"})


def test_catalog_exposes_tool_requirements_and_hook_policy_without_running_them(coordinator):
    result = coordinator.propose("Create a Figma screen")
    figma = next(item for item in result["catalog"] if item["id"] == "figma-design")
    assert any(tool["name"] == "figma-mcp" and tool["required"] for tool in figma["tools"])
    assert figma["hooks"] == []
    assert not coordinator.state_dir.exists()


def test_hook_metadata_is_returned_as_data_never_executed(coordinator):
    cap = coordinator.package_root / "capabilities" / "work-map.md"
    content = cap.read_text(encoding="utf-8")
    hook = {"event": "after-change", "action": "Record validation evidence", "tools": ["shell"], "policy": "manual"}
    content = content.replace("hooks: []", "hooks: " + json.dumps([hook]))
    cap.write_text(content, encoding="utf-8")
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    result = current.propose("Coordinate this change")
    work = next(item for item in result["catalog"] if item["id"] == "work-map")
    assert work["hooks"] == [hook]
    assert not current.state_dir.exists()


def test_distinct_roles_cannot_claim_the_same_output(coordinator):
    from muro.core import RouterRow
    from muro.routing import resolve_selection
    rows = [RouterRow("a", "role-a", "—", "", "shared"),
            RouterRow("b", "role-b", "—", "", "shared")]
    with pytest.raises(ValueError, match="output|producer"):
        resolve_selection(rows, ["a", "b"], set(), set())


def test_declared_cross_role_conflict_blocks_before_any_execution(coordinator):
    path = coordinator.package_root / "capabilities" / "figma-design.md"
    text = path.read_text(encoding="utf-8").replace("conflicts: []", 'conflicts: ["motion-principles"]')
    path.write_text(text, encoding="utf-8")
    current = Coordinator(coordinator.package_root, coordinator.project_root)
    with pytest.raises(ValueError, match="[Cc]onflict"):
        proposed(current, "Design and animate the screen", ["figma-design", "motion-principles"])
    assert not current.state_dir.exists()


def test_undeclared_native_hook_policy_is_rejected(tmp_path):
    from muro.core import parse_capability
    text = ('---\nid: x\nrole: testing\nwhen: —\nafter: []\noutputs: ["x"]\nchecks: []\n' + INTENTS +
            '---\n## Sources\nSource: demo\n').replace('hooks: []',
            'hooks: [{"event":"startup","action":"run something","tools":[],"policy":"automatic"}]')
    cap = tmp_path / "x.md"
    cap.write_text(text, encoding="utf-8")
    with pytest.raises(ValueError, match="hook"):
        parse_capability(cap)


def test_another_writer_cannot_overwrite_active_map_evidence(coordinator):
    task = "Specify motion"
    proposal = proposed(coordinator, task, ["motion-principles"])
    step = coordinator.confirm(task, proposal["plan"])
    before = coordinator.state_path.read_bytes()
    (coordinator.state_dir / ".write-lock").write_text("another process", encoding="utf-8")
    with pytest.raises(ValueError, match="writer|lock|busy"):
        coordinator.record({key: "fixture evidence" for key in step["required_outputs"]},
                           step["map_id"], step["capability"])
    assert coordinator.state_path.read_bytes() == before


def test_declared_conflict_cannot_be_hidden_by_completed_outputs(coordinator):
    from muro.core import RouterRow
    from muro.routing import resolve_selection
    rows = [RouterRow("a", "role-a", "—", "", "a"), RouterRow("b", "role-b", "—", "", "b")]
    with pytest.raises(ValueError, match="[Cc]onflict"):
        resolve_selection(rows, ["a", "b"], set(), {"a"}, {"a": ["b"]})


@pytest.mark.parametrize("same_task", [False, True])
def test_late_outputs_and_checks_cannot_contaminate_replacement_map(coordinator, same_task):
    task_a = "Original motion task"
    proposal = proposed(coordinator, task_a, ["motion-principles"])
    old_step = coordinator.confirm(task_a, proposal["plan"])
    other = Coordinator(coordinator.package_root, coordinator.project_root)
    task_b = task_a if same_task else "Unrelated Figma task"
    proposal = proposed(other, task_b, ["figma-design"], new=True)
    new_step = other.confirm(task_b, proposal["plan"])
    assert old_step["map_id"] != new_step["map_id"]
    before = other.state_path.read_bytes()
    with pytest.raises(ValueError, match="[Ss]tale|map"):
        coordinator.record({key: "evidence only for A" for key in old_step["required_outputs"]},
                           old_step["map_id"], old_step["capability"])
    with pytest.raises(ValueError, match="[Ss]tale|map"):
        coordinator.record_check({"name": "palette_applied", "status": "pass", "evidence": "Only verified A"},
                                 old_step["map_id"], old_step["capability"])
    assert other.state_path.read_bytes() == before


def test_evidence_requires_exact_active_step_binding(coordinator):
    task = "Specify motion"
    proposal = proposed(coordinator, task, ["motion-principles"])
    step = coordinator.confirm(task, proposal["plan"])
    outputs = {key: "fixture evidence" for key in step["required_outputs"]}
    with pytest.raises(ValueError, match="capability|step"):
        coordinator.record(outputs, step["map_id"], "motion-principles")
    next_step = coordinator.record(outputs, step["map_id"], step["capability"])
    assert next_step["capability"] == "motion-principles"
    assert next_step["map_id"] == step["map_id"]
    with pytest.raises(ValueError, match="capability|step"):
        coordinator.record(outputs, step["map_id"], step["capability"])
    result = coordinator.record_check({"name": "palette_applied", "status": "pass", "evidence": "Fixture check"},
                                      step["map_id"], step["capability"])
    assert result["map_id"] == step["map_id"]
    assert result["results"][0]["capability"] == "visual-direction"


def test_active_bodies_deliver_outputs_without_direct_managed_map_writes(coordinator):
    for name in ("visual-direction", "motion-principles", "gsap-scrolltrigger", "css-scroll", "figma-design"):
        body = coordinator.capabilities[name].body
        assert "## Output handoff" in body, name
        assert "Do not edit" in body, name
        assert "Write outputs to `.muro/map.md" not in body, name
        assert "Write to `.muro/map.md" not in body, name


def test_helper_commands_resolve_against_installed_package_not_consumer(coordinator):
    result = proposed(coordinator, "Create a page", ["visual-direction"])
    assert result["package_root"] == str(coordinator.package_root)
    assert '<package_root>/scripts/taste-skill/scripts/start.mjs' in result["instructions"]
    assert 'scripts/taste-skill/start.mjs' not in result["instructions"]


def test_check_must_belong_to_its_bound_capability(coordinator):
    task = "Specify motion"
    proposal = proposed(coordinator, task, ["motion-principles"])
    step = coordinator.confirm(task, proposal["plan"])
    before = coordinator.state_path.read_bytes()
    check = {"name": "palette_applied", "status": "pass", "evidence": "Fixture check"}
    with pytest.raises(ValueError, match="capability"):
        coordinator.record_check(check, step["map_id"], "motion-principles")
    with pytest.raises(ValueError, match="capability"):
        coordinator.record_check(check, step["map_id"], "figma-design")
    with pytest.raises(ValueError, match="map_id"):
        coordinator.record_check(check, "", step["capability"])
    assert coordinator.state_path.read_bytes() == before


def test_map_without_identity_is_not_silently_resumed(coordinator):
    task = "Specify motion"
    proposal = proposed(coordinator, task, ["motion-principles"])
    coordinator.confirm(task, proposal["plan"])
    state = json.loads(coordinator.state_path.read_text(encoding="utf-8"))
    del state["map_id"]
    coordinator.state_path.write_text(json.dumps(state), encoding="utf-8")
    with pytest.raises(ValueError, match="--new"):
        coordinator.resume()


def test_cli_rejects_unbound_evidence_and_accepts_exact_binding(coordinator, tmp_path, capsys):
    from muro.runtime import runtime_main
    task = "Specify motion"
    proposal = proposed(coordinator, task, ["motion-principles"])
    step = coordinator.confirm(task, proposal["plan"])
    outputs = tmp_path / "outputs.json"
    outputs.write_text(json.dumps({key: "fixture evidence" for key in step["required_outputs"]}), encoding="utf-8")
    base = ["record", "--package", str(coordinator.package_root), "--project", str(coordinator.project_root),
            "--outputs", str(outputs)]
    before = coordinator.state_path.read_bytes()
    assert runtime_main(base) == 1
    assert "map_id" in capsys.readouterr().err
    assert coordinator.state_path.read_bytes() == before
    assert runtime_main([*base, "--map-id", step["map_id"], "--capability", step["capability"]]) == 0
    advanced = json.loads(capsys.readouterr().out)
    assert advanced["capability"] == "motion-principles"
    assert advanced["map_id"] == step["map_id"]
