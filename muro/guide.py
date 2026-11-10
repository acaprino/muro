"""Render an offline release guide from explicit catalog data, without classification."""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from hashlib import sha256
import json
from pathlib import Path
import re

from .core import parse_router, validate_capabilities_and_router
from .routing import catalog_digest, catalog_entries, resolve_selection, validate_classification, validate_stack
from .sources import parse_capabilities


GUIDE_TEMPLATE = Path(__file__).with_name("guide.html")
GRAPH_VENDOR = Path(__file__).with_name('vendor') / 'cytoscape'


def _graph_library() -> tuple[dict, str]:
    """Embed the reviewed local browser dependency and its full license offline."""
    metadata = json.loads((GRAPH_VENDOR / 'manifest.json').read_text(encoding='utf-8'))
    bundle = (GRAPH_VENDOR / 'cytoscape.min.js').read_bytes()
    license_bytes = (GRAPH_VENDOR / 'LICENSE').read_bytes()
    if (sha256(bundle).hexdigest() != metadata['sha256'] or
            sha256(license_bytes).hexdigest() != metadata['license_sha256']):
        raise ValueError('Guide graph library or license differs from its reviewed pin')
    script = bundle.decode('utf-8')
    if '</script' in script.lower():
        raise ValueError('Guide graph bundle cannot be safely embedded inline')
    return metadata, script


def _text(value: object) -> str:
    return escape(str(value), quote=True)


def _items(values: list[str], empty: str) -> str:
    if not values:
        return f'<p class="empty-value">{_text(empty)}</p>'
    return '<ul>' + ''.join(f'<li>{_text(item)}</li>' for item in values) + '</ul>'


def _cap_links(identifiers: list[str], empty: str) -> str:
    if not identifiers:
        return f'<p class="empty-value">{_text(empty)}</p>'
    return '<ul>' + ''.join(
        f'<li><a href="#cap-{_text(identifier)}">{_text(identifier)}</a></li>'
        for identifier in identifiers
    ) + '</ul>'


