// The Settings page: the automatic sync and the look of the window.
// The automatic sync is the registry's (`settings.auto_sync`, `settings.interval_minutes`): the background worker checks on that interval and applies what
// is ready, never a removal; the tray switches it too. A change is saved at once on the registry as it is now (`atRevision`), and the window takes what the
// service answers. The theme is the shell's own choice of light, dark or the system's look: the same three commands as the palette and the switch of
// the bar, read and run here (Sigrid's command registry), so the page keeps no theme of its own. The glass is Imago's (`useGlass`):
// off until the person chooses, kept by the window, and only in Muro's own window on Windows.
import * as React from 'react';
import { useGlass, useNotify, useWindow } from '@acaprino/imago';
import { Icon, Page, Section, Select, Switch, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import { useCommands } from '@acaprino/sigrid/assemblies';
import type { Settings as RegistrySettings, Snapshot } from '../types.ts';
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

/** The automatic sync and how often it checks. Until the registry is read there is nothing to show. */
function SyncSettings() {
  const { snapshot, request, adopt } = useRegistry();
  const notify = useNotify();
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const [saving, setSaving] = React.useState(false);
  if (!snapshot) return null;
  const settings = snapshot.registry.settings;

  async function save(patch: Partial<RegistrySettings>): Promise<void> {
    setSaving(true);
    try {
      adopt(await atRevision(request, latest.current, adopt, revision =>
        request<Snapshot>('settings', { revision, settings: { ...latest.current?.registry.settings, ...patch } })));
    } catch (e) { notify(message(e), { kind: 'error' }); }
    finally { setSaving(false); }
  }

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
