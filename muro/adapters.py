"""Host adapters sharing the same host-neutral Python coordinator."""
from __future__ import annotations

import json
from pathlib import Path
import shutil


_LAUNCHER = '''from pathlib import Path
import sys
package = Path(__file__).resolve().parent
if not (package / "ROUTER.md").is_file() and package.name in {"claude-code", "codex", "pi", "opencode", "hermes"} and (package.parent.parent / "ROUTER.md").is_file():
    package = package.parent.parent
sys.path.insert(0, str(package))
from muro.runtime import runtime_main
raise SystemExit(runtime_main(["--package", str(package), *sys.argv[1:]]))
'''


def _skill_description(plugin: dict, capabilities: list | None = None) -> str:
    name = plugin["name"]
    suffix = (
        f"{name} AI-routed coordinator for the capabilities in its catalog. "
        "Classify requests by meaning before selecting work; load one capability per step. "
        "Never invoke original absorbed skills."
    )
    custom = str(plugin.get("description") or "").strip().replace(":", ";")
    if custom:
        if not custom.lower().startswith("use when"):
            custom = f"Use when {custom[0].lower()}{custom[1:]}" if len(custom) > 1 else custom
        prefix = custom.rstrip(".") + ". "
    elif capabilities:
        topics = []
        for cap in capabilities:
            title = next((ln[2:].strip() for ln in cap.body.splitlines() if ln.startswith("# ")), cap.id)
            intents = ", ".join(i["id"] for i in cap.intents if isinstance(i, dict) and "id" in i)
            topics.append(f"{title} ({intents})" if intents else title)
        joined = "; ".join(topics).replace(":", ";")
        prefix = f"Use when working on {joined}. " if joined else ""
    else:
        prefix = ""
    budget = 1024 - len(suffix)
    if prefix and len(prefix) > budget:
        prefix = prefix[: max(0, budget - 4)].rsplit(" ", 1)[0].rstrip(".,; ") + "... "
    return (prefix + suffix)[:1024]


def _yaml_scalar(text: str) -> str:
    """One frontmatter value hosts can parse: plain when safe, otherwise a double-quoted (JSON) string.

    An AI-authored description is never reworded to fit YAML. A plain scalar with ': ' or ' #'
    makes the whole frontmatter invalid, and a host then drops the skill without an error.
    """
    plain = (text and text == text.strip() and ": " not in text and " #" not in text and not text.endswith(":")
             and text[0] not in "!&*-?[]{}|>@`%\"'#," and "\n" not in text)
    return text if plain else json.dumps(text, ensure_ascii=False)


def _embedded_rules(classify_prompt: str | None) -> str:
    """The classification prompt, demoted two heading levels, so SKILL.md carries the rules once per session."""
    if not classify_prompt or not classify_prompt.strip():
        return ""
    lines = [("##" + line) if line.startswith("#") else line for line in classify_prompt.strip().splitlines()]
    return "\n## Classification rules\n\nCopied from `prompts/classify.md` of this release.\n\n" + "\n".join(lines) + "\n"


