// The one fake transport of the browser tests and the demo screenshots: the registry service's actions over plain data,
// with the same rules the service has (revision conflicts, blockers, allow_blocked, removals only on a clear harness, and an apply that
// uninstalls only when it carries confirm_removals equal to the plan's removals, or leaves them out with skip_removals).
// createTransport(scenario) returns {request, calls, flags}; calls records every request, flags are knobs a test turns:
//   rejectSave, rejectSettings   the next save_* / settings request fails with a version conflict
//   blockPlan                    every plan carries one blocker besides its operations
//   unreadable                   the first harness cannot be read (incomplete inventory)
//   brokenMarketplace            the first harness holds a marketplace it cannot load: it is read all the same (complete inventory), with the service's warning, and every plan
//                                takes the marketplace out of it (remove-marketplace, whatever `exclusive` says); applying that turns the flag off
//   checkErrors                  check reports a source it could not resolve
//   checkDelay, applyDelay (ms)  check / apply take that long; rejectApply makes apply fail
//   autostartUnsupported         autostart answers supported:false
//   instructionFiles, instructionStale   the custom-instructions state of every plugin
//   staleSettings (n)            the next n settings requests are refused as the service refuses a stale revision
//   Projects: pickPath           what the shell's file dialog answers (a path, or null for a cancelled dialog)
//             noShellActions     pick_file and open_folder fail as a shell that does not know them yet (the service's "Unknown registry action")
//             rejectInstall      install_project fails ("no build for <harness>"); installLeavesTargets: it builds the plugin but leaves its targets alone (a runtime older than the window)
//             projectChanged     every plan blocks the plugin of a project on each harness it is on with "Project file changed: open the project again" (the registry's words for a build older than its file); an install_project clears it
//             remove_project     {id, revision} takes the project off the list
//             simulate           what `simulate` answers: 'selected' (a prerequisite and a chosen step), 'no_match', 'clarify' (needs_clarification, with its questions) or
//                                'invalid' ({valid:false, errors}); simulateError (a message) makes the call fail as the runtime does (no key, endpoint unreachable, harness
//                                missing); simulateDelay (ms) makes it take that long. The answer carries the engine of the settings (`ai`), as the runtime adds it.
//                                `simulate` needs the `run` the page names; `cancel_simulation {run}` ends a delayed one ("The simulation was cancelled") and refuses one that is not running.
//             bigGraph           the next `project` answers a graph of 37 capabilities in 15 entries, one with a very long name, and 26 documented examples (set it before opening the project)
//             emptyGraph         the next `project` has no capability, no entry and no example; noEntries: its capabilities and examples, and no entry
//             oddNames           the next `project` has a second example titled "A letter", and one whose title, intent id and output hold <, & and quotes (ODD_TITLE and the rest, below)
//             objectFields       the next `project` holds an object where its first record has its text and its newest run its changelog, as a file written by hand may
//             Writing (the runtime's project_jobs.rs and the shell's folder dialog; its refusals come in its own words and order):
//             pickFolder         what the shell's folder dialog answers (a folder, or null for a closed dialog); noShellActions makes it unknown too
//             existingFiles      paths of files that are on the computer: a new project is never written over one (a file of a listed project counts)
//             missingFolders     folders that are not there: a new project's folder and an input given as a folder are refused when named in it
//             runEnds            '' (default): an AI run (create_project, project_job) goes on until a test ends it with behind.finish(); 'completed', 'failed', 'cancelled' or 'interrupted':
//                                it ends by itself runDelay ms after it starts (default 0: on the next turn of the event loop, after the answer that started it)
//             runMessage         what a run that failed says (default "The AI run failed (exit code: 1); see output.log"); the file "was not changed" follows, as the runtime says it
//             cancelHolds        cancel_job answers as the runtime does and the run goes on until behind.finish() (a run that is slow to stop). A project run in the phase "Building and saving the project" ignores
//                                a cancel whatever the flag says, as the runtime does once the commit started; a cancel before that ends the run as `cancelled`, with the words of the phase it was in (below)
//             staleDeletes (n)   the next n delete_project requests are refused as the registry refuses a stale revision, and the registry has moved on (its revision is one higher), so the page's retry carries a new one
//             updatesError       project_updates fails with this message (an upstream that cannot be reached)
//             Releasing (release_project, the runtime's `release` and the factory's `muro project release`): the fake reaches no repository, and what one would answer is these knobs'.
//             releaseError       the command refuses with this sentence (the version's tag belongs to another file, the repository cannot be reached, the push was refused)
//             releaseHeld        the repository already holds this very file: nothing is pushed, and the answer says so
//             releaseCaller      the repository has the workflow that calls Muro's: no warning, and `init` adds nothing. Without it a release without `init` ends with the command's warning
//             releaseDelay (ms)  the release takes that long
//             A run is a job of kind "project" (jobs, snapshot.jobs): the runtime's fields (project_id, operation, title, file, phase, budget_usd, log_path, message, time in epoch seconds). One goes at a time,
//             and an adaptation counts. When a run completes it does what the factory's commit does and nothing about meaning: a new project is listed (and its file exists); a change moves the version by its
//             step, adds the run to the history and an entry to the changelog, gives the file a new digest, and adds, removes or re-pins the input it names, or writes the instruction files. A project's digest is
//             64 hex digits that change at every write (a run, an edit); behind.touch(id) writes the file as someone else would; behind.digest(id) tells it.
//   Settings AI: envSet          the names of the environment variables that are set for the Muro process (`env_present {name}` answers {set}; never a value)
//                noEnvCheck      env_present fails as a runtime that does not know it yet ("Unknown registry action")
// behind: what the background worker and the tray do to the registry while the window is open, and nobody tells it:
//   behind.settings(patch) saves settings, behind.check() records a check, behind.bump() moves the revision;
//   behind.finish(status, message) ends the AI runs that go (status completed, failed, cancelled or interrupted; the message defaults to the runtime's own), behind.phase(text) says the phase they are in,
//   behind.touch(id) writes a project's file (another window, a sync: the page's digest is stale), behind.digest(id) is the digest of its file now,
//   behind.adapt(plugin, harness) starts an AI adaptation as another client would, and the page is not told: its next request is refused ("Another AI run is in progress").
//   What a run says when it is cancelled depends on where it was, as the runtime's does: during the agent ("The AI run was cancelled. The project file was
//   not changed", phase "AI intake and harmonization") and between the steps of the run ("Job cancelled. The project file was not changed").
// Scenarios: default (one harness, no plugin), changes (one plugin to update, one harness found), unlisted (a plugin
// installed outside the list), removals (an exclusive harness: one plugin to install, one outside the list to uninstall and one record whose files are gone,
// `present: false`, to clear), projects (two harnesses, a plugin installed as published with no version for one of them, and one project
// not yet installed on any), recorded / recorded-ok / recorded-errors / recorded-unseen (a check the window did not make: one change
// waiting, nothing to do, a source not checked, a removal no cell shows), two-harnesses (a change on each of two harnesses), first-run (no harness, two found,
// one with an installed plugin), demo (the data of the documentation screenshots), demo-synced (the same, everything
// installed and nothing running: the Sync page after a sync), demo-activity (the demo with a failed check and an automatic sync in its history).
const ago = minutes => String(Math.floor(Date.now() / 1000) - minutes * 60);
const build = (harness, version, origin = 'native') => ({ harness, path: `D:/Muro/data/artifacts/${harness}-${version}`, version, origin });
const harnessTarget = (id, harness, name, extra = {}) => ({ id, harness, name, root: `D:/isolated/${harness}`, executable: harness, enabled: true, exclusive: false, ...extra });
const plugin = (id, name, targets, distributions, extra = {}) => ({ id, name, source: `github.com/example/${id}`, policy: 'stable', pinned_version: '', targets, distributions, upstream_version: 'v' + (distributions[0]?.version ?? ''), ...extra });
const installedPlugin = (id, name, version, managed = true) => ({ id: 'native-' + id, registry_id: managed ? id : undefined, name, version, path: `D:/plugins/${id}`, managed });
const foundHarness = (harness, name, extra = {}) => ({ harness, name, executable: harness, version: '1.0.0', config_root: `D:/config/${harness}`, available: true, supported: true, ...extra });

