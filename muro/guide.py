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


_I18N: dict[str, dict[str, str]] = {
    "en": {
        "lang": "en",
        "meta_desc": "Navigable map of intents and capabilities for this release.",
        "page_title": "Release map",
        "skip": "Skip to graph",
        "controls_aria": "Graph controls",
        "paths": "Paths",
        "intents": "Intents",
        "intent_label": "Declared catalog intent",
        "intent_opt": "Choose an intent",
        "reset": "Reset",
        "graph_aria": "Navigable capability graph",
        "scroll_aria": "Capability graph, scrollable",
        "canvas_aria": "Interactive graph. Drag to pan, scroll to zoom. Keyboard: arrows, plus and minus; Tab reaches nodes.",
        "nodes_aria": "Graph nodes",
        "status_init": "Click a node for details.",
        "noscript": "The interactive graph requires JavaScript. The complete catalog is available below.",
        "how_h2": "How the coordinator works",
        "catalog_h2": "Complete catalog",
        "sources_h2": "Release sources",
        "close_aria": "Close details",
        "role_label": "Responsibilities:",
        "intents_h3": "Intents and activation",
        "intents_note": "The AI evaluates the desired outcome and context. These intents are not keyword triggers.",
        "excludes_label": "Exclusions and boundaries",
        "no_excludes": "No additional exclusion declared.",
        "stack_h3": "Technical constraints",
        "no_stack": "No stack constraint declared. Activation still requires explicit AI selection.",
        "prec_h3": "Precedence and collaboration",
        "after_label": "Declared prerequisites (after)",
        "no_after": "No prerequisite declared: can be selected directly.",
        "succ_label": "Capabilities declaring this prerequisite",
        "no_succ": "None. Completion does not automatically trigger later steps.",
        "needs_label": "Conditional prerequisites (needs): judged per task by the AI",
        "only_if": "Only when:",
        "none_declared": "None declared.",
        "prec_note": "Arrows indicate precedence, not automatic triggers. A completed step is skipped only when all its outputs are recorded in the active map.",
        "same_role_label": "Other capabilities sharing this role: mutually exclusive",
        "no_same_role": "No other capability shares this role.",
        "conflicts_label": "Explicitly declared conflicts",
        "no_conflicts": "No conflict declared; this does not guarantee semantic compatibility.",
        "outputs_h3": "Outputs and work handoff",
        "no_outputs": "No output declared.",
        "reads_label": "Outputs of other capabilities used when recorded (reads)",
        "from_word": "from",
        "no_reads": "None declared: works from the request and project.",
        "outputs_note": "Each output has a single owner in a plan. Handoff to downstream steps is explicit in recorded_outputs.",
        "tools_h3": "Required tools",
        "no_tools": "No tool declared.",
        "req_word": "required",
        "opt_word": "optional",
        "hooks_h3": "Operational hooks and triggers",
        "no_hooks": "No hook adopted in the catalog. Does not cover uninspected upstream files.",
        "event_word": "Event:",
        "action_word": "Action:",
        "policy_word": "Policy:",
        "no_hook_tools": "No tool declared for this hook.",
        "hooks_note": "Hooks are passive metadata. The host checks tools, permissions and conditions; the guide neither installs nor runs them.",
        "checks_h3": "Verification checks",
        "no_checks": "No check declared.",
        "checks_note": "Listing checks is not proof of passing results.",
        "full_instr_summary": "Complete instructions and provenance",
        "examples_summary": "Illustrative paths in text",
        "no_cap_exec": "no capability is executed.",
        "unification_summary": "Catalog unification decisions",
        # JS runtime strings
        "root_label": "AI Choice",
        "root_access": "AI Choice: workflow, commands and sources",
        "show_details": "show details",
        "needs_tap_mid": " requires ",
        "needs_tap_if": " first only when: ",
        "reads_tap": "Data that can flow: ",
        "other_intents": "Other intents",
        "constraint_prefix": "Constraint: ",
        "rel_prereq": "Prerequisites",
        "rel_dep": "Direct dependents",
        "cond_prereq_prefix": "Conditional prerequisite: ",
        "cond_only_if": " — only when: ",
        "rel_reads": "Can consume outputs from (when recorded)",
        "rel_feeds": "Its outputs can feed",
        "rel_role": "Same role: mutually exclusive",
        "rel_conflicts": "Declared conflicts",
        "full_card": "Full specification",
        "no_extra": "No additional detail available.",
        "sel_example": "Selected example",
        "graph_lib": "Graph library",
        "rel_meta": "Release metadata",
        "gen_at": "Generated: ",
        "cat_digest": "Catalog digest: ",
        "status_ex": "Example: ",
        "status_steps": " steps",
        "status_clarify": "clarification required",
        "status_none": "no active capability",
        "status_intent": "Intent: ",
        "status_caps": " capabilities",
        "status_idle": "Drag a node to move it, drag background to pan, scroll to zoom. Click a node for details.",
        "no_examples": "No illustrative path in this release.",
    },
    "it": {
        "lang": "it",
        "meta_desc": "Mappa navigabile degli intenti e delle capability della release.",
        "page_title": "Mappa della release",
        "skip": "Vai al grafo",
        "controls_aria": "Controlli del grafo",
        "paths": "Percorsi",
        "intents": "Intenti",
        "intent_label": "Intento dichiarato nel catalogo",
        "intent_opt": "Scegli un intento",
        "reset": "Ripristina",
        "graph_aria": "Grafo navigabile delle capability",
        "scroll_aria": "Grafo delle capability, scorrevole",
        "canvas_aria": "Grafo interattivo. Trascina per spostare, scorri per zoomare. Con la tastiera usa le frecce, più e meno; Tab raggiunge i nodi.",
        "nodes_aria": "Nodi del grafo",
        "status_init": "Clicca un nodo per i dettagli.",
        "noscript": "Il grafo navigabile richiede JavaScript. Il catalogo completo è disponibile qui sotto.",
        "how_h2": "Come funziona il coordinatore",
        "catalog_h2": "Catalogo completo",
        "sources_h2": "Fonti della release",
        "close_aria": "Chiudi dettagli",
        "role_label": "Responsabilità:",
        "intents_h3": "Intenti e attivazione",
        "intents_note": "L’IA valuta il risultato desiderato e il contesto. Questi intenti non sono parole chiave di attivazione.",
        "excludes_label": "Esclusioni e limiti",
        "no_excludes": "Nessuna esclusione aggiuntiva dichiarata.",
        "stack_h3": "Vincoli tecnici",
        "no_stack": "Nessun vincolo di stack dichiarato. L’attivazione richiede comunque una selezione esplicita dell’IA.",
        "prec_h3": "Precedenze e collaborazioni",
        "after_label": "Prerequisiti dichiarati (after)",
        "no_after": "Nessun prerequisito dichiarato: può essere selezionata direttamente.",
        "succ_label": "Capability che dichiarano questo prerequisito",
        "no_succ": "Nessuna. Il completamento non attiva automaticamente altri passaggi.",
        "needs_label": "Prerequisiti condizionati (needs): li valuta l’IA caso per caso",
        "only_if": "Solo se:",
        "none_declared": "Nessuno dichiarato.",
        "prec_note": "Le frecce indicano precedenze, non attivazioni automatiche. Un passaggio già completato si salta solo quando tutti i suoi output sono registrati nella mappa corrente.",
        "same_role_label": "Altre capability dello stesso ruolo: selezione esclusiva",
        "no_same_role": "Nessun’altra capability con lo stesso ruolo.",
        "conflicts_label": "Conflitti esplicitamente dichiarati",
        "no_conflicts": "Nessun conflitto dichiarato; non è una garanzia di compatibilità semantica.",
        "outputs_h3": "Output e passaggio del lavoro",
        "no_outputs": "Nessun output dichiarato.",
        "reads_label": "Output di altre capability che usa, se già registrati (reads)",
        "from_word": "da",
        "no_reads": "Nessuno dichiarato: lavora dalla richiesta e dal progetto.",
        "outputs_note": "Ogni output ha un solo responsabile nel piano. Il passaggio ai successori è esplicito; le istruzioni complete riportano come consegnarlo.",
        "tools_h3": "Strumenti richiesti",
        "no_tools": "Nessuno strumento dichiarato.",
        "req_word": "richiesto",
        "opt_word": "opzionale",
        "hooks_h3": "Hook e attivatori operativi",
        "no_hooks": "Nessun hook adottato nel catalogo. Non descrive eventuali file upstream non ispezionati.",
        "event_word": "Evento:",
        "action_word": "Azione:",
        "policy_word": "Politica:",
        "no_hook_tools": "Nessuno strumento dichiarato per questo hook.",
        "hooks_note": "Gli hook sono descrizioni passive. L’host verifica strumenti, permessi e condizioni; la guida non li installa né li esegue.",
        "checks_h3": "Verifiche da eseguire",
        "no_checks": "Nessuna verifica dichiarata.",
        "checks_note": "L’elenco delle verifiche non equivale a risultati superati.",
        "full_instr_summary": "Istruzioni complete e provenienza",
        "examples_summary": "Percorsi esemplari in testo",
        "no_cap_exec": "nessuna capability viene eseguita.",
        "unification_summary": "Decisioni di unificazione dal catalogo",
        # JS runtime strings
        "root_label": "Scelta IA",
        "root_access": "Scelta IA: funzionamento, comandi e fonti",
        "show_details": "mostra dettagli",
        "needs_tap_mid": " richiede prima ",
        "needs_tap_if": " solo se: ",
        "reads_tap": "Dati che possono passare: ",
        "other_intents": "Altri intenti",
        "constraint_prefix": "Vincolo: ",
        "rel_prereq": "Prerequisiti",
        "rel_dep": "Dipendenti diretti",
        "cond_prereq_prefix": "Prerequisito condizionato: ",
        "cond_only_if": " — solo se: ",
        "rel_reads": "Può usare gli output di (se registrati)",
        "rel_feeds": "I suoi output possono servire a",
        "rel_role": "Stesso ruolo: scelta esclusiva",
        "rel_conflicts": "Conflitti dichiarati",
        "full_card": "Scheda completa",
        "no_extra": "Nessun dettaglio aggiuntivo disponibile.",
        "sel_example": "Esempio selezionato",
        "graph_lib": "Libreria del grafo",
        "rel_meta": "Dati della release",
        "gen_at": "Generata: ",
        "cat_digest": "Impronta del catalogo: ",
        "status_ex": "Esempio: ",
        "status_steps": " passi",
        "status_clarify": "serve un chiarimento",
        "status_none": "nessuna capability attiva",
        "status_intent": "Intento: ",
        "status_caps": " capability",
        "status_idle": "Trascina un nodo per spostarlo, lo sfondo per muovere la mappa; scorri per zoomare. Clicca un nodo per i dettagli.",
        "no_examples": "Nessun percorso illustrativo in questa release.",
    },
}


