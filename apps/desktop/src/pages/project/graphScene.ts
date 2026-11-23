import type { GraphEdge, GraphNode } from '@acaprino/sigrid/graph';
import type { Cap, Entry } from './graph-model.ts';

/** The one mapping of a project's decision graph to what Sigrid's `GraphCanvas` (4.3.1, its tree mode) draws. Pure: no React, no Sigrid at run time (only its types), so it runs
 * under plain Node.
 *
 * - An entry's capabilities hang from it: the line of the tree (`kind` left to Sigrid's default, `child`), so an entry opens and closes, a closed one says how many it hides, and
 *   the ids of the closed entries are the canvas's `collapsed`.
 * - What the plugin declares between two capabilities is a `link` line, which hangs nothing and is drawn while both ends are in sight. Its kind is said by its dash and its words,
 *   never by a colour: «runs first», solid with an arrowhead (`after`); the AI's own label of the condition, dashed with an arrowhead (`needs`); «never together», dotted and with no
 *   arrowhead, since it goes both ways (`conflicts`). The words are drawn while one of the two ends is chosen or has the focus, or while the line is the lit path's
 *   (`labelShown: 'chosen'`), and screen readers hear them always, in the description of both ends. No line has a tone of its own, so the lit path takes the accent.
 * - The lit decision is the canvas's numbered path (`steps`): a capability on it has the selection tint and its numbers in dots and in its name, and the line between two of its
 *   capabilities is the path's.
 * Nothing here decides which capability a request means; only what the caller passes as `lit` (a documented example, or the AI's validated answer) numbers a step, and `reached`
 * (what the decisions of a chosen input went to) only opens entries. */
export type SceneNode = GraphNode & {
  kind: 'entry' | 'capability';
  /** An entry's "Use when" first sentence. It is the entry's second line (`detail`) while the entry is open, and is not drawn while it is closed: a closed entry is its
   * name alone, a shorter thing, so a column of closed entries is drawn larger. In the tree mode Sigrid names a thing to a screen reader by its label only; the whole
   * description is said in the details of every capability of the entry. Absent when the entry has no description. */
  about?: string;
};
/** `member`: the capability hangs from the entry that lists it. `after`: it always runs after `from`. `needs`: it needs `from` when a condition holds. `conflicts`: the two never run together. */
export type Relation = 'member' | 'after' | 'needs' | 'conflicts';
/** A line of the canvas, with the relation it draws (a field of Muro's own: an object with more fields is still a `GraphEdge`). Its `id` names it, so two relations between the
 * same two capabilities are two lines, which Sigrid draws side by side. */
export type SceneEdge = GraphEdge & { id: string; relation: Relation };
export interface Scene {
  /** The things, each entry with its second line only when it is not in `closed` (`drawnNodes` gives them again for what the canvas has closed). */
  nodes: SceneNode[];
  /** Every line the graph has, each relation once, in the order entries' lines, `after`, `needs`, `conflicts`: of two lines between two steps of the path, the first is the
   * path's. All of them are given to the canvas. */
  edges: SceneEdge[];
  /** The lit decision as the canvas numbers it (its `steps`): the thing of each capability a step runs, with the numbers of its steps, in the order of the first step. Empty
   * when nothing is lit. */
  steps: ReadonlyMap<string, readonly number[]>;
  /** The ids of the entries to draw closed: every entry that holds no lit capability and none of the capabilities `reached`, so all of them when nothing is lit or reached.
   * Give it to the canvas as `collapsed`. */
  closed: string[];
}

/** The words on a line of each kind but `needs`, whose words are the AI's own label of its condition (or these, when it has none). */
const RUNS_FIRST = 'runs first', ON_A_CONDITION = 'on a condition', NEVER_TOGETHER = 'never together';

const CAP_PREFIX = 'cap:';
/** The id of a capability's thing on the canvas. It cannot collide with an entry's (`entry:<index>:<name>`), whatever either is called. */
export const capNodeId = (id: string): string => CAP_PREFIX + id;
/** The capability a thing stands for, or null for an entry. */
export const capabilityOf = (nodeId: string): string | null => nodeId.startsWith(CAP_PREFIX) ? nodeId.slice(CAP_PREFIX.length) : null;
const entryNodeId = (index: number, name: string): string => `entry:${index}:${name}`;

const labelOf = (entry: Entry, slug: string): string => slug && entry.name.startsWith(slug + '-') ? entry.name.slice(slug.length + 1) : entry.name;
/** The first sentence of an entry's description (its "Use when"): up to the first . ! or ? that ends a word, `e.g.` and `i.e.` aside; the whole text when it has none. */
const firstSentence = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return /^.*?(?<!\b(?:e\.g|i\.e))[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
};

/** One thing per entry, one per capability (the first of a repeated id), the entry's line to each capability it lists, and a line for each `after`, `needs` and `conflicts` between two
 * capabilities the graph has. A capability that no entry lists is kept and hangs from nothing. A line to a capability the graph lacks, or from a capability to itself, is left out, and
 * so is the same relation between the same two things said twice (a conflict listed by both sides is one line). A line runs from what comes first to what follows it: the entry to its
 * capability, the prerequisite to the capability that needs it or follows it; a conflict runs from the capability that lists it first. */
