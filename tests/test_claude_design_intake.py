"""Integration contract for the claude-design-system-prompt intake (product design in HTML).

Pinned at head 3c3ddb07 (the upstream publishes no release or tag). The source ships a
system prompt and fourteen skills; owner direction of 2026-11-12: nothing of it is injected
into sessions. Runtime decisions below are explicit host-AI response fixtures: they exercise
Python's validation and ordering, not the quality of AI classification.

Every assertion is about this source and the capabilities it produced. Other sources of the
package may declare session text or hooks, and the catalog may grow: nothing here counts
capabilities, entries or sources, or speaks for the package as a whole.
"""
import json
import re
import shutil
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, parse_router
from muro.delivery import validate_delivery
from muro.runtime import Coordinator
from routing_helpers import decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "claude-design-system-prompt"
COMMIT = "3c3ddb07d7aa3fef051d83608596470c95cfd8fe"
HELPERS = f"<package_root>/scripts/{SOURCE}/claude"
SKILLS = ["discovery-questions", "frontend-aesthetic-direction", "wireframe", "make-a-deck", "make-a-prototype",
          "make-tweakable", "generate-variations", "design-system-extract", "component-extract", "accessibility-audit",
          "ai-slop-check", "hierarchy-rhythm-review", "interaction-states-pass", "polish-pass"]
DESIGN = {
    "aesthetic-direction": ("aesthetic-direction", ["ui.aesthetic-direction"]),
    "wireframe": ("lofi-exploration", ["ui.wireframe-exploration"]),
    "ui-prototype": ("prototype-authoring", ["ui.interactive-prototype"]),
    "design-options": ("design-options", ["ui.design-variations", "ui.tweak-controls"]),
    "html-deck": ("html-deck-authoring", ["ui.html-deck"]),
    "design-system-extract": ("design-system-extraction", ["ui.token-extraction", "ui.component-inventory"]),
    "design-review": ("design-review", ["ui.accessibility-audit", "ui.generic-look-check", "ui.hierarchy-rhythm-review",
                                        "ui.interaction-states", "ui.polish-pass"]),
}


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree((PACKAGE if directory == "capabilities" else ROOT) / directory, package / directory)
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    return Coordinator(package, tmp_path / "consumer")


def manifest_and_source():
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    return manifest, next(s for s in manifest["sources"] if s["id"] == SOURCE)


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def delivery():
    return json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))


def test_manifest_pins_head_and_selects_the_prompt_and_its_skills_only():
    manifest, src = manifest_and_source()
    assert src["repo_url"] == "https://github.com/Trystan-SA/claude-design-system-prompt"
    assert src["commit"] == COMMIT and src["pin"] == "head" and "release" not in src
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 Trystan Sarrade"
    assert src["selected_paths"] == ["claude/system-prompt.md", "claude/skills/**"]
    # Absorbed content is not altered (ADR-0017): the capabilities read the prompt's chapters in its own words.
    assert "intake_only_paths" not in src
    assert "codex/**" in src["excluded_paths"] and "README.md" in src["excluded_paths"]
    assert src["runtime_deps"] == [] and "not injected into every session" in src["intake"]["goal"]
    for name in SKILLS:                                   # an installed original would compete for the same requests
        assert name in manifest["plugin"]["replaces"]


