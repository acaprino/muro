"""Integration contract for the supercmo-skills intake of the supads package.

Pinned at release v0.1.27 (3bf78a42). Owner, 2026-11-21: the package absorbs the 23 marketing
skills together with the MCP server they call ("Secondo me Muro dovrebbe inglobare anche server
mcp", ADR-0030). One capability per skill; the server is declared in delivery.json and started
from the packaged files. Runtime decisions below are explicit host-AI response fixtures: they
exercise Python's validation and ordering, not the quality of AI classification.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities
from muro.delivery import validate_delivery
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import copy_delivery, decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "supads"
COMMIT = "3bf78a423b1ba27a1f500b3b50f806b86cc5bdab"
SKILLS = {
    "media-setup": "supercmo-setup", "brand-onboarding": "onboarding-user", "brand-analysis": "analyzing-brand",
    "product-analysis": "analyzing-products", "competitor-list": "identifying-competitors",
    "competitor-ads-research": "researching-competitor-ads", "own-ads-audit": "analyzing-own-ads",
    "campaign-plan": "planning-campaigns", "ad-copy": "writing-ad-copy", "video-script": "writing-video-scripts",
    "video-prompt": "writing-video-prompts", "storyboard": "generating-storyboards",
    "image-generation": "generating-images", "image-ad": "generating-image-ads",
    "product-photos": "generating-product-photos", "ai-actor": "generating-ai-actors",
    "format-adaptation": "adapting-formats", "video-generation": "generating-videos",
    "ad-video": "generating-ad-videos", "ugc-video": "generating-ugc-videos",
    "cartoon-video": "generating-cartoon-videos", "video-ad-clone": "cloning-video-ads",
    "audio-generation": "generating-audio",
}
SERVER_TOOLS = {"setup_status", "image_generate", "list_image_models", "video_generate", "list_video_models",
                "audio_generate", "list_voices", "list_audio_models", "url_extraction", "image_analysis",
                "video_analysis", "social_research", "list_research_sources", "video_stitch", "job_status"}


def manifest():
    document = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    return document, next(s for s in document["sources"] if s["id"] == "supercmo-skills")


def catalog():
    return {cap.id: cap for cap in parse_capabilities(PACKAGE / "capabilities")}


def delivery():
    return json.loads((PACKAGE / "delivery.json").read_text(encoding="utf-8"))


def test_manifest_pins_the_release_and_selects_the_skills_with_their_server():
    document, src = manifest()
    assert src["repo_url"] == "https://github.com/SupercmoHQ/superCMO-skills"
    assert (src["pin"], src["release"], src["commit"], src["license"]) == ("release", "v0.1.27", COMMIT, "Apache-2.0")
    assert {"skills/**", "scripts/supercmo_skills/**", "scripts/supercmo_env.py", "scripts/doctor.py"} <= set(src["selected_paths"])
    # The fonts the caption tool renders with are declared, with the file that credits them.
    assert src["media_paths"] == ["scripts/supercmo_skills/_assets/fonts/*.ttf"] and src["notice_paths"] == ["NOTICE"]
    # The original's own registration and its eval cases are evidence, not shipped.
    assert {".mcp.json", "pyproject.toml", "README.md", "skills/*/evals/*"} == set(src["intake_only_paths"])
    assert document["plugin"]["slug"] == "supads"
    assert set(SKILLS.values()) | {"supercmo"} == set(document["plugin"]["replaces"])


def test_every_skill_is_one_capability_that_opens_its_packaged_original():
    caps = catalog()
    assert set(SKILLS) <= set(caps)
    for capability, skill in SKILLS.items():
        body = caps[capability].body
        # Some bodies name the skill's folder once and use a shorthand for it after.
        assert f"skills/{skill}" in body or f"/{skill}/" in body, capability
        assert "SKILL.source.md" in body and "<package_root>/scripts/supercmo-skills" in body, capability
        assert "3bf78a42" in body and "v0.1.27" in body, capability
        assert f"{skill} →" in body, capability                      # the recorded source-to-intent mapping
        for unpackaged in ("/evals/", "pyproject.toml", ".mcp.json"):
            assert unpackaged not in body.split("## Sources")[0], (capability, unpackaged)


def test_each_output_has_one_producer_and_every_read_names_an_output():
    caps = catalog()
    outputs = [key for cap in caps.values() for key in cap.outputs]
    assert len(outputs) == len(set(outputs))
    for cap in caps.values():
        assert set(getattr(cap, "reads", None) or []) <= set(outputs) - set(cap.outputs), cap.id
        assert not cap.after, cap.id                                  # no forced stage (ROUTER.md record)


def test_the_plan_and_the_setup_hand_over_instead_of_running_another_capabilitys_work():
    caps = catalog()
    plan, setup = caps["campaign-plan"].body, caps["media-setup"].body
    assert "Nothing is built inside this step" in plan and "two owners of one output" in plan
    assert "do not run it inside this step" in setup and "two owners of one output" in setup
    assert [tool["name"] for tool in caps["media-setup"].tools] == ["setup_status", "shell", "file-access"]


def test_the_server_is_declared_and_served_to_the_capabilities_that_call_it():
    document, caps = delivery(), catalog()
    sources = {s["id"] for s in manifest()[0]["sources"]}
    assert validate_delivery(document, list(caps.values()), sources) == []
    assert document["mcp_servers"] == [{
        "name": "supercmo", "source": "supercmo-skills", "run": ["python", "-m", "supercmo_skills.mcp"],
        "env": {"PYTHONPATH": "<package_root>/scripts/supercmo-skills/scripts"}}]
    [served] = [d for d in document["decisions"] if d["form"] == "mcp-server"]
    calling = {cap.id for cap in caps.values() if any(tool["name"] in SERVER_TOOLS for tool in cap.tools)}
    assert set(served["targets"]) == calling and len(calling) == 20
    assert "11,500 tokens" in served["reason"]                        # the stated cost of every session
    assert not document.get("always_on") and not document.get("hooks")


def test_discovery_entries_cover_the_catalog_and_name_what_they_absorb():
    document, _ = manifest()
    entries = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))
    assert validate_entries(entries, list(catalog().values()), document["plugin"]) == []
    absorbed = [name for entry in entries["entries"] for name in entry.get("absorbs", [])]
    assert sorted(absorbed) == sorted(document["plugin"]["replaces"])
    by_capability = {cap: entry["name"] for entry in entries["entries"] for cap in entry["capabilities"]}
    assert by_capability["ugc-video"] == "supads-videos" and by_capability["ad-copy"] == "supads-planning"


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    copy_delivery(package, source=PACKAGE)
    return Coordinator(package, tmp_path / "consumer")


def test_research_then_plan_runs_as_two_steps_in_the_selected_order(coordinator):
    task = "Study the competitors' ads, then propose the concepts to test."
    answer = decision(coordinator, task, ["competitor-ads-research", "campaign-plan"], set())
    answer["selections"][0]["intent"] = "ads.competitor-ads-research"
    answer["selections"][1]["intent"] = "ads.campaign-plan"
    proposed = coordinator.propose(task, set(), classification=answer)
    assert proposed["plan"] == ["competitor-ads-research", "campaign-plan"], proposed
