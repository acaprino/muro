"""Host adapters sharing the same host-neutral Python coordinator."""
from __future__ import annotations

import json
from pathlib import Path
import shutil

from .delivery import DELIVERY_FILE, claude_code_hooks, codex_hooks, install_note, session_text
from .claude_adapter import write_claude_policy
from .hermes_adapter import write_hermes_adapter
from .native_policy import write_opencode_adapter, write_pi_adapter


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
   (the returned `classification_path`), then run, with the same stack options
   (a stack token is passed whole, prefix included: `--stack stack:css-only`):
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
   helper paths never resolve against the user's project. Where the instructions point
   to a packaged original, open the named part when the task needs it, not everything first. Give the step what is
   already in the conversation (a brief, answers, approvals): do not ask for it again.
{install_block}
   Run a step in an isolated agent (Claude Code Agent, Codex `spawn_agent` with
   `fork_turns: "none"`, OpenCode `subagent`, Hermes `delegate_task`) only when it
   asks the user nothing; a step that asks for approval or missing material runs in
   the main session. Pi executes every step sequentially in the main session.
5. A mapped step covers one capability. Its result names the `remaining_steps` and gives
   the exact launcher arguments in `submit`. Do not start the work of a later step before
   this one is submitted, even when the user approved the whole plan. Write
   `{{"outputs": {{...}}, "checks": [...]}}` to `{state}/step.json` and run the launcher with
   `submit`; the result is the next step, until `checks`. That is:
   `python {launcher} step --project "<current project>" --map-id <map_id> --capability <step_id_or_capability> --step-data "<current project>/{state}/step.json"`
   (outputs alone: `record --project "<current project>" --map-id <map_id> --capability <capability> --outputs <json-file>`).
   Never edit `{state}/map.md` or `{state}/state.json` yourself, invent outputs or
   overwrite earlier ones. A stale map or wrong-step error means the evidence belongs
   to other work: stop and report it; never resubmit it under another binding.
