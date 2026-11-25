"""charles-skills, the drops shelf: three more skills as three on-demand capabilities.

charles-design-laws became ux-laws, charles-design-tips became design-tips and charles-ux-animation
became interaction-motion, each with a build and a review intent. The owner asked for harmony with
ui-ux-pro-max and the other sources: no source is rewritten where numbers differ, lookup results stay
proposals, and a recorded system comes before every source. These tests read local package metadata
only. Runtime selections are explicit host-AI response fixtures, never a classifier and never evidence
that a model understands a request or its negation.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import decision


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "charles-skills"
COMMIT = "83de509dd10b77ebaf83c3f9986b538cdaf19b63"
DROPS = "skills/drops"
FILES = [f"{DROPS}/charles-design-laws/SKILL.md", f"{DROPS}/charles-design-tips/SKILL.md",
         f"{DROPS}/charles-ux-animation/SKILL.md", f"{DROPS}/charles-ux-animation/references/recipes.md",
         f"{DROPS}/charles-ux-animation/references/techniques.md"]
CAPS = {
    "ux-laws": ("charles-design-laws", ["ui.ux-laws", "ui.ux-laws-review"], ["ux_changes", "ux_report"]),
    "design-tips": ("charles-design-tips", ["ui.design-tips", "ui.design-tips-review"], ["tips_changes", "tips_report"]),
    "interaction-motion": ("charles-ux-animation", ["ui.interaction-motion", "ui.interaction-review"],
                           ["interaction_changes", "interaction_report"]),
}
RECORDED = {"design_file", "design_tokens", "constraints", "aesthetic_direction", "design_candidates", "stack_guidance"}


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def before_sources(cap):
    return cap.body.split("## Sources", 1)[0]


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copytree(PACKAGE / "custom-instructions", package / "custom-instructions")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, package / name)
    return Coordinator(package, tmp_path / "consumer")


def test_the_same_source_selects_the_three_skills_and_leaves_the_rest_of_the_shelf_out():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert (src["pin"], src["commit"]) == ("head", COMMIT)
    assert set(FILES) <= set(src["selected_paths"]) and len(src["selected_paths"]) == 20
    # No blanket exclusion covers a selected file any more; the two image-generating drops stay out.
    assert f"{DROPS}/**" not in src["excluded_paths"]
    for left_out in (f"{DROPS}/charles-create-posters/**", f"{DROPS}/charles-hero-mockups/**",
                     f"{DROPS}/charles-ux-animation/examples/**", f"{DROPS}/charles-design-laws/README.md"):
        assert left_out in src["excluded_paths"], left_out
    assert "media_paths" not in src and "intake_only_paths" not in src
    assert {"charles-design-laws", "charles-design-tips", "charles-ux-animation"} <= set(manifest["plugin"]["replaces"])
    assert len(manifest["sources"]) == 18                       # three skills more, no source more


@pytest.mark.parametrize("capability", sorted(CAPS))
def test_each_procedure_matches_the_router_and_keeps_source_provenance(capability):
    skill, intents, outputs = CAPS[capability]
    cap = catalog()[capability]
    row = next(row for row in parse_router(PACKAGE / "ROUTER.md") if row.id == capability)
    assert cap.role == row.role == capability
    assert [intent["id"] for intent in cap.intents] == intents == row.intents_list()
    assert cap.outputs == outputs == row.outputs_list()
    assert cap.after == row.after_list() == [] and cap.when == "—"
    assert cap.needs == [] and cap.hooks == [] and cap.conflicts == [] and cap.resumable is False
    # A build edits and a review reports: each intent answers only its own checks (ADR-0018).
    build, review = intents
    assert set(cap.intent_checks) == set(intents)
    assert "findings_in_source_table" in cap.intent_checks[review]
    assert "findings_in_source_table" not in cap.intent_checks[build]
    assert not any(check.startswith("recorded_") for check in cap.intent_checks[review])   # a review edits nothing
    assert any(check.startswith("recorded_") for check in cap.intent_checks[build])
    assert "unrun_checks_listed" in cap.intent_checks[build] and "unrun_checks_listed" in cap.intent_checks[review]
    # What another capability or the project recorded is read, never required.
    assert RECORDED <= set(cap.reads)
    sources = cap.body.split("## Sources", 1)[1]
    assert skill in sources and COMMIT in sources and "pin `head`" in sources and "MIT" in sources
    assert "Changes for coexistence (ADR-0017)" in sources
    for check in cap.checks:
        assert f"**{check}**" in cap.body
    body = before_sources(cap)
    assert f"<package_root>/scripts/{SOURCE}/{DROPS}/{skill}" in body
    assert "/SKILL.source.md" in body and "/SKILL.md" not in body
    # No body sends the host to a skill of the repository: a hand-off names a capability of the package.
    assert "charles-" not in body.replace(f"{SOURCE}/{DROPS}/{skill}", "")
    tools = {tool["name"]: tool for tool in cap.tools}
    assert tools["file-access"]["required"] is True and tools["browser"]["required"] is False


def test_the_ux_laws_carry_the_source_rules_and_hand_motion_to_a_capability_of_the_package():
    body = catalog()["ux-laws"].body
    for phrase in ("a later step never rescues an earlier one", "390 × 844 px phone", '"(assumed)"',
                   "behind one row that opens in place", "never more than two levels",
                   "never preselect what costs money, shares data or signs people up", "up to 5 recents",
                   "no tour before the first action", "at least twice the largest gap inside one",
                   "never a region inside a region inside a region", "exactly one element per view breaks the pattern",
                   "progress never reads zero once started and never goes backward",
                   "never let polish pass a screen they failed", "do not build an app to render it",
                   "name the law it breaks", "Severity, Law, Where, Before, After", "**broken**", "**friction**"):
        assert phrase in body, phrase
    assert "`interaction-motion`" in before_sources(catalog()["ux-laws"])


def test_the_design_tips_carry_the_source_numbers_and_report_a_recorded_token():
    cap = catalog()["design-tips"]
    body = cap.body
    for phrase in ("every fix of that kind changes or adds a token", "1.1–1.3", "1.4–1.5", "weight 400",
                   "2 × 1.4 × its font size", "twice as much padding at each side", "48px above and 8px below",
                   "the smaller text's font size", "Delete at the opposite end from Save", "slightly toward blue",
                   "4.5:1", "one hue across the shades", "20–30% at the same hue",
                   "no blur over 28px and no opacity over 0.16", "a visible label above every field", "`tabular-nums`",
                   "sentence case", "verb first", "multiplied by 1.7", "Measure, never eyeball", "375px wide",
                   "Severity, Tip, Where, Before, After", "when one is broken on purpose, say which one and why"):
        assert phrase in body, phrase
    sources = body.split("## Sources", 1)[1]
    # The differences from the other packaged sources are recorded with where each number is (ADR-0017).
    for other in ("ui-ux-pro-max", "1.5–1.75", "charles-color-analysis", "charles-polish"):
        assert other in sources, other
    assert "is not changed here" in before_sources(cap) and "1.5 satisfies both" in before_sources(cap)


def test_interaction_motion_carries_the_source_numbers_and_yields_to_a_recorded_specification():
    cap = catalog()["interaction-motion"]
    body = cap.body
    for phrase in ("Never add a library for what a CSS transition does", "many times a session or from the keyboard",
                   "each move up to 500ms", "about 2.5s", "100–150ms", "only after 300ms and held at least 500ms",
                   "30–50ms apart, only the first 6", "80–100ms apart", "tooltip 125ms", "150–250ms", "200–300ms",
                   "300–400ms", "Exits are 20–30% shorter", "`cubic-bezier(0.32, 0.72, 0, 1)`",
                   "never ease-in for an entrance", "never `transition: all`", "never `scale(0)`",
                   "`scale(0.96)` on `:active`, never below 0.95", "`@media (hover: hover) and (pointer: fine)`",
                   "44×44px on touch and 40×40px with a pointer", "never below 24×24px", "groups of 7 or fewer",
                   "Undo for at least 5 seconds", "do not build a harness", "fades included"):
        assert phrase in body, phrase
    assert {"motion-spec", "reduced-motion"} <= set(cap.reads)
    assert set(cap.check_conditions) == {"numbers_in_named_tokens", "recorded_motion_respected", "reduced_motion_holds"}
    specifics = before_sources(cap).split("## Specifics", 1)[1]
    # The standing rule of 2026-11-12: a recorded specification decides timing and reduced motion.
    assert "then a recorded `motion-spec` and `reduced-motion`" in specifics
    assert "48dp on Android satisfies both" in specifics and "name the difference in the report" in specifics
    sources = body.split("## Sources", 1)[1]
    for fact in ("80–120ms", "Opacity fade only", "~60–70% of enter duration", "44×44pt (Apple) / 48×48dp (Material)",
                 "`motion-principles` owns timing"):
        assert fact in sources, fact


def test_delivery_and_discovery_account_for_the_three_skills():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert [item["targets"] for item in mine][2:5] == [["ux-laws"], ["design-tips"], ["interaction-motion"]]
    dropped = mine[-1]
    # Left out by the owner's choice and unread; one license fact was verified.
    for part in ("charles-unslop", "charles-create-posters", "charles-hero-mockups", "editing and qol"):
        assert part in dropped["content"], part
    assert "CC-BY-4.0" in dropped["reason"] and "were not read" in dropped["reason"]
    assert "frame" not in document["always_on"] and "Tesler" not in document["always_on"]
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    by_name = {item["name"]: item for item in entries["entries"]}
    assert by_name["marionette-ux"]["capabilities"] == ["ux-laws", "design-tips"]
    assert by_name["marionette-ux"]["absorbs"] == ["charles-design-laws", "charles-design-tips"]
    assert "interaction-motion" in by_name["marionette-motion"]["capabilities"]
    assert "charles-ux-animation" in by_name["marionette-motion"]["absorbs"]
    claimed = [name for item in entries["entries"] for name in item.get("absorbs", [])]
    assert len(claimed) == len(set(claimed))


def test_examples_eval_cases_and_neighbours_state_the_boundaries():
    caps = catalog()
    examples = read_json("guide-examples.json")["examples"]
    shown = {s["capability"] for example in examples for s in example["selections"]}
    assert set(CAPS) <= shown
    expected = {case["id"]: case["expect"] for case in read_json("eval-cases.json")["cases"]}
    for case_id, capability, intent in (
            ("cd-checkout-confusing-fix", "ux-laws", "ui.ux-laws"),
            ("cd-ux-laws-review-report-only", "ux-laws", "ui.ux-laws-review"),
            ("cd-tips-thrown-together", "design-tips", "ui.design-tips"),
            ("cd-tips-review-table", "design-tips", "ui.design-tips-review"),
            ("cd-add-modal-and-button-motion", "interaction-motion", "ui.interaction-motion"),
            ("cd-interaction-review-report-only", "interaction-motion", "ui.interaction-review")):
        assert expected[case_id]["selections"] == [{"capability": capability, "intent": intent}], case_id
    # Near misses the blind check passed: the last check before delivery, missing states, and tips against rhythm.
    assert expected["cd-last-check-stays-polish-pass"]["selections"] == [
        {"capability": "design-review", "intent": "ui.polish-pass"}]
    assert expected["cd-missing-states-stay-design-review"]["selections"] == [
        {"capability": "design-review", "intent": "ui.interaction-states"}]
    assert expected["cd-heading-spacing-is-design-tips"]["capabilities"] == ["design-tips"]
    # Looking rules up for a stack stays with ui-ux-pro-max's capability.
    assert expected["cd-rules-lookup-stays-guidance"]["capabilities"] == ["design-guidance"]
    # Both sides state each boundary.
    for neighbour, words in (("design-guidance", "UX laws, design tips and interaction motion"),
                             ("motion-principles", "interaction motion"), ("interface-polish", "interaction motion"),
                             ("interface-polish", "design tips"), ("design-review", "UX laws"),
                             ("layout-structure", "UX laws"), ("color-critique", "design tips"),
                             ("ui-prototype", "UX laws")):
        assert words in json.dumps(caps[neighbour].intents, ensure_ascii=False), (neighbour, words)
    # design-guidance keeps its results as proposals, and records how the differences are handled.
    guidance = caps["design-guidance"].body
    assert "its results stay proposals" in guidance and "no source is rewritten" in guidance


@pytest.mark.parametrize("task, capability", [
    ("Fix the checkout flow in src/checkout by the laws of UX: too many fields and a paid default.", "ux-laws"),
    ("The settings page looks thrown together: centred paragraphs, flat greys, Submit buttons. Fix it.", "design-tips"),
    ("Add open, close and press animations to the cart drawer in our React app.", "interaction-motion"),
])
def test_explicit_ai_fixtures_select_each_capability_as_one_direct_step(coordinator, task, capability):
    result = coordinator.propose(task, set(), classification=decision(coordinator, task, [capability]))
    assert result["mode"] == "direct" and result["capability"] == capability
    assert result["required_outputs"] == CAPS[capability][2]
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("task, capability", [
    ("With UI Pro Max, which UX rules does a Flutter booking app need? No code.", "design-guidance"),
    ("Specify durations and easing for the dashboard's motion; write no code.", "motion-principles"),
    ("Pin the hero and scrub the image on scroll with GSAP.", "gsap-scrolltrigger"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability):
    stack = {"stack:gsap"} if capability == "gsap-scrolltrigger" else set()
    answer = decision(coordinator, task, [capability], stack)
    result = coordinator.propose(task, stack, classification=answer)
    assert result.get("capability") == capability or result["plan"] == [capability]
