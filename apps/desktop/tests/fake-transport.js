// The one fake transport of the browser tests and the demo screenshots: the registry service's actions over plain data,
// with the same rules the service has (revision conflicts, blockers, allow_blocked, removals only on a clear harness).
// createTransport(scenario) returns {request, calls, flags}; calls records every request, flags are knobs a test turns:
//   rejectSave, rejectSettings   the next save_* / settings request fails with a version conflict
//   blockPlan                    every plan carries one blocker besides its operations
//   unreadable                   the first harness cannot be read (incomplete inventory)
//   checkErrors                  check reports a source it could not resolve
//   checkDelay, applyDelay (ms)  check / apply take that long; rejectApply makes apply fail
//   autostartUnsupported         autostart answers supported:false
//   instructionFiles, instructionStale   the custom-instructions state of every plugin
//   staleSettings (n)            the next n settings requests are refused as the service refuses a stale revision
//   Projects: pickPath           what the shell's file dialog answers (a path, or null for a cancelled dialog)
//             noShellActions     pick_file and open_folder fail as a shell that does not know them yet (the service's "Unknown registry action")
//             rejectInstall      install_project fails ("no build for <harness>"); installLeavesTargets: it builds the plugin but leaves its targets alone (a runtime older than the window)
//             projectChanged     every plan blocks the plugin of a project on each harness it is on with "Project file changed: open the project again" (the registry's words for a build older than its file); an install_project clears it
//             remove_project     {id, revision} takes the project off the list, never the default one (a project with `included: true`, as the runtime flags the copy Muro ships)
//             simulate           what `simulate` answers: 'selected' (a prerequisite and a chosen step), 'no_match', 'clarify' (needs_clarification, with its questions) or
//                                'invalid' ({valid:false, errors}); simulateError (a message) makes the call fail as the runtime does (no key, endpoint unreachable, harness
//                                missing); simulateDelay (ms) makes it take that long. The answer carries the engine of the settings (`ai`), as the runtime adds it.
//                                `simulate` needs the `run` the page names; `cancel_simulation {run}` ends a delayed one ("The simulation was cancelled") and refuses one that is not running.
//             bigGraph           the next `project` answers a graph of 37 capabilities in 15 entries, one with a very long name (set it before opening the project)
//   Settings AI: envSet          the names of the environment variables that are set for the Muro process (`env_present {name}` answers {set}; never a value)
//                noEnvCheck      env_present fails as a runtime that does not know it yet ("Unknown registry action")
// behind: what the background worker and the tray do to the registry while the window is open, and nobody tells it:
//   behind.settings(patch) saves settings, behind.check() records a check, behind.bump() moves the revision.
// Scenarios: default (one harness, no plugin), changes (one plugin to update, one harness found), unlisted (a plugin
// installed outside the list), projects (two harnesses, a plugin installed as published with no version for one of them, and the project Marionette
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

// A small project in the shape of `muro project info`, Marionette-like: three inputs, six choices, two records, two runs, the four prompts, two entries and four capabilities.
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
    project: { schema: 1, name, slug, version: '0.5.0', author: builtin ? 'acaprino' : 'you', created: '2026-11-10T09:00:00Z', changed: '2026-11-18T12:00:00Z', repository: builtin ? { url: 'https://github.com/acaprino/marionette', branch: 'main', tag_prefix: 'marionette-v' } : null, builtin },
    plugin: { name, slug, version: '0.5.0', description: `${name}, one plugin` },
    inputs, decisions,
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
    digest: 'sha256:' + slug.padEnd(8, '0'),
  };
}
// The graph at the size of Marionette (flags.bigGraph): 37 capabilities in 15 entries, one name far longer than the rest, conditions and conflicts, and two documented examples.
function withBigGraph(info) {
  const ids = Array.from({ length: 37 }, (_, i) => i === 5 ? 'a-capability-whose-name-is-far-longer-than-any-other-capability-of-this-project-' + 'x'.repeat(30) : `capability-${String(i + 1).padStart(2, '0')}-design-system`);
  const entries = Array.from({ length: 15 }, (_, e) => ({ name: `${info.plugin.slug}-group-${e + 1}`, description: `Use when group ${e + 1} applies.`, capabilities: ids.filter((_, i) => i % 15 === e) }));
  const capabilities = ids.map((id, i) => ({ id, title: `Capability ${i + 1}`, role: 'worker', when: '—', after: [], outputs: [], intents: [{ id: id + '-intent', description: `Capability ${i + 1}`, excludes: '' }], needs: i % 7 === 1 ? [{ capability: ids[i - 1], label: 'It reads the first', when: 'It reads the first', reason: 'Because.' }] : [], conflicts: i % 11 === 3 ? [ids[i + 1]] : [] }));
  const pick = id => ({ capability: id, intent: id + '-intent', reason: 'Fits.' });
  const example = (title, chosen) => ({ id: title, title, task: title, stack_tokens: [], status: 'selected', selections: chosen.map(pick), reason: 'Both.', questions: [], path: chosen, steps: chosen.map(id => ({ step: id, capability: id, intent: id + '-intent' })) });
  return { ...info, graph: { entries, capabilities, examples: [example('Two of many', [ids[5], ids[36]]), example('Another two', [ids[0], ids[20]])] } };
}
const summaryOf = (id, path, info, included = false) => ({ id, path, included, project: info.project, plugin: { name: info.plugin.name, slug: info.plugin.slug, version: info.plugin.version }, inputs: info.inputs.length, capabilities: info.graph.capabilities.length, entries: info.graph.entries.length, examples: info.graph.examples.length, records: info.records.length, runs: info.history.length, digest: info.digest });

