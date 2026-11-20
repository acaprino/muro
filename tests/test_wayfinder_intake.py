"""Runtime dependency closure read from Wayfinder v1.3.2 (2026-11-20).

The independent expected paths below are the files the pinned methods require,
not a list derived from Marionette's selection. No network or LLM is used here.
The verified upstream blob inventory is recorded in docs/verification.
"""
import json
from pathlib import Path
import re

import pytest

from muro.sources import _covers, parse_capabilities


PACKAGE = Path(__file__).resolve().parent.parent / 'examples' / 'marionette'
PIN = 'd1478fcb140db0b93c0c8df17bcfd311844749d0'
REQUIRED = (
    'skills/productivity/grilling/SKILL.md',
    'skills/engineering/domain-modeling/SKILL.md',
    'skills/engineering/domain-modeling/GLOSSARY-FORMAT.md',
    'skills/engineering/domain-modeling/ADR-FORMAT.md',
    'skills/engineering/prototype/SKILL.md',
    'skills/engineering/prototype/LOGIC.md',
    'skills/engineering/prototype/UI.md',
    'skills/engineering/implement/SKILL.md',
    'skills/engineering/tdd/SKILL.md',
    'skills/engineering/tdd/tests.md',
    'skills/engineering/tdd/mocking.md',
    'skills/engineering/code-review/SKILL.md',
    'skills/engineering/codebase-design/SKILL.md',
    'skills/engineering/codebase-design/DEEPENING.md',
    'skills/engineering/codebase-design/DESIGN-IT-TWICE.md',
)


def source():
    manifest = json.loads((PACKAGE / 'sources.json').read_text(encoding='utf-8'))
    return next(item for item in manifest['sources'] if item['id'] == 'wayfinder')


@pytest.mark.parametrize('path', REQUIRED)
def test_wayfinder_carries_every_required_runtime_method_and_reference(path):
    src = source()
    assert (src['pin'], src['release'], src['commit']) == ('release', 'v1.3.2', PIN)
    assert any(_covers(path, pattern) for pattern in src['selected_paths'])
    assert not any(_covers(path, pattern) for pattern in src.get('intake_only_paths', []))
    assert not any(_covers(path, pattern) for pattern in src['excluded_paths'])
    assert not any(_covers(path, pattern) for omission in src.get('omissions', []) for pattern in omission['paths'])


def test_work_map_loads_the_four_methods_and_the_implementation_dependencies():
    body = next(cap.body for cap in parse_capabilities(PACKAGE / 'capabilities') if cap.id == 'work-map')
    active, _, provenance = body.partition('\n## Sources')
    paths = set(re.findall(r'<package_root>/scripts/wayfinder/([^`]+)', active))
    for path in REQUIRED:
        if path.endswith('/SKILL.md'):
            assert path.replace('/SKILL.md', '/SKILL.source.md') in paths, path
    assert 'were never read' not in provenance
    assert 'those skills are not selected' not in body
    assert 'same pin' in provenance


def test_source_methods_have_one_owner_and_preserve_human_decisions():
    body = next(cap.body for cap in parse_capabilities(PACKAGE / 'capabilities') if cap.id == 'work-map')
    assert 'never as separately activated source skills' in body
    assert 'The user chooses the answer to this HITL item' in body
    assert 'including uncommitted work' in body
    assert 'Ponytail\'s production verification' in body


def test_wayfinder_delivery_records_the_selected_methods_instead_of_unread_fallbacks():
    delivery = json.loads((PACKAGE / 'delivery.json').read_text(encoding='utf-8'))
    decisions = [row for row in delivery['decisions'] if row['source'] == 'wayfinder']
    capability = next(row for row in decisions if row['form'] == 'capability')
    assert capability['targets'] == ['work-map']
    for method in ('grilling', 'domain-modeling', 'prototype', 'implement', 'tdd', 'code-review', 'codebase-design'):
        assert method in capability['content']
    assert not any('unselected grilling' in row['reason'] for row in decisions)
