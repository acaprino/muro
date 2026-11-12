"""Validate host-AI decisions and order explicit selections; no semantic inference."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from .core import Capability, RouterRow


_DEFAULT_STACK_CONFLICTS = [{"stack:gsap", "stack:css-only"}]


def step_capability(step_ref: str) -> str:
    return step_ref.split("#", 1)[0]


def step_output_keys(step_ref: str, declared: list[str]) -> list[str]:
    return [f"{step_ref}.{key}" for key in declared] if "#" in step_ref else list(declared)


def selection_step_id(selection: dict[str, Any]) -> str:
    return selection.get("step_id") or selection["capability"]


def validate_stack(tokens: set[str], conflict_groups: list[list[str]] | None = None) -> None:
    bad = [token for token in tokens
           if not isinstance(token, str) or not re.fullmatch(r"stack:[a-z0-9]+(?:[.-][a-z0-9]+)*", token)]
    if bad:
        example = next((f"stack:{t}" for t in bad if isinstance(t, str) and re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", t)),
                       "stack:css-only")
        raise ValueError(f"--stack takes stack:* constraint tokens such as {example}; got "
                         + ", ".join(repr(t) for t in bad) + ". Intents come from the AI classification, not --stack.")
    groups = [set(g) for g in conflict_groups] if conflict_groups is not None else _DEFAULT_STACK_CONFLICTS
    for group in groups:
        if len(group) >= 2 and group.issubset(tokens):
            raise ValueError("Conflicting stack constraints: " + " and ".join(sorted(group)))


def catalog_entries(rows: list[RouterRow], capabilities: dict[str, Capability]) -> list[dict[str, Any]]:
    return [{"id": row.id, "role": row.role, "when": row.when,
             "after": row.after_list(), "outputs": row.outputs_list(),
             "intents": copy.deepcopy(capabilities[row.id].intents),
             "tools": copy.deepcopy(capabilities[row.id].tools),
             "hooks": copy.deepcopy(capabilities[row.id].hooks),
             "conflicts": list(capabilities[row.id].conflicts),
             "reads": list(capabilities[row.id].reads),
             "needs": copy.deepcopy(capabilities[row.id].needs),
             "resumable": capabilities[row.id].resumable} for row in rows]


def catalog_digest(catalog: list[dict], capabilities: dict[str, Capability], prompt: str,
                   delivery: dict | None = None) -> str:
    payload = {"catalog": catalog, "bodies": {key: cap.body for key, cap in sorted(capabilities.items())},
               "checks": {key: cap.checks for key, cap in sorted(capabilities.items())}, "prompt": prompt}
    # Absent delivery preserves existing catalog bindings; declared policy and hooks belong to the release contract.
    if delivery is not None:
        payload["delivery"] = delivery
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
    seen_steps: set[str] = set()
    bare_seen: set[str] = set()
    instanced_caps: set[str] = set()
    order_caps = [s.get("capability") for s in selections if isinstance(s, dict)]
    order_steps = [s.get("step_id") or s.get("capability") for s in selections if isinstance(s, dict)]
    for idx, selection in enumerate(selections):
        if (not isinstance(selection, dict) or set(selection) - {"needs", "step_id"} != {"capability", "intent", "reason"}
                or any(not isinstance(selection[k], str) or not selection[k].strip() for k in ("capability", "intent", "reason"))):
            raise ValueError("Each selection requires capability, intent and reason strings")
        identifier = selection["capability"]
        step_id = selection.get("step_id")
        if step_id is not None:
            if not isinstance(step_id, str) or not re.fullmatch(rf"{re.escape(identifier)}#[1-9][0-9]*", step_id):
                raise ValueError(f"Invalid step_id '{step_id}': must match {identifier}#<n>")
            if identifier in bare_seen:
                raise ValueError(f"Cannot mix bare capability and step_id for {identifier}")
            instanced_caps.add(identifier)
            step_key = step_id
        else:
            if identifier in instanced_caps:
                raise ValueError(f"Cannot mix bare capability and step_id for {identifier}")
            bare_seen.add(identifier)
            step_key = identifier
        if identifier in capabilities:
            _validate_needs(selection, capabilities[identifier], order_caps, order_steps, idx)
        if identifier not in capabilities:
            raise ValueError(f"Unknown capability in AI classification: {identifier}")
        if step_key in seen_steps:
            raise ValueError(f"Duplicate capability in AI classification: {step_key}; use distinct step_id for repeated steps")
        seen_steps.add(step_key)
        if selection["intent"] not in {i["id"] for i in capabilities[identifier].intents}:
            raise ValueError(f"Unknown intent for capability {identifier}: {selection['intent']}")
    return copy.deepcopy(value)


def _validate_needs(selection: dict, capability: Capability, order_caps: list, order_steps: list, self_idx: int) -> None:
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
    if sorted(step_capability(item["requires"]) for item in judged) != sorted(declared):
        raise ValueError(f"Selection {identifier} must judge exactly its declared conditional prerequisites: {declared}")
    for item in judged:
        if not item["applies"]:
            continue
        required = item["requires"]
        req_cap = step_capability(required)
        if required in order_steps:
            req_idx = order_steps.index(required)
        elif req_cap in order_caps:
            req_idx = order_caps.index(req_cap)
        else:
            raise ValueError(f"{identifier} needs {required} for this task (applies: true), but it is not selected")
        if req_idx > self_idx:
            raise ValueError(f"{identifier} needs {required} first: select {required} before it")


def resolve_selection(rows: list[RouterRow], selected: list[str], stack: set[str], outputs: set[str],
                      conflicts: dict[str, list[str]] | None = None,
                      conflict_groups: list[list[str]] | None = None) -> list[str]:
    """Expand prerequisites only. Never choose a role, variant or additional intent."""
    validate_stack(stack, conflict_groups=conflict_groups)
    by_id = {row.id: row for row in rows}
    plan: list[str] = []
    done: set[str] = set()
    visiting: set[str] = set()
    roles: dict[str, str] = {}
    producers: dict[str, str] = {}
    conflicts = conflicts or {}

    def visit(step_ref: str) -> None:
        if step_ref in done:
            return
        if step_ref in visiting:
            raise ValueError(f"Cycle in prerequisites at {step_ref}")
        cap_id = step_capability(step_ref)
        if cap_id not in by_id:
            raise ValueError(f"Unknown selected or prerequisite capability: {step_ref}")
        row = by_id[cap_id]
        required = {token.strip() for token in row.when.split(",") if token.strip() != "—"}
        if not required.issubset(stack):
            raise ValueError(f"Incompatible constraints for {cap_id}: missing {sorted(required - stack)}")
        if row.role in roles and roles[row.role] != cap_id:
            raise ValueError(f"Conflicting variants for role {row.role}: {roles[row.role]}, {cap_id}")
        roles[row.role] = cap_id
        for other in roles.values():
            if other != cap_id and (other in conflicts.get(cap_id, []) or cap_id in conflicts.get(other, [])):
                raise ValueError(f"Conflicting capabilities: {cap_id}, {other}")
        declared = step_output_keys(step_ref, row.outputs_list())
        for output in declared:
            if output in producers and producers[output] != step_ref:
                raise ValueError(f"Conflicting output producers for {output}: {producers[output]}, {step_ref}")
            producers[output] = step_ref
        if declared and set(declared).issubset(outputs):
            done.add(step_ref)
            return
        visiting.add(step_ref)
        for prerequisite in row.after_list():
            visit(prerequisite)
        visiting.remove(step_ref)
        done.add(step_ref)
        plan.append(step_ref)

    # Explicit roots whose outputs are complete do not force their ancestors again.
    for identifier in selected:
        visit(identifier)
    return plan
