"""Validate host-AI decisions and order explicit selections; no semantic inference."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from .core import Capability, RouterRow


def validate_stack(tokens: set[str]) -> None:
    if any(not isinstance(token, str) or not re.fullmatch(r"stack:[a-z0-9]+(?:[.-][a-z0-9]+)*", token) for token in tokens):
        raise ValueError("Only stack:* constraint tokens are accepted; intents must come from AI classification")
    if {"stack:gsap", "stack:css-only"}.issubset(tokens):
        raise ValueError("Conflicting stack constraints: stack:gsap and stack:css-only")


def catalog_entries(rows: list[RouterRow], capabilities: dict[str, Capability]) -> list[dict[str, Any]]:
    return [{"id": row.id, "role": row.role, "when": row.when,
             "after": row.after_list(), "outputs": row.outputs_list(),
             "intents": copy.deepcopy(capabilities[row.id].intents),
             "tools": copy.deepcopy(capabilities[row.id].tools),
             "hooks": copy.deepcopy(capabilities[row.id].hooks),
             "conflicts": list(capabilities[row.id].conflicts),
             "reads": list(capabilities[row.id].reads),
             "needs": copy.deepcopy(capabilities[row.id].needs)} for row in rows]


def catalog_digest(catalog: list[dict], capabilities: dict[str, Capability], prompt: str) -> str:
    payload = {"catalog": catalog, "bodies": {key: cap.body for key, cap in sorted(capabilities.items())},
               "checks": {key: cap.checks for key, cap in sorted(capabilities.items())}, "prompt": prompt}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def validate_classification(value: Any, context: dict, capabilities: dict[str, Capability]) -> dict:
    fields = {"task", "stack_tokens", "catalog_digest", "status", "selections", "reason", "questions"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("AI classification requires exactly " + ", ".join(sorted(fields)))
    for key, expected in context.items():
        if value[key] != expected:
            raise ValueError(f"AI classification {key} differs from current context; request a new classification")
    if not isinstance(value["status"], str) or value["status"] not in {"selected", "no_match", "needs_clarification"}:
        raise ValueError("Invalid AI classification status")
    if not isinstance(value["reason"], str) or not value["reason"].strip():
        raise ValueError("AI classification requires a nonempty reason")
    questions = value["questions"]
    if not isinstance(questions, list) or any(not isinstance(q, str) or not q.strip() for q in questions):
        raise ValueError("AI classification questions must be a list of nonempty strings")
    if bool(questions) != (value["status"] == "needs_clarification"):
        raise ValueError("Only needs_clarification requires nonempty questions")
    selections = value["selections"]
    if not isinstance(selections, list) or bool(selections) != (value["status"] == "selected"):
        raise ValueError("Only selected classifications require nonempty selections")
    seen = set()
    order = [s.get("capability") for s in selections if isinstance(s, dict)]
    for selection in selections:
        if (not isinstance(selection, dict) or set(selection) - {"needs"} != {"capability", "intent", "reason"}
                or any(not isinstance(selection[k], str) or not selection[k].strip() for k in ("capability", "intent", "reason"))):
            raise ValueError("Each selection requires capability, intent and reason strings")
        identifier = selection["capability"]
        if identifier in capabilities:
            _validate_needs(selection, capabilities[identifier], order)
        if identifier not in capabilities:
            raise ValueError(f"Unknown capability in AI classification: {identifier}")
        if identifier in seen:
            raise ValueError(f"Duplicate capability in AI classification: {identifier}")
        seen.add(identifier)
        if selection["intent"] not in {i["id"] for i in capabilities[identifier].intents}:
            raise ValueError(f"Unknown intent for capability {identifier}: {selection['intent']}")
    return copy.deepcopy(value)


def _validate_needs(selection: dict, capability: Capability, order: list) -> None:
    """The AI judged every declared conditional prerequisite; Python only holds it to that judgment."""
    identifier = capability.id
    declared = [need["capability"] for need in capability.needs]
    judged = selection.get("needs", [])
    if not declared and "needs" in selection:
        raise ValueError(f"Capability {identifier} declares no conditional prerequisite; remove needs")
    if (not isinstance(judged, list) or any(
            not isinstance(item, dict) or set(item) != {"requires", "applies", "reason"}
            or not isinstance(item["requires"], str) or not isinstance(item["applies"], bool)
            or not isinstance(item["reason"], str) or not item["reason"].strip() for item in judged)):
        raise ValueError(f"Each needs judgment for {identifier} requires requires, boolean applies and a reason")
    if sorted(item["requires"] for item in judged) != sorted(declared):
        raise ValueError(f"Selection {identifier} must judge exactly its declared conditional prerequisites: {declared}")
    for item in judged:
        if not item["applies"]:
            continue
        required = item["requires"]
        if required not in order:
            raise ValueError(f"{identifier} needs {required} for this task (applies: true), but it is not selected")
        if order.index(required) > order.index(identifier):
            raise ValueError(f"{identifier} needs {required} first: select {required} before it")


def resolve_selection(rows: list[RouterRow], selected: list[str], stack: set[str], outputs: set[str],
                      conflicts: dict[str, list[str]] | None = None) -> list[str]:
    """Expand prerequisites only. Never choose a role, variant or additional intent."""
    validate_stack(stack)
    by_id = {row.id: row for row in rows}
    plan: list[str] = []
    done: set[str] = set()
    visiting: set[str] = set()
    roles: dict[str, str] = {}
    producers: dict[str, str] = {}
    conflicts = conflicts or {}

    def visit(identifier: str) -> None:
        if identifier in done:
            return
        if identifier in visiting:
            raise ValueError(f"Cycle in prerequisites at {identifier}")
        if identifier not in by_id:
            raise ValueError(f"Unknown selected or prerequisite capability: {identifier}")
        row = by_id[identifier]
        required = {token.strip() for token in row.when.split(",") if token.strip() != "—"}
        if not required.issubset(stack):
            raise ValueError(f"Incompatible constraints for {identifier}: missing {sorted(required - stack)}")
        if row.role in roles and roles[row.role] != identifier:
            raise ValueError(f"Conflicting variants for role {row.role}: {roles[row.role]}, {identifier}")
        roles[row.role] = identifier
        for other in roles.values():
            if other in conflicts.get(identifier, []) or identifier in conflicts.get(other, []):
                raise ValueError(f"Conflicting capabilities: {identifier}, {other}")
        declared = row.outputs_list()
        for output in declared:
            if output in producers and producers[output] != identifier:
                raise ValueError(f"Conflicting output producers for {output}: {producers[output]}, {identifier}")
            producers[output] = identifier
        if declared and set(declared).issubset(outputs):
            done.add(identifier)
            return
        visiting.add(identifier)
        for prerequisite in row.after_list():
            visit(prerequisite)
        visiting.remove(identifier)
        done.add(identifier)
        plan.append(identifier)

    # Explicit roots whose outputs are complete do not force their ancestors again.
    for identifier in selected:
        visit(identifier)
    return plan
