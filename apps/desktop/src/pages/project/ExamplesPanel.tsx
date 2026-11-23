import * as React from 'react';
import { Badge, Button, Count, Empty, FormField, Icon, ItemList, ItemRow, Textarea } from '@acaprino/sigrid';
import { engineOf } from '../../model.ts';
import { useRegistry } from '../../state/registry.tsx';
import { useProject } from '../../state/useProject.tsx';
import { useNotify } from '../../state/notices.tsx';
import { noteTold, tellNote } from '../../state/project.ts';
import { message, plural } from '../../words.ts';
import { outputsOf, readAnswer } from './graph-model.ts';
import type { Outcome } from './graph-model.ts';
import { Heading, StepList } from './Details.tsx';
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
    <div className="flex flex-col gap-5">
      <section aria-labelledby={`${ids}-try`} className="flex flex-col gap-2">
        <h3 id={`${ids}-try`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="ai" />Try a request</h3>
        <FormField id={boxId} label="Request to simulate" help="Write it as you would to your coding agent: the graph shows which branch it activates, and in what order." error={sim.error || undefined}>
          <Textarea rows={3} value={sim.task} aria-describedby={explain ? noteId : undefined} onChange={e => project.patchSim({ task: e.currentTarget.value, error: '' })} />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <Button id={goId} variant="outline" loading={running} loadingText={`Asking ${asking(engine)}…`} onClick={() => void simulate()}><Icon name="play" />Simulate</Button>
          {running ? <Button variant="ghost" onClick={cancel}>Cancel</Button> : null}
        </div>
        {explain ? <p id={noteId} className="text-xs text-ink-mute">{noteText(engine)}</p> : null}
        {sim.result && sim.example === null ? <Result outcome={sim.result} known={known} onCapability={toCapability} onClear={clear} /> : null}
      </section>
      <section aria-labelledby={`${ids}-examples`} className="flex flex-col gap-2">
        <h3 id={`${ids}-examples`} className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="tasks" />Documented examples <Count value={data.examples.length} label={data.examples.length === 1 ? 'example' : 'examples'} /></h3>
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
                  description={(
                    <>
                      {asked ? <span className="block truncate" title={asked}>{asked}</span> : null}
                      {intents.length ? <span className="block truncate" title={intents.join(' → ')}>Intent {intents.map((x, k) => <React.Fragment key={k}>{k ? ' → ' : ''}<code className="font-mono">{x}</code></React.Fragment>)}</span> : null}
                      {outs.length ? <span className="block truncate" title={outs.join(', ')}>Output {outs.join(', ')}</span> : null}
                    </>
                  )}
                />
              );
            })}
          </ItemList>
        ) : <p className="text-sm text-ink-mute">This project documents no example yet.</p>}
      </section>
    </div>
  );
}

/** The outcome of a free-text request: the AI's decision (its status, the request, the steps in order, the reason and the questions), an answer that was no valid decision, or a call that did not run. */
function Result({ outcome: o, known, onCapability, onClear }: { outcome: Outcome; known: Set<string>; onCapability(id: string): void; onClear(): void }) {
  const clear = <div><Button variant="ghost" size="sm" onClick={onClear}>Clear</Button></div>;
  const asked = <p className="text-sm text-ink-soft">“{o.asked}”</p>;
  if (o.kind === 'failed') return (
    <div role="alert" className="flex flex-col gap-2 rounded-lg bg-raised p-3 shadow-sm">
      <div><Badge variant="destructive">Could not run</Badge></div>
      {asked}
      <p className="text-sm font-semibold text-ink">The simulation could not run</p>
      <p className="text-sm text-ink-soft">{o.message}</p>
      <p className="text-xs text-ink-mute">Check the AI engine in Settings.</p>
      {clear}
    </div>
  );
  if (o.kind === 'invalid') return (
    <div role="status" className="flex flex-col gap-2 rounded-lg bg-raised p-3 shadow-sm">
      <div><Badge variant="destructive">Invalid answer</Badge></div>
      {asked}
      <p className="text-sm font-semibold text-ink">The AI's answer was not a valid decision</p>
      {o.errors.length ? <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-soft">{o.errors.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-xs text-ink-mute">No reason was given.</p>}
      <p className="text-xs text-ink-mute">Nothing from it is shown on the graph.</p>
      {o.who ? <p className="text-xs text-ink-mute">{whoLine(o.who)}</p> : null}
      {clear}
    </div>
  );
  const status = o.status === 'selected' ? plural(o.steps.length, 'step') : o.status === 'no_match' ? 'No match' : 'Needs clarification';
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg bg-raised p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{status}</Badge>{o.stack.length ? <span className="text-xs text-ink-mute">With {o.stack.join(', ')}</span> : null}</div>
      {asked}
      {o.steps.length ? <><Heading icon="listOrdered">Steps, in order</Heading><StepList steps={o.steps} known={known} onCapability={onCapability} /></> : null}
      {o.reason ? <p className="text-sm text-ink-soft">{o.reason}</p> : null}
      {o.questions.length ? <ul className="flex list-disc flex-col gap-1 ps-5 text-sm text-ink-soft">{o.questions.map((q, i) => <li key={i}>{q}</li>)}</ul> : null}
      {o.who ? <p className="text-xs text-ink-mute">{whoLine(o.who)}</p> : null}
      {clear}
    </div>
  );
}
