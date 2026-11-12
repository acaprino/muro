"""Communication guidance is permanent policy, not a fabricated procedure.

The local metadata checks bind the reviewed v0.4.1 selection and delivery form.
Explicit AI-response fixtures verify routing mechanics only, including a style
request that selects no capability. No remote source or host session is opened.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import parse_capabilities
from muro.delivery import MAX_ALWAYS_ON, validate_delivery
from muro.runtime import Coordinator
from routing_helpers import decision


ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
SOURCE = "i-have-adhd"
COMMIT = "1ecea1993b7fce257ffbd686c070948b5e07eda6"
CANONICAL = "skills/i-have-adhd/SKILL.md"


def read_json(name):
    return json.loads((PACKAGE / name).read_text(encoding="utf-8"))


@pytest.fixture
def coordinator(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    shutil.copytree(PACKAGE / "capabilities", package / "capabilities")
    shutil.copytree(ROOT / "prompts", package / "prompts")
    for name in ("ROUTER.md", "sources.json", "delivery.json"):
        shutil.copy2(PACKAGE / name, package / name)
    return Coordinator(package, tmp_path / "consumer")


def test_manifest_pins_canonical_policy_and_excludes_original_activation_code():
    manifest = read_json("sources.json")
    src = next(source for source in manifest["sources"] if source["id"] == SOURCE)
    assert src["repo_url"].removesuffix(".git") == "https://github.com/ayghri/i-have-adhd"
    assert (src["pin"], src["release"], src["commit"]) == ("release", "v0.4.1", COMMIT)
    assert src["license"] == "MIT" and src["copyright"] == "Copyright (c) 2026 Ayoub Ghriss"
    assert set(src["selected_paths"]) == {CANONICAL, "README.md"}
    assert set(src["intake_only_paths"]) == set(src["selected_paths"])
    assert {"hooks/**", "extensions/**", ".opencode/**", ".claude-plugin/**", ".codex-plugin/**",
            "skills/i-have-adhd/agents/**"} <= set(src["excluded_paths"])
    assert src["runtime_deps"] == [] and src["intake"]["goal"].strip()
    assert SOURCE in manifest["plugin"]["replaces"]


def test_delivery_uses_policy_without_a_parallel_capability_or_source_hook():
    document = read_json("delivery.json")
    mine = [item for item in document["decisions"] if item["source"] == SOURCE]
    assert {item["form"] for item in mine} == {"always-on", "dropped"}
    assert all(item["targets"] == [] for item in mine)
    assert any(CANONICAL in item["content"] and item["form"] == "always-on" for item in mine)
    # Pure policy validates with no capabilities at all: it needs no placeholder
    # output producer, discovery entry or dependency to get into the native prompt.
    assert validate_delivery({"decisions": mine, "always_on": document["always_on"]}, [], {SOURCE}) == []
    assert SOURCE not in {cap.id for cap in parse_capabilities(PACKAGE / "capabilities")}
    entries = read_json("entries.json")["entries"]
    assert not any(SOURCE in entry["capabilities"] for entry in entries)
    assert not any(entry["name"] == "marionette-i-have-adhd" for entry in entries)


def test_combined_policy_has_a_bounded_cost_and_reasoned_source_contributions():
    manifest = read_json("sources.json")
    document = read_json("delivery.json")
    policy = document.get("always_on")
    assert isinstance(policy, str) and policy.strip() and len(policy) <= MAX_ALWAYS_ON == 2000
    contributions = {item["source"] for item in document["decisions"] if item["form"] == "always-on"}
    assert {SOURCE, "ponytail"} <= contributions
    assert validate_delivery(document, parse_capabilities(PACKAGE / "capabilities"),
                             {source["id"] for source in manifest["sources"]}) == []


def test_style_request_is_an_explicit_no_match_fixture_not_a_fake_execution_step(coordinator):
    task = "Rispondimi con chiarezza e meno ripetizioni; non creare file, rivedere codice o pianificare un progetto."
    request = coordinator.propose(task, set())
    assert request["mode"] == "classification-required" and "capability" not in request
    answer = decision(coordinator, task, [], status="no_match")
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "no_match" and "plan" not in result and "capability" not in result
    assert not coordinator.state_dir.exists()


def test_concise_chat_does_not_add_a_policy_step_to_a_full_artifact_fixture(coordinator):
    task = "Crea un workbook Excel completo con tutte le formule; mantieni breve solo la risposta in chat."
    answer = decision(coordinator, task, ["office-authoring"])
    result = coordinator.propose(task, set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == "office-authoring"
    assert result["required_outputs"] == coordinator.capabilities["office-authoring"].outputs
