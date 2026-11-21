import { openMenu as imagoMenu, closeLayers, runFormOperation, appendRepeatedFieldRow, removeRepeatedFieldRow, replaceHtmlRegion, type MenuItem } from '@acaprino/imago/ui';
import type { ViewState, Snapshot, Plan, Plugin, Target, Discovered, CheckResult, Filter, Job } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import { cellState, harnessState, syncHeadline, sameOperations, filterPlugins, stamp, unlisted, listedPlugin, listing, currentPlan, engineOf } from '../model.ts';
import { esc, icon, plural, mark, sym, tag, spin, button, head, empty, seg } from '../ui.ts';
import { reviewSheet, pluginDialog, harnessSheet, adaptDialog, installedHere, instructionDetails } from '../sheets.ts';
import { distributionRow, readPlugin, readTarget, pluginErrors, targetErrors, showErrors, clearError, exclusiveSeg, signature, lastPart } from '../forms.ts';

const POLICY:Record<string,string>={stable:'Latest release',pinned:'Pinned version',head:'Latest commit'};
const CHANGE_WORDS:[string,string][]=[['install','install'],['update','update'],['reinstall','reinstall'],['activate','activation'],['remove','removal']];
const targetOf=(state:ViewState,id:string|undefined)=>state.snapshot?.registry.targets.find(t=>t.id===id);
const nameList=(names:string[])=>names.length>2?`${names[0]} and ${names.length-1} more`:names.join(' and ');
const message=(e:unknown)=>String(e instanceof Error?e.message:e);
const pluginOf=(state:ViewState,id:string|undefined)=>state.snapshot?.registry.plugins.find(p=>p.id===id);
const samePath=(a:string,b:string)=>{const flat=(p:string)=>p.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();return flat(a)===flat(b);};
/** The harnesses the computer was searched for that can be offered: found, and not managed already (the same kind of harness in the same folder). */
const foundHarnesses=(state:ViewState)=>state.discovered.filter(d=>d.available&&!state.snapshot!.registry.targets.some(t=>t.harness===d.harness&&!!d.config_root&&samePath(t.root,d.config_root)));

