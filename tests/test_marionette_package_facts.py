"""Facts of the real package that the factory's own tests used to assert in passing.

They leave Muro with the package (owner rule of 2026-11-25: nothing that runs in Muro names a package built
with it). Until the package has moved, they stay here, in one module, so the modules they came from return to
Muro's own Tests run.
"""
import json
import re
import shutil
from pathlib import Path

import pytest

from muro import RouterRow, parse_capabilities, parse_router, validate_capabilities_and_router
from muro.adapters import _skill
from muro.delivery import validate_delivery
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import copy_delivery, copy_prompts, proposed
from test_audit_host import INLINE_LIMIT, packaged, run

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"
PACKAGE = MARIONETTE


def frontmatter_description(text):
    front = text.split("---")[1]
    raw = next(line for line in front.splitlines() if line.startswith("description:")).split(":", 1)[1].strip()
    return json.loads(raw) if raw.startswith('"') else raw


def test_marionette_records_a_decision_for_every_source():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    document = json.loads((MARIONETTE / "delivery.json").read_text(encoding="utf-8"))
    capabilities = parse_capabilities(MARIONETTE / "capabilities")
    assert validate_delivery(document, capabilities, {s["id"] for s in manifest["sources"]}) == []
    assert {d["source"] for d in document["decisions"]} == ({s["id"] for s in manifest["sources"]}
                                                         | set(document["custom_instructions"]["files"]))


def test_marionette_entries_cover_everything_its_intake_absorbed():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    data = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))
    assert set(data) == {"entries"} and validate_entries(data, caps, plugin) == []
    assert {c for e in data["entries"] for c in e["capabilities"]} == {c.id for c in caps}


def test_every_marionette_skill_description_is_a_loadable_yaml_scalar(tmp_path):
    from muro.adapters import _skill
    caps = parse_capabilities(MARIONETTE / "capabilities")
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    for entry in [None, *entries]:
        front = _skill(plugin, "claude-code", capabilities=caps, entry=entry).split("---", 2)[1]
        value = next(l for l in front.splitlines() if l.startswith("description:"))[len("description: "):]
        assert value.startswith('"') or (": " not in value and " #" not in value and not value.endswith(":")), value


def test_marionette_entries_name_every_absorbed_original_except_its_session_policy():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    claimed = [name for item in entries for name in item.get("absorbs", [])]
    assert len(claimed) == len(set(claimed))
    # i-have-adhd became session policy only (delivery.json), so no entry stands in for it.
    assert sorted(set(manifest["plugin"]["replaces"]) - set(claimed)) == ["i-have-adhd"]
    caps = parse_capabilities(MARIONETTE / "capabilities")
    assert validate_entries({"entries": entries}, caps, manifest["plugin"]) == []


def test_the_built_skills_name_the_originals_and_keep_the_umbrella_text_whole(tmp_path):
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    caps = parse_capabilities(MARIONETTE / "capabilities")
    umbrella = frontmatter_description(_skill(manifest["plugin"], "claude-code", capabilities=caps, entries=entries))
    assert len(umbrella) <= 1024
    assert manifest["plugin"]["description"].replace(":", ";").rstrip(".") in umbrella  # not cut any more
    assert umbrella.endswith("Never invoke a skill it absorbs; its entries name them.")
    web = next(item for item in entries if item["name"] == "marionette-web-design")
    text = _skill(manifest["plugin"], "claude-code", capabilities=caps, entry=web, entries=entries)
    description = frontmatter_description(text)
    assert description.startswith(web["description"])
    assert "ui-ux-pro-max" in description and "also when the user names one of them" in description
    assert len(description) <= 1024
    assert re.search(r"^user-invocable: false$", text, re.M)


