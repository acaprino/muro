import type { Transport, ViewState, Snapshot, Discovered, Plan, Job, Page } from './types.ts';
import type { App, Actions } from './context.ts';
import { frame, modules } from './views.ts';
import { dlHead } from './sheets.ts';
import { watchTheme } from './look.ts';
import { esc } from './ui.ts';

/** State, the one render, focus and scroll kept across it, the event listeners. What a page does is in pages/*.ts: app.ts merges their actions and routes their events, and is not edited to add a page feature. */
export function mountApp(root:HTMLElement,request:Transport):()=>void {
 const state:ViewState={page:'sync',snapshot:null,discovered:[],discovering:false,plan:null,checking:false,applying:null,review:null,query:'',filter:'all',afilter:'all',busy:null,error:null,checkErrors:[],discoveryError:null,maintenance:null,autostart:null,setup:null};
 const dialog=document.createElement('dialog');dialog.tabIndex=-1;document.body.append(dialog);
 const toasts=document.createElement('div');toasts.id='toasts';toasts.setAttribute('role','status');toasts.setAttribute('aria-live','polite');document.body.append(toasts);
 let disposed=false,polling=false,planning:Promise<void>|null=null,again=false,confirmed:(()=>void)|null=null;
 // The control that had the keyboard is found again by what it does: `want` is its selector, `sel` the caret of a text box. `opener` is where a dialog was opened from.
 let want='',sel:[number,number]|null=null,opener='',sticky=false;
 const message=(e:unknown)=>String(e instanceof Error?e.message:e);
 const fail=(e:unknown)=>{state.error=message(e);render();};
 const stopTheme=watchTheme();

 const keyOf=(el:Element|null,within:Element):string=>{
  if(!(el instanceof HTMLElement)||el===within||!within.contains(el))return '';
  if(el.id)return '#'+CSS.escape(el.id);
  const parts=['data-action','data-id','name','value'].filter(a=>el.hasAttribute(a)&&(a!=='value'||/^(radio|checkbox)$/.test((el as HTMLInputElement).type))).map(a=>`[${a}="${CSS.escape(el.getAttribute(a)!)}"]`);
  return parts.length?el.localName+parts.join(''):'';
 };
 function render(){
  if(disposed)return;
  const active=document.activeElement;
  if(!dialog.open){
   const key=keyOf(active,root);
   if(sticky)sticky=false;
   else if(key&&key!=='#main'){want=key;sel=active instanceof HTMLInputElement&&active.selectionStart!==null?[active.selectionStart,active.selectionEnd??active.selectionStart]:null;}
   else if(key!=='#main')want='';
  }
  const opened=[...root.querySelectorAll('details[open][id]')].map(d=>d.id),top=root.querySelector('#main')?.scrollTop||0,across=root.querySelector('.tablewrap')?.scrollLeft||0;
  root.innerHTML=frame(state);
  opened.forEach(id=>document.getElementById(id)?.setAttribute('open',''));
  const main=root.querySelector<HTMLElement>('#main');if(main)main.scrollTop=top;const wrap=root.querySelector('.tablewrap');if(wrap)wrap.scrollLeft=across;
  if(state.busy)root.querySelectorAll<HTMLButtonElement>('button[data-action]:not([data-action=page])').forEach(b=>b.disabled=true);
  if(state.discovering)root.querySelectorAll<HTMLButtonElement>('button[data-action=rescan]').forEach(b=>b.disabled=true);
  if(want&&!dialog.open){
   // A control that became disabled cannot hold the focus: the page takes it, and gives it back at the next render.
   const el=root.querySelector<HTMLElement>(want),usable=el&&!(el as HTMLButtonElement).disabled?el:null;
   (usable||main)?.focus({preventScroll:true});
   if(usable&&sel&&usable instanceof HTMLInputElement)try{usable.setSelectionRange(sel[0],sel[1]);}catch{/* a box that holds no caret */}
  }
 }
 async function run<T>(label:string,work:()=>Promise<T>,after?:(value:T)=>void|Promise<void>):Promise<void>{
  if(state.busy)return;state.busy=label;state.error=null;render();
  try{const value=await work();await after?.(value);}catch(e){state.error=message(e);}finally{state.busy=null;render();}
 }
 // The shell sends the jobs and the data folder only with `snapshot`: a snapshot a mutation returns keeps the ones already held.
 function adopt(s:Snapshot){
  const before=state.snapshot;state.snapshot={...s,jobs:s.jobs??before?.jobs,data_dir:s.data_dir??before?.data_dir};
  if(before&&before.registry.revision!==s.registry.revision&&state.plan?.revision!==s.registry.revision)void replan();
 }
 const reload=()=>run('Reading your registry…',()=>request<Snapshot>('snapshot'),adopt);
 function replan():Promise<void>{
  if(planning){again=true;return planning;}
  planning=(async()=>{try{do{again=false;state.plan=await request<Plan>('plan');}while(again);}catch(e){state.error=message(e);}finally{planning=null;render();}})();
  return planning;
 }
 async function discover(){
  if(state.discovering)return;state.discovering=true;state.discoveryError=null;render();
  try{state.discovered=await request<Discovered[]>('discover');}catch(e){state.discoveryError=message(e);}finally{state.discovering=false;render();}
 }
 const notify=(text:string,tone?:'good'|'bad')=>{const t=document.createElement('div');t.className='toast '+(tone||'');t.textContent=text;toasts.append(t);setTimeout(()=>t.remove(),5000);};
 function openDialog(html:string,kind:'dialog'|'sheet'='dialog'):HTMLDialogElement{
  const was=dialog.open,key=was?keyOf(document.activeElement,dialog):'';
  if(!was)opener=keyOf(document.activeElement,root);
  dialog.className=kind==='sheet'?'sheet':'';dialog.innerHTML=html;
  const heading=dialog.querySelector('h1,h2');
  if(heading){heading.id||=`dlg-title`;dialog.setAttribute('aria-labelledby',heading.id);dialog.removeAttribute('aria-label');}else{dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','Dialog');}
  if(!was)dialog.showModal();
  else{const same=key?dialog.querySelector<HTMLElement>(key):null,usable=same&&!(same as HTMLButtonElement).disabled?same:null;(usable||dialog.querySelector<HTMLElement>('[autofocus]:not(:disabled)')||dialog).focus();}
  return dialog;
 }
 const closeDialog=()=>{if(dialog.open)dialog.close();};
 function confirm(title:string,text:string,ok:string,then:()=>void,danger=false){
  confirmed=then;
  openDialog(`<div class="dl">${dlHead(title,text)}<footer><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn ${danger?'danger':'primary'}" data-confirm autofocus>${esc(ok)}</button></footer></div>`);
 }
 const app:App={state,request,render,run,notify,reload,replan,adopt,discover,openDialog,closeDialog,confirm};

 const go=(page:Page)=>{state.page=page;render();void modules[page].opened?.(app);};
 const actions:Actions={page:(_app,d)=>{if(d.id==='sync'||d.id==='activity'||d.id==='settings')go(d.id);},refresh:()=>reload()};
 for(const [name,m] of Object.entries(modules))for(const [action,fn] of Object.entries(m.actions)){if(action in actions)throw new Error(`The action "${action}" of the ${name} page is already declared`);actions[action]=fn;}

 const click=(e:Event)=>{
  const el=(e.target as Element).closest<HTMLButtonElement>('button');if(!el||el.disabled)return;
  if(el.hasAttribute('data-close')){closeDialog();return;}
  if(el.hasAttribute('data-confirm')){const then=confirmed;confirmed=null;closeDialog();try{then?.();}catch(error){fail(error);}return;}
  const fn=el.dataset.action?actions[el.dataset.action]:undefined;if(!fn)return;
  e.preventDefault();void Promise.resolve().then(()=>fn(app,el.dataset,el)).catch(fail);
 };
 const route=(hook:'input'|'change')=>(e:Event)=>{const el=e.target;if(!(el instanceof HTMLInputElement||el instanceof HTMLSelectElement))return;for(const m of Object.values(modules))if(m[hook]?.(app,el))return;};
 root.addEventListener('click',click);root.addEventListener('input',route('input'));root.addEventListener('change',route('change'));
 dialog.addEventListener('click',e=>{if(e.target===dialog&&!state.applying)closeDialog();else click(e);});
 dialog.addEventListener('input',route('input'));dialog.addEventListener('change',route('change'));
 // An apply cannot be dismissed half way; any other dialog closes with Escape.
 dialog.addEventListener('cancel',e=>{if(state.applying)e.preventDefault();});
 dialog.addEventListener('close',()=>{confirmed=null;want=opener;sticky=true;render();});
 const keydown=(e:KeyboardEvent)=>{
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||dialog.open||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName||''))return;
  e.preventDefault();if(state.page!=='sync')go('sync');root.querySelector<HTMLInputElement>('#search')?.focus();
 };
 document.addEventListener('keydown',keydown);
 const jobTimer=setInterval(async()=>{
  if(polling||state.busy||dialog.open||!state.snapshot?.jobs?.some(j=>j.status==='running'))return;
  polling=true;
  try{const before=JSON.stringify(state.snapshot.jobs);state.snapshot.jobs=await request<Job[]>('jobs');let changed=false;if(!state.snapshot.jobs.some(j=>j.status==='running')){adopt(await request<Snapshot>('snapshot'));changed=true;}if(changed||JSON.stringify(state.snapshot?.jobs)!==before)render();}
  catch(e){fail(e);}finally{polling=false;}
 },3000);
 void reload().then(()=>{if(state.snapshot){void discover();void modules[state.page].opened?.(app);}});
 return ()=>{disposed=true;stopTheme();clearInterval(jobTimer);document.removeEventListener('keydown',keydown);dialog.remove();toasts.remove();root.replaceChildren();};
}