def _capability_html(cap: dict, catalog: list[dict]) -> str:
    """Display declared fields and relationships; do not derive semantic additions."""
    identifier = _text(cap['id'])
    peers = [other['id'] for other in catalog if other['role'] == cap['role'] and other['id'] != cap['id']]
    successors = [other['id'] for other in catalog if cap['id'] in other['after']]
    conflicts = [other['id'] for other in catalog if other['id'] != cap['id'] and
                 (other['id'] in cap['conflicts'] or cap['id'] in other['conflicts'])]
    constraints = ('Nessun vincolo di stack dichiarato. L’attivazione richiede comunque '
                   'una selezione esplicita dell’IA.') if cap['when'] == '—' else cap['when']
    parts = [
        f'<details class="capability" id="cap-{identifier}" data-capability="{identifier}">',
        f'<summary><span class="cap-title">{_text(cap["title"])}</span><code>{identifier}</code></summary>',
        '<div class="cap-body">',
        f'<p><strong>Responsabilità:</strong> {_text(cap["role"])}</p>',
        '<h3>Intenti e attivazione</h3>',
        '<p>L’IA valuta il risultato desiderato e il contesto. Questi intenti non sono parole chiave di attivazione.</p>',
    ]
    for intent in cap['intents']:
        parts.extend([
            f'<h4><code>{_text(intent["id"])}</code></h4>',
            f'<p>{_text(intent["description"])}</p>',
            '<p><strong>Esclusioni e limiti</strong></p>',
            _items(intent['excludes'], 'Nessuna esclusione aggiuntiva dichiarata.'),
        ])
    parts.extend([
        '<h3>Vincoli tecnici</h3>', f'<p>{_text(constraints)}</p>',
        '<h3>Precedenze e collaborazioni</h3>',
        '<p><strong>Prerequisiti dichiarati (after)</strong></p>',
        _cap_links(cap['after'], 'Nessun prerequisito dichiarato: può essere selezionata direttamente.'),
        '<p><strong>Capability che dichiarano questo prerequisito</strong></p>',
        _cap_links(successors, 'Nessuna. Il completamento non attiva automaticamente altri passaggi.'),
        '<p><strong>Prerequisiti condizionati (needs): li valuta l’IA caso per caso</strong></p>',
        _items([f"{need['capability']} — {need['label']}. Solo se: {need['when']} ({need['reason']})" for need in cap.get('needs', [])],
               'Nessuno dichiarato.'),
        '<p>Le frecce indicano precedenze, non attivazioni automatiche. Un passaggio già completato '
        'si salta solo quando tutti i suoi output sono registrati nella mappa corrente.</p>',
        '<p><strong>Altre capability dello stesso ruolo: selezione esclusiva</strong></p>',
        _cap_links(peers, 'Nessun’altra capability con lo stesso ruolo.'),
        '<p><strong>Conflitti esplicitamente dichiarati</strong></p>',
        _cap_links(conflicts, 'Nessun conflitto dichiarato; non è una garanzia di compatibilità semantica.'),
        '<h3>Output e passaggio del lavoro</h3>', _items(cap['outputs'], 'Nessun output dichiarato.'),
        '<p><strong>Output di altre capability che usa, se già registrati (reads)</strong></p>',
        _items([f"{key} — da {next((other['id'] for other in catalog if key in other['outputs']), '?')}"
                for key in cap.get('reads', [])],
               'Nessuno dichiarato: lavora dalla richiesta e dal progetto.'),
        '<p>Ogni output ha un solo responsabile nel piano. Il passaggio ai successori è esplicito; '
        'le istruzioni complete riportano come consegnarlo.</p>',
        '<h3>Strumenti richiesti</h3>',
    ])
    if not cap['tools']:
        parts.append('<p>Nessuno strumento dichiarato.</p>')
    for tool in cap['tools']:
        requirement = 'richiesto' if tool['required'] else 'opzionale'
        parts.append(f'<p><strong>{_text(tool["name"])} ({requirement})</strong><br>{_text(tool["purpose"])}</p>')
    parts.append('<h3>Hook e attivatori operativi</h3>')
    if not cap['hooks']:
        parts.append('<p>Nessun hook adottato nel catalogo. Non descrive eventuali file upstream non ispezionati.</p>')
    for hook in cap['hooks']:
        parts.extend([
            f'<p><strong>Evento:</strong> {_text(hook["event"])}<br>',
            f'<strong>Azione:</strong> {_text(hook["action"])}<br>',
            f'<strong>Politica:</strong> {_text(hook["policy"])}</p>',
            _items(hook['tools'], 'Nessuno strumento dichiarato per questo hook.'),
        ])
    parts.extend([
        '<p>Gli hook sono descrizioni passive. L’host verifica strumenti, permessi e condizioni; '
        'la guida non li installa né li esegue.</p>',
        '<h3>Verifiche da eseguire</h3>', _items(cap['checks'], 'Nessuna verifica dichiarata.'),
        '<p>L’elenco delle verifiche non equivale a risultati superati.</p>',
        '<details class="instructions"><summary>Istruzioni complete e provenienza</summary>',
        f'<pre class="source-body">{_text(cap["body"])}</pre></details>',
        '</div></details>',
    ])
    return '\n'.join(parts)


def _sources_html(sources: list[dict]) -> str:
    parts = ['<div class="source-list">']
    for source in sources:
        pin = source['pin']
        revision = source.get('release', '') if pin == 'release' else pin
        parts.extend([
            '<article class="source-entry">',
            f'<h3>{_text(source["id"])}</h3>',
            f'<p>{_text(source["license"])} · {_text(revision)}</p>',
            f'<p><code>{_text(source["commit"])}</code></p>',
            '</article>',
        ])
    parts.append('</div>')
    return '\n'.join(parts)


def _examples(dist: Path, rows: list, capabilities: dict, digest: str) -> list[dict]:
    """Validate AI-authored illustrative decisions; never invent example selections."""
    path = dist / 'guide-examples.json'
    document = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(document, dict) or set(document) != {'examples'} or not isinstance(document['examples'], list) or not document['examples']:
        raise ValueError('Guide requires a nonempty examples array in guide-examples.json')
    result = []
    expected = {'title', 'task', 'stack_tokens', 'status', 'selections', 'reason', 'questions'}
    for example in document['examples']:
        if not isinstance(example, dict) or set(example) != expected:
            raise ValueError('Guide example requires title and explicit host-classification fields')
        if any(not isinstance(example[key], str) or not example[key].strip() for key in ('title', 'task')):
            raise ValueError('Guide example title and task must be nonempty strings')
        stack = example['stack_tokens']
        if not isinstance(stack, list) or any(not isinstance(token, str) for token in stack) or len(set(stack)) != len(stack):
            raise ValueError('Guide example stack_tokens must contain distinct strings')
        validate_stack(set(stack))
        decision = {key: value for key, value in example.items() if key != 'title'}
        decision['catalog_digest'] = digest
        context = {key: decision[key] for key in ('task', 'stack_tokens', 'catalog_digest')}
        decision = validate_classification(decision, context, capabilities)
        path_ids = resolve_selection(rows, [selection['capability'] for selection in decision['selections']], set(stack), set(),
                                     {key: cap.conflicts for key, cap in capabilities.items()})
        result.append({**example, 'path': path_ids})
    return result


