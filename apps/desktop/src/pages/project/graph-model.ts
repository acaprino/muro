import type { ProjectInfo } from '../../types.ts';
import { obj, text, amount } from '../../model.ts';

/** What step 3 reads of a project and of a simulation, as plain data. `info.graph` comes from the guide's data model (`muro project info`) and the project may be a
 * file from elsewhere, so everything is read for what is there: a field of the wrong type is left out, never guessed. Nothing here decides which capability a request
 * means; a documented example and the AI's validated answer are the only things that name a branch. */
export type Status = 'selected' | 'no_match' | 'needs_clarification';
const STATUSES: readonly string[] = ['selected', 'no_match', 'needs_clarification'];
export interface Intent { id: string; description: string; excludes: string }
export interface Need { capability: string; label: string; when: string; reason: string }
export interface Cap { id: string; title: string; role: string; when: string; after: string[]; outputs: string[]; intents: Intent[]; needs: Need[]; conflicts: string[] }
export interface Entry { name: string; description: string; capabilities: string[] }
/** One step of a decision. A prerequisite the runtime added has no intent and no reason: nobody decided it for this request. */
export interface SimStep { step_id: string; capability: string; intent: string | null; reason: string | null; added_as_prerequisite: boolean }
/** Who answered: the engine of the settings, with what the runtime knows of the run. */
export interface Who { engine: string; model: string | null; harness: string | null; cost_usd: number | null; duration_ms: number | null }
export interface Example { title: string; task: string; stack: string[]; status: Status; reason: string; questions: string[]; steps: SimStep[] }
/** What the card shows: a decision (a documented example, or the AI's), an answer that was no valid decision, or a call that did not run. */
export type Outcome =
  | { kind: 'decision'; asked: string; status: Status; steps: SimStep[]; reason: string; questions: string[]; stack: string[]; who: Who | null; example: string | null }
  | { kind: 'invalid'; asked: string; errors: string[]; who: Who | null }
  | { kind: 'failed'; asked: string; message: string };

const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const items = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(obj).filter((x): x is Record<string, unknown> => !!x) : [];
const isStatus = (v: unknown): v is Status => typeof v === 'string' && STATUSES.includes(v);

// ---------- the graph ----------
export function capsOf(info: ProjectInfo): Cap[] {
  return items(info.graph?.capabilities).filter(c => typeof c.id === 'string' && c.id).map(c => {
    const id = c.id as string;
    return {
      id, title: text(c.title) || id, role: text(c.role), when: text(c.when), after: strings(c.after), outputs: strings(c.outputs), conflicts: strings(c.conflicts),
      intents: items(c.intents).filter(i => typeof i.id === 'string').map(i => ({ id: i.id as string, description: text(i.description), excludes: text(i.excludes) })),
      needs: items(c.needs).filter(n => typeof n.capability === 'string').map(n => ({ capability: n.capability as string, label: text(n.label), when: text(n.when), reason: text(n.reason) })),
    };
  });
}
export function entriesOf(info: ProjectInfo): Entry[] {
  return items(info.graph?.entries).filter(e => typeof e.name === 'string' && e.name).map(e => ({ name: e.name as string, description: text(e.description), capabilities: strings(e.capabilities) }));
}

// ---------- the documented examples ----------
const stepsOf = (v: unknown): SimStep[] | null => {
  if (!Array.isArray(v)) return null;
  const out: SimStep[] = [];
  for (const s of v) {
    const o = obj(s);
    if (!o || typeof o.step_id !== 'string' || typeof o.capability !== 'string' || (o.intent !== null && typeof o.intent !== 'string') || (o.reason !== null && typeof o.reason !== 'string') || typeof o.added_as_prerequisite !== 'boolean') return null;
    out.push({ step_id: o.step_id, capability: o.capability, intent: o.intent, reason: o.reason, added_as_prerequisite: o.added_as_prerequisite });
  }
  return out;
};
/** One per documented example, in its order, so an index means the same thing everywhere. Its steps are the runtime's resolution of the example's own decision (`steps`); the
 * reason of a step is the one its selection gave, and a step no selection names is one the runtime added as a prerequisite. A malformed example has a title and no steps. */
