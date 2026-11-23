import * as React from 'react';
import { Count, Empty, Icon, ItemList, ItemRow } from '@acaprino/sigrid';
import { useProject } from '../../state/useProject.tsx';
import { becameParts, instructionsOf, pinnedOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { busyReason } from './write/jobs.ts';
import { useJobs } from './write/useJobs.tsx';
import { GatedButton } from './write/JobCard.tsx';

/** The inputs panel: what goes in (each input with its pin, its license and what it became) and the custom instructions the file holds. Choosing an input shows it in the
 * inspector and opens, on the graph, the entries that hold the capabilities its decisions target (`decisions` whose `source` is the input: their `targets`), never by name.
 * Each input can have its pin moved (not a frozen commit) or be removed (not the only one: the runtime refuses it), and the instructions can be edited: each is an AI run,
 * whose dialog the workspace holds (`onPin`, `onInstructions`), so it stays open when a drawer that holds this panel closes. While a run goes, none of them is offered,
 * and the buttons say why: one AI run goes at a time. */
export interface InputsPanelProps {
  data: ProjectData;
  onChosen(): void;
  /** Move the pin of an input, or remove it (`remove`). */
  onPin(input: string, remove: boolean): void;
  onInstructions(): void;
}

export function InputsPanel({ data, onChosen, onPin, onInstructions }: InputsPanelProps) {
  const project = useProject();
  const { running } = useJobs();
  const ids = React.useId();
  const selected = project.view?.selected ?? null;
  const busy = busyReason(running);
  function choose(id: string): void {
    const on = selected?.kind === 'input' && selected.id === id;
    project.select(on ? null : { kind: 'input', id });
    if (!on) onChosen();
  }
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby={`${ids}-inputs`} className="flex flex-col gap-2">
        <h3 id={`${ids}-inputs`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="importExport" />What goes in <Count value={data.inputs.length} label={data.inputs.length === 1 ? 'input' : 'inputs'} /></h3>
        <p className="text-xs text-ink-mute">The plugins and skills this project absorbs, each pinned to a release or a commit. Choose one to see on the graph what it became.</p>
        {data.inputs.length ? (
          <ItemList aria-label="Inputs">
            {data.inputs.map((input, i) => {
              const pin = pinnedOf(input), parts = becameParts(input), source = input.url || 'Local source';
              const movable = input.pin !== 'static', removable = data.inputs.length > 1;
              return (
                <React.Fragment key={`${i}:${input.id}`}>
                  <ItemRow
                    current={selected?.kind === 'input' && selected.id === input.id}
                    onClick={() => choose(input.id)}
                    title={<span title={input.id}>{input.id}</span>}
                    description={(
                      <>
                        <span className="block truncate" title={source}>{source}</span>
                        <span className="block truncate">{pin.title} · {pin.line} · {input.license || 'No license named'}</span>
                        <span className="block truncate">{parts.length ? `Became ${parts.join(' · ')}` : 'Not harmonized yet'}</span>
                      </>
                    )}
                  />
                  {movable || removable ? (
                    <li className="flex flex-wrap gap-2 px-3 pb-2">
                      {movable ? <GatedButton off={busy} variant="outline" size="xs" aria-label={`Move pin of ${input.id}`} onClick={() => onPin(input.id, false)}>Move pin…</GatedButton> : null}
                      {removable ? <GatedButton off={busy} variant="outline" size="xs" aria-label={`Remove ${input.id}`} onClick={() => onPin(input.id, true)}>Remove…</GatedButton> : null}
                    </li>
                  ) : null}
                </React.Fragment>
              );
            })}
          </ItemList>
        ) : <Empty title="No input yet" description="A project absorbs the plugins and skills it lists here." />}
      </section>
      <section aria-labelledby={`${ids}-notes`} className="flex flex-col gap-1">
        <h3 id={`${ids}-notes`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="rename" />Custom instructions</h3>
        <p className="text-sm text-ink">{instructionsOf(data.info)}</p>
        <p className="text-xs text-ink-mute">Your own Markdown notes. The AI reads them with the inputs and decides how they fit.</p>
        <div className="pt-1">
          <GatedButton off={busy} variant="outline" size="sm" onClick={onInstructions}>Instructions…</GatedButton>
        </div>
      </section>
    </div>
  );
}
