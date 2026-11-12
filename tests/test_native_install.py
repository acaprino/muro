"""An adapter is something a host can install with its own command (owner, 2026-11-12).

"Se installo Marionette in una harness" has to mean one documented command per host,
after which what `delivery.json` declares is active. The Claude Code and Codex adapters
were plugin folders with no marketplace manifest, so neither host could install them
permanently; `INSTALL.md` named no command. These tests cover the generated manifests
and the install steps. They prove file shape only: the real installs are recorded in
docs/verification/2026-11-12-policy-active-by-default-live.md.
"""
import json

from muro import build_release

HOSTS = ("claude-code", "codex", "pi", "opencode", "hermes")
TEXT = "Demo facts: this package verifies the requested test artifact."


def with_policy(project):
    (project / "delivery.json").write_text(json.dumps({
        "decisions": [
            {"source": "demo", "content": "The whole skill.", "form": "capability", "targets": ["x"],
             "reason": "One task-specific procedure."},
            {"source": "demo", "content": "A fact for every session.", "form": "always-on", "targets": [],
             "reason": "Fixture."},
        ],
        "always_on": TEXT,
    }), encoding="utf-8")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_claude_code_adapter_is_its_own_marketplace(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    root = release / "adapters" / "claude-code"
    market = read(root / ".claude-plugin" / "marketplace.json")
    plugin = read(root / ".claude-plugin" / "plugin.json")
    assert market["name"] == plugin["name"] == "muro"
    assert market["owner"]["name"]
    assert market["metadata"]["description"]
    # The plugin is the folder that holds the manifest: one folder, one install.
    assert market["plugins"] == [{"name": "muro", "source": "./", "description": plugin["description"],
                                  "version": plugin["version"]}]


def test_codex_adapter_is_its_own_marketplace(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    root = release / "adapters" / "codex"
    market = read(root / ".agents" / "plugins" / "marketplace.json")
    assert market["name"] == read(root / ".codex-plugin" / "plugin.json")["name"] == "muro"
    assert market["interface"]["displayName"] == "Muro"
    assert market["plugins"] == [{"name": "muro", "source": {"source": "local", "path": "./"},
                                  "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
                                  "category": "Productivity"}]


def test_hosts_without_a_marketplace_format_get_none(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    for host in ("pi", "opencode", "hermes"):
        assert not list((release / "adapters" / host).rglob("marketplace.json"))


def test_install_notes_name_the_host_command_and_what_is_active_after_it(portable_project, tmp_path):
    with_policy(portable_project)
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    notes = {host: (release / "adapters" / host / "INSTALL.md").read_text(encoding="utf-8") for host in HOSTS}
    for host in ("claude-code", "codex", "pi", "opencode"):
        assert "## Install" in notes[host], host
    assert "claude plugin marketplace add" in notes["claude-code"]
    assert "claude plugin install muro@muro" in notes["claude-code"]
    assert "claude --plugin-dir" in notes["claude-code"]
    assert "codex plugin marketplace add" in notes["codex"]
    assert "codex plugin add muro@muro" in notes["codex"]
    assert "pi install" in notes["pi"]
    assert "`plugins`" in notes["opencode"] and "opencode.json" in notes["opencode"] and "file:///" in notes["opencode"]
    # Three hosts need nothing after the install. Codex reviews a plugin's hooks first, and no package can skip that.
    for host in ("claude-code", "pi", "opencode"):
        assert "no further step" in notes[host], host
    assert "/hooks" in notes["codex"] and "trust" in notes["codex"]
    assert "not active on Codex until" in notes["codex"]
    assert "no further step" not in notes["codex"]


def test_codex_asks_for_no_review_when_the_release_registers_no_hook(portable_project, tmp_path):
    release = build_release(portable_project / "sources.json", portable_project, tmp_path / "out")
    note = (release / "adapters" / "codex" / "INSTALL.md").read_text(encoding="utf-8")
    assert "codex plugin add muro@muro" in note
    assert "/hooks" not in note and not (release / "adapters" / "codex" / "hooks").exists()