def _workflow_html(lang: str, command_escaped: str) -> str:
    if lang == "it":
        return (
            '<p>L’IA interpreta la richiesta e il contesto, confronta intenti ed esclusioni e seleziona le capability. '
            'Non usa parole chiave per scegliere una skill.</p>'
            '<p>Le linee grigie collegano l’IA alle capability senza prerequisiti dichiarati: sono scelte disponibili, '
            'non passi da eseguire tutti. Le frecce blu indicano solo i prerequisiti <code>after</code>, validi sempre. '
            'Le frecce arancioni tratteggiate sono prerequisiti condizionati (<code>needs</code>): l’etichetta la riassume '
            'in poche parole; la condizione completa si legge cliccando la freccia o il nodo di arrivo, e la valuta l’IA '
            'per ogni richiesta; se vale, la capability di partenza entra nel piano prima dell’altra. Il flusso dei dati '
            '(<code>reads</code>) non è mostrato nella vista base, perché dipende dal lavoro scelto. Scegliendo un percorso '
            'compaiono frecce verdi piene dove chi produce viene prima di chi legge: lì i dati passano davvero. Scegliendo '
            'un intento compaiono frecce verdi tratteggiate: output che le capability di quell’intento possono usare o fornire, '
            'se l’altra capability è nel piano.</p>'
            '<p>Una capability lavora alla volta. Un solo responsabile per output; conflitti e varianti incompatibili vengono '
            'rifiutati. Un prerequisito si salta solo se tutti i suoi output sono già registrati.</p>'
            '<details><summary>Esiti della decisione IA</summary>'
            '<p><code>selected</code>: esegue il percorso validato. Un passo è diretto; più passi richiedono conferma se non già autorizzati.</p>'
            '<p><code>needs_clarification</code>: pone la domanda necessaria e si ferma. <code>no_match</code>: segnala che il catalogo non copre il risultato e si ferma.</p>'
            '<p><code>classification-required</code>: l’host deve produrre una decisione IA. Nessuna capability viene eseguita.</p></details>'
            f'<details><summary>Comandi</summary><pre><code>/{command_escaped}\n'
            'python muro.py plan --compact --task "&lt;richiesta&gt;" --project "&lt;progetto&gt;"\n'
            'python muro.py plan --task "&lt;richiesta&gt;" --project "&lt;progetto&gt;" --classification "&lt;cartella di stato&gt;/classification.json" --confirm\n'
            'python muro.py resume --project "&lt;progetto&gt;"</code></pre>'
            '<p>Ogni comando sta su una riga; i JSON li scrive l’host in un file della cartella di stato. Per i passi con mappa, invia output e verifiche in modo atomico con gli identificatori restituiti con il passo:</p>'
            '<pre><code>python muro.py step --project "&lt;progetto&gt;" --map-id &lt;map_id&gt; --capability &lt;capability&gt; --step-data "&lt;cartella di stato&gt;/step.json"\n'
            'python muro.py complete --project "&lt;progetto&gt;" --map-id &lt;map_id&gt;</code></pre>'
            '<p>Per sostituire una mappa: nuova classificazione e <code>plan --new</code>. Il browser non esegue comandi.</p></details>'
            '<details><summary>Strumenti, attivatori e precedenze</summary>'
            '<p>I vincoli <code>stack:*</code> indicano compatibilità tecnica, non attivatori testuali. L’host verifica strumenti e autorizzazioni. '
            'Gli hook sono descrizioni passive, non vengono installati o attivati automaticamente.</p></details>'
        )
    return (
        '<p>The host AI interprets the request and project context, compares intents and exclusions, and selects capabilities. '
        'It never uses keyword matching to pick a skill.</p>'
        '<p>Grey lines connect the AI choice node to capabilities with no unconditional prerequisites: they are available entry points, '
        'not steps to run all at once. Solid blue arrows indicate unconditional <code>after</code> prerequisites. '
        'Dashed orange arrows indicate conditional prerequisites (<code>needs</code>): the label summarizes the condition in at most 5 words; '
        'click the arrow or target node to read the full condition judged per task by the AI. Data flow (<code>reads</code>) is hidden in '
        'the base view because it depends on the chosen workflow: selecting a path reveals solid green arrows where a producer precedes a '
        'reader; selecting an intent reveals dashed green arrows showing potential data handoffs.</p>'
        '<p>One capability executes at a time, with a single owner per output; conflicting capabilities and incompatible variants are '
        'rejected before execution. Prerequisites are skipped only when all declared outputs are already recorded.</p>'
        '<details><summary>AI decision outcomes</summary>'
        '<p><code>selected</code>: runs the validated path. Single-step tasks run directly when no map is active; multi-step plans confirm first.</p>'
        '<p><code>needs_clarification</code>: asks targeted questions and stops. <code>no_match</code>: reports unsupported scope and stops.</p>'
        '<p><code>classification-required</code>: returns prompt and catalog so the host AI can author a classification JSON.</p></details>'
        f'<details><summary>Commands</summary><pre><code>/{command_escaped}\n'
        'python muro.py plan --compact --task "&lt;task&gt;" --project "&lt;project&gt;"\n'
        'python muro.py plan --task "&lt;task&gt;" --project "&lt;project&gt;" --classification "&lt;state folder&gt;/classification.json" --confirm\n'
        'python muro.py resume --project "&lt;project&gt;"</code></pre>'
        '<p>Every command is one line; the host writes each JSON to a file in the state folder. For mapped steps, submit outputs and verification checks atomically with the step binding:</p>'
        '<pre><code>python muro.py step --project "&lt;project&gt;" --map-id &lt;map_id&gt; --capability &lt;capability&gt; --step-data "&lt;state folder&gt;/step.json"\n'
        'python muro.py complete --project "&lt;project&gt;" --map-id &lt;map_id&gt;</code></pre>'
        '<p>To replace an active map: supply a fresh classification with <code>plan --new</code>. The browser executes no commands.</p></details>'
        '<details><summary>Tools, hooks and precedence</summary>'
        '<p><code>stack:*</code> tokens express technical compatibility, not keyword triggers. The host checks tool availability and permissions. '
        'Hooks remain passive metadata and are never auto-registered or executed by the guide.</p></details>'
    )


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