export function examplesOf(info: ProjectInfo): Example[] {
  const raw: unknown[] = Array.isArray(info.graph?.examples) ? info.graph.examples : [];
  return raw.map((r, i) => {
    const e = obj(r) ?? {}, chosen = new Map<string, string>();
    for (const s of items(e.selections)) if (typeof s.capability === 'string') chosen.set(text(s.step_id) || s.capability, text(s.reason));
    const steps: SimStep[] = items(e.steps).filter(s => typeof s.step === 'string' && typeof s.capability === 'string').map(s => ({
      step_id: s.step as string, capability: s.capability as string, intent: typeof s.intent === 'string' ? s.intent : null,
      reason: chosen.get(s.step as string) ?? null, added_as_prerequisite: !chosen.has(s.step as string),
    }));
    return { title: text(e.title) || `Example ${i + 1}`, task: text(e.task), stack: strings(e.stack_tokens), status: isStatus(e.status) ? e.status : 'selected', reason: text(e.reason), questions: strings(e.questions), steps };
  });
}
/** What the steps of an example produce, in the order first met and once each: the `outputs` the capability data declares for each step's capability, never inferred. A step whose capability the graph lacks adds nothing. */
export function outputsOf(example: Example, capabilities: Cap[]): string[] {
  const known = new Map<string, string[]>(), seen = new Set<string>();
  for (const c of capabilities) if (!known.has(c.id)) known.set(c.id, c.outputs);
  for (const s of example.steps) for (const o of known.get(s.capability) ?? []) seen.add(o);
  return [...seen];
}
export const outcomeOfExample = (e: Example): Outcome => ({ kind: 'decision', asked: e.task, status: e.status, steps: e.steps, reason: e.reason, questions: e.questions, stack: e.stack, who: null, example: e.title });

// ---------- what the runtime answers, and what the session keeps ----------
const whoOf = (v: unknown): Who | null => {
  const o = obj(v);
  return o && typeof o.engine === 'string' ? { engine: o.engine, model: typeof o.model === 'string' ? o.model : null, harness: typeof o.harness === 'string' ? o.harness : null, cost_usd: amount(o.cost_usd), duration_ms: amount(o.duration_ms) } : null;
};
export const UNKNOWN = 'The answer of the simulation is in a shape this version of Muro does not know.';
/** The runtime's answer to `simulate`: the factory's `check` result and the engine that made it. `valid:false` is an invalid decision with its errors and nothing else is read from it;
 * an answer in any other shape is a failure. A decision is taken as it is: nothing is repaired, completed or reordered. */
export function readAnswer(raw: unknown, asked: string): Outcome {
  const a = obj(raw);
  if (!a || typeof a.valid !== 'boolean') return { kind: 'failed', asked, message: UNKNOWN };
  if (!a.valid) return { kind: 'invalid', asked, errors: strings(a.errors), who: whoOf(a) };
  const steps = stepsOf(a.steps);
  if (!isStatus(a.status) || !steps) return { kind: 'failed', asked, message: UNKNOWN };
  return { kind: 'decision', asked, status: a.status, steps, reason: text(a.reason), questions: strings(a.questions), stack: [], who: whoOf(a), example: null };
}
/** An outcome the session kept: the same rules, and anything else is no outcome. */
export function readOutcome(raw: unknown): Outcome | null {
  const o = obj(raw);
  if (!o || typeof o.asked !== 'string') return null;
  if (o.kind === 'failed') return typeof o.message === 'string' ? { kind: 'failed', asked: o.asked, message: o.message } : null;
  if (o.kind === 'invalid') return Array.isArray(o.errors) && o.errors.every(e => typeof e === 'string') ? { kind: 'invalid', asked: o.asked, errors: o.errors as string[], who: whoOf(o.who) } : null;
  const steps = stepsOf(o.steps);
  if (o.kind !== 'decision' || !isStatus(o.status) || !steps || typeof o.reason !== 'string') return null;
  return { kind: 'decision', asked: o.asked, status: o.status, steps, reason: o.reason, questions: strings(o.questions), stack: strings(o.stack), who: whoOf(o.who), example: typeof o.example === 'string' ? o.example : null };
}

/** The capabilities a decision activates, each with the numbers of its steps (a capability repeated has several), in the order of the decision. */
export function litOf(outcome: Outcome | null): Map<string, number[]> {
  const lit = new Map<string, number[]>();
  if (outcome?.kind === 'decision') outcome.steps.forEach((s, i) => lit.set(s.capability, [...(lit.get(s.capability) ?? []), i + 1]));
  return lit;
}
