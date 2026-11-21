"""Routing eval: the host AI classifies authored cases; Python only validates and compares.

This is the outside-in check that fixtures cannot give: does a real model, reading the
real catalog and rules, route representative requests the way the package's authors
expect? Python never classifies a task here; it prepares the material and scores
explicit decisions with the runtime's own validation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
from typing import Any, NamedTuple

from .core import parse_router
from .delivery import load_delivery, session_text, unregistered_active_hooks, validate_delivery
from .factory import _fresh_workbench, prompts_dir
from .routing import (catalog_digest, catalog_entries, resolve_selection, selection_step_id, validate_classification,
                      step_capability, validate_stack)
from .runtime import compact_catalog
from .sources import parse_capabilities

CASES_FILE = "eval-cases.json"
_STATUSES = {"selected", "no_match", "needs_clarification"}


def validate_cases(document: Any, capabilities: list) -> list[str]:
    by_id = {cap.id: cap for cap in capabilities}
    if not isinstance(document, dict) or set(document) != {"cases"} or not isinstance(document["cases"], list) or not document["cases"]:
        return ["eval-cases.json must be an object with a nonempty cases array"]
    errors, seen = [], set()
    for case in document["cases"]:
        if not isinstance(case, dict) or not {"id", "task", "stack_tokens", "expect"} <= set(case) <= {"id", "task", "stack_tokens", "expect", "why", "alternatives"}:
            errors.append("each case requires id, task, stack_tokens, expect and optional why and alternatives")
            continue
        identifier, expect = case["id"], case["expect"]
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier) or identifier in seen:
            errors.append(f"case id must be unique kebab-case: {identifier}")
            continue
        seen.add(identifier)
        if not isinstance(case["task"], str) or not case["task"].strip():
            errors.append(f"case {identifier}: task must be nonempty")
        if not isinstance(case["stack_tokens"], list) or any(not isinstance(t, str) for t in case["stack_tokens"]):
            errors.append(f"case {identifier}: stack_tokens must be a list of strings")
        if (not isinstance(expect, dict) or not {"status", "capabilities"} <= set(expect) <= {"status", "capabilities", "selections"}
                or not isinstance(expect["status"], str) or expect["status"] not in _STATUSES
                or not isinstance(expect["capabilities"], list)):
            errors.append(f"case {identifier}: expect requires status and capabilities, with optional selections")
            continue
        if bool(expect["capabilities"]) != (expect["status"] == "selected"):
            errors.append(f"case {identifier}: only selected expects capabilities, {expect['status']} expects none")
        for name in expect["capabilities"]:
            if not isinstance(name, str) or name not in by_id:
                errors.append(f"case {identifier}: unknown capability {name}")
        if "selections" in expect:
            try:
                context = {"task": case["task"], "stack_tokens": case["stack_tokens"], "catalog_digest": "eval-validation"}
                _expected_route(case, context, by_id)
            except ValueError as exc:
                errors.append(f"case {identifier}: invalid expected selections: {exc}")
        if "alternatives" in case:
            if not isinstance(case["alternatives"], list) or not case["alternatives"]:
                errors.append(f"case {identifier}: alternatives must be a nonempty list of complete expectations")
            else:
                # Each alternative is one complete expectation, never a mixture
                # of fields from several routes or a nested alternatives tree.
                base = {key: value for key, value in case.items() if key != "alternatives"}
                for index, alternative in enumerate(case["alternatives"], 1):
                    errors.extend(f"alternative {index}: {error}" for error in
                                  validate_cases({"cases": [{**base, "expect": alternative}]}, capabilities))
    return errors


def _expectations(case: dict) -> list[dict]:
    return [case["expect"], *case.get("alternatives", [])]


def _expected_route(case: dict, context: dict, by_id: dict) -> dict:
    """Turn authored rich expectations into a route for the runtime's validators.

    Reasons are validation scaffolding, never classification or model input. Gold
    selections require the same intent, repeated-step and needs contract as a real
    decision; only explanatory prose is omitted from their shorter storage form.
    """
    expect = case["expect"]
    selections = expect["selections"]
    if not isinstance(selections, list):
        raise ValueError("selections must be a list")
    route_selections = []
    for selection in selections:
        if (not isinstance(selection, dict)
                or not {"capability", "intent"} <= set(selection) <= {"capability", "intent", "step_id", "needs"}):
            raise ValueError("each expected selection requires capability and intent, with optional step_id and needs")
        item = {**selection, "reason": "Authored evaluation expectation."}
        if "needs" in selection:
            needs = selection["needs"]
            if not isinstance(needs, list) or any(not isinstance(n, dict) or set(n) != {"requires", "applies"} for n in needs):
                raise ValueError("expected needs must list requires and applies judgments")
            item["needs"] = [{**n, "reason": "Authored evaluation prerequisite judgment."} for n in needs]
        route_selections.append(item)
    if [s["capability"] for s in selections] != expect["capabilities"]:
        raise ValueError("expected selections must match the ordered capabilities")
    return validate_classification({**context, "status": expect["status"], "selections": route_selections,
                                    "reason": "Authored evaluation expectation.",
                                    "questions": ["Authored clarification case."] if expect["status"] == "needs_clarification" else []},
                                   context, by_id)


def _selection_meaning(selections: list[dict]) -> list[dict]:
    """Compare ordered operations and needs, not prose or arbitrary step labels.

    Repeated occurrences retain their position. A true prerequisite reference is
    compared by the occurrence it names, allowing equivalent #n renumbering.
    Runtime validation has already checked the route and its judgments.
    """
    aliases, first, counts = {}, {}, {}
    for selection in selections:
        capability = selection["capability"]
        counts[capability] = counts.get(capability, 0) + 1
        occurrence = f"{capability}#{counts[capability]}"
        aliases[selection_step_id(selection)] = occurrence
        first.setdefault(capability, occurrence)
    result = []
    for selection in selections:
        item = {"capability": selection["capability"], "intent": selection["intent"]}
        if "needs" in selection:
            item["needs"] = sorted(
                ({"requires": aliases.get(n["requires"], first.get(n["requires"], n["requires"]))
                  if n["applies"] else step_capability(n["requires"]), "applies": n["applies"]}
                 for n in selection["needs"]), key=lambda n: n["requires"])
        result.append(item)
    return result


class ClassifierMaterial(NamedTuple):
    """What a classifier is given for any request of a package, and what validates its answer."""
    by_id: dict
    rows: list
    catalog: list
    prompt: str
    digest: str
    conflicts: Any
    delivery: dict | None


def classifier_material(project_root: Path) -> ClassifierMaterial:
    """The package's catalog, rules and permanent policy, and the digest that binds a decision to them.

    Eval cases are not part of it: a request needs no case (the simulator reads this too).
    """
    capabilities = parse_capabilities(project_root / "capabilities")
    by_id = {cap.id: cap for cap in capabilities}
    rows = parse_router(project_root / "ROUTER.md")
    catalog = catalog_entries(rows, by_id)
    prompt = (prompts_dir(project_root) / "classify.md").read_text(encoding="utf-8")
    manifest = json.loads((project_root / "sources.json").read_text(encoding="utf-8"))
    delivery = load_delivery(project_root)
    errors = (unregistered_active_hooks(capabilities) if delivery is None else
              validate_delivery(delivery, capabilities, {source.get("id") for source in manifest.get("sources", [])}))
    if errors:
        raise ValueError("Invalid delivery: " + "; ".join(errors))
    stack = manifest.get("stack") if isinstance(manifest.get("stack"), dict) else {}
    return ClassifierMaterial(by_id, rows, catalog, prompt, catalog_digest(catalog, by_id, prompt, delivery),
                              stack.get("conflicts"), delivery)


def _package(project_root: Path) -> tuple[ClassifierMaterial, list[dict]]:
    material = classifier_material(project_root)
    document = json.loads((project_root / CASES_FILE).read_text(encoding="utf-8"))
    errors = validate_cases(document, list(material.by_id.values()))
    if errors:
        raise ValueError("Invalid eval cases: " + "; ".join(errors))
    # Every authored route's graph must be valid before classifier material is
    # written. Rich gold also supplies intents/needs for full decision validation;
    # legacy gold remains capability-only without inventing those judgments.
    for case in document["cases"]:
        for index, expect in enumerate(_expectations(case)):
            try:
                context = request_context(case["task"], case["stack_tokens"], material.digest, material.conflicts)
                route = (_expected_route({**case, "expect": expect}, context, material.by_id) if "selections" in expect else
                         {"status": expect["status"], "selections": [{"capability": name} for name in expect["capabilities"]]})
                if route["status"] == "selected":
                    route_steps(material, route, set(case["stack_tokens"]))
            except ValueError as exc:
                label = f" alternative {index}" if index else ""
                raise ValueError(f"Invalid eval cases: case {case['id']}{label}: {exc}") from exc
    return material, document["cases"]


def request_context(task: str, stack_tokens, digest: str, conflicts) -> dict:
    """The context one request is classified in: the task, its stack tokens and the catalog's digest."""
    if not isinstance(task, str) or not task.strip():
        raise ValueError("A nonempty task is required for AI classification")
    tokens = list(stack_tokens)
    validate_stack(set(tokens), conflict_groups=conflicts)
    return {"task": task, "stack_tokens": sorted(tokens), "catalog_digest": digest}