def _skill(plugin: dict, host: str, capabilities: list | None = None, classify_prompt: str | None = None,
           entry: dict | None = None) -> str:
    slug, name = plugin["command"], plugin["name"]
    state = f".{plugin.get('slug', slug)}"
    skill_name = entry["name"] if entry else slug
    if host == "claude-code":
        launcher = f"${{CLAUDE_PLUGIN_ROOT}}/skills/{slug}/muro.py"
        # Pre-approve the runtime's one-line calls and the host's own JSON files in the state folder,
        # for the turn that invokes the skill (Claude Code `allowed-tools`; `Edit` rules cover Write).
        allowed = f"allowed-tools: Bash(python {launcher} *) Edit(./{state}/**)\n"
        if entry:
            # Discovery only: the model can invoke the entry; the one user-facing command stays /<command>.
            allowed = "user-invocable: false\n" + allowed
    else:
        # An entry folder holds only SKILL.md and drives the runtime of the umbrella folder beside it.
        launcher = f"<skill-directory>/../{slug}/muro.py" if entry else "<skill-directory>/muro.py"
        allowed = ""
    desc = entry["description"] if entry else _skill_description(plugin, capabilities)
    # An entry asks for its own area in full and an index of the rest; the umbrella starts from the index.
    view = "--focus " + ",".join(entry["capabilities"]) if entry else "--brief"
    scope = ""
    if entry:
        titles = {cap.id: next((ln[2:].strip() for ln in cap.body.splitlines() if ln.startswith("# ")), cap.id)
                  for cap in capabilities or []}
        covered = ", ".join(titles.get(identifier, identifier) for identifier in entry["capabilities"])
        scope = (f"\nThis is the {name} entry for: {covered}. It runs the same coordinator as the\n"
                 f"`{slug}` skill. Classify against the whole returned catalog: a request can\n"
                 "also need capabilities outside this entry, and the catalog decides, not the entry.\n")
    install_policy = plugin.get("install_policy", "auto")
    if install_policy == "confirm":
        install_block = (
            "   When the step needs a runtime dependency that is missing (a package, a\n"
            "   command-line tool, an application), state in one line what is needed, from\n"
            "   which official source and where it goes. Ask the user for explicit approval before installing\n"
            "   any missing runtime dependency; never switch to another engine, and a\n"
            "   declined or failed install blocks only the work that depends on it."
        )
    else:
        install_block = (
            "   When the step needs a runtime dependency that is missing (a package, a\n"
            "   command-line tool, an application), install it as the instructions say: state\n"
            "   in one line what is installed, from where and to where, then check it answers\n"
            "   and continue. Do not stop to ask whether to install and do not switch to\n"
            "   another engine; a failed install blocks only the work that depends on it."
        )
    return f'''---
name: {skill_name}
description: {_yaml_scalar(desc)}
{allowed}---

# {name} coordinator
{scope}
The offline `GUIDE.html` in the `{slug}` skill folder explains this release's decision graph,
commands, intents and handoffs. It is documentation, not an activation mechanism.

Keep every command below on one line: no heredoc, no pipe, no `cd … &&`, no JSON
in the command. Write each JSON file with your file tool and pass its path, so the
host's permission rules match every call. `{state}` is this coordinator's folder in
the current project; the runtime keeps it out of Git with its own `.gitignore`.

1. Read the user's task and relevant project context. Run:
   `python {launcher} plan --compact {view} --task "<user task>" --project "<current project>"`.
2. The result is `classification-required` with `context` and a compact `catalog`
   (empty fields are omitted). Entries marked `brief` show only role and intents:
   before selecting one, or when the task may need one, rerun the same command with
   `--focus <ids>` (comma-separated, keeping the ids already in focus) to read its
   exclusions, tools and constraints. YOU are the AI classifier: apply the Classification
   rules at the end of this file to the task and the project. Interpret outcomes,
   negations and constraints; never use keyword matching or ask the user to classify skills.
   Check required tools and hook policies for selected capabilities and prerequisites
   against this host's actual integrations and permissions; never auto-register hooks.
   Write the decision, copying context.task, context.stack_tokens and
   context.catalog_digest exactly, to `<current project>/{state}/classification.json`
   (the returned `classification_path`), then run, with the same stack options:
   `python {launcher} plan --task "<same task>" --project "<current project>" --classification "<current project>/{state}/classification.json"`.
   A `no_match` or `needs_clarification` result stops execution; explain or ask its
   questions. Never silently substitute a coordinator or another variant.
3. If `direct`, apply only its instructions and run its checks. To keep its outputs
   for a follow-up turn, write them to `{state}/outputs.json` and run
   `python {launcher} record --direct --project "<current project>" --capability <capability> --outputs "<current project>/{state}/outputs.json"`.
   If `confirm`, show the ordered plan in the user's words (what each step produces)
   and obtain one-line approval unless already authorized, then repeat the same plan
   call with `--confirm`. Use `resume` for an existing map; `--new` archives evidence
   when confirming a freshly classified task (add `--preserve-completed <steps>` to
   keep valid upstream outputs). A `confirm` result with `approval: not-needed` is one
   long step that gets a map so it can be resumed: repeat with `--confirm` without asking.
   When the user refines a request that has an active map, classify the refined request
   and repeat the plan call with `--amend`: steps whose work is still valid are kept.
   Read only the returned active capability body.
4. Perform the returned step using the host's tools. Do not load other capabilities.
   Replace `<package_root>` and `<state_dir>` in its instructions with the returned
   `package_root` and `state_dir`, and read prior outputs from `recorded_outputs`;
   helper paths never resolve against the user's project. Give the step what is
   already in the conversation (a brief, answers, approvals): do not ask for it again.
{install_block}
   Run a step in an isolated agent (Claude Code Agent, Codex `spawn_agent` with
   `fork_turns: "none"`, OpenCode `subagent`, Hermes `delegate_task`) only when it
   asks the user nothing; a step that asks for approval or missing material runs in
   the main session. Pi executes every step sequentially in the main session.
5. For a mapped step, write `{{"outputs": {{...}}, "checks": [...]}}` to `{state}/step.json`
   and submit outputs and checks in one atomic call; the result is the next step:
   `python {launcher} step --project "<current project>" --map-id <map_id> --capability <step_id_or_capability> --step-data "<current project>/{state}/step.json"`
   (outputs alone: `record --project "<current project>" --map-id <map_id> --capability <capability> --outputs <json-file>`).
   Never edit `{state}/map.md` or `{state}/state.json` yourself, invent outputs or
   overwrite earlier ones. A stale map or wrong-step error means the evidence belongs
   to other work: stop and report it; never resubmit it under another binding.
6. At completion run the returned `## Checks` with real tools. Checks not sent inside
   `step` go, as one object or an array in a JSON file, to
   `check --project "<current project>" --map-id <map_id> --capability <owner> --result <json-file>`,
   taking the owner from `checks_by_capability`; then close the map with
   `complete --project "<current project>" --map-id <map_id>`. Each check object is
   {{"name": "<check>", "status": "pass|fail|not-tested", "evidence": "<command/output or observation>"}}.
   Static checklists are not evidence of passing. Do not modify source plugins.
{_embedded_rules(classify_prompt)}'''