def test_design_capabilities_match_the_router_and_carry_their_provenance():
    caps = catalog()
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (role, intents) in DESIGN.items():
        cap = caps[name]
        assert cap.role == role and rows[name].role == role
        assert [intent["id"] for intent in cap.intents] == intents == rows[name].intents_list()
        assert rows[name].outputs_list() == cap.outputs and rows[name].after_list() == cap.after
        assert all(intent["description"].strip() and intent["excludes"] for intent in cap.intents)
        assert cap.when == "—" and cap.after == [] and cap.hooks == []
        sources = cap.body[cap.body.index("## Sources"):]
        assert f"{SOURCE} (Trystan-SA/{SOURCE}@{COMMIT[:8]}, head; commit `{COMMIT}`, pin `head`)" in sources
        assert 'Reverse-engineered system prompt of Claude Design from Anthropic' in sources
        assert "AI intent mapping:" in sources and "Harmonized by: prompts/harmonizer.md (2026-11-12)" in sources
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        assert HELPERS in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
    # Every upstream skill is accounted for in some capability's Sources, by its file name.
    mapped = "\n".join(caps[name].body[caps[name].body.index("## Sources"):] for name in DESIGN)
    for skill in SKILLS:
        assert f"{skill}.md" in mapped, skill
    # The host the prompt was written for is not assumed: its tools are optional logical tools.
    for name in DESIGN:
        required = [tool["name"] for tool in caps[name].tools if tool["required"]]
        assert required == ["file-access"], name
        assert "questions_v2" not in caps[name].body.split("## Sources")[0]


def test_outputs_have_one_owner_and_the_look_has_one_authority():
    caps = catalog()
    mine = [output for name in DESIGN for output in caps[name].outputs]
    assert len(set(mine)) == len(mine)                    # no key produced twice among the design capabilities
    for cap in caps.values():                             # and none of them by any other capability
        assert cap.id in DESIGN or not set(cap.outputs) & set(mine), cap.id
    assert caps["aesthetic-direction"].conflicts == ["visual-direction"]
    assert "aesthetic-direction" in caps["visual-direction"].conflicts
    # Alternatives by wanted format, not a declared conflict.
    assert "office-deck" not in caps["html-deck"].conflicts and "html-deck" not in caps["office-deck"].conflicts
    for name in ("ui-prototype", "html-deck"):
        need, = caps[name].needs
        assert need["capability"] == "aesthetic-direction" and len(need["label"].split()) <= 5
        assert caps[name].resumable is True
        assert "aesthetic_direction" in caps[name].reads and "palette" in caps[name].reads
    for name in ("aesthetic-direction", "wireframe", "design-options", "design-system-extract", "design-review"):
        assert caps[name].needs == [] and caps[name].resumable is False
    assert caps["aesthetic-direction"].reads == ["design_candidates"]
    assert {"motion-spec", "reduced-motion", "palette", "aesthetic_direction"} <= set(caps["design-review"].reads)
    assert "aesthetic_direction" in caps["figma-design"].reads and "design_tokens" in caps["figma-design"].reads
    assert "A recorded `motion-spec`" in caps["design-review"].body      # the timing contradiction has one owner


def test_delivery_carries_the_source_on_demand_only():
    document = delivery()
    caps = catalog()
    mine = [d for d in document["decisions"] if d["source"] == SOURCE]
    # This source's decisions are well formed on their own, checked against its own capabilities.
    assert validate_delivery({"decisions": mine}, [caps[name] for name in DESIGN], {SOURCE}) == []
    # None of them is always-on or a hook, and no hook wiring of the package points at its capabilities.
    assert mine and all(d["form"] in ("capability", "dropped") for d in mine)
    assert not any(wiring.get("capability") in DESIGN for wiring in document.get("hooks", []))
    assert {t for d in mine for t in d["targets"]} == set(DESIGN)
    by_content = {d["content"]: d for d in mine}
    whole = next(d for c, d in by_content.items() if c.startswith("claude/system-prompt.md as a whole"))
    assert whole["form"] == "dropped" and "2026-11-12" in whole["reason"] and "35,565 characters" in whole["reason"]
    assert "ADR-0017" in whole["reason"] and "source's own words" in whole["reason"]
    routing = next(d for c, d in by_content.items() if c.startswith("Chapter 20"))
    assert routing["form"] == "dropped" and "routing" in routing["reason"]
    covered = set()                                       # every chapter of the prompt has a decision
    for content in by_content:
        match = re.search(r"[Cc]hapters? (\d+)(?: (to|and) (\d+))?", content)
        if match:
            first, joiner, last = int(match.group(1)), match.group(2), match.group(3)
            covered |= set(range(first, int(last) + 1)) if joiner == "to" else {first} | ({int(last)} if last else set())
    assert covered == set(range(1, 21))
    for skill in SKILLS:
        assert any(f"{skill}.md" in c for c in by_content), skill