def _contexts(cases: list[dict], digest: str, conflicts, *, blind: bool = False) -> dict[str, dict]:
    # Underscores keep aliases disjoint from authored kebab-case IDs; hashing
    # keeps them stable across reordering without exposing the author's hint.
    contexts = {
        ("case_" + hashlib.sha256(case["id"].encode("utf-8")).hexdigest()[:16] if blind else case["id"]):
        request_context(case["task"], case["stack_tokens"], digest, conflicts)
        for case in cases
    }
    if len(contexts) != len(cases):
        raise ValueError("eval case identifiers collide")
    return contexts


def classifier_sections(material: ClassifierMaterial, context_title: str, contexts: dict) -> str:
    """The text every classification reads, in this order: permanent session policy, the context(s), compact catalog, rules."""
    policy = session_text(material.delivery)
    return (
        ("## Permanent session policy\n\n" + policy + "\n\n" if policy else "")
        + f"## {context_title}\n\n```json\n" + json.dumps(contexts, ensure_ascii=False, indent=1) + "\n```\n\n"
        "## Catalog\n\n```json\n" + json.dumps(compact_catalog(material.catalog), ensure_ascii=False, separators=(",", ":")) + "\n```\n\n"
        "## Rules\n\n" + material.prompt
    )


def route_steps(material: ClassifierMaterial, route: dict, stack: set[str]) -> list[str]:
    """The ordered steps (prerequisites added) the runtime plans for a validated `selected` decision."""
    return resolve_selection(material.rows, [selection_step_id(s) for s in route["selections"]], stack, set(),
                             {key: cap.conflicts for key, cap in material.by_id.items()},
                             conflict_groups=material.conflicts)


