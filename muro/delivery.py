"""Delivery form: structure checks and host files for AI-authored decisions (no form is chosen in Python)."""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

DELIVERY_FILE = "delivery.json"
FORMS = ("capability", "always-on", "hook", "dropped")
# Text every receiving prompt pays for, so it is bounded. The budget grows with the sources the AI gave a
# permanent place: one allowance for each source with an always-on decision (owner, 2026-11-12).
# The allowance is sized so a real always-on source fits in its own words: content is never shortened to fit
# (the larger of Marionette's two, i-have-adhd, is about 7000 characters). Exact token cost depends on the model.
ALWAYS_ON_PER_SOURCE = 6000
# Arbitrary source command hooks; native prompt registration is supported on every host.
HOOK_HOSTS = ("claude-code", "codex")
KNOWN_HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")
SESSION_MATCHER = "startup|resume|clear|compact|fork"


def always_on_limit(document: Any) -> int:
    """Characters `always_on` may hold: one allowance per source with an always-on decision. Counts, never judges."""
    decisions = document.get("decisions") if isinstance(document, dict) else None
    sources = {item["source"] for item in decisions if isinstance(item, dict) and item.get("form") == "always-on"
               and isinstance(item.get("source"), str)} if isinstance(decisions, list) else set()
    return ALWAYS_ON_PER_SOURCE * len(sources)
_DECISION_KEYS = {"source", "content", "form", "targets", "reason"}
_WIRING_KEYS = {"host", "capability", "event", "matcher", "run"}


def load_delivery(package_dir: Path) -> dict[str, Any] | None:
    """The package's delivery document, or None: then everything is an on-demand capability and nothing registers."""
    path = package_dir / DELIVERY_FILE
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def session_text(document: dict[str, Any] | None) -> str:
    return (document or {}).get("always_on", "") or ""


def _text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate_delivery(document: Any, capabilities: list, source_ids: set[str]) -> list[str]:
    """Check shape, references and that every declared form has something behind it. Forms stay the AI's decision."""
    if not isinstance(document, dict) or "decisions" not in document or set(document) - {"decisions", "always_on", "hooks"}:
        return ["delivery.json must be an object with decisions and only decisions, always_on and hooks"]
    decisions = document["decisions"]
    if not isinstance(decisions, list) or not decisions:
        return ["delivery.json decisions must be a nonempty array"]
    known = {cap.id: cap for cap in capabilities}
    errors: list[str] = []
    decided_sources: set[str] = set()
    forms: set[str] = set()
    hook_targets: set[str] = set()
    for item in decisions:
        if not isinstance(item, dict) or set(item) != _DECISION_KEYS:
            errors.append("each decision requires exactly source, content, form, targets and reason")
            continue
        source, form, targets = item["source"], item["form"], item["targets"]
        if not isinstance(source, str) or source not in source_ids:
            errors.append(f"decision names unknown source {source}")
        else:
            decided_sources.add(source)
        if not _text(item["content"]) or not _text(item["reason"]):
            errors.append(f"decision for {source}: content and reason must be nonempty text")
        if not isinstance(form, str) or form not in FORMS:
            errors.append(f"decision for {source}: form must be one of {', '.join(FORMS)}")
            continue
        forms.add(form)
        if not isinstance(targets, list) or any(not isinstance(t, str) for t in targets):
            errors.append(f"decision for {source}: targets must be a list of capability ids")
            continue
        for target in targets:
            if target not in known:
                errors.append(f"decision for {source}: unknown capability {target}")
        if form in ("capability", "hook") and not targets:
            errors.append(f"decision for {source}: form {form} needs at least one target capability")
        if form in ("dropped", "always-on") and targets:
            errors.append(f"decision for {source}: form {form} takes no targets")
        if form == "hook":
            hook_targets.update(t for t in targets if t in known)
    for missing in sorted(source_ids - decided_sources):
        errors.append(f"source {missing} has no delivery decision: every intake records what it became and why")

    text = document.get("always_on")
    if "always-on" in forms and text is None:
        errors.append("a decision has form always-on but the always_on text is missing")
    if text is not None:
        if "always-on" not in forms:
            errors.append("always_on text is present but no decision has form always-on")
        if not _text(text):
            errors.append("always_on must be nonempty text")
        else:
            limit = always_on_limit(document)
            if limit and len(text) > limit:
                errors.append(f"always_on exceeds {limit} characters ({ALWAYS_ON_PER_SOURCE} for each source with "
                              f"an always-on decision, {limit // ALWAYS_ON_PER_SOURCE} here): every session pays for it")

    wirings = document.get("hooks", [])
    if not isinstance(wirings, list):
        return errors + ["hooks must be an array of wirings"]
    wired: set[str] = set()
    for wiring in wirings:
        if not isinstance(wiring, dict) or set(wiring) != _WIRING_KEYS:
            errors.append("each hook wiring requires exactly host, capability, event, matcher and run")
            continue
        host, capability, run = wiring["host"], wiring["capability"], wiring["run"]
        if not isinstance(host, str) or host not in KNOWN_HOSTS:
            errors.append(f"hook wiring names unknown host {host}")
        elif host not in HOOK_HOSTS:
            errors.append(f"this factory does not register hooks on {host} (only on {', '.join(HOOK_HOSTS)}): "
                          "say so in the decision's reason instead of declaring a wiring")
        if not isinstance(capability, str) or capability not in known:
            errors.append(f"hook wiring names unknown capability {capability}")
        elif capability not in hook_targets:
            errors.append(f"hook wiring for {capability} has no hook decision that targets it")
        else:
            wired.add(capability)
        if not _text(wiring["event"]):
            errors.append(f"hook wiring for {capability}: event must be the host's event name")
        if not isinstance(wiring["matcher"], str):
            errors.append(f"hook wiring for {capability}: matcher must be a string (empty for every occurrence)")
        if not isinstance(run, list) or not run or any(not _text(part) for part in run):
            errors.append(f"hook wiring for {capability}: run must be a nonempty list of command parts")
            continue
        if any(ch.isspace() for ch in run[0]) or '"' in run[0]:
            errors.append(f"hook wiring for {capability}: the program (first part of run) must be one bare word")
        if any('"' in part for part in run[1:]):
            errors.append(f"hook wiring for {capability}: a run argument must not contain a double quote")
    for capability in sorted(hook_targets):
        if not any(h.get("policy") == "active" for h in known[capability].hooks):
            errors.append(f"capability {capability} is a hook target but its catalog declares no hook with policy active")
        if capability not in wired:
            errors.append(f"capability {capability} has a hook decision but no wiring for any host")
    for cap in capabilities:
        if cap.id not in hook_targets and any(h.get("policy") == "active" for h in cap.hooks):
            errors.append(f"capability {cap.id} declares an active hook but no hook decision targets it")
    return errors


