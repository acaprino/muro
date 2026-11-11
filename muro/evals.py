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
from typing import Any

from .core import parse_router
from .factory import _fresh_workbench, prompts_dir
from .routing import catalog_digest, catalog_entries, resolve_selection, validate_classification, validate_stack
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


def _package(project_root: Path):
    capabilities = parse_capabilities(project_root / "capabilities")
    by_id = {cap.id: cap for cap in capabilities}
    rows = parse_router(project_root / "ROUTER.md")
    catalog = catalog_entries(rows, by_id)
    prompt = (prompts_dir(project_root) / "classify.md").read_text(encoding="utf-8")
    manifest = json.loads((project_root / "sources.json").read_text(encoding="utf-8"))
    stack = manifest.get("stack") if isinstance(manifest.get("stack"), dict) else {}
    document = json.loads((project_root / CASES_FILE).read_text(encoding="utf-8"))
    errors = validate_cases(document, capabilities)
    if errors:
        raise ValueError("Invalid eval cases: " + "; ".join(errors))
    return by_id, rows, catalog, prompt, catalog_digest(catalog, by_id, prompt), stack.get("conflicts"), document["cases"]


def _contexts(cases: list[dict], digest: str, conflicts) -> dict[str, dict]:
    contexts = {}
    for case in cases:
        validate_stack(set(case["stack_tokens"]), conflict_groups=conflicts)
        contexts[case["id"]] = {"task": case["task"], "stack_tokens": sorted(case["stack_tokens"]), "catalog_digest": digest}
    return contexts


def prepare_eval(project_root: Path, output_dir: Path) -> Path:
    """Write the classifier's material: rules, compact catalog and one context per case, without expectations."""
    _, _, catalog, prompt, digest, conflicts, cases = _package(project_root)
    contexts = _contexts(cases, digest, conflicts)
    _fresh_workbench(output_dir, {"PROMPT.md", "contexts.json"})
    text = (
        "# Routing eval\n\nClassify each request below independently, exactly as you would at runtime, with the rules and\n"
        "catalog that follow. There is no project to inspect: decide from the request and its stack tokens.\n"
        "Write one JSON file `decisions.json` of the form `{\"decisions\": {\"<case id>\": <classification>}}`, where each\n"
        "classification copies that case's context (task, stack_tokens, catalog_digest) exactly.\n\n"
        "## Cases (context per case id)\n\n```json\n" + json.dumps(contexts, ensure_ascii=False, indent=1) + "\n```\n\n"
        "## Catalog\n\n```json\n" + json.dumps(compact_catalog(catalog), ensure_ascii=False, separators=(",", ":")) + "\n```\n\n"
        "## Rules\n\n" + prompt
    )
    (output_dir / "PROMPT.md").write_text(text, encoding="utf-8")
    (output_dir / "contexts.json").write_text(json.dumps(contexts, ensure_ascii=False, indent=1), encoding="utf-8")
    return output_dir


def score_eval(project_root: Path, decisions_path: Path) -> dict[str, Any]:
    """Validate each decision with the runtime's rules and compare status and ordered capabilities."""
    by_id, rows, _, _, digest, conflicts, cases = _package(project_root)
    contexts = _contexts(cases, digest, conflicts)
    document = json.loads(decisions_path.read_text(encoding="utf-8"))
    decisions = document.get("decisions") if isinstance(document, dict) else None
    if not isinstance(decisions, dict):
        raise ValueError("decisions file must be an object with a decisions map")
    failures = []
    capability_conflicts = {key: cap.conflicts for key, cap in by_id.items()}
    for case in cases:
        identifier, expect = case["id"], case["expect"]
        try:
            if identifier not in decisions:
                raise ValueError("no decision for this case")
            route = validate_classification(decisions[identifier], contexts[identifier], by_id)
            got = [selection["capability"] for selection in route["selections"]]
            if route["status"] == "selected":
                resolve_selection(rows, [s.get("step_id") or s["capability"] for s in route["selections"]],
                                  set(case["stack_tokens"]), set(), capability_conflicts, conflict_groups=conflicts)
            if route["status"] != expect["status"] or got != expect["capabilities"]:
                failures.append({"id": identifier, "expected": expect, "got": {"status": route["status"], "capabilities": got},
                                 "reason": route["reason"]})
        except ValueError as exc:
            failures.append({"id": identifier, "expected": expect, "error": str(exc)})
    return {"total": len(cases), "passed": len(cases) - len(failures), "catalog_digest": digest, "failures": failures}
