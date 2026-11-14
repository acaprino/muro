"""Release-specific offline documentation: data fidelity, safety and packaging."""
import json
from html.parser import HTMLParser

import pytest

from muro import build_release
from muro.runtime import Coordinator


class GuideParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.data_parts = []
        self.reading_data = False
        self.external_resources = []
        self.event_attributes = []
        self.ids = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.event_attributes.extend(key for key in attrs if key.startswith('on'))
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'script':
            self.scripts.append(attrs)
            self.reading_data = attrs.get('id') == 'guide-data'
        if tag in {'script', 'img', 'iframe', 'link', 'source', 'video', 'audio'}:
            self.external_resources.extend(attrs[key] for key in ('src', 'href')
                                           if key in attrs and not attrs[key].startswith('data:'))

    def handle_endtag(self, tag):
        if tag == 'script':
            self.reading_data = False

    def handle_data(self, data):
        if self.reading_data:
            self.data_parts.append(data)

    @property
    def payload(self):
        return json.loads(''.join(self.data_parts))


def read_guide(path):
    text = path.read_text(encoding='utf-8')
    parsed = GuideParser()
    parsed.feed(text)
    return text, parsed


def test_every_standalone_release_contains_the_same_current_guide(portable_project, tmp_path):
    release = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'release')
    guide = release / 'GUIDE.html'
    assert guide.is_file(), 'Every release must include its illustrative HTML guide'
    text, parsed = read_guide(guide)
    payload = parsed.payload
    coordinator = Coordinator(release, tmp_path / 'consumer')
    assert payload['catalog_digest'] == coordinator.digest
    assert [cap['id'] for cap in payload['capabilities']] == list(coordinator.capabilities)
    assert payload['capabilities'][0]['intents'] == coordinator.capabilities['x'].intents
    assert payload['examples'][0]['status'] == 'no_match'
    assert payload['examples'][0]['path'] == []
    assert 'cap-x' in parsed.ids
    assert not parsed.external_resources
    assert not parsed.event_attributes
    assert '__MURO_' not in text
    assert payload['graph_library']['name'] == 'Cytoscape.js'
    assert payload['graph_library']['version'] == '3.34.4'
    assert 'graph-library' in parsed.ids
    assert 'The Cytoscape Consortium' in text
    for host in ('claude-code', 'codex', 'pi', 'opencode', 'hermes'):
        skill = release / 'adapters' / host / 'skills' / 'muro'
        assert (skill / 'GUIDE.html').read_bytes() == guide.read_bytes()
        assert (skill / 'guide-examples.json').read_bytes() == (release / 'guide-examples.json').read_bytes()
        assert 'GUIDE.html' in (skill / 'SKILL.md').read_text(encoding='utf-8')
        assert 'GUIDE.html' in (release / 'adapters' / host / 'INSTALL.md').read_text(encoding='utf-8')
        assert (skill / 'muro' / 'vendor' / 'cytoscape' / 'LICENSE').is_file()


@pytest.mark.parametrize('filename', ['cytoscape.min.js', 'LICENSE'])
def test_changed_vendored_library_or_license_blocks_release(portable_project, tmp_path, monkeypatch, filename):
    import shutil
    from muro import guide
    vendor = tmp_path / 'vendor'
    shutil.copytree(guide.GRAPH_VENDOR, vendor)
    (vendor / filename).write_text('Unreviewed bytes', encoding='utf-8')
    monkeypatch.setattr(guide, 'GRAPH_VENDOR', vendor)
    out = tmp_path / 'release'
    with pytest.raises(ValueError, match='reviewed pin'):
        build_release(portable_project / 'sources.json', portable_project, out)
    assert not (out / 'muro').exists()
    assert not (out / '.muro.muro-build').exists()