def test_repository_capabilities_and_router_are_valid():
    from muro import parse_capability, validate_capabilities_and_router
    cap_dir = PACKAGE / "capabilities"
    router_path = PACKAGE / "ROUTER.md"
    capabilities = []
    for f in sorted(cap_dir.glob("*.md")):
        capabilities.append(parse_capability(f))
    # Parse ROUTER.md
    text = (PACKAGE / "ROUTER.md").read_text(encoding="utf-8")
    router_rows = []
    for ln in text.splitlines():
        ln = ln.strip()
        if ln.startswith("|") and ln.endswith("|"):
            parts = [p.strip() for p in ln.split("|")[1:-1]]
            if all(all(c in "- " for c in p) for p in parts):
                continue
            if parts and parts[0].lower() == "id":
                continue
            if len(parts) >= 5:
                router_rows.append(RouterRow(
                    id=parts[0], role=parts[1], when=parts[2],
                    after=parts[3], outputs=parts[4], intents=parts[5]
                ))
    errors = validate_capabilities_and_router(capabilities, router_rows)
    assert errors == []


def test_repository_capabilities_and_router_are_valid_through_muro_build():
    from muro_build import validate_capabilities_and_router
    errors = validate_capabilities_and_router(PACKAGE / "capabilities", PACKAGE / "ROUTER.md")
    assert errors == []


def test_manifest_declares_a_mode_for_every_source():
    sources = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))["sources"]
    modes = {src["id"]: (src.get("pin"), src.get("release")) for src in sources}
    assert modes == {
        "open-paper-skills": ("head", None),
        "tokeneconomizer": ("release", "v0.1.0"),
        "wayfinder": ("release", "v1.3.2"),
        "ui-ux-pro-max": ("release", "v2.15.0"),
        "genoffice": ("release", "v0.12.852"),
        "ponytail": ("release", "v5.3.3"),
        "i-have-adhd": ("release", "v0.4.1"),
        "egm": ("release", "v0.1.1"),
        "superpowers": ("release", "v7.0.2"),
        "zero-slop-design": ("release", "v0.2.1"),
        "claude-design-system-prompt": ("release", "v1-design-prompt"),
        # These upstreams publish no release or tag: the owner follows their HEAD.
        "motion-design": ("head", None),
        "gsap-scrolltrigger": ("head", None),
        "ai-design-skills": ("head", None),
        "explain-this": ("head", None),
        "text-humanizer": ("head", None),
        "better-layout": ("head", None),
        "charles-skills": ("head", None),
    }


def test_the_guide_documents_at_least_ten_examples():
    # Split from test_simulate::test_prepare_gives_the_context_the_guide_computes_for_every_documented_example,
    # whose mechanics now run on the fixture package: the count measures this package, not the simulator.
    examples = json.loads((PACKAGE / "guide-examples.json").read_text(encoding="utf-8"))["examples"]
    assert len(examples) >= 10


# --- From test_reharmonization: what the 2026-11-10 re-harmonization left in the bodies ---------------------
# Regressions against the pinned sources: removed, source-contradicted text stays out and recorded decisions
# stay in. They do not evaluate the quality of AI reasoning.

CAPS = {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def operative(name):
    """Instructions before ## Sources; the provenance notes there name removed text on purpose."""
    return CAPS[name].body.split("## Sources")[0]


def test_rules_from_unpinned_taste_copy_are_gone():
    body = operative("visual-direction")
    for phrase in ("3 of 20", "no eyebrow labels", "No 01/02/03", "cream-and-terracotta",
                   "one motion accent per view", "honest code drawings"):
        assert phrase not in body, phrase
    assert "elayadesign/ai-design-skills@456d9e0d" in CAPS["visual-direction"].body


def test_taste_skill_is_removed_with_its_gate_and_its_hook():
    # 2026-11-17 (ADR-0026): taste-skill travelled whole and its finish gate was the active Stop hook.
    # 2026-11-19, owner decision: the source is removed; the website step follows landing-page-design
    # alone, whose visual system applies again, and the package registers no hook.
    cap = CAPS["visual-direction"]
    assert cap.hooks == []
    body = operative("visual-direction")
    for phrase in ("taste-skill", "gate.mjs", "start.mjs", "<TS>"):
        assert phrase not in body, phrase
    assert "Owner decision of 2026-11-19: taste-skill is removed" in cap.body
    for section in ("B1 to B7", "B11. Tagline reveal section (mandatory)", "Geist, Manrope, Geist Mono, Poppins"):
        assert section in body, section
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    assert "taste-skill" not in [source["id"] for source in manifest["sources"]]
    assert not {"taste-skill", "design-taste-frontend"} & set(manifest["plugin"]["replaces"])
    delivery = json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))
    assert "hooks" not in delivery
    assert "taste-skill" not in [decision["source"] for decision in delivery["decisions"]]


