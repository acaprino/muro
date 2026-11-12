"""Claude's native prompt composition is additive, including on a second pass."""
import json
import os
import shutil
import subprocess

import pytest

from muro.claude_adapter import write_claude_policy


PLUGIN = {"slug": "ponytail", "name": "Ponytail", "command": "ponytail"}


def compose(root, *, sections, policy, event=None):
    """Exercise the emitted public register(on) boundary with Claude-shaped data."""
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is required to execute the emitted ES module")
    (root / "policy.md").write_text(policy, encoding="utf-8")
    module = write_claude_policy(root, PLUGIN)
    assert module
    runner = r'''
import { pathToFileURL } from 'node:url';
const { register } = await import(pathToFileURL(process.argv[1]).href);
const input = JSON.parse(process.argv[2]);
const handlers = [];
register((name, handler) => handlers.push({name, handler}));
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
let received;
const base = freeze({sections: input.sections, preserved: 'host-result'});
const result = await handlers[0].handler({}, freeze(input.event), async event => {
  received = event;
  return base;
});
process.stdout.write(JSON.stringify({
  events: handlers.map(handler => handler.name), result, received, base
}));
'''
    invocation = subprocess.run(
        [node, "--input-type=module", "-e", runner, str(root / "hooks" / module),
         json.dumps({"sections": sections, "event": event or {"traits": ["print"]}})],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(invocation.stdout)


def test_policy_appends_to_the_native_prompt_without_replacing_host_or_user_sections(tmp_path):
    sections = [
        {"id": "intro", "text": "Claude's identity and tool guidance.", "scope": "shared"},
        {"id": "tone", "text": "The user's chosen output style.", "scope": "session"},
        {"id": "another:policy", "text": "Another plugin's instructions.", "scope": "session"},
    ]
    policy = '# Ponytail policy\nKeep the user\'s "yes". Unicode: più.\n${literal} `literal`\n'
    event = {"model": "host-model", "traits": ["print"], "outputStyle": {"name": "user-style"}}

    answer = compose(tmp_path, sections=sections, policy=policy, event=event)

    assert answer["events"] == ["prompt.compose"]
    assert answer["received"] == event
    assert answer["base"]["sections"] == sections
    assert answer["result"] == {
        "preserved": "host-result",
        "sections": [*sections, {"id": "ponytail:policy", "text": policy, "scope": "session"}],
    }


def test_recomposition_replaces_only_its_own_section_once(tmp_path):
    first = compose(tmp_path, sections=[], policy="The original policy.")
    other = {"id": "neighbor:policy", "text": "Keep this.", "scope": "session"}
    sections = [*first["result"]["sections"], other]

    answer = compose(tmp_path, sections=sections, policy="The revised policy.",
                     event={"traits": ["teammate"]})

    assert answer["result"]["sections"] == [
        other,
        {"id": "ponytail:policy", "text": "The revised policy.", "scope": "session"},
    ]


@pytest.mark.parametrize("policy", [None, "", " \n\t"])
def test_missing_or_empty_policy_emits_no_module_or_host_configuration(tmp_path, policy):
    if policy is not None:
        (tmp_path / "policy.md").write_text(policy, encoding="utf-8")
    before = sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*"))

    assert write_claude_policy(tmp_path, PLUGIN) is None

    assert sorted(path.relative_to(tmp_path) for path in tmp_path.rglob("*")) == before


def test_emitted_module_passes_claudes_offline_plugin_validation_and_composition(tmp_path):
    claude = shutil.which("claude")
    if not claude:
        pytest.skip("Claude Code is required for its offline native module checks")
    version = subprocess.run([claude, "--version"], capture_output=True, text=True, check=True)
    parts = version.stdout.split()[0].split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts) or tuple(map(int, parts)) < (2, 1, 287):
        pytest.skip("Claude Code 2.1.287 or later is required for mods")
    root = tmp_path / "plugin"
    root.mkdir()
    (root / "policy.md").write_text("Keep the user's existing choices.", encoding="utf-8")
    module = write_claude_policy(root, PLUGIN)
    (root / ".claude-plugin").mkdir()
    (root / ".claude-plugin" / "plugin.json").write_text(json.dumps({
        "name": "ponytail", "version": "0.0.0", "description": "Native policy composition fixture",
        "author": {"name": "Muro tests"},
    }), encoding="utf-8")
    (root / "hooks" / "hooks.json").write_text(json.dumps({"modules": [module]}), encoding="utf-8")
    (root / "tests").mkdir()
    (root / "tests" / "policy.test.ts").write_text('''import { expect, test } from 'claude-code/testing';
test('the native compose chain retains host instructions', async ($, on) => {
  on('prompt.compose', () => ({ sections: [
    { id: 'intro', text: 'Native host identity.', scope: 'shared' },
    { id: 'tone', text: 'User-selected output style.', scope: 'session' }
  ] }));
  const prompt = await $.prompt.compose({
    model: 'test-model', promptModel: 'test-model', surfaces: [], tools: [],
    outputStyle: null, traits: ['print']
  });
  expect(prompt.sections).toEqual([
    { id: 'intro', text: 'Native host identity.', scope: 'shared' },
    { id: 'tone', text: 'User-selected output style.', scope: 'session' },
    { id: 'ponytail:policy', text: "Keep the user's existing choices.", scope: 'session' }
  ]);
});
''', encoding="utf-8")
    env = dict(os.environ, CLAUDE_CONFIG_DIR=str(tmp_path / "claude-config"),
               CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1")
    validation = subprocess.run([claude, "plugin", "validate", str(root), "--strict"],
                                env=env, capture_output=True, text=True, encoding="utf-8")
    assert validation.returncode == 0, validation.stdout + validation.stderr
    assert "prompt.compose" in validation.stdout
    native = subprocess.run([claude, "plugin", "test", str(root)],
                            env=env, capture_output=True, text=True, encoding="utf-8")
    assert native.returncode == 0, native.stdout + native.stderr