function scenarioData(scenario) {
  const idle = { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} };
  // What the service recorded for revision 1, the one a scenario starts at: a check of 14 minutes ago, a sync of a day ago.
  const recorded = (pending, extra = {}) => ({ last_check: ago(14), last_sync: ago(1500), revision: 1, pending, blockers: 0, errors: null, targets: { t1: { checked: ago(14), synced: ago(1500) } }, ...extra });
  const base = { targets: [harnessTarget('t1', 'codex', 'Codex isolated test')], plugins: [], installed: { t1: [] }, found: [foundHarness('codex', 'Codex')], byHarness: {}, jobs: [], activity: [], sync: idle, auto_sync: false };
  const package1 = () => plugin('p1', 'Package', ['t1'], [build('codex', '2')]);
  switch (scenario) {
    case 'changes': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '1')] }, found: [foundHarness('claude-code', 'Claude Code', { version: '2.1.4' })] };
    case 'recorded': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '1')] }, sync: recorded(1) };
    case 'recorded-ok': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2')] }, sync: recorded(0) };
    case 'recorded-errors': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2')] }, sync: recorded(0, { errors: 1 }) };
    case 'recorded-unseen': return { ...base, targets: [harnessTarget('t1', 'codex', 'Codex isolated test', { exclusive: true })], plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2'), installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)] }, sync: recorded(1) };
    case 'projects': return { ...base, targets: [harnessTarget('t1', 'claude-code', 'Claude Code'), harnessTarget('t2', 'codex', 'Codex')], plugins: [plugin('commit-helper', 'commit-helper', ['t1', 't2'], [build('claude-code', '2.1.0')], { upstream_version: 'v2.1.0' })], installed: { t1: [installedPlugin('commit-helper', 'commit-helper', '2.1.0')], t2: [] }, found: [], projects: [{ id: 'marionette', path: 'D:/Muro/data/projects/marionette.mp', adapters: ['claude-code', 'codex', 'opencode'], included: true, info: projectInfo('Marionette', 'marionette', { builtin: true }) }], settings: { ai: { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' } } };
    case 'stored-settings': return { ...base, settings: { auto_sync: true, interval_minutes: 45 } };   // automatic sync on, an interval that is none of the listed ones
    case 'unlisted': return { ...base, plugins: [package1()], installed: { t1: [installedPlugin('p1', 'Package', '2'), installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)] } };
    case 'two-harnesses': return { ...base, targets: [harnessTarget('t1', 'codex', 'Codex isolated test'), harnessTarget('t2', 'opencode', 'OpenCode isolated test')], plugins: [plugin('p1', 'Package', ['t1', 't2'], [build('codex', '2'), build('opencode', '2')])], installed: { t1: [installedPlugin('p1', 'Package', '1')], t2: [] }, found: [] };
    case 'first-run': return { ...base, targets: [], installed: {}, found: [foundHarness('claude-code', 'Claude Code', { version: '2.1.4' }), foundHarness('codex', 'Codex')], byHarness: { 'claude-code': [installedPlugin('commit-helper', 'commit-helper', '2.1.0', false)] } };
    case 'demo': case 'demo-synced': case 'demo-activity': {
      const done = scenario === 'demo-synced';
      const targets = [harnessTarget('claude', 'claude-code', 'Claude Code', { root: 'C:/Users/you/.claude', exclusive: true }), harnessTarget('codex', 'codex', 'Codex', { root: 'C:/Users/you/.codex' }), harnessTarget('opencode', 'opencode', 'OpenCode', { root: 'C:/Users/you/.config/opencode' })];
      const plugins = [
        plugin('marionette', 'Marionette', ['claude', 'codex', 'opencode'], [build('claude-code', '0.4.0'), build('codex', '0.4.0'), build('opencode', '0.4.0')], { source: 'github.com/acaprino/marionette', upstream_version: 'v0.4.0' }),
        plugin('commit-helper', 'commit-helper', ['claude', 'codex'], [build('claude-code', '2.1.0'), build('codex', '2.1.0')], { upstream_version: 'v2.1.0' }),
        plugin('test-runner', 'test-runner', ['opencode'], [build('opencode', '1.0.4')], { policy: 'pinned', pinned_version: '1.0.4', upstream_version: 'v1.0.4' }),
        plugin('docs-writer', 'docs-writer', ['claude', 'opencode'], [build('claude-code', '1.2.0'), ...(done ? [build('opencode', '1.2.0')] : [])], { upstream_version: 'v1.2.0' }),
        plugin('sql-companion', 'sql-companion', [], [], { policy: 'head', upstream_version: '' }),
      ];
      const installed = { claude: [installedPlugin('marionette', 'Marionette', done ? '0.4.0' : '0.3.0'), installedPlugin('commit-helper', 'commit-helper', '2.1.0'), installedPlugin('docs-writer', 'docs-writer', '1.2.0'), ...(done ? [] : [installedPlugin('old-snippets', 'old-snippets', '0.2.0', false)])], codex: [installedPlugin('marionette', 'Marionette', '0.4.0'), installedPlugin('commit-helper', 'commit-helper', '2.1.0')], opencode: [installedPlugin('marionette', 'Marionette', '0.4.0'), ...(done ? [installedPlugin('test-runner', 'test-runner', '1.0.4'), installedPlugin('docs-writer', 'docs-writer', '1.2.0')] : [])] };
      const [checkedAgo, syncedAgo] = done ? [3, 3] : [14, 1500];
      const synced = { claude: { checked: ago(checkedAgo), synced: ago(syncedAgo) }, codex: { checked: ago(checkedAgo), synced: ago(syncedAgo) }, opencode: { checked: ago(checkedAgo), synced: ago(syncedAgo) } };
      const jobs = done ? [] : [{ id: 'job-1', plugin_id: 'docs-writer', harness: 'opencode', status: 'running', phase: 'harmonization', budget_usd: 2, log_path: 'C:/Users/you/Muro/data/jobs/job-1/log.txt', message: 'Claude Code is adapting the plugin for OpenCode.', time: ago(3) }];
      const earlier = scenario === 'demo-activity' ? [{ id: 'a0', time: ago(2900), action: 'check', status: 'failed', message: 'Plan calculated; sources not resolved: sql-companion' }] : [], between = scenario === 'demo-activity' ? [{ id: 'a3', time: ago(75), action: 'Automatic sync', status: 'complete', message: '2 changes applied' }] : [];
      const activity = [...earlier, { id: 'a1', time: ago(1500), action: 'apply', status: 'complete', message: '3 operations applied. Inventory refreshed.' }, ...between, { id: 'a2', time: ago(14), action: 'check', status: 'complete', message: 'Sources resolved and plan calculated' }];
      return { ...base, auto_sync: true, targets, plugins, installed, found: [foundHarness('pi', 'Pi', { version: '0.9.1' }), foundHarness('hermes', 'Hermes Agent', { version: '0.7.0' })], jobs, activity, sync: { last_check: ago(checkedAgo), last_sync: ago(syncedAgo), revision: null, pending: null, blockers: null, errors: null, targets: synced } };
    }
    default: return { ...base, found: [foundHarness('codex', 'Codex', { version: 'test' })] };
  }
}

export function createTransport(scenario = 'default') {
  const data = scenarioData(scenario), calls = [];
  const flags = { rejectSave: false, rejectSettings: false, blockPlan: false, unreadable: false, checkErrors: false, checkDelay: 0, applyDelay: 0, rejectApply: false, autostartUnsupported: false, instructionFiles: [], instructionStale: false, staleSettings: 0, pickPath: 'D:/Projects/extra/Notes.mp', noShellActions: false, rejectInstall: false, installLeavesTargets: false, simulate: 'selected', simulateDelay: 0, simulateError: '', bigGraph: false, projectChanged: false };
  const reg = { schema: 1, revision: 1, plugins: data.plugins, targets: data.targets, settings: { auto_sync: data.auto_sync, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '', ai: { engine: 'harness', harness: 'claude-code', budget_usd: 0.5, api_base: 'https://api.openai.com/v1', model: '', api_key_env: 'MURO_API_KEY' } } };
  Object.assign(reg.settings, data.settings);   // a scenario may store settings of its own
  Object.assign(flags, { envSet: [], noEnvCheck: false });   // the knobs of the Settings AI section
  const installed = data.installed, plans = new Map(), sync = data.sync, activity = data.activity, jobs = data.jobs;
  const projects = structuredClone(data.projects || []);
  let autostart = false, seeded = false, planNumber = 0, activityNumber = 0;
  const STALE = 'Registry revision changed; refresh before saving';   // the service's own words
  const log = (action, status, message) => activity.push({ id: 'a' + ++activityNumber + 'x', time: ago(0), action, status, message });
  const inventory = t => {
    if (flags.unreadable && t.id === reg.targets[0]?.id) return { target_id: t.id, complete: false, error: 'Configuration folder not found', supported: true, plugins: [] };
    return { target_id: t.id, complete: true, error: null, supported: true, plugins: installed[t.id] || [] };
  };
  const instructions = () => reg.plugins.map(p => ({ plugin_id: p.id, path: p.custom_instructions_dir || 'D:/isolated/data/custom-instructions/' + p.id, files: flags.instructionFiles, digest: 'fixture-digest', stale_harnesses: flags.instructionStale ? [reg.targets.find(t => p.targets.includes(t.id))?.harness].filter(Boolean) : [] }));
  const snapshot = () => structuredClone({ registry: reg, inventory: reg.targets.map(inventory), activity, sync, jobs, data_dir: 'D:/isolated/data', custom_instructions: instructions() });
  const mutate = payload => {
    if (payload.revision !== undefined && payload.revision !== reg.revision) throw new Error(STALE);
    if (flags.rejectSave) throw new Error('Version conflict: reload registry');
  };
  const bump = () => { reg.revision++; return snapshot(); };
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
  function makePlan(only, reinstall) {
    const operations = [], blockers = [];
    for (const t of reg.targets.filter(t => t.enabled && (!only || t.id === only))) {
      const inv = inventory(t);
      if (!inv.complete) { blockers.push(`${t.name}: ${inv.error}`); continue; }
      const before = blockers.length, wanted = new Set();
      for (const p of reg.plugins.filter(p => p.targets.includes(t.id))) {
        const want = p.distributions.find(d => d.harness === t.harness && d.path), have = inv.plugins.find(i => i.registry_id === p.id);
        if (have) wanted.add(have.id);
        if (flags.projectChanged && p.project) { blockers.push(`${t.name} / ${p.name}: Project file changed: open the project again`); continue; }   // the registry's words for a build older than its project file
        if (!want) { blockers.push(`${t.name} / ${p.name}: No version for this harness`); continue; }
        const kind = !have ? 'install' : reinstall === p.id ? 'reinstall' : have.version !== want.version ? 'update' : null;
        if (kind) operations.push({ target_id: t.id, plugin_id: p.id, name: p.name, kind, from_version: have?.version || '', to_version: want.version, reason: kind === 'install' ? 'Missing desired distribution' : 'Reconcile desired artifact' });
      }
      if (t.exclusive && blockers.length === before) for (const i of inv.plugins) if (!wanted.has(i.id)) operations.push({ target_id: t.id, plugin_id: i.registry_id || '', name: i.name, kind: 'remove', from_version: i.version, to_version: '', reason: 'Not in desired registry for this target' });
    }
    if (flags.blockPlan) blockers.push('Codex isolated test: Inventory incomplete');
    operations.sort((a, b) => (a.kind === 'remove') - (b.kind === 'remove'));
    const plan = { id: 'plan-' + ++planNumber, revision: reg.revision, operations, blockers };
    plans.set(plan.id, plan);
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
  // The runtime's remove_project {id, revision}: the entry leaves the list and nothing else; the default project stays ("The default project stays in the list").
  function removeProject(payload) {
    mutate(payload);
    projectOf(payload.id);
    if (payload.id === 'marionette') throw new Error('The default project stays in the list');
    projects.splice(projects.findIndex(p => p.id === payload.id), 1);
    return bump();
  }
  const unknownShellAction = action => { if (flags.noShellActions) throw new Error('Unknown registry action: ' + action); };
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
    if (flags.rejectApply) throw new Error('The harness refused the change');
    const plan = plans.get(payload.plan_id);
    if (!plan) throw new Error('Unknown plan');
    if (plan.revision !== reg.revision) throw new Error('Registry revision changed; calculate a new plan');
    if (plan.blockers.length && !payload.allow_blocked) throw new Error('Plan has blockers; resolve them before applying');
    for (const op of plan.operations) {
      const list = installed[op.target_id] ||= [], at = list.findIndex(i => (op.plugin_id ? i.registry_id === op.plugin_id : i.name === op.name));
      if (op.kind === 'remove') { if (at >= 0) list.splice(at, 1); continue; }
      if (at >= 0) list[at] = { ...list[at], version: op.to_version };
      else list.push(installedPlugin(op.plugin_id, op.name, op.to_version));
    }
    const time = ago(0), touched = [...new Set(plan.operations.map(o => o.target_id))];
    for (const id of touched) sync.targets[id] = { ...sync.targets[id], synced: time };
    if (touched.length) { sync.last_sync = time; sync.pending = Math.max(0, (sync.pending ?? 0) - plan.operations.length); }
    log('apply', 'complete', `${plan.operations.length} operations applied`);
    const result = snapshot();
    if (payload.allow_blocked) result.left_out = plan.blockers;
    return result;
  }
  const request = async (action, payload = {}) => {
    calls.push({ action, payload: structuredClone(payload) });
    switch (action) {
      case 'snapshot': case 'scan': return snapshot();
      case 'discover': return structuredClone(data.found);
      case 'jobs': return structuredClone(jobs);
      case 'plan': return makePlan(payload.target_id, payload.reinstall);
      case 'check': {
        if (flags.checkDelay) await new Promise(done => setTimeout(done, flags.checkDelay));
        const errors = flags.checkErrors && reg.plugins[0] ? [{ plugin_id: reg.plugins[0].id, message: 'Source unreachable: could not resolve the release' }] : [];
        const plan = makePlan(payload.target_id);
        if (!payload.target_id) sync.errors = errors.length;
        log('check', errors.length ? 'failed' : 'complete', errors.length ? 'Plan calculated; sources not resolved' : 'Sources resolved and plan calculated');
        return { snapshot: snapshot(), plan, errors };
      }
      case 'apply': return apply(payload);
      case 'projects': return projects.map(p => summaryOf(p.id, p.path, p.info, !!p.included));
      case 'project': return structuredClone({ ...(flags.bigGraph ? withBigGraph(projectOf(payload.id).info) : projectOf(payload.id).info), included: !!projectOf(payload.id).included });
      case 'open_project': {
        if (!/\.mp$/i.test(String(payload.path))) throw new Error('Not a Muro project file: ' + payload.path);
        const file = String(payload.path).split(/[\\/]/).pop().replace(/\.mp$/i, ''), id = file.toLowerCase();
        const known = projects.find(p => p.id === id);
        if (known) return summaryOf(known.id, known.path, known.info, !!known.included);
        const info = projectInfo(file, id), added = { id, path: payload.path, adapters: ['claude-code', 'codex'], info };
        projects.push(added);
        return summaryOf(id, added.path, info);
      }
      case 'install_project': return installProject(payload);
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
      case 'save_plugin': {
        mutate(payload);
        if (payload.adopt) adopt(payload);
        const p = structuredClone(payload.plugin);
        if (!seeded) { Object.assign(p, { upstream_version: 'v-native', upstream_revision: 'abc123' }); if (p.distributions[0]) Object.assign(p.distributions[0], { origin: 'muro', custom_instructions_digest: 'old-instructions' }); seeded = true; }
        const at = reg.plugins.findIndex(x => x.id === p.id);
        if (at >= 0) reg.plugins[at] = p; else reg.plugins.push(p);
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
      case 'resolve': { const p = reg.plugins.find(p => p.id === payload.id); if (p) p.last_checked = ago(0); return bump(); }
      case 'adapt': { const job = { id: 'job-' + (jobs.length + 1), plugin_id: payload.id, harness: payload.harness, status: 'running', phase: 'harmonization', budget_usd: payload.budget_usd, log_path: 'D:/isolated/data/jobs/log.txt', message: 'Started', time: ago(0) }; jobs.push(job); return structuredClone(job); }
      case 'cancel_job': { const job = jobs.find(j => j.id === payload.id); if (job) Object.assign(job, { status: 'cancelled', message: 'Cancelled' }); return snapshot(); }
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
    settings(patch) { Object.assign(reg.settings, patch); reg.revision++; },
    check(message = 'Everything is in sync') { makePlan(); log('Background check', 'complete', message); },
    bump() { reg.revision++; },
  };
  return { request, calls, flags, behind };
}