def test_gsap_capability_drops_claims_absent_from_its_only_selected_file():
    body = CAPS["gsap-scrolltrigger"].body
    assert "skills/gsap-scrolltrigger/references" not in body
    body = operative("gsap-scrolltrigger")
    for phrase in ("ScrollTrigger.kill()", "elastic.out", "within 2px", "nested scroll containers"):
        assert phrase not in body, phrase
    assert "never on a child tween" in body
    assert "never both on one trigger" in body
    # Owner decision 2026-11-10: GSAP is installed when the task needs it and it is missing.
    assert "`npm install gsap`" in body
    assert "Never install it against a CSS-only constraint" in body


def test_motion_principles_uses_source_tables():
    body = operative("motion-principles")
    for phrase in ("spring-gentle", "ease-out-expo", "cinematic", "150–500ms"):
        assert phrase not in body, phrase
    assert "Default: Corporate for UI" in body
    assert "total stagger under 500ms" in body
    assert "Hover under 100ms" in body


def test_css_scroll_states_it_has_no_upstream_source():
    body = CAPS["css-scroll"].body
    assert "Chromium 115" not in body
    assert "No selected upstream source covers CSS scroll-driven animation" in body
    for phrase in ("Firefox 113", "Safari 16.4"):
        assert phrase not in body, phrase


def test_work_map_follows_wayfinder_and_checks_the_work():
    cap = CAPS["work-map"]
    assert cap.outputs == ["task_map", "spec", "step_sequence"]
    assert "map_structure_valid" not in cap.checks
    for phrase in ("EX-002", "INV-002", "resolve_selection"):
        assert phrase not in cap.body, phrase
    assert "Problem Statement, Solution, User Stories" in cap.body
    assert "no issue tracker" in cap.body


def test_pdf_of_existing_file_has_one_owner():
    assert "A PDF of a file the user already has is a format conversion" in CAPS["office-authoring"].body
    assert any(i["id"] == "office.format-conversion" for i in CAPS["office-files"].intents)


def test_reads_declares_the_data_flow_of_the_package():
    # Split from test_reharmonization::test_reads_declares_the_data_flow_and_is_validated: what the validator
    # refuses in `reads` stays there on the fixture package, as
    # test_reads_is_optional_data_flow_validated_against_producers; these are the lists this package declares.
    assert CAPS["canvas-design"].reads == ["palette", "typography", "layout", "constraints", "offer", "page_outline",
                                          "aesthetic_direction", "design_tokens", "design_file"]
    assert CAPS["motion-principles"].reads == ["palette", "typography", "layout", "constraints", "aesthetic_direction", "design_file"]
    assert CAPS["gsap-scrolltrigger"].reads == CAPS["css-scroll"].reads == ["motion-spec", "reduced-motion"]
    assert CAPS["office-files"].reads == [] and all(cap.after == [] for cap in CAPS.values())
    assert validate_capabilities_and_router(list(CAPS.values()), parse_router(PACKAGE / "ROUTER.md")) == []


# --- From test_runtime: three routes through the real catalog, with sentences of its bodies -----------------
# The runtime mechanics they pass through (ordered steps, a direct step, one record per step) are tested in
# test_runtime on the fixture package.

@pytest.fixture
def package(tmp_path):
    root = tmp_path / "package"
    root.mkdir()
    shutil.copytree(PACKAGE / "capabilities", root / "capabilities")
    shutil.copy2(PACKAGE / "ROUTER.md", root / "ROUTER.md")
    copy_prompts(root)
    copy_delivery(root, PACKAGE)
    return root


