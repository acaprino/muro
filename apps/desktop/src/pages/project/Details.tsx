import * as React from 'react';
import { Badge, Button, Cluster, Column, Heading, Icon, Text, TextList } from '@acaprino/sigrid/primitives';
import type { IconName } from '@acaprino/sigrid/primitives';
import { DescriptionList } from '@acaprino/sigrid/components';
import type { ProjectInput } from '../../types.ts';
import type { Selected } from '../../state/project.ts';
import { outputsOf } from './graph-model.ts';
import type { Cap, Example, SimStep } from './graph-model.ts';
import { becameParts, pinnedOf, sourcesOf, targetsOf } from './data.ts';
import type { ProjectData } from './data.ts';

/** The inspector of the workspace: the documented example, the capability or the input that is selected, read only. What it says is the project's data as it is:
 * an example's own steps and reasons, a capability's role, intents and outputs, and which inputs it comes from (the decisions that target it). What a capability is
 * joined to (runs first, needs on a condition, never together) and its step on a lit path are drawn on the canvas (graphScene.ts), not said again here. */

/** What the selection names in this project, or null when it names nothing the project has (a selection kept from before the project changed). */
export type Shown =
  | { kind: 'example'; index: number; example: Example }
  | { kind: 'capability'; cap: Cap }
  | { kind: 'input'; input: ProjectInput };
export function resolve(selected: Selected, data: ProjectData): Shown | null {
  if (!selected) return null;
  if (selected.kind === 'example') {
    const index = /^\d+$/.test(selected.id) ? Number(selected.id) : -1, example = data.examples[index];
    return example ? { kind: 'example', index, example } : null;
  }
  if (selected.kind === 'capability') {
    const cap = data.caps.find(c => c.id === selected.id);
    return cap ? { kind: 'capability', cap } : null;
  }
  const input = data.inputs.find(i => i.id === selected.id);
  return input ? { kind: 'input', input } : null;
}
/** The heading of the inspector for what it shows. */
export const TITLES: Record<Shown['kind'], string> = { example: 'Documented example', capability: 'Capability', input: 'Input' };

export interface DetailsProps {
  shown: Shown;
  data: ProjectData;
  onSelect(next: Selected): void;
}

export function Details({ shown, data, onSelect }: DetailsProps) {
  const known = React.useMemo(() => new Set(data.caps.map(c => c.id)), [data]);
  const toCap = (id: string) => onSelect({ kind: 'capability', id });
  if (shown.kind === 'example') return <ExampleDetails example={shown.example} data={data} known={known} onCapability={toCap} />;
  if (shown.kind === 'capability') return <CapabilityDetails cap={shown.cap} data={data} onSelect={onSelect} />;
  return <InputDetails input={shown.input} data={data} known={known} onCapability={toCap} />;
}