def test_next_release_regenerates_guide_instead_of_reusing_old_content(portable_project, tmp_path):
    first = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'first')
    first_bytes = (first / 'GUIDE.html').read_bytes()
    _, old = read_guide(first / 'GUIDE.html')
    cap = portable_project / 'capabilities' / 'x.md'
    cap.write_text(cap.read_text(encoding='utf-8').replace('Verify the requested test artifact.',
                                                        'Reconcile the requested inventory evidence.'), encoding='utf-8')
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))
    manifest['plugin'] = {'slug': 'atlas', 'name': 'Atlas', 'command': 'assist', 'version': '2.1.3'}
    (portable_project / 'sources.json').write_text(json.dumps(manifest), encoding='utf-8')

    second = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'second')

    text, current = read_guide(second / 'GUIDE.html')
    assert second.name == 'atlas'
    assert current.payload['plugin'] == manifest['plugin']
    assert '/assist' in text
    assert current.payload['catalog_digest'] != old.payload['catalog_digest']
    assert current.payload['capabilities'][0]['intents'][0]['description'] == 'Reconcile the requested inventory evidence.'
    assert (first / 'GUIDE.html').read_bytes() == first_bytes
    assert (second / 'adapters' / 'codex' / 'skills' / 'assist' / 'GUIDE.html').is_file()


def test_source_content_is_text_not_executable_html_or_template_instructions(portable_project):
    from muro.guide import write_release_guide
    payload = '</script><img src="https://example.invalid/leak" onerror="alert(1)"> __MURO_CONTENT__ & \u2028'
    cap = portable_project / 'capabilities' / 'x.md'
    content = cap.read_text(encoding='utf-8')
    content = content.replace('Verify the requested test artifact.', json.dumps(payload)[1:-1])
    cap.write_text(content + '\n' + payload, encoding='utf-8')
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))
    manifest['plugin']['name'] = payload

    result = write_release_guide(portable_project, manifest['plugin'], manifest['sources'])

    text, parsed = read_guide(result)
    assert parsed.payload['plugin']['name'] == payload
    assert parsed.payload['capabilities'][0]['intents'][0]['description'] == payload
    assert parsed.payload['capabilities'][0]['body'].endswith(payload.strip())
    assert not parsed.event_attributes and not parsed.external_resources
    assert '&lt;img' in text
    assert sum(script.get('id') == 'guide-data' for script in parsed.scripts) == 1
    assert len(parsed.ids) == len(set(parsed.ids))


def test_sources_registry_shows_where_each_source_comes_from(portable_project):
    # Owner, 2026-11-14: the registry of origins (name, starting version, link, licence) is visible in the guide.
    from muro.guide import write_release_guide
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))
    source = manifest['sources'][0]
    source.update(repo_url='https://github.com/example/demo.git', copyright='Copyright (c) 2026 Example <b>Author</b>')
    local = dict(source, id='local-only', repo_url='file:///C:/private/checkout')
    local.pop('copyright')

    text, parsed = read_guide(write_release_guide(portable_project, manifest['plugin'], [source, local]))

    assert '<a href="https://github.com/example/demo.git" rel="noopener noreferrer">' in text
    assert 'Copyright (c) 2026 Example &lt;b&gt;Author&lt;/b&gt;' in text
    assert parsed.payload['sources'][0]['repo_url'] == 'https://github.com/example/demo.git'
    assert parsed.payload['sources'][0]['copyright'].startswith('Copyright (c) 2026 Example')
    # Only a public web address is shown or stored: a local checkout path stays out of the page.
    assert 'private/checkout' not in text and 'repo_url' not in parsed.payload['sources'][1]
    assert not parsed.external_resources and not parsed.event_attributes


def test_guide_failure_cannot_publish_a_partial_release(portable_project, tmp_path, monkeypatch):
    def fail(*args):
        raise ValueError('Guide generation failed')

    monkeypatch.setattr('muro.release.write_release_guide', fail)
    out = tmp_path / 'output'
    with pytest.raises(ValueError, match='Guide generation failed'):
        build_release(portable_project / 'sources.json', portable_project, out)
    assert not (out / 'muro').exists()
    assert not (out / '.muro.muro-build').exists()