6. At completion (`checks`) run the returned `## Checks` with real tools; `submit_check` and
   `submit_complete` give the exact arguments. Checks not sent inside
   `step` go, as one object or an array in a JSON file, to
   `check --project "<current project>" --map-id <map_id> --capability <owner> --result <json-file>`,
   taking the owner from `checks_by_capability`; then close the map with
   `complete --project "<current project>" --map-id <map_id>`. Each check object is
   {{"name": "<check>", "status": "pass|fail|not-tested", "evidence": "<command/output or observation>"}}.
   Static checklists are not evidence of passing. Do not modify source plugins.
{_embedded_rules(classify_prompt)}'''


def _install_steps(host: str, plugin: dict, reviews_hooks: bool) -> str:
    """The host's own install command for this adapter folder, and what is active after it.

    Each command was run on the real host before it was written here; Hermes was not, so it gets none.
    """
    slug, here = plugin["slug"], "<path of this folder>"
    active = "Everything this release declares is active"
    if host == "claude-code":
        steps = (f"```sh\nclaude plugin marketplace add {here}\nclaude plugin install {slug}@{slug}\n```\n\n"
                 f"For one session only: `claude --plugin-dir {here}`. {active} as soon as the plugin is enabled: "
                 "there is no further step.")
    elif host == "codex":
        steps = f"```sh\ncodex plugin marketplace add {here}\ncodex plugin add {slug}@{slug}\n```\n\n"
        steps += ("Then open `/hooks` in Codex, trust this plugin's hooks and start a new thread. Codex skips every "
                  "plugin's hooks until its user reviews them, and asks again when a release changes them, so what "
                  "this release declares is not active on Codex until that review. No package can skip it."
                  if reviews_hooks else "The skills are available from the next thread.")
    elif host == "pi":
        steps = (f"```sh\npi install {here}\n```\n\nAdd `-l` to install for the current project only. "
                 f"{active} from the next run: there is no further step.")
    elif host == "opencode":
        steps = ("Add this folder to `plugins` in `opencode.json` (`~/.config/opencode/opencode.json`, or the "
                 f"project's own), as a `file:///` URL:\n\n```json\n{{\"plugins\": [\"file:///{here}\"]}}\n```\n\n"
                 f"{active} from the next session: there is no further step.")
    else:
        return ""
    return f"\n\n## Install\n\n{steps}"


def write_adapters(dist: Path, plugin: dict, package_source: Path, capabilities: list | None = None,
                   entries: list[dict] | None = None, delivery: dict | None = None) -> None:
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
        policy = session_text(delivery)
        if policy:
            (root / "policy.md").write_text(policy, encoding="utf-8", newline="")
        if capabilities:
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
        if (dist / DELIVERY_FILE).is_file():
            shutil.copy2(dist / DELIVERY_FILE, skill_dir / DELIVERY_FILE)
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
            "Install this complete adapter directory as the host's native plugin/package, including its manifest and entrypoint. "
            f"`skills/{plugin['command']}` holds the standalone runtime, catalog, license notices and offline `GUIDE.html`. "
            f"{entries_note}"
            f"Open `skills/{plugin['command']}/GUIDE.html` for this release's illustrated decision graph and commands. "
            "The universal fallback is `python muro.py` inside that folder. "
            f"See README.md in the source project for current verification limits.{replaces_note}"
            f"{install_note(delivery, host, plugin['command'])}"
            f"{_install_steps(host, plugin, host == 'codex' and bool(codex_hooks(delivery, plugin['command'], plugin['name'])))}\n",
            encoding="utf-8")
        if host == "claude-code":
            (root / ".claude-plugin").mkdir()
            (root / ".claude-plugin" / "plugin.json").write_text(json.dumps(plugin_doc, indent=2), encoding="utf-8")
            # The adapter folder is its own marketplace, so the host's install command accepts it as it is.
            marketplace = {"name": plugin["slug"], "owner": plugin_doc["author"],
                           "metadata": {"description": f"{plugin['name']}, installed from this folder"},
                           "plugins": [{"name": plugin["slug"], "source": "./",
                                        "description": plugin_doc["description"], "version": plugin["version"]}]}
            (root / ".claude-plugin" / "marketplace.json").write_text(json.dumps(marketplace, indent=2), encoding="utf-8")
            # Installing the plugin is the consent: what delivery.json declares is registered when it is enabled.
            registered = claude_code_hooks(delivery, plugin["command"], plugin["name"])
            module = write_claude_policy(root, plugin)
            if module:
                registered = registered or {}
                registered["modules"] = [module]
            if registered:
                (root / "hooks").mkdir(exist_ok=True)
                (root / "hooks" / "hooks.json").write_text(json.dumps(registered, indent=2), encoding="utf-8")
        elif host == "codex":
            # Both modern and compatibility entrypoints refer to the same packaged resources.
            portable = {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
                        "name": plugin["slug"], "version": plugin["version"],
                        "description": plugin_doc["description"]}
            (root / "plugin.json").write_text(json.dumps(portable, indent=2), encoding="utf-8")
            (root / ".codex-plugin").mkdir()
            compatibility = {"name": plugin["slug"], "version": plugin["version"],
                             "description": plugin_doc["description"], "skills": "./skills/"}
            (root / ".codex-plugin/plugin.json").write_text(json.dumps(compatibility, indent=2), encoding="utf-8")
            # The adapter folder is its own marketplace, so `codex plugin marketplace add` accepts it as it is.
            marketplace = {"name": plugin["slug"], "interface": {"displayName": plugin["name"]},
                           "plugins": [{"name": plugin["slug"], "source": {"source": "local", "path": "./"},
                                        "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
                                        "category": "Productivity"}]}
            (root / ".agents" / "plugins").mkdir(parents=True)
            (root / ".agents" / "plugins" / "marketplace.json").write_text(json.dumps(marketplace, indent=2),
                                                                         encoding="utf-8")
            registered = codex_hooks(delivery, plugin["command"], plugin["name"])
            if registered:
                (root / "hooks").mkdir()
                (root / "hooks/hooks.json").write_text(json.dumps(registered, indent=2), encoding="utf-8")
        elif host == "pi":
            write_pi_adapter(root, plugin, bool(policy))
        elif host == "opencode":
            write_opencode_adapter(root, plugin, bool(policy))
        elif host == "hermes":
            write_hermes_adapter(root, plugin, bool(policy))
