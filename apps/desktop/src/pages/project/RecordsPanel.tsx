import * as React from 'react';
import { Badge, Button, Cluster, Column, Count, Icon, Section, Text } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import { useProject } from '../../state/useProject.tsx';
import type { ProjectData } from './data.ts';
import { useBlocked } from './write/DetailsDialog.tsx';
import { RecordsEditor } from './write/RecordsEditor.tsx';
import type { RecordTarget } from './write/RecordsEditor.tsx';

/** The decision records of the project: why the project is the way it is. The owner adds, changes and deletes a record by hand (`write/RecordsEditor.tsx`): an edit, not an AI run, saved on the file the
 * page shows. While an AI run is changing the project no edit is offered, and the panel says why. */
export function RecordsPanel({ data }: { data: ProjectData }) {
  const project = useProject();
  const id = project.view?.id ?? '';
  const blocked = useBlocked(id);
  const [target, setTarget] = React.useState<RecordTarget | null>(null);
  /** The heading of the panel: where focus goes when the record whose Delete was pressed is gone. */
  const heading = React.useRef<HTMLSpanElement>(null);
  return (
    <Section level={3} title={<span ref={heading} tabIndex={-1}>Decision records</span>} icon={<Icon name="archive" />} end={<Count value={data.records.length} label={data.records.length === 1 ? 'record' : 'records'} />}>
      <Text as="p" variant="note">Why the project is the way it is. Muro writes a record when a harmonization takes a decision that shapes the project. A binding record is a rule the next harmonization has to follow.</Text>
      <Cluster>
        <span title={blocked ?? undefined}><Button variant="outline" size="sm" disabled={blocked !== null || !id} onClick={() => setTarget({ kind: 'add' })}><Icon name="plus" />Add record…</Button></span>
      </Cluster>
      {blocked ? <Text as="p" variant="note" role="status">{blocked}</Text> : null}
      {data.records.length ? (
        <Column as="ul" gap="lg" aria-label="Decision records">
          {data.records.map((r, i) => {
            const mine = r.author === 'you', subjects = r.subjects.join(', ');
            const named = `the record of ${r.date}${subjects ? ` about ${subjects}` : ''}`;
            return (
              <Column key={`${i}:${r.id}`} as="li" gap="xs">
                <Cluster>
                  <Text variant="note">{r.date}</Text>
                  {subjects ? <Text variant="strong" pre>{subjects}</Text> : null}
                  <Badge variant={mine || r.binding ? 'outline' : 'secondary'}>{mine ? 'Yours' : 'By Muro'}{r.binding ? ' · binding' : ''}</Badge>
                </Cluster>
                <Text as="p" variant="soft" pre>{r.text}</Text>
                <Cluster>
                  <span title={blocked ?? undefined}><Button variant="outline" size="sm" aria-label={`Edit ${named}`} disabled={blocked !== null} onClick={() => setTarget({ kind: 'edit', id: r.id })}>Edit</Button></span>
                  <span title={blocked ?? undefined}><Button variant="ghost" size="sm" aria-label={`Delete ${named}`} disabled={blocked !== null} onClick={() => setTarget({ kind: 'delete', id: r.id })}>Delete</Button></span>
                </Cluster>
              </Column>
            );
          })}
        </Column>
      ) : <Empty title="No record yet" description="The first harmonization writes them; you can add your own." />}
      <RecordsEditor id={id} info={data.info} records={data.records} target={target} onClose={() => setTarget(null)} focusAfterDelete={heading} />
    </Section>
  );
}
