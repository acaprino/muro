import * as React from 'react';
import { Button, Card, Cell, Checkbox, Cluster, Column, Icon, Input, RadioGroup, RadioGroupItem, Select, Text } from '@acaprino/sigrid/primitives';
import { Dialog, Disclosure, FormField, Note } from '@acaprino/sigrid/components';
import type { Distribution, Plan, Plugin, ResolvedProject, Snapshot, Target, Transport } from '../../types.ts';
import { engineOf, harnessNames, versionOf } from '../../model.ts';
import type { Engine } from '../../model.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { message, plural, unknownTo } from '../../words.ts';
import { NotSaved } from '../project/write/DetailsDialog.tsx';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { busyReason, checkBudget, EXTRACT_HARNESSES, parseBudget, pickProjectFile } from '../project/write/jobs.ts';
import { ExtractDialog } from '../project/write/ExtractDialog.tsx';
import { useJobs } from '../project/write/useJobs.tsx';
import { registryWrite, resolvePlugin } from './registryWrite.ts';
import { useSync } from './useSync.tsx';

/** The plugin of the list, in a drawer: its source, the harnesses it is installed on, how it is updated, the folder of the owner's own instructions and the builds that were prepared, and under More the
 * actions that work on the saved plugin: Check for updates (`resolve`), Adapt with AI (`adapt`), Plan a reinstall (`plan` with `reinstall`), Open instructions folder and Remove from my list. A port of the
 * Imago window's plugin panel and dialogs (sheets.ts, forms.ts, pages/sync.ts of commit 5e33a82), in its words.
 *
 * What it keeps from that window, and how it differs:
 *  - One modal at a time. Adapt with AI, the question before a removal and the question before leaving with changes are views of the same drawer (title, body and foot change; the form stays above them),
 *    never a second dialog on top: a close request in one of them is its Cancel or its Keep editing. Plan a reinstall closes the drawer and opens the review sheet (`useSync().openReview`) in its place.
 *  - What the person typed is theirs. The form is made from the plugin when the drawer opens (or `pluginId` changes) and never again; the registry moves under it (the worker, a check, the tray) and the
 *    form stays. A save sends the plugin as the registry holds it when the person presses Save, with only the fields that differ from the form the drawer opened on, so a build or a resolved version the
 *    registry recorded meanwhile is not written over. A changed source drops the builds and what was resolved from the old one, as before; the instructions folder stays.
 *  - Leaving with changes asks once. Escape, the close button, a press outside and Cancel all come to the same question.
 *  - What belongs to the drawer is said inside it (a refusal, a failed request), never in a notice, which covers the drawer's buttons. A notice says what was done once the drawer is gone.
 * `AddPluginDialog.tsx` takes the fields, the checks and the way a form becomes a plugin from here: one copy of each. */

// ---------- the form of a plugin (shared with Add plugin) ----------

/** One prepared build, as a form row: `key` names the row, never the build. */
export interface BuildRow { key: number; harness: string; path: string; version: string }
/** What the person sees and types. `named`: the name was typed (or the plugin has one), so it no longer follows the source. */
export interface PluginForm { source: string; name: string; named: boolean; targets: string[]; policy: Plugin['policy']; pinned: string; dir: string; builds: BuildRow[] }

let rowKeys = 0;
/** A new build row: a harness (Codex until the person says another), no folder, no version. */
export const blankBuild = (harness = 'codex'): BuildRow => ({ key: ++rowKeys, harness, path: '', version: '' });

/** The form of a plugin, or of a new one: every enabled harness ticked, the latest release, nothing else. */
export function formOf(plugin: Plugin | null | undefined, targets: readonly Target[]): PluginForm {
  return {
    source: plugin?.source ?? '',
    name: plugin?.name ?? '',
    named: !!plugin?.name,
    targets: plugin ? [...plugin.targets] : targets.filter(t => t.enabled).map(t => t.id),
    policy: plugin?.policy ?? 'stable',
    pinned: plugin?.pinned_version ?? '',
    dir: plugin?.custom_instructions_dir ?? '',
    builds: (plugin?.distributions ?? []).map(d => ({ key: ++rowKeys, harness: d.harness, path: d.path, version: d.version })),
  };
}

const targetsKey = (form: PluginForm): string => JSON.stringify([...form.targets].sort());
const buildsKey = (form: PluginForm): string => JSON.stringify(form.builds.map(b => [b.harness, b.path.trim(), b.version.trim()]));
/** Whether the person changed anything: the form against the form the drawer opened on. */
export const changed = (base: PluginForm, form: PluginForm): boolean =>
  base.source.trim() !== form.source.trim() || base.name.trim() !== form.name.trim() || targetsKey(base) !== targetsKey(form) || base.policy !== form.policy
  || base.pinned.trim() !== form.pinned.trim() || base.dir.trim() !== form.dir.trim() || buildsKey(base) !== buildsKey(form);

