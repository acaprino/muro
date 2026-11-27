import * as React from 'react';
import { Button, Cluster, Column, Count, Icon, Section, Text } from '@acaprino/sigrid/primitives';
import { Empty, ItemList, ItemRow } from '@acaprino/sigrid/components';
import { useProject } from '../../state/useProject.tsx';
import { becameParts, instructionsOf, pinnedOf } from './data.ts';
import type { ProjectData } from './data.ts';
import { FROZEN_PIN, busyReason } from './write/jobs.ts';
import { useJobs } from './write/useJobs.tsx';
import { GatedButton } from './write/JobCard.tsx';

/** The inputs panel: what goes in (each input with its pin, its license and what it became) and the custom instructions the file holds. Choosing an input shows it in the
 * inspector and opens, on the graph, the entries that hold the capabilities its decisions target (`decisions` whose `source` is the input: their `targets`), never by name.
 * Each input can have its pin moved (for a frozen commit the button is there, off, and says why: it is held at the commit that was reviewed) or be removed (not the only one: the
 * runtime refuses it), and the instructions can be edited: each is an AI run,
 * whose dialog the workspace holds (`onPin`, `onInstructions`), so it stays open when a drawer that holds this panel closes. While a run goes, none of them is offered,
 * and the buttons say why: one AI run goes at a time. */
export interface InputsPanelProps {
  data: ProjectData;
  onChosen(): void;
  /** Move the pin of an input, or remove it (`remove`). */
  onPin(input: string, remove: boolean): void;
  onInstructions(): void;
  onSystemPrompt(): void;
}

export function InputsPanel({ data, onChosen, onPin, onInstructions, onSystemPrompt }: InputsPanelProps) {
  const project = useProject();
  const { running } = useJobs();
  const selected = project.view?.selected ?? null;
  const busy = busyReason(running);
  function choose(id: string): void {
    const on = selected?.kind === 'input' && selected.id === id;
    project.select(on ? null : { kind: 'input', id });
    if (!on) onChosen();
  }
  return (
    <Column gap="xl">
      <Section level={3} title="What goes in" icon={<Icon name="importExport" />} end={<Count value={data.inputs.length} label={data.inputs.length === 1 ? 'input' : 'inputs'} />}>
        <Text as="p" variant="note">The plugins and skills this project absorbs, each pinned to a release or a commit. Choose one to see on the graph what it became.</Text>
        {data.inputs.length ? (
          <ItemList aria-label="Inputs">
            {data.inputs.map((input, i) => {
              const pin = pinnedOf(input), parts = becameParts(input), source = input.url || 'Local source';
              const frozen = input.pin === 'static', removable = data.inputs.length > 1;
              return (
                <React.Fragment key={`${i}:${input.id}`}>
                  <ItemRow
                    current={selected?.kind === 'input' && selected.id === input.id}
                    onClick={() => choose(input.id)}
                    title={<span title={input.id}>{input.id}</span>}
                    description={<span title={source}>{source}</span>}
                    facts={[
                      { text: <Text pre>{`${pin.title} · ${pin.line} · ${input.license || 'No license named'}`}</Text> },
                      { text: <Text pre>{parts.length ? `Became ${parts.join(' · ')}` : 'Not harmonized yet'}</Text> },
                    ]}
                  />
                  <Cluster as="li" pad="sm">
                    <GatedButton off={busy ?? (frozen ? FROZEN_PIN : null)} variant="outline" size="xs" aria-label={`Move pin of ${input.id}`} onClick={() => onPin(input.id, false)}>Move pin…</GatedButton>
                    {removable ? <GatedButton off={busy} variant="outline" size="xs" aria-label={`Remove ${input.id}`} onClick={() => onPin(input.id, true)}>Remove…</GatedButton> : null}
                  </Cluster>
                </React.Fragment>
              );
            })}
          </ItemList>
        ) : <Empty title="No input yet" description="A project absorbs the plugins and skills it lists here." />}
      </Section>
      <Section level={3} title="Custom instructions" icon={<Icon name="rename" />}>
        <Text as="p" pre>{instructionsOf(data.info)}</Text>
        <Text as="p" variant="note">Your own Markdown notes. The AI reads them with the inputs and decides how they fit.</Text>
        <Cluster><GatedButton off={busy} variant="outline" size="sm" onClick={onInstructions}>Instructions…</GatedButton></Cluster>
      </Section>
      <Section level={3} title="System prompt" icon={<Icon name="ai" />}>
        <Text as="p" variant="note">
          {data.systemPrompt
            ? `${data.systemPrompt.length} characters added to every session.`
            : 'No text is added to every session.'}
        </Text>
        {data.systemPrompt ? (
          <Cluster><Button variant="outline" size="sm" onClick={onSystemPrompt}>View system prompt…</Button></Cluster>
        ) : null}
      </Section>
    </Column>
  );
}