def write_adapters(dist: Path, plugin: dict, package_source: Path, capabilities: list | None = None,
                   entries: list[dict] | None = None) -> None:
    """Write documented skill layouts and independently runnable host launchers."""
    shutil.copytree(package_source, dist / "muro", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (dist / "muro.py").write_text(_LAUNCHER, encoding="utf-8")
    plugin_doc = {
        "name": plugin["slug"], "displayName": plugin["name"],
        "version": plugin["version"],
        "description": f"{plugin['name']} — unified multi-host coordinator plugin",
        "author": {"name": "Muro contributors"},
    }
    (dist / ".claude-plugin").mkdir()
    (dist / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
    if capabilities is None and (dist / "capabilities").is_dir():
        from .core import parse_capability
        capabilities = [parse_capability(p) for p in sorted((dist / "capabilities").glob("*.md"))]
    classify_file = dist / "prompts" / "classify.md"
    classify_prompt = classify_file.read_text(encoding="utf-8") if classify_file.is_file() else None
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        root = dist / "adapters" / host
        skill_dir = root / "skills" / plugin["command"]
        skill_dir.mkdir(parents=True)
        (skill_dir / "SKILL.md").write_text(
            _skill(plugin, host, capabilities=capabilities, classify_prompt=classify_prompt), encoding="utf-8")
        (skill_dir / "muro.py").write_text(_LAUNCHER, encoding="utf-8")
        # A skill directory is independently installable; omit build-only graph bundle inside runtime muro/.
        shutil.copytree(
            dist / "muro",
            skill_dir / "muro",
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "cytoscape.min.js", "guide.html"),
        )
        shutil.copy2(dist / "ROUTER.md", skill_dir / "ROUTER.md")
        shutil.copytree(dist / "capabilities", skill_dir / "capabilities")
        shutil.copytree(dist / "prompts", skill_dir / "prompts")
        shutil.copytree(dist / "LICENSES", skill_dir / "LICENSES")
        shutil.copy2(dist / "NOTICE.md", skill_dir / "NOTICE.md")
        shutil.copy2(dist / "sources.json", skill_dir / "sources.json")
        shutil.copy2(dist / "GUIDE.html", skill_dir / "GUIDE.html")
        shutil.copy2(dist / "guide-examples.json", skill_dir / "guide-examples.json")
        if (dist / "scripts").is_dir():
            shutil.copytree(dist / "scripts", skill_dir / "scripts")
        entry_names = []
        for entry in entries or []:
            entry_dir = root / "skills" / entry["name"]
            entry_dir.mkdir()
            (entry_dir / "SKILL.md").write_text(
                _skill(plugin, host, capabilities=capabilities, classify_prompt=classify_prompt, entry=entry),
                encoding="utf-8")
            entry_names.append(entry["name"])
        replaces = [r for r in plugin.get("replaces", []) if isinstance(r, str) and r.strip()]
        replaces_note = ""
        if replaces:
            replaces_note = ("\n\nThis package absorbs these skills or plugins: " + ", ".join(f"`{r}`" for r in replaces)
                             + ". If any is installed on this host, switch it off: hosts pick a skill by its "
                             "description, and an installed original competes with this coordinator for the same requests.")
        entries_note = ""
        if entry_names:
            listed = ", ".join(f"`skills/{n}`" for n in entry_names)
            entries_note = (f"Install the discovery entries {listed} beside it, in the same skills folder: each holds "
                            f"only a SKILL.md that runs the runtime of `skills/{plugin['command']}`. ")
        (root / "INSTALL.md").write_text(
            f"# {plugin['name']} on {host}\n\n"
            f"Install the complete folder `skills/{plugin['command']}` as one skill; do not copy only SKILL.md. "
            "It includes its runtime, capabilities, license notices and offline `GUIDE.html`. "
            f"{entries_note}"
            f"Open `skills/{plugin['command']}/GUIDE.html` for this release's illustrated decision graph and commands. "
            "The universal fallback is `python muro.py` inside that folder. "
            f"See README.md in the source project for current verification limits.{replaces_note}\n",
            encoding="utf-8")
        if host == "claude-code":
            (root / ".claude-plugin").mkdir()
            (root / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
