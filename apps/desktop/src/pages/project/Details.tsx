import * as React from 'react';
import { Badge, Button, Icon } from '@acaprino/sigrid';
import type { IconName } from '@acaprino/sigrid';
import type { ProjectInput } from '../../types.ts';
import type { Selected } from '../../state/project.ts';
import { outputsOf } from './graph-model.ts';
import type { Cap, Example, SimStep } from './graph-model.ts';
import { becameParts, pinnedOf, sourcesOf, targetsOf } from './data.ts';
import type { ProjectData } from './data.ts';

/** The inspector of the workspace: the documented example, the capability or the input that is selected, read only. What it says is the project's data as it is:
 * an example's own steps and reasons, a capability's role, intents, branches and outputs, and which inputs it comes from (the decisions that target it). */

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
  /** The capabilities the lit decision activates, with the numbers of their steps. */
  lit: Map<string, number[]>;
  onSelect(next: Selected): void;
}

export function Details({ shown, data, lit, onSelect }: DetailsProps) {
  const known = React.useMemo(() => new Set(data.caps.map(c => c.id)), [data]);
  const toCap = (id: string) => onSelect({ kind: 'capability', id });
  if (shown.kind === 'example') return <ExampleDetails example={shown.example} data={data} known={known} onCapability={toCap} />;
  if (shown.kind === 'capability') return <CapabilityDetails cap={shown.cap} data={data} lit={lit} known={known} onSelect={onSelect} />;
  return <InputDetails input={shown.input} data={data} known={known} onCapability={toCap} />;
}

// ---------- the parts ----------
/** A heading inside the inspector, with its icon (R6). */
export function Heading({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return <h4 className="flex items-center gap-2 text-xs font-semibold text-ink"><Icon name={icon} />{children}</h4>;
}
function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5"><dt className="text-xs text-ink-mute">{name}</dt><dd className="min-w-0 text-sm text-ink">{children}</dd></div>;
}
/** A capability or an input named in the inspector: pressing it shows that one. A long id is cut, and its whole name is its hint and its accessible name. */
export function ItemLink({ id, label, onPress }: { id: string; label?: string | undefined; onPress(id: string): void }) {
  return (
    <Button variant="link" size="sm" className="h-auto max-w-full px-0 py-0.5" aria-label={label ?? id} onClick={() => onPress(id)}>
      <span className="truncate" title={id}>{id}</span>
    </Button>
  );
}
const none = <span className="text-ink-mute">—</span>;