def unregistered_active_hooks(capabilities: list) -> list[str]:
    """Without a delivery document nothing registers, so the catalog cannot call a hook active."""
    return [f"capability {cap.id} declares an active hook but the package has no {DELIVERY_FILE}"
            for cap in capabilities if any(h.get("policy") == "active" for h in cap.hooks)]


def allows_empty_catalog(document: Any, capabilities: list, source_ids: set[str]) -> bool:
    """An explicit, valid permanent policy is a useful package without procedural skills."""
    return bool(document is not None and not validate_delivery(document, capabilities, source_ids)
                and session_text(document))


def _command(run: list[str], package_root: str) -> str:
    """Keep declared argv and installed paths out of the host's shell syntax.

    Only the constant Python trampoline reaches the shell. Its encoded data is
    decoded after dispatch; host root variables are expanded there, once, and
    the declared program inherits the hook's streams through shell=False.
    Windows batch files are rejected because the OS still dispatches them
    through cmd, which would reinterpret the arguments.
    """
    payload = base64.b64encode(json.dumps({"run": run, "root": package_root},
                                         ensure_ascii=True).encode("utf-8")).decode("ascii")
    script = (
        "import base64,json,os,shutil,string,subprocess,sys;"
        f"p=json.loads(base64.b64decode('{payload}'));"
        "root=string.Template(p['root']).substitute(os.environ);"
        "argv=[part.replace('<package_root>',root) for part in p['run']];"
        "program=shutil.which(argv[0]) or argv[0];"
        "sys.exit('Windows batch hooks require an explicit executable and script') "
        "if os.name=='nt' and os.path.splitext(program)[1].lower() in ('.bat','.cmd') else None;"
        "argv[0]=program;"
        "sys.exit(subprocess.run(argv,shell=False).returncode)"
    )
    return f'python -c "{script}"'


