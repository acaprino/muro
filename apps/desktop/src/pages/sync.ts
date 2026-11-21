import { openMenu as imagoMenu, closeLayers, runFormOperation, appendRepeatedFieldRow, removeRepeatedFieldRow, replaceHtmlRegion, noteHtml, type MenuItem, type Tone } from '@acaprino/imago/ui';
import type { ViewState, Snapshot, Plan, Plugin, Target, Discovered, CheckResult, Filter, Job } from '../types.ts';
import type { App, Actions, TextBox } from '../context.ts';
import { surfaceOf, surfaceOpen } from '../context.ts';
import { cellState, harnessState, syncHeadline, mustReview, applyPayload, appliedNotice, filesMissing, filterPlugins, stamp, unlisted, listedPlugin, listing, currentPlan, engineOf, versionOf } from '../model.ts';
import { esc, icon, plural, mark, sym, tag, spin, button, head, empty, seg } from '../ui.ts';
import { reviewSheet, pluginPanel, harnessPanel, adaptDialog, installedHere, instructionDetails } from '../sheets.ts';
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
/** What the last check found and the one next thing to do: a note over the table (what it says), and the buttons of the action bar (what to do). */
interface Strip { tone: Tone | undefined; icon: string; title: string; text: string; lead: boolean; actions: string }
function stripOf(state:ViewState):Strip {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),a=state.applying;
 let tone:Tone|undefined,ico='sync',title='',text='',actions='',lead=false;
 const unreadable=h.unreadable.length?`${nameList(h.unreadable.map(u=>u.target.name))} cannot be read`:'';
 if(a){tone='info';ico='spinner';title=`Applying ${plural(a.total,'change')}…`;text=a.name;}
 else if(state.checking){ico='spinner';title='Checking sources and harnesses…';text='Reading what is installed and looking for new versions.';}
 else if(h.kind==='no-harness'){const found=foundHarnesses(state).find(d=>d.supported);tone='warn';ico='alert';title='No harness is managed';text='Muro needs at least one harness to install plugins into.';actions=found?button(`Manage ${found.name}`,'manage-found',{id:found.harness,primary:true}):button('Add a harness','add-target',{primary:true});}
 else if(h.kind==='not-checked'){lead=true;title='Not checked yet';text='Check now to compare your list with what is installed and to look for new versions. Nothing changes until you apply.';}
 else if(h.kind==='changes'){const parts=CHANGE_WORDS.filter(([k])=>h.byKind[k]).map(([k,w])=>plural(h.byKind[k],w)),bits=[parts.join(', '),h.blockers?`${plural(h.blockers,'item')} not ready yet`:'',unreadable,h.errors?`${plural(h.errors,'source')} could not be checked`:''].filter(Boolean);tone='info';title=`${plural(h.operations,'change')} ready to apply`;text=`${bits.length?`${bits.join(' · ')}. `:''}Nothing changes until you apply.`;actions=button('Review','review')+withCap(button(`Apply all ${plural(h.operations,'change')}`,'apply-all',{primary:true}),'data-muro-cap="Enter"');}
 else if(h.kind==='unreadable'){lead=true;tone='warn';ico='alert';title=unreadable;text=h.unreadable.some(u=>!u.count)?'Muro could not read what is installed there, so it cannot say whether it is in sync. Check the harness settings, then check again.':'The custom instructions of a plugin on it could not be read, so it cannot say whether it is in sync. Check the plugin, then check again.';}
 else if(h.kind==='sources'){lead=true;tone='warn';ico='alert';const one=h.errors===1;title=`${plural(h.errors,'source')} could not be checked`;text=`Muro could not resolve ${one?'it':'them'}, so it cannot say ${one?'it is':'they are'} up to date.${h.blockers?` ${plural(h.blockers,'item')} not ready yet.`:''} Check again when ${one?'it answers':'they answer'}.`;actions=h.blockers?button('Review','review'):'';}
 else if(h.kind==='blocked'){lead=true;tone='warn';ico='alert';const b=currentPlan(s,state.plan)?.blockers||[];title='Some plugins are not ready';text=b.length?`${b[0]}${b.length>1?` and ${b.length-1} more`:''}. Muro leaves them out until they are fixed.`:`${plural(h.blockers,'item')} ${h.blockers===1?'is':'are'} not ready yet. Muro leaves them out until they are fixed.`;actions=button('Review','review');}
 else{tone='ok';ico='check';title='Everything is in sync';text='What is installed on your harnesses matches your list.';}
 return {tone,icon:ico,title,text,lead,actions};
}
/** A key cap on a button: `attr` is an attribute of an empty span that the app fills from the registry after each paint (`fillKeys` in app.ts). */
const withCap=(html:string,attr:string)=>html.replace(/<\/button>$/,`<span ${attr} aria-hidden="true"></span></button>`);
const strip=(state:ViewState):string=>{const st=stripOf(state);return `<div id="sync-state">${noteHtml({icon:st.icon,title:st.title,message:st.text,tone:st.tone})}</div>`;};
/** The action bar of Sync: Check now always, then what the note says to do. At most one primary action. */
export function bar(state:ViewState):string {
 if(state.page!=='sync')return '';
 const st=stripOf(state),a=state.applying;
 return withCap(button('Check now','check',{icon:'sync',primary:st.lead&&!a,busy:state.checking,disabled:state.checking||!!a,attrs:state.checking?{'aria-busy':'true'}:undefined}),'data-muro-keys="muro.check"')+(a?'':st.actions);
}
/** What the last check could not do, as notes under the sync note: the sources it could not resolve, with their list, and the harness detection that failed. */
function problems(state:ViewState):string {
 const s=state.snapshot!,name=(id:string)=>s.registry.plugins.find(p=>p.id===id)?.name||id;
 return (state.checkErrors.length?noteHtml({title:`${plural(state.checkErrors.length,'source')} could not be checked`,items:state.checkErrors.map(e=>({label:name(e.plugin_id),message:e.message})),tone:'warn'}):'')
  +(state.discoveryError?noteHtml({title:'Harness detection failed',message:state.discoveryError,tone:'err'}):'');
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
  case 'remove':return tag(`Remove ${c.from}`,'err');
  case 'needs-build':return tag('Needs a build','warn');
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
  case 'changes':return button(`Sync ${plural(h.count,'change')}`,'review',{id:t.id,sm:true,icon:'sync'});
  case 'needs-build':return tag(`${plural(h.count,'plugin')} need${h.count===1?'s':''} a build`,'warn');
  case 'unknown':return tag(h.count?`${plural(h.count,'plugin')} to check`:'Cannot be read','warn');
  case 'unseen':return tag('Check to see the changes','accent');
  default:return `<span class="im-inline-cell im-tone-ok">${icon('check')}<span>In sync</span></span>`;
 }
}
/** The rows of the table (a plugin per row), also what typing in the search repaints. */
export function rows(state:ViewState):string {
 const s=state.snapshot!,ts=s.registry.targets;
 return filterPlugins(s.registry.plugins,state.query,state.filter,s,state.plan).map(p=>{const v=versionOf(p);return `<tr><td><button type="button" class="im-btn im-btn--ghost im-record-button" data-action="open-plugin" data-id="${esc(p.id)}">${sym(p.name)}<span><strong>${esc(p.name)}</strong><small title="${esc(p.source)}">${esc(p.source)}</small></span></button></td><td><span class="im-text-stack"><strong>${esc(v.version||'Not checked')}</strong><small>${POLICY[p.policy]||''}${v.commit?` · ${esc(v.commit)}`:''}</small></span></td>${ts.map(t=>`<td>${cell(state,p,t)}</td>`).join('')}</tr>`;}).join('')||`<tr><td colspan="${ts.length+2}" class="im-muted im-none">No plugin matches.${state.query||state.filter!=='all'?' <button type="button" class="im-btn im-btn--ghost im-btn--sm" data-action="clear-filter">Clear the filter</button>':''}</td></tr>`;
}
function table(state:ViewState):string {
 const s=state.snapshot!;
 return `<div class="im-content-toolbar">${seg('filter',state.filter,[['all','All'],['action','Needs action']],'Filter plugins')}<label class="im-input">${icon('search')}<input id="search" type="text" placeholder="Search plugins" aria-label="Search plugins" value="${esc(state.query)}"><span data-muro-keys="quick-search"></span></label></div><div class="im-panel im-surface im-table-scroll" data-im-surface="sheet"><table class="im-table"><thead><tr><th scope="col"><div class="im-inline">Plugin</div><div class="im-cell-meta"><small>${plural(s.registry.plugins.length,'plugin')} in your list</small></div></th><th scope="col"><div class="im-inline">Latest version</div><div class="im-cell-meta"><small>Checked ${esc(stamp(s.sync.last_check))}</small></div></th>${s.registry.targets.map(t=>`<th scope="col"><div class="im-inline"><button type="button" class="im-btn im-btn--ghost im-btn--sm" data-action="edit-target" data-id="${esc(t.id)}" title="Harness settings">${mark(t.harness)}${esc(t.name)}</button></div><div class="im-cell-meta">${hstate(state,t)}</div><small title="Last sync ${esc(stamp(s.sync.targets[t.id]?.synced??null))}">Checked ${esc(stamp(s.sync.targets[t.id]?.checked??null))}</small></th>`).join('')}</tr></thead><tbody id="rows">${rows(state)}</tbody></table></div>`;
}
/** Add harness: the harnesses found on this computer, then by hand and a new search. Open or closed is the DOM's, see `openMenu`. */
function addHarnessMenu(state:ViewState):string {
 return button('Add harness','menu',{icon:'plus',attrs:{'aria-haspopup':'menu','aria-expanded':'false'}});
}
/** What is installed on a harness that Muro reads completely and that the list does not hold, and the one rule for all of it. What the rule does shows on each line before anything is applied. */
function unlistedSection(state:ViewState):string {
 const items=unlisted(state.snapshot!);if(!items.length)return '';
 return `<div class="im-section-heading"><h2>Installed, not in your list</h2><span class="im-count">${items.length}</span><span class="im-grow"></span>${exclusiveSeg(state.snapshot!.registry.targets)}</div><ul class="im-panel im-surface im-stack-list" data-im-surface="sheet">${items.map(({target:t,plugin:p})=>`<li>${mark(t.harness)}<div class="im-grow"><strong>${esc(p.name)}</strong><small>${esc(p.version)} · on ${esc(t.name)}${filesMissing(p)}</small></div>${t.exclusive?'<span class="im-chip" data-im-tone="err">Removal waits for your confirmation</span>':'<small>Left alone</small>'}${button('Add to my list','add-to-list',{id:t.id,attrs:{'data-native':p.id}})}</li>`).join('')}</ul>`;
}
export function view(state:ViewState):string {
 return head('Sync','Rows are your plugins, columns are your harnesses. Muro keeps each harness in line with this table.',addHarnessMenu(state)+button('Add plugin','add-plugin',{icon:'plus'}))+strip(state)+problems(state)+(state.snapshot!.registry.plugins.length?table(state):empty('Your list is empty','Add a plugin by its source, or take one that is already installed from the list below.',button('Add plugin','add-plugin',{icon:'plus'})))+unlistedSection(state);
}

