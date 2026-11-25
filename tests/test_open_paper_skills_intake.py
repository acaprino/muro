"""Integration contract for the open-paper-skills intake (paper search and the HTML explanation).

Pinned at head f85fd3dc (the upstream publishes no release or tag). Owner decision
of 2026-11-18: from this source the package takes explain-anything-html and paper
search, and nothing else. The wiki, figure, research-guidance, pitch and handoff
capabilities absorbed on 2026-11-11 are removed, and explain-anything-html, which
that intake had left out unread as "served by explain-this", is a capability.
Runtime decisions below are explicit host-AI response fixtures: they exercise
Python's validation and ordering, not the quality of AI classification.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities, parse_router
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import copy_delivery, decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
COMMIT = "f85fd3dc80720dfa42fb5ab069f232f28c831109"
HELPERS = "<package_root>/scripts/open-paper-skills/skills"
KEPT = {
    "paper-search": ("literature-search", ["research.literature-search", "research.paper-reading"]),
    "html-explanation": ("explanation-authoring", ["explanation.html-page"]),
}
REMOVED = ("paper-wiki", "paper-figure", "research-practice", "research-pitch", "session-handoff")
DROPPED_SKILLS = ("paper-wiki-manager", "drawio-paper", "codex-paper-figure-skill", "research-bible",
                  "sell-research-honestly", "session-handoff")


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree((PACKAGE if directory == "capabilities" else ROOT) / directory, package / directory)
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    copy_delivery(package, PACKAGE)
    return Coordinator(package, tmp_path / "consumer")


def route(coordinator, task, pairs):
    """AI fixture selecting explicit capability/intent pairs."""
    answer = decision(coordinator, task, [name for name, _ in pairs], set())
    for selection, (_, intent) in zip(answer["selections"], pairs):
        selection["intent"] = intent
    return coordinator.propose(task, set(), classification=answer)


def source():
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    return manifest, next(s for s in manifest["sources"] if s["id"] == "open-paper-skills")


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def test_manifest_pins_head_and_selects_only_paper_search_and_the_html_explanation():
    manifest, src = source()
    assert src["repo_url"] == "https://github.com/pengqianhan/open-paper-skills"
    assert src["commit"] == COMMIT and src["pin"] == "head" and "release" not in src
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 pengqianhan"
    assert sorted(src["selected_paths"]) == ["skills/explain-anything-html/SKILL.md", "skills/paper-search/SKILL.md",
                                             "skills/paper-search/scripts/paper_search.py"]
    # Other authors' work is never selected, and the explanation skill is no longer shut out.
    assert "collected-skills/**" in src["excluded_paths"]
    assert not any("explain-anything-html" in path for path in src["excluded_paths"])
    assert src["intake"]["goal"] and "2026-11-18" in src["intake"]["goal"]
    assert [dep["name"] for dep in src["runtime_deps"]] == ["uv, or Python 3.11+ (standard library; optional truststore)"]
    assert all(dep["bundled"] is False for dep in src["runtime_deps"])
    replaces = manifest["plugin"]["replaces"]
    assert "paper-search" in replaces and "explain-anything-html" in replaces
    assert not set(DROPPED_SKILLS) & set(replaces)


def test_kept_capabilities_match_the_router_and_the_removed_ones_are_gone():
    caps = catalog()
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (role, intents) in KEPT.items():
        cap = caps[name]
        assert cap.role == role and rows[name].role == role
        assert [intent["id"] for intent in cap.intents] == intents
        assert all(intent["excludes"] for intent in cap.intents)
        assert cap.when == "—" and cap.after == [] and cap.needs == [] and cap.hooks == []
        assert cap.resumable is False
        assert f"open-paper-skills (pengqianhan/open-paper-skills@{COMMIT[:8]}, head)" in cap.body
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        assert HELPERS in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
    assert caps["paper-search"].outputs == ["literature_findings"] and caps["paper-search"].conflicts == []
    assert caps["html-explanation"].outputs == ["explanation_file"]
    assert caps["html-explanation"].reads == ["literature_findings"]
    for name in REMOVED:
        assert name not in caps and name not in rows
        # No capability that stays points the host at one that is gone.
        assert [cap.id for cap in caps.values() if name in cap.body] == [], name


def test_the_explanation_keeps_what_its_source_prescribes():
    cap = catalog()["html-explanation"]
    # The source starts on any request to explain or understand, "even if they don't explicitly ask for HTML".
    assert "even when HTML is not asked for" in cap.intents[0]["description"]
    for rule in ("Background", "Intuition", "Walkthrough", "Quiz", "five", "table of contents", "tabs",
                 "outside", "YYYY-MM-DD-", "Martin Kleppmann", "ASCII", "<pre>", "white-space: pre-wrap", "callouts",
                 f"{HELPERS}/explain-anything-html/SKILL.source.md"):
        assert rule in cap.body, rule
    # The adapted text's own origin travels with it.
    assert "geoffreylitt" in cap.body


def test_a_second_explanation_of_the_same_subject_does_not_stop_on_the_first_file():
    # Live run of 2026-11-18: the dated name already existed from an earlier explanation of the same
    # subject, the host's file tool refused to replace a file it had not read, and no page was saved.
    body, _, sources = catalog()["html-explanation"].body.partition("## Sources")
    assert "already exists" in body and "read it first" in body and "add a short suffix" in body
    assert "refuses to replace a file it has not read" in sources


def test_every_helper_path_named_by_a_capability_is_a_selected_path():
    import re
    _, src = source()
    caps = catalog()
    found = 0
    for name in KEPT:
        for match in re.findall(re.escape(HELPERS) + r"/([A-Za-z0-9_./-]+\.(?:md|py|toml|html))", caps[name].body):
            found += 1
            upstream = match[: -len("SKILL.source.md")] + "SKILL.md" if match.endswith("SKILL.source.md") else match
            assert f"skills/{upstream}" in src["selected_paths"], (name, match)
    assert found >= 3


def test_one_owner_per_explanation():
    caps = catalog()
    assert caps["html-explanation"].conflicts == ["interactive-explainer"]
    assert caps["interactive-explainer"].conflicts == ["html-explanation"]


def test_explanation_and_interactive_explainer_are_rejected_in_one_plan(coordinator):
    with pytest.raises(ValueError, match="Conflicting capabilities"):
        route(coordinator, "fixture task", [("html-explanation", "explanation.html-page"),
                                            ("interactive-explainer", "explainer.source-walkthrough")])


def test_the_explanation_runs_alone_as_one_direct_step(coordinator):
    result = route(coordinator, "Spiegami questo paper", [("html-explanation", "explanation.html-page")])
    assert result["mode"] == "direct" and result["capability"] == "html-explanation"
    assert result["required_outputs"] == ["explanation_file"]
    assert result["package_root"] and "# " in result["instructions"]


def test_search_then_explanation_is_an_ordered_two_step_plan_with_a_data_handoff(coordinator):
    task = "Trova il paper originale di Raft e spiegamelo"
    plan = route(coordinator, task, [("paper-search", "research.paper-reading"),
                                     ("html-explanation", "explanation.html-page")])
    assert plan == {"mode": "confirm", "task": task, "plan": ["paper-search", "html-explanation"]}
    step = coordinator.confirm(task, plan["plan"])
    assert step["capability"] == "paper-search" and step["required_outputs"] == ["literature_findings"]
    nxt = coordinator.record({"literature_findings": "full text saved"}, step["map_id"], "paper-search")
    assert nxt["capability"] == "html-explanation"
    assert nxt["recorded_outputs"] == {"literature_findings": "full text saved"}


def test_discovery_entries_start_the_explanation_without_the_word_html():
    manifest, _ = source()
    caps = parse_capabilities(PACKAGE / "capabilities")
    document = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))
    assert validate_entries(document, caps, manifest["plugin"]) == []
    by_name = {entry["name"]: entry for entry in document["entries"]}
    assert by_name["marionette-papers"]["capabilities"] == ["paper-search"]
    assert by_name["marionette-papers"]["absorbs"] == ["paper-search"]
    assert "marionette-research" not in by_name
    assert by_name["marionette-engineering"]["capabilities"] == ["work-map"]
    explainer = by_name["marionette-explainer"]
    assert explainer["capabilities"] == ["html-explanation", "interactive-explainer", "explainer-fact-check"]
    assert "explain-anything-html" in explainer["absorbs"]
    assert "even when HTML is not asked for" in explainer["description"]
    assert "Not for an explanation wanted in the chat" not in explainer["description"]


def test_delivery_accounts_for_what_stays_and_what_was_removed():
    document = json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))
    mine = [item for item in document["decisions"] if item["source"] == "open-paper-skills"]
    kept = sorted(target for item in mine if item["form"] == "capability" for target in item["targets"])
    assert kept == ["html-explanation", "paper-search"]
    assert {item["form"] for item in mine} == {"capability", "always-on", "dropped"}
    [policy] = [item for item in mine if item["form"] == "always-on"]
    assert "A source that is off is off on every route" in policy["content"]
    assert policy["targets"] == []
    dropped = " ".join(item["content"] for item in mine if item["form"] == "dropped")
    for skill in (*DROPPED_SKILLS, "explain-paper-html"):
        assert skill in dropped, skill