/** The steps of a decision, in order: the capability of each (a link to it when the graph has it), the intent it answers, and why it is there. A prerequisite the runtime added has no intent and no reason of its own. */
export function StepList({ steps, known, onCapability }: { steps: SimStep[]; known: Set<string>; onCapability(id: string): void }) {
  return (
    <ol aria-label="Steps, in order" className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={`${i}:${s.step_id}`} className="flex gap-3">
          <span aria-hidden="true" className="w-5 shrink-0 text-end text-sm font-semibold text-ink tabular-nums">{i + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2">
              {known.has(s.capability) ? <ItemLink id={s.capability} label={`Step ${i + 1}: ${s.capability}`} onPress={onCapability} /> : <span className="truncate text-sm font-medium text-ink" title={s.capability}>{s.capability}</span>}
              {s.intent ? <code className="min-w-0 truncate font-mono text-xs text-ink-soft" title={s.intent}>{s.intent}</code> : null}
              {s.added_as_prerequisite ? <Badge variant="secondary">Prerequisite</Badge> : null}
            </div>
            {s.reason ? <p className="text-xs text-ink-mute">{s.reason}</p> : s.added_as_prerequisite ? <p className="text-xs text-ink-mute">A prerequisite the plugin declares, added before the step that needs it.</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ExampleDetails({ example: e, data, known, onCapability }: { example: Example; data: ProjectData; known: Set<string>; onCapability(id: string): void }) {
  const outs = outputsOf(e, data.caps);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-ink">{e.title}</h3>
        {e.task ? <p className="text-sm text-ink-soft">“{e.task}”</p> : null}
        {e.stack.length ? <p className="text-xs text-ink-mute">With {e.stack.join(', ')}</p> : null}
      </div>
      {e.status !== 'selected' ? <div><Badge variant="secondary">{e.status === 'no_match' ? 'No match' : 'Needs clarification'}</Badge></div> : null}
      {e.steps.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="listOrdered">Steps, in order</Heading>
          <StepList steps={e.steps} known={known} onCapability={onCapability} />
        </section>
      ) : null}
      {outs.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="tag">Produces</Heading>
          <div className="flex flex-wrap gap-1">{outs.map(o => <Badge key={o} variant="outline">{o}</Badge>)}</div>
        </section>
      ) : null}
      {e.reason ? <p className="text-sm text-ink-soft">{e.reason}</p> : null}
      {e.questions.length ? <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-soft">{e.questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : null}
    </div>
  );
}

const stepWords = (n: number[]): string => n.length === 1 ? `Step ${n[0]} of the decision on the graph` : `Steps ${n.slice(0, -1).join(', ')} and ${n.at(-1)} of the decision on the graph`;

/** A capability as the old window's sheet told it: role, entry, which inputs it comes from (the decisions that name it), the intents it answers, its branches and what it produces.
 * The branches are said in words: the canvas draws every line the same, so a line between two capabilities would not tell "runs first" from "never together". */
function CapabilityDetails({ cap: c, data, lit, known, onSelect }: { cap: Cap; data: ProjectData; lit: Map<string, number[]>; known: Set<string>; onSelect(next: Selected): void }) {
  const entry = data.entries.find(e => e.capabilities.includes(c.id)), from = sourcesOf(data.decisions, c.id), steps = lit.get(c.id) ?? [];
  const toCap = (id: string) => onSelect({ kind: 'capability', id }), toInput = (id: string) => onSelect({ kind: 'input', id });
  const other = (id: string) => known.has(id) ? <ItemLink id={id} onPress={toCap} /> : <strong className="font-medium">{id}</strong>;
  const branches: React.ReactNode[] = [
    ...c.after.map(id => <li key={'a:' + id}>Always runs {other(id)} first</li>),
    ...c.needs.map(n => <li key={'n:' + n.capability}>Runs {other(n.capability)} first, on a condition{n.label ? <span className="block text-xs text-ink-mute">{n.label}</span> : null}</li>),
    ...c.conflicts.map(id => <li key={'c:' + id}>Never together with {other(id)}</li>),
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="truncate text-base font-semibold text-ink" title={c.id}>{c.id}</h3>
        {c.title && c.title !== c.id ? <p className="text-sm text-ink-soft">{c.title}</p> : null}
        {steps.length ? <p className="text-xs font-medium text-ink">{stepWords(steps)}</p> : null}
      </div>
      <dl className="flex flex-col gap-2">
        <Fact name="Role">{c.role || none}</Fact>
        <Fact name="Entry">{entry ? <><span className="block">{entry.name}</span>{entry.description ? <span className="block text-xs text-ink-mute">{entry.description}</span> : null}</> : none}</Fact>
        <Fact name="Comes from">{from.length ? <span className="flex flex-wrap gap-x-3">{from.map(s => <ItemLink key={s} id={s} label={`Input ${s}`} onPress={toInput} />)}</span> : none}</Fact>
      </dl>
      {c.intents.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="ai">Activates when the request means</Heading>
          <ul className="flex flex-col gap-2">
            {c.intents.map(i => (
              <li key={i.id} className="flex min-w-0 flex-col gap-0.5">
                <code className="truncate font-mono text-xs text-ink" title={i.id}>{i.id}</code>
                {i.description ? <span className="text-xs text-ink-soft">{i.description}</span> : null}
                {i.excludes ? <span className="text-xs text-ink-mute">Not for: {i.excludes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {branches.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="structure">Branches</Heading>
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">{branches}</ul>
        </section>
      ) : null}
      {c.outputs.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="tag">Produces</Heading>
          <div className="flex flex-wrap gap-1">{c.outputs.map(o => <Badge key={o} variant="outline">{o}</Badge>)}</div>
        </section>
      ) : null}
    </div>
  );
}

const FORMS: Record<string, string> = { capability: 'Capability', 'always-on': 'Always on', hook: 'Hook', 'mcp-server': 'MCP server', dropped: 'Dropped' };

/** An input: where it comes from, how it is pinned, its license, what it became, and its choices one by one, each with the capabilities it went to. */
function InputDetails({ input, data, known, onCapability }: { input: ProjectInput; data: ProjectData; known: Set<string>; onCapability(id: string): void }) {
  const pin = pinnedOf(input), parts = becameParts(input), targets = targetsOf(data.decisions, input.id), choices = data.decisions.filter(d => d.source === input.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="truncate text-base font-semibold text-ink" title={input.id}>{input.id}</h3>
        <p className="truncate text-xs text-ink-mute" title={input.url ?? ''}>{input.url || 'Local source'}</p>
      </div>
      <dl className="flex flex-col gap-2">
        <Fact name="Pinned to"><span className="block">{pin.title}</span><span className="block text-xs text-ink-mute">{pin.line}</span></Fact>
        <Fact name="License">{input.license || none}</Fact>
        <Fact name="What it became">{parts.length ? parts.join(' · ') : <span className="text-ink-mute">Not harmonized yet</span>}</Fact>
      </dl>
      <section className="flex flex-col gap-2">
        <Heading icon="structure">Capabilities it went to</Heading>
        {targets.length ? (
          <ul className="flex flex-col">
            {targets.map(id => <li key={id} className="min-w-0">{known.has(id) ? <ItemLink id={id} onPress={onCapability} /> : <span className="text-sm text-ink-soft">{id}</span>}</li>)}
          </ul>
        ) : <p className="text-sm text-ink-mute">None: no choice of this input went to a capability.</p>}
      </section>
      {choices.length ? (
        <section className="flex flex-col gap-2">
          <Heading icon="labels">Its choices</Heading>
          <ul className="flex flex-col gap-3">
            {choices.map((d, i) => (
              <li key={i} className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge variant="secondary">{FORMS[d.form] ?? d.form}</Badge>
                  <span className="min-w-0 truncate font-mono text-xs text-ink" title={d.content}>{d.content}</span>
                </div>
                {d.reason ? <span className="text-xs text-ink-mute">{d.reason}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