// ---------- the view ----------
/** The strip over the table: what the last check found, when, and the one next thing to do. */
function strip(state:ViewState):string {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),settings=s.registry.settings,last=s.sync.last_check,a=state.applying;
 let tone='',ico=icon('sync'),title='',text='',extra='',lead=false;
 const unreadable=h.unreadable.length?`${esc(nameList(h.unreadable.map(u=>u.target.name)))} cannot be read`:'';
 if(a){tone='accent';ico=spin;title=`Applying ${plural(a.total,'change')}…`;text=esc(a.name);}
 else if(state.checking){ico=spin;title='Checking sources and harnesses…';text='Reading what is installed and looking for new versions.';}
 else if(h.kind==='no-harness'){const found=foundHarnesses(state).find(d=>d.supported);tone='warn';ico=icon('alert');title='No harness is managed';text='Muro needs at least one harness to install plugins into.';extra=found?button(`Manage ${found.name}`,'manage-found',{id:found.harness,primary:true}):button('Add a harness','add-target',{primary:true});}
 else if(h.kind==='not-checked'){lead=true;title='Not checked yet';text='Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.';}
 else if(h.kind==='changes'){const parts=CHANGE_WORDS.filter(([k])=>h.byKind[k]).map(([k,w])=>plural(h.byKind[k],w)),bits=[parts.join(', '),h.blockers?`${plural(h.blockers,'item')} not ready yet`:'',unreadable,h.errors?`${plural(h.errors,'source')} could not be checked`:''].filter(Boolean);tone='accent';title=`${plural(h.operations,'change')} ready to apply`;text=`${bits.length?`${bits.join(' · ')}. `:''}Nothing changes until you apply.`;extra=button('Review','review')+button(`Apply all ${plural(h.operations,'change')}`,'apply-all',{primary:true});}
 else if(h.kind==='unreadable'){lead=true;tone='warn';ico=icon('alert');title=unreadable;text=h.unreadable.some(u=>!u.count)?'Muro could not read what is installed there, so it cannot say whether it is in sync. Check the harness settings, then check again.':'The custom instructions of a plugin on it could not be read, so it cannot say whether it is in sync. Check the plugin, then check again.';}
 else if(h.kind==='sources'){lead=true;tone='warn';ico=icon('alert');const one=h.errors===1;title=`${plural(h.errors,'source')} could not be checked`;text=`Muro could not resolve ${one?'it':'them'}, so it cannot say ${one?'it is':'they are'} up to date.${h.blockers?` ${plural(h.blockers,'item')} not ready yet.`:''} Check again when ${one?'it answers':'they answer'}.`;extra=h.blockers?button('Review','review'):'';}
 else if(h.kind==='blocked'){lead=true;tone='warn';ico=icon('alert');const b=currentPlan(s,state.plan)?.blockers||[];title='Some plugins are not ready';text=b.length?`${esc(b[0])}${b.length>1?` and ${b.length-1} more`:''}. Muro leaves them out until they are fixed.`:`${plural(h.blockers,'item')} ${h.blockers===1?'is':'are'} not ready yet. Muro leaves them out until they are fixed.`;extra=button('Review','review');}
 else{tone='good';ico=icon('check');title='Everything is in sync';text='What is installed on your harnesses matches your list.';}
 const next=settings.auto_sync?`Next check <b>${last&&/^\d+$/.test(last)?esc(stamp(String(Number(last)+settings.interval_minutes*60))):'soon'}</b>`:'Automatic sync off';
 return `<section class="im-summary" data-im-tone="${tone==='good'?'ok':tone}" aria-label="Sync state"><span class="im-summary-icon">${ico}</span><div class="im-grow"><strong>${title}</strong><small>${text}</small><small class="im-summary-meta"><span>Last check <b>${esc(stamp(last))}</b></span><span>Last sync <b>${esc(stamp(s.sync.last_sync))}</b></span><span>${next}</span></small></div>${button('Check now','check',{icon:'sync',primary:lead&&!a,busy:state.checking,disabled:state.checking||!!a})}${a?'':extra}</section>`;
}
/** One plugin on one harness, read by `cellState`: the installed version, or the change the plan holds for it. */
export function cell(state:ViewState,p:Plugin,t:Target):string {
 const c=cellState(p,t,state.snapshot!,state.plan);
 switch(c.kind){
  case 'ok':return `<span class="im-inline-cell im-tone-ok">${icon('check')}<span>${esc(c.to)}</span></span>`;
  case 'update':return tag(`Update ${c.from} → ${c.to}`,'warn');
  case 'install':return tag(`Install ${c.to}`,'accent');
  case 'reinstall':return tag(`Reinstall ${c.to}`,'accent');
  case 'activate':return tag(`Activate ${c.to}`,'accent');
  case 'remove':return tag(`Remove ${c.from}`,'bad');
  case 'needs-build':return tag('No version','warn');
  case 'unknown':return '<span class="im-muted">Unknown</span>';
  case 'paused':return '<span class="im-muted">Paused</span>';
  default:return '<span class="im-muted" aria-label="Not installed here">—</span>';
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
  case 'unseen':return tag('Check to see the changes','accent');
  default:return `<span class="im-inline-cell im-tone-ok">${icon('check')}<span>In sync</span></span>`;
 }
}
/** The rows of the table (a plugin per row), also what typing in the search repaints. */
export function rows(state:ViewState):string {
 const s=state.snapshot!,ts=s.registry.targets;
 return filterPlugins(s.registry.plugins,state.query,state.filter,s,state.plan).map(p=>`<tr><td><button type="button" class="im-btn im-btn--ghost im-record-button" data-action="open-plugin" data-id="${esc(p.id)}">${sym(p.name)}<span><strong>${esc(p.name)}</strong><small title="${esc(p.source)}">${esc(p.source)}</small></span></button></td><td><span class="im-text-stack"><strong>${esc(p.upstream_version||'Not checked')}</strong><small>${POLICY[p.policy]||''}</small></span></td>${ts.map(t=>`<td>${cell(state,p,t)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${ts.length+2}" class="im-muted im-none">No plugin matches.${state.query||state.filter!=='all'?' <button type="button" class="im-btn im-btn--ghost im-btn--sm" data-action="clear-filter">Clear the filter</button>':''}</td></tr>`;
}
function table(state:ViewState):string {
 const s=state.snapshot!;
 return `<div class="im-content-toolbar">${seg('filter',state.filter,[['all','All'],['action','Needs action']],'Filter plugins')}<label class="im-input">${icon('search')}<input id="search" type="text" placeholder="Search plugins" aria-label="Search plugins" value="${esc(state.query)}"><kbd class="im-key">/</kbd></label></div><div class="im-panel im-surface im-table-scroll" data-im-surface="sheet"><table class="im-table"><thead><tr><th scope="col"><div class="im-inline">Plugin</div><div class="im-cell-meta"><small>${plural(s.registry.plugins.length,'plugin')} in your list</small></div></th><th scope="col"><div class="im-inline">Latest version</div><div class="im-cell-meta"><small>Checked ${esc(stamp(s.sync.last_check))}</small></div></th>${s.registry.targets.map(t=>`<th scope="col"><div class="im-inline"><button type="button" class="im-btn im-btn--ghost im-btn--sm" data-action="edit-target" data-id="${esc(t.id)}" title="Harness settings">${mark(t.harness)}${esc(t.name)}</button></div><div class="im-cell-meta">${hstate(state,t)}</div><small title="Last sync ${esc(stamp(s.sync.targets[t.id]?.synced??null))}">Checked ${esc(stamp(s.sync.targets[t.id]?.checked??null))}</small></th>`).join('')}</tr></thead><tbody id="rows">${rows(state)}</tbody></table></div>`;
}
/** Add harness: the harnesses found on this computer, then by hand and a new search. Open or closed is the DOM's, see `openMenu`. */
function addHarnessMenu(state:ViewState):string {
 return button('Add harness','menu',{icon:'plus',attrs:{'aria-haspopup':'menu','aria-expanded':'false'}});
}
/** What is installed on a harness that Muro reads completely and that the list does not hold, and the one rule for all of it. What the rule does shows on each line before anything is applied. */
function unlistedSection(state:ViewState):string {
 const items=unlisted(state.snapshot!);if(!items.length)return '';
 return `<div class="im-section-heading"><h2>Installed, not in your list</h2><span class="im-count">${items.length}</span><span class="im-grow"></span>${exclusiveSeg(state.snapshot!.registry.targets)}</div><ul class="im-panel im-surface im-stack-list" data-im-surface="sheet">${items.map(({target:t,plugin:p})=>`<li>${mark(t.harness)}<div class="im-grow"><strong>${esc(p.name)}</strong><small>${esc(p.version)} · on ${esc(t.name)}</small></div>${t.exclusive?'<span class="im-chip" data-im-tone="err">Removed at the next sync</span>':'<small>Left alone</small>'}${button('Add to my list','add-to-list',{id:t.id,attrs:{'data-native':p.id}})}</li>`).join('')}</ul>`;
}
export function view(state:ViewState):string {
 return head('Sync','Rows are your plugins, columns are your harnesses. Muro keeps each harness in line with this table.',addHarnessMenu(state)+button('Add plugin','add-plugin',{icon:'plus'}))+strip(state)+(state.snapshot!.registry.plugins.length?table(state):empty('Your list is empty','Add a plugin by its source, or take one that is already installed from the list below.',button('Add plugin','add-plugin',{icon:'plus',primary:true})))+unlistedSection(state);
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

const closeMenu=(_refocus=false)=>closeLayers(['menu']);
async function rescan(app:App):Promise<void>{closeMenu(true);await app.run('Reading installed plugins…',()=>app.request<Snapshot>('scan'),v=>app.adopt(v));await app.replan();await app.discover();}
export function harnessMenuItems(app:App):MenuItem[] {
 const items:MenuItem[]=foundHarnesses(app.state).map(found=>({label:found.supported?'Manage '+found.name:found.name+' · no plugin support yet',disabled:found.supported?undefined:'Plugin installation is not supported by this harness',run:()=>editTarget(app,undefined,found)}));
 if(!items.length)items.push({label:app.state.discovering?'Looking for harnesses…':'No other harness found on this computer',disabled:'No unmanaged harness available',run:()=>{}});
 items.push('separator',{label:'Add by hand…',run:()=>editTarget(app)},{label:'Rescan this computer',run:()=>{void rescan(app).catch(error=>{app.state.error=message(error);app.render();});}});
 return items;
}

function harnessMenu(app:App,anchor:HTMLElement):void { imagoMenu(anchor,harnessMenuItems(app)); }

// ---------- the plugin dialog, the harness sheet and what they do ----------
/** Runs a request that a control of the open dialog started. A failure shows in the dialog's own error line (the page behind a modal cannot be seen), and a second click while it runs is ignored. From the page it is an ordinary `app.run`. */
async function attempt<T>(app:App,el:HTMLElement,label:string,work:()=>Promise<T>,after:(value:T)=>void|Promise<void>):Promise<void> {
 const dialog=el.closest('dialog');
 if(!dialog)return app.run(label,work,after);
 if(app.state.busy)return;
 const form=el.closest('form')??dialog;
 await runFormOperation(form,work,{error:dialog.querySelector<HTMLElement>('#form-error'),after,lockFields:true,current:()=>dialog.open&&dialog.contains(form),fallbackFocus:()=>form.querySelector<HTMLElement>('#installed-here')??dialog});
}
/** Saves what a dialog's form holds. It keeps the form, with its values, and says why when the save is refused; on success it closes and the registry the service returned is the app's. */
async function submit(app:App,dialog:HTMLDialogElement,form:HTMLFormElement,action:string,payload:Record<string,unknown>,done:string):Promise<void> {
 await runFormOperation(form,()=>app.request<Snapshot>(action,{...payload,revision:app.state.snapshot!.registry.revision}),{
  error:dialog.querySelector<HTMLElement>('#form-error'),lockFields:true,current:()=>dialog.open&&dialog.contains(form),
  after:saved=>{app.adopt(saved);app.closeDialog();app.notify(done,'good');}
 });
}
function editPlugin(app:App,plugin?:Plugin):void {
 const dialog=app.openDialog(pluginDialog(app.state,plugin)),form=dialog.querySelector<HTMLFormElement>('#plugin-form')!;
 form.dataset.initial=signature(form);
 form.onsubmit=e=>{e.preventDefault();const next=readPlugin(form,plugin);if(showErrors(form,pluginErrors(next)))void submit(app,dialog,form,'save_plugin',{plugin:next},'Saved.');};
}
function editTarget(app:App,target?:Target,found?:Discovered):void {
 const dialog=app.openDialog(harnessSheet(app.state,target,found),'sheet'),form=dialog.querySelector<HTMLFormElement>('#target-form')!;
 form.onsubmit=e=>{e.preventDefault();const next=readTarget(form,target);if(showErrors(form,targetErrors(next)))void submit(app,dialog,form,'save_target',{target:next},`${next.name} saved.`);};
}
/** The actions under More work on the saved plugin: with changes in the form that are not saved, they say so rather than drop them. */
function unsaved(el:HTMLElement):boolean {
 const form=el.closest<HTMLFormElement>('form');if(!form||form.dataset.initial===undefined||form.dataset.initial===signature(form))return false;
 const slot=form.querySelector('#form-error');if(slot)slot.textContent='Save your changes first: this acts on the saved plugin.';return true;
}
/** Check for updates: the service reads the source again. */
async function resolvePlugin(app:App,d:DOMStringMap,el:HTMLElement):Promise<void> {
 const p=pluginOf(app.state,d.id);if(!p||unsaved(el))return;
 await attempt(app,el,'Checking the source…',()=>app.request<Snapshot>('resolve',{id:p.id}),v=>{
  const version=v.registry.plugins.find(x=>x.id===p.id)?.upstream_version,found=!!version&&version!==p.upstream_version;
  app.adopt(v);app.closeDialog();app.notify(found?`${p.name} ${version} found.`:`${p.name}: no new version.`,found?'good':undefined);
 });
}
/** Plan a reinstall: the plan the service makes for it opens in the review sheet, and is applied from there. It is never the plan the strip and the columns read. */
async function reinstall(app:App,d:DOMStringMap,el:HTMLElement):Promise<void> {
 const p=pluginOf(app.state,d.id);if(!p||unsaved(el))return;
 await attempt(app,el,'Comparing with what is installed…',()=>app.request<Plan>('plan',{reinstall:p.id}),plan=>openReview(app,plan,null));
}
/** Adapt with AI: which harness and how much budget; the run itself goes on in Activity. */
function adapt(app:App,d:DOMStringMap,el:HTMLElement):void {
 const p=pluginOf(app.state,d.id);if(!p||unsaved(el))return;
 const dialog=app.openDialog(adaptDialog(app.state,p)),form=dialog.querySelector<HTMLFormElement>('#adapt-form')!;
 form.onsubmit=e=>{
  e.preventDefault();const data=new FormData(form),budget=Number(data.get('budget')),harness=String(data.get('harness'));
  if(engineOf(app.state.snapshot!.registry.settings).harness==='codex')return;   // the dialog says why and its Start is disabled: an Enter in a field starts nothing either
  if(!showErrors(form,Number.isFinite(budget)&&budget>0?{}:{budget:'Enter a budget above zero.'}))return;
  app.closeDialog();
  void app.run('Starting the AI adaptation…',async()=>{await app.request<Job>('adapt',{id:p.id,harness,agent:engineOf(app.state.snapshot!.registry.settings).harness,budget_usd:budget});return app.request<Snapshot>('snapshot');},v=>{app.adopt(v);app.notify('Started. Follow it in Activity.');});
 };
}
/** Paints the instructions section of the open plugin dialog again, keeping it open and, when the control that was used lives in it, the keyboard where it was. */
function repaintNotes(app:App,id:string,_from:HTMLElement,status=''):void {
 const notes=document.querySelector<HTMLElement>('dialog[open] .im-notes'),p=pluginOf(app.state,id);if(!notes||!p)return;
 const fresh=replaceHtmlRegion(notes,instructionDetails(p,app.state));
 const slot=fresh.querySelector('#notes-status');if(slot)slot.textContent=status;
}
/** Paints "Installed here" of the open harness sheet again, after something in it was added to the list. */
function repaintInstalled(app:App,id:string):void {
 const t=targetOf(app.state,id),section=document.querySelector<HTMLElement>('dialog[open] #installed-here');if(!t||!section)return;
 replaceHtmlRegion(section,installedHere(app.state,t),{fallbackFocus:()=>document.querySelector<HTMLElement>('dialog[open] #installed-here')});
}
/** Add to my list: an installed plugin becomes a plugin of the list, as `listedPlugin` says. One with no folder to point at has no source yet, so the plugin dialog opens for the person to give one. */
async function addToList(app:App,d:DOMStringMap,el:HTMLElement):Promise<void> {
 const t=targetOf(app.state,d.id),p=app.state.snapshot?.inventory.find(i=>i.target_id===d.id)?.plugins.find(x=>x.id===d.native);if(!t||!p)return;
 if(!p.path){editPlugin(app,{...listedPlugin(p,t),source:'',distributions:[]});return;}
 await attempt(app,el,'Updating your list…',()=>app.request<Snapshot>('save_plugin',listing(p,t,app.state.snapshot!.registry.revision)),v=>{app.adopt(v);app.notify(`${p.name} added to your list.`,'good');repaintInstalled(app,t.id);});
}
/** The service refuses to remove a harness that a plugin still lists, so the plugins that list it are saved without it first, one after the other, each with the revision the one before returned; then the harness goes. A failure says how many plugins were already taken off it, and those stay saved. */
async function stopManaging(app:App,t:Target):Promise<Snapshot> {
 let revision=app.state.snapshot!.registry.revision,last:Snapshot|undefined,detached=0;
 try{
  for(const p of app.state.snapshot!.registry.plugins.filter(p=>p.targets.includes(t.id))){
   last=await app.request<Snapshot>('save_plugin',{plugin:{...p,targets:p.targets.filter(id=>id!==t.id)},revision});revision=last.registry.revision;detached++;
  }
  return await app.request<Snapshot>('remove_target',{id:t.id,revision});
 }catch(e){if(last)app.adopt(last);throw new Error(`${detached?`${plural(detached,'plugin')} no longer ${detached===1?'lists':'list'} ${t.name}. `:''}${t.name} was not removed: ${message(e)}`);}
}
/** The one rule for plugins outside the list, for every harness: one `save_target` after the other, each with the revision the one before returned. A harness that has it already is not saved again. It stops at the first one that fails, says how many were saved, and the ones saved stay saved. */
async function setExclusive(app:App,mode:'keep'|'remove'):Promise<void> {
 const wanted=mode==='remove',targets=app.state.snapshot!.registry.targets.filter(t=>t.exclusive!==wanted);if(!targets.length)return;
 await app.run('Saving…',async()=>{
  let revision=app.state.snapshot!.registry.revision,last:Snapshot|undefined,saved=0;
  for(const t of targets){
   try{last=await app.request<Snapshot>('save_target',{target:{...t,exclusive:wanted},revision});revision=last.registry.revision;saved++;}
   catch(e){if(last)app.adopt(last);throw new Error(`${saved?`${plural(saved,'harness','harnesses')} saved. `:''}${t.name} was not saved: ${message(e)}`);}
  }
  return last!;
 },v=>{app.adopt(v);app.notify(wanted?'Saved. Plugins outside your list are uninstalled at the next sync.':'Saved. Plugins outside your list are left alone.','good');});
}

export const actions:Actions={
 check,review,apply:app=>{const r=app.state.review;return r?applyPlan(app,r.plan,targetOf(app.state,r.target_id??undefined)??null,true):undefined;},'apply-all':applyAll,
 'clear-filter':app=>{app.state.query='';app.state.filter='all';app.render();},
 menu:(app,_d,el)=>harnessMenu(app,el),
 'open-plugin':(app,d)=>{const p=pluginOf(app.state,d.id);if(p)editPlugin(app,p);},
 'add-plugin':app=>editPlugin(app),
 'add-target':app=>{closeMenu(true);editTarget(app);},
 'edit-target':(app,d)=>{const t=targetOf(app.state,d.id);if(t)editTarget(app,t);},
 'manage-found':(app,d)=>{closeMenu(true);editTarget(app,undefined,foundHarnesses(app.state).find(f=>f.harness===d.id));},
 'remove-target':(app,d)=>{const t=targetOf(app.state,d.id);if(t)app.confirm(`Stop managing ${t.name}?`,'Its plugins stay installed. Muro only stops syncing it.','Stop managing',()=>void app.run('Updating harnesses…',()=>stopManaging(app,t),v=>{app.adopt(v);app.notify(`Muro no longer manages ${t.name}.`);}),true);},
 'remove-plugin':(app,d)=>{const p=pluginOf(app.state,d.id);if(p)app.confirm(`Remove ${p.name} from your list?`,'It stays installed where it is, unless plugins outside your list are always uninstalled.','Remove',()=>void app.run('Updating your list…',()=>app.request<Snapshot>('remove_plugin',{id:p.id,revision:app.state.snapshot!.registry.revision}),v=>{app.adopt(v);app.notify(`${p.name} removed from your list.`);}),true);},
 'add-distribution':(_app,_d,el)=>{const rows=el.closest('form')?.querySelector<HTMLElement>('#distributions');if(rows)appendRepeatedFieldRow(rows,distributionRow(),{focusSelector:'select'});},
 'remove-distribution':(_app,_d,el)=>{const row=el.closest('.im-repeat-row'),add=el.closest('form')?.querySelector<HTMLElement>('[data-action=add-distribution]');if(row)removeRepeatedFieldRow(row,{focusSelector:'select',fallback:add});},
 'resolve-plugin':resolvePlugin,'reinstall-plugin':reinstall,'adapt-plugin':adapt,
 'open-custom-instructions':(app,d,el)=>attempt(app,el,'Opening the instructions folder…',async()=>{await app.request('open_custom_instructions',{id:d.id});return app.request<Snapshot>('snapshot');},v=>{app.adopt(v);repaintNotes(app,d.id!,el,'Folder opened. Edit the Markdown files, reload them, then adapt the plugin again.');}),
 'reload-instructions':(app,d,el)=>attempt(app,el,'Reading the instructions again…',()=>app.request<Snapshot>('snapshot'),v=>{app.adopt(v);repaintNotes(app,d.id!,el);}),
 'add-to-list':addToList,
 'set-exclusive':(app,d)=>d.id==='keep'||d.id==='remove'?setExclusive(app,d.id):undefined,
 rescan,
};
export function input(app:App,el:TextBox):boolean {
 if(el.id==='search'){
  // Only the rows are painted again: a full render would take the caret out of the box.
  app.state.query=el.value;const body=document.getElementById('rows');if(body)body.innerHTML=rows(app.state);return true;
 }
 if(!el.closest('dialog'))return false;
 clearError(el);
 // A new plugin is named after its source until a name is typed.
 const form=el.closest<HTMLFormElement>('#plugin-form');
 if(form&&el.name==='name')form.dataset.named='1';
 else if(form&&el.name==='source'&&!form.dataset.named){const name=form.querySelector<HTMLInputElement>('[name=name]');if(name){name.value=lastPart(el.value);clearError(name);}}
 return false;
}
export function change(app:App,el:TextBox):boolean {
 if(el.name==='filter'&&el.closest('.im-content-toolbar')){app.state.filter=el.value as Filter;app.render();return true;}
 if(el.name==='policy'&&el.closest('dialog')){const pinned=el.closest('dialog')!.querySelector<HTMLElement>('#pinned-field');if(pinned)pinned.hidden=el.value!=='pinned';return true;}
 if(el.name==='excl'){void setExclusive(app,el.value==='remove'?'remove':'keep');return true;}
 return false;
}
