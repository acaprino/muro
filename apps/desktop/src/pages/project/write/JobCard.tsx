import * as React from 'react';
import { Badge, Button, Card, Cell, Cluster, Column, Grid, Heading, Icon, Progress, Text, type BadgeTone } from '@acaprino/sigrid/primitives';
import { DescriptionList } from '@acaprino/sigrid/components';
import type { ButtonProps } from '@acaprino/sigrid/primitives';
import type { Job } from '../../../types.ts';
import { useNotify } from '@acaprino/imago';
import { message, money } from '../../../words.ts';
import { NOT_CANCELLABLE, canCancel, isRunning, jobTitle, lastOver, outcomeOf, runLimit, runningOn, startedAt } from './jobs.ts';
import { useJobs } from './useJobs.tsx';

/** The AI run of a project (mockup board 3): while it goes, its title, phase, time, budget and log, and Cancel; once it is over, what came of it in the runtime's words, until
 * the person puts it away. At the top of the workspace it is the open project's run (`projectId`); above the list of projects, with `projectId` null, the run that makes a
 * new project. The runs are the runtime's (`useJobs`), so the card is there again when the project or the tab is left and opened again: it is read from `jobs`, never
 * kept by the page.
 *
 * Which outcome it shows: a run that did not succeed (failed, cancelled, interrupted) until it is dismissed or a later run is over; a run that succeeded only when this window
 * saw it going, so an old success read from the runtime's list is not said again at every opening. What was dismissed, and what was seen going, is kept for the window's
 * session (as `noFolderShell` in Workspace.tsx), not across a reload. */

/** The runs this window saw going, and the outcomes the person put away. */
const seen = new Set<string>();
const dismissed = new Set<string>();

/** What a run became, in a word beside its outcome. */
const ENDED: Record<string, string> = { completed: 'Done', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };
const TONES: Record<string, BadgeTone> = { completed: 'success', failed: 'danger', cancelled: 'warning', interrupted: 'warning' };

