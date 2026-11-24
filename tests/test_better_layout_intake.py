"""better-layout: Jakub Krehel's layout skill as one on-demand capability, layout-structure.

The upstream has no release or tag: the pin follows its head, recorded below. These tests read
local package metadata only; the separately recorded source check/build verifies the actual
pinned remote. Runtime selections are explicit host-AI response fixtures, never a classifier
and never evidence that a model understands a request or its negation.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.delivery import validate_delivery
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import decision


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "better-layout"
COMMIT = "672ae44ace6aaed65b86cbb1e2fd6fbea0e79578"
CAPABILITY = "layout-structure"
INTENTS = ["ui.layout-structure", "ui.layout-review"]
FILES = ["skills/better-layout/SKILL.md", "skills/better-layout/grouping-and-alignment.md",
         "skills/better-layout/spacing-and-adaptivity.md", "skills/better-layout/reporting.md"]


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


def test_manifest_pins_the_original_upstream_head_not_the_vendored_copy():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    # The unmodified vendored copy in boraoztunc/skills has no license file of its own for these skills;
    # the original upstream carries the MIT license of its author at its root.
    assert src["repo_url"] == "https://github.com/jakubkrehel/skills"
    # No release or tag upstream: the pin follows the head (ADR-0009).
    assert (src["pin"], src["commit"]) == ("head", COMMIT) and "release" not in src
    assert src["license"] == "MIT" and "Jakub Krehel" in src["copyright"]
    assert set(FILES + ["LICENSE"]) == set(src["selected_paths"])
    # Every file the method opens at run time travels, so nothing is intake-only here.
    assert "intake_only_paths" not in src and "notice_paths" not in src
    assert "skills/better-layout/agents/**" in src["excluded_paths"]
    assert src["runtime_deps"] == [] and src["intake"]["goal"].strip()
    assert SOURCE in manifest["plugin"]["replaces"]
    assert all(source["id"] != "ui-craft" for source in manifest["sources"])


def test_the_procedure_matches_the_router_and_keeps_source_provenance():
    cap = catalog()[CAPABILITY]
    row = next(row for row in parse_router(PACKAGE / "ROUTER.md") if row.id == CAPABILITY)
    assert cap.role == row.role == "layout-structure"
    assert [intent["id"] for intent in cap.intents] == INTENTS == row.intents_list()
    assert cap.outputs == ["layout_changes", "layout_report"] == row.outputs_list()
    assert cap.after == row.after_list() == [] and cap.when == "—"
    assert cap.needs == [] and cap.hooks == [] and cap.conflicts == []
    assert set(cap.reads) == {"design_file", "design_tokens", "layout", "constraints"}
    # Each intent answers only the checks written for it (ADR-0018): a review does not edit, a structure pass has no report.
    assert set(cap.intent_checks) == set(INTENTS)
    assert "report_in_source_format" in cap.intent_checks["ui.layout-review"]
    assert "report_in_source_format" not in cap.intent_checks["ui.layout-structure"]
    assert "failures_shown" not in cap.intent_checks["ui.layout-structure"]
    assert set(cap.check_conditions) == {"project_tokens_used"}
    sources = cap.body.split("## Sources", 1)[1]
    assert SOURCE in sources and COMMIT in sources and "pin `head`" in sources and "MIT" in sources
    assert all(intent in cap.body for intent in INTENTS) and "Changes for coexistence (ADR-0017)" in sources
    body = before_sources(cap)
    assert "<package_root>/scripts/better-layout/SKILL.source.md" in body and "skills/better-layout/SKILL.md" not in body
    for name in ("grouping-and-alignment.md", "spacing-and-adaptivity.md", "reporting.md"):
        assert name in body, name
    for check in cap.checks:
        assert f"**{check}**" in cap.body
    # The sibling skills are not in the package: the body names no skill it cannot send the host to.
    for sibling in ("better-accessibility", "better-ui", "better-typography", "better-interface", "better-motion"):
        assert sibling not in body, sibling


def test_source_numbers_and_conditions_are_carried_unchanged():
    body = catalog()[CAPABILITY].body
    for phrase in ("at least 2× the gap within one", "8px inside, 16px or more between",
                   "one spacing step per nesting level (16px is a useful default)",
                   "12px between adjacent bordered or filled controls", "24px between the visible glyphs",
                   "about 16px inline on mobile", "16–32px peek", "`viewport-fit=cover`",
                   "`scroll-padding-block-start`", "more than 3 secondary actions", "no `order`, `row-reverse`",
                   "320px, 200% zoom and the RTL mirror", "`Not verified`", "pseudo-localization", "German",
                   "never place a critical action where resizing, zoom or scrolling clips it",
                   "clipping or overlap at 320px width or 200% zoom is always `HIGH`",
                   "never `Approve` for coverage you did not inspect", "No actionable layout findings",
                   "numbers below apply only where the project has no spacing scale"):
        assert phrase in body, phrase
    tools = {tool["name"]: tool for tool in catalog()[CAPABILITY].tools}
    # Without a browser the source's own static checks run and the rest is reported as not verified.
    assert tools["file-access"]["required"] is True and tools["browser"]["required"] is False


def test_delivery_registers_nothing_and_accounts_for_every_part():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"capability", "dropped"}
    assert {target for item in mine for target in item["targets"]} == {CAPABILITY}
    # Checked against its own capabilities: the catalog also holds another source's active hook.
    assert validate_delivery({"decisions": mine}, [catalog()[CAPABILITY]], {SOURCE}) == []
    content = "\n".join(item["content"] for item in mine)
    for part in FILES[:1] + ["grouping-and-alignment.md", "spacing-and-adaptivity.md", "reporting.md",
                             "better-interface", "frontmatter description"]:
        assert part in content, part
    assert not any(wiring["capability"] == CAPABILITY for wiring in document.get("hooks", []))
    # Layout rules concern the code of one task: none of them is session text.
    assert "layout" not in document["always_on"].lower()


def test_the_method_is_discoverable_and_has_authored_examples_and_eval_cases():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    entry = next(item for item in entries["entries"] if item["name"] == "marionette-design-review")
    assert CAPABILITY in entry["capabilities"] and SOURCE in entry["absorbs"]
    assert "layout" in entry["description"] and len(entry["description"]) <= 1024
    examples = read_json("guide-examples.json")["examples"]
    shown = {(s["capability"], s["intent"]) for example in examples for s in example["selections"]}
    assert {(CAPABILITY, intent) for intent in INTENTS} <= shown
    expected = {case["id"]: case["expect"] for case in read_json("eval-cases.json")["cases"]}
    assert expected["bl-fix-mobile-layout"]["selections"] == [{"capability": CAPABILITY, "intent": INTENTS[0]}]
    assert expected["bl-layout-review-report-only"]["selections"] == [{"capability": CAPABILITY, "intent": INTENTS[1]}]
    # Responsive limits recorded as data in a DESIGN.md keep their owner.
    assert expected["bl-responsive-limits-stay-design-file"]["capabilities"] == ["design-file"]
    # The neighbours state the boundary from their side too.
    assert "layout structure" in json.dumps(caps["design-file"].intents) and "layout structure" in json.dumps(caps["design-review"].intents)


@pytest.mark.parametrize("task", [
    "Fix checkout.tsx so it does not break at 320px or with German labels.",
    "Review Pricing.tsx for layout problems and report them with a severity; change nothing.",
])
def test_explicit_ai_fixtures_select_layout_structure_as_one_direct_step(coordinator, task):
    answer = decision(coordinator, task, [CAPABILITY])
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == CAPABILITY
    assert result["required_outputs"] == ["layout_changes", "layout_report"]
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("task, capability", [
    ("Check contrast, keyboard focus and touch targets of dashboard.html and fix them.", "design-review"),
    ("Update the responsive limits in DESIGN.md: breakpoints at 600 and 960.", "design-file"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability):
    answer = decision(coordinator, task, [capability])
    result = coordinator.propose(task, set(), classification=answer)
    assert result.get("capability") == capability or result["plan"] == [capability]