def test_no_brand_prototype_is_a_three_step_chain_with_data_handoff(coordinator):
    task = "Prototipo cliccabile dell'onboarding, senza brand, poi revisione prima della consegna"
    answer = decision(coordinator, task, ["aesthetic-direction", "ui-prototype", "design-review"])
    answer["selections"][2]["intent"] = "ui.polish-pass"
    assert answer["selections"][1]["needs"] == [{"requires": "aesthetic-direction", "applies": True,
                                                 "reason": "Fixture judgment supplied by the test."}]
    plan = coordinator.propose(task, set(), classification=answer)
    assert plan == {"mode": "confirm", "task": task, "plan": ["aesthetic-direction", "ui-prototype", "design-review"]}
    step = coordinator.confirm(task, plan["plan"])
    assert step["capability"] == "aesthetic-direction"
    assert step["required_outputs"] == ["aesthetic_direction", "direction_sample"]
    nxt = coordinator.record({"aesthetic_direction": "cool neutral", "direction_sample": "hero.html"},
                             step["map_id"], "aesthetic-direction")
    assert nxt["capability"] == "ui-prototype" and nxt["recorded_outputs"]["aesthetic_direction"] == "cool neutral"


def test_prototype_judged_to_need_a_direction_cannot_run_without_it(coordinator):
    task = "Prototipo hi-fi senza brand"
    answer = decision(coordinator, task, ["ui-prototype"])
    answer["selections"][0]["needs"][0]["applies"] = True
    with pytest.raises(ValueError, match="needs aesthetic-direction for this task .* not selected"):
        coordinator.propose(task, set(), classification=answer)
    unjudged = decision(coordinator, task, ["html-deck"])
    del unjudged["selections"][0]["needs"]
    with pytest.raises(ValueError, match="must judge exactly its declared conditional prerequisites"):
        coordinator.propose(task, set(), classification=unjudged)


def test_two_owners_of_the_look_are_rejected_in_one_plan(coordinator):
    task = "Landing e direzione estetica insieme"
    answer = decision(coordinator, task, ["visual-direction", "aesthetic-direction"])
    with pytest.raises(ValueError, match="Conflicting capabilities"):
        coordinator.propose(task, set(), classification=answer)
    assert not coordinator.state_dir.exists()


