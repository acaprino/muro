"""Lessons from the 2026-11-11 audit and live host tests, as contracts (ADR-0015).

Second-run behaviour, conversation-level amendment, declared (not inferred) step
weight, declared replaced originals, and an outside-in routing eval. AI decisions
here are fixtures; the eval scorer never classifies.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, validate_plugin_identity
from muro.evals import prepare_eval, score_eval, validate_cases
from muro.factory import harmonize_prompt, prepare_intake
from muro.runtime import Coordinator
from routing_helpers import copy_prompts, proposed, response

ROOT = Path(__file__).resolve().parent.parent
MARIONETTE = ROOT / "examples" / "marionette"


@pytest.fixture
def pkg(tmp_path):
    root = tmp_path / "pkg"
    root.mkdir()
    shutil.copytree(MARIONETTE / "capabilities", root / "capabilities")
    for name in ("ROUTER.md", "sources.json"):
        shutil.copy2(MARIONETTE / name, root / name)
    copy_prompts(root)
    return root


# --- Second run -----------------------------------------------------------

def test_factory_preparation_can_be_rerun_but_never_deletes_foreign_files(repo, tmp_path):
    root, commit = repo
    src = {"id": "demo", "repo_path": str(root), "commit": commit, "pin": "head", "license": "MIT",
           "selected_paths": ["SKILL.md"], "excluded_paths": [], "intake": {"goal": "Understand it"}}
    copy_prompts(tmp_path)
    (tmp_path / "sources.json").write_text(json.dumps({"sources": [src]}), encoding="utf-8")
    first = prepare_intake(src, tmp_path, tmp_path / "wb" / "intake")
    assert prepare_intake(src, tmp_path, tmp_path / "wb" / "intake") == first
    assert harmonize_prompt(tmp_path, tmp_path / "wb" / "harm") == harmonize_prompt(tmp_path, tmp_path / "wb" / "harm")
    (first / "my-notes.md").write_text("mine", encoding="utf-8")
    with pytest.raises(ValueError, match="my-notes.md"):
        prepare_intake(src, tmp_path, tmp_path / "wb" / "intake")
    assert (first / "my-notes.md").read_text(encoding="utf-8") == "mine"


def test_build_out_stages_a_release_elsewhere_and_keeps_dist_protected(portable_project, tmp_path):
    script = ROOT / "muro_build.py"
    base = [sys.executable, str(script), "--manifest", str(portable_project / "sources.json"), "--build"]
    for attempt in ("one", "two"):
        run = subprocess.run([*base, "--out", str(tmp_path / attempt)], capture_output=True, text=True)
        assert run.returncode == 0, run.stderr
        assert (tmp_path / attempt / "muro" / "GUIDE.html").is_file()
    assert not (portable_project / "dist").exists()


def test_amend_keeps_valid_outputs_when_the_request_is_refined(pkg, tmp_path):
    c = Coordinator(pkg, tmp_path / "consumer")
    task = "Landing per il mio SaaS, poi il movimento"
    plan = proposed(c, task, ["visual-direction", "motion-principles"])["plan"]
    step = c.confirm(task, plan)
    c.record({k: f"v_{k}" for k in step["required_outputs"]}, step["map_id"], "visual-direction")

    refined = task + " e anche le regole di accessibilità"
    ids = ["visual-direction", "motion-principles", "design-guidance"]
    route = response(c.propose(refined, set()), ids)
    assert c.propose(refined, set(), classification=route, amend=True) == {"mode": "confirm", "task": refined, "plan": ids}
    nxt = c.confirm(refined, ids, amend=True)
    assert nxt["capability"] == "motion-principles"          # visual-direction is not redone
    assert nxt["recorded_outputs"]["palette"] == "v_palette"
    assert nxt["map_id"] != step["map_id"] and nxt["task"] == refined
    assert any((c.state_dir / "archive").iterdir())           # the earlier map is still archived


def test_amend_redoes_a_step_when_a_new_upstream_step_feeds_it_and_needs_an_active_map(pkg, tmp_path):
    c = Coordinator(pkg, tmp_path / "consumer")
    task = "Specifica il movimento e implementalo"
    plan = proposed(c, task, ["motion-principles", "gsap-scrolltrigger"], {"stack:gsap"})["plan"]
    with pytest.raises(ValueError, match="active map"):
        c.confirm(task, plan, {"stack:gsap"}, amend=True)
    step = c.confirm(task, plan, {"stack:gsap"})
    c.record({"motion-spec": "scrub", "reduced-motion": "fade"}, step["map_id"], "motion-principles")
    # A website direction is added before it: motion-principles reads its palette and layout,
    # so the recorded motion spec is stale and is not carried over.
    refined = "Prima rifai la direzione visiva del sito, poi il movimento e lo scroll"
    ids = ["visual-direction", "motion-principles", "gsap-scrolltrigger"]
    route = response(c.propose(refined, {"stack:gsap"}), ids)
    c.propose(refined, {"stack:gsap"}, classification=route, amend=True)
    first = c.confirm(refined, ids, {"stack:gsap"}, amend=True)
    assert first["capability"] == "visual-direction"
    assert json.loads(c.state_path.read_text(encoding="utf-8"))["outputs"] == {}


# --- Declared, not inferred -----------------------------------------------

def test_a_resumable_capability_gets_a_map_even_as_a_single_step(pkg, tmp_path):
    caps = {cap.id: cap for cap in parse_capabilities(MARIONETTE / "capabilities")}
    assert caps["visual-direction"].resumable is True and caps["office-files"].resumable is False
    c = Coordinator(pkg, tmp_path / "consumer")
    task = "Rifai il sito della mia pasticceria"
    result = proposed(c, task, ["visual-direction"])
    assert result == {"mode": "confirm", "task": task, "plan": ["visual-direction"], "approval": "not-needed"}
    step = c.confirm(task, result["plan"])
    assert step["mode"] == "step" and c.state_path.is_file()
    assert Coordinator(pkg, tmp_path / "consumer").resume()["capability"] == "visual-direction"
    quick = proposed(Coordinator(pkg, tmp_path / "other"), "Converti a.docx in PDF", ["office-files"])
    assert quick["mode"] == "direct"


def test_resumable_must_be_a_boolean(tmp_path):
    from muro import parse_capability
    text = (MARIONETTE / "capabilities" / "office-files.md").read_text(encoding="utf-8")
    path = tmp_path / "office-files.md"
    path.write_text(text.replace("hooks: []", "hooks: []\nresumable: \"yes\"", 1), encoding="utf-8")
    with pytest.raises(ValueError, match="resumable"):
        parse_capability(path)


def test_replaced_originals_are_declared_and_reach_every_install_note(portable_project, tmp_path):
    plugin = {"slug": "muro", "name": "Muro", "command": "muro", "version": "1"}
    assert validate_plugin_identity({**plugin, "replaces": ["figma-designer"]}) == []
    assert any("replaces" in e for e in validate_plugin_identity({**plugin, "replaces": "figma-designer"}))
    manifest_path = portable_project / "sources.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["plugin"]["replaces"] = ["figma-designer", "landing-page-design"]
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    release = build_release(manifest_path, portable_project, tmp_path / "out")
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        note = (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8")
        assert "figma-designer" in note and "landing-page-design" in note and "switch" in note.lower()
        skill = (release / "adapters" / host / "skills" / "muro" / "SKILL.md").read_text(encoding="utf-8")
        assert "already in the conversation" in skill and "approval: not-needed" in skill and "--amend" in skill
    marionette = json.loads((MARIONETTE / "sources.json").read_text(encoding="utf-8"))["plugin"]
    assert "figma-designer" in marionette["replaces"] and validate_plugin_identity(marionette) == []


# --- Outside-in evaluation --------------------------------------------------

def fixture_decisions(contexts, cases, caps, wrong=None):
    decisions = {}
    for case in cases:
        ids = case["expect"]["capabilities"]
        if case["id"] == wrong:
            ids = ["office-files"]
        selections = []
        for name in ids:
            sel = {"capability": name, "intent": caps[name].intents[0]["id"], "reason": "fixture"}
            if caps[name].needs:
                sel["needs"] = [{"requires": n["capability"], "applies": n["capability"] in ids, "reason": "fixture"}
                                for n in caps[name].needs]
            selections.append(sel)
        status = "selected" if ids else case["expect"]["status"]
        decisions[case["id"]] = {**contexts[case["id"]], "status": status, "selections": selections,
                                 "reason": "fixture", "questions": ["?"] if status == "needs_clarification" else []}
    return {"decisions": decisions}


def test_eval_prepares_cases_for_the_host_ai_and_scores_only_structure(tmp_path):
    caps = {cap.id: cap for cap in parse_capabilities(MARIONETTE / "capabilities")}
    cases = json.loads((MARIONETTE / "eval-cases.json").read_text(encoding="utf-8"))
    assert validate_cases(cases, list(caps.values())) == [] and len(cases["cases"]) >= 10
    assert any(c["expect"]["status"] == "no_match" for c in cases["cases"])
    out = prepare_eval(MARIONETTE, tmp_path / "eval")
    assert prepare_eval(MARIONETTE, tmp_path / "eval") == out            # rerunnable
    prompt = (out / "PROMPT.md").read_text(encoding="utf-8")
    assert "semantic decision" in prompt and cases["cases"][0]["task"] in prompt
    assert '"expect"' not in prompt                                       # expectations never reach the classifier
    contexts = json.loads((out / "contexts.json").read_text(encoding="utf-8"))

    good = tmp_path / "good.json"
    good.write_text(json.dumps(fixture_decisions(contexts, cases["cases"], caps)), encoding="utf-8")
    report = score_eval(MARIONETTE, good)
    assert report["passed"] == report["total"] == len(cases["cases"]) and report["failures"] == []

    victim = next(c["id"] for c in cases["cases"] if c["expect"]["capabilities"] not in ([], ["office-files"]))
    bad = tmp_path / "bad.json"
    doc = fixture_decisions(contexts, cases["cases"], caps, wrong=victim)
    del doc["decisions"][cases["cases"][-1]["id"]]
    bad.write_text(json.dumps(doc), encoding="utf-8")
    report = score_eval(MARIONETTE, bad)
    assert report["passed"] == report["total"] - 2
    assert {f["id"] for f in report["failures"]} == {victim, cases["cases"][-1]["id"]}


def test_eval_cases_are_checked_for_shape(tmp_path):
    caps = parse_capabilities(MARIONETTE / "capabilities")
    case = {"id": "a", "task": "t", "stack_tokens": [], "expect": {"status": "selected", "capabilities": ["ghost"]}}
    assert any("ghost" in e for e in validate_cases({"cases": [case]}, caps))
    case["expect"] = {"status": "no_match", "capabilities": ["office-files"]}
    assert any("no_match" in e for e in validate_cases({"cases": [case]}, caps))
    assert validate_cases({"cases": []}, caps)
