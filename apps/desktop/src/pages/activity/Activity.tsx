// The Activity page: what Muro did and why. At the top the AI run that is going, if one is (the card of the Projects page, with its Cancel, which here asks first: a run cannot be resumed);
// under it the history, newest first, with the filter in the head of its section: the events the service and the background worker wrote, and the AI runs that are over. The page sends nothing
// but the cancel: the events are the registry's (`useRegistry`), read again when the page opens because the worker writes them while the window is elsewhere, and the runs are the runtime's
// (`useJobs`), which already says by itself when one ends, so this page does not notify it again. Sigrid has no timeline: each entry is a row of its own parts (RunsPanel does the same).
import * as React from 'react';
import { Badge, Cluster, Column, Icon, Page, Section, Text, ToggleGroup, ToggleGroupItem, type BadgeTone } from '@acaprino/sigrid/primitives';
import { ConfirmDialog, Empty } from '@acaprino/sigrid/components';
import { useNotify } from '@acaprino/imago';
import type { ActivityFilter, Job, Snapshot } from '../../types.ts';
import { harnessNames, stamp } from '../../model.ts';
import { message } from '../../words.ts';
import { useRegistry } from '../../state/registry.tsx';
import { useJobs } from '../project/write/useJobs.tsx';
import { RunningCard } from '../project/write/JobCard.tsx';
import { jobTitle } from '../project/write/jobs.ts';
import { FILTERS, emptyWords, entries, isOk, matches, type Entry } from './entries.ts';

/** How an outcome that is not a success is said: a status the window does not know is shown humanized and with no tone. */
const TONES: Readonly<Record<string, BadgeTone>> = { failed: 'danger', error: 'danger', partial: 'warning', cancelled: 'warning', interrupted: 'warning' };
const outcome = (status: string): string => (status === 'failed' || status === 'error' ? 'Failed' : status === 'partial' ? 'Some items left out' : status.charAt(0).toUpperCase() + status.slice(1));

/** What stopping a run is called in the question. */
const whatIs = (job: Job, snapshot: Snapshot | null): string => (job.kind === 'project' ? jobTitle(job)
  : `The adaptation of ${snapshot?.registry.plugins.find(p => p.id === job.plugin_id)?.name ?? job.plugin_id ?? 'a plugin'}${job.harness ? ` for ${harnessNames[job.harness] ?? job.harness}` : ''}`);

function Row({ entry }: { entry: Entry }) {
  const when = entry.time ? stamp(entry.time) : '';
  return (
    <Column as="li" gap="xs">
      <Cluster>
        <Text variant="strong" pre>{entry.title}</Text>
        {isOk(entry.status) ? null : <Badge variant="secondary" tone={TONES[entry.status]}>{outcome(entry.status)}</Badge>}
        {when ? <Text variant="note">{when}</Text> : null}
      </Cluster>
      {entry.message ? <Text as="p" variant="soft" pre>{entry.message}</Text> : null}
      {entry.log ? <Text as="p" variant="note">Log: <Text mono>{entry.log}</Text></Text> : null}
    </Column>
  );
}

export function Activity() {
  const { snapshot, reload } = useRegistry();
  const jobs = useJobs();
  const notify = useNotify();
  const [filter, setFilter] = React.useState<ActivityFilter>('all');
  // The run the question is about, kept while the question closes so its words do not change under it.
  const [asking, setAsking] = React.useState<{ job: Job; open: boolean } | null>(null);
  const [stopping, setStopping] = React.useState(false);
  // The worker writes events while the window is elsewhere: read them again when the page opens. What is held shows meanwhile.
  React.useEffect(() => { void reload(); }, [reload]);

  if (!snapshot) return <Column pad="xl"><Text as="p" variant="muted" role="status">Reading your registry…</Text></Column>;

  const all = entries(snapshot, jobs.jobs);
  const list = all.filter(entry => matches(entry, filter));
  const running = jobs.running;
  const stop = async (): Promise<void> => {
    if (!asking) return;
    setStopping(true);
    try { await jobs.cancel(asking.job.id); }
    catch (e) { notify(message(e), { kind: 'error' }); }
    finally { setStopping(false); setAsking(now => (now ? { ...now, open: false } : now)); }
  };
  const words = emptyWords(filter);
  return (
    <Page>
      {running ? (
        <RunningCard job={running} elsewhere cancelling={jobs.cancelling.includes(running.id)} onCancel={() => setAsking({ job: running, open: true })} />
      ) : null}
      <Section
        title="History"
        icon={<Icon name="history" />}
        end={(
          <ToggleGroup aria-label="Filter activity" value={filter} onValueChange={id => { if (FILTERS.some(f => f.id === id)) setFilter(id as ActivityFilter); }}>
            {FILTERS.map(f => <ToggleGroupItem key={f.id} value={f.id}>{f.label}</ToggleGroupItem>)}
          </ToggleGroup>
        )}
      >
        {list.length ? (
          <Column as="ul" gap="lg" aria-label="Activity">
            {list.map(entry => <Row key={entry.key} entry={entry} />)}
          </Column>
        ) : <Empty title={words.title} description={words.description} />}
      </Section>
      {asking ? (
        <ConfirmDialog
          open={asking.open}
          onOpenChange={open => { if (!stopping) setAsking(now => (now ? { ...now, open } : now)); }}
          title={`Cancel ${asking.job.kind === 'project' ? 'run' : 'adaptation'}?`}
          description={`${whatIs(asking.job, snapshot)} stops where it is. It cannot be resumed.`}
          confirmLabel={asking.job.kind === 'project' ? 'Cancel run' : 'Cancel adaptation'}
          cancelLabel="Keep running"
          busy={stopping}
          onConfirm={() => { void stop(); }}
        />
      ) : null}
    </Page>
  );
}
