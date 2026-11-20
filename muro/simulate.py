"""The simulator: which capabilities a request would activate, and in what order (ADR-0028 decision 10).

The decision is the AI's. Python prepares what a classifier reads for one request, with the very
functions that prepare an eval case (`muro/evals.py`), and validates the answer with the runtime's
own rules (`routing.validate_classification`, `routing.resolve_selection`). It never matches words,
never repairs an answer and never completes one: an invalid answer is reported as invalid with its
errors, and a step appears only for a validated decision.

Two ways to reach the AI, both ending in `check`:
- a coding agent calls `prepare`, classifies with its prompt and calls `check` (the MCP tools);
- `simulate_api` sends the prompt to an OpenAI-compatible endpoint through `agent._post_chat`.
The key comes from an environment variable only; it is never written, printed or put in a message.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .agent import _post_chat, read_api_key
from .evals import ClassifierMaterial, classifier_material, classifier_sections, request_context, route_steps
from .routing import selection_step_id, step_capability, validate_classification

_CONTEXT_KEYS = {"task", "stack_tokens", "catalog_digest"}

_INTRO = (
    "# Simulated request\n\nClassify the request below exactly as you would at runtime, with the rules and catalog that\n"
    "follow. There is no project to inspect and nothing to run: decide from the request and its stack tokens.\n"
    "Answer with one JSON object, the classification, and nothing else. It copies the context (task, stack_tokens,\n"
    "catalog_digest) exactly and adds status, selections, reason and questions, as the rules say.\n\n"
)


def _prepare(material: ClassifierMaterial, task: str, stack: Any) -> dict[str, Any]:
    if not isinstance(stack, (list, tuple, set)) or any(not isinstance(token, str) for token in stack):
        raise ValueError("stack must be a list of stack:* constraint tokens such as stack:css-only")
    context = request_context(task, set(stack), material.digest, material.conflicts)
    return {"context": context, "prompt": _INTRO + classifier_sections(material, "Request (context)", context)}


def prepare(package_dir: Path, task: str, stack: list[str]) -> dict[str, Any]:
    """What a classifier needs for one request: its context, and the prompt that carries the context, the permanent
    session policy, the compact catalog and the classification rules, as a case of the routing eval is given them."""
    return _prepare(classifier_material(Path(package_dir)), task, stack)


def _context_errors(context: Any, material: ClassifierMaterial) -> list[str]:
    """Hold a context to what `prepare` makes: three fields, a valid stack, and this package's catalog digest."""
    if (not isinstance(context, dict) or set(context) != _CONTEXT_KEYS or not isinstance(context["task"], str)
            or not isinstance(context["stack_tokens"], list)):
        return ["the context must be exactly what prepare returned: task, stack_tokens and catalog_digest"]
    try:
        expected = request_context(context["task"], context["stack_tokens"], material.digest, material.conflicts)
    except ValueError as exc:
        return [str(exc)]
    if context["catalog_digest"] != material.digest:
        return ["the context was prepared for another version of this catalog: prepare again"]
    if context != expected:
        return ["the context must be exactly what prepare returned"]
    return []


def _check(material: ClassifierMaterial, context: Any, answer: Any) -> dict[str, Any]:
    errors = _context_errors(context, material)
    if errors:
        return {"valid": False, "errors": errors}
    try:
        route = validate_classification(answer, context, material.by_id)
        plan = route_steps(material, route, set(context["stack_tokens"])) if route["status"] == "selected" else []
    except ValueError as exc:
        return {"valid": False, "errors": [str(exc)]}
    chosen = {selection_step_id(selection): selection for selection in route["selections"]}
    steps = [{"step_id": step, "capability": step_capability(step),
              "intent": chosen[step]["intent"] if step in chosen else None,
              "reason": chosen[step]["reason"] if step in chosen else None,
              "added_as_prerequisite": step not in chosen} for step in plan]
    return {"valid": True, "status": route["status"], "steps": steps, "reason": route["reason"],
            "questions": route["questions"]}


def check(package_dir: Path, context: dict, answer: Any) -> dict[str, Any]:
    """The answer, validated as the runtime validates a decision, as ordered steps; or the reasons it is invalid.

    A step the AI chose carries its intent and reason. A step the runtime added from an `after` prerequisite
    has neither (`None`) and `added_as_prerequisite` true: nobody decided those for this request.
    """
    return _check(classifier_material(Path(package_dir)), context, answer)


def first_json_object(text: str) -> dict[str, Any]:
    """The first JSON object in a model's text, however it is wrapped (a code fence, a sentence before or after)."""
    decoder = json.JSONDecoder()
    start = text.find("{")
    while start != -1:
        try:
            return decoder.raw_decode(text, start)[0]
        except json.JSONDecodeError:
            start = text.find("{", start + 1)
    raise ValueError("the answer holds no JSON object")


def _api_key(env_name: str | None) -> str:
    try:
        return read_api_key(env_name)
    except ValueError:
        # The name may be a key pasted by mistake: say a key is missing without repeating what was given.
        raise ValueError("No API key: set MURO_API_KEY or OPENAI_API_KEY" if env_name is None else
                         "No API key: the environment variable named by --api-key-env is not set "
                         "(the key is never a command-line argument)") from None


def simulate_api(package_dir: Path, task: str, stack: list[str], *, api_base: str, model: str,
                 api_key_env: str | None = None) -> dict[str, Any]:
    """One request through an OpenAI-compatible endpoint: prepare, one call, the first JSON object of the answer, check.

    An endpoint that cannot be reached, refuses or answers in no known shape is an error (ValueError); an
    answer that arrives but is no valid decision is a result with `valid` false, like any invalid answer.
    """
    material = classifier_material(Path(package_dir))
    prepared = _prepare(material, task, stack)
    key = _api_key(api_key_env)
    try:
        content = _post_chat(api_base, key, model, [{"role": "user", "content": prepared["prompt"]}])
    except ValueError as exc:
        # An endpoint may echo what it was sent in its error body; the key never leaves this function.
        raise ValueError(str(exc).replace(key, "***")) from None
    try:
        answer = first_json_object(content)
    except ValueError as exc:
        result = {"valid": False, "errors": [str(exc)]}
    else:
        result = _check(material, prepared["context"], answer)
    return {**result, "engine": "api", "model": model}
