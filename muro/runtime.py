"""Host-neutral runtime coordinator. It loads one capability at a time.

The coordinator does not pretend to execute LLM instructions or verify code.
The host agent performs the work and records evidence-backed results.
"""
from __future__ import annotations

import json
from contextlib import contextmanager
import os
from pathlib import Path
from typing import Any

from .core import parse_capability, parse_router, validate_capabilities_and_router
from .routing import (catalog_entries, catalog_digest, resolve_selection,
                      validate_classification, validate_stack)


def detect_stack(project: Path, extra: set[str] | None = None) -> set[str]:
    """Detect declared frontend stack; absence of package.json is not a GSAP veto."""
    tokens = set(extra or ())
    validate_stack(tokens)
    manifest = project / "package.json"
    if manifest.is_file():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("package.json must contain an object")
        deps: dict[str, Any] = {}
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            if isinstance(data.get(section), dict):
                deps.update(data[section])
        if "gsap" in deps and "stack:css-only" not in tokens:
            tokens.add("stack:gsap")
        # An empty manifest does not express a CSS-only preference or prohibition.
    return tokens


class Coordinator:
    def __init__(self, package_root: Path, project_root: Path):
        self.package_root = package_root.resolve()
        self.project_root = project_root.resolve()
        self.rows = parse_router(self.package_root / "ROUTER.md")
        self.capabilities = {c.id: c for c in
                              (parse_capability(p) for p in sorted((self.package_root / "capabilities").glob("*.md")))}
        errors = validate_capabilities_and_router(list(self.capabilities.values()), self.rows)
        if errors:
            raise ValueError("Invalid AI catalog: " + "; ".join(errors))
        self.routing_prompt = (self.package_root / "prompts" / "classify.md").read_text(encoding="utf-8")
        if not self.routing_prompt.strip():
            raise ValueError("Missing AI classification prompt")
        self.catalog = catalog_entries(self.rows, self.capabilities)
        self.conflicts = {key: cap.conflicts for key, cap in self.capabilities.items()}
        self.digest = catalog_digest(self.catalog, self.capabilities, self.routing_prompt)
        manifest_path = self.package_root / "sources.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        slug = manifest.get("plugin", {}).get("slug", "muro")
        self.state_dir = self.project_root / f".{slug}"
        self._last_stack: set[str] | None = None
        self._last_classification: dict | None = None
        self._new_map = False

    @property
    def state_path(self) -> Path:
        return self.state_dir / "state.json"

    def _state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        if not isinstance(state, dict) or state.get("schema_version") != 2 or "classification" not in state:
            raise ValueError("Legacy state lacks AI classification; run plan --new and classify again; previous evidence is archived on confirmation")
        if not isinstance(state.get("map_id"), str) or not state["map_id"].strip():
            raise ValueError("Legacy state has no map identity; run plan --new and classify again; previous evidence is archived on confirmation")
        for key in ("task", "plan", "stack_tokens", "outputs", "results"):
            if key not in state:
                raise ValueError(f"Invalid state: missing {key}")
        if (not isinstance(state["task"], str) or not state["task"].strip()
                or not isinstance(state["stack_tokens"], list)
                or any(not isinstance(x, str) for x in state["stack_tokens"])
                or not isinstance(state["outputs"], dict) or not isinstance(state["results"], list)):
            raise ValueError("Invalid state types")
        stack = set(state["stack_tokens"])
        route = validate_classification(state["classification"], self._context(state["task"], stack), self.capabilities)
        if route["status"] != "selected":
            raise ValueError("Active state requires a selected AI classification")
        expected = resolve_selection(self.rows, [s["capability"] for s in route["selections"]], stack, set(), self.conflicts)
        if state["plan"] != expected:
            raise ValueError("State plan differs from saved AI classification")
        allowed = {key for name in expected for key in self.capabilities[name].outputs}
        if set(state["outputs"]) - allowed or any(not isinstance(v, str) or not v.strip() for v in state["outputs"].values()):
            raise ValueError("Invalid state outputs")
        for item in state["results"]:
            if (not isinstance(item, dict) or set(item) != {"name", "status", "evidence", "capability"}
                    or item["capability"] not in expected
                    or item["name"] not in self.capabilities[item["capability"]].checks):
                raise ValueError("Invalid state check results")
        return state

    def _write_state(self, state: dict[str, Any]) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        # Atomic replacement preserves the last map on interrupted writes.
        temp = self.state_path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(self.state_path)
        plan = "\n".join(f"- {cap}" for cap in state["plan"])
        outputs = "\n".join(f"- {key}: {value}" for key, value in state["outputs"].items())
        results = "\n".join(f"- {r['name']} ({r['capability']}): {r['status']} — {r['evidence']}" for r in state["results"])
        classification = json.dumps(state.get("classification"), ensure_ascii=False, indent=2)
        text = f"# Muro work map\n\nMap: {state['map_id']}\n\n## Task\n{state['task']}\n\n## AI classification\n```json\n{classification}\n```\n\n## Plan\n{plan}\n\n## Outputs\n{outputs}\n\n## Checks\n{results}\n"
        map_tmp = self.state_dir / "map.md.tmp"
        map_tmp.write_text(text, encoding="utf-8")
        map_tmp.replace(self.state_dir / "map.md")

    @contextmanager
    def _transaction(self):
        """Serialize the whole read/modify/write operation across host processes."""
        self.state_dir.mkdir(parents=True, exist_ok=True)
        lock = self.state_dir / ".write-lock"
        try:
            handle = lock.open("x", encoding="utf-8")
        except FileExistsError as exc:
            raise ValueError(f"State is busy: another writer holds {lock}; do not remove an active lock") from exc
        try:
            with handle:
                handle.write(f"pid={os.getpid()}\n")
            yield
        finally:
            lock.unlink()

    def _context(self, task: str, stack: set[str]) -> dict:
        if not isinstance(task, str) or not task.strip():
            raise ValueError("A nonempty task is required for AI classification")
        validate_stack(stack)
        return {"task": task, "stack_tokens": sorted(stack), "catalog_digest": self.digest}

    def _plan(self, task: str, stack: set[str], classification: dict) -> list[str]:
        outputs = set()
        if self.state_path.exists() and not self._new_map:
            state = self._state()
            if state["task"] == task:
                if state["classification"] != classification:
                    raise ValueError("Classification changed for an active task; use --new to archive and restart")
                outputs = set(state["outputs"])
        return resolve_selection(self.rows, [s["capability"] for s in classification["selections"]], stack, outputs, self.conflicts)

    def _archive_map(self) -> None:
        if not self.state_dir.exists():
            return
        import shutil
        import uuid
        archive = self.state_dir / "archive" / uuid.uuid4().hex
        # Preserve the previous task instead of silently replacing its evidence.
        shutil.copytree(self.state_dir, archive, ignore=shutil.ignore_patterns("archive", ".write-lock"))

    def _step(self, plan: list[str], state: dict[str, Any]) -> dict[str, Any]:
        if not plan:
            return self._checks_result(state)
        return self._instruction(plan[0], state["task"], "step", state["map_id"])

    def _instruction(self, capability_id: str, task: str, mode: str, map_id: str | None = None) -> dict[str, Any]:
        cap = self.capabilities[capability_id]
        # Bodies write helper paths as <package_root>/...: the installed package,
        # never the consumer project, is their base directory.
        result = {"mode": mode, "task": task, "capability": capability_id,
                  "package_root": str(self.package_root),
                  "instructions": cap.body, "required_outputs": cap.outputs, "checks": cap.checks,
                  "tools": cap.tools, "hooks": cap.hooks}
        if map_id is not None:
            # Evidence for this step must come back with exactly this binding.
            result["map_id"] = map_id
        return result

    def _checks_result(self, state: dict[str, Any]) -> dict[str, Any]:
        owners = {cap: list(self.capabilities[cap].checks) for cap in state["plan"]}
        return {"mode": "checks", "map_id": state["map_id"], "results": state["results"],
                "checks": list(dict.fromkeys(check for checks in owners.values() for check in checks)),
                "checks_by_capability": owners}

    @staticmethod
    def _binding(map_id: Any, capability: Any) -> None:
        if not isinstance(map_id, str) or not map_id.strip() or not isinstance(capability, str) or not capability.strip():
            raise ValueError("Evidence requires the map_id and capability returned with the step")

    @staticmethod
    def _bound(state: dict[str, Any], map_id: str) -> None:
        if state["map_id"] != map_id:
            raise ValueError(f"Stale map binding: evidence was produced for map {map_id}, "
                             f"but the active map is {state['map_id']}; nothing was recorded")

    def propose(self, task: str, stack: set[str] | None = None, new: bool = False,
                classification: dict | None = None) -> dict[str, Any]:
        self._new_map = new
        self._last_classification = None
        stack = detect_stack(self.project_root) if stack is None else set(stack)
        context = self._context(task, stack)
        if classification is None:
            return {"mode": "classification-required", "context": context,
                    "instructions": self.routing_prompt, "catalog": self.catalog}
        route = validate_classification(classification, context, self.capabilities)
        if route["status"] != "selected":
            return {"mode": route["status"], "task": task, "reason": route["reason"], "questions": route["questions"]}
        plan = self._plan(task, stack, route)
        self._last_stack = stack
        self._last_classification = route
        if len(plan) == 1 and not self.state_path.exists():
            return self._instruction(plan[0], task, "direct")
        return {"mode": "confirm", "task": task, "plan": plan}

    def confirm(self, task: str, plan: list[str], stack: set[str] | None = None,
                classification: dict | None = None) -> dict[str, Any]:
        stack = stack if stack is not None else (self._last_stack if self._last_stack is not None else detect_stack(self.project_root))
        route = validate_classification(classification if classification is not None else self._last_classification,
                                        self._context(task, stack), self.capabilities)
        if route["status"] != "selected":
            raise ValueError("Confirmation requires a selected AI classification")
        if plan != self._plan(task, stack, route):
            raise ValueError("Plan differs from current routing")
        with self._transaction():
            return self._confirm(task, plan, stack, route)

    def _confirm(self, task: str, plan: list[str], stack: set[str], route: dict) -> dict[str, Any]:
        # Recheck under the writer lock: another process may have advanced outputs.
        expected = self._plan(task, stack, route)
        if plan != expected:
            raise ValueError(f"Plan differs from current routing: expected {expected}")
        replace = self._new_map or (self.state_path.exists() and self._state()["task"] != task)
        if replace:
            self._archive_map()
        if replace or not self.state_path.exists():
            import uuid
            full_plan = resolve_selection(self.rows, [s["capability"] for s in route["selections"]], stack, set(), self.conflicts)
            # A fresh identity per map: late evidence for a replaced map cannot match it.
            self._write_state({"schema_version": 2, "map_id": uuid.uuid4().hex, "task": task, "plan": full_plan,
                              "classification": route, "stack_tokens": sorted(stack), "outputs": {}, "results": []})
        self._new_map = False
        return self._step(plan, self._state())

    def resume(self) -> dict[str, Any]:
        state = self._state()
        plan = self._plan(state["task"], set(state["stack_tokens"]), state["classification"])
        return self._step(plan, state)

    def record(self, outputs: dict[str, str], map_id: str, capability: str) -> dict[str, Any]:
        if not isinstance(outputs, dict):
            raise ValueError("Outputs must be a JSON object")
        self._binding(map_id, capability)
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            return self._record(outputs, map_id, capability)

    def _record(self, outputs: dict[str, str], map_id: str, capability: str) -> dict[str, Any]:
        state = self._state()
        self._bound(state, map_id)
        plan = self._plan(state["task"], set(state["stack_tokens"]), state["classification"])
        if not plan:
            raise ValueError("No step is waiting for outputs")
        if plan[0] != capability:
            raise ValueError(f"Outputs are bound to capability {capability}, but the active step is {plan[0]}; nothing was recorded")
        cap = self.capabilities[plan[0]]
        required = set(cap.outputs)
        if any(key in state["outputs"] for key in outputs):
            raise ValueError("Outputs already recorded; start a new map instead of overwriting evidence")
        missing = sorted(required - set(outputs))
        if missing:
            raise ValueError(f"Missing outputs for {cap.id}: {', '.join(missing)}")
        if set(outputs) != required:
            raise ValueError(f"Unexpected outputs for {cap.id}: {', '.join(sorted(set(outputs) - required))}")
        if any(not isinstance(value, str) or not value.strip() for value in outputs.values()):
            raise ValueError("Output values must be nonempty strings")
        state["outputs"].update(outputs)
        self._write_state(state)
        return self.resume()

    def record_check(self, result: dict[str, str], map_id: str, capability: str) -> dict[str, Any]:
        required = {"name", "status", "evidence"}
        if not isinstance(result, dict) or set(result) != required or not all(isinstance(result.get(k), str) and result[k].strip() for k in required):
            raise ValueError("Check requires name, status and evidence")
        if result["status"] not in {"pass", "fail", "not-tested"}:
            raise ValueError("status must be pass, fail or not-tested")
        self._binding(map_id, capability)
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            return self._record_check(result, map_id, capability)

    def _record_check(self, result: dict[str, str], map_id: str, capability: str) -> dict[str, Any]:
        state = self._state()
        self._bound(state, map_id)
        if capability not in state["plan"]:
            raise ValueError(f"Check is bound to capability {capability}, which is not a step of this map")
        if result["name"] not in self.capabilities[capability].checks:
            raise ValueError(f"Unknown check for capability {capability}: {result['name']}")
        state["results"].append({**result, "capability": capability})
        self._write_state(state)
        return self._checks_result(state)


