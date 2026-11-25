// The Settings page, as far as the new window has it: the look of the window, and nothing else yet.
// The theme is the shell's own choice of light, dark or the system's look: the same three commands as the palette and the switch of
// the bar, read and run here (Sigrid's command registry), so the page keeps no theme of its own. The glass is Imago's (`useGlass`):
// off until the person chooses, kept by the window, and only in Muro's own window on Windows.
import { useGlass, useWindow } from '@acaprino/imago';
import { Icon, Page, Section, Switch, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import { useCommands } from '@acaprino/sigrid/assemblies';

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
