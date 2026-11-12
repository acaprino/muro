"""Execute the generated Hermes plugin at its native registration boundary.

The recorder models the documented PluginContext calls; it is a contract test,
not a live Hermes conversation or a claim about model behavior.
"""
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess

import pytest


PLUGIN = {"slug": "observatory", "command": "observe", "name": "Observatory", "version": "1.2.3"}


class Context:
    """The native API accepts read-only skills and rejects duplicate section IDs."""

    def __init__(self):
        self.skills = {}
        self.sections = {}

    def register_skill(self, name, path):
        assert isinstance(path, Path) and path.is_file()
        self.skills[name] = path

    def register_system_prompt_section(self, identifier, content, *, position, max_chars):
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", identifier):
            raise ValueError("system prompt section id must be at most 128 lowercase characters")
        if identifier in self.sections:
            raise ValueError(f"system prompt section {identifier!r} is already registered")
        assert isinstance(content, str)
        assert position == "after_memory" and 0 < len(content) <= max_chars <= 4000
        self.sections[identifier] = content


def plugin_root(tmp_path, policy="Use the evidence already supplied."):
    root = tmp_path / "separate plugin with spaces"
    for name in ("observe", "observe-review"):
        folder = root / "skills" / name
        folder.mkdir(parents=True)
        (folder / "SKILL.md").write_text(f"---\nname: {name}\n---\nA skill.\n", encoding="utf-8")
    if policy is not None:
        (root / "policy.md").write_text(policy, encoding="utf-8")
    return root


