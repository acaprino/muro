import type { GraphEdge, GraphNode } from '@acaprino/sigrid/graph';
import type { Cap, Entry } from './graph-model.ts';

/** The one mapping of a project's decision graph to what Sigrid's `GraphCanvas` draws. Pure: no React, no Sigrid at run time (only its types), so it runs under plain Node.
 *
 * Sigrid's graph is a tree-shaped thing: `GraphEdge` is `{ from, to }` and `to` hangs from `from`; a thing that has others hanging from it can be closed, and the ids of the
 * closed things are the canvas's `collapsed` / `defaultCollapsed`. The canvas draws every line the same and has no field for a line's kind or label, so the kind and the label
 * ride along on `SceneEdge` (an object with more fields is still a `GraphEdge`): the canvas ignores them, the details of a selected thing can use them. Nothing here decides
 * which capability a request means; only what the caller passes as `lit` (a documented example, or the AI's validated answer) marks a step. */
export type SceneNode = GraphNode & {
  kind: 'entry' | 'capability';
  /** The numbers of the steps of the lit decision that run this capability, in order. Absent when nothing lit runs it. */
  steps?: number[];
};
export type SceneEdge = GraphEdge & {
  /** `member`: the capability hangs from the entry that lists it. `after`: it always runs after `from`. `needs`: it needs `from` when a condition holds. `conflicts`: the two never run together. */
  kind: 'member' | 'after' | 'needs' | 'conflicts';
  /** The AI's own short label of the condition, for `needs`. */
  label?: string;
};
export interface Scene {
  nodes: SceneNode[];
  edges: SceneEdge[];
  /** The ids of the entries to draw closed: every entry that holds no lit capability, so all of them when nothing is lit. Give it to the canvas as `collapsed` or `defaultCollapsed`. */
  closed: string[];
}

const CAP_PREFIX = 'cap:';
/** The id of a capability's thing on the canvas. It cannot collide with an entry's (`entry:<index>:<name>`), whatever either is called. */
export const capNodeId = (id: string): string => CAP_PREFIX + id;
/** The capability a thing stands for, or null for an entry. */
export const capabilityOf = (nodeId: string): string | null => nodeId.startsWith(CAP_PREFIX) ? nodeId.slice(CAP_PREFIX.length) : null;
const entryNodeId = (index: number, name: string): string => `entry:${index}:${name}`;

const labelOf = (entry: Entry, slug: string): string => slug && entry.name.startsWith(slug + '-') ? entry.name.slice(slug.length + 1) : entry.name;
const stepLabel = (n: number[]): string => n.length === 1 ? `step ${n[0]}` : `steps ${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
/** The first sentence of an entry's description (its "Use when"): up to the first . ! or ? that ends a word, `e.g.` and `i.e.` aside; the whole text when it has none. */
const firstSentence = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return /^.*?(?<!\b(?:e\.g|i\.e))[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
};

/** One thing per entry, one per capability (the first of a repeated id), the entry's line to each capability it lists, and a line for each `after`, `needs` and `conflicts` between two capabilities the
 * graph has. A capability that no entry lists is kept and hangs from nothing. A line to a capability the graph lacks is left out, and so is a second line between the same two capabilities
 * (the canvas names a line by its two ends, and one pair is one line to look at): `after` is kept before `needs`, `needs` before `conflicts`, and a conflict listed by both sides is one line.
 * A line runs from what comes first to what hangs from it: the entry to its capability, the prerequisite to the capability that needs it or follows it; a conflict runs from the capability
 * that lists it first. */
export function graphScene(entries: Entry[], capabilities: Cap[], slug: string, lit: Map<string, number[]>): Scene {
  const known = new Map<string, Cap>();
  for (const cap of capabilities) if (!known.has(cap.id)) known.set(cap.id, cap);
  const stepsOf = (id: string): number[] => lit.get(id) ?? [];

  const nodes: SceneNode[] = [], edges: SceneEdge[] = [], closed: string[] = [];
  entries.forEach((entry, index) => {
    const id = entryNodeId(index, entry.name), detail = firstSentence(entry.description);
    nodes.push({ id, label: labelOf(entry, slug), kind: 'entry', ...(detail ? { detail } : {}) });
    if (!entry.capabilities.some(capability => known.has(capability) && stepsOf(capability).length > 0)) closed.push(id);
  });
  for (const cap of known.values()) {
    const steps = stepsOf(cap.id);
    nodes.push({ id: capNodeId(cap.id), label: cap.id, kind: 'capability', ...(steps.length ? { detail: stepLabel(steps), steps: [...steps] } : {}) });
  }

  // An entry's line is told by its two ends in that direction; two capabilities get one line in all, whichever side asked and whatever it says.
  const drawn = new Set<string>();
  const join = (from: string, to: string, kind: SceneEdge['kind'], label?: string) => {
    const key = JSON.stringify(kind === 'member' ? [from, to] : [from, to].sort());
    if (from === to || drawn.has(key)) return;
    drawn.add(key);
    edges.push(label ? { from, to, kind, label } : { from, to, kind });
  };
  entries.forEach((entry, index) => {
    for (const capability of entry.capabilities) if (known.has(capability)) join(entryNodeId(index, entry.name), capNodeId(capability), 'member');
  });
  for (const cap of known.values()) for (const before of cap.after) if (known.has(before)) join(capNodeId(before), capNodeId(cap.id), 'after');
  for (const cap of known.values()) for (const need of cap.needs) if (known.has(need.capability)) join(capNodeId(need.capability), capNodeId(cap.id), 'needs', need.label);
  for (const cap of known.values()) for (const other of cap.conflicts) if (known.has(other)) join(capNodeId(cap.id), capNodeId(other), 'conflicts');

  return { nodes, edges, closed };
}