def prepare_eval(project_root: Path, output_dir: Path) -> Path:
    """Write classifier material with opaque case IDs and no expectations or authored ID mapping."""
    material, cases = _package(project_root)
    contexts = _contexts(cases, material.digest, material.conflicts, blind=True)
    _fresh_workbench(output_dir, {"PROMPT.md", "contexts.json"})
    text = (
        "# Routing eval\n\nClassify each request below independently, exactly as you would at runtime, with the rules and\n"
        "catalog that follow. There is no project to inspect: decide from the request and its stack tokens.\n"
        "Write one JSON file `decisions.json` of the form `{\"decisions\": {\"<case id>\": <classification>}}`, where each\n"
        "classification copies that case's context (task, stack_tokens, catalog_digest) exactly.\n\n"
        + classifier_sections(material, "Cases (context per case id)", contexts)
    )
    (output_dir / "PROMPT.md").write_text(text, encoding="utf-8")
    (output_dir / "contexts.json").write_text(json.dumps(contexts, ensure_ascii=False, indent=1), encoding="utf-8")
    return output_dir


def score_eval(project_root: Path, decisions_path: Path) -> dict[str, Any]:
    """Match a whole authored route: status/capabilities and any declared intents/needs."""
    material, cases = _package(project_root)
    contexts = _contexts(cases, material.digest, material.conflicts)
    document = json.loads(decisions_path.read_text(encoding="utf-8"))
    decisions = document.get("decisions") if isinstance(document, dict) else None
    if not isinstance(decisions, dict):
        raise ValueError("decisions file must be an object with a decisions map")
    blind_contexts = _contexts(cases, material.digest, material.conflicts, blind=True)
    if decisions and set(decisions) <= set(blind_contexts):
        decision_ids = dict(zip(contexts, blind_contexts))
    elif set(decisions) <= set(contexts):
        decision_ids = {identifier: identifier for identifier in contexts}
    else:
        raise ValueError("decision IDs must use one known namespace: prepared opaque IDs or legacy authored IDs; mixed or unknown IDs are not allowed")
    failures = []
    for case in cases:
        identifier, expect = case["id"], case["expect"]
        try:
            decision_id = decision_ids[identifier]
            if decision_id not in decisions:
                raise ValueError("no decision for this case")
            route = validate_classification(decisions[decision_id], contexts[identifier], material.by_id)
            got = [selection["capability"] for selection in route["selections"]]
            if route["status"] == "selected":
                route_steps(material, route, set(case["stack_tokens"]))
            actual = {"status": route["status"], "capabilities": got}
            expectations = _expectations(case)
            if any("selections" in candidate for candidate in expectations):
                actual["selections"] = _selection_meaning(route["selections"])
            if not any(route["status"] == candidate["status"] and got == candidate["capabilities"]
                       and ("selections" not in candidate or actual["selections"] == _selection_meaning(candidate["selections"]))
                       for candidate in expectations):
                failures.append({"id": identifier, "expected": expect, "got": actual,
                                 "reason": route["reason"], **({"alternatives": case["alternatives"]} if "alternatives" in case else {})})
        except ValueError as exc:
            failures.append({"id": identifier, "expected": expect, "error": str(exc),
                             **({"alternatives": case["alternatives"]} if "alternatives" in case else {})})
    return {"total": len(cases), "passed": len(cases) - len(failures), "catalog_digest": material.digest, "failures": failures}
