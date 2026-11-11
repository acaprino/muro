"""Host-neutral runtime coordinator. It loads one capability at a time.

The coordinator does not pretend to execute LLM instructions or verify code.
The host agent performs the work and records evidence-backed results.
"""
from __future__ import annotations

import copy
import json
from contextlib import contextmanager
import os
from pathlib import Path
import socket
import time
from typing import Any
import uuid

from .core import parse_capability, parse_router, validate_capabilities_and_router
from .routing import (
    catalog_entries,
    catalog_digest,
    resolve_selection,
    selection_step_id,
    step_capability,
    step_output_keys,
    validate_classification,
    validate_stack,
)

_LEGACY_DEFAULT_DETECTORS: list[dict[str, Any]] = [
    {
        "file": "package.json",
        "json_keys": ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"],
        "contains": "gsap",
        "emits": "stack:gsap",
        "unless": ["stack:css-only"],
    }
]


def detect_stack(
    project: Path,
    extra: set[str] | None = None,
    rules: list[dict[str, Any]] | None = None,
    conflict_groups: list[list[str]] | None = None,
) -> set[str]:
    """Detect declared project stack from manifest rules; legacy fallback applies only when rules is None."""
    tokens = set(extra or ())
    validate_stack(tokens, conflict_groups=conflict_groups)
    active_rules = _LEGACY_DEFAULT_DETECTORS if rules is None else rules
    for rule in active_rules:
        if any(excl in tokens for excl in rule.get("unless", [])):
            continue
        manifest = project / rule["file"]
        if not manifest.is_file():
            continue
        if "json_keys" in rule:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError(f"{rule['file']} must contain an object")
            deps: dict[str, Any] = {}
            for section in rule["json_keys"]:
                if isinstance(data.get(section), dict):
                    deps.update(data[section])
            if rule["contains"] in deps:
                tokens.add(rule["emits"])
        else:
            content = manifest.read_text(encoding="utf-8")
            if rule["contains"] in content:
                tokens.add(rule["emits"])
    return tokens


_EMPTY_CATALOG_VALUES = ([], {}, "—", None, False)


