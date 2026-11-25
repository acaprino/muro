import * as React from 'react';
import { Badge, Button, Cluster, Column, Count, Icon, RadioGroup, RadioGroupItem, Section, Text } from '@acaprino/sigrid/primitives';
import { SettingRow } from '@acaprino/sigrid/components';
import type { InstalledPlugin, Snapshot, Target } from '../../types.ts';
import { exclusiveMode, filesMissing, listing, unlisted } from '../../model.ts';
import { useNotify } from '@acaprino/imago';
import { useRegistry } from '../../state/registry.tsx';
import { message, plural } from '../../words.ts';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { registryWrite } from './registryWrite.ts';
import { useSync } from './useSync.tsx';

/** "Installed, not in your list" (a section of the Sync page, under the table): what a harness Muro reads completely holds that the list does not, the one rule for all of it (*Leave alone*
 * or *Uninstall, asking first*), what the rule does to each line before anything is applied, and *Add to my list*. A plugin removed from the list shows here too (it is installed and not listed),
 * and can be added again. The rule is a Target field (`exclusive`), saved harness by harness, so the section is also where it is read as one (`exclusiveMode`). Nothing here uninstalls: a removal
 * is a plan's, and waits for the confirmation of the review sheet (ADR-0029). */

/** What an installed plugin that tells no folder can say instead of a button: the list needs a folder to point at (`listedPlugin`), and the Add plugin dialog takes the source from the person. */
export const NO_FOLDER = 'It reports no folder, so the list has nothing to point at: add it with Add plugin, giving its source.';

/** Whether the list can take this installed plugin as it is: it has a folder to point at. */
export const listable = (installed: InstalledPlugin): boolean => !!installed.path;

/** Add to my list: an installed plugin becomes a plugin of the list as `listedPlugin` says, and the service binds it to the installation that is there (`adopt`), so the next sync finds it installed
 * instead of putting a second copy beside it. The write is `registryWrite`'s (the revision, and the one retry when it moved), and the snapshot it returns goes to `useSync().adopt`. `add` resolves
 * with `{ error }`: the service's words when it was refused (a Claude Code record whose files are gone: "has no files on Claude Code; reinstall it there or remove it"), or null when the plugin is in
 * the list; and with null when it did nothing (another add was running, or the registry is not read yet). The caller shows the words where it is (the inspector, the section), never in a notice,
 * which would cover a dialog's buttons. A success is a notice (`added`) unless `quiet`: the harness inspector stays open beside the page, and says it in its own line. `adding` is the line being added. */
export function useAddToList(): { add(installed: InstalledPlugin, target: Target, quiet?: boolean): Promise<{ error: string | null } | null>; adding: string | null } {
  const { snapshot, request } = useRegistry();
  const { adopt } = useSync();
  const notify = useNotify();
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const working = React.useRef(false);
  const [adding, setAdding] = React.useState<string | null>(null);
  const add = React.useCallback(async (installed: InstalledPlugin, target: Target, quiet = false): Promise<{ error: string | null } | null> => {
    const held = latest.current;
    if (working.current || !held) return null;
    working.current = true;
    setAdding(`${target.id}:${installed.id}`);
    try {
      const { plugin, adopt: adoption } = listing(installed, target, held.registry.revision);
      adopt(await registryWrite(request, held.registry.revision, 'save_plugin', { plugin, adopt: adoption }));
      if (!quiet) notify(added(installed));
      return { error: null };
    } catch (e) { return { error: message(e) }; }
    finally { working.current = false; setAdding(null); }
  }, [request, adopt, notify]);
  return { add, adding };
}

/** What is said when a plugin was added to the list. */
export const added = (installed: InstalledPlugin): string => `${installed.name} added to your list.`;

/** The line a plugin outside the list has: its version, the harness, and that its files are gone when its record says so. */
const lineOf = (installed: InstalledPlugin, target: Target): string => `${installed.version} · on ${target.name}${filesMissing(installed)}`;