def _examples_html(examples: list[dict]) -> str:
    parts = ['<details class="instructions"><summary>Percorsi esemplari in testo</summary>']
    for example in examples:
        parts.extend([f'<h3>{_text(example["title"])}</h3>', f'<p>{_text(example["task"])}</p>'])
        if example['path']:
            parts.append('<ol>' + ''.join(f'<li><a href="#cap-{_text(identifier)}">{_text(identifier)}</a></li>'
                                         for identifier in example['path']) + '</ol>')
        else:
            parts.append(f'<p>{_text(example["status"])}: nessuna capability viene eseguita.</p>')
        parts.append(f'<p>{_text(example["reason"])}</p>')
        if example['questions']:
            parts.append(_items(example['questions'], ''))
    parts.append('</details>')
    return '\n'.join(parts)


def write_release_guide(dist: Path, plugin: dict, sources: list[dict]) -> Path:
    """Read the actual packaged artifacts, then generate the mandatory GUIDE.html."""
    graph_library, graph_script = _graph_library()
    capabilities = parse_capabilities(dist / 'capabilities')
    rows = parse_router(dist / 'ROUTER.md')
    errors = validate_capabilities_and_router(capabilities, rows, {source['id'] for source in sources})
    if errors:
        raise ValueError('Invalid guide catalog: ' + '; '.join(errors))
    by_id = {cap.id: cap for cap in capabilities}
    catalog = catalog_entries(rows, by_id)
    prompt = (dist / 'prompts' / 'classify.md').read_text(encoding='utf-8')
    digest = catalog_digest(catalog, by_id, prompt)
    examples = _examples(dist, rows, by_id, digest)
    for entry in catalog:
        cap = by_id[entry['id']]
        entry['title'] = next((line[2:].strip() for line in cap.body.splitlines() if line.startswith('# ')), cap.id)
        entry['body'] = cap.body
        entry['checks'] = list(cap.checks)
    public_sources = [{key: source[key] for key in ('id', 'pin', 'release', 'commit', 'license') if key in source}
                      for source in sources]
    data = {
        'plugin': {key: plugin[key] for key in ('name', 'slug', 'command', 'version')},
        'capabilities': catalog,
        'sources': public_sources,
        'catalog_digest': digest,
        'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'examples': examples,
        'graph_library': graph_library,
    }
    # JSON script contents need raw-text escaping as well as HTML attribute escaping.
    serialized = json.dumps(data, ensure_ascii=False).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
    serialized = serialized.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    catalog_notes = ('<details class="instructions catalog-notes"><summary>Decisioni di unificazione dal catalogo</summary>'
                     f'<pre class="source-body">{_text((dist / "ROUTER.md").read_text(encoding="utf-8"))}</pre></details>')
    replacements = {
        '__MURO_TITLE__': _text(plugin['name']),
        '__MURO_VERSION__': _text(plugin['version']),
        '__MURO_COMMAND__': _text(plugin['command']),
        '__MURO_DATA__': serialized,
        '__MURO_CONTENT__': '\n'.join(_capability_html(cap, catalog) for cap in catalog) + '\n' + _examples_html(examples) + '\n' + catalog_notes,
        '__MURO_SOURCES__': _sources_html(public_sources),
        '__MURO_GRAPH_LIBRARY__': graph_script,
    }
    template = GUIDE_TEMPLATE.read_text(encoding='utf-8')
    if any(token not in template for token in replacements):
        raise ValueError('Release guide template is missing required content placeholders')
    # Replace only original template slots; literal placeholder text in source data stays data.
    rendered = re.sub('|'.join(re.escape(token) for token in replacements),
                      lambda match: replacements[match.group()], template)
    destination = dist / 'GUIDE.html'
    destination.write_text(rendered, encoding='utf-8')
    return destination