SCROLL_PAGE = ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
PAGE_OUTPUTS = {"offer": "trial", "page_outline": "hero, proof, FAQ", "palette": "black", "typography": "Geist",
                "layout": "hero", "constraints": "no gradients", "page": "index.html"}


def test_landing_strategy_runs_before_motion_when_both_are_selected(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = proposed(coordinator, "Build a landing page with scroll animation", SCROLL_PAGE, {"stack:gsap"})
    assert result["mode"] == "confirm"
    step = coordinator.confirm(
        "Build a landing page with scroll animation", result["plan"], {"stack:gsap"})
    assert step["capability"] == "visual-direction"
    assert "offer" in step["required_outputs"]
    assert "page_outline" in step["required_outputs"]
    assert "one primary CTA, never competing CTAs above the fold" in step["instructions"]
    assert "Put proof directly beside the claim it supports" in step["instructions"]


def test_figma_task_uses_figma_capability_without_assuming_mcp(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    selected = ["visual-direction", "canvas-design"]
    result = proposed(coordinator, "Design a landing page in Figma", selected)
    assert result["plan"] == selected
    step = coordinator.confirm("Design a landing page in Figma", result["plan"])
    assert step["required_outputs"] == list(PAGE_OUTPUTS)
    nxt = Coordinator(package, tmp_path / "consumer").record(dict(PAGE_OUTPUTS), step["map_id"], step["capability"])
    assert nxt["capability"] == "canvas-design"
    assert "Figma MCP" in nxt["instructions"]
    assert "do not simulate" in nxt["instructions"]


def test_ordinary_engineering_task_is_one_coordinator_step(package, tmp_path):
    result = proposed(Coordinator(package, tmp_path / "consumer"), "rinomina questa funzione", ["work-map"])
    assert result["mode"] == "direct"
    assert result["capability"] == "work-map"
    assert "Size the route first" in result["instructions"]
    assert "no map" in result["instructions"]


# --- From test_live_host_fixes ------------------------------------------------------------------------------

def test_capabilities_reference_packaged_source_skills_by_their_packaged_name():
    caps = parse_capabilities(MARIONETTE / "capabilities")
    pattern = re.compile(r"<(?:package_root|[A-Z]{2})>[^\s`'\")]*SKILL\.md")
    for cap in caps:
        assert not pattern.search(cap.body), (cap.id, pattern.search(cap.body).group(0))
    body = next(c for c in caps if c.id == "visual-direction").body
    assert "<LP>/SKILL.source.md" in body
    # Provenance lines keep the upstream file name.
    assert "skills/landing-page-design/SKILL.md" in body


# --- From test_lessons: the facts of this package that four factory tests asserted in passing --------------
# Their mechanics run in test_lessons on the fixture package.

def test_the_website_step_is_declared_resumable_and_the_file_step_is_not():
    # Split from test_lessons::test_a_resumable_capability_gets_a_map_even_as_a_single_step.
    assert CAPS["visual-direction"].resumable is True and CAPS["office-files"].resumable is False


def test_the_manifest_declares_the_originals_the_package_replaces():
    # Split from test_lessons::test_replaced_originals_are_declared_and_reach_every_install_note.
    from muro import validate_plugin_identity
    plugin = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    assert "figma-designer" in plugin["replaces"] and validate_plugin_identity(plugin) == []


def test_the_eval_gold_is_valid_with_at_least_ten_cases_and_a_no_match():
    # Split from test_lessons::test_eval_prepares_blind_cases_and_scores_authored_decisions: the count
    # measures this package, not the eval.
    from muro.evals import validate_cases
    cases = json.loads((MARIONETTE / "eval-cases.json").read_text(encoding="utf-8"))
    assert validate_cases(cases, list(CAPS.values())) == [] and len(cases["cases"]) >= 10
    assert any(c["expect"]["status"] == "no_match" for c in cases["cases"])


def test_the_router_holds_43_rows_and_parses_under_the_text_cap():
    # Split from test_lessons::test_router_line_cap_counts_prose_not_catalog_rows.
    text = (MARIONETTE / "ROUTER.md").read_text(encoding="utf-8")
    rows = [line for line in text.splitlines() if line.startswith("| ") and not line.startswith("| id ")]
    assert len(rows) == 43 == len(parse_router(MARIONETTE / "ROUTER.md"))


# --- From test_audit_p0 -------------------------------------------------------------------------------------

def test_no_capability_body_hardcodes_the_dot_muro_state_folder():
    # Split from test_audit_p0::test_marionette_package_has_no_hardcoded_dot_muro_paths_and_validator_rejects_them:
    # the validator's refusal stays there on the fixture package, as
    # test_validator_rejects_a_hardcoded_dot_muro_path_under_another_slug.
    caps = parse_capabilities(MARIONETTE / "capabilities")
    rows = parse_router(MARIONETTE / "ROUTER.md")
    for cap in caps:
        assert ".muro/" not in cap.body, f"{cap.id} still hardcodes .muro/"
    assert validate_capabilities_and_router(caps, rows, plugin_slug="marionette") == []


def test_skill_md_synthesizes_domain_rich_bounded_discovery_description():
    manifest = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))
    caps = parse_capabilities(MARIONETTE / "capabilities")
    # Built as the release builds it, with the package's discovery entries: without them the umbrella lists
    # every absorbed name itself, and Marionette's 68 names leave no room for the description (2026-11-17).
    entries = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    skill_text = _skill(manifest["plugin"], "opencode", capabilities=caps, entries=entries)
    fm = skill_text.split("---")[1]
    desc_line = next(line for line in fm.splitlines() if line.startswith("description:"))
    desc = desc_line.split(":", 1)[1].strip()
    if desc.startswith('"'):
        desc = json.loads(desc)             # the YAML quotes are not part of the description
    assert len(desc) <= 1024
    assert "Use when" in desc
    for keyword in ("landing", "Figma", "scroll", "Office", "explainer"):
        assert keyword.lower() in desc.lower(), keyword
    assert "AI-routed coordinator" in skill_text
    assert "--classification" in skill_text


