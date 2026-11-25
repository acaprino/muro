import * as React from 'react';
import { Badge, Button, Card, Cluster, Column, Count, Icon, Section, Text, Textarea } from '@acaprino/sigrid/primitives';
import { Empty, FormField, ItemList, ItemRow } from '@acaprino/sigrid/components';
import { engineOf } from '../../model.ts';
import { useRegistry } from '../../state/registry.tsx';
import { useProject } from '../../state/useProject.tsx';
import { useNotify } from '@acaprino/imago';
import { noteTold, tellNote } from '../../state/project.ts';
import { message, plural } from '../../words.ts';
import { outputsOf, readAnswer } from './graph-model.ts';
import type { Outcome } from './graph-model.ts';
import { GroupHeading, Sentences, StepList } from './Details.tsx';
import type { ProjectData } from './data.ts';
import { asking, noteText, whoLine } from './lines.ts';

/** The examples panel: a request to simulate, and the project's documented examples. What lights the graph is one of three things, and the page decides none of them:
 * a documented example (its own decision, resolved by the factory: no call), the AI's decision for a free-text request (`simulate {id, task, run}`, validated by the
 * factory with the runtime's rules, stopped with `cancel_simulation {run}`), or the reason there is none. Nothing is matched by words. */

// The engine in the words of the interface (what a free-text request uses and may cost, who answered it) is lines.ts, pure, so its branches are tested under Node.
/** A name for a run, as the runtime lets one be named (letters, digits, `-` and `_`, 64 at most): unique, so a run left over from an earlier page is never taken for this one. */
const newRun = (): string => globalThis.crypto?.randomUUID?.() ?? `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface ExamplesPanelProps {
  data: ProjectData;
  /** Called when an example was chosen: a drawer that holds the panel closes, so the graph and the details are in sight. */
  onChosen(): void;
}

export function ExamplesPanel({ data, onChosen }: ExamplesPanelProps) {
  const { request, snapshot } = useRegistry();
  const project = useProject();
  const notify = useNotify();
  const ids = React.useId(), boxId = `${ids}-request`, goId = `${ids}-simulate`, noteId = `${ids}-note`;
  const known = React.useMemo(() => new Set(data.caps.map(c => c.id)), [data]);
  const view = project.view;
  if (!view) return null;
  const sim = view.sim, engine = engineOf(snapshot?.registry.settings), running = sim.run !== null, explain = !noteTold();
  const focusBox = () => document.getElementById(boxId)?.focus();
  const toCapability = (id: string) => project.select({ kind: 'capability', id });

  /** The end of waiting for the answer to a free-text request, which is also the end of the request: the runtime is told to stop the AI's process. A runtime that
   * cannot say so (an older one, a run that has just ended) is not an error of the page, which has stopped waiting either way. */
  const stopWaiting = (): boolean => {
    const run = project.current()?.sim.run ?? null;
    if (run === null) return false;
    project.patchSim(s => s.run === run ? { run: null } : null);
    request('cancel_simulation', { run }).catch(() => { /* nothing is waiting for it */ });
    return true;
  };
  /** A free-text request. It waits by itself, outside the queue of the other requests (`simulate` is one of `ALONE`), so Cancel and the rest of the window keep working.
   * The answer is shown only while it is still the one waited for: cancelled, replaced by another request, or left with the project, it is dropped. */
  async function simulate(): Promise<void> {
    const now = project.current();
    if (!now || now.sim.run !== null) return;
    const task = now.sim.task.trim();
    if (!task) { project.patchSim({ error: 'Write a request first.' }); focusBox(); return; }
    const mine = newRun();
    project.patchSim({ run: mine, error: '', example: null, result: null });
    project.select(s => s?.kind === 'example' ? null : s);
    tellNote();
    let outcome: Outcome;
    try { outcome = readAnswer(await request<unknown>('simulate', { id: now.id, task, run: mine }), task); }
    catch (e) { outcome = { kind: 'failed', asked: task, message: message(e) }; }
    project.patchSim(s => s.run === mine ? { run: null, result: outcome } : null);
  }
  function cancel(): void {
    if (!stopWaiting()) return;
    document.getElementById(goId)?.focus();
    notify('Stopped waiting for the answer.');
  }
  /** A documented example lights its branch; the same one again, while it is shown, puts it out. Looking at an example is the end of waiting for the AI. */
  function choose(i: number): void {
    const now = project.current();
    if (!now) return;
    stopWaiting();
    const on = now.sim.example === i && now.selected?.kind === 'example' && now.selected.id === String(i);
    project.patchSim({ example: on ? null : i, result: null });
    project.select(on ? null : { kind: 'example', id: String(i) });
    if (!on) onChosen();
  }
  function clear(): void {
    project.patchSim({ example: null, result: null });
    focusBox();
  }

  if (!data.caps.length) return <Empty title="No decision graph" description="This project's plugin has no capabilities to choose between, so there is nothing to simulate." />;
  return (
    <Column gap="xl">
      <Section level={3} title="Try a request" icon={<Icon name="ai" />}>
        <FormField id={boxId} label="Request to simulate" help="Write it as you would to your coding agent: the graph shows which branch it activates, and in what order." error={sim.error || undefined}>
          <Textarea rows={3} value={sim.task} aria-describedby={explain ? noteId : undefined} onChange={e => project.patchSim({ task: e.currentTarget.value, error: '' })} />
        </FormField>
        <Cluster>
          <Button id={goId} variant="outline" loading={running} loadingText={`Asking ${asking(engine)}…`} onClick={() => void simulate()}><Icon name="play" />Simulate</Button>
          {running ? <Button variant="ghost" onClick={cancel}>Cancel</Button> : null}
        </Cluster>
        {explain ? <Text as="p" variant="note" id={noteId}>{noteText(engine)}</Text> : null}
        {sim.result && sim.example === null ? <Result outcome={sim.result} known={known} onCapability={toCapability} onClear={clear} /> : null}
      </Section>
      <Section level={3} title="Documented examples" icon={<Icon name="tasks" />} end={<Count value={data.examples.length} label={data.examples.length === 1 ? 'example' : 'examples'} />}>
        {data.examples.length ? (
          <ItemList aria-label="Documented examples">
            {data.examples.map((e, i) => {
              const intents = e.steps.map(s => s.intent).filter((x): x is string => !!x), outs = outputsOf(e, data.caps);
              const asked = [e.task, e.stack.length ? `With ${e.stack.join(', ')}` : ''].filter(Boolean).join(' · ');
              return (
                <ItemRow
                  key={i}
                  current={sim.example === i}
                  onClick={() => choose(i)}
                  title={<span title={e.title}>{e.title}</span>}
                  description={asked ? <span title={asked}>{asked}</span> : undefined}
                  facts={[
                    ...(intents.length ? [{ text: <Text pre>Intent {intents.map((x, k) => <React.Fragment key={k}>{k ? ' → ' : ''}<code>{x}</code></React.Fragment>)}</Text> }] : []),
                    ...(outs.length ? [{ text: <Text pre>Output {outs.join(', ')}</Text> }] : []),
                  ]}
                />
              );
            })}
          </ItemList>
        ) : <Text as="p" variant="muted">This project documents no example yet.</Text>}
      </Section>
    </Column>
  );
}

/** The outcome of a free-text request: the AI's decision (its status, the request, the steps in order, the reason and the questions), an answer that was no valid decision, or a call that did not run. */
function Result({ outcome: o, known, onCapability, onClear }: { outcome: Outcome; known: Set<string>; onCapability(id: string): void; onClear(): void }) {
  const clear = <Cluster><Button variant="ghost" size="sm" onClick={onClear}>Clear</Button></Cluster>;
  const asked = <Text as="p" variant="soft" pre>“{o.asked}”</Text>;
  if (o.kind === 'failed') return (
    <Card pad="md" gap="sm" role="alert">
      <Cluster><Badge tone="danger">Could not run</Badge></Cluster>
      {asked}
      <Text as="p" variant="strong">The simulation could not run</Text>
      <Text as="p" variant="soft" pre>{o.message}</Text>
      <Text as="p" variant="note">Check the AI engine in Settings.</Text>
      {clear}
    </Card>
  );
  if (o.kind === 'invalid') return (
    <Card pad="md" gap="sm" role="status">
      <Cluster><Badge tone="danger">Invalid answer</Badge></Cluster>
      {asked}
      <Text as="p" variant="strong">The AI's answer was not a valid decision</Text>
      {o.errors.length ? <Sentences items={o.errors} /> : <Text as="p" variant="note">No reason was given.</Text>}
      <Text as="p" variant="note">Nothing from it is shown on the graph.</Text>
      {o.who ? <Text as="p" variant="note">{whoLine(o.who)}</Text> : null}
      {clear}
    </Card>
  );
  const status = o.status === 'selected' ? plural(o.steps.length, 'step') : o.status === 'no_match' ? 'No match' : 'Needs clarification';
  return (
    <Card pad="md" gap="sm" role="status">
      <Cluster><Badge tone={o.status === 'selected' ? 'success' : 'warning'}>{status}</Badge>{o.stack.length ? <Text variant="note">With {o.stack.join(', ')}</Text> : null}</Cluster>
      {asked}
      {o.steps.length ? <><GroupHeading icon="listOrdered">Steps, in order</GroupHeading><StepList steps={o.steps} known={known} onCapability={onCapability} /></> : null}
      {o.reason ? <Text as="p" variant="soft" pre>{o.reason}</Text> : null}
      {o.questions.length ? <Sentences items={o.questions} /> : null}
      {o.who ? <Text as="p" variant="note">{whoLine(o.who)}</Text> : null}
      {clear}
    </Card>
  );
}