// ---------- check, review, apply ----------
/** Check now: resolves the sources and plans. A source that failed shows in the banner; the plan stays. */
async function check(app:App){
 const {state}=app;if(state.busy)return;state.checking=true;state.checkErrors=[];
 try{await app.run('Checking sources and harnesses…',()=>app.request<CheckResult>('check'),r=>{state.plan=r.plan;state.checkErrors=r.errors;app.adopt(r.snapshot);});}
 finally{state.checking=false;app.render();}
}
/** Paints the review sheet of `state.review` (running while `state.applying`). */
function showReview(app:App){const {state}=app,r=state.review;if(r)app.openDialog(reviewSheet(state,r.plan,state.applying?{index:state.applying.index}:null,targetOf(state,r.target_id??undefined)??null));}
function openReview(app:App,plan:Plan,target:Target|null){app.state.review={plan,target_id:target?.id??null};showReview(app);}
/** Review and Sync N changes: a fresh plan first. Only a whole plan becomes `state.plan`; the plan of one harness is for its sheet alone. */
async function review(app:App,data:DOMStringMap){
 const {state}=app,target=data.id?targetOf(state,data.id):null;if(data.id&&!target)return;let plan:Plan|undefined;
 await app.run('Comparing with what is installed…',()=>app.request<Plan>('plan',target?{target_id:target.id}:{}),p=>{plan=p;if(!target)state.plan=p;});
 if(plan)openReview(app,plan,target??null);
}
/** Applies a plan: the operations that are ready, and with blockers (`allow_blocked`) the rest is left out. A plan with removals is applied with the person's choice (`applyPayload`): `confirm` uninstalls and clears them, `skip` leaves them out and applies the rest. Then the plan the strip reads is calculated again. */
async function applyPlan(app:App,plan:Plan,target:Target|null,sheet:boolean,choice:'confirm'|'skip'='confirm'){
 const {state}=app,executed=plan.operations.filter(o=>choice==='confirm'||o.kind!=='remove');if(state.busy||!executed.length)return;
 state.applying={index:0,total:executed.length,name:[...new Set(executed.map(o=>o.name))].join(', ')};state.review={plan,target_id:target?.id??null};
 if(sheet)showReview(app);
 let applied=false;
 try{await app.run('Syncing…',()=>app.request<Snapshot>('apply',applyPayload(plan,choice)),async v=>{
  const skipped=v.skipped_removals??0;
  applied=true;app.adopt(v);state.plan=null;state.review=null;if(sheet)app.closeDialog();await app.replan();
  app.notify(`${appliedNotice(plan.operations.length-skipped,skipped)}${v.left_out?.length?` ${v.left_out.length} left out.`:''}`);});}
 finally{state.applying=null;}
 if(!applied&&sheet)showReview(app);
 app.render();
}
/** Apply all: a fresh plan first. It is applied at once only when it is what the strip showed, has no blocker and no removal; otherwise the review sheet opens, so nothing the person has not seen is applied and no removal is applied without the person's confirmation. */
async function applyAll(app:App){
 const {state}=app;if(state.busy)return;const shown=state.plan;let fresh:Plan|undefined;
 await app.run('Comparing with what is installed…',()=>app.request<Plan>('plan'),p=>{fresh=p;state.plan=p;});
 if(!fresh)return;
 if(mustReview(shown,fresh))openReview(app,fresh,null);else await applyPlan(app,fresh,null,false);
}