@pytest.mark.parametrize("capability, intent", [
    ("aesthetic-direction", "ui.aesthetic-direction"), ("wireframe", "ui.wireframe-exploration"),
    ("design-options", "ui.tweak-controls"), ("design-system-extract", "ui.component-inventory"),
    ("design-review", "ui.accessibility-audit"),
])
def test_each_short_design_capability_runs_alone_without_prerequisites(coordinator, capability, intent):
    answer = decision(coordinator, "fixture task", [capability])
    answer["selections"][0]["intent"] = intent
    result = coordinator.propose("fixture task", set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == capability
    assert result["package_root"] and "# " in result["instructions"]


def test_prototype_on_an_existing_system_is_one_resumable_step(coordinator):
    task = "Prototipo della schermata Impostazioni con i token di src/theme"
    answer = decision(coordinator, task, ["ui-prototype"])
    assert answer["selections"][0]["needs"][0]["applies"] is False
    plan = coordinator.propose(task, set(), classification=answer)
    assert plan["mode"] == "confirm" and plan["plan"] == ["ui-prototype"]     # resumable: a map even as the only step


def test_discovery_entries_examples_and_eval_cases_cover_the_design_capabilities():
    document = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))
    by_name = {entry["name"]: entry for entry in document["entries"]}
    assert by_name["marionette-product-design"]["capabilities"] == ["aesthetic-direction", "wireframe", "ui-prototype",
                                                                    "design-options", "html-deck"]
    assert by_name["marionette-design-review"]["capabilities"] == ["design-review", "design-system-extract"]
    for name in ("marionette-product-design", "marionette-design-review"):
        description = by_name[name]["description"]
        assert description.startswith("Use when") and "\n" not in description and len(description) <= 1024
    examples = json.loads((PACKAGE / "guide-examples.json").read_text(encoding="utf-8"))["examples"]
    shown = {s["capability"] for example in examples for s in example["selections"]}
    assert {"aesthetic-direction", "ui-prototype", "design-review", "wireframe", "design-system-extract"} <= shown
    cases = json.loads((PACKAGE / "eval-cases.json").read_text(encoding="utf-8"))["cases"]
    expected = {case["id"]: case["expect"]["capabilities"] for case in cases}
    assert expected["app-prototype-no-brand"] == ["aesthetic-direction", "ui-prototype"]
    assert expected["prototype-on-existing-system"] == ["ui-prototype"]
    assert expected["settings-page-in-product"] == ["work-map"]              # near-miss: production code
    assert set(DESIGN) <= {name for names in expected.values() for name in names}


@pytest.fixture(scope="module")
def release(tmp_path_factory):
    """One real build for the module: it verifies every pinned remote, so it is slow."""
    return build_release(PACKAGE / "sources.json", PACKAGE, tmp_path_factory.mktemp("release") / "out")


def test_release_packages_the_source_as_reference_and_registers_nothing(release):
    helper = release / "scripts" / SOURCE / "claude"
    # The prompt travels once, as a reference the design capabilities read by chapter; it is never session text.
    assert (helper / "system-prompt.md").is_file()
    assert {p.relative_to(release).parts[0] for p in release.rglob("system-prompt.md")} <= {"scripts", "adapters"}
    assert sorted(p.stem for p in (helper / "skills").glob("*.md")) == sorted(SKILLS)
    assert not (release / "scripts" / SOURCE / "codex").exists()
    # Every packaged reference a capability names exists in the release.
    named = set()
    for name in DESIGN:
        body = (release / "capabilities" / f"{name}.md").read_text(encoding="utf-8")
        body = body.replace("`<CD>/", f"`{HELPERS}/skills/" if name == "design-review" else f"`{HELPERS}/")
        named |= set(re.findall(re.escape(HELPERS) + r"/([A-Za-z0-9_./-]+\.md)", body))
    assert len(named) >= 12 and all((helper / path).is_file() for path in named), named
    packaged = json.loads((release / "delivery.json").read_text(encoding="utf-8"))
    carried = [d for d in packaged["decisions"] if d["source"] == SOURCE]
    assert carried and all(d["form"] in ("capability", "dropped") for d in carried)
    assert not any(wiring.get("capability") in DESIGN for wiring in packaged.get("hooks", []))
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        root = release / "adapters" / host
        skill = root / "skills" / "marionette"
        assert (skill / "scripts" / SOURCE / "claude" / "skills" / "polish-pass.md").is_file()
        assert (skill / "capabilities" / "design-review.md").is_file()
        # The absorbed prompt and skills are reference files, never registered as skills of their own,
        # and the source ships nothing a host would run by itself.
        files = [p for p in (skill / "scripts" / SOURCE).rglob("*") if p.is_file()]
        assert files and all(p.suffix == ".md" and p.name != "SKILL.md" for p in files)
        install = (root / "INSTALL.md").read_text(encoding="utf-8")
        assert "`polish-pass`" in install and "marionette-product-design" in install
    notice = (release / "NOTICE.md").read_text(encoding="utf-8")
    assert f"{SOURCE} — MIT" in notice and (release / "LICENSES" / f"{SOURCE}.txt").is_file()
