"""The generated Codex plugin delivers persistent developer instructions."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

import pytest

from muro import build_release


POLICY = 'Keep the full scope. Quotes " and ${data} are text; café remains intact.'


def prepare(project):
    manifest = json.loads((project / 'sources.json').read_text(encoding='utf-8'))
    manifest['plugin'].update(slug='policy-probe', command='policy-probe', name='Policy Probe')
    (project / 'sources.json').write_text(json.dumps(manifest), encoding='utf-8')
    delivery = {'decisions': [
        {'source': 'demo', 'content': 'Procedure', 'form': 'capability', 'targets': ['x'], 'reason': 'Task-specific.'},
        {'source': 'demo', 'content': 'Working rules', 'form': 'always-on', 'targets': [], 'reason': 'Every task.'},
    ], 'always_on': POLICY}
    (project / 'delivery.json').write_text(json.dumps(delivery), encoding='utf-8')


def test_codex_plugin_declares_instructions_for_every_session_boundary_and_subagent(portable_project, tmp_path):
    prepare(portable_project)
    release = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'release with spaces')
    root = release / 'adapters/codex'
    manifest = json.loads((root / 'plugin.json').read_text(encoding='utf-8'))
    assert manifest['name'] == 'policy-probe'
    hooks = json.loads((root / 'hooks/hooks.json').read_text(encoding='utf-8'))['hooks']
    assert set(hooks) == {'SessionStart', 'SubagentStart'}
    [session] = hooks['SessionStart']
    for event in ('startup', 'resume', 'clear', 'compact', 'fork'):
        assert re.fullmatch(session['matcher'], event)
    assert not re.fullmatch(session['matcher'], 'unrelated')
    [child] = hooks['SubagentStart']
    assert 'matcher' not in child
    for event, group in (('SessionStart', session), ('SubagentStart', child)):
        [hook] = group['hooks']
        assert hook['type'] == 'command'
        env = dict(os.environ, PLUGIN_ROOT=str(root))
        command = ([shutil.which('powershell'), '-NoProfile', '-Command', hook['command'] + '; exit $LASTEXITCODE']
                   if os.name == 'nt' else ['sh', '-c', hook['command']])
        result = subprocess.run(command, cwd=tmp_path, env=env, capture_output=True, encoding='utf-8')
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout) == {'hookSpecificOutput': {
            'hookEventName': event, 'additionalContext': POLICY,
        }}
    launcher = root / 'skills/policy-probe/muro.py'
    for _ in range(2):
        result = subprocess.run([sys.executable, str(launcher), 'session-context'], cwd=tmp_path,
                                capture_output=True, encoding='utf-8')
        assert result.returncode == 0, result.stderr
        assert result.stdout.strip() == POLICY
    note = (root / 'INSTALL.md').read_text(encoding='utf-8')
    assert 'developer' in note and 'trust' in note
    assert 'does not register' not in note


def test_broken_session_policy_reports_failure_instead_of_silently_going_missing(portable_project, tmp_path):
    prepare(portable_project)
    release = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'release')
    root = release / 'adapters/codex/skills/policy-probe'
    (root / 'delivery.json').write_text('{broken', encoding='utf-8')
    result = subprocess.run([sys.executable, str(root / 'muro.py'), 'session-context'], cwd=tmp_path,
                            capture_output=True, encoding='utf-8')
    assert result.returncode != 0
    assert 'delivery' in result.stderr.lower()
    assert not result.stdout


@pytest.mark.parametrize('event', ['SessionStart', 'SubagentStart'])
@pytest.mark.parametrize('policy', ['{"rule":"Preserve scope"}', '[Keep every requested outcome.]'])
def test_hook_output_envelopes_json_looking_policy_as_context(portable_project, tmp_path, event, policy):
    prepare(portable_project)
    delivery_path = portable_project / 'delivery.json'
    delivery = json.loads(delivery_path.read_text(encoding='utf-8'))
    delivery['always_on'] = policy
    delivery_path.write_text(json.dumps(delivery), encoding='utf-8')
    release = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'release')
    launcher = release / 'adapters/codex/skills/policy-probe/muro.py'
    result = subprocess.run([sys.executable, str(launcher), 'session-context', '--hook-event', event],
                            cwd=tmp_path, capture_output=True, encoding='utf-8')
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout) == {'hookSpecificOutput': {
        'hookEventName': event, 'additionalContext': policy,
    }}