export function Unlisted() {
  const { snapshot, request } = useRegistry();
  const { adopt } = useSync();
  const notify = useNotify();
  const { add, adding } = useAddToList();
  const [failure, setFailure] = React.useState<string | null>(null);
  const working = React.useRef(false);
  const latest = React.useRef(snapshot);
  latest.current = snapshot;
  const note = React.useId();
  const items = snapshot ? unlisted(snapshot) : [];
  if (!snapshot || !items.length) return null;
  const mode = exclusiveMode(snapshot.registry.targets);

  /** The one rule for plugins outside the list, for every harness: one `save_target` after the other, each on the revision the one before returned; a harness that has it already is not saved again.
   * It stops at the first that fails, says how many were saved, and the ones saved stay saved. The snapshot of the last save is adopted once, so the plan is asked for once. */
  async function setRule(wanted: boolean): Promise<void> {
    const held = latest.current;
    if (working.current || !held) return;
    const targets = held.registry.targets.filter(t => t.exclusive !== wanted);
    if (!targets.length) return;
    working.current = true;
    setFailure(null);
    let revision = held.registry.revision, last: Snapshot | undefined, saved = 0;
    try {
      for (const t of targets) {
        try { last = await registryWrite(request, revision, 'save_target', { target: { ...t, exclusive: wanted } }); revision = last.registry.revision; saved++; }
        catch (e) { throw new Error(`${saved ? `${plural(saved, 'harness', 'harnesses')} saved. ` : ''}${t.name} was not saved: ${message(e)}`); }
      }
      if (last) adopt(last);
      notify(wanted ? 'Saved. Muro will ask before it uninstalls plugins outside your list.' : 'Saved. Plugins outside your list are left alone.');
    } catch (e) {
      if (last) adopt(last);
      setFailure(message(e));
    } finally { working.current = false; }
  }

  async function addToList(installed: InstalledPlugin, target: Target): Promise<void> {
    setFailure(null);
    const result = await add(installed, target);
    if (result?.error) setFailure(result.error);
  }

  return (
    <Section title="Installed, not in your list" icon={<Icon name="download" />} end={<Count value={items.length} label={items.length === 1 ? 'plugin' : 'plugins'} />}>
      <Text as="p" variant="note" id={note}>Uninstall: Muro plans the removal of what is installed on a harness but is not in your list, and asks you to confirm it. The background sync never uninstalls. One harness can differ, in its own panel.</Text>
      <Cluster gap="lg">
        <RadioGroup aria-label="Plugins that are not in my list" aria-describedby={note} orientation="horizontal" value={mode === 'mixed' ? '' : mode} onValueChange={value => void setRule(value === 'remove')}>
          <RadioGroupItem value="keep">Leave alone</RadioGroupItem>
          <RadioGroupItem value="remove">Uninstall, asking first</RadioGroupItem>
        </RadioGroup>
        {mode === 'mixed' ? <Text variant="note">Differs per harness</Text> : null}
      </Cluster>
      {failure ? <RefusalLine>{failure}</RefusalLine> : null}
      <Column as="ul" gap="xs">
        {items.map(({ target, plugin }) => {
          const key = `${target.id}:${plugin.id}`;
          return (
            <li key={key}>
              <SettingRow
                label={<Text variant="strong" truncate>{plugin.name}</Text>}
                description={<Text pre>{lineOf(plugin, target)}{listable(plugin) ? '' : ` ${NO_FOLDER}`}</Text>}
                control={(
                  <Cluster justify="end">
                    {target.exclusive
                      ? <Badge tone="warning" title="Muro asks before it uninstalls">Removal waits for your confirmation</Badge>
                      : <Text variant="note">Left alone</Text>}
                    {listable(plugin)
                      ? <Button variant="outline" size="sm" aria-label={`Add to my list: ${plugin.name}`} loading={adding === key} loadingText="Adding…" disabled={adding !== null && adding !== key} onClick={() => void addToList(plugin, target)}><Icon name="plus" />Add to my list</Button>
                      : null}
                  </Cluster>
                )}
              />
            </li>
          );
        })}
      </Column>
    </Section>
  );
}
