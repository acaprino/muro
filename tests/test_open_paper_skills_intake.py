"""Integration contract for the open-paper-skills intake (research papers and session handoff).

Pinned at head f85fd3dc (the upstream publishes no release or tag). Runtime
decisions below are explicit host-AI response fixtures: they exercise Python's
validation and ordering, not the quality of AI classification.
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
COMMIT = "f85fd3dc80720dfa42fb5ab069f232f28c831109"
HELPERS = "<package_root>/scripts/open-paper-skills/skills"
RESEARCH = {
    "paper-search": ("literature-search", ["research.literature-search", "research.paper-reading"]),
    "paper-wiki": ("paper-knowledge-base", ["research.paper-notes", "research.wiki-upkeep"]),
    "paper-figure": ("academic-figure", ["research.paper-diagram", "research.paper-plot"]),
    "research-practice": ("research-guidance", ["research.planning", "research.experiment-debugging"]),
    "research-pitch": ("research-communication", ["research.value-communication"]),
    "session-handoff": ("session-handoff", ["engineering.session-handoff", "engineering.session-resume"]),
}


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree((PACKAGE if directory == "capabilities" else ROOT) / directory, package / directory)
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
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


def test_manifest_pins_head_and_selects_only_the_authors_standalone_skills():
    manifest, src = source()
    assert src["repo_url"] == "https://github.com/pengqianhan/open-paper-skills"
    assert src["commit"] == COMMIT and src["pin"] == "head" and "release" not in src
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 pengqianhan"
    selected = src["selected_paths"]
    for skill in ("paper-search", "paper-wiki-manager", "drawio-paper", "codex-paper-figure-skill",
                  "research-bible", "sell-research-honestly", "session-handoff"):
        assert f"skills/{skill}/SKILL.md" in selected
    assert "skills/paper-search/scripts/paper_search.py" in selected
    assert "skills/paper-wiki-manager/scripts/vendor/README.md" in selected
    # Other authors' work is never selected: collected skills, essays, vendored libraries.
    assert not any(p.startswith("collected-skills/") or p.startswith("skills/research-bible/references") for p in selected)
    assert not any(p.endswith(".js") and "/vendor/" in p for p in selected)
    excluded = src["excluded_paths"]
    for path in ("collected-skills/**", "skills/research-bible/references/**",
                 "skills/paper-wiki-manager/scripts/vendor/cytoscape.min.js", "skills/explain-paper-html/**",
                 "skills/map-then-territory/**", "skills/karpathy-coding-rules/**", "skills/project-dispatch/**"):
        assert path in excluded
    assert src["intake"]["goal"] and all(dep["bundled"] is False for dep in src["runtime_deps"])
    for name in ("paper-search", "paper-wiki-manager", "drawio-paper", "session-handoff"):
        assert name in manifest["plugin"]["replaces"]


def test_research_capabilities_match_the_router_and_stay_passive():
    caps = {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}
    rows = {row.id: row for row in parse_router(PACKAGE / "ROUTER.md")}
    for name, (role, intents) in RESEARCH.items():
        cap = caps[name]
        assert cap.role == role and rows[name].role == role
        assert [intent["id"] for intent in cap.intents] == intents
        assert all(intent["excludes"] for intent in cap.intents)
        assert cap.when == "—" and cap.after == [] and cap.needs == [] and cap.hooks == [] and cap.conflicts == []
        assert cap.resumable is False
        assert f"open-paper-skills (pengqianhan/open-paper-skills@{COMMIT[:8]}, head)" in cap.body
        assert "## Output handoff" in cap.body and "<state_dir>/map.md" in cap.body
        for check in cap.checks:
            assert f"**{check}**" in cap.body
    assert caps["paper-wiki"].reads == ["literature_findings"]
    assert caps["paper-search"].outputs == ["literature_findings"]
    for name in ("paper-search", "paper-wiki", "paper-figure", "research-pitch", "session-handoff"):
        assert HELPERS in caps[name].body
    # Third-party content is named, never packaged or presented as verified.
    assert "not packaged" in caps["research-practice"].body.lower()
    assert "does not redistribute" in caps["paper-wiki"].body
    assert "never replace it with another renderer" in caps["paper-figure"].body


def test_every_helper_path_named_by_a_capability_is_a_selected_path():
    import fnmatch
    import re
    _, src = source()
    caps = {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}
    aliases = {"<PW>": f"{HELPERS}/paper-wiki-manager", "<DP>": f"{HELPERS}/drawio-paper"}

    def selected(path):
        return any(path == pattern or (pattern.endswith("/**") and path.startswith(pattern[:-2]))
                   or fnmatch.fnmatchcase(path, pattern) for pattern in src["selected_paths"])

    runtime_installed = ("PaperBananaBench", "scripts/vendor/")   # fetched by the capability, not packaged
    found = 0
    for name in RESEARCH:
        body = caps[name].body
        for alias, full in aliases.items():
            body = body.replace(alias, full)
        for match in re.findall(re.escape(HELPERS) + r"/([A-Za-z0-9_./-]+\.(?:md|py|toml|html))", body):
            if any(marker in match for marker in runtime_installed) and not match.endswith("vendor/README.md"):
                continue
            found += 1
            upstream = match[: -len("SKILL.source.md")] + "SKILL.md" if match.endswith("SKILL.source.md") else match
            assert selected(f"skills/{upstream}"), (name, match)
    assert found >= 12


def test_search_then_wiki_is_an_ordered_two_step_plan_with_a_data_handoff(coordinator):
    task = "Cerca i lavori recenti sul metodo e aggiungi i tre migliori al paper wiki"
    plan = route(coordinator, task, [("paper-search", "research.literature-search"), ("paper-wiki", "research.paper-notes")])
    assert plan == {"mode": "confirm", "task": task, "plan": ["paper-search", "paper-wiki"]}
    step = coordinator.confirm(task, plan["plan"])
    assert step["capability"] == "paper-search" and step["required_outputs"] == ["literature_findings"]
    nxt = coordinator.record({"literature_findings": "3 papers kept"}, step["map_id"], "paper-search")
    assert nxt["capability"] == "paper-wiki" and nxt["recorded_outputs"] == {"literature_findings": "3 papers kept"}


@pytest.mark.parametrize("capability, intent", [
    ("paper-wiki", "research.paper-notes"), ("paper-figure", "research.paper-plot"),
    ("research-practice", "research.experiment-debugging"), ("research-pitch", "research.value-communication"),
    ("session-handoff", "engineering.session-resume"),
])
def test_each_research_capability_runs_alone_without_prerequisites(coordinator, capability, intent):
    result = route(coordinator, "fixture task", [(capability, intent)])
    assert result["mode"] == "direct" and result["capability"] == capability
    assert result["package_root"] and "# " in result["instructions"]


def test_discovery_entries_cover_the_new_capabilities_with_loadable_descriptions():
    manifest, _ = source()
    caps = parse_capabilities(PACKAGE / "capabilities")
    document = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))
    assert validate_entries(document, caps, manifest["plugin"]) == []
    by_name = {entry["name"]: entry["capabilities"] for entry in document["entries"]}
    assert by_name["marionette-papers"] == ["paper-search", "paper-wiki", "paper-figure"]
    assert by_name["marionette-research"] == ["research-practice", "research-pitch"]
    assert "session-handoff" in by_name["marionette-engineering"]