/** A time a run has been going, from seconds: "48 s", "6 min 12 s", "1 h 4 min". */
export function since(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** A button of a change of the project: off, with the reason as its tooltip (on the span around it, since a disabled button takes no pointer), while `off` says why. */
export function GatedButton({ off, disabled, title, ...props }: ButtonProps & { off: string | null }) {
  const why = off ?? undefined;
  return <span title={why}><Button {...props} disabled={off !== null || disabled} title={why ?? title} /></span>;
}

/** The runs a card is about: the project's (`projectId`), or, with null, the ones that make a new project. */
const about = (projectId: string | null) => (job: Job): boolean => job.kind === 'project' && (projectId === null ? job.operation === 'create' : job.project_id === projectId);

export interface JobCardProps {
  /** The project whose run the card shows; null for the run that makes a new project (above the list). */
  projectId: string | null;
  /** The card is in a region without a padding of its own: it keeps its distance from the edges. */
  inset?: boolean | undefined;
}

/** The card of a project's run: the one going, else the last one over while it is to be said. Nothing when there is neither.
 * One AI run goes at a time, so a run that is not this page's (another project's, the adaptation of a plugin) is why the changes are off, and its card, with its Cancel, is here too: the
 * window has no other place to stop it. It follows the outcome of this page's own last run, which is still said until it is put away. */
export function JobCard({ projectId, inset = false }: JobCardProps) {
  const jobs = useJobs();
  const notify = useNotify();
  const [, put] = React.useState(0);
  const mine = about(projectId);
  const own = projectId === null ? jobs.jobs.find(j => isRunning(j) && mine(j)) ?? null : runningOn(jobs.jobs, projectId);
  const running = own ?? jobs.running;
  if (running) seen.add(running.id);
  const last = own ? null : projectId === null ? [...jobs.jobs].filter(j => !isRunning(j) && mine(j)).sort((a, b) => startedAt(b) - startedAt(a))[0] ?? null : lastOver(jobs.jobs, projectId);
  const said = last && !dismissed.has(last.id) && !(last.status === 'completed' && !seen.has(last.id)) ? outcomeOf(last) : null;
  if (!running && !said) return null;
  const cancel = (): void => { if (running) jobs.cancel(running.id).catch(e => notify(message(e), { kind: 'error' })); };
  const dismiss = (): void => { if (last) { dismissed.add(last.id); put(n => n + 1); } };
  return (
    <Column gap="md" pad={inset ? 'md' : undefined}>
      {last && said ? (
        <Card as="section" aria-label="AI run" pad="md">
          <Cluster align="start" wrap={false}>
            <Cell grow>
              <Column gap="xs" role={said.error ? 'alert' : 'status'}>
                <Cluster><Badge variant="secondary" tone={TONES[last.status]}>{ENDED[last.status] ?? last.status}</Badge></Cluster>
                <Text as="p">{said.text}</Text>
                {last.status !== 'completed' && last.log_path ? <Text as="p" variant="note">Log: <Text mono>{last.log_path}</Text></Text> : null}
              </Column>
            </Cell>
            <Button variant="ghost" size="sm" onClick={dismiss}>Dismiss</Button>
          </Cluster>
        </Card>
      ) : null}
      {running ? <RunningCard job={running} elsewhere={!own} cancelling={jobs.cancelling.includes(running.id)} onCancel={cancel} /> : null}
    </Column>
  );
}

/** A run that goes: what it is, where it is, for how long, at most what it costs, when the runtime stops it, where it writes its log, and Cancel. The agent reports no fraction, so the bar
 * says only that it is in progress, and the phase is the runtime's. A run asked to stop says so until the runtime ends it. In the phase where the project is built and saved the runtime
 * ignores a Cancel, so the card offers none and says why. `elsewhere` is a run that is not this page's own (another project's, an adaptation): the card says whose it is. */
export function RunningCard({ job, cancelling, onCancel, elsewhere = false }: { job: Job; cancelling: boolean; onCancel(): void; elsewhere?: boolean | undefined }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const title = jobTitle(job), began = startedAt(job), saving = !canCancel(job), ofProject = job.kind === 'project';
  const budget = typeof job.budget_usd === 'number' && Number.isFinite(job.budget_usd) ? `up to ${money(job.budget_usd)}` : '';
  const whose = !elsewhere ? '' : ofProject ? (job.operation === 'create' ? '' : job.project_id ?? '') : job.plugin_id ? `${job.plugin_id}${job.harness ? ` for ${job.harness}` : ''}` : '';
  return (
    <Card as="section" aria-label="AI run" pad="md">
      <Grid min="md" gap="xl">
        <Column>
          <Cluster>
            <Heading size="small" level={2} icon={<Icon name="ai" />}><Text truncate>{title}</Text></Heading>
            <Badge tone={cancelling && !saving ? 'warning' : 'info'}>{cancelling && !saving ? 'Stopping' : 'Running'}</Badge>
          </Cluster>
          <Text as="p" variant="soft" role="status">{job.phase}</Text>
          <Progress value={null} size="sm" aria-label={`${title}: in progress`} />
          {job.message ? <Text as="p" variant="note">{job.message}</Text> : null}
        </Column>
        <Column>
          <DescriptionList
            items={[
              ofProject && { name: 'Agent', value: 'Claude Code' },
              whose !== '' && { name: ofProject ? 'Project' : 'Plugin', value: <Text pre>{whose}</Text> },
              budget !== '' && { name: 'Budget', value: budget },
              began ? { name: 'Time', value: since(now / 1000 - began) } : null,
              { name: 'Limit', value: `Stops after ${runLimit(job)} min` },
              job.log_path ? { name: 'Log', value: job.log_path, code: true } : null,
            ]}
          />
          {saving
            ? <Text as="p" variant="soft">{NOT_CANCELLABLE}</Text>
            : <Cell align="start"><Button variant="outline" loading={cancelling} loadingText="Stopping…" onClick={onCancel}><Icon name="stop" />Cancel</Button></Cell>}
        </Column>
      </Grid>
    </Card>
  );
}
