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


# --- The panel of API keys (owner, 2026-11-24: "questo va nella guida chiaramente") --------------------------------
# `credentials` of delivery.json is declared data. The guide shows it at once, outside the collapsed reference data,
# ordered by `rank` alone, and a package that declares none gets the page it always had.

from datetime import datetime as _real_datetime


class _Frozen:
    @staticmethod
    def now(tz=None):
        return _real_datetime(2026, 11, 24, 12, 0, 0, tzinfo=tz)


_VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.items = tag, dict(attrs), parent, []

    def walk(self):
        yield self
        for item in self.items:
            if isinstance(item, Node):
                yield from item.walk()

    def ancestors(self):
        node = self.parent
        while node is not None:
            yield node
            node = node.parent

    def text(self):
        return ''.join(item if isinstance(item, str) else item.text() for item in self.items)

    def find(self, tag, **attrs):
        return [node for node in self.walk() if node.tag == tag and all(node.attrs.get(k) == v for k, v in attrs.items())]

    def classes(self):
        return (self.attrs.get('class') or '').split()


class Tree(HTMLParser):
    """The page as a tree: enough to ask where an element sits, which the flat GuideParser cannot."""
    def __init__(self):
        super().__init__()
        self.root = Node('#document', {}, None)
        self.open = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.open)
        self.open.items.append(node)
        if tag not in _VOID:
            self.open = node

    def handle_endtag(self, tag):
        node = self.open
        while node is not None and node.tag != tag:
            node = node.parent
        if node is not None and node.parent is not None:
            self.open = node.parent

    def handle_data(self, data):
        self.open.items.append(data)


def tree_of(path):
    parsed = Tree()
    parsed.feed(path.read_text(encoding='utf-8'))
    return parsed.root


def declare_credentials(project, entries, language=None):
    (project / 'delivery.json').write_text(json.dumps({
        'decisions': [{'source': 'demo', 'content': 'The whole skill.', 'form': 'capability', 'targets': ['x'],
                       'reason': 'One task-specific procedure.'}],
        'credentials': entries}), encoding='utf-8')
    manifest = json.loads((project / 'sources.json').read_text(encoding='utf-8'))
    if language:
        manifest['plugin']['language'] = language
    return manifest


def key(env, service, unlocks, required=True, **more):
    return {'env': env, 'service': service, 'required': required, 'unlocks': unlocks, **more}


KEYS = [
    key('SEVENTH_KEY', 'Seventh service', 'The seventh thing.', required=False),
    key('FOURTH_KEY', 'Fourth service', 'The fourth thing.', rank=4, route='Read from the variable.'),
    key('SECOND_KEY', 'Second service', 'The second thing.', rank=2, used_by={'sources': ['demo'], 'capabilities': ['x']}),
    key('FIRST_KEY', 'First service', 'The first thing.', rank=1, required=False, used_by={'tools': ['demo/lookup']}),
    key('EIGHTH_KEY', 'Eighth service', 'The eighth thing.'),
    key('THIRD_KEY', 'Third service', 'The third thing.', rank=3),
]


def panel(root):
    found = root.find('section', id='api-keys')
    assert len(found) == 1
    return found[0]


def test_every_guide_string_exists_in_both_languages():
    from muro import guide
    assert set(guide._I18N['en']) == set(guide._I18N['it'])
    assert all(guide._I18N[lang][name].strip() for lang in guide._I18N for name in guide._I18N[lang])
    assert any(name.startswith('keys_') for name in guide._I18N['en'])


def test_the_panel_is_visible_at_once_in_the_page_and_not_in_the_collapsed_reference(portable_project):
    from muro.guide import write_release_guide
    manifest = declare_credentials(portable_project, KEYS)
    root = tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources']))
    section = panel(root)
    ancestors = list(section.ancestors())
    # Inside <main>, and inside none of what is hidden or collapsed: `.has-js .reference-data{display:none}`, a
    # <details>, the graph's own `only-js` region, the drawer, a hidden element.
    assert [node.tag for node in ancestors][:3] == ['main', 'body', 'html']
    for node in ancestors:
        assert node.tag not in {'details', 'aside', 'noscript'}, node.tag
        assert 'reference-data' not in node.classes() and 'only-js' not in node.classes()
        assert node.attrs.get('id') != 'reference-data' and 'hidden' not in node.attrs
    assert 'only-js' not in section.classes() and 'hidden' not in section.attrs
    assert not [node for node in section.walk() if node.tag == 'details' or 'hidden' in node.attrs]
    # It is in the page before the graph, so it is the first thing read.
    order = [item.attrs.get('id') or item.tag for item in ancestors[0].items if isinstance(item, Node)]
    assert order.index('api-keys') < order.index('graph-region')