def test_new_domains_and_relationships_are_copied_without_semantic_inference(portable_project):
    from muro.guide import write_release_guide
    from routing_helpers import INTENTS
    cap = portable_project / 'capabilities' / 'y.md'
    cap.write_text('---\n' + INTENTS.replace('conflicts: []', 'conflicts: ["x"]') +
                   'id: y\nrole: testing\nwhen: stack:archive\nafter: []\noutputs: ["y"]\n'
                   'checks: ["reviewed"]\n---\n# Geological archive\n## Sources\nSource: demo\n', encoding='utf-8')
    router = portable_project / 'ROUTER.md'
    router.write_text(router.read_text(encoding='utf-8') +
                      '| y | testing | stack:archive | — | y | testing.verify |\n', encoding='utf-8')
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))

    _, parsed = read_guide(write_release_guide(portable_project, manifest['plugin'], manifest['sources']))

    entries = {cap['id']: cap for cap in parsed.payload['capabilities']}
    assert entries['y']['title'] == 'Geological archive'
    assert entries['y']['after'] == []  # Shared roles and intents cannot create dependency edges.
    assert entries['y']['conflicts'] == ['x']
    assert entries['x']['conflicts'] == []  # Preserve asymmetric declared metadata verbatim.
    assert entries['y']['when'] == 'stack:archive'
    assert entries['y']['outputs'] == ['y'] and entries['y']['checks'] == ['reviewed']


def test_guide_digest_uses_packaged_notice_body_not_original_sources(portable_project):
    from muro.guide import write_release_guide
    cap = portable_project / 'capabilities' / 'x.md'
    content = cap.read_text(encoding='utf-8').replace('---\n## Sources',
        '---\n<!-- Modified by Muro; see LICENSES and NOTICE.md. -->\n## Sources')
    cap.write_text(content, encoding='utf-8')
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))

    _, parsed = read_guide(write_release_guide(portable_project, manifest['plugin'], manifest['sources']))

    assert parsed.payload['catalog_digest'] == Coordinator(portable_project, portable_project / 'consumer').digest
    assert 'Modified by Muro' in parsed.payload['capabilities'][0]['body']


def test_explicit_example_path_expands_only_declared_prerequisites(portable_project):
    from muro.guide import write_release_guide
    from routing_helpers import INTENTS
    cap = portable_project / 'capabilities' / 'y.md'
    cap.write_text('---\n' + INTENTS +
                   'id: y\nrole: synthesis\nwhen: —\nafter: ["x"]\noutputs: ["y"]\n'
                   'checks: ["reviewed"]\n---\n# Synthesis\n## Sources\nSource: demo\n', encoding='utf-8')
    router = portable_project / 'ROUTER.md'
    router.write_text(router.read_text(encoding='utf-8') +
                      '| y | synthesis | — | x | y | testing.verify |\n', encoding='utf-8')
    example = {'title': 'An explicitly selected synthesis', 'task': 'Synthesize the supplied evidence',
               'status': 'selected', 'stack_tokens': [], 'questions': [], 'reason': 'Fixture decision.',
               'selections': [{'capability': 'y', 'intent': 'testing.verify', 'reason': 'Fixture selection.'}]}
    (portable_project / 'guide-examples.json').write_text(json.dumps({'examples': [example]}), encoding='utf-8')
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))

    _, parsed = read_guide(write_release_guide(portable_project, manifest['plugin'], manifest['sources']))

    result = parsed.payload['examples'][0]
    assert result['path'] == ['x', 'y']
    assert result['selections'] == example['selections']
    assert result['reason'] == example['reason']


@pytest.mark.parametrize('invalid', ['missing-file', 'empty', 'unknown-capability', 'unknown-intent', 'bad-stack'])
def test_missing_or_invalid_examples_block_release_without_partial_output(portable_project, tmp_path, invalid):
    example_file = portable_project / 'guide-examples.json'
    if invalid == 'missing-file':
        example_file.rename(portable_project / 'examples-held-aside.json')
    else:
        example = {'title': 'Example', 'task': 'Use the fixture capability', 'stack_tokens': [],
                   'status': 'selected', 'questions': [], 'reason': 'Fixture selection.',
                   'selections': [{'capability': 'x', 'intent': 'testing.verify', 'reason': 'Fixture.'}]}
        if invalid == 'unknown-capability':
            example['selections'][0]['capability'] = 'missing'
        elif invalid == 'unknown-intent':
            example['selections'][0]['intent'] = 'missing.intent'
        elif invalid == 'bad-stack':
            example['stack_tokens'] = ['intent:keyword']
        example_file.write_text(json.dumps({'examples': [] if invalid == 'empty' else [example]}), encoding='utf-8')
    out = tmp_path / 'release'
    with pytest.raises((OSError, ValueError)):
        build_release(portable_project / 'sources.json', portable_project, out)
    assert not (out / 'muro').exists()
    assert not (out / '.muro.muro-build').exists()
