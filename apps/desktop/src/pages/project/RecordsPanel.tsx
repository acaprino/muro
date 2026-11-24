import * as React from 'react';
import { Badge, Button, Count, Icon } from '@acaprino/sigrid/primitives';
import { Empty } from '@acaprino/sigrid/components';
import { useProject } from '../../state/useProject.tsx';
import type { ProjectData } from './data.ts';
import { useBlocked } from './write/DetailsDialog.tsx';
import { RecordsEditor } from './write/RecordsEditor.tsx';
import type { RecordTarget } from './write/RecordsEditor.tsx';

/** The decision records of the project: why the project is the way it is. The owner adds, changes and deletes a record by hand (`write/RecordsEditor.tsx`): an edit, not an AI run, saved on the file the
 * page shows. While an AI run is changing the project no edit is offered, and the panel says why. */
export function RecordsPanel({ data }: { data: ProjectData }) {
  const ids = React.useId();
  const project = useProject();
  const id = project.view?.id ?? '';
  const blocked = useBlocked(id);
  const [target, setTarget] = React.useState<RecordTarget | null>(null);
  /** The heading of the panel: where focus goes when the record whose Delete was pressed is gone. */
  const heading = React.useRef<HTMLHeadingElement>(null);
  return (
    <section aria-labelledby={`${ids}-records`} className="flex flex-col gap-2">
      <h3 ref={heading} tabIndex={-1} id={`${ids}-records`} className="flex items-center gap-2 text-sm font-semibold text-ink outline-none"><Icon name="archive" />Decision records <Count value={data.records.length} label={data.records.length === 1 ? 'record' : 'records'} /></h3>
      <p className="text-xs text-ink-mute">Why the project is the way it is. Muro writes a record when a harmonization takes a decision that shapes the project. A binding record is a rule the next harmonization has to follow.</p>
      <div className="flex flex-wrap items-center gap-2">
        <span title={blocked ?? undefined}><Button variant="outline" size="sm" disabled={blocked !== null || !id} onClick={() => setTarget({ kind: 'add' })}><Icon name="plus" />Add record…</Button></span>
      </div>
      {blocked ? <p role="status" className="text-xs text-ink-mute">{blocked}</p> : null}
      {data.records.length ? (
        <ul role="list" aria-label="Decision records" className="flex flex-col">
          {data.records.map((r, i) => {
            const mine = r.author === 'you', subjects = r.subjects.join(', ');
            const named = `the record of ${r.date}${subjects ? ` about ${subjects}` : ''}`;
            return (
              <li key={`${i}:${r.id}`} className="flex flex-col gap-1 border-b border-line py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-ink-mute tabular-nums">{r.date}</span>
                  {subjects ? <span className="min-w-0 truncate text-xs font-medium text-ink" title={subjects}>{subjects}</span> : null}
                  <Badge variant={mine || r.binding ? 'outline' : 'secondary'}>{mine ? 'Yours' : 'By Muro'}{r.binding ? ' · binding' : ''}</Badge>
                </div>
                <p className="text-sm text-ink-soft">{r.text}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span title={blocked ?? undefined}><Button variant="outline" size="sm" aria-label={`Edit ${named}`} disabled={blocked !== null} onClick={() => setTarget({ kind: 'edit', id: r.id })}>Edit</Button></span>
                  <span title={blocked ?? undefined}><Button variant="ghost" size="sm" aria-label={`Delete ${named}`} disabled={blocked !== null} onClick={() => setTarget({ kind: 'delete', id: r.id })}>Delete</Button></span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <Empty title="No record yet" description="The first harmonization writes them; you can add your own." />}
      <RecordsEditor id={id} info={data.info} records={data.records} target={target} onClose={() => setTarget(null)} focusAfterDelete={heading} />
    </section>
  );
}