def compact_catalog(catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Same entries, without keys whose value is empty or the '—' no-constraint marker."""
    return [{key: value for key, value in entry.items()
             if not any(value == empty and type(value) is type(empty) for empty in _EMPTY_CATALOG_VALUES)}
            for entry in catalog]


class Coordinator:
    def __init__(self, package_root: Path, project_root: Path):
        self.package_root = package_root.resolve()
        self.project_root = project_root.resolve()
        self.rows = parse_router(self.package_root / "ROUTER.md")
        self.capabilities = {
            c.id: c
            for c in (parse_capability(p) for p in sorted((self.package_root / "capabilities").glob("*.md")))
        }
        manifest_path = self.package_root / "sources.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
        plugin_meta = manifest.get("plugin", {}) if isinstance(manifest.get("plugin"), dict) else {}
        slug = plugin_meta.get("slug", "muro")
        self.plugin_slug = slug
        self.plugin_name = plugin_meta.get("name", "Muro")
        stack_cfg = manifest.get("stack") if isinstance(manifest.get("stack"), dict) else None
        self.stack_rules: list[dict[str, Any]] | None = stack_cfg.get("detectors") if stack_cfg is not None else None
        self.stack_conflicts: list[list[str]] | None = stack_cfg.get("conflicts") if stack_cfg is not None else None
        errors = validate_capabilities_and_router(
            list(self.capabilities.values()),
            self.rows,
            plugin_slug=slug if plugin_meta else None,
        )
        if errors:
            raise ValueError("Invalid AI catalog: " + "; ".join(errors))
        self.routing_prompt = (self.package_root / "prompts" / "classify.md").read_text(encoding="utf-8")
        if not self.routing_prompt.strip():
            raise ValueError("Missing AI classification prompt")
        self.catalog = catalog_entries(self.rows, self.capabilities)
        self.conflicts = {key: cap.conflicts for key, cap in self.capabilities.items()}
        self.digest = catalog_digest(self.catalog, self.capabilities, self.routing_prompt)
        self.state_dir = self.project_root / f".{slug}"
        self._last_stack: set[str] | None = None
        self._last_classification: dict | None = None
        self._new_map = False

    @property
    def state_path(self) -> Path:
        return self.state_dir / "state.json"

    @property
    def context_outputs_path(self) -> Path:
        return self.state_dir / "context-outputs.json"

    @property
    def classification_path(self) -> Path:
        """Where the host writes its decision with its own file tool before a one-line plan call."""
        return self.state_dir / "classification.json"

    def ensure_gitignore(self) -> None:
        """Keep the coordinator's state out of the consumer project's commits."""
        self.state_dir.mkdir(parents=True, exist_ok=True)
        ignore = self.state_dir / ".gitignore"
        if not ignore.exists():
            ignore.write_text("*\n", encoding="utf-8")

    def _direct_outputs(self) -> dict[str, str]:
        if not self.context_outputs_path.is_file():
            return {}
        try:
            data = json.loads(self.context_outputs_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str) and v.strip()} if isinstance(data, dict) else {}

    def _raw_state_or_none(self) -> dict[str, Any] | None:
        if not self.state_path.is_file():
            return None
        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _has_active_map(self) -> bool:
        raw = self._raw_state_or_none()
        if raw is None:
            return False
        if raw.get("map_status") == "completed":
            return False
        return True

    def _state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        if not isinstance(state, dict) or state.get("schema_version") != 2 or "classification" not in state:
            raise ValueError("Legacy state lacks AI classification; run plan --new and classify again; previous evidence is archived on confirmation")
        if not isinstance(state.get("map_id"), str) or not state["map_id"].strip():
            raise ValueError("Legacy state has no map identity; run plan --new and classify again; previous evidence is archived on confirmation")
        if "map_status" in state and state["map_status"] not in {"active", "completed"}:
            raise ValueError("Invalid state map_status")
        for key in ("task", "plan", "stack_tokens", "outputs", "results"):
            if key not in state:
                raise ValueError(f"Invalid state: missing {key}")
        if (
            not isinstance(state["task"], str)
            or not state["task"].strip()
            or not isinstance(state["stack_tokens"], list)
            or any(not isinstance(x, str) for x in state["stack_tokens"])
            or not isinstance(state["outputs"], dict)
            or not isinstance(state["results"], list)
        ):
            raise ValueError("Invalid state types")
        stack = set(state["stack_tokens"])
        saved_cls = state["classification"]
        if isinstance(saved_cls, dict) and saved_cls.get("catalog_digest") != self.digest:
            raise ValueError(
                f"Saved state in {self.state_path} has an outdated catalog_digest; "
                "request a new classification and rerun plan with --new to archive it"
            )
        route = validate_classification(saved_cls, self._context(state["task"], stack), self.capabilities)
        if route["status"] != "selected":
            raise ValueError("Active state requires a selected AI classification")
        expected = resolve_selection(
            self.rows,
            [selection_step_id(s) for s in route["selections"]],
            stack,
            set(),
            self.conflicts,
            conflict_groups=self.stack_conflicts,
        )
        if state["plan"] != expected:
            raise ValueError("State plan differs from saved AI classification")
        allowed = {
            key
            for step_ref in expected
            for key in step_output_keys(step_ref, self.capabilities[step_capability(step_ref)].outputs)
        }
        if set(state["outputs"]) - allowed or any(not isinstance(v, str) or not v.strip() for v in state["outputs"].values()):
            raise ValueError("Invalid state outputs")
        for item in state["results"]:
            if (
                not isinstance(item, dict)
                or set(item) != {"name", "status", "evidence", "capability"}
                or item["capability"] not in expected
                or item["name"] not in self.capabilities[step_capability(item["capability"])].checks
            ):
                raise ValueError("Invalid state check results")
        return state

    def _write_state(self, state: dict[str, Any]) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        temp = self.state_path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temp.replace(self.state_path)
        plan = "\n".join(f"- {cap}" for cap in state["plan"])
        outputs = "\n".join(f"- {key}: {value}" for key, value in state["outputs"].items())
        results = "\n".join(f"- {r['name']} ({r['capability']}): {r['status']} — {r['evidence']}" for r in state["results"])
        classification = json.dumps(state.get("classification"), ensure_ascii=False, indent=2)
        status_line = f"Status: {state.get('map_status', 'active')}\n\n" if "map_status" in state else "\n"
        text = (
            f"# {self.plugin_name} work map\n\nMap: {state['map_id']}\n{status_line}"
            f"## Task\n{state['task']}\n\n## AI classification\n```json\n{classification}\n```\n\n"
            f"## Plan\n{plan}\n\n## Outputs\n{outputs}\n\n## Checks\n{results}\n"
        )
        map_tmp = self.state_dir / "map.md.tmp"
        map_tmp.write_text(text, encoding="utf-8")
        map_tmp.replace(self.state_dir / "map.md")

    @contextmanager
    def _transaction(self):
        """Serialize the whole read/modify/write operation across host processes."""
        self.ensure_gitignore()
        lock = self.state_dir / ".write-lock"
        token = uuid.uuid4().hex
        try:
            handle = lock.open("x", encoding="utf-8")
        except FileExistsError as exc:
            detail = ""
            try:
                info = json.loads(lock.read_text(encoding="utf-8"))
                if isinstance(info, dict) and "token" in info:
                    age = max(0.0, time.time() - float(info.get("created_at", 0.0)))
                    detail = f" (token={info['token']}, pid={info.get('pid')}, age={age:.1f}s; after verifying writer exited, run unlock --token {info['token']})"
            except (OSError, ValueError, TypeError):
                pass
            raise ValueError(f"State is busy: another writer holds {lock}{detail}; do not remove an active lock") from exc
        try:
            with handle:
                handle.write(
                    json.dumps(
                        {"pid": os.getpid(), "token": token, "host": socket.gethostname(), "created_at": time.time()}
                    )
                    + "\n"
                )
            yield
        finally:
            try:
                lock.unlink()
            except FileNotFoundError:
                pass

    def unlock(self, token: str) -> dict[str, Any]:
        """Explicit operator/host lock recovery bound to the exact lock token."""
        if not isinstance(token, str) or not token.strip():
            raise ValueError("unlock requires a nonempty --token")
        lock = self.state_dir / ".write-lock"
        if not lock.is_file():
            raise ValueError("No active write lock found")
        try:
            info = json.loads(lock.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError("State is busy: lock has no recovery token and cannot be unlocked by token") from exc
        if not isinstance(info, dict) or "token" not in info:
            raise ValueError("State is busy: lock has no recovery token and cannot be unlocked by token")
        if info["token"] != token:
            raise ValueError("Lock token mismatch; refusing to remove active lock")
        reclaimed = self.state_dir / f".write-lock.reclaim.{uuid.uuid4().hex}"
        lock.replace(reclaimed)
        reclaimed.unlink()
        return {"mode": "unlocked", "unlocked": True, "token": token}

    def _context(self, task: str, stack: set[str]) -> dict:
        if not isinstance(task, str) or not task.strip():
            raise ValueError("A nonempty task is required for AI classification")
        validate_stack(stack, conflict_groups=self.stack_conflicts)
        return {"task": task, "stack_tokens": sorted(stack), "catalog_digest": self.digest}

    def _plan(self, task: str, stack: set[str], classification: dict, outputs_override: set[str] | None = None) -> list[str]:
        outputs: set[str] = set() if outputs_override is None else set(outputs_override)
        if outputs_override is None and self.state_path.exists() and not self._new_map:
            raw = self._raw_state_or_none() or {}
            if (
                raw.get("schema_version") != 2
                or "classification" not in raw
                or not isinstance(raw.get("map_id"), str)
                or not raw["map_id"].strip()
            ):
                self._state()
            elif raw.get("map_status") != "completed" and raw.get("task") == task:
                state = self._state()
                if state["classification"] != classification:
                    raise ValueError("Classification changed for an active task; use --new to archive and restart")
                outputs = set(state["outputs"])
        return resolve_selection(
            self.rows,
            [selection_step_id(s) for s in classification["selections"]],
            stack,
            outputs,
            self.conflicts,
            conflict_groups=self.stack_conflicts,
        )

    def _archive_map(self) -> None:
        if not self.state_dir.exists():
            return
        import shutil
        archive = self.state_dir / "archive" / uuid.uuid4().hex
        shutil.copytree(self.state_dir, archive, ignore=shutil.ignore_patterns("archive", ".write-lock", "context-outputs.json"))

    def _step(self, plan: list[str], state: dict[str, Any]) -> dict[str, Any]:
        if not plan:
            return self._checks_result(state)
        merged_outputs = {**self._direct_outputs(), **state["outputs"]}
        return self._instruction(plan[0], state["task"], "step", state["map_id"], recorded_outputs=merged_outputs)

    def _instruction(
        self,
        step_ref: str,
        task: str,
        mode: str,
        map_id: str | None = None,
        recorded_outputs: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        cap_id = step_capability(step_ref)
        cap = self.capabilities[cap_id]
        result: dict[str, Any] = {
            "mode": mode,
            "task": task,
            "capability": cap_id,
            "step_id": step_ref,
            "package_root": str(self.package_root),
            "state_dir": str(self.state_dir),
            "map_path": str(self.state_dir / "map.md"),
            "recorded_outputs": dict(recorded_outputs or {}),
            "instructions": cap.body,
            "required_outputs": cap.outputs,
            "checks": cap.checks,
            "tools": cap.tools,
            "hooks": cap.hooks,
        }
        if map_id is not None:
            result["map_id"] = map_id
        return result

    def _effective_checks(self, state: dict[str, Any]) -> dict[str, dict[str, str]]:
        effective: dict[str, dict[str, str]] = {step_ref: {} for step_ref in state["plan"]}
        for item in state["results"]:
            owner = item["capability"]
            if owner in effective:
                effective[owner][item["name"]] = item["status"]
        return effective

    def _is_verified_local_file(self, value: str) -> bool:
        if not value or len(value) > 512 or "\n" in value or "\r" in value or value.startswith("not requested"):
            return False
        try:
            candidate = Path(value)
            resolved = candidate if candidate.is_absolute() else (self.project_root / candidate)
            return resolved.is_file() and resolved.stat().st_size > 0
        except (OSError, ValueError):
            return False

    def _output_attestation(self, state: dict[str, Any]) -> dict[str, str]:
        return {
            key: ("verified-file" if self._is_verified_local_file(val) else "self-attested")
            for key, val in state["outputs"].items()
        }

    def _checks_result(self, state: dict[str, Any]) -> dict[str, Any]:
        owners = {step_ref: list(self.capabilities[step_capability(step_ref)].checks) for step_ref in state["plan"]}
        return {
            "mode": "checks",
            "map_id": state["map_id"],
            "results": state["results"],
            "effective_checks": self._effective_checks(state),
            "output_attestation": self._output_attestation(state),
            "checks": list(dict.fromkeys(check for checks in owners.values() for check in checks)),
            "checks_by_capability": owners,
        }

    def _all_checks_passing_or_not_tested(self, state: dict[str, Any]) -> tuple[list[str], list[str]]:
        effective = self._effective_checks(state)
        missing: list[str] = []
        failing: list[str] = []
        for step_ref in state["plan"]:
            cap_id = step_capability(step_ref)
            for chk in self.capabilities[cap_id].checks:
                verdict = effective.get(step_ref, {}).get(chk)
                if verdict is None:
                    missing.append(f"{step_ref}.{chk}")
                elif verdict == "fail":
                    failing.append(f"{step_ref}.{chk}")
        return missing, failing

    @staticmethod
    def _binding(map_id: Any, capability: Any) -> None:
        if not isinstance(map_id, str) or not map_id.strip() or not isinstance(capability, str) or not capability.strip():
            raise ValueError("Evidence requires the map_id and capability returned with the step")

    @staticmethod
    def _bound(state: dict[str, Any], map_id: str) -> None:
        if state["map_id"] != map_id:
            raise ValueError(
                f"Stale map binding: evidence was produced for map {map_id}, "
                f"but the active map is {state['map_id']}; nothing was recorded"
            )

    def propose(
        self,
        task: str,
        stack: set[str] | None = None,
        new: bool = False,
        classification: dict | None = None,
        compact: bool = False,
        amend: bool = False,
    ) -> dict[str, Any]:
        # amend: the same conversation refined its request; plan against the new decision, keep valid work.
        self._new_map = new or amend
        self._last_classification = None
        stack = (
            detect_stack(self.project_root, rules=self.stack_rules, conflict_groups=self.stack_conflicts)
            if stack is None
            else set(stack)
        )
        context = self._context(task, stack)
        if classification is None:
            if compact:
                # The rules are embedded in SKILL.md, loaded once per session; only data travels here.
                return {
                    "mode": "classification-required",
                    "context": context,
                    "instructions": ("Classify with the rules under 'Classification rules' in this skill's SKILL.md "
                                     "(prompts/classify.md). Write the decision JSON with your file tool to "
                                     "classification_path, then rerun plan on one line with --classification <that file>."),
                    "classification_path": str(self.classification_path),
                    "catalog": compact_catalog(self.catalog),
                }
            return {
                "mode": "classification-required",
                "context": context,
                "instructions": self.routing_prompt,
                "catalog": self.catalog,
            }
        route = validate_classification(classification, context, self.capabilities)
        if route["status"] != "selected":
            return {"mode": route["status"], "task": task, "reason": route["reason"], "questions": route["questions"]}
        plan = self._plan(task, stack, route)
        self._last_stack = stack
        self._last_classification = route
        if len(plan) == 1 and not new and not amend and not self._has_active_map():
            if self.capabilities[step_capability(plan[0])].resumable:
                # Declared by the catalog, not inferred: this step is long enough to need a resumable map.
                return {"mode": "confirm", "task": task, "plan": plan, "approval": "not-needed"}
            return self._instruction(plan[0], task, "direct", recorded_outputs=self._direct_outputs())
        return {"mode": "confirm", "task": task, "plan": plan}

    def confirm(
        self,
        task: str,
        plan: list[str],
        stack: set[str] | None = None,
        classification: dict | None = None,
        preserve_completed: list[str] | None = None,
        amend: bool = False,
    ) -> dict[str, Any]:
        if amend:
            self._new_map = True
        stack = (
            stack
            if stack is not None
            else (
                self._last_stack
                if self._last_stack is not None
                else detect_stack(self.project_root, rules=self.stack_rules, conflict_groups=self.stack_conflicts)
            )
        )
        route = validate_classification(
            classification if classification is not None else self._last_classification,
            self._context(task, stack),
            self.capabilities,
        )
        if route["status"] != "selected":
            raise ValueError("Confirmation requires a selected AI classification")
        if plan != self._plan(task, stack, route):
            raise ValueError("Plan differs from current routing")
        with self._transaction():
            return self._confirm(task, plan, stack, route, preserve_completed=preserve_completed, amend=amend)

    def _amendable_steps(self, raw_prev: dict[str, Any] | None, full_plan: list[str], route: dict[str, Any]) -> list[str]:
        """Steps of the active map whose recorded work is still valid under the amended plan."""
        if (not raw_prev or raw_prev.get("map_status") == "completed" or not isinstance(raw_prev.get("outputs"), dict)
                or not isinstance(raw_prev.get("plan"), list)):
            raise ValueError("--amend needs an active map; plan without --amend to start one")
        outputs, previous = raw_prev["outputs"], set(raw_prev["plan"])
        caps = {step: self.capabilities[step_capability(step)] for step in full_plan}
        keep = [step for step in full_plan if step in previous and all(
            isinstance(outputs.get(key), str) and outputs[key].strip() for key in step_output_keys(step, caps[step].outputs))]
        producers = {key: step for step in full_plan for key in caps[step].outputs}
        judged = {selection_step_id(s): s.get("needs", []) for s in route["selections"]}
        changed = True
        while changed:  # a kept step is stale when anything it depends on or reads is redone
            changed = False
            for step in list(keep):
                cap = caps[step]
                stale = (any(a in full_plan and a not in keep for a in cap.after)
                         or any(n.get("applies") and n["requires"] not in keep and step_capability(n["requires"]) not in keep
                                for n in judged.get(step, []))
                         or any(producers.get(key) not in (None, step) and producers[key] not in keep for key in cap.reads))
                if stale:
                    keep.remove(step)
                    changed = True
        return keep

    def _preserved_evidence(
        self,
        preserve_steps: list[str],
        raw_prev: dict[str, Any] | None,
        full_plan: list[str],
        route: dict[str, Any],
    ) -> tuple[dict[str, str], list[dict[str, str]]]:
        if not raw_prev or not isinstance(raw_prev.get("outputs"), dict) or not isinstance(raw_prev.get("plan"), list):
            raise ValueError("Cannot preserve completed steps: no previous valid map state exists")
        prev_plan = set(raw_prev["plan"])
        prev_outputs: dict[str, str] = raw_prev["outputs"]
        keep_set = set(preserve_steps)
        sel_by_step = {selection_step_id(s): s for s in route["selections"]}
        kept_outputs: dict[str, str] = {}
        for step_ref in preserve_steps:
            if step_ref not in prev_plan:
                raise ValueError(f"Cannot preserve step '{step_ref}': not present in previous plan")
            cap = self.capabilities[step_capability(step_ref)]
            expected_keys = step_output_keys(step_ref, cap.outputs)
            missing = [k for k in expected_keys if not isinstance(prev_outputs.get(k), str) or not prev_outputs[k].strip()]
            if missing:
                raise ValueError(f"Cannot preserve incomplete step '{step_ref}': missing outputs {missing}")
            if step_ref not in full_plan:
                raise ValueError(f"Cannot preserve step '{step_ref}': not present in new plan")
            for prereq in cap.after:
                if prereq not in keep_set:
                    raise ValueError(f"Cannot preserve {step_ref} without its prerequisite {prereq}")
            sel = sel_by_step.get(step_ref, {})
            for need_item in sel.get("needs", []):
                if need_item.get("applies"):
                    req = need_item["requires"]
                    req_cap = step_capability(req)
                    if req not in keep_set and req_cap not in keep_set:
                        raise ValueError(f"Cannot preserve {step_ref} without its conditional prerequisite {req} (needs)")
            for k in expected_keys:
                kept_outputs[k] = prev_outputs[k]
        prev_results = raw_prev.get("results", [])
        kept_results = [
            copy.deepcopy(r)
            for r in prev_results
            if isinstance(r, dict) and r.get("capability") in keep_set
        ]
        return kept_outputs, kept_results

    def _confirm(
        self,
        task: str,
        plan: list[str],
        stack: set[str],
        route: dict,
        preserve_completed: list[str] | None = None,
        amend: bool = False,
    ) -> dict[str, Any]:
        expected = self._plan(task, stack, route)
        if plan != expected:
            raise ValueError(f"Plan differs from current routing: expected {expected}")
        raw = self._raw_state_or_none()
        full_plan = resolve_selection(
            self.rows,
            [selection_step_id(s) for s in route["selections"]],
            stack,
            set(),
            self.conflicts,
            conflict_groups=self.stack_conflicts,
        )
        initial_outputs: dict[str, str] = {}
        initial_results: list[dict[str, str]] = []
        if amend and not preserve_completed:
            preserve_completed = self._amendable_steps(raw, full_plan, route) or None
        if preserve_completed:
            initial_outputs, initial_results = self._preserved_evidence(preserve_completed, raw, full_plan, route)
        replace = (
            bool(preserve_completed)
            or self._new_map
            or (raw is not None and (raw.get("map_status") == "completed" or raw.get("task") != task))
        )
        if replace and self.state_path.exists():
            self._archive_map()
        if replace or not self.state_path.exists():
            self._write_state(
                {
                    "schema_version": 2,
                    "map_id": uuid.uuid4().hex,
                    "map_status": "active",
                    "task": task,
                    "plan": full_plan,
                    "classification": route,
                    "stack_tokens": sorted(stack),
                    "outputs": initial_outputs,
                    "results": initial_results,
                }
            )
        self._new_map = False
        current_state = self._state()
        remaining = self._plan(task, stack, route, outputs_override=set(current_state["outputs"]))
        return self._step(remaining, current_state)

    def resume(self) -> dict[str, Any]:
        state = self._state()
        plan = self._plan(state["task"], set(state["stack_tokens"]), state["classification"], outputs_override=set(state["outputs"]))
        return self._step(plan, state)

    def _validate_and_stage_outputs(
        self,
        state: dict[str, Any],
        outputs: dict[str, str],
        capability: str,
        verify_files: bool = False,
    ) -> dict[str, str]:
        if not isinstance(outputs, dict):
            raise ValueError("Outputs must be a JSON object")
        plan = self._plan(state["task"], set(state["stack_tokens"]), state["classification"], outputs_override=set(state["outputs"]))
        if not plan:
            raise ValueError("No step is waiting for outputs")
        active_step = plan[0]
        if active_step != capability:
            raise ValueError(f"Outputs are bound to capability {capability}, but the active step is {active_step}; nothing was recorded")
        cap = self.capabilities[step_capability(active_step)]
        required = set(cap.outputs)
        stored = {f"{active_step}.{k}" if "#" in active_step else k: v for k, v in outputs.items()}
        if any(key in state["outputs"] for key in stored):
            raise ValueError("Outputs already recorded; start a new map instead of overwriting evidence")
        missing = sorted(required - set(outputs))
        if missing:
            raise ValueError(f"Missing outputs for {cap.id}: {', '.join(missing)}")
        if set(outputs) != required:
            raise ValueError(f"Unexpected outputs for {cap.id}: {', '.join(sorted(set(outputs) - required))}")
        if any(not isinstance(value, str) or not value.strip() for value in outputs.values()):
            raise ValueError("Output values must be nonempty strings")
        if verify_files:
            for key, val in outputs.items():
                if cap.output_types.get(key) == "path" and not val.startswith("not requested"):
                    if not self._is_verified_local_file(val):
                        raise ValueError(f"Output '{key}' for {cap.id} was not found as a nonempty file on disk: {val}")
        return stored

    def _validate_check_item(self, state: dict[str, Any], item: Any, capability: str) -> dict[str, str]:
        required = {"name", "status", "evidence"}
        if not isinstance(item, dict) or set(item) != required or not all(isinstance(item.get(k), str) and item[k].strip() for k in required):
            raise ValueError("Check requires name, status and evidence")
        if item["status"] not in {"pass", "fail", "not-tested"}:
            raise ValueError("status must be pass, fail or not-tested")
        if capability not in state["plan"]:
            raise ValueError(f"Check is bound to capability {capability}, which is not a step of this map")
        cap_id = step_capability(capability)
        if item["name"] not in self.capabilities[cap_id].checks:
            raise ValueError(f"Unknown check for capability {capability}: {item['name']}")
        return {**item, "capability": capability}

    def record(self, outputs: dict[str, str], map_id: str, capability: str, verify_files: bool = False) -> dict[str, Any]:
        if not isinstance(outputs, dict):
            raise ValueError("Outputs must be a JSON object")
        self._binding(map_id, capability)
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            state = self._state()
            self._bound(state, map_id)
            stored = self._validate_and_stage_outputs(state, outputs, capability, verify_files=verify_files)
            state["outputs"].update(stored)
            self._write_state(state)
            return self.resume()

    def step_atomic(
        self,
        payload: dict[str, Any],
        map_id: str,
        capability: str,
        verify_files: bool = False,
    ) -> dict[str, Any]:
        """Atomically validate and record a step's outputs and checks in one transaction."""
        if not isinstance(payload, dict) or "outputs" not in payload or set(payload) - {"outputs", "checks"}:
            raise ValueError("Step payload must be a JSON object with 'outputs' and optional 'checks'")
        checks_in = payload.get("checks", [])
        if not isinstance(checks_in, list):
            raise ValueError("Step 'checks' must be a JSON array")
        self._binding(map_id, capability)
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            candidate = copy.deepcopy(self._state())
            self._bound(candidate, map_id)
            stored = self._validate_and_stage_outputs(candidate, payload["outputs"], capability, verify_files=verify_files)
            staged_checks = [self._validate_check_item(candidate, item, capability) for item in checks_in]
            candidate["outputs"].update(stored)
            candidate["results"].extend(staged_checks)
            remaining = self._plan(
                candidate["task"],
                set(candidate["stack_tokens"]),
                candidate["classification"],
                outputs_override=set(candidate["outputs"]),
            )
            missing_chk, failing_chk = self._all_checks_passing_or_not_tested(candidate)
            if not remaining and not missing_chk and not failing_chk:
                candidate["map_status"] = "completed"
            self._write_state(candidate)
            if candidate.get("map_status") == "completed":
                res = self._checks_result(candidate)
                res["mode"] = "completed"
                return res
            return self._step(remaining, candidate)

    def record_direct(self, outputs: dict[str, str], capability: str) -> dict[str, Any]:
        if not isinstance(outputs, dict):
            raise ValueError("Outputs must be a JSON object")
        if not isinstance(capability, str) or capability not in self.capabilities:
            raise ValueError(f"Unknown capability for direct output handoff: {capability}")
        cap = self.capabilities[capability]
        required = set(cap.outputs)
        missing = sorted(required - set(outputs))
        if missing:
            raise ValueError(f"Missing outputs for {cap.id}: {', '.join(missing)}")
        if set(outputs) != required:
            raise ValueError(f"Unexpected outputs for {cap.id}: {', '.join(sorted(set(outputs) - required))}")
        if any(not isinstance(value, str) or not value.strip() for value in outputs.values()):
            raise ValueError("Output values must be nonempty strings")
        with self._transaction():
            current = self._direct_outputs()
            current.update(outputs)
            tmp = self.context_outputs_path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            tmp.replace(self.context_outputs_path)
        return {"mode": "direct-recorded", "capability": capability, "recorded_outputs": current}

    def complete(self, map_id: str) -> dict[str, Any]:
        if not isinstance(map_id, str) or not map_id.strip():
            raise ValueError("complete requires --map-id")
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            state = self._state()
            self._bound(state, map_id)
            remaining = self._plan(
                state["task"],
                set(state["stack_tokens"]),
                state["classification"],
                outputs_override=set(state["outputs"]),
            )
            if remaining:
                raise ValueError(f"Cannot complete map: pending step(s): {', '.join(remaining)}")
            missing, failing = self._all_checks_passing_or_not_tested(state)
            if missing:
                raise ValueError(f"Cannot complete map: missing check results for {', '.join(missing)}")
            if failing:
                raise ValueError(f"Cannot complete map: failing checks: {', '.join(failing)}")
            state["map_status"] = "completed"
            self._write_state(state)
            result = self._checks_result(state)
            result["mode"] = "completed"
            return result

    def record_check(self, result: dict[str, str] | list[dict[str, str]], map_id: str, capability: str) -> dict[str, Any]:
        items = result if isinstance(result, list) else [result]
        if not items:
            raise ValueError("Check requires at least one result object")
        # Validate shape up-front before touching lock
        for item in items:
            required = {"name", "status", "evidence"}
            if not isinstance(item, dict) or set(item) != required or not all(isinstance(item.get(k), str) and item[k].strip() for k in required):
                raise ValueError("Check requires name, status and evidence")
            if item["status"] not in {"pass", "fail", "not-tested"}:
                raise ValueError("status must be pass, fail or not-tested")
        self._binding(map_id, capability)
        if not self.state_path.is_file():
            raise ValueError("No active map. Run plan first or work directly on a one-step task.")
        with self._transaction():
            candidate = copy.deepcopy(self._state())
            self._bound(candidate, map_id)
            staged = [self._validate_check_item(candidate, item, capability) for item in items]
            candidate["results"].extend(staged)
            self._write_state(candidate)
            return self._checks_result(candidate)


def _load_cli_json(file_arg: str | None, inline_arg: str | None, label: str, stdin_text: str | None) -> Any:
    if file_arg is not None and inline_arg is not None:
        raise ValueError(f"Pass either --{label} or --{label}-json, not both")
    if inline_arg is not None:
        return json.loads(inline_arg)
    if file_arg is None:
        return None
    if file_arg == "-":
        assert stdin_text is not None
        return json.loads(stdin_text)
    return json.loads(Path(file_arg).read_text(encoding="utf-8"))


def runtime_main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    parser = argparse.ArgumentParser(prog="muro-runtime")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser.add_argument("action", choices=("plan", "resume", "record", "check", "complete", "step", "unlock"))
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--task", default="")
    parser.add_argument("--confirm", action="store_true")
    parser.add_argument("--compact", action="store_true",
                        help="plan without a decision: return context and a compact catalog only (rules live in SKILL.md)")
    parser.add_argument("--new", action="store_true", help="Start a fresh map, archiving any previous map")
    parser.add_argument("--amend", action="store_true",
                        help="The request was refined in the same conversation: replan and keep outputs that are still valid")
    parser.add_argument("--direct", action="store_true", help="Persist outputs from a direct one-step task for follow-up turns")
    parser.add_argument("--verify-files", action="store_true", help="Verify path-typed outputs exist on disk")
    parser.add_argument("--preserve-completed", default="", help="Comma-separated completed step IDs to retain on --new")
    parser.add_argument("--stack", action="append", default=[])
    parser.add_argument("--outputs")
    parser.add_argument("--outputs-json")
    parser.add_argument("--result")
    parser.add_argument("--result-json")
    parser.add_argument("--step-data")
    parser.add_argument("--step-json")
    parser.add_argument("--map-id", help="map_id returned with the step")
    parser.add_argument("--capability", help="capability or step_id the evidence belongs to")
    parser.add_argument("--classification", help="JSON classification file or '-' for stdin")
    parser.add_argument("--classification-json", help="Inline JSON classification string")
    parser.add_argument("--token", help="Lock recovery token for unlock")
    args = parser.parse_args(argv)
    try:
        stdin_consumers = sum(
            1 for val in (args.classification, args.outputs, args.result, args.step_data) if val == "-"
        )
        if stdin_consumers > 1:
            raise ValueError("At most one CLI option may read from '-' (stdin) per invocation")
        stdin_text = sys.stdin.read() if stdin_consumers == 1 else None

        coordinator = Coordinator(args.package, args.project)
        if args.action == "plan":
            stack = detect_stack(
                args.project,
                set(args.stack),
                rules=coordinator.stack_rules,
                conflict_groups=coordinator.stack_conflicts,
            )
            classification = _load_cli_json(args.classification, args.classification_json, "classification", stdin_text)
            if args.classification not in (None, "-") and Path(args.classification).resolve().parent == coordinator.state_dir:
                coordinator.ensure_gitignore()
            preserved = [s.strip() for s in args.preserve_completed.split(",") if s.strip()] or None
            result = coordinator.propose(args.task, stack, new=args.new or bool(preserved),
                                         classification=classification, compact=args.compact, amend=args.amend)
            if args.confirm:
                if result["mode"] == "classification-required":
                    raise ValueError("AI classification is required before confirmation; run plan without --confirm first")
                if result["mode"] not in {"confirm", "direct"}:
                    raise ValueError("This task needs no map or confirmation")
                if result["mode"] == "confirm":
                    result = coordinator.confirm(
                        args.task,
                        result["plan"],
                        stack,
                        classification=classification,
                        preserve_completed=preserved,
                        amend=args.amend,
                    )
        elif args.action == "resume":
            result = coordinator.resume()
        elif args.action == "record":
            payload = _load_cli_json(args.outputs, args.outputs_json, "outputs", stdin_text)
            if payload is None:
                raise ValueError("--outputs or --outputs-json is required")
            if args.direct:
                result = coordinator.record_direct(payload, args.capability)
            else:
                result = coordinator.record(payload, args.map_id, args.capability, verify_files=args.verify_files)
        elif args.action == "step":
            payload = _load_cli_json(args.step_data, args.step_json, "step", stdin_text)
            if payload is None:
                raise ValueError("--step-data or --step-json is required")
            result = coordinator.step_atomic(payload, args.map_id, args.capability, verify_files=args.verify_files)
        elif args.action == "complete":
            result = coordinator.complete(args.map_id)
        elif args.action == "unlock":
            result = coordinator.unlock(args.token)
        else:
            payload = _load_cli_json(args.result, args.result_json, "result", stdin_text)
            if payload is None:
                raise ValueError("--result or --result-json is required")
            result = coordinator.record_check(payload, args.map_id, args.capability)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Muro: {exc}", file=sys.stderr)
        return 1
    if args.compact:
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(runtime_main())