const closeMenu=(_refocus=false)=>closeLayers(['menu']);
async function rescan(app:App):Promise<void>{closeMenu(true);await app.run('Reading installed plugins…',()=>app.request<Snapshot>('scan'),v=>app.adopt(v));await app.replan();await app.discover();}
export function harnessMenuItems(app:App,anchor?:HTMLElement):MenuItem[] {
 const items:MenuItem[]=foundHarnesses(app.state).map(found=>({label:found.supported?'Manage '+found.name:found.name+' · no plugin support yet',disabled:found.supported?undefined:'Plugin installation is not supported by this harness',run:()=>editTarget(app,undefined,found,anchor)}));
 if(!items.length)items.push({label:app.state.discovering?'Looking for harnesses…':'No other harness found on this computer',disabled:'No unmanaged harness available',run:()=>{}});
 items.push('separator',{label:'Add by hand…',run:()=>editTarget(app,undefined,undefined,anchor)},{label:'Rescan this computer',run:()=>{void rescan(app).catch(error=>{app.notify(message(error),'err');});}});
 return items;
}

function harnessMenu(app:App,anchor:HTMLElement):void { imagoMenu(anchor,harnessMenuItems(app,anchor)); }

// ---------- the plugin dialog, the harness sheet and what they do ----------
/** Runs a request that a control of the open dialog started. A failure shows in the dialog's own error line (the page behind a modal cannot be seen), and a second click while it runs is ignored. From the page it is an ordinary `app.run`. */
async function attempt<T>(app:App,el:HTMLElement,label:string,work:()=>Promise<T>,after:(value:T)=>void|Promise<void>):Promise<void> {
 const surface=surfaceOf(el);
 if(!surface)return app.run(label,work,after);
 if(app.state.busy)return;
 const form=el.closest('form')??surface;
 await runFormOperation(form,work,{error:surface.querySelector<HTMLElement>('#form-error'),after,lockFields:true,current:()=>surfaceOpen(surfaceOf(form)),fallbackFocus:()=>form.querySelector<HTMLElement>('#installed-here')??surface});
}
/** Saves what the form of the inspector holds. It keeps the form, with its values, and says why when the save is refused; on success it closes (without asking: what was typed is saved) and the registry the service returned is the app's. */
async function submit(app:App,form:HTMLFormElement,action:string,payload:Record<string,unknown>,done:string):Promise<void> {
 await runFormOperation(form,()=>app.request<Snapshot>(action,{...payload,revision:app.state.snapshot!.registry.revision}),{
  error:form.querySelector<HTMLElement>('#form-error'),lockFields:true,current:()=>surfaceOpen(surfaceOf(form)),
  after:saved=>{app.adopt(saved);app.closeInspector(true);app.notify(done);}
 });
}
function editPlugin(app:App,plugin?:Plugin,opener?:HTMLElement):void {
 let form!:HTMLFormElement;
 form=app.openInspector(pluginPanel(app.state,plugin),{opener,name:plugin?.name||'the new plugin',dirty:()=>signature(form)!==form.dataset.initial}) as HTMLFormElement;
 form.dataset.initial=signature(form);
 form.onsubmit=e=>{e.preventDefault();const next=readPlugin(form,plugin);if(showErrors(form,pluginErrors(next)))void submit(app,form,'save_plugin',{plugin:next},'Saved.');};
}
function editTarget(app:App,target?:Target,found?:Discovered,opener?:HTMLElement):void {
 let form!:HTMLFormElement;
 form=app.openInspector(harnessPanel(app.state,target,found),{opener,name:target?.name||found?.name||'the new harness',dirty:()=>signature(form)!==form.dataset.initial}) as HTMLFormElement;
 form.dataset.initial=signature(form);
 form.onsubmit=e=>{e.preventDefault();const next=readTarget(form,target);if(showErrors(form,targetErrors(next)))void submit(app,form,'save_target',{target:next},`${next.name} saved.`);};
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
  const after=v.registry.plugins.find(x=>x.id===p.id),version=after?versionOf(after).version:'',found=!!after?.upstream_revision&&after.upstream_revision!==p.upstream_revision;
  app.adopt(v);app.closeInspector(true);app.notify(found?`${p.name} ${version} found.`:`${p.name}: no new version.`);
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
  app.closeDialog();app.closeInspector(true);   // the plugin is under adaptation now: its form does not stay open beside the page
  void app.run('Starting the AI adaptation…',async()=>{await app.request<Job>('adapt',{id:p.id,harness,agent:engineOf(app.state.snapshot!.registry.settings).harness,budget_usd:budget});return app.request<Snapshot>('snapshot');},v=>{app.adopt(v);app.notify('Started. Follow it in Activity.');});
 };
}
/** Paints the instructions section of the open plugin dialog again, keeping it open and, when the control that was used lives in it, the keyboard where it was. */
function repaintNotes(app:App,id:string,_from:HTMLElement,status=''):void {
 const notes=document.querySelector<HTMLElement>('.im-inspector .im-notes'),p=pluginOf(app.state,id);if(!notes||!p)return;
 const fresh=replaceHtmlRegion(notes,instructionDetails(p,app.state));
 const slot=fresh.querySelector('#notes-status');if(slot)slot.textContent=status;
}
/** Paints "Installed here" of the open harness sheet again, after something in it was added to the list. */
function repaintInstalled(app:App,id:string):void {
 const t=targetOf(app.state,id),section=document.querySelector<HTMLElement>('.im-inspector #installed-here');if(!t||!section)return;
 replaceHtmlRegion(section,installedHere(app.state,t),{fallbackFocus:()=>document.querySelector<HTMLElement>('.im-inspector #installed-here')});
}
/** Add to my list: an installed plugin becomes a plugin of the list, as `listedPlugin` says. One with no folder to point at has no source yet, so the plugin dialog opens for the person to give one. */
async function addToList(app:App,d:DOMStringMap,el:HTMLElement):Promise<void> {
 const t=targetOf(app.state,d.id),p=app.state.snapshot?.inventory.find(i=>i.target_id===d.id)?.plugins.find(x=>x.id===d.native);if(!t||!p)return;
 if(!p.path){editPlugin(app,{...listedPlugin(p,t),source:'',distributions:[]},el);return;}
 await attempt(app,el,'Updating your list…',()=>app.request<Snapshot>('save_plugin',listing(p,t,app.state.snapshot!.registry.revision)),v=>{app.adopt(v);app.notify(`${p.name} added to your list.`);repaintInstalled(app,t.id);});
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
 },v=>{app.adopt(v);app.notify(wanted?'Saved. Muro will ask before it uninstalls plugins outside your list.':'Saved. Plugins outside your list are left alone.');});
}

