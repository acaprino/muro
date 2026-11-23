import * as React from 'react';
import { Badge, Count, Empty, Icon } from '@acaprino/sigrid';
import type { ProjectRun } from '../../types.ts';
import { at } from '../../words.ts';
import { runsOf, tagOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { harnessName } from './lines.ts';

/** The runs of the harmonization, newest first, read only: the version each made (and its tag when the project has a repository), its changelog entry, its result,
 * its budget and its engine. Harmonizing again is a later plan. */
const RESULTS: Record<ProjectRun['status'], { label: string; tone: string }> = {
  completed: { label: 'Built and validated', tone: 'text-success' },
  cancelled: { label: 'Cancelled', tone: 'text-ink-soft' },
  failed: { label: 'Failed', tone: 'text-destructive' },
};
/** A result this window does not know is shown as it came (a status such as `constructor` is none of the three either). */
const resultOf = (status: string): { label: string; tone: string } => Object.hasOwn(RESULTS, status) ? RESULTS[status as ProjectRun['status']] : { label: status || '—', tone: 'text-ink-soft' };
const agent = (engine: string | null): string => engine ? harnessName(engine) : '';

export function RunsPanel({ data }: { data: ProjectData }) {
  const ids = React.useId();
  const { runs, current } = runsOf(data);
  return (
    <section aria-labelledby={`${ids}-runs`} className="flex flex-col gap-2">
      <h3 id={`${ids}-runs`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="history" />Runs <Count value={runs.length} label={runs.length === 1 ? 'run' : 'runs'} /></h3>
      <p className="text-xs text-ink-mute">Every harmonization, with the version it made and its changelog entry.</p>
      {runs.length ? (
        <ul role="list" aria-label="Runs" className="flex flex-col">
          {runs.map((r, i) => {
            const result = resultOf(r.status), who = agent(r.engine), tag = tagOf(data.info, r.version);
            return (
              <li key={`${i}:${r.id}`} className="flex flex-col gap-1 border-b border-line py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-ink tabular-nums">{r.version || '—'}</span>
                  {i === current ? <Badge variant="outline">current</Badge> : null}
                  {tag ? <span className="min-w-0 truncate font-mono text-xs text-ink-mute" title={tag}>{tag}</span> : null}
                </div>
                <p className="text-sm text-ink-soft">{r.changelog || '—'}</p>
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <div className="flex gap-1"><dt className="text-ink-mute">When</dt><dd className="text-ink tabular-nums">{at(r.time)}</dd></div>
                  <div className="flex gap-1"><dt className="text-ink-mute">Result</dt><dd className={`font-medium ${result.tone}`}>{result.label}</dd></div>
                  <div className="flex gap-1"><dt className="text-ink-mute">Budget</dt><dd className="text-ink tabular-nums">{typeof r.budget_usd === 'number' ? `$${r.budget_usd.toFixed(2)}` : '—'}</dd></div>
                  <div className="flex gap-1"><dt className="text-ink-mute">Engine</dt><dd className="text-ink">{who || '—'}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      ) : <Empty title="No run yet" description="Every harmonization is listed here with its version and its changelog entry." />}
    </section>
  );
}
