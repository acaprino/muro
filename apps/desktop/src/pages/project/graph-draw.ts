import { esc } from '../../ui.ts';
import type { Cap, Entry } from './graph-model.ts';

/** The decision graph as one inline SVG, laid out from the catalog: entries on the left, capabilities on the right in the order the entries list them, an arc on the right for a
 * condition (dashed) and for two capabilities that never run together (dotted). No library, and no measuring of the page: the width of a node is estimated from its text, on the
 * side of too wide, so a long name is inside its box. A capability is a real button (inside a foreignObject), so the keyboard, the screen reader and the app's own click and
 * focus handling work on it as on any other control. The drawing only draws: which nodes are lit comes with the call, from a decision. */
const NODE = 22, ROW = 28, GAP = 12, TOP = 6, LEFT = 4, LANES = 96, MARGIN = 100, PAD = 10, BADGE = 32;

/** The width of a text at 12px in a proportional face, estimated per character; wide letters count wide and narrow ones narrow, and every class is rounded up. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[mwMW@%]/.test(ch) ? 10.5 : /[A-Z0-9]/.test(ch) ? 8 : /[iljtfr.,:;'|!()\-_ \/]/.test(ch) ? 4.6 : 6.8;
  return Math.ceil(w);
}

export interface PlacedEntry { entry: Entry; label: string; x: number; y: number; w: number }
export interface PlacedCap { cap: Cap; entry: Entry | null; x: number; y: number; w: number }
export interface Layout { width: number; height: number; entries: PlacedEntry[]; caps: PlacedCap[] }

/** The name of an entry as the graph shows it: without the plugin's own prefix. */
const labelOf = (entry: Entry, slug: string) => slug && entry.name.startsWith(slug + '-') ? entry.name.slice(slug.length + 1) : entry.name;

export function layout(entries: Entry[], caps: Cap[], slug: string): Layout {
  const known = new Map<string, Cap>();
  for (const c of caps) if (!known.has(c.id)) known.set(c.id, c);
  const row = new Map<string, number>(), owner = new Map<string, Entry>();
  let y = TOP;
  const wanted: { entry: Entry; y: number | null }[] = [];
  for (const entry of entries) {
    const first = y;
    let placed = 0;
    for (const id of entry.capabilities) if (known.has(id) && !row.has(id)) { row.set(id, y); owner.set(id, entry); y += ROW; placed++; }
    wanted.push({ entry, y: placed ? (first + (y - ROW)) / 2 : null });
    if (placed) y += GAP;
  }
  for (const id of known.keys()) if (!row.has(id)) { row.set(id, y); y += ROW; }
  // An entry whose capabilities were all placed by an earlier entry stands among them; no entry is drawn for capabilities the graph does not have.
  const drawn = wanted.map(w => {
    if (w.y !== null) return { entry: w.entry, y: w.y };
    const rows = w.entry.capabilities.map(id => row.get(id)).filter((r): r is number => r !== undefined);
    return rows.length ? { entry: w.entry, y: (Math.min(...rows) + Math.max(...rows)) / 2 } : null;
  }).filter((d): d is { entry: Entry; y: number } => !!d);
  let previous = -Infinity;
  const spaced = [...drawn].sort((a, b) => a.y - b.y).map(d => { previous = Math.max(d.y, previous + NODE + 4); return { ...d, y: previous }; });
  const labels = spaced.map(d => labelOf(d.entry, slug));
  const ew = Math.max(150, ...labels.map(l => textWidth(l) + 2 * PAD)), cw = Math.max(200, ...[...known.keys()].map(id => textWidth(id) + PAD + BADGE));
  const cx = LEFT + ew + LANES;
  return {
    width: cx + cw + MARGIN, height: Math.max(y, ...spaced.map(d => d.y + NODE + TOP)),
    entries: spaced.map((d, i) => ({ entry: d.entry, label: labels[i], x: LEFT, y: d.y, w: ew })),
    caps: [...known.values()].map(cap => ({ cap, entry: owner.get(cap.id) ?? null, x: cx, y: row.get(cap.id)!, w: cw })).sort((a, b) => a.y - b.y),
  };
}

const steps = (n: number[]) => n.length === 1 ? `step ${n[0]}` : `steps ${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;

/** The SVG of the graph; `lit` maps a capability to the numbers of the decision's steps that activate it. */
export function drawGraph(entries: Entry[], caps: Cap[], slug: string, lit: Map<string, number[]>): string {
  const l = layout(entries, caps, slug), at = new Map(l.caps.map(c => [c.cap.id, c])), mid = (v: number) => v + NODE / 2, on = (id: string) => lit.has(id);
  const right = l.caps.length ? l.caps[0].x + l.caps[0].w : 0;
  const arc = (a: PlacedCap, b: PlacedCap, cls: string, title: string) => {
    const dx = 24 + Math.min(Math.abs(a.y - b.y) / 5, 64);
    return `<path class="e ${cls}" d="M${right} ${mid(a.y)} C${right + dx} ${mid(a.y)} ${right + dx} ${mid(b.y)} ${right} ${mid(b.y)}"><title>${esc(title)}</title></path>`;
  };
  let edges = '', nodes = '';
  for (const e of l.entries) {
    const hot = e.entry.capabilities.some(id => at.has(id) && on(id));
    for (const id of e.entry.capabilities) {
      const c = at.get(id);
      if (c) edges += `<path class="e${on(id) ? ' on' : ''}" d="M${e.x + e.w} ${mid(e.y)} C${e.x + e.w + 40} ${mid(e.y)} ${c.x - 40} ${mid(c.y)} ${c.x} ${mid(c.y)}"/>`;
    }
    nodes += `<g class="n ent${hot ? ' on' : ''}" transform="translate(${e.x} ${e.y})"><title>${esc(e.entry.description)}</title><rect width="${e.w}" height="${NODE}" rx="6"/><text x="${PAD}" y="15">${esc(e.label)}</text></g>`;
  }
  const pairs = new Set<string>();
  for (const c of l.caps) {
    for (const n of c.cap.needs) { const to = at.get(n.capability); if (to) edges += arc(c, to, 'need' + (on(c.cap.id) && on(n.capability) ? ' on' : ''), `${c.cap.id} needs ${n.capability} when: ${n.label}`); }
    for (const other of c.cap.conflicts) {
      const to = at.get(other), key = [c.cap.id, other].sort().join('\u0000');
      if (to && !pairs.has(key)) { pairs.add(key); edges += arc(c, to, 'conf', `${c.cap.id} never runs with ${other}`); }
    }
    const numbers = lit.get(c.cap.id) ?? [], label = `Capability ${c.cap.id}${c.entry ? `, entry ${labelOf(c.entry, slug)}` : ''}${numbers.length ? `, ${steps(numbers)}` : ''}`;
    nodes += `<foreignObject class="n cap${numbers.length ? ' on' : ''}" x="${c.x}" y="${c.y}" width="${c.w}" height="${NODE}"><button type="button" id="gnode-${esc(c.cap.id)}" class="gnode${numbers.length ? ' on' : ''}" data-action="open-capability" data-id="${esc(c.cap.id)}" aria-label="${esc(label)}" title="${esc(c.cap.title)}"><span class="gname">${esc(c.cap.id)}</span>${numbers.length ? `<span class="gnum" aria-hidden="true">${numbers[0]}</span>` : ''}</button></foreignObject>`;
  }
  const any = l.caps.some(c => on(c.cap.id));
  return `<svg class="graph${any ? ' sim' : ''}" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}" role="group" aria-label="Decision graph: entries on the left, capabilities on the right">${edges}${nodes}</svg>`;
}
