import { groupedGraphScene } from '@acaprino/imago/graph-layout';
import type { GraphEdge, GraphOptions, GraphScene } from '@acaprino/imago/graph';
import type { Cap, Entry } from './graph-model.ts';

const labelOf = (entry: Entry, slug: string) => slug && entry.name.startsWith(slug + '-') ? entry.name.slice(slug.length + 1) : entry.name;
const stepLabel = (n: number[]) => n.length === 1 ? `step ${n[0]}` : `steps ${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
const nodeId = (id: string) => 'cap:' + id;

/** Domain adapter only: Imago owns layout, rendering, navigation and camera state. */
export function decisionScene(entries: Entry[], capabilities: Cap[], slug: string, lit: Map<string, number[]>): GraphScene {
  const known = new Map<string, Cap>();
  for (const cap of capabilities) if (!known.has(cap.id)) known.set(cap.id, cap);
  const any = [...known.keys()].some(id => lit.has(id));
  const nodes = [...known.values()].map(cap => {
    const entry = entries.find(entry => entry.capabilities.includes(cap.id)), numbers = lit.get(cap.id) ?? [];
    return {
      id: nodeId(cap.id), label: cap.id, title: cap.title,
      ariaLabel: `Capability ${cap.id}${entry ? `, entry ${labelOf(entry, slug)}` : ''}${numbers.length ? `, ${stepLabel(numbers)}` : ''}`,
      count: numbers[0], selected: numbers.length > 0, dimmed: any && !numbers.length,
    };
  });
  const groups = entries.map((entry, index) => {
    const selected = entry.capabilities.some(id => known.has(id) && lit.has(id));
    return { id: `entry:${index}:${entry.name}`, label: labelOf(entry, slug), title: entry.description,
      ariaLabel: `Entry ${labelOf(entry, slug)}`, selected, dimmed: any && !selected, children: entry.capabilities.map(nodeId) };
  });
  const edges: GraphEdge[] = [], pairs = new Set<string>();
  for (const cap of known.values()) {
    for (const before of cap.after) edges.push({ source: nodeId(cap.id), target: nodeId(before), label: `${cap.id} always runs ${before} first`, tone: lit.has(cap.id) && lit.has(before) ? 'accent' : undefined, dimmed: any && !(lit.has(cap.id) && lit.has(before)) });
    for (const need of cap.needs) edges.push({ source: nodeId(cap.id), target: nodeId(need.capability), label: `${cap.id} needs ${need.capability} when: ${need.label}`, dashed: true, tone: lit.has(cap.id) && lit.has(need.capability) ? 'accent' : 'warn', dimmed: any && !(lit.has(cap.id) && lit.has(need.capability)) });
    for (const other of cap.conflicts) {
      const key = JSON.stringify([cap.id, other].sort());
      if (pairs.has(key)) continue;
      pairs.add(key);
      edges.push({ source: nodeId(cap.id), target: nodeId(other), label: `${cap.id} never runs with ${other}`, dotted: true, directed: false, tone: 'err', dimmed: any });
    }
  }
  return groupedGraphScene(groups, nodes, edges);
}

export function decisionGraphOptions(onCapability: (id: string) => void): GraphOptions {
  return {
    label: 'Decision graph: entries on the left, capabilities on the right',
    controls: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit graph' },
    onSelect: id => { if (id.startsWith('cap:')) onCapability(id.slice(4)); },
  };
}
