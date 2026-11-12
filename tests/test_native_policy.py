"""Native host boundaries: generated packages preserve system instructions and skill discovery."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

from muro.native_policy import write_pi_adapter


PLUGIN = {"slug": "paper-crane", "command": "crane", "name": "Paper Crane", "version": "1.2.3"}
POLICY = 'Keep the complete scope.\nQuotes: " \' ` ${process.exit(91)}; </system>\nItaliano: è.'


def package(tmp_path, policy=True):
    root = tmp_path / "release with spaces è"
    skill = root / "skills" / "crane"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text('---\nname: crane\ndescription: "Use when: creating a document."\n---\n\n# Crane\nRun the packaged coordinator.\n', encoding="utf-8")
    entry = root / "skills" / "crane-review"
    entry.mkdir()
    (entry / "SKILL.md").write_text('---\nname: crane-review\ndescription: Use when reviewing a document.\n---\n\n# Review\nRun ../crane/muro.py.\n', encoding="utf-8")
    if policy:
        (root / "policy.md").write_text(POLICY, encoding="utf-8", newline="")
    return root


def node(tmp_path, root, source, *args):
    executable = shutil.which("node")
    if not executable:
        pytest.skip("Node is needed to execute native Pi/OpenCode package entrypoints")
    script = tmp_path / "host-boundary.mjs"
    script.write_text(source, encoding="utf-8")
    done = subprocess.run([executable, str(script), str(root), *map(str, args)], cwd=tmp_path,
                          capture_output=True, text=True, encoding="utf-8")
    assert done.returncode == 0, done.stderr or done.stdout
    return json.loads(done.stdout)


def test_pi_package_appends_a_system_section_on_every_run_without_growth(tmp_path):
    root = package(tmp_path)
    write_pi_adapter(root, PLUGIN, True)
    manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert manifest["pi"]["skills"] == ["./skills"]
    assert len(manifest["pi"]["extensions"]) == 1
    result = node(tmp_path, root, r'''
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const extension = (await import(pathToFileURL(path.join(root, manifest.pi.extensions[0])).href)).default;
const handlers = new Map();
extension({on: (event, fn) => handlers.set(event, fn)});
const base = {systemPrompt: 'HOST', systemPromptOptions: {customPrompt: 'HOST', sections: {other: 'OTHER'}}};
const snapshots = [];
// Repeated callbacks, second run, and serialized/restored options keep one policy section.
for (let index = 0; index < 4; index++) {
  const event = index === 2 ? structuredClone(base) : base;
  const result = await handlers.get('before_agent_start')(event);
  snapshots.push({result: result ?? null, sections: event.systemPromptOptions.sections, custom: event.systemPromptOptions.customPrompt});
}
console.log(JSON.stringify({events: [...handlers.keys()], snapshots}));
''')
    assert result["events"] == ["before_agent_start"]
    for snapshot in result["snapshots"]:
        assert snapshot["result"] is None
        assert snapshot["custom"] == "HOST"
        assert snapshot["sections"]["other"] == "OTHER"
        assert list(snapshot["sections"].values()).count(POLICY) == 1
        assert len(snapshot["sections"]) == 2


def test_opencode_package_registers_skills_and_system_policy_for_each_request_kind(tmp_path):
    from muro.native_policy import write_opencode_adapter
    root = package(tmp_path)
    write_opencode_adapter(root, PLUGIN, True)
    result = node(tmp_path, root, r'''
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const plugin = (await import(pathToFileURL(path.join(root, manifest.exports['.'])).href)).default;
const hooks = new Map();
const skills = [];
await plugin.setup({
  skill: {transform: async (f) => f({add: (skill) => skills.push(skill)})},
  session: {hook: async (event, f) => hooks.set(event, f)},
});
const snapshots = [];
for (const [kind, hook] of hooks) {
  // Repeated dispatch, second turn, fresh post-compaction request, resumed and child sessions.
  for (const sessionID of ['main', 'main', 'restored', 'child']) {
    const event = {sessionID, system: [{type:'text', text:'HOST'}], messages: [{role:'user', content:'TASK'}]};
    await hook(event);
    await hook(event);
    snapshots.push({kind, ...event});
  }
}
console.log(JSON.stringify({id: plugin.id, skills, kinds:[...hooks.keys()], snapshots}));
''')
    assert result["id"] == "paper-crane"
    assert result["kinds"] == ["context", "compaction", "generate", "title"]
    assert {skill["name"] for skill in result["skills"]} == {"crane", "crane-review"}
    for skill in result["skills"]:
        assert Path(skill["path"]).is_file()
        assert skill["content"].startswith("# ")
    assert result["skills"][0]["description"] == "Use when: creating a document."
    for snapshot in result["snapshots"]:
        assert snapshot["system"] == [{"type": "text", "text": "HOST"}, {"type": "text", "text": POLICY}]
        assert snapshot["messages"] == [{"role": "user", "content": "TASK"}]


def test_packages_without_policy_expose_skills_and_register_no_policy_handlers(tmp_path):
    from muro.native_policy import write_opencode_adapter
    root = package(tmp_path, policy=False)
    write_pi_adapter(root, PLUGIN, False)
    manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert manifest["pi"] == {"skills": ["./skills"], "extensions": []}
    assert not (root / "extensions").exists()
    write_opencode_adapter(root, PLUGIN, False)
    result = node(tmp_path, root, r'''
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const plugin = (await import(pathToFileURL(path.join(process.argv[2], 'index.js')).href)).default;
let hooks = 0;
let skills = 0;
await plugin.setup({skill: {transform: async (f) => f({add: () => skills++})}, session: {hook: () => hooks++}});
console.log(JSON.stringify({hooks, skills}));
''')
    assert result == {"hooks": 0, "skills": 2}


def test_pi_installed_loader_and_system_renderer_preserve_policy_across_runs(tmp_path):
    """Opt-in integration with an installed Pi distribution; no session, model call or config writes."""
    host_root = os.environ.get("MURO_TEST_PI_ROOT")
    if not host_root:
        pytest.skip("Set MURO_TEST_PI_ROOT to an installed pi-coding-agent distribution")
    root = package(tmp_path)
    write_pi_adapter(root, PLUGIN, True)
    result = node(tmp_path, root, r'''
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
const host = (file) => pathToFileURL(path.join(process.argv[3], 'dist', 'core', file)).href;
const { loadExtensions } = await import(host('extensions/loader.js'));
const { ExtensionRunner } = await import(host('extensions/runner.js'));
const { buildSystemPrompt, diffSystemPromptSections, buildSystemPromptSections } = await import(host('system-prompt.js'));
const loaded = await loadExtensions([path.join(root, 'extensions', 'policy.js')], process.cwd());
if (loaded.errors.length) throw new Error(JSON.stringify(loaded.errors));
const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, process.cwd(), {}, {});
const errors = [];
runner.onError((error) => errors.push(error));
const base = {cwd: process.cwd(), customPrompt: 'HOST SYSTEM', sections: {other: 'OTHER SYSTEM'}};
const trigger = {messageType: 'user', prompt: 'TASK'};
const first = await runner.emitBeforeAgentStart(trigger, base);
const second = await runner.emitBeforeAgentStart(trigger, base);
const restored = await runner.emitBeforeAgentStart(trigger, JSON.parse(JSON.stringify(second.systemPromptOptions)));
const rendered = [first, second, restored].map((state) => buildSystemPrompt(state.systemPromptOptions));
const delta = diffSystemPromptSections(buildSystemPromptSections(first.systemPromptOptions), buildSystemPromptSections(second.systemPromptOptions));
console.log(JSON.stringify({errors, rendered, delta: delta ?? null, messages: first.messages}));
''', host_root)
    assert result["errors"] == []
    assert result["delta"] is None
    assert result["messages"] == []
    for text in result["rendered"]:
        assert text.startswith("HOST SYSTEM")
        assert "OTHER SYSTEM" in text
        assert text.count(POLICY) == 1
