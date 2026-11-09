"""Host-neutral runtime coordinator. It loads one capability at a time.

The coordinator does not pretend to execute LLM instructions or verify code.
The host agent performs the work and records evidence-backed results.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .core import parse_capability, parse_router, resolve_plan


_INTENT_KEYWORDS = {
    "intent:ui": ("ui", "page", "landing", "website", "hero", "design", "sito", "pagina"),
    "intent:animation": ("animat", "scroll", "motion", "hero"),
}


def detect_stack(project: Path, extra: set[str] | None = None) -> set[str]:
    """Detect declared frontend stack; absence of package.json is not a GSAP veto."""
    tokens = set(extra or ())
    if {"stack:gsap", "stack:css-only"}.issubset(tokens):
        raise ValueError("Conflicting stack constraints: stack:gsap and stack:css-only")
    manifest = project / "package.json"
    if manifest.is_file():
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("package.json must contain an object")
        deps: dict[str, Any] = {}
        for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            if isinstance(data.get(section), dict):
                deps.update(data[section])
        if "gsap" in deps:
            tokens.add("stack:gsap")
        if not deps and "stack:gsap" not in tokens:
            tokens.add("stack:css-only")
    return tokens


def infer_roles(task: str, rows: list, stack: set[str] | None = None) -> list[str]:
    text = task.casefold()
    stack = stack or set()
    roles = []
    by_id = {row.id: row for row in rows}
    for row in rows:
        if row.role == "coordinator":
            continue
        conditions = [p.strip() for p in row.when.split(",")]
        intents = [p for p in conditions if p.startswith("intent:")]
        if any(any(word in text for word in _INTENT_KEYWORDS.get(intent, (intent.split(":", 1)[1],))) for intent in intents):
            if row.role not in roles:
                roles.append(row.role)
    # Select a terminal stack variant only when its prerequisites are relevant.
    # A task that has no suitable implementation stack fails in resolve_plan.
    for row in rows:
        if row.role == "coordinator" or row.role in roles:
            continue
        tokens = [t.strip() for t in row.when.split(",") if t.strip() and t.strip() != "—"]
        if tokens and all(t.startswith("stack:") for t in tokens):
            prerequisite_roles = {by_id[d].role for d in row.after_list() if d in by_id}
            if prerequisite_roles and prerequisite_roles.issubset(set(roles)):
                roles.append(row.role)
    if not roles:
        # A single coordinator step handles ordinary engineering tasks without
        # inventing a domain-specific plan or requiring skill names.
        roles = ["coordinator"]
    return roles


def _intent_tokens(task: str) -> set[str]:
    text = task.casefold()
    return {intent for intent, words in _INTENT_KEYWORDS.items()
            if any(word in text for word in words)}


class Coordinator:
    def __init__(self, package_root: Path, project_root: Path):
        self.package_root = package_root.resolve()
        self.project_root = project_root.resolve()
        self.rows = parse_router(self.package_root / "ROUTER.md")
        self.capabilities = {c.id: c for c in
                             (parse_capability(p) for p in sorted((self.package_root / "capabilities").glob("*.md")))}
        manifest_path = self.package_root / "sources.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        slug = manifest.get("plugin", {}).get("slug", "muro")
        self.state_dir = self.project_root / f".{slug}"
        self._last_stack: set[str] | None = None
        self._new_map = False

    @property
    def state_path(self) -> Path:
        return self.state_dir / "state.json"

    def _state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        for key in ("task", "plan", "stack_tokens", "outputs", "results"):
            if key not in state:
                raise ValueError(f"Invalid state: missing {key}")
        return state

    def _write_state(self, state: dict[str, Any]) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        # Atomic replacement preserves the last map on interrupted writes.
        temp = self.state_path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(self.state_path)
        plan = "\n".join(f"- {cap}" for cap in state["plan"])
        outputs = "\n".join(f"- {key}: {value}" for key, value in state["outputs"].items())
        results = "\n".join(f"- {r['name']}: {r['status']} — {r['evidence']}" for r in state["results"])
        text = f"# Muro work map\n\n## Task\n{state['task']}\n\n## Plan\n{plan}\n\n## Outputs\n{outputs}\n\n## Checks\n{results}\n"
        map_tmp = self.state_dir / "map.md.tmp"
        map_tmp.write_text(text, encoding="utf-8")
        map_tmp.replace(self.state_dir / "map.md")

    def _plan(self, task: str, stack: set[str]) -> list[str]:
        outputs = set()
        if self.state_path.exists() and not self._new_map:
            state = self._state()
            if state["task"] == task:
                outputs = set(state["outputs"])
        return resolve_plan(self.rows, infer_roles(task, self.rows, stack), stack | _intent_tokens(task), outputs)

    def _archive_map(self) -> None:
        if not self.state_dir.exists():
            return
        import shutil
        import uuid
        archive = self.state_dir / "archive" / uuid.uuid4().hex
        # Preserve the previous task instead of silently replacing its evidence.
        shutil.copytree(self.state_dir, archive, ignore=shutil.ignore_patterns("archive"))

    def _step(self, plan: list[str], task: str) -> dict[str, Any]:
        if not plan:
            return {"mode": "checks", "results": self._state()["results"], "checks": self._checks()}
        if len(plan) == 1 and not self.state_path.exists():
            return self._instruction(plan[0], task, "direct")
        return self._instruction(plan[0], task, "step")

    def _instruction(self, capability_id: str, task: str, mode: str) -> dict[str, Any]:
        cap = self.capabilities[capability_id]
        return {"mode": mode, "task": task, "capability": capability_id,
                "instructions": cap.body, "required_outputs": cap.outputs, "checks": cap.checks}

    def _checks(self) -> list[str]:
        plan = self._state()["plan"]
        return list(dict.fromkeys(check for cap in plan for check in self.capabilities[cap].checks))

    def propose(self, task: str, stack: set[str] | None = None, new: bool = False) -> dict[str, Any]:
        self._new_map = new
        plan = self._plan(task, stack or set())
        if len(plan) == 1 and (new or not self.state_path.exists()):
            return self._instruction(plan[0], task, "direct")
        self._last_stack = set(stack or ())
        return {"mode": "confirm", "task": task, "plan": plan}

    def confirm(self, task: str, plan: list[str], stack: set[str] | None = None) -> dict[str, Any]:
        stack = stack if stack is not None else (self._last_stack or detect_stack(self.project_root))
        expected = self._plan(task, stack)
        if plan != expected:
            raise ValueError(f"Plan differs from current routing: expected {expected}")
        replace = self._new_map or (self.state_path.exists() and self._state()["task"] != task)
        if replace:
            self._archive_map()
        if replace or not self.state_path.exists():
            self._write_state({"task": task, "plan": plan, "stack_tokens": sorted(stack), "outputs": {}, "results": []})
        self._new_map = False
        return self._step(plan, task)

    def resume(self) -> dict[str, Any]:
        state = self._state()
        plan = self._plan(state["task"], set(state["stack_tokens"]))
        if not plan:
            return {"mode": "checks", "results": state["results"], "checks": self._checks()}
        return self._instruction(plan[0], state["task"], "step")

    def record(self, outputs: dict[str, str]) -> dict[str, Any]:
        state = self._state()
        plan = self._plan(state["task"], set(state["stack_tokens"]))
        if not plan:
            raise ValueError("No step is waiting for outputs")
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

    def record_check(self, result: dict[str, str]) -> dict[str, Any]:
        required = {"name", "status", "evidence"}
        if set(result) != required or not all(isinstance(result.get(k), str) and result[k].strip() for k in required):
            raise ValueError("Check requires name, status and evidence")
        if result["status"] not in {"pass", "fail", "not-tested"}:
            raise ValueError("status must be pass, fail or not-tested")
        state = self._state()
        if result["name"] not in self._checks():
            raise ValueError(f"Unknown check: {result['name']}")
        state["results"].append(result)
        self._write_state(state)
        return {"mode": "checks", "results": state["results"], "checks": self._checks()}


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
    args = parser.parse_args(argv)
    try:
        coordinator = Coordinator(args.package, args.project)
        stack = detect_stack(args.project, set(args.stack))
        if args.action == "plan":
            result = coordinator.propose(args.task, stack, new=args.new)
            if args.confirm:
                if result["mode"] != "confirm":
                    raise ValueError("This task needs no map or confirmation")
                result = coordinator.confirm(args.task, result["plan"], stack)
        elif args.action == "resume":
            result = coordinator.resume()
        elif args.action == "record":
            if not args.outputs:
                raise ValueError("--outputs is required")
            result = coordinator.record(json.loads(args.outputs.read_text(encoding="utf-8")))
        else:
            if not args.result:
                raise ValueError("--result is required")
            result = coordinator.record_check(json.loads(args.result.read_text(encoding="utf-8")))
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Muro: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(runtime_main())