def claude_code_hooks(document: dict[str, Any] | None, slug: str, name: str) -> dict[str, Any] | None:
    """The `hooks/hooks.json` a Claude Code plugin registers when enabled, or None when nothing is declared."""
    if not document:
        return None
    package_root = f"${{CLAUDE_PLUGIN_ROOT}}/skills/{slug}"
    events: dict[str, list] = {}
    for wiring in document.get("hooks", []):
        if wiring["host"] != "claude-code":
            continue
        group: dict[str, Any] = {"hooks": [{"type": "command", "command": _command(wiring["run"], package_root)}]}
        if wiring["matcher"]:
            group = {"matcher": wiring["matcher"], **group}
        events.setdefault(wiring["event"], []).append(group)
    if not events:
        return None
    return {"description": f"{name}: registered from this release's {DELIVERY_FILE}", "hooks": events}


def codex_hooks(document: dict[str, Any] | None, slug: str, name: str) -> dict[str, Any] | None:
    """Codex's native developer-instruction channel, plus explicitly declared source hooks."""
    if not document:
        return None
    package_root = f"${{PLUGIN_ROOT}}/skills/{slug}"
    events: dict[str, list] = {}
    if session_text(document):
        for event in ("SessionStart", "SubagentStart"):
            hook = {"type": "command", "command": _command(
                ["python", "<package_root>/muro.py", "session-context", "--hook-event", event], package_root)}
            group = {"hooks": [hook]}
            if event == "SessionStart":
                group["matcher"] = SESSION_MATCHER
            events[event] = [group]
    for wiring in document.get("hooks", []):
        if wiring["host"] != "codex":
            continue
        group: dict[str, Any] = {"hooks": [{"type": "command", "command": _command(wiring["run"], package_root)}]}
        if wiring["matcher"]:
            group["matcher"] = wiring["matcher"]
        events.setdefault(wiring["event"], []).append(group)
    return {"description": f"{name}: declared delivery", "hooks": events} if events else None


def install_note(document: dict[str, Any] | None, host: str, command: str) -> str:
    """What this host's adapter registers by itself, and what it does not."""
    if not document or not (session_text(document) or document.get("hooks")):
        return ""
    notes = []
    if session_text(document):
        channels = {
            "claude-code": "a native `prompt.compose` module in `hooks/hooks.json`, adding a system-prompt section while preserving the host's other sections. Requires Claude Code mods (2.1.287+) enabled",
            "codex": "`SessionStart` and `SubagentStart` in `hooks/hooks.json`, adding developer instructions on startup, resume, clear, compaction, fork and subagent creation. Codex's own hook trust review and feature policy still apply",
            "pi": "the native `before_agent_start` extension, adding a named system-prompt section on each run, including after compaction and session changes. Requires Pi's structured `systemPromptOptions.sections` API",
            "opencode": "the native package plugin's system-context hooks, preserving existing system parts and messages. Requires OpenCode's package plugin API (verified on 2.2.5)",
            "hermes": ("`register_system_prompt_section`, preserving the host's core prompt, when the policy is at most 4,000 characters. Hermes accepts no more in one section (8,000 in all of them) and skips what is over, so a longer policy is never cut: it registers a `pre_llm_call` hook instead, and Hermes appends the whole text to the user message of the first turn and again after a compression removed it. That is the turn's context, not the system prompt. Hermes writes a hook return over `hooks.output_spill.max_chars` (default 10,000) to disk and shows a preview; the policy is sent in pieces of at most 8,000 characters, so keep that setting at 8,000 or more. " if len(session_text(document).strip()) > 4000 else "`register_system_prompt_section`, preserving the host's core prompt. ") + "Requires a Hermes version exposing that API; an older host reports an explicit warning instead of claiming activation. After updating a policy, start a new session: a resumed session may retain its persisted system prompt. Not run in a live Hermes conversation",
        }
        notes.append(f"The declared policy in `policy.md` registers automatically through {channels[host]}. "
                     "Install or load the complete adapter as a native plugin/package; copying only its skills does not load the policy. "
                     "The factory never edits host configuration or changes permissions.")
    wired = [w for w in document.get("hooks", []) if w["host"] == host]
    if wired:
        notes.append("The source command hooks declared for this host also register through `hooks/hooks.json`; other hosts' wirings do not run here. "
                     "Arguments are literal argv. Windows `.cmd`/`.bat` programs are rejected; declare the underlying executable and script directly.")
    elif document.get("hooks"):
        notes.append("This release's source command hooks target other hosts and do not run here.")
    return "\n\n" + "\n\n".join(notes) if notes else ""