/** The sheet's own buttons: the plan it shows is applied, with its removals confirmed (`apply`) or left out (`apply-keep`). */
const applyReview=(choice:'confirm'|'skip'):Actions[string]=>app=>{const r=app.state.review;return r?applyPlan(app,r.plan,targetOf(app.state,r.target_id??undefined)??null,true,choice):undefined;};
export const actions:Actions={
 check,review,apply:applyReview('confirm'),'apply-keep':applyReview('skip'),'apply-all':applyAll,
 'clear-filter':app=>{app.state.query='';app.state.filter='all';app.render();},
 menu:(app,_d,el)=>harnessMenu(app,el),
 'open-plugin':(app,d,el)=>{const p=pluginOf(app.state,d.id);if(p)editPlugin(app,p,el);},
 'add-plugin':(app,_d,el)=>editPlugin(app,undefined,el),
 'add-target':(app,_d,el)=>{closeMenu(true);editTarget(app,undefined,undefined,el);},
 'edit-target':(app,d,el)=>{const t=targetOf(app.state,d.id);if(t)editTarget(app,t,undefined,el);},
 'manage-found':(app,d,el)=>{closeMenu(true);editTarget(app,undefined,foundHarnesses(app.state).find(f=>f.harness===d.id),el);},
 'close-inspector':app=>app.closeInspector(),
 'remove-target':(app,d)=>{const t=targetOf(app.state,d.id);if(t)app.confirm(`Stop managing ${t.name}?`,'Its plugins stay installed. Muro only stops syncing it.',`Stop managing ${t.name}`,()=>void app.run('Updating harnesses…',()=>stopManaging(app,t),v=>{app.adopt(v);app.closeInspector(true);app.notify(`Muro no longer manages ${t.name}.`);}),true);},
 'remove-plugin':(app,d)=>{const p=pluginOf(app.state,d.id);if(p)app.confirm(`Remove ${p.name} from your list?`,'It stays installed where it is, unless plugins outside your list are always uninstalled.',`Remove ${p.name}`,()=>void app.run('Updating your list…',()=>app.request<Snapshot>('remove_plugin',{id:p.id,revision:app.state.snapshot!.registry.revision}),v=>{app.adopt(v);app.closeInspector(true);app.notify(`${p.name} removed from your list.`);}),true);},
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
 if(!surfaceOf(el))return false;
 clearError(el);
 // A new plugin is named after its source until a name is typed.
 const form=el.closest<HTMLFormElement>('#plugin-form');
 if(form&&el.name==='name')form.dataset.named='1';
 else if(form&&el.name==='source'&&!form.dataset.named){const name=form.querySelector<HTMLInputElement>('[name=name]');if(name){name.value=lastPart(el.value);clearError(name);}}
 return false;
}
export function change(app:App,el:TextBox):boolean {
 if(el.name==='filter'&&el.closest('.im-content-toolbar')){app.state.filter=el.value as Filter;app.render();return true;}
 if(el.name==='policy'&&surfaceOf(el)){const pinned=surfaceOf(el)!.querySelector<HTMLElement>('#pinned-field');if(pinned)pinned.hidden=el.value!=='pinned';return true;}
 if(el.name==='excl'){void setExclusive(app,el.value==='remove'?'remove':'keep');return true;}
 return false;
}