# --- From test_audit_p1 -------------------------------------------------------------------------------------

def test_the_factory_prompts_name_neither_this_package_nor_one_of_its_capabilities():
    # Split from test_audit_p1::test_factory_and_prompts_have_no_domain_leaks_and_use_manifest_stack_rules,
    # which keeps the words that belong to no package: a factory test cannot write this package's name.
    for p_name in ("intake.md", "harmonizer.md", "classify.md"):
        text = (ROOT / "prompts" / p_name).read_text(encoding="utf-8")
        assert not re.search(r"\b(?:marionette|work-map)\b", text, re.I), f"Domain leak in prompts/{p_name}"


# --- From test_audit_host -----------------------------------------------------------------------------------

def test_the_focused_plan_of_the_whole_catalog_fits_inline_on_the_host(tmp_path):
    # Split from test_audit_host::test_compact_plan_fits_inline_and_keeps_what_the_ai_needs: focus, index and
    # the one-line call are tested there on the fixture package; the bound means something only at this size.
    pkg = packaged(tmp_path, MARIONETTE)
    consumer = tmp_path / "consumer"
    consumer.mkdir()
    task = "Disegna in Figma la landing page di Lumo. Non abbiamo ancora una struttura dei contenuti."
    full = run(pkg, consumer, "plan", "--compact", "--task", task)
    out = run(pkg, consumer, "plan", "--compact", "--focus", "visual-direction,design-guidance,canvas-design", "--task", task)
    assert len(out.encode("utf-8")) < INLINE_LIMIT < 30000, len(out.encode("utf-8"))
    brief_all = run(pkg, consumer, "plan", "--compact", "--brief", "--task", task)
    assert len(brief_all.encode("utf-8")) < len(out.encode("utf-8")) < len(full.encode("utf-8"))
    data = json.loads(out)
    assert data["classification_path"].endswith(str(Path(".marionette") / "classification.json"))
    entries = {e["id"]: e for e in json.loads(full)["catalog"]}
    assert len(entries) == 43
    authored = json.loads((MARIONETTE / "entries.json").read_text(encoding="utf-8"))["entries"]
    groups = [e for e in data["catalog"] if "id" not in e]
    assert len(groups) == len(authored) - 1                  # the entry wholly in focus leaves nothing to index
    assert all("marionette-" not in json.dumps(group["capabilities"]) for group in groups)
    assert entries["canvas-design"]["needs"][0]["capability"] == "visual-direction"
    assert entries["gsap-scrolltrigger"]["when"] == "stack:gsap"
    assert entries["css-scroll"]["conflicts"] == ["gsap-scrolltrigger"]
    assert not (consumer / ".marionette").exists()  # still writes nothing