def _capability_html(cap: dict, catalog: list[dict], tr: dict[str, str]) -> str:
    """Display declared fields and relationships; do not derive semantic additions."""
    identifier = _text(cap['id'])
    peers = [other['id'] for other in catalog if other['role'] == cap['role'] and other['id'] != cap['id']]
    successors = [other['id'] for other in catalog if cap['id'] in other['after']]
    conflicts = [other['id'] for other in catalog if other['id'] != cap['id'] and
                 (other['id'] in cap['conflicts'] or cap['id'] in other['conflicts'])]
    constraints = tr['no_stack'] if cap['when'] == '—' else cap['when']
    parts = [
        f'<details class="capability" id="cap-{identifier}" data-capability="{identifier}">',
        f'<summary><span class="cap-title">{_text(cap["title"])}</span><code>{identifier}</code></summary>',
        '<div class="cap-body">',
        f'<p><strong>{_text(tr["role_label"])}</strong> {_text(cap["role"])}</p>',
        f'<h3>{_text(tr["intents_h3"])}</h3>',
        f'<p>{_text(tr["intents_note"])}</p>',
    ]
    for intent in cap['intents']:
        parts.extend([
            f'<h4><code>{_text(intent["id"])}</code></h4>',
            f'<p>{_text(intent["description"])}</p>',
            f'<p><strong>{_text(tr["excludes_label"])}</strong></p>',
            _items(intent['excludes'], tr['no_excludes']),
        ])
    parts.extend([
        f'<h3>{_text(tr["stack_h3"])}</h3>', f'<p>{_text(constraints)}</p>',
        f'<h3>{_text(tr["prec_h3"])}</h3>',
        f'<p><strong>{_text(tr["after_label"])}</strong></p>',
        _cap_links(cap['after'], tr['no_after']),
        f'<p><strong>{_text(tr["succ_label"])}</strong></p>',
        _cap_links(successors, tr['no_succ']),
        f'<p><strong>{_text(tr["needs_label"])}</strong></p>',
        _items([f"{need['capability']} — {need['label']}. {tr['only_if']} {need['when']} ({need['reason']})" for need in cap.get('needs', [])],
               tr['none_declared']),
        f'<p>{_text(tr["prec_note"])}</p>',
        f'<p><strong>{_text(tr["same_role_label"])}</strong></p>',
        _cap_links(peers, tr['no_same_role']),
        f'<p><strong>{_text(tr["conflicts_label"])}</strong></p>',
        _cap_links(conflicts, tr['no_conflicts']),
        f'<h3>{_text(tr["outputs_h3"])}</h3>', _items(cap['outputs'], tr['no_outputs']),
        f'<p><strong>{_text(tr["reads_label"])}</strong></p>',
        _items([f"{key} — {tr['from_word']} {next((other['id'] for other in catalog if key in other['outputs']), '?')}"
                for key in cap.get('reads', [])],
               tr['no_reads']),
        f'<p>{_text(tr["outputs_note"])}</p>',
        f'<h3>{_text(tr["tools_h3"])}</h3>',
    ])
    if not cap['tools']:
        parts.append(f'<p>{_text(tr["no_tools"])}</p>')
    for tool in cap['tools']:
        requirement = tr['req_word'] if tool['required'] else tr['opt_word']
        parts.append(f'<p><strong>{_text(tool["name"])} ({_text(requirement)})</strong><br>{_text(tool["purpose"])}</p>')
    parts.append(f'<h3>{_text(tr["hooks_h3"])}</h3>')
    if not cap['hooks']:
        parts.append(f'<p>{_text(tr["no_hooks"])}</p>')
    for hook in cap['hooks']:
        parts.extend([
            f'<p><strong>{_text(tr["event_word"])}</strong> {_text(hook["event"])}<br>',
            f'<strong>{_text(tr["action_word"])}</strong> {_text(hook["action"])}<br>',
            f'<strong>{_text(tr["policy_word"])}</strong> {_text(hook["policy"])}</p>',
            _items(hook['tools'], tr['no_hook_tools']),
        ])
    parts.extend([
        f'<p>{_text(tr["hooks_note"])}</p>',
        f'<h3>{_text(tr["checks_h3"])}</h3>', _items(cap['checks'], tr['no_checks']),
        f'<p>{_text(tr["checks_note"])}</p>',
        f'<details class="instructions"><summary>{_text(tr["full_instr_summary"])}</summary>',
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


def _examples(dist: Path, rows: list, capabilities: dict, digest: str, stack_conflicts: list[list[str]] | None = None) -> list[dict]:
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
        validate_stack(set(stack), conflict_groups=stack_conflicts)
        decision = {key: value for key, value in example.items() if key != 'title'}
        decision['catalog_digest'] = digest
        context = {key: decision[key] for key in ('task', 'stack_tokens', 'catalog_digest')}
        decision = validate_classification(decision, context, capabilities)
        path_ids = resolve_selection(rows, [selection['capability'] for selection in decision['selections']], set(stack), set(),
                                     {key: cap.conflicts for key, cap in capabilities.items()},
                                     conflict_groups=stack_conflicts)
        result.append({**example, 'path': path_ids})
    return result


def _examples_html(examples: list[dict], tr: dict[str, str]) -> str:
    parts = [f'<details class="instructions"><summary>{_text(tr["examples_summary"])}</summary>']
    for example in examples:
        parts.extend([f'<h3>{_text(example["title"])}</h3>', f'<p>{_text(example["task"])}</p>'])
        if example['path']:
            parts.append('<ol>' + ''.join(f'<li><a href="#cap-{_text(identifier)}">{_text(identifier)}</a></li>'
                                         for identifier in example['path']) + '</ol>')
        else:
            parts.append(f'<p>{_text(example["status"])}: {_text(tr["no_cap_exec"])}</p>')
        parts.append(f'<p>{_text(example["reason"])}</p>')
        if example['questions']:
            parts.append(_items(example['questions'], ''))
    parts.append('</details>')
    return '\n'.join(parts)


def write_release_guide(dist: Path, plugin: dict, sources: list[dict]) -> Path:
    """Read the actual packaged artifacts, then generate the mandatory GUIDE.html."""
    lang = plugin.get('language', 'en')
    if lang not in _I18N:
        raise ValueError(f"Unsupported guide language: {lang}")
    tr = _I18N[lang]
    graph_library, graph_script = _graph_library()
    capabilities = parse_capabilities(dist / 'capabilities')
    rows = parse_router(dist / 'ROUTER.md')
    errors = validate_capabilities_and_router(
        capabilities, rows, {source['id'] for source in sources}, plugin_slug=plugin.get('slug')
    )
    if errors:
        raise ValueError('Invalid guide catalog: ' + '; '.join(errors))
    by_id = {cap.id: cap for cap in capabilities}
    catalog = catalog_entries(rows, by_id)
    prompt = (dist / 'prompts' / 'classify.md').read_text(encoding='utf-8')
    digest = catalog_digest(catalog, by_id, prompt)
    manifest_file = dist / 'sources.json'
    stack_conflicts = None
    if manifest_file.is_file():
        m_doc = json.loads(manifest_file.read_text(encoding='utf-8'))
        if isinstance(m_doc.get('stack'), dict):
            stack_conflicts = m_doc['stack'].get('conflicts')
    examples = _examples(dist, rows, by_id, digest, stack_conflicts=stack_conflicts)
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
        'i18n': tr,
    }
    serialized = json.dumps(data, ensure_ascii=False).replace('&', '\\u0026').replace('<', '\\u003c').replace('>', '\\u003e')
    serialized = serialized.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    catalog_notes = (f'<details class="instructions catalog-notes"><summary>{_text(tr["unification_summary"])}</summary>'
                     f'<pre class="source-body">{_text((dist / "ROUTER.md").read_text(encoding="utf-8"))}</pre></details>')
    cmd_escaped = _text(plugin['command'])
    replacements = {
        '__MURO_LANG__': _text(tr['lang']),
        '__MURO_META_DESC__': _text(tr['meta_desc']),
        '__MURO_PAGE_TITLE__': _text(tr['page_title']),
        '__MURO_SKIP__': _text(tr['skip']),
        '__MURO_CONTROLS_ARIA__': _text(tr['controls_aria']),
        '__MURO_PATHS__': _text(tr['paths']),
        '__MURO_INTENTS__': _text(tr['intents']),
        '__MURO_INTENT_LABEL__': _text(tr['intent_label']),
        '__MURO_INTENT_OPT__': _text(tr['intent_opt']),
        '__MURO_RESET__': _text(tr['reset']),
        '__MURO_GRAPH_ARIA__': _text(tr['graph_aria']),
        '__MURO_SCROLL_ARIA__': _text(tr['scroll_aria']),
        '__MURO_CANVAS_ARIA__': _text(tr['canvas_aria']),
        '__MURO_NODES_ARIA__': _text(tr['nodes_aria']),
        '__MURO_STATUS_INIT__': _text(tr['status_init']),
        '__MURO_NOSCRIPT__': _text(tr['noscript']),
        '__MURO_HOW_H2__': _text(tr['how_h2']),
        '__MURO_WORKFLOW_HTML__': _workflow_html(lang, cmd_escaped),
        '__MURO_CATALOG_H2__': _text(tr['catalog_h2']),
        '__MURO_SOURCES_H2__': _text(tr['sources_h2']),
        '__MURO_CLOSE_ARIA__': _text(tr['close_aria']),
        '__MURO_TITLE__': _text(plugin['name']),
        '__MURO_VERSION__': _text(plugin['version']),
        '__MURO_DATA__': serialized,
        '__MURO_CONTENT__': '\n'.join(_capability_html(cap, catalog, tr) for cap in catalog) + '\n' + _examples_html(examples, tr) + '\n' + catalog_notes,
        '__MURO_SOURCES__': _sources_html(public_sources),
        '__MURO_GRAPH_LIBRARY__': graph_script,
    }
    template = GUIDE_TEMPLATE.read_text(encoding='utf-8')
    if any(token not in template for token in replacements):
        raise ValueError('Release guide template is missing required content placeholders')
    rendered = re.sub('|'.join(re.escape(token) for token in replacements),
                      lambda match: replacements[match.group()], template)
    destination = dist / 'GUIDE.html'
    destination.write_text(rendered, encoding='utf-8')
    return destination