export function graphScene(entries: Entry[], capabilities: Cap[], slug: string, lit: Map<string, number[]>, reached: readonly string[] = []): Scene {
  const known = new Map<string, Cap>();
  for (const cap of capabilities) if (!known.has(cap.id)) known.set(cap.id, cap);
  const isLit = (id: string): boolean => (lit.get(id) ?? []).length > 0;
  const wanted = new Set(reached);

  const nodes: SceneNode[] = [], edges: SceneEdge[] = [], closed: string[] = [];
  entries.forEach((entry, index) => {
    const id = entryNodeId(index, entry.name), about = firstSentence(entry.description);
    const shut = !entry.capabilities.some(capability => known.has(capability) && (isLit(capability) || wanted.has(capability)));
    if (shut) closed.push(id);
    nodes.push({ id, label: labelOf(entry, slug), kind: 'entry', ...(about ? { about } : {}), ...(about && !shut ? { detail: about } : {}) });
  });
  for (const cap of known.values()) nodes.push({ id: capNodeId(cap.id), label: cap.id, kind: 'capability' });
  // The lit Map is in the order of the decision's first step for each capability (graph-model.ts, litOf): so is the path.
  const steps = new Map<string, readonly number[]>();
  for (const [id, numbers] of lit) if (known.has(id) && numbers.length > 0) steps.set(capNodeId(id), [...numbers]);

  // One relation between two things is one line: an entry's and the two that run in order by their ends in that direction, a conflict by its two ends whichever side lists it.
  const seen = new Set<string>();
  const join = (from: string, to: string, relation: Relation, line: Pick<GraphEdge, 'kind' | 'label' | 'labelShown' | 'style' | 'directed'> = {}) => {
    const id = JSON.stringify([relation, ...(relation === 'conflicts' ? [from, to].sort() : [from, to])]);
    if (from === to || seen.has(id)) return;
    seen.add(id);
    edges.push({ id, from, to, relation, ...line });
  };
  entries.forEach((entry, index) => {
    for (const capability of entry.capabilities) if (known.has(capability)) join(entryNodeId(index, entry.name), capNodeId(capability), 'member');
  });
  for (const cap of known.values()) for (const before of cap.after) if (known.has(before)) {
    join(capNodeId(before), capNodeId(cap.id), 'after', { kind: 'link', label: RUNS_FIRST, labelShown: 'chosen' });
  }
  for (const cap of known.values()) for (const need of cap.needs) if (known.has(need.capability)) {
    join(capNodeId(need.capability), capNodeId(cap.id), 'needs', { kind: 'link', style: 'dashed', label: need.label || ON_A_CONDITION, labelShown: 'chosen' });
  }
  for (const cap of known.values()) for (const other of cap.conflicts) if (known.has(other)) {
    join(capNodeId(cap.id), capNodeId(other), 'conflicts', { kind: 'link', style: 'dotted', directed: false, label: NEVER_TOGETHER, labelShown: 'chosen' });
  }

  return { nodes, edges, steps, closed };
}

/** The things of a scene as the canvas draws them while the entries in `collapsed` are closed (the canvas's own state, which the person changes): an open entry says its
 * "Use when" sentence under its name, a closed one only its name. A capability is as the scene made it. */
export function drawnNodes(scene: Scene, collapsed: readonly string[]): SceneNode[] {
  const shut = new Set(collapsed);
  return scene.nodes.map((n): SceneNode => {
    if (n.kind !== 'entry') return n;
    const about = n.about;
    return { id: n.id, label: n.label, kind: 'entry', ...(about ? { about } : {}), ...(about && !shut.has(n.id) ? { detail: about } : {}) };
  });
}

/** A capability's thing and the things of the capabilities it is joined to by what the plugin declares (`after`, `needs`, `conflicts`, either way), each once, itself first:
 * what has to be in sight for its lines to be drawn. Empty for a capability the graph does not have. */
export function around(scene: Scene, capability: string): string[] {
  const self = capNodeId(capability);
  if (!scene.nodes.some(n => n.id === self)) return [];
  const ids = [self];
  for (const e of scene.edges) {
    if (e.relation === 'member') continue;
    const other = e.from === self ? e.to : e.to === self ? e.from : null;
    if (other !== null && !ids.includes(other)) ids.push(other);
  }
  return ids;
}

/** The entries of `collapsed` to open so that each of `ids` is in sight: for a capability out of sight (every entry that lists it is closed), the entries that list it. An
 * entry, and a capability no entry lists, hang from nothing and are always in sight. Each once; empty when everything is in sight already. */
export function openingFor(scene: Scene, ids: readonly string[], collapsed: readonly string[]): string[] {
  const shut = new Set(collapsed), open: string[] = [];
  for (const id of ids) {
    const holders = scene.edges.filter(e => e.relation === 'member' && e.to === id).map(e => e.from);
    if (holders.length === 0 || holders.some(holder => !shut.has(holder))) continue;
    for (const holder of holders) if (!open.includes(holder)) open.push(holder);
  }
  return open;
}