def runtime_main(argv: list[str] | None = None) -> int:
    import argparse
    import sys
    parser = argparse.ArgumentParser(prog="muro-runtime")
    # Force UTF-8 on Windows consoles configured with a legacy code page.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser.add_argument("action", choices=("plan", "resume", "record", "check"))
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--task", default="")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--new", action="store_true", help="Start a fresh map, archiving any previous map")
    parser.add_argument("--stack", action="append", default=[])
    parser.add_argument("--outputs", type=Path)
    parser.add_argument("--result", type=Path)
    parser.add_argument("--map-id", help="map_id returned with the step; required by record and check")
    parser.add_argument("--capability", help="capability the evidence belongs to; required by record and check")
    parser.add_argument("--classification", type=Path, help="JSON classification authored by the host AI from the returned prompt/catalog")
    args = parser.parse_args(argv)
    try:
        coordinator = Coordinator(args.package, args.project)
        if args.action == "plan":
            stack = detect_stack(args.project, set(args.stack))
            classification = json.loads(args.classification.read_text(encoding="utf-8")) if args.classification else None
            result = coordinator.propose(args.task, stack, new=args.new, classification=classification)
            if args.confirm:
                if result["mode"] == "classification-required":
                    raise ValueError("AI classification is required before confirmation; run plan without --confirm first")
                if result["mode"] not in {"confirm", "direct"}:
                    raise ValueError("This task needs no map or confirmation")
                if result["mode"] == "confirm":
                    result = coordinator.confirm(args.task, result["plan"], stack)
        elif args.action == "resume":
            result = coordinator.resume()
        elif args.action == "record":
            if not args.outputs:
                raise ValueError("--outputs is required")
            result = coordinator.record(json.loads(args.outputs.read_text(encoding="utf-8")), args.map_id, args.capability)
        else:
            if not args.result:
                raise ValueError("--result is required")
            result = coordinator.record_check(json.loads(args.result.read_text(encoding="utf-8")), args.map_id, args.capability)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Muro: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(runtime_main())
