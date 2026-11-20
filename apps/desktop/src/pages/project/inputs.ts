import type { ViewState, ProjectInfo, ProjectInput } from '../../types.ts';
import type { Actions } from '../../context.ts';
import { esc, plural } from '../../ui.ts';

/** What an input became, by form, in the words of the interface: only the forms that are used. */
function becameParts(input: ProjectInput): string[] {
  const n = input.became ?? {} as ProjectInput['became'];
  return [[n.capability, plural(n.capability, 'capability', 'capabilities')], [n['always-on'], `${n['always-on']} always on`], [n.hook, plural(n.hook, 'hook')], [n.dropped, `${n.dropped} dropped`]].filter(([count]) => Number(count) > 0).map(([, text]) => String(text));
}
/** How an input is pinned: its release (the published tag), its latest commit, or a frozen one; and what the pin resolved to. */
function pinned(input: ProjectInput): string {
  const commit = input.commit ? `@${esc(input.commit.slice(0, 7))}` : 'not resolved yet';
  const [title, line] = input.pin === 'release' ? [esc(input.release || 'Release'), 'published release'] : input.pin === 'head' ? ['Latest commit', commit] : ['Frozen commit', commit];
  return `<span class="ver"><span>${title}</span><small>${line}</small></span>`;
}
function row(input: ProjectInput): string {
  const parts = becameParts(input);
  return `<tr><td><span class="ver"><strong>${esc(input.id)}</strong><small title="${esc(input.url ?? '')}">${input.url ? esc(input.url) : 'Local source'}</small></span></td><td>${pinned(input)}</td><td>${input.license ? esc(input.license) : '—'}</td><td>${parts.length ? `<button type="button" class="link" data-action="decisions-of" data-id="${esc(input.id)}">${esc(parts.join(' · '))}</button>` : '<span class="muted">Not harmonized yet</span>'}</td></tr>`;
}
/** Step 1: what goes in, and the custom instructions the file holds. Moving a pin and adding an input write the project: plan 3. */
export function view(_state: ViewState, info: ProjectInfo): string {
  const instructions = info.files.find(f => f.part === 'Your instructions')?.detail || 'None yet';
  return `<div class="tools"><div><h2>What goes in</h2><small>The plugins and skills this project absorbs, each pinned to a release or a commit.</small></div></div>`
    + `<div class="card tablewrap"><table class="pinputs"><thead><tr><th scope="col">Input</th><th scope="col">Pinned to</th><th scope="col">License</th><th scope="col">What it became</th></tr></thead><tbody>${info.inputs.map(row).join('') || '<tr><td colspan="4" class="muted none">No input yet.</td></tr>'}</tbody></table></div>`
    + `<div class="sec"><h2>Custom instructions</h2></div><ul class="card list"><li><div class="grow"><strong>${esc(instructions)}</strong><small>Your own Markdown notes. The AI reads them with the inputs and decides how they fit.</small></div></li></ul>`;
}
export const actions: Actions = {
  /** What an input became opens the choices of Harmonize, filtered to that input. */
  'decisions-of': (app, d) => { const pv = app.state.project; if (!pv || !d.id) return; pv.step = 'harmonize'; pv.view = 'choices'; pv.dsrc = d.id; pv.dform = 'all'; app.render(); },
};
