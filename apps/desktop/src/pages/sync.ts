import type { ViewState, Snapshot, Plan, Plugin, Target, Discovered, CheckResult, Filter } from '../types.ts';
import type { App, Actions } from '../context.ts';
import { cellState, harnessState, syncHeadline, sameOperations, filterPlugins, stamp } from '../model.ts';
import { esc, icon, plural, mark, sym, tag, spin, button, head, empty, seg } from '../ui.ts';
import { reviewSheet } from '../sheets.ts';
import { pluginForm, targetForm, distributionRow, readPlugin, readTarget } from '../forms.ts';

const POLICY:Record<string,string>={stable:'Latest release',pinned:'Pinned version',head:'Latest commit'};
const CHANGE_WORDS:[string,string][]=[['install','install'],['update','update'],['reinstall','reinstall'],['activate','activation'],['remove','removal']];
const targetOf=(state:ViewState,id:string|undefined)=>state.snapshot?.registry.targets.find(t=>t.id===id);
const nameList=(names:string[])=>names.length>2?`${names[0]} and ${names.length-1} more`:names.join(' and ');

// ---------- the view ----------
/** The strip over the table: what the last check found, when, and the one next thing to do. */
function strip(state:ViewState):string {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),settings=s.registry.settings,last=s.sync.last_check,a=state.applying;
 let tone='',ico=icon('sync'),title='',text='',extra='',lead=false;
 const unreadable=h.unreadable.length?`${esc(nameList(h.unreadable.map(u=>u.target.name)))} cannot be read`:'';
 if(a){tone='accent';ico=spin;title=`Applying ${plural(a.total,'change')}…`;text=esc(a.name);}
 else if(state.checking){ico=spin;title='Checking sources and harnesses…';text='Reading what is installed and looking for new versions.';}
 else if(h.kind==='no-harness'){const found=state.discovered.find(d=>d.available&&d.supported);tone='warn';ico=icon('alert');title='No harness is managed';text='Muro needs at least one harness to install plugins into.';extra=found?button(`Manage ${found.name}`,'manage-found',{id:found.harness,primary:true}):button('Add a harness','add-target',{primary:true});}
 else if(h.kind==='not-checked'){lead=true;title='Not checked yet';text='Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.';}
 else if(h.kind==='changes'){const parts=CHANGE_WORDS.filter(([k])=>h.byKind[k]).map(([k,w])=>plural(h.byKind[k],w));tone='accent';title=`${plural(h.operations,'change')} ready to apply`;text=`${parts.join(', ')}${h.blockers?` · ${plural(h.blockers,'item')} not ready yet`:''}${unreadable?` · ${unreadable}`:''}. Nothing changes until you apply.`;extra=button('Review','review')+button(`Apply all ${plural(h.operations,'change')}`,'apply-all',{primary:true});}
 else if(h.kind==='unreadable'){lead=true;tone='warn';ico=icon('alert');title=unreadable;text=h.unreadable.some(u=>!u.count)?'Muro could not read what is installed there, so it cannot say whether it is in sync. Check the harness settings, then check again.':'The custom instructions of a plugin on it could not be read, so it cannot say whether it is in sync. Check the plugin, then check again.';}
 else if(h.kind==='blocked'){lead=true;tone='warn';ico=icon('alert');const b=state.plan?.blockers||[];title='Some plugins are not ready';text=`${esc(b[0]||'')}${b.length>1?` and ${b.length-1} more`:''}. Muro leaves them out until they are fixed.`;extra=button('Review','review');}
 else{tone='good';ico=icon('check');title='Everything is in sync';text='What is installed on your harnesses matches your list.';}
 const next=settings.auto_sync?`Next check <b>${last&&/^\d+$/.test(last)?esc(stamp(String(Number(last)+settings.interval_minutes*60))):'soon'}</b>`:'Automatic sync off';
 return `<section class="strip ${tone}" aria-label="Sync state"><span class="sico">${ico}</span><div class="grow"><strong>${title}</strong><small>${text}</small><small class="meta"><span>Last check <b>${esc(stamp(last))}</b></span><span>Last sync <b>${esc(stamp(s.sync.last_sync))}</b></span><span>${next}</span></small></div>${button('Check now','check',{icon:'sync',primary:lead&&!a,busy:state.checking,disabled:state.checking||!!a})}${a?'':extra}</section>`;
}
/** One plugin on one harness, read by `cellState`: the installed version, or the change the plan holds for it. */
function cell(state:ViewState,p:Plugin,t:Target):string {
 const c=cellState(p,t,state.snapshot!,state.plan);
 switch(c.kind){
  case 'ok':return `<span class="cell ok">${icon('check')}<span>${esc(c.to)}</span></span>`;
  case 'update':return tag(`Update ${c.from} → ${c.to}`,'warn');
  case 'install':return tag(`Install ${c.to}`,'accent');
  case 'reinstall':return tag(`Reinstall ${c.to}`,'accent');
  case 'activate':return tag(`Activate ${c.to}`,'accent');
  case 'remove':return tag(`Remove ${c.from}`,'bad');
  case 'needs-build':return tag('No version','warn');
  case 'unknown':return '<span class="muted">Unknown</span>';
  case 'paused':return '<span class="muted">Paused</span>';
  default:return '<span class="muted" aria-label="Not installed here">—</span>';
 }
}
/** The state line under a harness name in the header. */
function hstate(state:ViewState,t:Target):string {
 const h=harnessState(t,state.snapshot!,state.plan);
 switch(h.kind){
  case 'paused':return tag('Paused');
  case 'changes':return button(`Sync ${plural(h.count,'change')}`,'review',{id:t.id,sm:true,accent:true,icon:'sync'});
  case 'needs-build':return tag(`${plural(h.count,'plugin')} without a version`,'warn');
  case 'unknown':return tag(h.count?`${plural(h.count,'plugin')} to check`:'Cannot be read','warn');
  default:return `<span class="cell ok">${icon('check')}<span>In sync</span></span>`;
 }
}
/** The rows of the table (a plugin per row), also what typing in the search repaints. */
export function rows(state:ViewState):string {
 const s=state.snapshot!,ts=s.registry.targets;
 return filterPlugins(s.registry.plugins,state.query,state.filter,s,state.plan).map(p=>`<tr><td><button type="button" class="pbtn" data-action="open-plugin" data-id="${esc(p.id)}">${sym(p.name)}<span><strong>${esc(p.name)}</strong><small title="${esc(p.source)}">${esc(p.source)}</small></span></button></td><td><span class="ver"><strong>${esc(p.upstream_version||'Not checked')}</strong><small>${POLICY[p.policy]||''}</small></span></td>${ts.map(t=>`<td>${cell(state,p,t)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${ts.length+2}" class="muted none">No plugin matches.${state.query||state.filter!=='all'?' <button type="button" class="link" data-action="clear-filter">Clear the filter</button>':''}</td></tr>`;
}
function table(state:ViewState):string {
 const s=state.snapshot!;
 return `<div class="tools">${seg('filter',state.filter,[['all','All'],['action','Needs action']],'Filter plugins')}<label class="search">${icon('search')}<input id="search" type="text" placeholder="Search plugins" aria-label="Search plugins" value="${esc(state.query)}"><kbd>/</kbd></label></div><div class="card tablewrap"><table><thead><tr><th scope="col"><div class="hcol">Plugin</div><div class="hstate"><small>${plural(s.registry.plugins.length,'plugin')} in your list</small></div></th><th scope="col"><div class="hcol">Latest version</div><div class="hstate"><small>Checked ${esc(stamp(s.sync.last_check))}</small></div></th>${s.registry.targets.map(t=>`<th scope="col"><div class="hcol"><button type="button" class="hbtn" data-action="edit-target" data-id="${esc(t.id)}" title="Harness settings">${mark(t.harness)}${esc(t.name)}</button></div><div class="hstate">${hstate(state,t)}</div><small title="Last sync ${esc(stamp(s.sync.targets[t.id]?.synced??null))}">Checked ${esc(stamp(s.sync.targets[t.id]?.checked??null))}</small></th>`).join('')}</tr></thead><tbody id="rows">${rows(state)}</tbody></table></div>`;
}
export function view(state:ViewState):string {
 const add=button('Add plugin','add-plugin',{icon:'plus'});
 return head('Sync','Rows are your plugins, columns are your harnesses. Muro keeps each harness in line with this table.',button('Add harness','add-target',{icon:'plus'})+add)+strip(state)+(state.snapshot!.registry.plugins.length?table(state):empty('Your list is empty','Add a plugin by its source, or take one that is already installed from the list below.',button('Add plugin','add-plugin',{icon:'plus',primary:true})));
}

// ---------- check, review, apply ----------
/** Check now: resolves the sources and plans. A source that failed shows in the banner; the plan stays. */
async function check(app:App){
 const {state}=app;if(state.busy)return;state.checking=true;state.checkErrors=[];
 try{await app.run('Checking sources and harnesses…',()=>app.request<CheckResult>('check'),r=>{state.plan=r.plan;state.checkErrors=r.errors;app.adopt(r.snapshot);});}
 finally{state.checking=false;app.render();}
}
/** Paints the review sheet of `state.review` (running while `state.applying`). */
function showReview(app:App){const {state}=app,r=state.review;if(r)app.openDialog(reviewSheet(state,r.plan,state.applying?{index:state.applying.index}:null,targetOf(state,r.target_id??undefined)??null),'sheet');}
function openReview(app:App,plan:Plan,target:Target|null){app.state.review={plan,target_id:target?.id??null};showReview(app);}
/** Review and Sync N changes: a fresh plan first. Only a whole plan becomes `state.plan`; the plan of one harness is for its sheet alone. */
async function review(app:App,data:DOMStringMap){
 const {state}=app,target=data.id?targetOf(state,data.id):null;if(data.id&&!target)return;let plan:Plan|undefined;
 await app.run('Comparing with what is installed…',()=>app.request<Plan>('plan',target?{target_id:target.id}:{}),p=>{plan=p;if(!target)state.plan=p;});
 if(plan)openReview(app,plan,target??null);
}
/** Applies a plan: the operations that are ready, and with blockers (`allow_blocked`) the rest is left out. Then the plan the strip reads is calculated again. */
async function applyPlan(app:App,plan:Plan,target:Target|null,sheet:boolean){
 const {state}=app;if(state.busy||!plan.operations.length)return;
 state.applying={index:0,total:plan.operations.length,name:[...new Set(plan.operations.map(o=>o.name))].join(', ')};state.review={plan,target_id:target?.id??null};
 if(sheet)showReview(app);
 let applied=false;
 try{await app.run('Syncing…',()=>app.request<Snapshot>('apply',{plan_id:plan.id,...(plan.blockers.length?{allow_blocked:true}:{})}),async v=>{
  applied=true;app.adopt(v);state.plan=null;state.review=null;if(sheet)app.closeDialog();await app.replan();
  app.notify(`${plural(plan.operations.length,'change')} applied.${v.left_out?.length?` ${v.left_out.length} left out.`:''}`,'good');});}
 finally{state.applying=null;}
 if(!applied&&sheet)showReview(app);
 app.render();
}
/** Apply all: a fresh plan first. It is applied at once only when it is what the strip showed and has no blocker; otherwise the review sheet opens, so nothing the person has not seen is applied. */
async function applyAll(app:App){
 const {state}=app;if(state.busy)return;const shown=state.plan;let fresh:Plan|undefined;
 await app.run('Comparing with what is installed…',()=>app.request<Plan>('plan'),p=>{fresh=p;state.plan=p;});
 if(!fresh)return;
 if(fresh.blockers.length||!fresh.operations.length||!sameOperations(shown,fresh))openReview(app,fresh,null);else await applyPlan(app,fresh,null,false);
}

// ---------- Interim (Task 5), until Task 6 replaces them: the plugin and harness forms as they were ----------
async function saveForm(app:App,dialog:HTMLDialogElement,action:string,payload:Record<string,unknown>){
 const form=dialog.querySelector('form');if(!form||form.getAttribute('aria-busy')==='true')return;
 const buttons=()=>form.querySelectorAll<HTMLButtonElement>('button'),error=dialog.querySelector('#form-error');
 form.setAttribute('aria-busy','true');buttons().forEach(b=>b.disabled=true);if(error)error.textContent='';
 try{app.adopt(await app.request<Snapshot>(action,{...payload,revision:app.state.snapshot!.registry.revision}));app.closeDialog();app.notify('Saved','good');}
 catch(e){if(error)error.textContent=String(e instanceof Error?e.message:e);}
 finally{form.removeAttribute('aria-busy');buttons().forEach(b=>b.disabled=false);}
}
function editPlugin(app:App,plugin?:Plugin){
 const dialog=app.openDialog(`<div class="dl">${pluginForm(app.state.snapshot!,plugin)}</div>`),form=dialog.querySelector('form')!;
 // A field the browser refuses inside closed Advanced would block Save with nothing to see.
 form.addEventListener('invalid',e=>(e.target as Element).closest('details')?.setAttribute('open',''),true);
 form.addEventListener('click',e=>{const b=(e.target as Element).closest('[data-remove-distribution]');if(b){e.preventDefault();b.closest('.distribution-row')?.remove();}});
 form.onsubmit=e=>{e.preventDefault();try{void saveForm(app,dialog,'save_plugin',{plugin:readPlugin(form,plugin)});}catch(error){dialog.querySelector('#form-error')!.textContent=String(error instanceof Error?error.message:error);}};
}
function editTarget(app:App,target?:Target,found?:Discovered){
 const dialog=app.openDialog(`<div class="dl">${targetForm(target,found)}</div>`),form=dialog.querySelector('form')!;
 form.onsubmit=e=>{e.preventDefault();void saveForm(app,dialog,'save_target',{target:readTarget(form,target)});};
}

export const actions:Actions={
 check,review,apply:app=>{const r=app.state.review;return r?applyPlan(app,r.plan,targetOf(app.state,r.target_id??undefined)??null,true):undefined;},'apply-all':applyAll,
 'clear-filter':app=>{app.state.query='';app.state.filter='all';app.render();},
 'open-plugin':(app,d)=>{const p=app.state.snapshot?.registry.plugins.find(p=>p.id===d.id);if(p)editPlugin(app,p);},
 'add-plugin':app=>editPlugin(app),
 'add-target':app=>editTarget(app),
 'edit-target':(app,d)=>{const t=targetOf(app.state,d.id);if(t)editTarget(app,t);},
 'manage-found':(app,d)=>editTarget(app,undefined,app.state.discovered.find(f=>f.harness===d.id)),
 'remove-target':(app,d)=>{const t=targetOf(app.state,d.id);if(t)app.confirm('Remove harness',`Muro stops managing ${t.name}. Plugins already installed there stay.`,'Remove',()=>void app.run('Updating harnesses…',()=>app.request<Snapshot>('remove_target',{id:t.id,revision:app.state.snapshot!.registry.revision}),v=>app.adopt(v)),true);},
 'add-distribution':(_app,_d,el)=>el.closest('dialog')?.querySelector('#distributions')?.insertAdjacentHTML('beforeend',distributionRow()),
 rescan:async app=>{await app.run('Reading installed plugins…',()=>app.request<Snapshot>('scan'),v=>app.adopt(v));await app.replan();await app.discover();},
};
export function input(app:App,el:HTMLInputElement|HTMLSelectElement):boolean {
 if(el.id!=='search')return false;
 // Only the rows are painted again: a full render would take the caret out of the box.
 app.state.query=el.value;const body=document.getElementById('rows');if(body)body.innerHTML=rows(app.state);return true;
}
export function change(app:App,el:HTMLInputElement|HTMLSelectElement):boolean {
 if(el.name==='filter'&&el.closest('.tools')){app.state.filter=el.value as Filter;app.render();return true;}
 if(el.name==='policy'&&el.closest('dialog')){const pinned=el.closest('dialog')!.querySelector<HTMLElement>('#pinned-field');if(pinned)pinned.hidden=el.value!=='pinned';return true;}
 return false;
}
