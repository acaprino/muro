"""charles-skills: two of Charles Liu's design skills as two on-demand capabilities.

charles-color-analysis became color-critique and charles-polish became interface-polish. The
upstream has no release or tag: the pin follows its head, recorded below. These tests read local
package metadata only; the separately recorded source check and build verify the pinned remote.
Runtime selections are explicit host-AI response fixtures, never a classifier and never evidence
that a model understands a request or its negation.
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
SOURCE = "charles-skills"
COMMIT = "83de509dd10b77ebaf83c3f9986b538cdaf19b63"
COLOR, POLISH = "color-critique", "interface-polish"
COLOR_DIR = "skills/design/charles-color-analysis"
POLISH_DIR = "skills/design/charles-polish"
COLOR_FILES = [f"{COLOR_DIR}/SKILL.md", f"{COLOR_DIR}/references/principles.md", f"{COLOR_DIR}/scripts/color.py",
               f"{COLOR_DIR}/scripts/dom_colors.js", f"{COLOR_DIR}/scripts/ocr.swift"]
POLISH_FILES = [f"{POLISH_DIR}/SKILL.md"] + [f"{POLISH_DIR}/scripts/{name}" for name in (
    "web-frames.mjs", "frame-diff.mjs", "sheet.mjs", "edges.mjs", "lib.mjs", "sim.sh", "package.json",
    "package-lock.json")]
POLISH_INTENTS = ["ui.craft-polish", "ui.craft-review"]


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


def test_manifest_pins_the_head_and_selects_every_file_the_two_methods_use():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert src["repo_url"] == "https://github.com/LemonFace0309/charles-skills"
    # No release or tag upstream: the pin follows the head (ADR-0009).
    assert (src["pin"], src["commit"]) == ("head", COMMIT) and "release" not in src
    assert src["license"] == "MIT" and "Charles Liu" in src["copyright"]
    # The scripts each method runs travel with it, the file color.py itself starts included (ADR-0026).
    assert set(COLOR_FILES + POLISH_FILES + ["LICENSE"]) == set(src["selected_paths"])
    assert "intake_only_paths" not in src and "media_paths" not in src and "notice_paths" not in src
    # The owner took two skills: the rest of the repository is not a source of this package.
    for left_out in ("skills/design/charles-unslop/**", "skills/design/charles-unreasonable-craft/**",
                     "skills/drops/**", "skills/editing/**", f"{COLOR_DIR}/evals/**", f"{POLISH_DIR}/evals/**"):
        assert left_out in src["excluded_paths"], left_out
    assert len(src["runtime_deps"]) == 3 and not any(dep["bundled"] for dep in src["runtime_deps"])
    assert src["intake"]["goal"].strip()
    assert {"charles-color-analysis", "charles-polish"} <= set(manifest["plugin"]["replaces"])


@pytest.mark.parametrize("capability, role, intents, outputs", [
    (COLOR, "color-critique", ["ui.color-critique"], ["color_critique", "color_previews"]),
    (POLISH, "interface-polish", POLISH_INTENTS, ["polish_changes", "polish_report"]),
])
def test_each_procedure_matches_the_router_and_keeps_source_provenance(capability, role, intents, outputs):
    cap = catalog()[capability]
    row = next(row for row in parse_router(PACKAGE / "ROUTER.md") if row.id == capability)
    assert cap.role == row.role == role
    assert [intent["id"] for intent in cap.intents] == intents == row.intents_list()
    assert cap.outputs == outputs == row.outputs_list()
    assert cap.after == row.after_list() == [] and cap.when == "—"
    assert cap.needs == [] and cap.hooks == [] and cap.conflicts == []
    sources = cap.body.split("## Sources", 1)[1]
    assert SOURCE in sources and COMMIT in sources and "pin `head`" in sources and "MIT" in sources
    assert "Changes for coexistence (ADR-0017)" in sources
    assert all(intent in cap.body for intent in intents)
    for check in cap.checks:
        assert f"**{check}**" in cap.body
    body = before_sources(cap)
    # A packaged SKILL.md is stored as SKILL.source.md, and the factory keeps skills/design/ in the path.
    assert "/SKILL.source.md" in body and "/SKILL.md" not in body
    assert f"<package_root>/scripts/{SOURCE}/skills/design/" in body
    # The other skills of the repository are not in the package: no body sends the host to one.
    for sibling in ("charles-unslop", "charles-unreasonable-craft", "charles-ux-animation", "charles-hero-mockups"):
        assert sibling not in body, sibling


def test_the_colour_critique_carries_the_source_numbers_and_edits_nothing():
    cap = catalog()[COLOR]
    body = cap.body
    for phrase in ("GRAPHIC", "LANDING", "APP", "PALETTE", "60/30/10", "`--focus BOX`", "`--accent`", "`--scale`",
                   "1440×900 and 390×844", "window.COLOR_ROOT", "off by up to 15 Lc either way and up to 30 below 1× scale",
                   "Change one channel per fix", "turn H 10–25°", "5–10% toward one colour",
                   "Never fix by adding a colour, and never fix contrast by raising chroma",
                   "committing harder, never by toning it down", "take colour away before adding any",
                   "Preview the top two fixes", "2–3 directions", "**Verdict**", "**Keep**", "**Numbers**",
                   "WCAG 2 applies when a contract names it", "screenshot the page with your browser tool instead",
                   "Always pass `--out` with a scratch folder"):
        assert phrase in body, phrase
    assert set(cap.reads) == {"palette", "aesthetic_direction", "design_file", "design_tokens"}
    assert set(cap.check_conditions) == {"contrast_pairs_confirmed", "top_fixes_previewed"} and cap.intent_checks == {}
    tools = {tool["name"]: tool for tool in cap.tools}
    assert tools["shell"]["required"] and tools["image-inspection"]["required"] and not tools["browser"]["required"]
    # Read from color.py: where each command writes, and that nothing leaves the machine by the script itself.
    for fact in ("beside the source image without it", "sends nothing off the machine", "removes after the render"):
        assert fact in tools["shell"]["purpose"], fact
    # One owner per output: the palette and the design file belong to other capabilities.
    assert "project_files_unchanged" in cap.checks and "candidates" in body
    for output in ("palette", "aesthetic_direction", "design_file"):
        assert output not in cap.outputs


def test_the_polish_carries_the_source_numbers_and_yields_to_a_recorded_system():
    cap = catalog()[POLISH]
    body = cap.body
    for phrase in ("smallest size it will be seen", "a 42 px button may be 37 px on screen",
                   "10 is never awarded to your own work", "`tabular-nums`", "never change `font-weight` on hover",
                   "at most 5 type sizes", "≥4.5:1", "≥3:1", "under 12 px", "`scale(0.96)`, never below 0.95",
                   "about 150ms", "`(hover: hover)`", "a 2px ring at 3:1 or more",
                   "≥44×44pt on iOS, ≥48×48dp on Android and ≥40×40px on desktop", "16px inputs",
                   "100+ times a day", "under 300ms", "about 2.5s", "exits run 20–30% faster",
                   "enter at `scale(0.95)` and `opacity: 0`, never `scale(0)`", "`prefers-reduced-motion`",
                   "`npm install --prefix <PL>/scripts`", "--motion 1200 --trigger click:<selector> --widths 390,1440",
                   "`console.txt`, which must be empty", "Run one capture at a time", "twelve-item checklist",
                   "two passes in a row find nothing that changes the score",
                   "stop before step 8", "High means a state is broken", "`CHROME_PATH`"):
        assert phrase in body, phrase
    assert cap.resumable is True                                  # the climb repeats render, fix and verify passes
    # Each intent answers only its own checks (ADR-0018): a review does not climb, a polish has no findings table.
    assert set(cap.intent_checks) == set(POLISH_INTENTS)
    assert "climb_until_stable" in cap.intent_checks["ui.craft-polish"]
    assert "climb_until_stable" not in cap.intent_checks["ui.craft-review"]
    assert "findings_rated_with_evidence" not in cap.intent_checks["ui.craft-polish"]
    assert "recorded_system_respected" not in cap.intent_checks["ui.craft-review"]   # a review edits nothing
    assert set(cap.check_conditions) == {"motion_walked_through_trees", "recorded_system_respected"}
    assert {"motion-spec", "reduced-motion", "design_file"} <= set(cap.reads)
    tools = {tool["name"]: tool for tool in cap.tools}
    # The source: "The rules need nothing beyond the agent"; only the capture scripts need Node and Chrome.
    assert tools["file-access"]["required"] and not tools["shell"]["required"] and not tools["subagents"]["required"]
    assert "deleting and recreating a frame folder" in tools["shell"]["purpose"]
    sources = cap.body.split("## Sources", 1)[1]
    # The collisions that required a change are recorded with it (ADR-0017).
    for collision in ("charles-unslop", "motion-principles", "44×44px", "node_modules"):
        assert collision in sources, collision


def test_delivery_registers_nothing_and_accounts_for_every_part():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert [item["form"] for item in mine] == ["capability", "capability", "dropped"]
    assert [item["targets"] for item in mine] == [[COLOR], [POLISH], []]
    caps = catalog()
    # Checked against its own capabilities: the catalog also holds other sources' decisions.
    assert validate_delivery({"decisions": mine}, [caps[COLOR], caps[POLISH]], {SOURCE}) == []
    content = "\n".join(item["content"] for item in mine)
    for part in ("principles.md", "color.py", "dom_colors.js", "ocr.swift", "web-frames.mjs", "frame-diff.mjs",
                 "sheet.mjs", "edges.mjs", "lib.mjs", "sim.sh", "package-lock.json", "charles-unslop",
                 "frontmatter descriptions"):
        assert part in content, part
    assert not any(wiring["capability"] in (COLOR, POLISH) for wiring in document.get("hooks", []))
    assert not any(server["source"] == SOURCE for server in document.get("mcp_servers", []))
    # The source reads no key, and none of its rules is session text.
    assert not any(SOURCE in item.get("used_by", {}).get("sources", []) for item in document.get("credentials", []))
    assert "OKLCH" not in document["always_on"] and "frame by frame" not in document["always_on"]


def test_the_methods_are_discoverable_and_have_authored_examples_and_eval_cases():
    caps = catalog()
    entries = read_json("entries.json")
    assert validate_entries(entries, list(caps.values()), read_json("sources.json")["plugin"]) == []
    entry = next(item for item in entries["entries"] if item["name"] == "marionette-polish")
    assert entry["capabilities"] == [POLISH, COLOR]
    assert entry["absorbs"] == ["charles-polish", "charles-color-analysis"]
    assert entry["description"].startswith("Use when") and "Not for" in entry["description"]
    examples = read_json("guide-examples.json")["examples"]
    shown = {(s["capability"], s["intent"]) for example in examples for s in example["selections"]}
    assert {(POLISH, intent) for intent in POLISH_INTENTS} | {(COLOR, "ui.color-critique")} <= shown
    expected = {case["id"]: case["expect"] for case in read_json("eval-cases.json")["cases"]}
    assert expected["cs-polish-modal-feels-off"]["selections"] == [{"capability": POLISH, "intent": "ui.craft-polish"}]
    assert expected["cs-craft-review-report-only"]["selections"] == [{"capability": POLISH, "intent": "ui.craft-review"}]
    assert expected["cs-color-muddy-landing"]["capabilities"] == [COLOR]
    # The near misses keep their owners: a generated look, a contrast fix in the file, motion not designed yet.
    assert expected["cs-ai-look-stays-design-review"]["capabilities"] == ["design-review"]
    assert expected["cs-contrast-fix-stays-design-review"]["capabilities"] == ["design-review"]
    assert expected["cs-motion-spec-stays-motion"]["capabilities"] == ["motion-principles"]
    # The neighbours state the boundary from their side too.
    assert "interface polish" in json.dumps(caps["design-review"].intents)
    assert "interface polish" in json.dumps(caps["motion-principles"].intents)
    assert "colour critique" in json.dumps(caps["design-review"].intents)
    assert "colour critique" in json.dumps(caps["aesthetic-direction"].intents)


def test_an_explicit_ai_fixture_selects_the_colour_critique_as_one_direct_step(coordinator):
    task = "People say the orange and the green on poster.jpg clash. Are they right?"
    result = coordinator.propose(task, set(), classification=decision(coordinator, task, [COLOR]))
    assert result["mode"] == "direct" and result["capability"] == COLOR
    assert result["required_outputs"] == ["color_critique", "color_previews"]
    assert not coordinator.state_dir.exists()


def test_an_explicit_ai_fixture_selects_the_polish_with_a_resumable_map(coordinator):
    task = "The onboarding modal works but feels off: make it feel finished and check its motion frame by frame."
    plan = coordinator.propose(task, set(), classification=decision(coordinator, task, [POLISH]))
    assert plan["mode"] == "confirm" and plan["plan"] == [POLISH]      # resumable: a map even as the only step


@pytest.mark.parametrize("task, capability", [
    ("Run the last review before shipping landing.html and tell me if it is ready.", "design-review"),
    ("Decide how the new dashboard should move: durations, easing and reduced-motion alternatives.", "motion-principles"),
    ("Pick a palette and a look for our new app, which has no brand yet.", "aesthetic-direction"),
])
def test_explicit_negation_fixtures_preserve_existing_owners(coordinator, task, capability):
    answer = decision(coordinator, task, [capability])
    result = coordinator.propose(task, set(), classification=answer)
    assert result.get("capability") == capability or result["plan"] == [capability]
