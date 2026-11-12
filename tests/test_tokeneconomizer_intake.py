"""Integration contract for the tokeneconomizer intake (session cost control).

Pinned at release v0.1.0 (ec8ff5ec). The source is a hook-driven plugin: its six
default hooks are `host-approved` catalog entries here, and the capability registers
them only on the user's explicit request. Since ADR-0016 a release may register hooks
by itself when the package's delivery.json declares them; Marionette's does not. Runtime decisions below are explicit host-AI
response fixtures, not evidence of AI classification quality.
"""
import json
import shutil
from pathlib import Path

import pytest

from muro import build_release, parse_capabilities, parse_router
from muro.entries import validate_entries
from muro.runtime import Coordinator
from routing_helpers import decision

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "examples" / "marionette"
COMMIT = "ec8ff5ec7ed5924520ee71b705a920ee64fe2918"
HELPERS = "<package_root>/scripts/tokeneconomizer"
EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "SessionEnd"]


def source():
    manifest = json.loads((PACKAGE / "sources.json").read_text(encoding="utf-8"))
    return manifest, next(s for s in manifest["sources"] if s["id"] == "tokeneconomizer")


def capability():
    return next(cap for cap in parse_capabilities(PACKAGE / "capabilities") if cap.id == "token-economy")


def test_manifest_pins_the_published_release_and_leaves_host_wiring_out():
    manifest, src = source()
    assert src["repo_url"] == "https://github.com/microsoft/TokenEconomizer"
    assert (src["pin"], src["release"], src["commit"]) == ("release", "v0.1.0", COMMIT)
    assert src["license"] == "Apache-2.0"
    selected = src["selected_paths"]
    assert "tokeneconomizer/**" in selected and "plugin/scripts/te_bootstrap.py" in selected
    assert "plugin/hooks/hooks.json" in selected            # packaged as reference data, never at a plugin root
    for path in ("plugin/.claude-plugin/**", ".claude-plugin/**", "plugin/slash-commands/**", "plugin/codex-skills/**",
                 "plugin/pi/**", "experiments/**", "tests/**"):
        assert path in src["excluded_paths"]
    assert not any(p.startswith("plugin/.") or "slash-commands" in p for p in selected)
    assert src["intake"]["goal"] and all(dep["bundled"] is False for dep in src["runtime_deps"])
    assert "tokeneconomizer" in manifest["plugin"]["replaces"]   # an installed original would run its hooks twice


def test_capability_matches_the_router_and_catalogs_six_passive_hooks():
    cap = capability()
    row = next(row for row in parse_router(PACKAGE / "ROUTER.md") if row.id == "token-economy")
    assert cap.role == row.role == "session-cost-control"
    assert [intent["id"] for intent in cap.intents] == ["cost.economy-report", "cost.tool-pruning", "cost.economy-settings"]
    assert all(intent["excludes"] for intent in cap.intents)
    assert cap.when == "—" and cap.after == [] and cap.needs == [] and cap.conflicts == [] and cap.resumable is False
    assert [hook["event"] for hook in cap.hooks] == EVENTS
    assert all(hook["policy"] == "host-approved" and hook["tools"] == ["shell", "host-hooks"] for hook in cap.hooks)
    tools = {tool["name"]: tool["required"] for tool in cap.tools}
    assert tools == {"shell": True, "file-access": True, "host-hooks": False}   # commands work without the hooks
    assert f"tokeneconomizer (microsoft/TokenEconomizer@{COMMIT[:8]}, release v0.1.0)" in cap.body
    for check in cap.checks:
        assert f"**{check}**" in cap.body


def test_body_never_changes_anything_without_a_request_and_discloses_before_activating():
    body = capability().body
    assert f'python "{HELPERS}/plugin/scripts/te_bootstrap.py" cli --cwd' in body
    assert "never add them yourself" in body
    assert "only when the user asks to activate it" in body and "This plugin never registers them by itself" in body
    disclose, register = body.index("First say, in plain words"), body.index("After the user confirms")
    assert disclose < register
    for effect in ("~/.tokeneconomizer", "deny list", "judge model", "digests", "Claude Code 2.1.300 to 2.1.310", "Windows"):
        assert effect in body[disclose:register], effect
    assert "Remove exactly the entries" in body and "refuse to write a file that does not parse" in body
    assert "both run" in body                                   # the installed original must be off


def test_every_helper_path_named_by_the_capability_is_selected():
    import re
    _, src = source()
    names = set(re.findall(re.escape(HELPERS) + r"/([A-Za-z0-9_./-]+\.(?:py|json|md))", capability().body))
    assert names == {"plugin/scripts/te_bootstrap.py", "plugin/hooks/hooks.json", "docs/PLUGIN.md", "plugin/README.md"}
    assert names <= set(src["selected_paths"])


