import * as React from 'react';
import { Badge, Cluster, Column, Count, Icon, Section, Text, type BadgeTone } from '@acaprino/sigrid/primitives';
import { DescriptionList, Empty } from '@acaprino/sigrid/components';
import type { ProjectRun } from '../../types.ts';
import { at } from '../../words.ts';
import { runsOf, tagOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { harnessName } from './lines.ts';

/** The runs of the harmonization, newest first, read only: the version each made (and its tag when the project has a repository), its changelog entry, its result,
 * its budget and its engine. Harmonizing again is a later plan. */
type Result = { label: string; tone?: BadgeTone };
const RESULTS: Record<ProjectRun['status'], Result> = {
  completed: { label: 'Built and validated', tone: 'success' },
  cancelled: { label: 'Cancelled' },
  failed: { label: 'Failed', tone: 'danger' },
};
/** A result this window does not know is shown as it came (a status such as `constructor` is none of the three either). */
const resultOf = (status: string): Result => Object.hasOwn(RESULTS, status) ? RESULTS[status as ProjectRun['status']] : { label: status || '—' };
const agent = (engine: string | null): string => engine ? harnessName(engine) : '';

export function RunsPanel({ data }: { data: ProjectData }) {
  const { runs, current } = runsOf(data);
  return (
    <Section level={3} title="Runs" icon={<Icon name="history" />} end={<Count value={runs.length} label={runs.length === 1 ? 'run' : 'runs'} />}>
      <Text as="p" variant="note">Every harmonization, with the version it made and its changelog entry.</Text>
      {runs.length ? (
        <Column as="ul" gap="lg" aria-label="Runs">
          {runs.map((r, i) => {
            const result = resultOf(r.status), who = agent(r.engine), tag = tagOf(data.info, r.version);
            return (
              <Column key={`${i}:${r.id}`} as="li">
                <Cluster>
                  <Text variant="strong" pre>{r.version || '—'}</Text>
                  {i === current ? <Badge variant="outline">current</Badge> : null}
                  {tag ? <Text variant="note" pre><code>{tag}</code></Text> : null}
                </Cluster>
                <Text as="p" variant="soft" pre>{r.changelog || '—'}</Text>
                <DescriptionList
                  items={[
                    { name: 'When', value: at(r.time) },
                    { name: 'Result', value: <Badge variant="secondary" tone={result.tone}>{result.label}</Badge> },
                    { name: 'Budget', value: typeof r.budget_usd === 'number' ? `$${r.budget_usd.toFixed(2)}` : '—' },
                    { name: 'Engine', value: who || '—' },
                  ]}
                />
              </Column>
            );
          })}
        </Column>
      ) : <Empty title="No run yet" description="Every harmonization is listed here with its version and its changelog entry." />}
    </Section>
  );
}