def test_the_panel_sets_the_first_three_ranks_apart_then_lists_every_key_in_order(portable_project):
    from muro.guide import write_release_guide
    manifest = declare_credentials(portable_project, KEYS)
    section = panel(tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources'])))
    assert section.find('h2')[0].text() == 'API keys' and section.attrs['aria-labelledby'] == 'api-keys-title'
    assert section.find('h2')[0].attrs['id'] == 'api-keys-title'
    first, then = section.find('ol', **{'class': 'keys-first'}), section.find('ol', **{'class': 'keys-then'})
    assert len(first) == 1 and len(then) == 1

    def envs(node):
        return [item.find('code')[0].text() for item in node.find('li')]

    assert envs(first[0]) == ['FIRST_KEY', 'SECOND_KEY', 'THIRD_KEY']      # the three that carry the lowest ranks
    assert envs(then[0]) == ['FOURTH_KEY']                                 # the rest of the ranked, in rank order
    badges = [span.text() for item in first[0].find('li') for span in item.find('span', **{'class': 'keys-rank'})]
    assert badges == ['1', '2', '3']
    rows = section.find('tbody')[0].find('tr')
    # Every entry, once: ranked first by rank, then the others as declared. Nothing is dropped or invented.
    assert [row.find('td')[0].text() for row in rows] == [
        'FIRST_KEY', 'SECOND_KEY', 'THIRD_KEY', 'FOURTH_KEY', 'SEVENTH_KEY', 'EIGHTH_KEY']
    heads = section.find('thead')[0].find('th')
    assert [head.text() for head in heads] == ['Variable', 'Service', 'What it unlocks', 'Need', 'Used by']
    assert all(head.attrs['scope'] == 'col' for head in heads)


def test_the_table_shows_what_each_key_unlocks_whether_it_is_required_and_who_uses_it(portable_project):
    from muro.guide import write_release_guide
    manifest = declare_credentials(portable_project, KEYS)
    section = panel(tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources'])))
    cells = {row.find('td')[0].text(): [cell.text() for cell in row.find('td')] for row in section.find('tbody')[0].find('tr')}
    assert cells['FIRST_KEY'][1] == 'First service' and cells['FIRST_KEY'][2] == 'The first thing.'
    assert cells['FIRST_KEY'][3] == 'optional' and cells['SECOND_KEY'][3] == 'required'
    assert cells['SECOND_KEY'][4] == 'Sources: demoCapabilities: x'        # a group per declared list, in a fixed order
    assert cells['FIRST_KEY'][4] == 'Tools: demo/lookup'
    assert cells['SEVENTH_KEY'][4] == '—'                                   # nothing declared: nothing shown
    assert 'Read from the variable.' in cells['FOURTH_KEY'][2] and 'How it is received:' in cells['FOURTH_KEY'][2]
    assert 'How it is received' not in cells['FIRST_KEY'][2]


def test_a_panel_with_three_or_fewer_ranked_keys_has_no_second_list(portable_project):
    from muro.guide import write_release_guide
    manifest = declare_credentials(portable_project, [KEYS[3], KEYS[2]])
    section = panel(tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources'])))
    assert [li.find('code')[0].text() for li in section.find('ol', **{'class': 'keys-first'})[0].find('li')] == [
        'FIRST_KEY', 'SECOND_KEY']
    assert not section.find('ol', **{'class': 'keys-then'})
    # Without any rank nothing is "first": the table alone, in the declared order.
    manifest = declare_credentials(portable_project, [KEYS[0], KEYS[4]])
    section = panel(tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources'])))
    assert not section.find('ol')
    assert [row.find('td')[0].text() for row in section.find('tbody')[0].find('tr')] == ['SEVENTH_KEY', 'EIGHTH_KEY']


def test_the_panel_follows_the_language_of_the_package(portable_project):
    from muro.guide import write_release_guide
    manifest = declare_credentials(portable_project, KEYS, language='it')
    section = panel(tree_of(write_release_guide(portable_project, manifest['plugin'], manifest['sources'])))
    assert section.find('h2')[0].text() == 'Chiavi API'
    heads = section.find('thead')[0].find('th')
    assert [head.text() for head in heads] == ['Variabile', 'Servizio', 'Cosa sblocca', 'Necessità', 'Usata da']
    cells = {row.find('td')[0].text(): [cell.text() for cell in row.find('td')] for row in section.find('tbody')[0].find('tr')}
    assert cells['FIRST_KEY'][3] == 'facoltativa' and cells['SECOND_KEY'][3] == 'obbligatoria'
    assert cells['SECOND_KEY'][4] == 'Fonti: demoCapability: x' and cells['FIRST_KEY'][4] == 'Strumenti: demo/lookup'
    assert 'Come viene ricevuta:' in cells['FOURTH_KEY'][2]


def test_the_text_of_a_credential_is_text_not_html_and_the_page_stays_self_contained(portable_project):
    from muro.guide import write_release_guide
    attack = '</td><img src="https://example.invalid/leak" onerror="alert(1)"><script>alert(1)</script> & "q"'
    manifest = declare_credentials(portable_project, [key('EXAMPLE_API_KEY', attack, attack, route=attack,
                                                          used_by={'tools': [attack]}, rank=1)])
    text, parsed = read_guide(write_release_guide(portable_project, manifest['plugin'], manifest['sources']))
    assert '&lt;img src=&quot;https://example.invalid/leak&quot;' in text
    assert not parsed.event_attributes and not parsed.external_resources
    assert sum(script.get('id') == 'guide-data' for script in parsed.scripts) == 1
    assert len(parsed.ids) == len(set(parsed.ids)) and 'api-keys' in parsed.ids


def test_the_strings_of_the_panel_stay_out_of_the_script_payload(portable_project):
    from muro import guide
    manifest = declare_credentials(portable_project, KEYS)
    _, parsed = read_guide(guide.write_release_guide(portable_project, manifest['plugin'], manifest['sources']))
    # The panel is rendered into the page; the script reads none of its strings, and no credential reaches the data.
    assert set(parsed.payload['i18n']) == {name for name in guide._I18N['en'] if not name.startswith('keys_')}
    assert 'credentials' not in parsed.payload and 'FIRST_KEY' not in json.dumps(parsed.payload)


def test_a_package_without_credentials_gets_the_guide_it_always_had(portable_project, monkeypatch):
    from muro import guide
    monkeypatch.setattr(guide, 'datetime', _Frozen)
    manifest = json.loads((portable_project / 'sources.json').read_text(encoding='utf-8'))
    page = guide.write_release_guide(portable_project, manifest['plugin'], manifest['sources'])
    plain = page.read_bytes()
    # None of the panel: not its markup, not its style, not its strings, in the page or in the data.
    absent = ('api-keys', 'keys-', 'API keys', 'Chiavi API', '.keys{')
    assert not [marker for marker in absent if marker in plain.decode('utf-8')] and b'__MURO_' not in plain
    _, parsed = read_guide(page)
    assert set(parsed.payload['i18n']) == {name for name in guide._I18N['en'] if not name.startswith('keys_')}
    # An empty declaration declares nothing: no panel (its digest follows the delivery document, as it does for any key).
    manifest = declare_credentials(portable_project, [])
    empty = guide.write_release_guide(portable_project, manifest['plugin'], manifest['sources']).read_text(encoding='utf-8')
    assert not [marker for marker in absent if marker in empty]
    # And a declaration that is gone again leaves the same bytes, to the byte.
    (portable_project / 'delivery.json').unlink()
    assert guide.write_release_guide(portable_project, manifest['plugin'], manifest['sources']).read_bytes() == plain


def test_the_placeholders_of_the_panel_add_no_byte_of_their_own_to_the_template():
    # Empty, a placeholder must leave the template as it was before the panel existed: it sits glued to the text
    # that was already there, with no space or line break of its own. Checked once against the base commit by a
    # byte comparison of whole pages (docs/verification/2026-11-24-keys-in-the-guide.md).
    from muro import guide
    template = guide.GUIDE_TEMPLATE.read_text(encoding='utf-8')
    assert template.count('__MURO_KEYS__') == 1 and template.count('__MURO_KEYS_STYLE__') == 1
    assert '\n    __MURO_KEYS__<section class="graph only-js" id="graph-region"' in template
    assert 'a{color:inherit}}__MURO_KEYS_STYLE__\n  </style>' in template


def test_a_release_with_credentials_carries_the_panel_in_every_host_copy(portable_project, tmp_path):
    declare_credentials(portable_project, KEYS)
    release = build_release(portable_project / 'sources.json', portable_project, tmp_path / 'release')
    guide = release / 'GUIDE.html'
    assert panel(tree_of(guide)).find('h2')[0].text() == 'API keys'
    for host in ('claude-code', 'codex', 'pi', 'opencode', 'hermes'):
        assert (release / 'adapters' / host / 'skills' / 'muro' / 'GUIDE.html').read_bytes() == guide.read_bytes()
