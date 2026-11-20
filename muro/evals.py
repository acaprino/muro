"""Routing eval: the host AI classifies authored cases; Python only validates and compares.

This is the outside-in check that fixtures cannot give: does a real model, reading the
real catalog and rules, route representative requests the way the package's authors
expect? Python never classifies a task here; it prepares the material and scores
explicit decisions with the runtime's own validation.
"""
from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any, NamedTuple

from .core import parse_router
from .delivery import load_delivery, session_text, unregistered_active_hooks, validate_delivery
from .factory import _fresh_workbench, prompts_dir
from .routing import (catalog_digest, catalog_entries, resolve_selection, selection_step_id, validate_classification,
                      validate_stack)
from .runtime import compact_catalog
from .sources import parse_capabilities

CASES_FILE = "eval-cases.json"
_STATUSES = {"selected", "no_match", "needs_clarification"}


def validate_cases(document: Any, capabilities: list) -> list[str]:
    known = {cap.id for cap in capabilities}
    if not isinstance(document, dict) or set(document) != {"cases"} or not isinstance(document["cases"], list) or not document["cases"]:
        return ["eval-cases.json must be an object with a nonempty cases array"]
    errors, seen = [], set()
    for case in document["cases"]:
        if not isinstance(case, dict) or not {"id", "task", "stack_tokens", "expect"} <= set(case) <= {"id", "task", "stack_tokens", "expect", "why"}:
            errors.append("each case requires id, task, stack_tokens, expect and optional why")
            continue
        identifier, expect = case["id"], case["expect"]
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier) or identifier in seen:
            errors.append(f"case id must be unique kebab-case: {identifier}")
        seen.add(identifier)
        if not isinstance(case["task"], str) or not case["task"].strip():
            errors.append(f"case {identifier}: task must be nonempty")
        if not isinstance(case["stack_tokens"], list) or any(not isinstance(t, str) for t in case["stack_tokens"]):
            errors.append(f"case {identifier}: stack_tokens must be a list of strings")
        if (not isinstance(expect, dict) or set(expect) != {"status", "capabilities"} or expect["status"] not in _STATUSES
                or not isinstance(expect["capabilities"], list)):
            errors.append(f"case {identifier}: expect requires status and capabilities")
            continue
        if bool(expect["capabilities"]) != (expect["status"] == "selected"):
            errors.append(f"case {identifier}: only selected expects capabilities, {expect['status']} expects none")
        for name in expect["capabilities"]:
            if name not in known:
                errors.append(f"case {identifier}: unknown capability {name}")
    return errors


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
    return material, document["cases"]


def request_context(task: str, stack_tokens, digest: str, conflicts) -> dict:
    """The context one request is classified in: the task, its stack tokens and the catalog's digest."""
    if not isinstance(task, str) or not task.strip():
        raise ValueError("A nonempty task is required for AI classification")
    tokens = list(stack_tokens)
    validate_stack(set(tokens), conflict_groups=conflicts)
    return {"task": task, "stack_tokens": sorted(tokens), "catalog_digest": digest}


def _contexts(cases: list[dict], digest: str, conflicts) -> dict[str, dict]:
    return {case["id"]: request_context(case["task"], case["stack_tokens"], digest, conflicts) for case in cases}


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
    """Write the classifier's material: rules, compact catalog and one context per case, without expectations."""
    material, cases = _package(project_root)
    contexts = _contexts(cases, material.digest, material.conflicts)
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
    """Validate each decision with the runtime's rules and compare status and ordered capabilities."""
    material, cases = _package(project_root)
    contexts = _contexts(cases, material.digest, material.conflicts)
    document = json.loads(decisions_path.read_text(encoding="utf-8"))
    decisions = document.get("decisions") if isinstance(document, dict) else None
    if not isinstance(decisions, dict):
        raise ValueError("decisions file must be an object with a decisions map")
    failures = []
    for case in cases:
        identifier, expect = case["id"], case["expect"]
        try:
            if identifier not in decisions:
                raise ValueError("no decision for this case")
            route = validate_classification(decisions[identifier], contexts[identifier], material.by_id)
            got = [selection["capability"] for selection in route["selections"]]
            if route["status"] == "selected":
                route_steps(material, route, set(case["stack_tokens"]))
            if route["status"] != expect["status"] or got != expect["capabilities"]:
                failures.append({"id": identifier, "expected": expect, "got": {"status": route["status"], "capabilities": got},
                                 "reason": route["reason"]})
        except ValueError as exc:
            failures.append({"id": identifier, "expected": expect, "error": str(exc)})
    return {"total": len(cases), "passed": len(cases) - len(failures), "catalog_digest": material.digest, "failures": failures}
