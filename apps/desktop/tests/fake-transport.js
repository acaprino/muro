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
// behind: what the background worker and the tray do to the registry while the window is open, and nobody tells it:
//   behind.settings(patch) saves settings, behind.check() records a check, behind.bump() moves the revision.
// Scenarios: default (one harness, no plugin), changes (one plugin to update, one harness found), unlisted (a plugin
// installed outside the list), recorded / recorded-ok / recorded-errors / recorded-unseen (a check the window did not make: one change
// waiting, nothing to do, a source not checked, a removal no cell shows), two-harnesses (a change on each of two harnesses), first-run (no harness, two found,
// one with an installed plugin), demo (the data of the documentation screenshots), demo-synced (the same, everything
// installed and nothing running: the Sync page after a sync), demo-activity (the demo with a failed check and an automatic sync in its history).
const ago = minutes => String(Math.floor(Date.now() / 1000) - minutes * 60);
const build = (harness, version, origin = 'native') => ({ harness, path: `D:/Muro/data/artifacts/${harness}-${version}`, version, origin });
const harnessTarget = (id, harness, name, extra = {}) => ({ id, harness, name, root: `D:/isolated/${harness}`, executable: harness, enabled: true, exclusive: false, ...extra });
const plugin = (id, name, targets, distributions, extra = {}) => ({ id, name, source: `github.com/example/${id}`, policy: 'stable', pinned_version: '', targets, distributions, upstream_version: 'v' + (distributions[0]?.version ?? ''), ...extra });
const installedPlugin = (id, name, version, managed = true) => ({ id: 'native-' + id, registry_id: managed ? id : undefined, name, version, path: `D:/plugins/${id}`, managed });
const foundHarness = (harness, name, extra = {}) => ({ harness, name, executable: harness, version: '1.0.0', config_root: `D:/config/${harness}`, available: true, supported: true, ...extra });

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
  const flags = { rejectSave: false, rejectSettings: false, blockPlan: false, unreadable: false, checkErrors: false, checkDelay: 0, applyDelay: 0, rejectApply: false, autostartUnsupported: false, instructionFiles: [], instructionStale: false, staleSettings: 0 };
  const reg = { schema: 1, revision: 1, plugins: data.plugins, targets: data.targets, settings: { auto_sync: data.auto_sync, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } };
  Object.assign(reg.settings, data.settings);   // a scenario may store settings of its own
  const installed = data.installed, plans = new Map(), sync = data.sync, activity = data.activity, jobs = data.jobs;
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
        return bump();
      }
      case 'resolve': { const p = reg.plugins.find(p => p.id === payload.id); if (p) p.last_checked = ago(0); return bump(); }
      case 'adapt': { const job = { id: 'job-' + (jobs.length + 1), plugin_id: payload.id, harness: payload.harness, status: 'running', phase: 'harmonization', budget_usd: payload.budget_usd, log_path: 'D:/isolated/data/jobs/log.txt', message: 'Started', time: ago(0) }; jobs.push(job); return structuredClone(job); }
      case 'cancel_job': { const job = jobs.find(j => j.id === payload.id); if (job) Object.assign(job, { status: 'cancelled', message: 'Cancelled' }); return snapshot(); }
      case 'open_custom_instructions': case 'custom_instructions': return structuredClone(instructions().find(i => i.plugin_id === payload.id));
      case 'maintenance': return { message: payload.kind === 'verify' ? 'Every stored build is intact' : 'Nothing to clean up', details: [] };
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