// A digest as the runtime knows it: 64 hex digits (the SHA-256 of the file). Here a hash of `seed`, which is the project and how many times its file was written.
function digestOf(seed) {
  let out = '';
  for (let n = 0; out.length < 64; n++) {
    let h = 2166136261;
    for (const c of `${seed}/${n}`) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

// A small project in the shape of `muro project info`: three inputs, six choices, two records, two runs, the four prompts, two entries and four capabilities.
// Tasks 7 and 8 read the same data: the history, the records, the choices and the graph.
function projectInfo(name, slug, { builtin = false } = {}) {
  const decisions = [
    { source: 'taste-skill', content: 'SKILL.md', form: 'capability', targets: ['design-taste'], reason: 'Its method is a design capability.' },
    { source: 'taste-skill', content: 'references/anti-slop.md', form: 'capability', targets: ['design-taste'], reason: 'Read by the capability on demand.' },
    { source: 'taste-skill', content: 'README.md', form: 'dropped', targets: [], reason: 'Describes the repository, not a method.' },
    { source: 'genoffice', content: 'skills/docx', form: 'capability', targets: ['office-docs'], reason: 'Produces Word files.' },
    { source: 'genoffice', content: 'hooks/guard.json', form: 'hook', targets: ['office-docs'], reason: 'The source declares it for every session.' },
    { source: 'superpowers', content: 'skills/using-superpowers', form: 'always-on', targets: [], reason: 'Acts in every session.' },
  ];
  const became = id => { const n = { capability: 0, 'always-on': 0, hook: 0, dropped: 0 }; for (const d of decisions) if (d.source === id) n[d.form]++; return n; };
  const inputs = [
    { id: 'taste-skill', url: 'https://github.com/example/taste-skill', pin: 'release', release: 'v1.2.0', commit: 'abcdef1234567890', license: 'MIT', paths: ['skills'] },
    { id: 'genoffice', url: 'https://github.com/example/genoffice', pin: 'head', release: null, commit: '0123456789abcdef', license: 'Apache-2.0', paths: ['skills'] },
    { id: 'superpowers', url: 'https://github.com/example/superpowers', pin: 'static', release: null, commit: 'fedcba9876543210', license: 'MIT', paths: ['skills'] },
  ].map(i => ({ ...i, became: became(i.id) }));
  const capability = (id, title, extra = {}) => ({ id, title, role: 'worker', when: '—', after: [], outputs: [], intents: [{ id: id + '-intent', description: title, excludes: '' }], needs: [], conflicts: [], ...extra });
  const need = (capability, label) => ({ capability, label, when: label, reason: 'It reads what the other makes.' });
  const pick = (capability, reason) => ({ capability, intent: capability + '-intent', reason });
  return {
    project: { schema: 1, name, slug, version: '0.5.0', author: builtin ? 'acaprino' : 'you', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: builtin ? { url: 'https://github.com/owner/sample', branch: 'main', tag_prefix: 'sample-v' } : null, builtin },
    plugin: { name, slug, version: '0.5.0', description: `${name}, one plugin` },
    inputs, decisions,
    instructions: [{ path: 'house-style.md', text: 'Keep sentences short.\n' }],
    records: [{ id: 'r1', date: '2026-11-10', subjects: ['design-taste'], text: 'One owner per output.', author: 'muro', binding: false }, { id: 'r2', date: '2026-11-12', subjects: ['office-docs'], text: 'Documents keep the source\'s limits.', author: 'you', binding: true }],
    history: [{ id: 'run-2', time: '2026-11-18T12:00:00Z', version: '0.5.0', status: 'completed', budget_usd: 2, engine: 'claude-code', pins: { 'taste-skill': 'v1.2.0' }, changelog: 'Moved taste-skill to v1.2.0.' }, { id: 'run-1', time: '2026-11-10T09:00:00Z', version: '0.4.0', status: 'completed', budget_usd: null, engine: null, pins: { 'taste-skill': 'v1.1.0' }, changelog: 'First harmonization.' }],
    changelog: '## 0.5.0\n\nMoved taste-skill to v1.2.0.\n', prompts: ['intake.md', 'harmonizer.md', 'delivery.md', 'classify.md'].map(file => ({ file, text: `# ${file}\n\nThe prompt.` })),
    graph: {
      entries: [{ name: `${slug}-design`, description: 'Use when designing an interface.', capabilities: ['design-taste', 'design-review'] }, { name: `${slug}-office`, description: 'Use when producing Word files.', capabilities: ['office-docs', 'office-pdf'] }],
      capabilities: [capability('design-taste', 'Design taste', { outputs: ['design-brief'] }), capability('design-review', 'Design review', { needs: [need('design-taste', 'A design exists')], intents: [{ id: 'design-review-intent', description: 'Review a finished design', excludes: 'Building one' }] }), capability('office-docs', 'Office documents', { after: ['office-pdf'], conflicts: ['design-review'] }), capability('office-pdf', 'Office PDF')],
      // As the guide's data model resolves a documented example: its own decision (`selections`) and the steps the runtime gives it (`steps`: a prerequisite has no intent).
      examples: [
        { id: 'ex-1', title: 'A landing page', task: 'Design a landing page', stack_tokens: ['stack:react'], status: 'selected', selections: [pick('design-taste', 'It designs a page.'), pick('design-review', 'A finished design is checked.')], reason: 'Design first, then review.', questions: [], path: ['design-taste', 'design-review'], steps: [{ step: 'design-taste', capability: 'design-taste', intent: 'design-taste-intent' }, { step: 'design-review', capability: 'design-review', intent: 'design-review-intent' }] },
        { id: 'ex-2', title: 'A letter', task: 'Write a letter as a Word file', stack_tokens: [], status: 'selected', selections: [pick('office-docs', 'It makes the Word file.')], reason: 'A single document.', questions: [], path: ['office-pdf', 'office-docs'], steps: [{ step: 'office-pdf', capability: 'office-pdf', intent: null }, { step: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent' }] },
      ],
    },
    files: [
      { part: 'Identity', path: 'sources.json · plugin', detail: `The final plugin: ${name}, installed as ${slug}, version 0.5.0` },
      { part: 'Choices', path: 'delivery.json', detail: '6 decisions: what each part of each input became, and why' },
      { part: 'Your instructions', path: 'custom-instructions/', detail: 'house-style.md' },
      { part: 'Built plugin', path: 'release/', detail: 'Ready to install on every harness, with its guide' },
    ],
    digest: digestOf(slug + ':0'),
  };
}
// A graph of a large project (flags.bigGraph): 37 capabilities in 15 entries, one name far longer than the rest, conditions and conflicts, and 26 documented examples (two named, 24 generated).
function withBigGraph(info) {
  const ids = Array.from({ length: 37 }, (_, i) => i === 5 ? 'a-capability-whose-name-is-far-longer-than-any-other-capability-of-this-project-' + 'x'.repeat(30) : `capability-${String(i + 1).padStart(2, '0')}-design-system`);
  const entries = Array.from({ length: 15 }, (_, e) => ({ name: `${info.plugin.slug}-group-${e + 1}`, description: `Use when group ${e + 1} applies.`, capabilities: ids.filter((_, i) => i % 15 === e) }));
  const capabilities = ids.map((id, i) => ({ id, title: `Capability ${i + 1}`, role: 'worker', when: '—', after: [], outputs: [], intents: [{ id: id + '-intent', description: `Capability ${i + 1}`, excludes: '' }], needs: i % 7 === 1 ? [{ capability: ids[i - 1], label: 'It reads the first', when: 'It reads the first', reason: 'Because.' }] : [], conflicts: i % 11 === 3 ? [ids[i + 1]] : [] }));
  const pick = id => ({ capability: id, intent: id + '-intent', reason: 'Fits.' });
  const example = (title, chosen) => ({ id: title, title, task: title, stack_tokens: [], status: 'selected', selections: chosen.map(pick), reason: 'Both.', questions: [], path: chosen, steps: chosen.map(id => ({ step: id, capability: id, intent: id + '-intent' })) });
  // 24 more, so the list holds 26. Each picks two capabilities spread across the whole of `ids` (the steps 5 and 11 apart, mod 37: never the same pair twice in a row, and the long name comes up in one).
  const generated = Array.from({ length: 24 }, (_, k) => example(`Generated example ${String(k + 3).padStart(2, '0')}`, [ids[(k * 5 + 1) % 37], ids[(k * 11 + 19) % 37]]));
  return { ...info, graph: { entries, capabilities, examples: [example('Two of many', [ids[5], ids[36]]), example('Another two', [ids[0], ids[20]]), ...generated] } };
}
// flags.oddNames: what a project file from elsewhere may name its things. React writes text, never markup; these prove it, and that two examples with one title stay two.
export const ODD_TITLE = '<b>Odd</b> & "quoted" \'title\'', ODD_TASK = 'Make a <i>PDF</i> & "send" it', ODD_INTENT = '<i>pdf</i> & "intent"', ODD_OUTPUT = '<u>file</u> & "pdf"';
function withOddNames(info) {
  const capabilities = info.graph.capabilities.map(c => c.id === 'office-pdf' ? { ...c, outputs: [ODD_OUTPUT] } : c);
  const examples = [
    ...info.graph.examples,
    { id: 'ex-3', title: 'A letter', task: 'Write a second letter', stack_tokens: [], status: 'selected', selections: [{ capability: 'office-docs', intent: 'office-docs-intent', reason: 'Another Word file.' }], reason: 'A second document.', questions: [], path: ['office-docs'], steps: [{ step: 'office-docs', capability: 'office-docs', intent: 'office-docs-intent' }] },
    { id: 'ex-4', title: ODD_TITLE, task: ODD_TASK, stack_tokens: [], status: 'selected', selections: [{ capability: 'office-pdf', intent: ODD_INTENT, reason: 'It makes the "PDF" <file>.' }], reason: 'One & only.', questions: [], path: ['office-pdf'], steps: [{ step: 'office-pdf', capability: 'office-pdf', intent: ODD_INTENT }] },
  ];
  return { ...info, graph: { ...info.graph, capabilities, examples } };
}
// flags.objectFields: the first record's text and the newest run's changelog are objects, where the file should hold text.
function withObjectFields(info) {
  const [first, ...records] = info.records, [newest, ...history] = info.history;
  return { ...info, records: [{ ...first, text: { en: first.text } }, ...records], history: [{ ...newest, changelog: { en: newest.changelog } }, ...history] };
}
const summaryOf = (id, path, info) => ({ id, path, project: info.project, plugin: { name: info.plugin.name, slug: info.plugin.slug, version: info.plugin.version }, inputs: info.inputs.length, capabilities: info.graph.capabilities.length, entries: info.graph.entries.length, examples: info.graph.examples.length, records: info.records.length, runs: info.history.length, digest: info.digest });

function scenarioData(scenario) {
  const idle = { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} };
  // What the service recorded for revision 1, the one a scenario starts at: a check of 14 minutes ago, a sync of a day ago.
  const recorded = (pending, extra = {}) => ({ last_check: ago(14), last_sync: ago(1500), revision: 1, pending, blockers: 0, errors: null, targets: { t1: { checked: ago(14), synced: ago(1500) } }, ...extra });
  const base = { targets: [harnessTarget('t1', 'codex', 'Codex isolated test')], plugins: [], installed: { t1: [] }, found: [foundHarness('codex', 'Codex')], byHarness: {}, jobs: [], activity: [], sync: idle, auto_sync: false };
  const package1 = () => plugin('p1', 'Package', ['t1'], [build('codex', '2')]);
  switch (scenario) {
    case 'fieldnotes-project': return { ...base, targets: [harnessTarget('codex', 'codex', 'Codex CLI')], projects: [{ id: 'fieldnotes', path: 'D:/Projects/fieldnotes/fieldnotes.mp' }] };
    case 'cold-codex': return { ...base, plugins: [package1()] };
    case 'changes': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '1')] }, found: [foundHarness('claude-code', 'Claude Code', { version: '2.1.4' })] };
    case 'recorded': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '1')] }, sync: recorded(1) };
    case 'recorded-ok': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2')] }, sync: recorded(0) };
    case 'recorded-errors': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2')] }, sync: recorded(0, { errors: 1 }) };
    case 'recorded-unseen': return { ...base, targets: [harnessTarget('t1', 'codex', 'Codex isolated test', { exclusive: true })], plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2'), installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)] }, sync: recorded(1) };
    case 'projects': return { ...base, targets: [harnessTarget('t1', 'claude-code', 'Claude Code'), harnessTarget('t2', 'codex', 'Codex')], plugins: [plugin('commit-helper', 'commit-helper', ['t1', 't2'], [build('claude-code', '2.1.0')], { upstream_version: 'v2.1.0' })], installed: { t1: [installedPlugin('commit-helper', 'commit-helper', '2.1.0')], t2: [] }, found: [], projects: [{ id: 'sample', path: 'D:/Muro/data/projects/sample.mp', adapters: ['claude-code', 'codex', 'opencode'], info: projectInfo('Sample', 'sample', { builtin: true }) }], settings: { ai: { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' } } };
    case 'legacy-project': {
      const data = scenarioData('projects');
      data.plugins.push(plugin('sample', 'Sample', ['t2'], [build('codex', '0.5.0', 'muro')], {
        project: 'sample', source: 'D:/isolated/data/project-cache/old/release/sample',
      }));
      return data;
    }
    case 'stored-settings': return { ...base, settings: { auto_sync: true, interval_minutes: 45 } };   // automatic sync on, an interval that is none of the listed ones
    case 'unlisted': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2'), installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)] } };
    case 'removals': return { ...base, targets: [harnessTarget('t1', 'codex', 'Codex isolated test', { exclusive: true })], plugins: [package1()], installed: { t1: [installedPlugin('old-snippets', 'old-snippets', '0.2.0', false), { ...installedPlugin('ghost', 'ghost', '1.0.0', false), present: false }] } };
    case 'two-harnesses': return { ...base, targets: [harnessTarget('t1', 'codex', 'Codex isolated test'), harnessTarget('t2', 'opencode', 'OpenCode isolated test')], plugins: [plugin('p1', 'Package', ['t1', 't2'], [build('codex', '2'), build('opencode', '2')])], installed: { t1: [installedPlugin('p1', 'Package', '1')], t2: [] }, found: [] };
    case 'first-run': return { ...base, targets: [], installed: {}, found: [foundHarness('claude-code', 'Claude Code', { version: '2.1.4' }), foundHarness('codex', 'Codex')], byHarness: { 'claude-code': [installedPlugin('commit-helper', 'commit-helper', '2.1.0', false)] } };
    case 'demo': case 'demo-synced': case 'demo-activity': {
      const done = scenario === 'demo-synced';
      const targets = [harnessTarget('claude', 'claude-code', 'Claude Code', { root: 'C:/Users/you/.claude', exclusive: true }), harnessTarget('codex', 'codex', 'Codex', { root: 'C:/Users/you/.codex' }), harnessTarget('opencode', 'opencode', 'OpenCode', { root: 'C:/Users/you/.config/opencode' })];
      const plugins = [
        plugin('sample', 'Sample', ['claude', 'codex', 'opencode'], [build('claude-code', '0.4.0'), build('codex', '0.4.0'), build('opencode', '0.4.0')], { source: 'github.com/owner/sample', upstream_version: 'v0.4.0' }),
        plugin('commit-helper', 'commit-helper', ['claude', 'codex'], [build('claude-code', '2.1.0'), build('codex', '2.1.0')], { upstream_version: 'v2.1.0' }),
        plugin('test-runner', 'test-runner', ['opencode'], [build('opencode', '1.0.4')], { policy: 'pinned', pinned_version: '1.0.4', upstream_version: 'v1.0.4' }),
        plugin('docs-writer', 'docs-writer', ['claude', 'opencode'], [build('claude-code', '1.2.0'), ...(done ? [build('opencode', '1.2.0')] : [])], { upstream_version: 'v1.2.0' }),
        plugin('sql-companion', 'sql-companion', [], [], { policy: 'head', upstream_version: '' }),
      ];
      const installed = { claude: [installedPlugin('sample', 'Sample', done ? '0.4.0' : '0.3.0'), installedPlugin('commit-helper', 'commit-helper', '2.1.0'), installedPlugin('docs-writer', 'docs-writer', '1.2.0'), ...(done ? [] : [installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)])], codex: [installedPlugin('sample', 'Sample', '0.4.0'), installedPlugin('commit-helper', 'commit-helper', '2.1.0')], opencode: [installedPlugin('sample', 'Sample', '0.4.0'), ...(done ? [installedPlugin('test-runner', 'test-runner', '1.0.4'), installedPlugin('docs-writer', 'docs-writer', '1.2.0')] : [])] };
      const [checkedAgo, syncedAgo] = done ? [3, 3] : [14, 1500];
      const synced = { claude: { checked: ago(checkedAgo), synced: ago(syncedAgo) }, codex: { checked: ago(checkedAgo), synced: ago(syncedAgo) }, opencode: { checked: ago(checkedAgo), synced: ago(syncedAgo) } };
      const jobs = done ? [] : [{ id: 'job-1', plugin_id: 'docs-writer', harness: 'opencode', status: 'running', phase: 'harmonization', budget_usd: 2, log_path: 'C:/Users/you/Muro/data/jobs/job-1/log.txt', message: 'Claude Code is adapting the plugin for OpenCode.', time: ago(3) }];
      const earlier = scenario === 'demo-activity' ? [{ id: 'a0', time: ago(2900), action: 'check', status: 'failed', message: 'Plan calculated; sources not resolved: sql-companion' }] : [], between = scenario === 'demo-activity' ? [{ id: 'a3', time: ago(75), action: 'Automatic sync', status: 'complete', message: '2 changes applied' }] : [];
      const activity = [...earlier, { id: 'a1', time: ago(1500), action: 'sync', status: 'complete', message: '3 operations applied. Inventory refreshed.' }, ...between, { id: 'a2', time: ago(14), action: 'check', status: 'complete', message: 'Sources resolved and plan calculated' }];
      return { ...base, auto_sync: true, targets, plugins, installed, found: [foundHarness('pi', 'Pi', { version: '0.9.1' }), foundHarness('hermes', 'Hermes Agent', { version: '0.7.0' })], jobs, activity, sync: { last_check: ago(checkedAgo), last_sync: ago(syncedAgo), revision: null, pending: null, blockers: null, errors: null, targets: synced } };
    }
    default: return { ...base, found: [foundHarness('codex', 'Codex', { version: 'test' })] };
  }
}

export function createTransport(scenario = 'default') {
  const data = scenarioData(scenario), calls = [];
  const flags = { rejectSave: false, rejectSettings: false, blockPlan: false, unreadable: false, brokenMarketplace: false, checkErrors: false, checkDelay: 0, planDelay: 0, applyDelay: 0, rejectApply: false, autostartUnsupported: false, instructionFiles: [], instructionStale: false, staleSettings: 0, pickPath: 'D:/Projects/extra/Notes.mp', noShellActions: false, rejectInstall: false, installLeavesTargets: false, simulate: 'selected', simulateDelay: 0, simulateError: '', bigGraph: false, emptyGraph: false, noEntries: false, oddNames: false, objectFields: false, projectChanged: false };
  const reg = { schema: 1, revision: 1, plugins: data.plugins, targets: data.targets, settings: { auto_sync: data.auto_sync, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' } } };
  Object.assign(reg.settings, data.settings);   // a scenario may store settings of its own
  Object.assign(flags, { envSet: [], noEnvCheck: false });   // the knobs of the Settings AI section
  Object.assign(flags, { pickFolder: 'D:/Projects', existingFiles: [], missingFolders: [], runEnds: '', runDelay: 0, runMessage: '', cancelHolds: false, updatesError: '', staleDeletes: 0 });   // the knobs of the project writes
  Object.assign(flags, { releaseError: '', releaseHeld: false, releaseCaller: false, releaseDelay: 0 });   // the knobs of a release
  // Resolved .mp sources, keyed by the source entered in Sync. A repository and a local file both supply the same result shape.
  flags.projectSources = {};
  flags.holdInspection = false;
  let finishInspection, finishResolution;
  const unscanned = new Set(scenario === 'cold-codex' ? ['t1'] : []);
  const installed = data.installed, plans = new Map(), sync = data.sync, activity = data.activity, jobs = data.jobs;
  const projects = structuredClone(data.projects || []);
  let autostart = false, seeded = false, planNumber = 0, activityNumber = 0;
  const STALE = 'Registry revision changed; refresh before saving';   // the service's own words
  const log = (action, status, message) => activity.push({ id: 'a' + ++activityNumber + 'x', time: ago(0), action, status, message });
  const inventory = t => {
    if (unscanned.has(t.id)) return { target_id: t.id, complete: false, unscanned: true, supported: true, error: 'Run inventory scan', plugins: [] };
    if (flags.unreadable && t.id === reg.targets[0]?.id) return { target_id: t.id, complete: false, error: 'Configuration folder not found', supported: true, plugins: [] };
    const warnings = flags.brokenMarketplace && t.id === reg.targets[0]?.id ? ['The marketplace old-notes points to a folder that is gone: D:/Projects/gone/old-notes'] : [];
    return { target_id: t.id, complete: true, error: null, warnings, supported: true, plugins: installed[t.id] || [] };
  };
  const instructions = () => reg.plugins.map(p => ({ plugin_id: p.id, path: p.custom_instructions_dir || 'D:/isolated/data/custom-instructions/' + p.id, files: flags.instructionFiles, digest: 'fixture-digest', stale_harnesses: flags.instructionStale ? [reg.targets.find(t => p.targets.includes(t.id))?.harness].filter(Boolean) : [] }));
  const snapshot = () => structuredClone({ registry: { ...reg, ...(projects.length ? { projects: projects.map(({ id, path }) => ({ id, path })) } : {}) }, inventory: reg.targets.map(inventory), activity, sync, jobs, data_dir: 'D:/isolated/data', custom_instructions: instructions() });
  const mutate = payload => {
    if (payload.revision !== undefined && payload.revision !== reg.revision) throw new Error(STALE);
    if (flags.rejectSave) throw new Error('Version conflict: reload registry');
  };
  const bump = () => { reg.revision++; return snapshot(); };
  function resolveArchive(plugin) {
    const linked = projects.find(project => project.id === plugin.project);
    const archive = flags.projectSources[linked?.path ?? plugin.source];
    if (!archive) return;
    if (archive.error) {
      plugin.project_source_error = archive.error;
      throw new Error(archive.error);
    }
    delete plugin.project_source_error;
    plugin.resolved_project = { path: archive.file, digest: archive.digest, harnesses: archive.harnesses };
    plugin.upstream_version = archive.version;
    plugin.distributions = archive.harnesses.map(h => build(h, archive.version));
  }
  // The service binds a new plugin to the installation it is added from (adopt), refusing what it cannot bind.
  const adopt = ({ plugin, adopt: { target_id, native_id } }) => {
    if (reg.plugins.some(p => p.id === plugin.id)) throw new Error(`An installation is adopted by a plugin that is being added; ${plugin.id} is in the list already`);
    const target = reg.targets.find(t => t.id === target_id);
    if (!target) throw new Error('Target not found');
    const entry = (installed[target_id] || []).find(i => i.id === native_id);
    if (!entry) throw new Error(`${native_id} is not installed on ${target.name}`);
    if (entry.managed) throw new Error(`${native_id} already belongs to ${entry.registry_id} on ${target.name}`);
    Object.assign(entry, { managed: true, registry_id: plugin.id });
  };
  function makePlan(only, reinstall, pluginId) {
    if (pluginId && flags.rejectPluginPlan) throw new Error('The plugin plan cannot be refreshed');
    const operations = [], blockers = [];
    for (const t of reg.targets.filter(t => t.enabled && (!only || t.id === only))) {
      unscanned.delete(t.id);
      const inv = inventory(t);
      if (!inv.complete) { blockers.push(`${t.name}: ${inv.error}`); continue; }
      const before = blockers.length, wanted = new Set();
      for (const p of reg.plugins.filter(p => p.targets.includes(t.id))) {
        const want = p.distributions.find(d => d.harness === t.harness && d.path), have = inv.plugins.find(i => i.registry_id === p.id);
        if (have) wanted.add(have.id);
        if (p.project_source_error) { blockers.push(`${t.name} / ${p.name}: ${p.project_source_error}`); continue; }
        if (flags.projectChanged && p.project) { blockers.push(`${t.name} / ${p.name}: Project file changed: open the project again`); continue; }   // the registry's words for a build older than its project file
        if (!want) { blockers.push(`${t.name} / ${p.name}: no build for this harness: point the source at the plugin's folder, or adapt the plugin with AI`); continue; }
        const kind = !have ? 'install' : reinstall === p.id ? 'reinstall' : have.version !== want.version ? 'update' : null;
        if (kind) operations.push({ target_id: t.id, plugin_id: p.id, name: p.name, kind, from_version: have?.version || '', to_version: want.version, reason: kind === 'install' ? 'Missing desired distribution' : 'Reconcile desired artifact' });
      }
      if (t.exclusive && blockers.length === before) for (const i of inv.plugins) if (!wanted.has(i.id)) operations.push({ target_id: t.id, plugin_id: i.registry_id || '', name: i.name, kind: 'remove', from_version: i.version, to_version: '', reason: 'Not in desired registry for this target', native_id: i.id, ...(i.present === false ? { present: false } : {}) });   // the service's Contract 2: a removal copies the entry's `present` when it is false
    }
    const broken = reg.targets.find(t => t.enabled && (!only || t.id === only) && inventory(t).warnings?.length);
    if (broken) operations.push({ target_id: broken.id, plugin_id: '', name: 'old-notes', kind: 'remove-marketplace', from_version: '', to_version: '', reason: inventory(broken).warnings[0], plugins: ['notes@old-notes'] });
    if (flags.blockPlan) blockers.push('Codex isolated test: Inventory incomplete');
    operations.sort((a, b) => (a.kind === 'remove') - (b.kind === 'remove'));
    const plan = { id: 'plan-' + ++planNumber, revision: reg.revision, operations: pluginId ? operations.filter(op => op.plugin_id === pluginId && ['install', 'update', 'reinstall', 'activate'].includes(op.kind)) : operations, blockers, ...(pluginId ? { plugin_id: pluginId } : {}) };
    plans.set(plan.id, plan);
    if (pluginId) return structuredClone(plan);
    const checked = reg.targets.filter(t => t.enabled && (!only || t.id === only)).map(t => t.id), time = ago(0);
    for (const id of checked) sync.targets[id] = { ...sync.targets[id], checked: time, synced: sync.targets[id]?.synced ?? null };
    if (!only) Object.assign(sync, { last_check: time, revision: reg.revision, pending: operations.length, blockers: blockers.length });
    return structuredClone(plan);
  }
  const projectOf = id => { const p = projects.find(x => x.id === id); if (!p) throw new Error('Project not found: ' + id); return p; };
  // The runtime's install_project {id, targets}: the ids are managed harnesses (enabled targets of the registry); the project's build for each distinct kind of them is put in the list as the plugin
  // named by its slug, and its targets become exactly those ids (a paused target the plugin already holds stays). A target not named is not touched. flags.installLeavesTargets models a runtime that
  // builds the plugin and leaves its targets alone. Installing takes the project file as it is now: a changed file (flags.projectChanged) is no longer.
  function installProject({ id, targets }) {
    if (!Array.isArray(targets) || !targets.length) throw new Error('Name at least one target to install on');
    const named = [...new Set(targets)].map(tid => {
      const t = reg.targets.find(x => x.id === tid);
      if (!t) throw new Error(`No harness is managed under the id ${tid}`);
      if (!t.enabled) throw new Error(`${t.name} is paused: switch it on in Sync first`);
      return t;
    });
    const kinds = [...new Set(named.map(t => t.harness))];
    if (flags.rejectInstall) throw new Error(`The project has no build for ${kinds[0]}`);
    const project = projectOf(id);
    for (const h of kinds) if (!project.adapters.includes(h)) throw new Error(`The project has no build for ${h}`);
    const { slug, name, version } = project.info.plugin, distributions = kinds.map(h => build(h, version));
    let made = reg.plugins.find(p => p.project === id);
    if (made) made.distributions = distributions;
    else reg.plugins.push(made = plugin(slug, name, [], distributions, { project: id, source: 'project:' + id, upstream_version: 'v' + version }));
    if (!flags.installLeavesTargets) made.targets = [...named.map(t => t.id), ...made.targets.filter(tid => !named.some(t => t.id === tid) && reg.targets.some(t => t.id === tid && !t.enabled))];
    flags.projectChanged = false;
    reg.revision++;
    return { plugin_id: made.id };
  }
  // The runtime's remove_project {id, revision}: the entry leaves the list and nothing else.
  function removeProject(payload) {
    mutate(payload);
    projectOf(payload.id);
    projects.splice(projects.findIndex(p => p.id === payload.id), 1);
    return bump();
  }
  const unknownShellAction = action => { if (flags.noShellActions) throw new Error('Unknown registry action: ' + action); };
  // ---------- the write side of the projects ----------
  // What the runtime does for create_project, project_job, edit_project, delete_project, release_project, project_updates, cancel_job and the shell's pick_folder (crates/muro-desktop-runtime/src/project_jobs.rs, ADR-0032),
  // with its refusals in its own words and in its own order, each checked here by its own copy (never by the page's: the fake is the other side of the wire). A change of the package is an AI run, a job of kind
  // "project" that goes on until a test ends it (behind.finish) or a flag makes it end by itself (flags.runEnds); what a run did is mechanical, as the factory's commit is. The fake judges nothing.
  const CHANGED = 'The project file changed since it was opened: open it again and repeat the change';
  // The phases of a project run that the runtime's cancel and the page depend on (project_jobs.rs), and the limit of a project run (jobs::run).
  const AGENT_PHASE = 'AI intake and harmonization', SAVING_PHASE = 'Building and saving the project', PROJECT_RUN_MINUTES = 120;
  const NEEDS_CLAUDE = 'Making and changing a project needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
  const OPERATIONS = ['harmonize', 'add_input', 'remove_input', 'move_pin', 'instructions'];
  const isControl = c => /\p{Cc}/u.test(c);
  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const encoded = text => new TextEncoder().encode(text).length;
  // The runtime's `line`: one trimmed line of at most 200 characters, never empty.
  const line = (value, what) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new Error(`${what} is required`);
    if ([...text].length > 200 || [...text].some(isControl)) throw new Error(`${what} must be one line of at most 200 characters`);
    return text;
  };
  // The runtime's `request_text`: optional, at most 4000 characters, line breaks and tabs allowed.
  const requestText = (value, what) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if ([...text].length > 4000) throw new Error(`${what} must be at most 4000 characters`);
    if ([...text].some(c => isControl(c) && !'\n\t\r'.includes(c))) throw new Error(`${what} must be plain text`);
    return text.replace(/\r\n/g, '\n');
  };
  const isSlug = slug => slug.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
  // What `Path::is_absolute` takes on Windows, where the runtime runs: a drive and a separator, or a share.
  const isAbsolute = path => /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\/]/.test(path);
  const sameFile = path => String(path).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();   // Windows: either slash, any case
  // `validate_budget` and the runtime's default: a missing, null or non-numeric budget is 5.
  const budgetOf = payload => {
    const budget = typeof payload.budget_usd === 'number' && Number.isFinite(payload.budget_usd) ? payload.budget_usd : 5;
    if (!(budget > 0 && budget <= 100)) throw new Error('The AI budget must be above 0 and at most 100 USD');
    return budget;
  };
  const stepOf = (payload, fallback) => {
    if (typeof payload.step !== 'string') return fallback;
    if (!['patch', 'minor', 'major'].includes(payload.step)) throw new Error(`The version step must be patch, minor or major, not ${payload.step}`);
    return payload.step;
  };
  const repositoryOf = value => {
    if (value === null || value === undefined) return null;
    const url = line(value.url, 'The repository address');
    if (!url.startsWith('https://') || url.includes(' ')) throw new Error('The repository address must be an https:// address');
    const given = field => (typeof value[field] === 'string' ? value[field].trim() : '');
    return { url, branch: given('branch') ? line(given('branch'), 'The branch') : 'main', tag_prefix: given('tag_prefix') ? line(given('tag_prefix'), 'The tag prefix') : '' };
  };
  // An input: an https address without spaces, or the full path of a folder that is there.
  const sourceOf = value => {
    const text = line(value, 'Where the input comes from');
    if (text.startsWith('https://')) {
      if (text.length === 'https://'.length || /\s/u.test(text.slice('https://'.length))) throw new Error("An input's address must be an https:// address without spaces");
      return text;
    }
    if (!isAbsolute(text)) throw new Error('An input is an https:// address or the full path of a folder on this computer');
    if (flags.missingFolders.includes(text)) throw new Error(`The folder is missing: ${text}`);
    return text;
  };
  const inputIdOf = from => (from.split('#')[0].split(/[\\/]/).filter(Boolean).pop() || 'input').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'input';
  // `instruction_edits`: Markdown files under plain names, each written whole or (text null) removed.
  const instructionEdits = value => {
    if (!Array.isArray(value)) throw new Error('Name the instruction files to write or remove');
    if (!value.length) throw new Error('Change at least one instruction file');
    if (value.length > 50) throw new Error('At most 50 instruction files at once');
    const edits = [];
    for (const item of value) {
      const path = typeof item?.path === 'string' ? item.path.trim() : '';
      if (!path || encoded(path) > 200) throw new Error('An instruction file needs a name');
      if (!path.toLowerCase().endsWith('.md')) throw new Error(`An instruction file is Markdown: its name ends in .md (${path})`);
      for (const part of path.split('/')) {
        if (!part || part === '.' || part === '..' || /[. ]$/.test(part) || [...part].some(c => isControl(c) || '\\:<>"|?*'.includes(c))) throw new Error(`An instruction file's name is plain folder and file names separated by / (${path})`);
      }
      if (edits.some(e => e.path.toLowerCase() === path.toLowerCase())) throw new Error(`The instruction file ${path} is named twice`);
      const text = item.text === undefined ? null : item.text;
      if (text !== null && typeof text !== 'string') throw new Error(`The text of ${path} must be text, or null to remove it`);
      if (typeof text === 'string' && encoded(text) > 256 * 1024) throw new Error(`${path} is larger than 256 KiB`);
      edits.push({ path, text });
    }
    return edits;
  };
  // The factory's `check_records`: what a record must be, and the records as they are kept.
  const checkRecords = records => {
    if (!Array.isArray(records)) throw new Error('The records must be a list');
    const seen = new Set();
    return records.map((record, index) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(`Record ${index + 1} must be an object`);
      const id = record.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) throw new Error(`Record ${index + 1} needs an id of letters, digits, dots, dashes or underscores`);
      if (seen.has(id)) throw new Error(`Two records have the id ${id}`);
      seen.add(id);
      if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date)) throw new Error(`Record ${id} needs a date as YYYY-MM-DD`);
      const [year, month, day] = record.date.split('-').map(Number), real = new Date(Date.UTC(year, month - 1, day));
      if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) throw new Error(`Record ${id} needs a real date`);
      const subjects = record.subjects === undefined ? [] : record.subjects;
      if (!Array.isArray(subjects) || !subjects.every(s => typeof s === 'string' && s.trim())) throw new Error(`Record ${id}: subjects must be a list of names`);
      if (typeof record.text !== 'string' || !record.text.trim()) throw new Error(`Record ${id} needs a text`);
      if ([...record.text].length > 20000) throw new Error(`Record ${id} is longer than 20000 characters`);
      if (record.author !== 'muro' && record.author !== 'you') throw new Error(`Record ${id}: the author is muro or you`);
      if (typeof record.binding !== 'boolean') throw new Error(`Record ${id}: binding must be true or false`);
      return { id, date: record.date, subjects: subjects.map(s => s.trim()), text: record.text.trim(), author: record.author, binding: record.binding };
    });
  };
  const withInstructions = (held, edits) => {
    const files = structuredClone(held ?? []);
    for (const { path, text } of edits) {
      const at = files.findIndex(f => f.path === path);
      if (text === null) { if (at < 0) throw new Error(`The instruction file ${path} is not in the project`); files.splice(at, 1); }
      else if (at >= 0) files[at].text = text;
      else files.push({ path, text });
    }
    return files;
  };
  const bumpVersion = (version, step) => {
    const [major, minor, patch] = version.split('.').map(Number);
    return step === 'major' ? `${major + 1}.0.0` : step === 'minor' ? `${major}.${minor + 1}.0` : step === 'none' ? version : `${major}.${minor}.${patch + 1}`;
  };
  // A project's file was written: it has another digest.
  const rewrite = entry => { entry.writes = (entry.writes || 0) + 1; entry.info.digest = digestOf(`${entry.id}:${entry.writes}`); };
  // What the factory's commit writes after a run, mechanically: the version, the run in the history, an entry of the changelog, the new digest.
  const recordRun = (entry, { step, title, budget }) => {
    const info = entry.info, version = bumpVersion(info.plugin.version, step), time = nowIso();
    Object.assign(info.plugin, { version });
    Object.assign(info.project, { version, changed: time });
    info.history = [{ id: `${info.plugin.slug}-v${version}`, time, version, status: 'completed', budget_usd: budget, engine: 'claude-code', operation: title, pins: Object.fromEntries(info.inputs.map(i => [i.id, i.release || i.commit])), changelog: `${title}.` }, ...info.history];
    info.changelog = `# ${info.plugin.name} ${version}\n\n- ${title}.\n\n${info.changelog}`;
    rewrite(entry);
  };
  const agentCheck = () => { if ((reg.settings.ai?.harness ?? reg.settings.agent ?? 'claude-code') !== 'claude-code') throw new Error(NEEDS_CLAUDE); };
  const ensureIdle = () => {
    const going = jobs.find(j => j.status === 'running');
    if (going) throw new Error(`Another AI run is in progress (${going.title ?? going.phase ?? 'an adaptation'}): wait for it to finish, or cancel it in Activity`);
  };
  const listedFile = id => {
    const entry = projects.find(x => x.id === id);
    if (!entry) throw new Error('That project is not in your list');
    return entry;
  };
  const runningOn = id => jobs.some(j => j.status === 'running' && j.kind === 'project' && j.project_id === id);
  const digestGiven = (digest, what) => { if (typeof digest !== 'string' || !/^[0-9a-fA-F]{64}$/.test(digest)) throw new Error(`Open the project again: the ${what} names no version of its file`); };
  // The jobs, as the runtime lists them: the newest first (the runtime sorts by the time they began; the later one of two in the same second is the newer here).
  const newestFirst = () => jobs.map((job, at) => [job, at]).sort(([a, i], [b, j]) => (Number(b.time) - Number(a.time)) || (j - i)).map(([job]) => job);
  let runs = 0;
  const effects = new Map();
  function startRun(fields, effect) {
    const id = `00000000-0000-4000-8000-${String(++runs).padStart(12, '0')}`;
    const job = { id, kind: 'project', time: nowSeconds(), status: 'running', log_path: `D:/isolated/data/jobs/${id}/output.log`, ...fields };
    jobs.push(job);
    effects.set(id, effect);
    if (flags.runEnds) setTimeout(() => settle(job, flags.runEnds), flags.runDelay);
    return structuredClone(job);
  }
  // The end of a run: its status, the phase "Finished" and the message the runtime writes. A run that completes does its effect; one whose effect fails (an instruction file to remove that is not there) failed.
  function settle(job, status, text) {
    if (job.status !== 'running') return;
    const effect = effects.get(job.id);
    effects.delete(job.id);
    const project = job.kind === 'project', created = job.operation === 'create';
    const said = {
      completed: !project ? 'Adapter validated and added to registry; review a new sync plan to install' : created ? 'The project was created and added to your list. Install it with Install via Sync…' : 'The project was saved. Use Install via Sync… to bring the change to your harnesses',
      failed: `${flags.runMessage || 'The AI run failed (exit code: 1); see output.log'}${project ? '. The project file was not changed' : ''}`,
      // The runtime's own words: the agent's step says the AI run was cancelled, the others that the job was cancelled.
      cancelled: project ? (job.phase === AGENT_PHASE ? 'The AI run was cancelled. The project file was not changed' : 'Job cancelled. The project file was not changed') : 'Job cancelled',
      interrupted: 'Previous desktop session ended; inspect log and retry. No automatic installation.',
    };
    if (status === 'completed') {
      try { effect?.(); } catch (error) { status = 'failed'; text = `${error.message}. The project file was not changed`; }
    }
    Object.assign(job, { status, phase: status === 'interrupted' ? job.phase : 'Finished', message: text ?? said[status] ?? 'Finished' });
  }
  // create_project {name, slug, author, folder, inputs: [{source}], request, repository?, budget_usd}
  function createProject(p) {
    agentCheck();
    const name = line(p.name, 'The project name');
    const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
    if (!isSlug(slug)) throw new Error('The plugin id is lowercase letters and digits joined by dashes, such as my-plugin');
    const author = line(p.author, 'The author');
    const folder = line(p.folder, 'The folder');
    if (!isAbsolute(folder)) throw new Error('Choose the folder with its full path');
    if (flags.missingFolders.includes(folder)) throw new Error(`The folder is missing: ${folder}`);
    const file = `${folder.replace(/[\\/]+$/, '')}/${slug}.mp`;
    if (flags.existingFiles.some(f => sameFile(f) === sameFile(file)) || projects.some(x => sameFile(x.path) === sameFile(file))) throw new Error(`${file} already exists: choose another folder or plugin id`);
    if (projects.some(x => x.id === slug)) throw new Error(`A project for ${slug} is already in your list`);
    if (reg.plugins.some(x => x.id === slug)) throw new Error(`A plugin named ${slug} is already in your list: choose another plugin id`);
    if (!Array.isArray(p.inputs)) throw new Error('Add at least one input');
    if (!p.inputs.length) throw new Error('Add at least one input: a project is made from plugins and skills');
    if (p.inputs.length > 20) throw new Error('At most 20 inputs at once');
    const sources = [];
    for (const input of p.inputs) {
      const from = sourceOf(input?.source);
      if (sources.includes(from)) throw new Error(`The input ${from} is named twice`);
      sources.push(from);
    }
    requestText(p.request, 'The request');
    const repository = repositoryOf(p.repository), budget = budgetOf(p);
    ensureIdle();
    const title = `New project ${name}`;
    return startRun({ project_id: slug, operation: 'create', title, phase: 'Starting the project', budget_usd: budget, file, message: 'The AI makes the project; nothing is installed' }, () => {
      const info = projectInfo(name, slug);
      const inputs = sources.map(from => ({ id: inputIdOf(from), url: from.startsWith('https://') ? from : null, pin: 'release', release: 'v1.0.0', commit: '0123456789abcdef', license: 'MIT', paths: ['skills'], became: { capability: 1, 'always-on': 0, hook: 0, dropped: 0 } }));
      Object.assign(info, { inputs, decisions: [], records: [], history: [], changelog: '', instructions: [] });
      Object.assign(info.project, { author, repository, version: '0.1.0', builtin: false });
      info.plugin.version = '0.1.0';
      const entry = { id: slug, path: file, adapters: ['claude-code', 'codex'], info, writes: 0 };
      projects.push(entry);
      recordRun(entry, { step: 'none', title, budget });
    });
  }
  // project_job {id, operation, digest, budget_usd, step?, request?, source?, input?, to?, instructions?}
  function projectJob(p) {
    const operation = typeof p.operation === 'string' ? p.operation : '';
    if (!OPERATIONS.includes(operation)) throw new Error(`Unknown change ${operation}: it is one of ${OPERATIONS.join(', ')}`);
    agentCheck();
    const entry = listedFile(p.id);
    digestGiven(p.digest, 'change');
    if (p.digest !== entry.info.digest) throw new Error(CHANGED);
    const budget = budgetOf(p), step = stepOf(p, operation === 'add_input' || operation === 'remove_input' ? 'minor' : 'patch');
    ensureIdle();
    const inputs = entry.info.inputs, known = id => inputs.some(i => i.id === id);
    requestText(p.request, 'The request');
    let title, change = () => {};
    if (operation === 'harmonize') title = 'Harmonize again';
    if (operation === 'add_input') {
      const from = sourceOf(p.source);
      title = `Add the input ${from}`;
      change = () => entry.info.inputs.push({ id: inputIdOf(from), url: from.startsWith('https://') ? from : null, pin: 'release', release: 'v1.0.0', commit: '0123456789abcdef', license: 'MIT', paths: ['skills'], became: { capability: 1, 'always-on': 0, hook: 0, dropped: 0 } });
    }
    if (operation === 'remove_input') {
      const id = line(p.input, 'The input');
      if (!known(id)) throw new Error(`This project has no input ${id}`);
      if (inputs.length <= 1) throw new Error(`A project needs at least one input: add another before removing ${id}`);
      title = `Remove the input ${id}`;
      change = () => { entry.info.inputs = entry.info.inputs.filter(i => i.id !== id); entry.info.decisions = entry.info.decisions.filter(d => d.source !== id); };
    }
    if (operation === 'move_pin') {
      const id = line(p.input, 'The input');
      if (!known(id)) throw new Error(`This project has no input ${id}`);
      const to = typeof p.to === 'string' && p.to.trim() ? line(p.to.trim(), 'The release to move to') : '';
      title = `Move ${id} to ${to || 'its newest release'}`;
      change = () => { entry.info.inputs.find(i => i.id === id).release = to || 'v9.9.9'; };
    }
    if (operation === 'instructions') {
      const edits = instructionEdits(p.instructions);
      title = 'Harmonize the custom instructions';
      change = () => { entry.info.instructions = withInstructions(entry.info.instructions, edits); };
    }
    return startRun({ project_id: p.id, operation, title, phase: 'Opening the project', budget_usd: budget, file: entry.path, message: 'The AI changes the project; the file is replaced only when the build succeeds' }, () => {
      // The factory commits only a file that is still the one the run started from.
      if (entry.info.digest !== p.digest) throw new Error(CHANGED);
      change();
      recordRun(entry, { step, title, budget });
    });
  }
  // edit_project {id, digest, name?, author?, repository?, records?, changelog?}: offline, on the file the page read; repository null takes it away.
  function editProject(p) {
    const entry = listedFile(p.id);
    digestGiven(p.digest, 'edit');
    if (runningOn(entry.id)) throw new Error('An AI run is changing this project: wait for it to finish');
    const set = {};
    if (p.name !== null && p.name !== undefined) set.name = line(p.name, 'The project name');
    if (p.author !== null && p.author !== undefined) set.author = line(p.author, 'The author');
    if (p.repository !== undefined) set.repository = repositoryOf(p.repository);
    if (p.records !== undefined && !Array.isArray(p.records)) throw new Error('The records must be a list');
    if (p.changelog !== undefined && typeof p.changelog !== 'string') throw new Error('The changelog must be text');
    if (!Object.keys(set).length && p.records === undefined && p.changelog === undefined) throw new Error('Nothing to change');
    if (p.digest !== entry.info.digest) throw new Error(CHANGED);
    const records = p.records === undefined ? undefined : checkRecords(p.records);
    if (p.changelog !== undefined && encoded(p.changelog) > 1024 ** 2) throw new Error('The changelog must be text of at most 1 MiB');
    Object.assign(entry.info.project, set, { changed: nowIso() });
    if (records) entry.info.records = records;
    if (p.changelog !== undefined) entry.info.changelog = !p.changelog || p.changelog.endsWith('\n') ? p.changelog : p.changelog + '\n';
    rewrite(entry);
    return { path: entry.path, digest: entry.info.digest };
  }
  // delete_project {id, revision}: the project leaves the list and its file is deleted (the runtime asks for the registry's revision, as every save does).
  function deleteProject(p) {
    const entry = listedFile(p.id);
    if (runningOn(p.id)) throw new Error('An AI run is changing this project: wait for it to finish, or cancel it');
    if (flags.staleDeletes > 0) { flags.staleDeletes--; reg.revision++; throw new Error(STALE); }   // the registry moved behind the page's back
    if (p.revision !== reg.revision) throw new Error(STALE);
    projects.splice(projects.indexOf(entry), 1);
    flags.existingFiles = flags.existingFiles.filter(f => sameFile(f) !== sameFile(entry.path));
    return bump();
  }
  // release_project {id, digest, init?, dry_run?}: the factory puts the project's file into the repository its project.json names, with the person's own Git, and answers the document the command
  // prints. The refusals come in the runtime's order (the list, the shape of the digest, the two switches, a run that changes the project) and then the command's own (the file changed, no
  // repository, what the repository says). The file is read and never written: its digest stays.
  const NO_CALLER = "No workflow of the repository calls Muro's store workflow, so nothing builds the store or publishes the release there: run this command with --init, or add the caller of docs/project-store.md as .github/workflows/release.yml";
  const switchOf = (value, key) => {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
    return value;
  };
  async function releaseProject(p) {
    const entry = listedFile(p.id);
    digestGiven(p.digest, 'release');
    const init = switchOf(p.init, 'init'), dryRun = switchOf(p.dry_run, 'dry_run');
    if (runningOn(entry.id)) throw new Error('An AI run is changing this project: wait for it to finish');
    if (flags.releaseDelay) await new Promise(done => setTimeout(done, flags.releaseDelay));
    if (p.digest !== entry.info.digest) throw new Error(CHANGED);
    const repo = entry.info.project.repository;
    if (!repo) throw new Error('This project names no repository: give it one with `muro project edit --repository`');
    if (flags.releaseError) throw new Error(flags.releaseError);
    const { name, slug, version } = entry.info.plugin, file = `${slug}.mp`, tag = `${repo.tag_prefix}${version}`;
    const adds = init && !flags.releaseCaller, warning = init || flags.releaseCaller ? '' : ` ${NO_CALLER}`;
    const answer = { repository: repo.url, branch: repo.branch, file, version, tag, pushed: false, commit: null, initialized: adds, reason: '' };
    if (flags.releaseHeld && !adds) answer.reason = `This file is already released under this version: nothing to do.${warning}`;
    else if (dryRun) answer.reason = `Dry run: nothing was pushed. It would push ${file} to ${repo.branch} as the commit "${name} ${version}".${warning}`;
    else {
      // The file is already there and only the workflow is missing: the workflow is pushed alone, and that push starts no release.
      const said = flags.releaseHeld ? `The repository already holds this file as ${file}; .github/workflows/release.yml was pushed to ${repo.branch}. Run that workflow by hand to release it as ${tag}.`
        : `Pushed ${adds ? `${file} and .github/workflows/release.yml` : file} to ${repo.branch}.${adds || flags.releaseCaller ? ` The repository's workflow releases it as ${tag}.` : ''}${warning}`;
      Object.assign(answer, { pushed: true, commit: digestOf(`release:${entry.id}:${version}`).slice(0, 40), reason: said });
    }
    return answer;
  }
  // extract_project {id, harness, folder}: the factory writes the plugin the file carries for one harness into folder/<harness>/ and answers what was written. The refusals come in the runtime's order
  // (the list, a harness Muro builds, a full path) and then the command's own (a harness the build lacks: `adapters` of the entry; a folder already there: what was extracted before). No file is written here.
  const extracted = new Set();
  function extractBuild(p, adapters) {
    const harness = String(p.harness ?? ''), folder = String(p.folder ?? '').trim();
    if (!['claude-code', 'codex', 'opencode', 'pi', 'hermes'].includes(harness)) throw new Error(`No Muro adapter for the harness ${harness}`);
    if (!isAbsolute(folder)) throw new Error('Name the folder to extract into by its full path');
    if (!adapters.includes(harness)) throw new Error(`This project's build has no adapter for ${harness}: it has ${[...adapters].sort().join(', ')}`);
    const target = `${folder.replace(/[\\/]+$/, '')}/${harness}`;
    if (extracted.has(target)) throw new Error(`${target} already exists: choose another folder`);
    extracted.add(target);
    return { harness, folders: [target] };
  }
  // project_updates {id}: how each input's pin stands against its upstream (the first input is behind, at v9.9.9, the others are current).
  function projectUpdates({ id }) {
    const entry = listedFile(id);
    if (flags.updatesError) throw new Error(flags.updatesError);
    return { id, digest: entry.info.digest, inputs: entry.info.inputs.map((i, n) => ({ id: i.id, pin: i.pin, pinned: i.release || i.commit || '', upstream: n === 0 ? 'v9.9.9' : i.release || i.commit, status: n === 0 ? 'behind' : 'current', note: '' })) };
  }
  // cancel_job {id}: the runtime only asks the run to stop and says so; the run ends a moment later (here at once, unless flags.cancelHolds).
  function cancelJob({ id }) {
    const job = jobs.find(j => j.id === id);
    if (!job) throw new Error('Job not found');
    // The commit cannot be taken back half way: from the saving phase on the runtime refuses a cancel, and the run ends by itself.
    if (job.kind === 'project' && job.phase === SAVING_PHASE) throw new Error('The run is building and saving the project: it can no longer be cancelled, and it ends by itself');
    if (!flags.cancelHolds) settle(job, 'cancelled');
    return { message: 'Cancellation requested; registry remains unchanged until validation completes' };
  }
  // The runtime's simulate (plan 2, Tasks 3 and 5): the factory's `check` result plus the engine that answered. The fake decides nothing from the words of the task: the answer is the flag's.
  // The page names each run (`run`, as the runtime lets it: letters, digits, - and _, 64 at most) so it can ask for it to be stopped: `cancel_simulation {run}`.
  const running = new Map();
  async function simulate({ id, task, run }) {
    projectOf(id);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(run ?? '')) throw new Error('Invalid run ID');
    if (flags.simulateDelay) await new Promise((done, stop) => { const timer = setTimeout(done, flags.simulateDelay); running.set(run, () => { clearTimeout(timer); stop(new Error('The simulation was cancelled')); }); }).finally(() => running.delete(run));
    if (flags.simulateError) throw new Error(flags.simulateError);
    const ai = reg.settings.ai ?? { engine: 'harness', harness: reg.settings.agent }, api = ai.engine === 'api';
    const who = { engine: api ? 'api' : 'harness', ...(api ? { model: ai.model } : { harness: ai.harness }), cost_usd: api ? null : 0.1234, duration_ms: 4200 };
    const step = (step_id, capability, intent, reason, added_as_prerequisite = false) => ({ step_id, capability, intent, reason, added_as_prerequisite });
    switch (flags.simulate) {
      case 'no_match': return { valid: true, status: 'no_match', steps: [], reason: 'Nothing here is work for the plugin.', questions: [], ...who };
      case 'clarify': return { valid: true, status: 'needs_clarification', steps: [], reason: 'The request does not say what to make.', questions: ['Is it a web page or a document?', 'Who is it for?'], ...who };
      case 'invalid': return { valid: false, errors: ['Unknown capability in AI classification: made-up', 'AI classification requires a nonempty reason'], ...who };
      default: return { valid: true, status: 'selected', steps: [step('office-pdf', 'office-pdf', null, null, true), step('office-docs', 'office-docs', 'office-docs-intent', 'The request asks for a Word file.')], reason: `Classified "${task}" as a document.`, questions: [], ...who };
    }
  }
  async function apply(payload) {
    if (flags.applyDelay) await new Promise(done => setTimeout(done, flags.applyDelay));
    const plan = plans.get(payload.plan_id);
    if (!plan) throw new Error('Unknown plan');
    if (flags.rejectApply) {
      if (plan.plugin_id) for (const op of plan.operations) unscanned.add(op.target_id);
      throw new Error('The harness refused the change');
    }
    if (plan.revision !== reg.revision) throw new Error('Registry revision changed; calculate a new plan');
    if (plan.blockers.length && !payload.allow_blocked) throw new Error('Plan has blockers; resolve them before applying');
    // The service's Contract 1: a removal is executed only when the request carries the plan's number of removals; skip_removals leaves them out.
    // A broken marketplace that takes plugins with it is a removal too.
    const uninstalls = o => o.kind === 'remove' || (o.kind === 'remove-marketplace' && !!o.plugins?.length);
    const skip = payload.skip_removals === true, removals = plan.operations.filter(uninstalls).length;
    const gone = plan.operations.filter(uninstalls).reduce((n, o) => n + (o.kind === 'remove-marketplace' ? o.plugins.length : 1), 0);
    if (!skip && removals && payload.confirm_removals !== removals) throw new Error(`This plan uninstalls ${gone} ${gone === 1 ? 'plugin' : 'plugins'}; review it and confirm the removals`);
    const executed = skip ? plan.operations.filter(o => !uninstalls(o)) : plan.operations;
    for (const op of executed) {
      if (op.kind === 'remove-marketplace') { flags.brokenMarketplace = false; continue; }
      const list = installed[op.target_id] ||= [], at = list.findIndex(i => (op.plugin_id ? i.registry_id === op.plugin_id : i.name === op.name));
      if (op.kind === 'remove') { if (at >= 0) list.splice(at, 1); continue; }
      if (at >= 0) list[at] = { ...list[at], version: op.to_version };
      else list.push(installedPlugin(op.plugin_id, op.name, op.to_version));
    }
    const time = ago(0), touched = [...new Set(executed.map(o => o.target_id))];
    if (plan.plugin_id) Object.assign(sync, { revision: null, pending: null, blockers: null });
    else if (touched.length) {
      for (const id of touched) sync.targets[id] = { ...sync.targets[id], synced: time };
      sync.last_sync = time;
      sync.pending = Math.max(0, (sync.pending ?? 0) - executed.length);
    }
    if (touched.length) log('sync', 'complete', `${executed.length} operations applied`);
    const result = snapshot();
    if (payload.allow_blocked) result.left_out = plan.blockers;
    result.skipped_removals = skip ? removals : 0;
    return result;
  }
  // An AI adaptation of a plugin: a job with no kind, no title and no project.
  function startAdaptation({ id, harness, budget_usd }) {
    const job = { id: 'job-' + (jobs.length + 1), plugin_id: id, harness, status: 'running', phase: 'harmonization', budget_usd, log_path: 'D:/isolated/data/jobs/log.txt', message: 'Started', time: ago(0) };
    jobs.push(job);
    return structuredClone(job);
  }
  const request = async (action, payload = {}, onProgress) => {
    calls.push({ action, payload: structuredClone(payload) });
    switch (action) {
      case 'snapshot': case 'scan': return snapshot();
      case 'discover': return structuredClone(data.found);
      case 'jobs': return structuredClone(newestFirst());
      case 'plan': if (flags.planDelay) await new Promise(done => setTimeout(done, flags.planDelay)); return makePlan(payload.target_id, payload.reinstall, payload.plugin_id);
      case 'check': {
        const errors = flags.checkErrors && reg.plugins[0] ? [{ plugin_id: reg.plugins[0].id, message: 'Source unreachable: could not resolve the release' }] : [];
        for (const [i, plugin] of reg.plugins.entries()) {
          onProgress?.({ phase: 'source', index: i + 1, total: reg.plugins.length, name: plugin.name });
          if (i === 0 && flags.checkDelay) await new Promise(done => setTimeout(done, flags.checkDelay));
          try { resolveArchive(plugin); } catch (error) { errors.push({ plugin_id: plugin.id, message: error.message }); }
        }
        onProgress?.({ phase: 'plan' });
        const plan = makePlan(payload.target_id);
        if (!payload.target_id) sync.errors = errors.length;
        log('check', errors.length ? 'failed' : 'complete', errors.length ? 'Plan calculated; sources not resolved' : 'Sources resolved and plan calculated');
        return { snapshot: snapshot(), plan, errors };
      }
      case 'apply': return apply(payload);
      case 'projects': return projects.map(p => summaryOf(p.id, p.path, p.info));
      case 'project': {
        const held = projects.find(p => p.id === payload.id);
        if (!held) throw new Error('That project is not in your list');
        let info = { ...structuredClone(held.info), file: held.path, export_harnesses: [...(held.adapters || [])] };
        if (flags.bigGraph) info = withBigGraph(info);
        if (flags.emptyGraph) info = { ...info, graph: { entries: [], capabilities: [], examples: [] } };
        if (flags.noEntries) info = { ...info, graph: { ...info.graph, entries: [] } };
        if (flags.oddNames) info = withOddNames(info);
        if (flags.objectFields) info = withObjectFields(info);
        return info;
      }
      case 'open_project': {
        if (!/\.mp$/i.test(String(payload.path))) throw new Error('Not a Muro project file: ' + payload.path);
        const file = String(payload.path).split(/[\\/]/).pop().replace(/\.mp$/i, ''), id = file.toLowerCase();
        const known = projects.find(p => p.id === id);
        if (known) return summaryOf(known.id, known.path, known.info);
        const info = projectInfo(file, id), added = { id, path: payload.path, adapters: ['claude-code', 'codex'], info };
        projects.push(added);
        return summaryOf(id, added.path, info);
      }
      case 'install_project': return installProject(payload);
      case 'create_project': return createProject(payload);
      case 'project_job': return projectJob(payload);
      case 'edit_project': return editProject(payload);
      case 'delete_project': return deleteProject(payload);
      case 'release_project': return releaseProject(payload);
      case 'extract_project': return extractBuild(payload, listedFile(payload.id).adapters);
      case 'extract_plugin': {
        const plugin = reg.plugins.find(p => p.id === payload.id);
        if (plugin?.project_source_error) throw new Error('Check the plugin source again before exporting. ' + plugin.project_source_error);
        if (!plugin?.resolved_project) throw new Error('Check a .mp source before exporting the plugin');
        if (payload.digest !== undefined && payload.digest !== plugin.resolved_project.digest) throw new Error('The checked plugin changed. Reopen Export to choose its current version.');
        return extractBuild(payload, plugin.resolved_project.harnesses);
      }
      case 'project_updates': return projectUpdates(payload);
      case 'remove_project': return removeProject(payload);
      case 'simulate': return simulate(payload);
      case 'cancel_simulation': {
        const stop = running.get(payload.run);
        if (!stop) throw new Error('That simulation is not running');
        stop();
        return { status: 'cancelling' };
      }
      case 'pick_file': { unknownShellAction(action); return { path: flags.pickPath }; }
      case 'open_folder': { unknownShellAction(action); return { opened: true }; }
      case 'pick_folder': { unknownShellAction(action); return { path: flags.pickFolder }; }
      case 'inspect_plugin_source': {
        const source = flags.projectSources[payload.plugin.source];
        if (flags.holdInspection) await new Promise(done => { finishInspection = done; });
        if (source?.error) throw new Error(source.error);
        return { harnesses: source?.harnesses ?? [], project_version: source?.version ?? null };
      }
      case 'save_plugin': {
        mutate(payload);
        if (payload.adopt) adopt(payload);
        const p = structuredClone(payload.plugin);
        if (!seeded) { Object.assign(p, { upstream_version: 'v-native', upstream_revision: 'abc123' }); if (p.distributions[0]) Object.assign(p.distributions[0], { origin: 'muro', custom_instructions_digest: 'old-instructions' }); seeded = true; }
        const at = reg.plugins.findIndex(x => x.id === p.id);
        if (at >= 0) reg.plugins[at] = p; else reg.plugins.push(p);
        return bump();
      }
      case 'select_plugin_target': {
        mutate(payload);
        const plugin = reg.plugins.find(p => p.id === payload.id);
        if (!plugin || !reg.targets.some(t => t.id === payload.target_id && t.enabled)) throw new Error('Plugin or harness is unavailable');
        if (plugin.targets.includes(payload.target_id)) return snapshot();
        plugin.targets.push(payload.target_id);
        return bump();
      }
      case 'remove_plugin': { mutate(payload); reg.plugins = reg.plugins.filter(p => p.id !== payload.id); return bump(); }
      case 'save_target': {
        mutate(payload);
        const t = structuredClone(payload.target), at = reg.targets.findIndex(x => x.id === t.id);
        if (at >= 0) reg.targets[at] = t; else { reg.targets.push(t); installed[t.id] = structuredClone(data.byHarness[t.harness] || []); }
        return bump();
      }
      // The service refuses to remove a harness a plugin still lists (service.rs, "Remove this target from its plugins first").
      case 'remove_target': {
        mutate(payload);
        if (reg.plugins.some(p => p.targets.includes(payload.id))) throw new Error('Remove this target from its plugins first');
        reg.targets = reg.targets.filter(t => t.id !== payload.id);
        return bump();
      }
      case 'settings': {
        if (payload.revision !== reg.revision || flags.staleSettings > 0) { flags.staleSettings = Math.max(0, flags.staleSettings - 1); throw new Error(STALE); }
        if (flags.rejectSettings) throw new Error('Version conflict: settings not saved');
        reg.settings = structuredClone(payload.settings);
        if (reg.settings.ai) reg.settings.agent = reg.settings.ai.harness;   // as the registry does: the old `agent` is always ai.harness
        return bump();
      }
      case 'resolve': {
        if (flags.holdResolution) await new Promise(done => { finishResolution = done; });
        const p = reg.plugins.find(p => p.id === payload.id);
        if (p) {
          p.last_checked = ago(0);
          resolveArchive(p);
        }
        return bump();
      }
      case 'adapt': return startAdaptation(payload);
      case 'cancel_job': return cancelJob(payload);
      case 'open_custom_instructions': case 'custom_instructions': return structuredClone(instructions().find(i => i.plugin_id === payload.id));
      case 'maintenance': return { message: payload.kind === 'verify' ? 'Every stored build is intact' : 'Nothing to clean up', details: [] };
      // The runtime's env_present (plan 2, Task 5): whether the variable is set for the Muro process. The name is checked as the registry checks it; no value is ever returned.
      case 'env_present': {
        if (flags.noEnvCheck) throw new Error('Unknown registry action: env_present');
        if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(String(payload.name))) throw new Error('The key setting must name an environment variable, not hold a key');
        return { set: flags.envSet.includes(payload.name) };
      }
      case 'autostart': return { supported: !flags.autostartUnsupported, enabled: autostart, current: autostart };
      case 'set_autostart': {
        if (flags.autostartUnsupported) throw new Error('Start with Windows is not available here');
        autostart = !!payload.enabled;
        return { supported: true, enabled: autostart, current: autostart };
      }
      default: throw new Error('Unknown action: ' + action);
    }
  };
  const behind = {
    finishInspection() { finishInspection?.(); finishInspection = null; },
    finishResolution() { finishResolution?.(); finishResolution = null; },
    settings(patch) { Object.assign(reg.settings, patch); reg.revision++; },
    check(message = 'Everything is in sync') { makePlan(); log('Background check', 'complete', message); },
    bump() { reg.revision++; },
    /** The AI runs that go end, as the runtime ends them (completed, failed, cancelled or interrupted): a project made is listed, a change gives the file a new digest. The message defaults to the runtime's own. */
    finish(status = 'completed', message) { for (const job of jobs.filter(j => j.status === 'running')) settle(job, status, message); },
    /** The phase the runs that go are in ("AI intake and harmonization", "Building and saving the project"). */
    phase(text) { for (const job of jobs.filter(j => j.status === 'running')) job.phase = text; },
    /** A project's file is written by someone else (another window, a sync): the digest the page read is stale. */
    touch(id) { rewrite(listedFile(id)); },
    /** An AI adaptation another client started: the registry the page holds does not show it until the page reads again, and its own request is refused meanwhile. */
    adapt(plugin = 'docs-writer', harness = 'opencode') { startAdaptation({ id: plugin, harness, budget_usd: 2 }); },
    /** The digest of a project's file now. */
    digest(id) { return listedFile(id).info.digest; },
  };
  return { request, calls, flags, behind };
}