/** Use the selected file, folder or repository as the default name. */
export const lastPart = (source: string): string => (source.trim().split(/[\\/#]/).filter(Boolean).pop() ?? '').replace(/\.(git|mp)$/i, '');
export const harnessList = (harnesses: readonly string[]): string => harnesses.map(h => harnessNames[h] ?? h).join(', ');
export function BuildAvailability({ harnesses }: { harnesses: readonly string[] }) {
  const missing = EXTRACT_HARNESSES.filter(h => !harnesses.includes(h));
  return <>
    <Text>Included · {harnessList(harnesses) || 'None'}</Text>
    {missing.length ? <Text variant="note">Missing · {harnessList(missing)}</Text> : null}
  </>;
}

/** The form after a change. A new plugin is named after its source until a name is typed. */
export function nextForm(form: PluginForm, patch: Partial<PluginForm>): PluginForm {
  const next = { ...form, ...patch };
  if (patch.name !== undefined) next.named = true;
  else if (patch.source !== undefined && !form.named) next.name = lastPart(patch.source);
  return next;
}

/** What is wrong with a form, in the words of the Imago window, by field. */
export type Problems = Partial<Record<'source' | 'name' | 'pinned' | 'builds', string>>;
export function problemsOf(form: PluginForm): Problems {
  const found: Problems = {};
  if (!form.source.trim()) found.source = 'Enter where the plugin comes from.';
  if (!form.name.trim()) found.name = 'Give the plugin a name.';
  if (form.policy === 'pinned' && !form.pinned.trim()) found.pinned = 'A pinned plugin needs a version.';
  if (form.builds.some(b => !b.path.trim() || !b.version.trim())) found.builds = 'Each build needs a folder and a version.';
  else if (new Set(form.builds.map(b => b.harness)).size !== form.builds.length) found.builds = 'Only one build per harness.';
  return found;
}

/** The id of a field of a form made with `useId`: the same name builds the field and finds it again to give it the focus. */
export const fieldId = (ids: string, key: string): string => `${ids}-${key}`;
const PROBLEM_ORDER = ['source', 'name', 'pinned', 'builds'] as const;
/** Gives the focus to the first field of the form that is wrong, in the order the form shows them. */
export function focusProblem(ids: string, form: PluginForm, problems: Problems): void {
  const first = PROBLEM_ORDER.find(key => problems[key]);
  if (!first) return;
  let id = fieldId(ids, first);
  if (first === 'builds') {
    const row = form.builds.find(b => !b.path.trim()) ?? form.builds.find(b => !b.version.trim()) ?? form.builds[0];
    if (row) id = fieldId(ids, `build-${row.key}-${row.path.trim() ? (row.version.trim() ? 'harness' : 'version') : 'path'}`);
  }
  setTimeout(() => document.getElementById(id)?.focus(), 0);
}

/** The harnesses ticked in the form, in the order the registry lists them (a harness the registry no longer lists keeps its place at the end). */
const targetIds = (form: PluginForm, targets: readonly Target[]): string[] => [
  ...targets.map(t => t.id).filter(id => form.targets.includes(id)),
  ...form.targets.filter(id => !targets.some(t => t.id === id)),
];
/** The builds of the rows, each with what the registry knows of it (where it came from, the instructions it was made from) when its harness, folder and version are the same as before. */
const buildsOf = (rows: readonly BuildRow[], held: readonly Distribution[]): Distribution[] => rows.map(row => {
  const value = { harness: row.harness, path: row.path.trim(), version: row.version.trim() };
  const previous = held.find(d => d.harness === value.harness && d.path === value.path && d.version === value.version);
  return { ...previous, ...value };
});

/** The plugin a form describes when it is a new one. */
export function newPlugin(id: string, form: PluginForm, targets: readonly Target[]): Plugin {
  const dir = form.dir.trim();
  return {
    id, name: form.name.trim(), source: form.source.trim(), policy: form.policy, pinned_version: form.pinned.trim(),
    targets: targetIds(form, targets), distributions: buildsOf(form.builds, []), ...(dir ? { custom_instructions_dir: dir } : {}),
  };
}

/** What a changed source leaves behind: the resolved source, version and revision of the old one, and when it was checked. */
const UPSTREAM = ['resolved_source', 'resolved_project', 'project_source_error', 'upstream_revision', 'upstream_version', 'last_checked'] as const;

/** The plugin to save when a saved one was edited: `latest` is the plugin as the registry holds it now; only what the form changed against `base` (the form the drawer opened on) is put over it. A changed
 * source (one that is not the source the registry holds already) leaves no prepared build and no metadata of the old source; the instructions folder stays. An empty folder goes back to the one Muro keeps. */
export function editedPlugin(latest: Plugin, base: PluginForm, form: PluginForm, targets: readonly Target[]): Plugin {
  const next: Plugin = { ...latest };
  const source = form.source.trim();
  const moved = source !== base.source.trim() && source !== latest.source;
  if (source !== base.source.trim()) next.source = source;
  if (moved) {
    for (const key of UPSTREAM) delete next[key];
    delete next.project;
    next.distributions = [];
  }
  if (form.name.trim() !== base.name.trim()) next.name = form.name.trim();
  if (targetsKey(form) !== targetsKey(base)) next.targets = targetIds(form, targets);
  if (form.policy !== base.policy) next.policy = form.policy;
  if (form.pinned.trim() !== base.pinned.trim()) next.pinned_version = form.pinned.trim();
  if (form.dir.trim() !== base.dir.trim()) {
    const dir = form.dir.trim();
    if (dir) next.custom_instructions_dir = dir;
    else delete next.custom_instructions_dir;
  }
  if (!moved && buildsKey(form) !== buildsKey(base)) next.distributions = buildsOf(form.builds, latest.distributions);
  return next;
}

/** The registry revision a write carries: the one the window holds, or, before it holds any, the one the service says. */
export async function revisionOf(request: Transport, held: Snapshot | null): Promise<number> {
  return held ? held.registry.revision : (await request<Snapshot>('snapshot')).registry.revision;
}

/** A name as a title says it: very long names end in an ellipsis (the whole of it is in the Name field). */
export const shortName = (name: string, most = 48): string => { const chars = [...name]; return chars.length > most ? `${chars.slice(0, most - 1).join('')}…` : name; };

// ---------- the fields (shared with Add plugin) ----------

const HARNESS_OPTIONS = Object.entries(harnessNames).map(([value, label]) => ({ value, label }));
/** The options of a build's harness: the six kinds, and a harness a registry file names that the window does not know. */
const optionsFor = (harness: string): { value: string; label: string }[] => (HARNESS_OPTIONS.some(o => o.value === harness) ? HARNESS_OPTIONS : [...HARNESS_OPTIONS, { value: harness, label: harness }]);
const POLICIES: readonly { value: Plugin['policy']; label: string }[] = [
  { value: 'stable', label: 'Latest release' }, { value: 'pinned', label: 'Pinned version' }, { value: 'head', label: 'Latest commit' },
];
const isPolicy = (value: string): value is Plugin['policy'] => POLICIES.some(p => p.value === value);

/** A part of a form that opens and closes, its fields one under the other. */
export function Fold({ label, open, onToggle, children }: { label: string; open: boolean; onToggle(): void; children?: React.ReactNode }) {
  return <Disclosure label={label} open={open} onOpenChange={onToggle}><Column gap="md">{children}</Column></Disclosure>;
}

export interface PluginFieldsProps {
  /** The prefix of the ids of the fields (`useId` of the dialog). */
  ids: string;
  form: PluginForm;
  onChange(patch: Partial<PluginForm>): void;
  /** What is wrong, already filtered by whether the person tried to save. */
  problems: Problems;
  targets: readonly Target[];
  sourcePreview?: React.ReactNode;
  /** The plugin is in the list already: the Source hint says what a change of source does. */
  saved: boolean;
  /** Whether Advanced (the instructions folder and the prepared builds) is open: the dialog keeps it, so it stays open when the drawer shows another view and comes back. */
  advanced: boolean;
  onAdvanced(open: boolean): void;
}

/** Source, name, harnesses, update policy, and under Advanced the instructions folder and the prepared builds. */
export function PluginFields({ ids, form, onChange, problems, targets, saved, sourcePreview, advanced, onAdvanced }: PluginFieldsProps) {
  const { request } = useRegistry();
  const [fileProblem, setFileProblem] = React.useState<string | null>(null);
  const [noFilePicker, setNoFilePicker] = React.useState(false);
  async function chooseFile(): Promise<void> {
    setFileProblem(null);
    try {
      const path = await pickProjectFile(request);
      if (path) onChange({ source: path });
    } catch (e) {
      if (unknownTo(e, 'pick_file')) {
        setNoFilePicker(true);
        setFileProblem('Type or paste the full path to the .mp file.');
      } else setFileProblem(message(e));
    }
  }
  const add = React.useRef<HTMLButtonElement>(null);
  const toggle = (id: string, on: boolean): void => onChange({ targets: on ? (form.targets.includes(id) ? form.targets : [...form.targets, id]) : form.targets.filter(t => t !== id) });
  const editBuild = (key: number, patch: Partial<BuildRow>): void => onChange({ builds: form.builds.map(b => (b.key === key ? { ...b, ...patch } : b)) });
  const addBuild = (): void => {
    const row = blankBuild();
    onChange({ builds: [...form.builds, row] });
    requestAnimationFrame(() => document.getElementById(fieldId(ids, `build-${row.key}-harness`))?.focus());
  };
  const removeBuild = (key: number): void => {
    onChange({ builds: form.builds.filter(b => b.key !== key) });
    requestAnimationFrame(() => add.current?.focus());
  };
  return (
    <>
      <FormField
        id={fieldId(ids, 'source')}
        label="Source"
        required
        help={saved ? 'Changing the source removes the prepared builds. Check for updates after saving.' : 'Enter a GitHub repository, a local folder or a .mp file. To select one file in a repository, append #path/to/plugin.mp.'}
        error={problems.source}
      >
        <Input name="source" mono autoFocus autoComplete="off" spellCheck={false} placeholder="https://github.com/owner/repository" value={form.source} onChange={e => { setFileProblem(null); onChange({ source: e.currentTarget.value }); }} />
      </FormField>
      {noFilePicker ? null : <Cell align="start"><Button type="button" variant="outline" size="sm" onClick={() => void chooseFile()}>Choose .mp file…</Button></Cell>}
      {fileProblem ? <RefusalLine>{fileProblem}</RefusalLine> : null}
      <FormField id={fieldId(ids, 'name')} label="Name" required error={problems.name}>
        <Input name="name" autoComplete="off" value={form.name} onChange={e => onChange({ name: e.currentTarget.value })} />
      </FormField>
      <Column gap="sm" role="group" aria-labelledby={fieldId(ids, 'targets')}>
        <Text variant="strong" id={fieldId(ids, 'targets')}>Install on</Text>
        <Text as="p" variant="note">Select where you want this plugin. After saving, install it from its row in Sync.</Text>
        {sourcePreview}
        {targets.length ? targets.map(t => (
          <Checkbox key={t.id} id={fieldId(ids, `target-${t.id}`)} label={t.name} checked={form.targets.includes(t.id)} onCheckedChange={on => toggle(t.id, on === true)} />
        )) : <Text as="p" variant="muted">No harness yet. Add one in Sync.</Text>}
      </Column>
      <Fold label="Advanced" open={advanced || !!problems.pinned || !!problems.builds} onToggle={() => onAdvanced(!advanced)}>
        <Column gap="sm">
          <Text variant="strong" id={fieldId(ids, 'policy')}>Updates</Text>
          <RadioGroup aria-labelledby={fieldId(ids, 'policy')} value={form.policy} onValueChange={value => { if (isPolicy(value)) onChange({ policy: value }); }}>
            {POLICIES.map(p => <RadioGroupItem key={p.value} value={p.value}>{p.label}</RadioGroupItem>)}
          </RadioGroup>
          {form.policy === 'pinned' ? (
            <FormField id={fieldId(ids, 'pinned')} label="Pinned version" error={problems.pinned}>
              <Input name="pinned_version" autoComplete="off" spellCheck={false} placeholder="0.4.1" value={form.pinned} onChange={e => onChange({ pinned: e.currentTarget.value })} />
            </FormField>
          ) : null}
        </Column>
        <FormField
          id={fieldId(ids, 'dir')}
          label="Custom instructions folder"
          help="Optional. Full path of a folder with your own .md notes, subfolders included. Leave empty to use the folder Muro keeps. After editing the files, adapt the plugin again."
        >
          <Input name="custom_instructions_dir" mono autoComplete="off" spellCheck={false} value={form.dir} onChange={e => onChange({ dir: e.currentTarget.value })} />
        </FormField>
        <Column gap="sm" role="group" aria-labelledby={fieldId(ids, 'builds')}>
          <Text variant="strong" id={fieldId(ids, 'builds')}>Prepared builds</Text>
          <Text as="p" variant="muted">Leave empty: Check for updates or Adapt with AI fills this in. Add one by hand only for a build you made yourself.</Text>
          {form.builds.map((row, i) => (
            <Card key={row.key} variant="quiet" pad="md" role="group" aria-label={`Build ${i + 1}`}>
              <FormField id={fieldId(ids, `build-${row.key}-harness`)} label="Harness">
                <Select options={optionsFor(row.harness)} value={row.harness} onValueChange={harness => editBuild(row.key, { harness })} />
              </FormField>
              <FormField id={fieldId(ids, `build-${row.key}-path`)} label="Build folder">
                <Input name="distribution_path" mono autoComplete="off" spellCheck={false} value={row.path} onChange={e => editBuild(row.key, { path: e.currentTarget.value })} />
              </FormField>
              <FormField id={fieldId(ids, `build-${row.key}-version`)} label="Version">
                <Input name="distribution_version" autoComplete="off" spellCheck={false} value={row.version} onChange={e => editBuild(row.key, { version: e.currentTarget.value })} />
              </FormField>
              <Cell align="start"><Button variant="outline" size="sm" aria-label={`Remove build ${i + 1}`} onClick={() => removeBuild(row.key)}><Icon name="delete" />Remove build</Button></Cell>
            </Card>
          ))}
          {problems.builds ? <RefusalLine>{problems.builds}</RefusalLine> : null}
          <Cell align="start"><Button ref={add} variant="outline" size="sm" onClick={addBuild}><Icon name="plus" />Add build</Button></Cell>
        </Column>
      </Fold>
    </>
  );
}

/** The question before leaving a form with changes: its words, and its two buttons (Keep editing has the focus). */
export const DISCARD_NOTE = 'What you changed is not saved.';
export function DiscardFooter({ onKeep, onDiscard }: { onKeep(): void; onDiscard(): void }) {
  return (
    <>
      <Button variant="outline" autoFocus onClick={onKeep}>Keep editing</Button>
      <Button variant="destructive" onClick={onDiscard}>Discard changes</Button>
    </>
  );
}

// ---------- the dialog ----------

/** What Adapt with AI says when the coding agent of Settings is Codex: adapting holds the run to a dollar budget, which only Claude Code allows. */
export const ADAPT_NEEDS_CLAUDE = 'Adapting a plugin needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
const ADAPT_HARNESSES = HARNESS_OPTIONS.filter(o => o.value !== 'deepseek');
const FALLBACK_ADAPT = 'claude-code';

/** Whether Adapt can start with this engine, and what its dialog says first. The coding agent runs on this computer whatever engine answers the simulator: with the API chosen the dialog says so. */
function adaptWords(engine: Engine): { codex: boolean; said: string } {
  const agent = harnessNames[engine.harness] ?? engine.harness;
  const codex = engine.harness === 'codex';
  const lead = engine.api ? `Adapting a plugin needs a coding agent on this computer: ${agent}. It` : agent;
  return { codex, said: codex ? ADAPT_NEEDS_CLAUDE : `${lead} builds this plugin for the harness you choose, with your custom instructions, and validates the result. It uses ${agent}'s own credentials and spends at most the budget below.` };
}
/** The harness Adapt offers first: one whose instructions changed, or one the plugin targets and has no build for; else Claude Code. */
function adaptTarget(plugin: Plugin, snapshot: Snapshot): string {
  const stale = snapshot.custom_instructions?.find(i => i.plugin_id === plugin.id)?.stale_harnesses[0];
  const missing = plugin.targets.map(id => snapshot.registry.targets.find(t => t.id === id)?.harness).find(h => !!h && !plugin.distributions.some(d => d.harness === h));
  const wanted = stale ?? missing ?? '';
  return ADAPT_HARNESSES.some(o => o.value === wanted) ? wanted : FALLBACK_ADAPT;
}

type View = 'form' | 'adapt' | 'remove' | 'discard' | 'export';
type Working = 'save' | 'resolve' | 'reinstall' | 'folder' | 'reload' | 'remove' | 'adapt';
/** A failure of the last request, said inside the drawer. `saving`: it was a save, which says "Not saved". */
interface Fault { text: string; saving: boolean }
/** What the drawer shows besides the form: the view, the last failure, the line under the instructions, the folds, and the fields of Adapt. */
interface Ui { view: View; exportArchive?: ResolvedProject; fault: Fault | null; status: string; more: boolean; notes: boolean; advanced: boolean; harness: string; budget: string; budgetProblem: string | null }
/** A drawer's session: for which plugin and whether it is open (`known`: it was made from the plugin, not from nothing), the form it opened on (`base`), the form as typed, and whether a save was tried (the problems show from then on). */
interface Session { id: string; open: boolean; known: boolean; base: PluginForm; form: PluginForm; tried: boolean; ui: Ui }
const calm = (): Ui => ({ view: 'form', fault: null, status: '', more: false, notes: false, advanced: false, harness: FALLBACK_ADAPT, budget: '2', budgetProblem: null });
const opened = (id: string, open: boolean, plugin: Plugin | null, targets: readonly Target[]): Session => { const form = formOf(plugin, targets); return { id, open, known: plugin !== null, base: form, form, tried: false, ui: calm() }; };
const NO_TARGETS: readonly Target[] = [];
/** Where the focus goes when a view goes back to the form: the control that opened it (the question before leaving has none: the first field). */
const RETURNS = { adapt: 'adapt-open', remove: 'remove-open', discard: 'source', export: 'export-open' } as const;

export interface PluginDialogProps {
  /** The id of the plugin in the registry's list. A plugin that is not there (taken away while the drawer was closing) draws nothing. */
  pluginId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The control the drawer was opened from (the plugin's row), where the focus goes back when it closes. The drawer cannot tell it by itself: its Source field takes the focus as it
   * mounts, before Sigrid's sheet records what had the focus, so the sheet would give it back to a field that is gone. */
  restoreFocusTo: React.RefObject<HTMLElement | null>;
}

export function PluginDialog({ pluginId, open, onOpenChange, restoreFocusTo }: PluginDialogProps) {
  const { snapshot, request } = useRegistry();
  const sync = useSync();
  const jobs = useJobs();
  const notify = useNotify();
  const ids = React.useId();
  const formId = `${ids}-form`, adaptId = `${ids}-adapt`;
  const targets = snapshot?.registry.targets ?? NO_TARGETS;
  const plugin = snapshot?.registry.plugins.find(p => p.id === pluginId) ?? null;
  // The plugin as last seen: the drawer keeps showing it while the registry no longer has it (it was removed here, or somewhere else), and says so.
  const seen = React.useRef<Plugin | null>(null);
  if (seen.current && seen.current.id !== pluginId) seen.current = null;
  if (plugin) seen.current = plugin;
  const shown = plugin ?? seen.current;
  const gone = plugin === null && shown !== null;

  /** What the focus does when the drawer is gone: back to the row it was opened from (`restoreFocusTo`); after a removal, or when that row is gone, to the page; and after the review opens it stays
   * where the review put it. */
  const after = React.useRef<'removed' | 'review' | null>(null);

  // The form starts from the plugin each time the drawer opens (or another plugin is asked for), and is not made again when the registry changes while it is open: what the person typed is
  // theirs. A drawer that closes keeps what it showed until it is gone.
  const [held, setHeld] = React.useState<Session>(() => opened(pluginId, open, shown, targets));
  let session = held;
  if (pluginId !== held.id || (open && !held.open) || (shown !== null && !held.known)) {
    session = opened(pluginId, open, shown, targets);
    if (open) after.current = null;
  } else if (open !== held.open) session = { ...held, open };
  if (session !== held) setHeld(session);
  const { base, form, tried, ui } = session;
  const patchUi = (p: Partial<Ui>): void => setHeld(now => ({ ...now, ui: { ...now.ui, ...p } }));
  const change = (p: Partial<PluginForm>): void => setHeld(now => ({ ...now, form: nextForm(now.form, p) }));
  const dirty = changed(base, form);
  const problems = tried ? problemsOf(form) : {};

  const [working, setWorking] = React.useState<Working | null>(null);
  const busy = React.useRef(false);
  const live = React.useRef(true);
  React.useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  /** What the registry, the request and the sync state are now, for what runs after an `await`. */
  const latest = React.useRef({ snapshot, request, adopt: sync.adopt, openReview: sync.openReview, notify, plugin });
  latest.current = { snapshot, request, adopt: sync.adopt, openReview: sync.openReview, notify, plugin };

  /** One request of the drawer's at a time. A failure is the drawer's own line; `done` runs with what came back. */
  async function act<T>(what: Working, flow: () => Promise<T>, done: (value: T) => void): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setWorking(what);
    patchUi({ fault: null });
    try {
      const value = await flow();
      if (live.current) done(value);
    } catch (e) {
      if (live.current) patchUi({ fault: { text: message(e), saving: what === 'save' } });
    } finally {
      busy.current = false;
      if (live.current) setWorking(null);
    }
  }
  const engine = engineOf(snapshot?.registry.settings);
  const { codex, said } = adaptWords(engine);
  // Why Adapt cannot start: Codex is the agent of Settings, or another AI run goes (one at a time).
  const stop = codex ? ADAPT_NEEDS_CLAUDE : busyReason(jobs.running);

  function back(): void {
    if (ui.view === 'form') return;
    const to = fieldId(ids, RETURNS[ui.view]);
    patchUi({ view: 'form', fault: null });
    requestAnimationFrame(() => document.getElementById(to)?.focus());
  }
  /** Every way out of the drawer: Escape, the close button, a press outside and Cancel. In a question it is the question's own Cancel; in a form with changes it is the question. */
  function leave(): void {
    if (busy.current) return;
    if (ui.view !== 'form') { back(); return; }
    if (dirty && !gone) { patchUi({ view: 'discard', fault: null }); return; }
    onOpenChange(false);
  }
  /** The actions under More work on the saved plugin: with changes in the form they say so, and do nothing. */
  function unsaved(): boolean {
    if (!dirty) return false;
    patchUi({ fault: { text: 'Save your changes first: this acts on the saved plugin.', saving: false }, more: true });
    return true;
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setHeld(now => ({ ...now, tried: true }));
    if (busy.current || gone || !shown) return;
    const found = problemsOf(form);
    if (Object.keys(found).length) { focusProblem(ids, form, found); return; }
    if (!dirty) return;
    void act('save', async () => {
      const now = latest.current;
      const current = now.plugin ?? shown;
      return registryWrite(now.request, await revisionOf(now.request, now.snapshot), 'save_plugin', { plugin: editedPlugin(current, base, form, now.snapshot?.registry.targets ?? targets) });
    }, saved => { latest.current.adopt(saved); latest.current.notify('Saved.'); onOpenChange(false); });
  }
  function checkUpdates(): void {
    if (!shown || unsaved()) return;
    const before = shown.upstream_revision;
    void act('resolve', () => resolvePlugin(latest.current.request, shown.id, latest.current.adopt), resolved => {
      const now = resolved.registry.plugins.find(p => p.id === shown.id);
      const found = !!now?.upstream_revision && now.upstream_revision !== before;
      latest.current.adopt(resolved);
      latest.current.notify(found && now ? `${shown.name} ${versionOf(now).version} found.` : `${shown.name}: no new version.`);
      onOpenChange(false);
    });
  }
  function planReinstall(): void {
    if (!shown || unsaved()) return;
    // The review sheet is a window of its own: this drawer goes, and the plan (no request is made for it again) opens there. It is never the plan the note and the table read.
    // The reinstall of this plugin alone, on every harness it is on: no other change comes with it.
    void act('reinstall', () => latest.current.request<Plan>('plan', { reinstall: shown.id, plugin_id: shown.id }), plan => {
      after.current = 'review';
      onOpenChange(false);
      void latest.current.openReview({ plan, pluginId: shown.id });
    });
  }
  function openFolder(): void {
    if (!shown) return;
    void act('folder', async () => { await latest.current.request('open_custom_instructions', { id: shown.id }); return latest.current.request<Snapshot>('snapshot'); }, read => {
      latest.current.adopt(read);
      patchUi({ status: 'Folder opened. Edit the Markdown files, reload them, then adapt the plugin again.' });
    });
  }
  function reload(): void {
    void act('reload', () => latest.current.request<Snapshot>('snapshot'), read => { latest.current.adopt(read); patchUi({ status: '' }); });
  }
  function openAdapt(): void {
    if (!shown || !snapshot || unsaved()) return;
    patchUi({ view: 'adapt', fault: null, harness: adaptTarget(shown, snapshot), budget: String(engine.budget !== null && engine.budget > 0 ? engine.budget : 2), budgetProblem: null });
  }
  function startAdapt(): void {
    if (!shown || busy.current || stop !== null) return;
    const budget = parseBudget(ui.budget);
    const bad = budget > 0 ? checkBudget(ui.budget) : 'Enter a budget above zero.';
    patchUi({ budgetProblem: bad });
    if (bad) { setTimeout(() => document.getElementById(fieldId(ids, 'budget'))?.focus(), 0); return; }
    // The run goes on in Activity; the registry is read once more so the window finds it running at once.
    void act('adapt', async () => {
      await latest.current.request('adapt', { id: shown.id, harness: ui.harness, agent: engine.harness, budget_usd: budget });
      return latest.current.request<Snapshot>('snapshot');
    }, read => { latest.current.adopt(read); latest.current.notify('Started. Follow it in Activity.'); onOpenChange(false); });
  }
  function remove(): void {
    if (!shown) return;
    void act('remove', async () => {
      const now = latest.current;
      return registryWrite(now.request, await revisionOf(now.request, now.snapshot), 'remove_plugin', { id: shown.id });
    }, saved => {
      after.current = 'removed';
      latest.current.adopt(saved);
      latest.current.notify(`${shown.name} removed from your list.`);
      onOpenChange(false);
    });
  }

  if (!shown) return null;
  const label = shortName(shown.name);
  const instructions = snapshot?.custom_instructions?.find(i => i.plugin_id === shown.id);
  const files = instructions?.files ?? [];
  const folder = instructions?.path || shown.custom_instructions_dir;
  const stale = instructions?.stale_harnesses ?? [];
  const fault = ui.fault;
  const savedSource = form.source.trim() === shown.source;
  const sourceFailure = savedSource ? plugin?.project_source_error : undefined;
  const archive = savedSource && !sourceFailure ? plugin?.resolved_project : undefined;
  if (ui.view === 'export') {
    const checked = ui.exportArchive;
    const staleReason = archive?.digest === checked?.digest ? undefined : 'The source changed. Close this window and check for updates.';
    return <ExtractDialog id={shown.id} name={label} action="extract_plugin" harnesses={checked?.harnesses ?? []} digest={checked?.digest}
      unavailableReason={sourceFailure || staleReason} open={open}
      onOpenChange={next => { if (!next) back(); }} onExported={() => onOpenChange(false)} />;
  }

  let title: string, description: string, body: React.ReactNode, footer: React.ReactNode;
  if (ui.view === 'adapt') {
    title = `Adapt ${label} with AI`;
    description = said;
    body = (
      <form key="adapt" id={adaptId} noValidate onSubmit={e => { e.preventDefault(); startAdapt(); }}><Column gap="lg">
        <Text as="p" variant="muted">Your custom instructions are read with the source: the AI decides how to fit them in and records why.</Text>
        <FormField id={fieldId(ids, 'harness')} label="For harness">
          <Select options={ADAPT_HARNESSES} value={ui.harness} onValueChange={harness => patchUi({ harness })} />
        </FormField>
        <FormField id={fieldId(ids, 'budget')} label="Maximum budget (USD)" help="Checked between turns: the run can end slightly above it." error={ui.budgetProblem}>
          <Input name="budget" short="sm" autoFocus inputMode="decimal" autoComplete="off" value={ui.budget} onChange={e => patchUi({ budget: e.currentTarget.value, budgetProblem: null })} />
        </FormField>
        {!codex && stop ? <RefusalLine>{stop}</RefusalLine> : null}
        {fault ? <RefusalLine>{fault.text}</RefusalLine> : null}
      </Column></form>
    );
    footer = (
      <React.Fragment key="adapt">
        <Button variant="outline" disabled={working !== null} onClick={back}>Cancel</Button>
        <span title={stop ?? undefined}>
          <Button type="submit" form={adaptId} disabled={stop !== null} title={stop ?? undefined} loading={working === 'adapt'} loadingText="Starting…">Start</Button>
        </span>
      </React.Fragment>
    );
  } else if (ui.view === 'remove') {
    title = `Remove ${label} from your list?`;
    description = 'It stays installed where it is. On a harness set to uninstall what is not in your list, the next sync plans its removal and asks you to confirm it.';
    body = <React.Fragment key="remove">{fault ? <RefusalLine>{fault.text}</RefusalLine> : null}</React.Fragment>;
    footer = (
      <React.Fragment key="remove">
        <Button variant="outline" autoFocus disabled={working !== null} onClick={back}>Cancel</Button>
        <Button variant="destructive" loading={working === 'remove'} loadingText="Removing…" onClick={remove}>Remove {label}</Button>
      </React.Fragment>
    );
  } else if (ui.view === 'discard') {
    title = `Discard changes to ${label}?`;
    description = DISCARD_NOTE;
    body = null;
    footer = <DiscardFooter key="discard" onKeep={back} onDiscard={() => onOpenChange(false)} />;
  } else {
    title = label;
    const adapted = [...new Set((plugin?.distributions ?? []).filter(d => d.origin === 'muro').map(d => harnessNames[d.harness] ?? d.harness))];
    description = archive ? 'Sync installs the builds included in this Muro project file.' : plugin?.project ? 'The build of one of your projects.'
      : adapted.length ? `Its author's builds, and the ones Muro adapted for ${adapted.join(', ')}.` : 'Its author\'s builds, as they ship them.';
    body = gone ? <RefusalLine>This plugin is no longer in your list.</RefusalLine> : (
      <form key="form" id={formId} noValidate onSubmit={submit}><Column gap="lg">
        {sourceFailure && fault?.text !== sourceFailure ? <RefusalLine>{sourceFailure}</RefusalLine> : null}
        {archive ? (
          <Column as="section" gap="xs" aria-label="Project file builds">
            <Text variant="strong" truncate title={archive.path}>{archive.path.split(/[\\/]/).pop()}</Text>
            <BuildAvailability harnesses={archive.harnesses} />
            <Cell align="start"><Button type="button" id={fieldId(ids, 'export-open')} size="sm" variant="outline" disabled={working !== null || !archive.harnesses.length}
              onClick={() => { if (!unsaved()) patchUi({ view: 'export', exportArchive: archive, fault: null }); }}>Export to folder…</Button></Cell>
          </Column>
        ) : null}
        <PluginFields ids={ids} form={form} onChange={change} problems={problems} targets={targets} saved advanced={ui.advanced} onAdvanced={advanced => patchUi({ advanced })} />
        <Column gap="sm" as="section" aria-label="Custom instructions">
          {instructions?.error ? <RefusalLine>{instructions.error}</RefusalLine> : null}
          {stale.length ? <Note tone="warning" announce={false} title={<Text>{`Instructions changed. Adapt again for: ${stale.map(h => harnessNames[h] ?? h).join(', ')}.`}</Text>} /> : null}
          <Fold label={`Custom instructions · ${files.length ? plural(files.length, 'Markdown file') : 'none yet'}`} open={ui.notes} onToggle={() => patchUi({ notes: !ui.notes })}>
            <Text as="p" variant="muted">Your own Markdown notes. The AI reads them with the source when it adapts this plugin.</Text>
            {folder ? <Text mono>{folder}</Text> : null}
            {files.length ? <Column as="ul" gap="xs">{files.map(file => <li key={file}><Text variant="soft" mono>{file}</Text></li>)}</Column> : null}
            <Cell align="start"><Button variant="outline" size="sm" loading={working === 'reload'} loadingText="Reading…" disabled={working !== null && working !== 'reload'} onClick={reload}><Icon name="refresh" />Reload files</Button></Cell>
          </Fold>
          <Text as="p" variant="note" role="status">{ui.status}</Text>
        </Column>
        <Fold label="More" open={ui.more} onToggle={() => patchUi({ more: !ui.more })}>
          <Cluster gap="sm">
            <Button variant="outline" loading={working === 'resolve'} loadingText="Checking the source…" disabled={working !== null && working !== 'resolve'} onClick={checkUpdates}><Icon name="refresh" />Check for updates</Button>
            <Button id={fieldId(ids, 'adapt-open')} variant="outline" disabled={working !== null} onClick={openAdapt}><Icon name="ai" />Adapt with AI</Button>
            <Button variant="outline" loading={working === 'reinstall'} loadingText="Planning…" disabled={working !== null && working !== 'reinstall'} onClick={planReinstall}>Plan a reinstall</Button>
            <Button variant="outline" loading={working === 'folder'} loadingText="Opening…" disabled={working !== null && working !== 'folder'} onClick={openFolder}>Open instructions folder</Button>
            <Button id={fieldId(ids, 'remove-open')} variant="outline" disabled={working !== null} onClick={() => patchUi({ view: 'remove', fault: null })}><Icon name="delete" />Remove from my list</Button>
          </Cluster>
        </Fold>
        {fault ? (fault.saving ? <NotSaved text={fault.text} /> : <RefusalLine>{fault.text}</RefusalLine>) : null}
        {!dirty ? <Text as="p" variant="note">Nothing has changed yet.</Text> : null}
      </Column></form>
    );
    footer = gone ? <Button key="gone" variant="outline" onClick={() => onOpenChange(false)}>Close</Button> : (
      <React.Fragment key="form">
        <Button variant="outline" disabled={working !== null} onClick={leave}>Cancel</Button>
        <Button type="submit" form={formId} loading={working === 'save'} loadingText="Saving…" disabled={!dirty}>Save</Button>
      </React.Fragment>
    );
  }

  return (
    <Dialog
      drawer
      open={open}
      onOpenChange={next => { if (next) onOpenChange(true); else leave(); }}
      restoreFocusTo={restoreFocusTo}
      onCloseAutoFocus={event => {
        // A review opened in its place has the focus already.
        if (after.current === 'review') { event.preventDefault(); return; }
        // The row the drawer came from is gone with the plugin (removed here or somewhere else): the page takes the focus. Otherwise `restoreFocusTo` gives it back to the row.
        if (after.current === 'removed' || !restoreFocusTo.current?.isConnected) {
          event.preventDefault();
          document.querySelector<HTMLElement>('[data-slot="app-shell-content"]')?.focus();
        }
      }}
      title={title}
      description={description}
      footer={footer}
    >
      {body}
    </Dialog>
  );
}