# --- From test_check_scope ----------------------------------------------------------------------------------
# The runtime's check scope (ADR-0018) is tested there on the fixture package; these are the scopes this
# package declares, which those tests used to assert while they ran on it.

def test_every_multi_intent_capability_of_the_example_declares_its_scope():
    from muro.core import parse_capability
    for path in sorted((PACKAGE / "capabilities").glob("*.md")):
        cap = parse_capability(path)
        if len(cap.intents) > 1:
            assert set(cap.intent_checks) == {intent["id"] for intent in cap.intents}, cap.id


def test_design_options_scopes_the_panel_checks_to_both_intents_and_the_variation_checks_to_one():
    # Split from test_check_scope::test_each_step_lists_only_the_checks_of_its_intent and the three tests
    # beside it, which replayed the decision of a session of 2026-11-13 (variations, then a tweak panel).
    cap = CAPS["design-options"]
    assert cap.checks_for("ui.design-variations") == [
        "options_differ_in_one_sentence", "both_ends_covered", "single_file_delivered", "recommendation_given",
        "tweaks_update_and_persist", "panel_hidden_when_off"]
    assert cap.checks_for("ui.tweak-controls") == ["single_file_delivered", "tweaks_update_and_persist",
                                                   "panel_hidden_when_off"]
    assert set(cap.check_conditions) == {"tweaks_update_and_persist", "panel_hidden_when_off"}


def test_the_landing_strategy_answers_two_checks_and_one_applies_only_to_a_landing_page():
    # Split from test_check_scope::test_a_direct_step_lists_the_checks_of_its_intent.
    cap = CAPS["visual-direction"]
    checks = cap.checks_for("ui.landing-strategy")
    assert checks == ["single_primary_action", "proof_supported"] and "palette_applied" not in checks
    assert {name for name in checks if name in cap.check_conditions} == {"single_primary_action"}
    assert "landing page" in cap.check_conditions["single_primary_action"]


def test_the_guide_keeps_both_design_option_steps_of_its_documented_comparison():
    # Split from test_check_scope::test_the_guide_keeps_both_steps_of_a_repeated_capability, which now reads
    # the fixture's example of a repeated capability.
    from muro.guide import _examples
    from muro.routing import catalog_digest, catalog_entries
    rows = parse_router(PACKAGE / "ROUTER.md")
    delivery = json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))
    digest = catalog_digest(catalog_entries(rows, CAPS), CAPS,
                            (ROOT / "prompts" / "classify.md").read_text(encoding="utf-8"), delivery)
    example = next(item for item in _examples(PACKAGE, rows, CAPS, digest) if item["title"].startswith("Temi a confronto"))
    assert example["path"] == ["design-options"]
    assert [(step["step"], step["intent"]) for step in example["steps"]] == [
        ("design-options#1", "ui.design-variations"), ("design-options#2", "ui.tweak-controls")]


# --- From test_conditional_needs ----------------------------------------------------------------------------

def test_the_canvas_step_needs_the_website_step_only_for_a_landing_page():
    # Split from test_conditional_needs::test_catalog_exposes_the_condition_for_the_ai.
    cap = CAPS["canvas-design"]
    assert [need["capability"] for need in cap.needs] == ["visual-direction"]
    assert "landing page" in cap.needs[0]["when"] and cap.after == []


