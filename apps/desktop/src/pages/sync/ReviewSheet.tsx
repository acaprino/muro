// The review sheet: what a plan would change, harness by harness, each operation with its reason, and what is not ready yet. A port of the Imago window's
// `reviewSheet` (sheets.ts of commit 5e33a82) on Sigrid's dialog. It shows the sheet useSync holds (`review`: the whole plan, the plan of one harness, or a
// reinstall someone else planned) and asks useSync to apply it; it sends nothing itself.
// - With blockers, Apply still applies what is ready (`allow_blocked`): each item left out says so, and the notice afterwards counts them.
// - Removals are applied only through the main button, which names them (model.ts `removalLabel`: "Apply and uninstall 6 plugins", "Apply and clear 25 records
//   without files", "Apply, uninstall 6 and clear 25 without files") and sends their number; "Apply without uninstalling" leaves them out. A plan of removals only
//   has no such button. With removals the focus starts on Cancel; without, on Apply.
// - While it applies the sheet cannot be closed (Escape and Cancel do nothing), and the button pressed says "Applying N changes…".
// - A refusal stays in the sheet, in its own line: a notice would cover its buttons. A plan refused because the registry moved is made again by useSync, and the
//   sheet shows the new one.
import * as React from 'react';
import { Badge, Button, Cluster, Column, Heading, Icon, Text } from '@acaprino/sigrid/primitives';
import { Dialog } from '@acaprino/sigrid/components';
import type { Operation, Review } from '../../types.ts';
import { removalLabel, removals } from '../../model.ts';
import { plural } from '../../words.ts';
import { useRegistry } from '../../state/registry.tsx';
import { RefusalLine } from '../project/write/HarmonizeDialog.tsx';
import { useSync } from './useSync.tsx';
import type { Choice } from './words.ts';

const KINDS: Record<string, string> = { install: 'Install', update: 'Update', reinstall: 'Reinstall', activate: 'Activate', remove: 'Remove' };
/** The versions an operation moves between, whether the entry it removes has its files, and why the service planned it. */
const detailOf = (o: Operation): string => {
  const versions = o.kind === 'remove' ? o.from_version : o.kind === 'update' ? `${o.from_version} → ${o.to_version}` : o.to_version;
  return [versions, o.present === false ? 'files missing' : '', o.reason].filter(Boolean).join(' · ');
};
/** What the removals of a plan do, beside its buttons. */
const removalNote = ({ uninstall, missing }: { uninstall: number; missing: number }): string =>
  uninstall && missing ? `${plural(uninstall, 'plugin')} will be uninstalled and ${plural(missing, 'record')} without files cleared.`
    : missing ? `${plural(missing, 'record')} without files will be cleared.`
      : `${plural(uninstall, 'plugin')} will be uninstalled.`;

export function ReviewSheet() {
  const { snapshot } = useRegistry();
  const sync = useSync();
  const uid = React.useId();
  // The button pressed, so that one says it applies while the other waits.
  const [choice, setChoice] = React.useState<Choice | null>(null);
  // The last sheet shown: the dialog stays mounted, closed, after it, so focus goes back to where it was opened from.
  const last = React.useRef<Review | null>(null);
  if (sync.review) last.current = sync.review;
  const review = sync.review ?? last.current;
  if (!review) return null;

  const plan = review.plan, ops = plan.operations, gone = removals(plan);
  const targets = snapshot?.registry.targets ?? [];
  const scope = review.target_id ? targets.find(t => t.id === review.target_id)?.name ?? 'this harness' : null;
  const running = sync.progress !== null && sync.progress.plan_id === plan.id;
  // The operations harness by harness, in the order the plan holds them.
  const groups: { id: string; name: string; ops: Operation[] }[] = [];
  for (const o of ops) {
    let group = groups.find(g => g.id === o.target_id);
    if (!group) {
      group = { id: o.target_id, name: targets.find(t => t.id === o.target_id)?.name ?? o.target_id, ops: [] };
      groups.push(group);
    }
    group.ops.push(o);
  }

  async function apply(which: Choice): Promise<void> {
    setChoice(which);
    try { await sync.apply({ choice: which }); } finally { setChoice(null); }
  }

  const skipping = running && choice === 'skip';
  const footer = (
    // Three buttons whose words count what they do: they wrap where the dialog has no room for them on one line.
    <Cluster justify="end">
      <Button variant="outline" disabled={running} onClick={() => sync.closeReview()}>{ops.length ? 'Cancel' : 'Close'}</Button>
      {gone.total > 0 && ops.length > gone.total ? (
        <Button variant="outline" loading={skipping} loadingText={`Applying ${plural(sync.progress?.total ?? ops.length - gone.total, 'change')}…`} disabled={running && !skipping} onClick={() => void apply('skip')}>
          Apply without uninstalling
        </Button>
      ) : null}
      {ops.length ? (
        <Button
          variant="default"
          autoFocus={gone.total === 0}
          loading={running && !skipping}
          loadingText={`Applying ${plural(sync.progress?.total ?? ops.length, 'change')}…`}
          disabled={skipping}
          onClick={() => void apply('confirm')}
        >
          {removalLabel(plan)}
        </Button>
      ) : null}
    </Cluster>
  );

  return (
    <Dialog
      open={sync.review !== null}
      onOpenChange={open => { if (!open) sync.closeReview(); }}
      title={scope ? `Sync ${scope}` : 'Review changes'}
      description={`${scope ? 'Only the changes of this harness. ' : ''}Nothing changes until you apply.`}
      footer={footer}
    >
      <Column gap="lg" data-review-sheet="">
        {groups.map((g, i) => (
          <Column key={g.id} as="section" aria-labelledby={`${uid}-group-${i}`}>
            <Heading size="small" id={`${uid}-group-${i}`}>{g.name}</Heading>
            <Column as="ul" gap="md">
              {g.ops.map((o, k) => (
                <Cluster key={`${o.plugin_id}-${o.kind}-${k}`} as="li" data-operation={o.kind} gap="md" align="start" wrap={false}>
                  <Badge tone={o.kind === 'remove' ? 'danger' : 'info'}>{KINDS[o.kind] ?? o.kind}</Badge>
                  <Column gap="xs">
                    <Text variant="strong" pre>{o.name}</Text>
                    <Text variant="note" pre>{detailOf(o)}</Text>
                  </Column>
                </Cluster>
              ))}
            </Column>
          </Column>
        ))}
        {ops.length ? null : <Text as="p" variant="muted">No change is ready to apply.</Text>}
        {plan.blockers.length > 0 && !running ? (
          <Column as="section" aria-labelledby={`${uid}-blockers`}>
            <Heading size="small" id={`${uid}-blockers`} icon={<Icon name="alert" />}>Not ready yet</Heading>
            <Column as="ul" gap="md">
              {plan.blockers.map((b, k) => (
                <Column key={k} as="li" gap="xs">
                  <Text variant="strong" pre>{b}</Text>
                  <Text variant="note">It is left out of this sync.</Text>
                </Column>
              ))}
            </Column>
          </Column>
        ) : null}
        {gone.total > 0 && !running ? <Text variant="note" as="p">{removalNote(gone)}</Text> : null}
        {sync.error && !running ? <RefusalLine>{sync.error}</RefusalLine> : null}
      </Column>
    </Dialog>
  );
}