// ---------- the parts ----------
/** A heading over a group, with its icon (R6). */
export function GroupHeading({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return <Heading size="label" level={4} icon={<Icon name={icon} />}>{children}</Heading>;
}
/** A capability or an input named in the inspector: pressing it shows that one. Its whole name is its hint and, unless `label` says more, its accessible name. */
export function ItemLink({ id, label, onPress }: { id: string; label?: string | undefined; onPress(id: string): void }) {
  return <Button variant="link" size="inline" aria-label={label ?? id} onClick={() => onPress(id)}><Text truncate>{id}</Text></Button>;
}
const none = <Text variant="muted">—</Text>;
/** Sentences in a list, in the soft ink. */
export const Sentences = ({ items }: { items: readonly string[] }) => <Text as="div" variant="soft"><TextList items={items} /></Text>;

/** The steps of a decision, in order: the capability of each (a link to it when the graph has it), the intent it answers, and why it is there. A prerequisite the runtime added has no intent and no reason of its own. */
export function StepList({ steps, known, onCapability }: { steps: SimStep[]; known: Set<string>; onCapability(id: string): void }) {
  return (
    <Column as="ol" gap="md" aria-label="Steps, in order">
      {steps.map((s, i) => (
        <Cluster key={`${i}:${s.step_id}`} as="li" gap="md" align="start" wrap={false}>
          <Text variant="strong" aria-hidden="true">{i + 1}</Text>
          <Column gap="xs">
            <Cluster>
              {known.has(s.capability) ? <ItemLink id={s.capability} label={`Step ${i + 1}: ${s.capability}`} onPress={onCapability} /> : <Text variant="strong" truncate>{s.capability}</Text>}
              {s.intent ? <Text variant="soft" mono truncate>{s.intent}</Text> : null}
              {s.added_as_prerequisite ? <Badge variant="secondary">Prerequisite</Badge> : null}
            </Cluster>
            {s.reason ? <Text as="p" variant="note">{s.reason}</Text> : s.added_as_prerequisite ? <Text as="p" variant="note">A prerequisite the plugin declares, added before the step that needs it.</Text> : null}
          </Column>
        </Cluster>
      ))}
    </Column>
  );
}

function ExampleDetails({ example: e, data, known, onCapability }: { example: Example; data: ProjectData; known: Set<string>; onCapability(id: string): void }) {
  const outs = outputsOf(e, data.caps);
  return (
    <Column gap="lg">
      <Column gap="xs">
        <Heading size="small" truncate>{e.title}</Heading>
        {e.task ? <Text as="p" variant="soft" pre>“{e.task}”</Text> : null}
        {e.stack.length ? <Text as="p" variant="note">With {e.stack.join(', ')}</Text> : null}
      </Column>
      {e.status !== 'selected' ? <Cluster><Badge tone="warning">{e.status === 'no_match' ? 'No match' : 'Needs clarification'}</Badge></Cluster> : null}
      {e.steps.length ? (
        <Column as="section">
          <GroupHeading icon="listOrdered">Steps, in order</GroupHeading>
          <StepList steps={e.steps} known={known} onCapability={onCapability} />
        </Column>
      ) : null}
      {outs.length ? (
        <Column as="section">
          <GroupHeading icon="tag">Produces</GroupHeading>
          <Cluster gap="xs">{outs.map(o => <Badge key={o} variant="outline">{o}</Badge>)}</Cluster>
        </Column>
      ) : null}
      {e.reason ? <Text as="p" variant="soft" pre>{e.reason}</Text> : null}
      {e.questions.length ? <Sentences items={e.questions} /> : null}
    </Column>
  );
}

/** A capability as the old window's sheet told it: role, entry, which inputs it comes from (the decisions that name it), the intents it answers and what it produces.
 * Its branches are the canvas's lines (graphScene.ts): choosing it opens the entries of what it is joined to (Workspace.tsx), and the words of its lines are drawn and read there. */
function CapabilityDetails({ cap: c, data, onSelect }: { cap: Cap; data: ProjectData; onSelect(next: Selected): void }) {
  const entry = data.entries.find(e => e.capabilities.includes(c.id)), from = sourcesOf(data.decisions, c.id);
  const toInput = (id: string) => onSelect({ kind: 'input', id });
  return (
    <Column gap="lg">
      <Column gap="xs">
        <Heading size="small" truncate>{c.id}</Heading>
        {c.title && c.title !== c.id ? <Text as="p" variant="soft">{c.title}</Text> : null}
      </Column>
      <DescriptionList
        items={[
          { name: 'Role', value: c.role || none },
          { name: 'Entry', value: entry ? <Column gap="xs"><Text pre>{entry.name}</Text>{entry.description ? <Text variant="note">{entry.description}</Text> : null}</Column> : none },
          { name: 'Comes from', value: from.length ? <Cluster gap="xs">{from.map(s => <ItemLink key={s} id={s} label={`Input ${s}`} onPress={toInput} />)}</Cluster> : none },
        ]}
      />
      {c.intents.length ? (
        <Column as="section">
          <GroupHeading icon="ai">Activates when the request means</GroupHeading>
          <Column as="ul">
            {c.intents.map((i, k) => (
              <Column key={`${k}:${i.id}`} as="li" gap="xs">
                <Text mono truncate>{i.id}</Text>
                {i.description ? <Text variant="note">{i.description}</Text> : null}
                {i.excludes.length === 1 ? (
                  <Text variant="note">Not for: {i.excludes[0]}</Text>
                ) : i.excludes.length > 1 ? (
                  <Column gap="xs">
                    <Text variant="note">Not for:</Text>
                    <Text as="div" variant="note"><TextList items={i.excludes} /></Text>
                  </Column>
                ) : null}
              </Column>
            ))}
          </Column>
        </Column>
      ) : null}
      {c.outputs.length ? (
        <Column as="section">
          <GroupHeading icon="tag">Produces</GroupHeading>
          <Cluster gap="xs">{c.outputs.map((o, k) => <Badge key={`${k}:${o}`} variant="outline">{o}</Badge>)}</Cluster>
        </Column>
      ) : null}
    </Column>
  );
}

const FORMS: Record<string, string> = { capability: 'Capability', 'always-on': 'Always on', hook: 'Hook', 'mcp-server': 'MCP server', 'package-tool': 'Package tool', dropped: 'Dropped' };
/** A form in the words of the interface; one this window does not know is shown as it came (`constructor` is none of them either). */
const formOf = (form: string): string => Object.hasOwn(FORMS, form) ? FORMS[form] : form;

/** An input: where it comes from, how it is pinned, its license, what it became, and its choices one by one, each with the capabilities it went to. */
function InputDetails({ input, data, known, onCapability }: { input: ProjectInput; data: ProjectData; known: Set<string>; onCapability(id: string): void }) {
  const pin = pinnedOf(input), parts = becameParts(input), targets = targetsOf(data.decisions, input.id), choices = data.decisions.filter(d => d.source === input.id);
  return (
    <Column gap="lg">
      <Column gap="xs">
        <Heading size="small" truncate>{input.id}</Heading>
        <Text as="p" variant="note" truncate>{input.url || 'Local source'}</Text>
      </Column>
      <DescriptionList
        items={[
          { name: 'Pinned to', value: <Column gap="xs"><Text>{pin.title}</Text><Text variant="note" pre>{pin.line}</Text></Column> },
          { name: 'License', value: input.license || none },
          { name: 'What it became', value: parts.length ? parts.join(' · ') : <Text variant="muted">Not harmonized yet</Text> },
        ]}
      />
      <Column as="section">
        <GroupHeading icon="structure">Capabilities it went to</GroupHeading>
        {targets.length ? (
          <Column as="ul" gap="xs">
            {targets.map(id => <li key={id}>{known.has(id) ? <ItemLink id={id} onPress={onCapability} /> : <Text variant="soft" pre>{id}</Text>}</li>)}
          </Column>
        ) : <Text as="p" variant="muted">None: no choice of this input went to a capability.</Text>}
      </Column>
      {choices.length ? (
        <Column as="section">
          <GroupHeading icon="labels">Its choices</GroupHeading>
          <Column as="ul" gap="md">
            {choices.map((d, i) => (
              <Column key={i} as="li" gap="xs">
                <Cluster>
                  <Badge variant="secondary">{formOf(d.form)}</Badge>
                  <Text mono truncate>{d.content}</Text>
                </Cluster>
                {d.reason ? <Text variant="note">{d.reason}</Text> : null}
              </Column>
            ))}
          </Column>
        </Column>
      ) : null}
    </Column>
  );
}
