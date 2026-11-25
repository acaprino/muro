// The Settings page, as far as the new window has it: the look of the window. Light, dark and the system's look are the commands
// of the palette, the same in every app of the suite; the glass of the window is a choice of its own here, and a command too
// (Imago's `useGlass`). It is off until the person chooses, and the window keeps the choice. A browser has no glass: there the
// section is not drawn. The rest of the settings is still to come (pages/Moved.tsx).
import { useGlass, useWindow } from '@acaprino/imago';
import { Column, Icon, Section, Switch, Text } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import { Moved } from './Moved.tsx';

export function Settings() {
  const { own } = useWindow();
  const [glass, setGlass] = useGlass();
  return (
    <Column fill gap="xl">
      {own ? (
        <Column pad="xl">
          <Section title="Appearance" icon={<Icon name="appearance" />}>
            <Text as="p" variant="note">Light, dark or the system's look: in Commands (Ctrl K).</Text>
            <SettingRow label="Glass" description="What is behind the window shows through it" control={<Switch aria-label="Glass" checked={glass} onCheckedChange={setGlass} />} />
          </Section>
        </Column>
      ) : null}
      <Moved page="Settings" />
    </Column>
  );
}
