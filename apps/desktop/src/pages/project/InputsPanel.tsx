import * as React from 'react';
import { Count, Empty, Icon, ItemList, ItemRow } from '@acaprino/sigrid';
import { useProject } from '../../state/useProject.tsx';
import { becameParts, instructionsOf, pinnedOf } from './data.ts';
import type { ProjectData } from './data.ts';

/** The inputs panel: what goes in (each input with its pin, its license and what it became) and the custom instructions the file holds. Choosing an input shows it in the
 * inspector and opens, on the graph, the entries that hold the capabilities its decisions target (`decisions` whose `source` is the input: their `targets`), never by name.
 * Moving a pin and adding an input write the project: a later plan. */
export function InputsPanel({ data, onChosen }: { data: ProjectData; onChosen(): void }) {
  const project = useProject();
  const ids = React.useId();
  const selected = project.view?.selected ?? null;
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
            {data.inputs.map(input => {
              const pin = pinnedOf(input), parts = becameParts(input), source = input.url || 'Local source';
              return (
                <ItemRow
                  key={input.id}
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
              );
            })}
          </ItemList>
        ) : <Empty title="No input yet" description="A project absorbs the plugins and skills it lists here." />}
      </section>
      <section aria-labelledby={`${ids}-notes`} className="flex flex-col gap-1">
        <h3 id={`${ids}-notes`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="rename" />Custom instructions</h3>
        <p className="text-sm text-ink">{instructionsOf(data.info)}</p>
        <p className="text-xs text-ink-mute">Your own Markdown notes. The AI reads them with the inputs and decides how they fit.</p>
      </section>
    </div>
  );
}
