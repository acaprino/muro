import * as React from 'react';
import { Badge, Count, Empty, Icon } from '@acaprino/sigrid';
import type { ProjectData } from './data.ts';

/** The decision records of the project, read only: why the project is the way it is. Writing or editing a record is a later plan. */
export function RecordsPanel({ data }: { data: ProjectData }) {
  const ids = React.useId();
  return (
    <section aria-labelledby={`${ids}-records`} className="flex flex-col gap-2">
      <h3 id={`${ids}-records`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="archive" />Decision records <Count value={data.records.length} label={data.records.length === 1 ? 'record' : 'records'} /></h3>
      <p className="text-xs text-ink-mute">Why the project is the way it is. Muro writes a record when a harmonization takes a decision that shapes the project. A binding record is a rule the next harmonization has to follow.</p>
      {data.records.length ? (
        <ul role="list" aria-label="Decision records" className="flex flex-col">
          {data.records.map((r, i) => {
            const mine = r.author === 'you', subjects = r.subjects.join(', ');
            return (
              <li key={`${i}:${r.id}`} className="flex flex-col gap-1 border-b border-line py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs text-ink-mute tabular-nums">{r.date}</span>
                  {subjects ? <span className="min-w-0 truncate text-xs font-medium text-ink" title={subjects}>{subjects}</span> : null}
                  <Badge variant={mine || r.binding ? 'outline' : 'secondary'}>{mine ? 'Yours' : 'By Muro'}{r.binding ? ' · binding' : ''}</Badge>
                </div>
                <p className="text-sm text-ink-soft">{r.text}</p>
              </li>
            );
          })}
        </ul>
      ) : <Empty title="No record yet" description="The first harmonization writes them." />}
    </section>
  );
}