def load_plugin(root, has_policy=True, plugin=None):
    from muro.hermes_adapter import write_hermes_adapter

    write_hermes_adapter(root, PLUGIN if plugin is None else plugin, has_policy)
    spec = importlib.util.spec_from_file_location("generated_hermes_policy", root / "__init__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_native_plugin_registers_packaged_skills_and_bounded_system_policy(tmp_path, monkeypatch):
    root = plugin_root(tmp_path)
    module = load_plugin(root)
    monkeypatch.chdir(tmp_path)
    ctx = Context()
    module.register(ctx)

    manifest = json.loads((root / "plugin.yaml").read_text(encoding="utf-8"))
    assert manifest["name"] == "observatory" and manifest["version"] == "1.2.3"
    assert set(ctx.skills) == {"observe", "observe-review"}
    assert ctx.sections == {"observatory.always-on": "Use the evidence already supplied."}


def test_long_slugs_use_stable_bounded_distinct_system_section_ids(tmp_path):
    identifiers = []
    for index, slug in enumerate(("a" * 120, "a" * 119 + "b", "a" * 120)):
        root = plugin_root(tmp_path / str(index))
        ctx = Context()
        load_plugin(root, plugin=dict(PLUGIN, slug=slug)).register(ctx)
        [identifier] = ctx.sections
        identifiers.append(identifier)
    assert identifiers[0] == identifiers[2]
    assert identifiers[0] != identifiers[1]
    assert all(re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", identifier) for identifier in identifiers)


def test_system_section_id_at_the_host_limit_keeps_its_original_name(tmp_path):
    ctx = Context()
    load_plugin(plugin_root(tmp_path), plugin=dict(PLUGIN, slug="a" * 118)).register(ctx)
    assert list(ctx.sections) == ["a" * 118 + ".always-on"]


def test_older_hermes_keeps_skills_and_warns_that_policy_is_inactive(tmp_path):
    class SkillsOnlyContext:
        def __init__(self):
            self.skills = {}

        def register_skill(self, name, path):
            self.skills[name] = path

    module = load_plugin(plugin_root(tmp_path))
    ctx = SkillsOnlyContext()
    with pytest.warns(RuntimeWarning, match="always-on policy is not active.*upgrade Hermes"):
        module.register(ctx)
    assert set(ctx.skills) == {"observe", "observe-review"}


def test_without_a_declared_policy_no_system_section_or_hook_is_registered(tmp_path):
    # A file left in the supplied directory cannot choose a delivery form.
    root = plugin_root(tmp_path, policy="Undeclared text must stay inactive.")
    ctx = Context()
    load_plugin(root, has_policy=False).register(ctx)
    assert set(ctx.skills) == {"observe", "observe-review"}
    assert ctx.sections == {}


def test_duplicate_registration_is_rejected_without_a_second_policy_copy(tmp_path):
    module = load_plugin(plugin_root(tmp_path))
    ctx = Context()
    module.register(ctx)
    with pytest.raises(ValueError, match="already registered"):
        module.register(ctx)
    assert ctx.sections == {"observatory.always-on": "Use the evidence already supplied."}


def test_policy_is_data_and_preserves_unicode_and_code_like_characters(tmp_path):
    policy = 'Rules: """ \' \\ ${HOME} $(touch marker)\nimport os; raise SystemExit(99)\nCittà 日本語'
    root = plugin_root(tmp_path, policy)
    ctx = Context()
    load_plugin(root).register(ctx)
    assert ctx.sections == {"observatory.always-on": policy}
    assert not (root / "marker").exists()


def test_only_real_skill_files_are_registered(tmp_path):
    root = plugin_root(tmp_path)
    absorbed = root / "skills" / "absorbed"
    absorbed.mkdir()
    (absorbed / "SKILL.source.md").write_text("An inert upstream source.", encoding="utf-8")
    ctx = Context()
    load_plugin(root).register(ctx)
    assert set(ctx.skills) == {"observe", "observe-review"}


@pytest.mark.parametrize("slug", ["observatory", "a" * 120])
def test_installed_hermes_registry_without_starting_a_session(tmp_path, slug):
    """Optional integration: explicit host paths, isolated home, no discovery or LLM."""
    python = os.environ.get("MURO_HERMES_PYTHON")
    source = os.environ.get("MURO_HERMES_SOURCE")
    if not python or not source:
        pytest.skip("Set MURO_HERMES_PYTHON and MURO_HERMES_SOURCE for the installed-host registry check")
    root = plugin_root(tmp_path)
    load_plugin(root, plugin=dict(PLUGIN, slug=slug))
    script = r'''
import importlib.util
import json
import os
from pathlib import Path
import sys
sys.path.insert(0, sys.argv[2])
from hermes_cli.plugins import PluginContext, PluginManager
from hermes_cli.plugins_manifest import parse_manifest_file
root = Path(sys.argv[1])
manifest = parse_manifest_file(root / "plugin.yaml", root, "user", "")
assert manifest is not None and manifest.name == sys.argv[3]
manager = PluginManager(scope_key=os.environ["HERMES_HOME"])
ctx = PluginContext(manifest, manager)
spec = importlib.util.spec_from_file_location("generated_hermes_policy", root / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)
plugin.register(ctx)
first = manager.render_system_prompt_sections({"session_id": "offline-check"})
second = manager.render_system_prompt_sections({"session_id": "offline-check"})
assert len(first) == len(second) == 1
assert first[0].content == second[0].content == "Use the evidence already supplied."
assert first[0].position == "after_memory"
assert set(manager._plugin_skills) == {manifest.name + ":observe", manifest.name + ":observe-review"}
try:
    plugin.register(ctx)
except ValueError as error:
    assert "already registered" in str(error)
else:
    raise AssertionError("Hermes must reject a duplicate section ID")
assert len(manager.render_system_prompt_sections({"session_id": "offline-check"})) == 1
assert manager._hooks == {} and manager._plugin_commands == {}
print(json.dumps({"skills": sorted(manager._plugin_skills), "sections": [s.id for s in second], "duplicate": "rejected"}))
'''
    environment = dict(os.environ, HERMES_HOME=str(tmp_path / "isolated-hermes-home"), PYTHONDONTWRITEBYTECODE="1")
    done = subprocess.run([python, "-B", "-c", script, str(root), source, slug], cwd=tmp_path,
                          env=environment, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert done.returncode == 0, done.stdout + done.stderr
    result = json.loads(done.stdout)
    [identifier] = result["sections"]
    assert re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", identifier)
    assert result["duplicate"] == "rejected"
    if slug == "observatory":
        assert identifier == "observatory.always-on"
