// The Settings page: the automatic sync, the AI engine and the look of the window.
// The automatic sync is the registry's (`settings.auto_sync`, `settings.interval_minutes`): the background worker checks on that interval and applies what
// is ready, never a removal; the tray switches it too. A change is saved at once on the registry as it is now (`atRevision`), and the window takes what the
// service answers. The theme is the shell's own choice of light, dark or the system's look: the same three commands as the palette and the switch of
// the bar, read and run here (Sigrid's command registry), so the page keeps no theme of its own. The glass is Imago's (`useGlass`):
// off until the person chooses, kept by the window, and only in Muro's own window on Windows. The AI engine is the registry's `settings.ai`, which the service checks
// (`ai.rs`): what answers a simulation (a coding agent on this computer, or an OpenAI-compatible API) and the agent that adapts a plugin and changes a project.
import * as React from 'react';
import { useGlass, useNotify, useWindow } from '@acaprino/imago';
import { Icon, Input, Page, Section, Select, Switch, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import { useCommands } from '@acaprino/sigrid/assemblies';
import type { AiSettings, Settings as RegistrySettings, Snapshot } from '../types.ts';
import { intervalOptions } from '../model.ts';
import { message } from '../words.ts';
import { useRegistry } from '../state/registry.tsx';
import { atRevision } from './project/write/DeleteDialog.tsx';

/** The shell's commands of the look, in this order. */
const SCHEMES = ['light', 'dark', 'system'] as const;

export function Settings() {
  const { own } = useWindow();
  const [glass, setGlass] = useGlass();
  const commands = useCommands();
  const schemes = SCHEMES.map(id => commands.find(command => command.id === `sigrid.scheme.${id}`)).filter(command => command !== undefined);
  const chosen = schemes.find(command => command.checked)?.id ?? '';
  return (
    <Page>
      <SyncSettings />
      <AiEngineSettings />
      <Section title="Appearance" icon={<Icon name="appearance" />}>
        <SettingRow
          label="Theme"
          description="Also in Commands (Ctrl K)"
          control={(
            <ToggleGroup aria-label="Theme" value={chosen} onValueChange={id => schemes.find(command => command.id === id)?.run()}>
              {schemes.map(command => <ToggleGroupItem key={command.id} value={command.id}>{command.label}</ToggleGroupItem>)}
            </ToggleGroup>
          )}
        />
        <SettingRow
          label="Glass"
          description="What is behind the window shows through it. Windows only, in Muro's own window."
          control={own ? <Switch aria-label="Glass" checked={glass} onCheckedChange={setGlass} /> : undefined}
        />
      </Section>
    </Page>
  );
}

/** A change of the registry's settings, saved at once on the registry as it is now; what the service refuses is said as a notice. */
function useSaveSettings() {
  const { snapshot, request, adopt } = useRegistry();
  const notify = useNotify();
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const [saving, setSaving] = React.useState(false);
  async function save(patch: Partial<RegistrySettings>): Promise<boolean> {
    setSaving(true);
    try {
      adopt(await atRevision(request, latest.current, adopt, revision =>
        request<Snapshot>('settings', { revision, settings: { ...latest.current?.registry.settings, ...patch } })));
      return true;
    } catch (e) { notify(message(e), { kind: 'error' }); return false; }
    finally { setSaving(false); }
  }
  /** A change of some keys of `ai`: the service keeps the others. */
  const saveAi = (patch: Partial<AiSettings>) => save({ ai: { ...latest.current!.registry.settings.ai, ...patch } });
  return { snapshot, saving, save, saveAi };
}

/** The automatic sync and how often it checks. Until the registry is read there is nothing to show. */
function SyncSettings() {
  const { snapshot, saving, save } = useSaveSettings();
  if (!snapshot) return null;
  const settings = snapshot.registry.settings;

  const options = intervalOptions(settings.interval_minutes).map(([minutes, label]) => ({ value: String(minutes), label }));
  return (
    <Section title="Sync" icon={<Icon name="refresh" />}>
      <SettingRow
        label="Automatic sync"
        description="Muro checks your list on its own and installs and updates what is ready. It never uninstalls without asking."
        control={<Switch aria-label="Automatic sync" checked={settings.auto_sync} disabled={saving} onCheckedChange={on => void save({ auto_sync: on })} />}
      />
      <SettingRow
        label="Check"
        description={settings.auto_sync ? 'How often the automatic sync looks for changes.' : 'Used when the automatic sync is on.'}
        control={<Select aria-label="How often to check" options={options} value={String(settings.interval_minutes)} disabled={saving}
          onValueChange={value => void save({ interval_minutes: Number(value) })} />}
      />
    </Section>
  );
}

const ENGINES = [{ value: 'harness', label: 'A coding agent on this computer' }, { value: 'api', label: 'An OpenAI-compatible API' }];
const AGENTS = [{ value: 'claude-code', label: 'Claude Code' }, { value: 'codex', label: 'Codex' }];

/** The AI engine: what answers a simulation, the coding agent that adapts a plugin and changes a project, and the budget of a simulation. The key is never a setting: only the name of the
 * environment variable it is read from. A text is saved when it is left or confirmed with Enter; what the service refuses (`ai.rs`) is said and the field shows what is saved. */
function AiEngineSettings() {
  const { snapshot, saving, saveAi } = useSaveSettings();
  if (!snapshot) return null;
  const ai = snapshot.registry.settings.ai;
  const api = ai.engine === 'api';
  return (
    <Section title="AI" icon={<Icon name="ai" />}>
      <SettingRow
        label="Simulations"
        description={api ? 'An OpenAI-compatible API answers the simulations of a project.' : 'The coding agent below answers the simulations of a project.'}
        control={<Select aria-label="What answers a simulation" options={ENGINES} value={ai.engine} disabled={saving} onValueChange={value => void saveAi({ engine: value as AiSettings['engine'] })} />}
      />
      <SettingRow
        label="Coding agent"
        description="Runs on this computer with its own credentials. Adapting a plugin and changing a project need Claude Code, the only agent Muro can hold to a budget."
        control={<Select aria-label="Coding agent" options={AGENTS} value={ai.harness} disabled={saving} onValueChange={value => void saveAi({ harness: value as AiSettings['harness'] })} />}
      />
      <SettingRow
        label="Simulation budget"
        description="At most this many US dollars for one simulation, above 0 and at most 100."
        control={<SavedText label="Simulation budget in US dollars" value={String(ai.budget_usd)} disabled={saving} inputMode="decimal"
          onSave={text => saveAi({ budget_usd: Number(text.trim().replace(',', '.')) })} />}
      />
      {api ? (
        <>
          <SettingRow label="API address" description="https, or http only on this computer." control={<SavedText label="API address" value={ai.api_base} disabled={saving} mono onSave={text => saveAi({ api_base: text.trim() })} />} />
          <SettingRow label="Model" description="The model the API answers with." control={<SavedText label="Model" value={ai.model} disabled={saving} mono onSave={text => saveAi({ model: text.trim() })} />} />
          <SettingRow label="Key variable" description="The name of the environment variable that holds the key. Never the key itself." control={<SavedText label="Key variable" value={ai.api_key_env} disabled={saving} mono onSave={text => saveAi({ api_key_env: text.trim() })} />} />
        </>
      ) : null}
    </Section>
  );
}

/** A text setting: edited in place, saved when it is left or confirmed with Enter, back to what is saved when the save is refused or Escape is pressed. */
function SavedText({ label, value, disabled, mono, inputMode, onSave }: { label: string; value: string; disabled: boolean; mono?: boolean; inputMode?: 'decimal'; onSave(text: string): Promise<boolean> }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  async function commit(): Promise<void> {
    if (draft === value) return;
    if (!(await onSave(draft))) setDraft(value);
  }
  return <Input aria-label={label} mono={mono} inputMode={inputMode} autoComplete="off" spellCheck={false} value={draft} disabled={disabled}
    onChange={e => setDraft(e.currentTarget.value)} onBlur={() => void commit()}
    onKeyDown={e => { if (e.key === 'Enter') void commit(); else if (e.key === 'Escape') setDraft(value); }} />;
}