def test_the_canvas_step_labels_its_condition_in_at_most_five_words():
    # Split from test_conditional_needs::test_malformed_needs_frontmatter_is_rejected.
    label = CAPS["canvas-design"].needs[0]["label"]
    assert label == "only landing without outline" and len(label.split()) <= 5


# --- From test_amend_preservation ---------------------------------------------------------------------------

def test_the_file_step_scopes_the_checks_of_reading_and_of_editing_apart():
    # Split from test_amend_preservation::test_changed_intent_reexecutes_with_its_own_checks_instead_of_writing_invalid_state
    # and test_invalid_previous_check_scope_is_rejected_before_archive_or_replacement.
    cap = CAPS["office-files"]
    reading, editing = cap.checks_for("office.content-extraction"), cap.checks_for("office.file-editing")
    assert "conversion_loss_reported" in reading and "post_edit_check_clean" not in reading
    assert "post_edit_check_clean" in editing and "conversion_loss_reported" not in editing


# --- From test_eval_intents ---------------------------------------------------------------------------------

def test_marionette_gold_covers_abstention_and_operation_boundaries():
    cases = json.loads((MARIONETTE / "eval-cases.json").read_text(encoding="utf-8"))["cases"]
    by_id = {case["id"]: case for case in cases}
    assert any(case["expect"]["status"] == "needs_clarification" for case in cases)
    assert by_id["docx-to-pdf"]["expect"]["selections"][0]["intent"] == "office.format-conversion"
    assert by_id["zsd-export-tokens"]["expect"]["selections"][0]["intent"] == "design-file.token-export"
    assert by_id["design-inspect-file-not-live-ui"]["expect"]["selections"][0]["intent"] == "design-file.document-review"
    assert by_id["deep-chat-veto"]["expect"]["status"] == "no_match"
    caps = {cap.id: cap for cap in parse_capabilities(MARIONETTE / "capabilities")}
    for case in cases:
        if any(len(caps[name].intents) > 1 or caps[name].needs for name in case["expect"]["capabilities"]):
            assert "selections" in case["expect"], case["id"]


# --- From test_ai_routing -----------------------------------------------------------------------------------

def test_shipped_catalog_declares_no_forced_prerequisites(package, tmp_path):
    # Re-harmonization 2026-11-10: each consumer can start from existing work;
    # the AI orders producer and consumer explicitly when both are needed.
    coordinator = Coordinator(package, tmp_path / "consumer")
    assert all(not cap.after for cap in coordinator.capabilities.values())
    task = "Design the landing page, then specify its scroll motion and build it"
    ids = ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    result = proposed(coordinator, task, ids, {"stack:gsap"})
    assert result["plan"] == ids


def test_active_bodies_deliver_outputs_without_direct_managed_map_writes(package, tmp_path):
    coordinator = Coordinator(package, tmp_path / "consumer")
    for name in ("visual-direction", "motion-principles", "gsap-scrolltrigger", "css-scroll", "canvas-design"):
        body = coordinator.capabilities[name].body
        assert "## Output handoff" in body, name
        assert "Do not edit" in body, name
        assert "Write outputs to `.muro/map.md" not in body, name
        assert "Write to `.muro/map.md" not in body, name


def test_the_website_step_names_its_source_files_under_the_packaged_scripts_folder(package, tmp_path):
    # Split from test_ai_routing::test_helper_commands_resolve_against_installed_package_not_consumer, which
    # keeps the package root and the form of the path on the fixture package.
    coordinator = Coordinator(package, tmp_path / "consumer")
    result = coordinator.confirm("Create a page", proposed(coordinator, "Create a page", ["visual-direction"])["plan"])
    assert '<package_root>/scripts/ai-design-skills/skills/landing-page-design' in result["instructions"]
    assert '<package_root>/skills/ai-design-skills' not in result["instructions"]


def test_the_canvas_step_requires_a_design_canvas_and_declares_no_hook():
    # Split from test_ai_routing::test_catalog_exposes_tool_requirements_and_hook_policy_without_running_them.
    cap = CAPS["canvas-design"]
    assert any(tool["name"] == "design-canvas" and tool["required"] for tool in cap.tools)
    assert cap.hooks == []
