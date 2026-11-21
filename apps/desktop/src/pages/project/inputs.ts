import type { ViewState, ProjectInfo, ProjectInput } from '../../types.ts';
import type { Actions } from '../../context.ts';
import { esc, plural, button } from '../../ui.ts';
import { textStackHtml, tableHtml, tableRowHtml, toolbarHtml, sectionHeadingHtml, stackListHtml, stackRowHtml } from '@acaprino/imago/ui';

/** What an input became, by form, in the words of the interface: only the forms that are used. */
function becameParts(input: ProjectInput): string[] {
  const n = input.became ?? {} as ProjectInput['became'];
  return [[n.capability, plural(n.capability, 'capability', 'capabilities')], [n['always-on'], `${n['always-on']} always on`], [n.hook, plural(n.hook, 'hook')], [n.dropped, `${n.dropped} dropped`]].filter(([count]) => Number(count) > 0).map(([, text]) => String(text));
}
/** How an input is pinned: its release (the published tag), its latest commit, or a frozen one; and what the pin resolved to. */
function pinned(input: ProjectInput): string {
  const commit = input.commit ? `@${input.commit.slice(0, 7)}` : 'not resolved yet';
  const [title, line] = input.pin === 'release' ? [input.release || 'Release', 'published release'] : input.pin === 'head' ? ['Latest commit', commit] : ['Frozen commit', commit];
  return textStackHtml(title,line);
}
function row(input: ProjectInput): string {
  const parts = becameParts(input);
  return tableRowHtml([textStackHtml(input.id,input.url||'Local source',{strong:true,detailTitle:input.url??''}),pinned(input),esc(input.license||'—'),
    parts.length?button(parts.join(' · '),'decisions-of',{id:input.id,sm:true,cls:'im-btn--ghost'}):'<span class="im-muted">Not harmonized yet</span>']);
}
/** Step 1: what goes in, and the custom instructions the file holds. Moving a pin and adding an input write the project: plan 3. */
export function view(_state: ViewState, info: ProjectInfo): string {
  const instructions = info.files.find(f => f.part === 'Your instructions')?.detail || 'None yet';
  return toolbarHtml('<div><h2>What goes in</h2><small>The plugins and skills this project absorbs, each pinned to a release or a commit.</small></div>')
    + tableHtml(['Input','Pinned to','License','What it became'],info.inputs.map(row).join(''),{variant:'inputs',empty:'No input yet.'})
    + sectionHeadingHtml('Custom instructions')+stackListHtml(stackRowHtml({title:instructions,detail:'Your own Markdown notes. The AI reads them with the inputs and decides how they fit.'}));
}
export const actions: Actions = {
  /** What an input became opens the choices of Harmonize, filtered to that input. */
  'decisions-of': (app, d) => { const pv = app.state.project; if (!pv || !d.id) return; pv.step = 'harmonize'; pv.view = 'choices'; pv.dsrc = d.id; pv.dform = 'all'; app.render(); },
};