@pytest.fixture(scope="module")
def release(tmp_path_factory):
    """One real build for the module: it verifies every pinned remote, so it is slow."""
    return build_release(PACKAGE / "sources.json", PACKAGE, tmp_path_factory.mktemp("release") / "out")


def test_release_packages_the_engine_and_keeps_the_hooks_passive(release):
    helper = release / "scripts" / "tokeneconomizer"
    assert (helper / "tokeneconomizer" / "plugin" / "__init__.py").is_file()
    assert (helper / "plugin" / "scripts" / "te_bootstrap.py").is_file()
    upstream = json.loads((helper / "plugin" / "hooks" / "hooks.json").read_text(encoding="utf-8"))
    assert sorted(upstream["hooks"]) == sorted(EVENTS)            # the catalog lists exactly what upstream wires
    for host in ("claude-code", "codex", "pi", "opencode", "hermes"):
        root = release / "adapters" / host
        # Other sources may register native policy. TokenEconomizer itself stays
        # passive: its reference hooks live under scripts, with no active wiring.
        delivery = json.loads((root / "skills" / "marionette" / "delivery.json").read_text(encoding="utf-8"))
        assert not any(wiring["capability"] == "token-economy" for wiring in delivery.get("hooks", []))
        assert not any(item["source"] == "tokeneconomizer" and item["form"] == "hook"
                       for item in delivery["decisions"])
        for registered in (root / "hooks" / "hooks.json", root / "skills" / "marionette" / "hooks" / "hooks.json"):
            if registered.is_file():
                wiring = registered.read_text(encoding="utf-8")
                assert "te_bootstrap.py" not in wiring and "scripts/tokeneconomizer" not in wiring
        assert (root / "skills" / "marionette" / "scripts" / "tokeneconomizer" / "plugin" / "scripts" / "te_bootstrap.py").is_file()
        install = (root / "INSTALL.md").read_text(encoding="utf-8")
        assert "`tokeneconomizer`" in install and "marionette-token-economy" in install
    notice = (release / "NOTICE.md").read_text(encoding="utf-8")
    assert "tokeneconomizer — Apache-2.0" in notice and (release / "LICENSES" / "tokeneconomizer.txt").is_file()


def test_packaged_engine_answers_from_the_release_without_touching_the_users_state(release, tmp_path):
    import os
    import subprocess
    import sys
    bootstrap = release / "scripts" / "tokeneconomizer" / "plugin" / "scripts" / "te_bootstrap.py"
    home, repo = tmp_path / "te-home", tmp_path / "repo"
    repo.mkdir()
    env = {**os.environ, "TOKENECONOMIZER_HOME": str(home)}
    status = subprocess.run([sys.executable, str(bootstrap), "cli", "--cwd", str(repo), "status"],
                            capture_output=True, text=True, encoding="utf-8", env=env)
    assert status.returncode == 0 and "0 folded" in status.stdout and str(home) in status.stdout
    payload = json.dumps({"hook_event_name": "SessionStart", "session_id": "contract-1", "cwd": str(repo)})
    hook = subprocess.run([sys.executable, str(bootstrap), "hook"], input=payload,
                          capture_output=True, text=True, encoding="utf-8", env=env)
    assert hook.returncode == 0 and json.loads(hook.stdout) == {}
    broken = subprocess.run([sys.executable, str(bootstrap), "hook"], input="not json",
                            capture_output=True, text=True, encoding="utf-8", env=env)
    assert broken.returncode == 0 and json.loads(broken.stdout) == {}      # fails open
    assert (home / "sessions" / "claude" / "contract-1.json").is_file()


def test_token_economy_is_one_direct_step_and_has_its_own_discovery_entry(tmp_path):
    package = tmp_path / "package"
    package.mkdir()
    for directory in ("capabilities", "prompts"):
        shutil.copytree((PACKAGE if directory == "capabilities" else ROOT) / directory, package / directory)
    shutil.copy2(PACKAGE / "ROUTER.md", package / "ROUTER.md")
    coordinator = Coordinator(package, tmp_path / "consumer")
    answer = decision(coordinator, "Cosa ha imparato TokenEconomizer qui?", ["token-economy"], set())
    answer["selections"][0]["intent"] = "cost.economy-report"
    result = coordinator.propose("Cosa ha imparato TokenEconomizer qui?", set(), classification=answer)
    assert result["mode"] == "direct" and result["capability"] == "token-economy"
    manifest, _ = source()
    document = json.loads((PACKAGE / "entries.json").read_text(encoding="utf-8"))
    assert validate_entries(document, parse_capabilities(PACKAGE / "capabilities"), manifest["plugin"]) == []
    entry = next(e for e in document["entries"] if e["name"] == "marionette-token-economy")
    assert entry["capabilities"] == ["token-economy"]
