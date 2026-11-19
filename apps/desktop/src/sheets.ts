import type { ViewState, Plan, Plugin, Target } from './types.ts';
import { esc, icon, plural, mark, button, spin } from './ui.ts';
import { harnessNames } from './model.ts';

/** The head of a sheet or dialog: the heading is the dialog's name (`openDialog` names it), the cross closes it. */
export const dlHead=(title:string,sub='',locked=false)=>`<div class="dlhead"><div><h2 id="dlg-title">${esc(title)}</h2>${sub?`<p class="muted">${esc(sub)}</p>`:''}</div><button type="button" class="iconbtn" data-close aria-label="Close" ${locked?'disabled':''}>${icon('x')}</button></div>`;

const KINDS:Record<string,string>={install:'Install',update:'Update',reinstall:'Reinstall',activate:'Activate',remove:'Remove'};
const tone=(kind:string)=>kind==='remove'?'bad':kind==='update'?'warn':'accent';
/** The review sheet: what a plan would change, harness by harness, and what it leaves out. `scope` is the harness a one-harness plan was made for; `running` is an apply in progress (`index` operations done), which locks the sheet. */
export function reviewSheet(state:ViewState,plan:Plan,running:{index:number}|null,scope:Target|null=null):string {
 const s=state.snapshot!,ops=plan.operations,removing=ops.filter(o=>o.kind==='remove').length;
 const sections=s.registry.targets.map(t=>({t,own:ops.filter(o=>o.target_id===t.id)})).filter(x=>x.own.length);
 const line=(o:Plan['operations'][number])=>{const i=ops.indexOf(o),st=running?(i<running.index?`<span class="good">${icon('check')}</span>`:spin):'';return `<li><span class="tag ${tone(o.kind)}">${esc(KINDS[o.kind]||o.kind)}</span><div><strong>${esc(o.name)}</strong><small>${o.kind==='remove'?`${esc(o.from_version)}${o.reason?` · ${esc(o.reason)}`:''}`:o.kind==='update'?`${esc(o.from_version)} → ${esc(o.to_version)}`:esc(o.to_version)}</small></div><span class="st">${st}</span></li>`;};
 return `<div class="dl">${dlHead(scope?`Sync ${scope.name}`:'Review changes',(scope?'Only the changes of this harness. ':'')+'Nothing changes until you apply.',!!running)}
 ${sections.map(({t,own})=>`<section class="ops"><h3>${mark(t.harness)}${esc(t.name)}</h3><ul>${own.map(line).join('')}</ul></section>`).join('')}
 ${!ops.length?'<p class="muted">No change is ready to apply.</p>':''}
 ${plan.blockers.length&&!running?`<section class="ops"><h3><span class="warn">${icon('alert')}</span>Not ready yet</h3><ul>${plan.blockers.map(b=>`<li><div><strong class="break">${esc(b)}</strong><small>It is left out of this sync.</small></div></li>`).join('')}</ul></section>`:''}
 ${state.error&&!running?`<p class="err" role="alert">${esc(state.error)}</p>`:''}
 <footer>${removing&&!running?`<small class="left">${plural(removing,'plugin')} will be uninstalled.</small>`:''}<button type="button" class="btn" data-close ${running?'disabled':''}>${ops.length?'Cancel':'Close'}</button>${ops.length?`<button type="button" class="btn primary" data-action="apply" autofocus ${running?'disabled':''}>${running?`Applying ${plural(ops.length,'change')}…`:`Apply ${plural(ops.length,'change')}`}</button>`:''}</footer></div>`;
}

/** A plugin's custom-instructions folder and files, as the plugin dialog shows them (Task 6 places it). */
export function instructionDetails(p:Plugin,state:ViewState):string {
 const instructions=state.snapshot?.custom_instructions?.find(i=>i.plugin_id===p.id),folder=instructions?.path||p.custom_instructions_dir,files=instructions?.files||[];
 return `<section class="notes" aria-label="Custom instructions">${instructions?.error?`<p class="err" role="alert">${esc(instructions.error)}</p>`:''}${instructions?.stale_harnesses.length?`<p class="warn">Instructions changed. Adapt again for: ${esc(instructions.stale_harnesses.map(h=>harnessNames[h]||h).join(', '))}.</p>`:''}<details id="instructions-${esc(p.id)}"><summary>Custom instructions · ${files.length?plural(files.length,'Markdown file'):'none yet'}</summary><p class="muted">Your own Markdown notes. The AI reads them with the source when it adapts this plugin.</p>${folder?`<p class="mono break">${esc(folder)}</p>`:''}${files.length?`<ul class="files">${files.map(file=>`<li class="mono break">${esc(file)}</li>`).join('')}</ul>`:''}<div class="acts">${button('Open folder','open-custom-instructions',{id:p.id})}${button('Reload files','refresh',{icon:'sync'})}</div></details></section>`;
}
