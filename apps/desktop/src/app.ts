import { closeLayers, createRegistry, hasModal, notify as notice, clearNotices, createContentDialog, confirm as confirmDialog, renderShellFrame, captureDomState, restoreDomState, restoreFocus, type FocusSnapshot, openMenu, roving, loader, inspector, isFormOperationPending, keyCaps, mountApp, PALETTE_COMMAND, SEARCH_COMMAND, footerKeys, showAfter, LOADING_DELAY_MS } from '@acaprino/imago/ui';
import { graphView, type GraphViewport } from '@acaprino/imago/graph';
import { guardDesktop, mountZoom, mountWindowControls, type WindowApi } from '@acaprino/imago/shell';
import type { Transport, ViewState, Snapshot, Discovered, Plan, Job, Page } from './types.ts';
import type { App, Actions } from './context.ts';
import { textBoxOf } from './context.ts';
import { frame, modules } from './views.ts';
import { watchTheme, currentLook, currentTheme, saveAppearance } from './look.ts';
import { serial, ALONE } from './queue.ts';
import { needed as setupNeeded } from './pages/setup.ts';
import { blankProjects, recall, remember } from './pages/project/state.ts';
import { sceneFor, decisionGraphOptions } from './pages/project/graph.ts';

const PAGES=['projects','sync','activity','settings'] as const;
const tabLabel=(page:Page)=>page[0].toUpperCase()+page.slice(1);
/** How often the open window reads the registry again while it has the focus: the background worker and the tray change it behind the window's back. */
export const REFRESH_MS=30_000;

/** State, the one render, focus and scroll kept across it, the event listeners. What a page does is in pages/*.ts: app.ts merges their actions and routes their events, and is not edited to add a page feature. */
export function startMuro(root:HTMLElement,transport:Transport,shown?:(wake:()=>void)=>()=>void):()=>void {
 const request=serial(transport,ALONE);
 const state:ViewState={page:'sync',snapshot:null,discovered:[],discovering:false,plan:null,checking:false,applying:null,review:null,query:'',filter:'all',afilter:'all',busy:null,slow:{},error:null,checkErrors:[],discoveryError:null,maintenance:null,autostart:null,setup:null,projects:blankProjects(),project:recall()};
 root.classList.add('im-shell');root.dataset.imSidebar='off';root.dataset.imInspector='wide';renderShellFrame(root,frame(state));
 const titlebar=root.querySelector<HTMLElement>('.im-titlebar')!,body=root.querySelector<HTMLElement>('.im-body')!;
 const dialogView=createContentDialog(root,{canDismiss:()=>!state.applying,onClose:()=>render(),fallbackFocus:()=>root.querySelector<HTMLElement>('#main')});
 const dialog=dialogView.element;
 const registry=createRegistry();
 let nativeApi:WindowApi|undefined,stopWindow=()=>{},stopZoom=()=>{},stopGuard=()=>{},stopTabs=()=>{},stopSteps=()=>{};
 const wireWindow=()=>{stopWindow();if(nativeApi)stopWindow=mountWindowControls(titlebar,nativeApi,{onError:(what,error)=>notify(what+': '+message(error),'err')});};
 let disposed=false,polling=false,planning:Promise<void>|null=null,again=false;
 let wantedFocus:FocusSnapshot|null=null;
 const viewports=new Map<string,GraphViewport>();
 let mountedGraph:ReturnType<typeof graphView>|null=null,graphProject='';
 const stopGraph=()=>{if(mountedGraph){viewports.set(graphProject,mountedGraph.viewport());mountedGraph.dispose();mountedGraph=null;}};
 const message=(e:unknown)=>String(e instanceof Error?e.message:e);
 // A failed operation is a notice with Reload; the review dialog says it in its own line (state.error), and the panel of a registry that could not be read in its own state.
 const report=(e:unknown)=>{state.error=message(e);if(!(state.review&&dialog.open))notify(`That did not complete: ${state.error}`,'err',{label:'Reload',run:()=>void reload()});};
 const fail=(e:unknown)=>{report(e);render();};
 const stopTheme=watchTheme();

 /** The key caps of the app come from the registry: the title bar's command button, and every element that names a command. */
 function fillKeys(){
  const keys=registry.get(PALETTE_COMMAND)?.keys,button=root.querySelector<HTMLElement>('.im-titlebar-command');
  if(keys&&button&&!button.querySelector('.im-keys'))button.append(keyCaps(document,keys));
  root.querySelectorAll<HTMLElement>('[data-muro-keys]').forEach(el=>{const bound=registry.get(el.dataset.muroKeys!)?.keys;if(bound)el.replaceChildren(keyCaps(document,bound));});
  root.querySelectorAll<HTMLElement>('[data-muro-cap]').forEach(el=>el.replaceChildren(keyCaps(document,el.dataset.muroCap!)));
  // The footer lists the keys that work on the page: search only where there is something to search.
  root.querySelectorAll<HTMLElement>('[data-muro-footer]').forEach(el=>el.replaceWith(footerKeys(document,registry,[PALETTE_COMMAND,...(el.dataset.muroFooter==='sync'?[SEARCH_COMMAND]:[]),'muro.check'])));
 }

 function render(){
  if(disposed)return;
  const dom=captureDomState(root,{scroll:['#main > .im-panel-body','.im-table-scroll']});
  if(!hasModal()){
   if(document.activeElement?.id!=='main')wantedFocus=dom.focus;
  }
  stopGraph();
  closeLayers(['menu','sheet']);
  stopTabs();stopSteps();renderShellFrame(root,frame(state));
  const tabs=titlebar.querySelector<HTMLElement>('.im-tabs');if(tabs)stopTabs=roving(tabs,{item:'.im-tab',orientation:'horizontal',onSelect:el=>el.click()});
  wireWindow();remember(state.project);
  fillKeys();
  // The steps of a project are a tablist of one tab stop: the arrows, Home and End move the focus along them, and the tab the focus reaches is the one shown.
  const steps=root.querySelector<HTMLElement>('.im-steps');if(steps){stopSteps=roving(steps,{item:'[role=tab]',orientation:'horizontal',onSelect:el=>el.click()});steps.addEventListener('focusin',e=>{const tab=(e.target as HTMLElement).closest<HTMLElement>('[role=tab]');if(tab&&tab.getAttribute('aria-selected')!=='true'&&tab.matches(':focus-visible'))tab.click();});}
  // The running operation shows at the top of the content: the frame is strings, the loader an element of the package.
  // The running operation shows in the status row once it has lasted LOADING_DELAY_MS (state.slow): the loader of the package, painted after the strings.
  if(state.slow.busy&&state.busy&&!state.checking&&!state.applying)root.querySelector<HTMLElement>('.im-status .im-status-text')?.after(loader(document,state.busy));
  const host=body.querySelector<HTMLElement>('[data-project-graph]');
  if(host&&state.project&&state.projects.info&&state.projects.infoId===state.project.id){
   graphProject=state.project.id;
   host.inert=!!state.busy;
   mountedGraph=graphView(host,decisionGraphOptions(id=>{if(state.busy||hasModal())return;const action=actions['open-capability'];if(action)void Promise.resolve(action(app,{id},(document.activeElement&&host.contains(document.activeElement)?document.activeElement:host) as HTMLElement)).catch(fail);}));
   mountedGraph.draw(sceneFor(state,state.projects.info));
   const viewport=viewports.get(graphProject);if(viewport)mountedGraph.restoreViewport(viewport);
  }
  restoreDomState(root,dom,{focus:false});
  const main=root.querySelector<HTMLElement>('#main');
  if(state.busy)root.querySelectorAll<HTMLButtonElement>('button[data-action]:not([data-action=page])').forEach(b=>{if(!b.closest('.im-inspector'))b.disabled=true;});
  if(state.discovering)root.querySelectorAll<HTMLButtonElement>('button[data-action=rescan]').forEach(b=>b.disabled=true);
  if(wantedFocus&&!hasModal())restoreFocus(root,wantedFocus,{fallback:main});
 }
/** Under LOADING_DELAY_MS nothing shows; after it the page paints what is slow (the loader of the status row, a panel's loading layer). */
 async function loading<T>(key:string,work:()=>Promise<T>):Promise<T>{
  const stop=showAfter(LOADING_DELAY_MS,()=>{if(!disposed){state.slow[key]=true;render();}});
  try{return await work();}finally{stop();if(state.slow[key]){state.slow[key]=false;if(!disposed)render();}}
 }
 async function run<T>(label:string,work:()=>Promise<T>,after?:(value:T)=>void|Promise<void>):Promise<void>{
  if(state.busy)return;state.busy=label;state.error=null;render();
  try{const value=await loading('busy',work);await after?.(value);}catch(e){report(e);}finally{state.busy=null;state.slow.busy=false;render();}
 }
 // The shell sends the jobs and the data folder only with `snapshot`: a snapshot a mutation returns keeps the ones already held.
 function adopt(s:Snapshot,options?:{replan?:boolean}){
  const before=state.snapshot;state.snapshot={...s,jobs:s.jobs??before?.jobs,data_dir:s.data_dir??before?.data_dir};
  if(options?.replan!==false&&before&&before.registry.revision!==s.registry.revision&&state.plan?.revision!==s.registry.revision)void replan();
 }
 const reload=()=>run('Reading your registry…',()=>request<Snapshot>('snapshot'),adopt);
 function replan():Promise<void>{
  if(planning){again=true;return planning;}
  planning=(async()=>{try{do{again=false;state.plan=await request<Plan>('plan');}while(again);}catch(e){report(e);}finally{planning=null;render();}})();
  return planning;
 }
 async function discover(){
  if(state.discovering)return;state.discovering=true;state.discoveryError=null;render();
  try{state.discovered=await loading('discovery',()=>request<Discovered[]>('discover'));}catch(e){state.discoveryError=message(e);}finally{state.discovering=false;render();}
 }
 const notify=(text:string,tone?:'err',action?:{label:string;run:()=>void})=>{if(!disposed)notice(root,text,{tone,action});};
 function openDialog(html:string):HTMLDialogElement{
  return dialogView.show(html);
 }
 const closeDialog=()=>dialogView.close();
 // The inspector holds the form of the plugin and of the harness: not modal, the page stays usable beside it. Leaving it with changes asks once.
 const inspect=inspector(root);let guarded:{dirty:()=>boolean;name:string;element:HTMLElement}|null=null;
 // A form that is saving is not left half-way: the guard holds the inspector while its operation runs, and says nothing.
 const saving=()=>!!guarded&&isFormOperationPending(guarded.element);
 const askDiscard=(name:string)=>confirmDialog(root,{title:`Discard changes to ${name}?`,body:'What you changed is not saved.',confirm:'Discard changes',cancel:'Keep editing'});
 function openInspector(html:string,options:{opener?:HTMLElement;dirty?:()=>boolean;name?:string}={}):HTMLElement{
  const holder=document.createElement('template');holder.innerHTML=html.trim();const element=holder.content.firstElementChild as HTMLElement;
  const show=()=>{
   const g=options.dirty?{dirty:options.dirty,name:options.name??'this form',element}:null;guarded=g;
   inspect.open(element,options.opener);
   // The first field, not the Close button: what the form marks `autofocus` starts the keyboard.
   if(options.opener)element.querySelector<HTMLElement>('[autofocus]')?.focus();
   if(g)inspect.guard(()=>isFormOperationPending(element)||g.dirty(),()=>isFormOperationPending(element)?Promise.resolve(false):askDiscard(g.name));
  };
  // Another object over a form with changes: ask first, and open only when the answer is to discard; the new form keeps its own guard.
  if(inspect.isOpen()&&guarded&&!saving()&&guarded.dirty()){const g=guarded;void askDiscard(g.name).then(ok=>{if(ok&&!disposed){closeInspector(true);show();}});}
  else if(inspect.isOpen()&&saving()){/* the answer of the save is awaited: nothing replaces the form */}
  else show();
  return element;
 }
 function closeInspector(force=false){
  if(!inspect.isOpen())return;
  if(force){inspect.guard(()=>false,async()=>true);guarded=null;}
  inspect.close();
 }
 function confirm(title:string,text:string,ok:string,then:()=>void,danger=false,cancel='Cancel'){
  if(disposed||(dialog.open&&!dialogView.dismiss()))return;
  void confirmDialog(root,{title,body:text,confirm:ok,cancel,danger}).then(accepted=>{if(accepted&&!disposed)then();}).catch(fail);
 }
 const app:App={state,request,render,run,loading,notify,reload,replan,adopt,discover,openDialog,closeDialog,openInspector,closeInspector,confirm};

 const canNavigate=()=>!disposed&&!!state.snapshot&&!setupNeeded(state);
 const go=(page:Page)=>{
  if(!canNavigate())return;
  // Another page closes the inspector; with unsaved changes it asks first, and the click is lost unless the person discards.
  if(inspect.isOpen()&&saving())return;
  if(inspect.isOpen()&&guarded?.dirty()){const g=guarded;void askDiscard(g.name).then(ok=>{if(ok&&!disposed){closeInspector(true);go(page);}});return;}
  closeInspector(true);state.page=page;render();void modules[page].opened?.(app);};
 // The Projects tab, clicked while a project is open, goes back to the list.
 // A page button inside a dialog (the Adapt with AI dialog links to Settings) takes the person there: the dialog closes first, unless an apply is running in it.
 const actions:Actions={page:(_app,d)=>{if(!state.applying)closeDialog();if(d.id==='projects'&&state.page==='projects')state.project=null;if(d.id==='projects'||d.id==='sync'||d.id==='activity'||d.id==='settings')go(d.id);},refresh:()=>reload(),views:(_app,_d,el)=>{openMenu(el,PAGES.map(page=>({label:tabLabel(page),checked:()=>state.page===page,run:()=>go(page)})));},commands:()=>{registry.get(PALETTE_COMMAND)?.run();}};
 for(const [name,m] of Object.entries(modules))for(const [action,fn] of Object.entries(m.actions)){if(action in actions)throw new Error(`The action "${action}" of the ${name} page is already declared`);actions[action]=fn;}

 const click=(e:Event)=>{
  const el=(e.target as Element).closest<HTMLButtonElement>('button');if(!el||el.disabled)return;
  if(hasModal()&&!dialog.contains(el)&&el.dataset.action)return;
  if(el.hasAttribute('data-close')){dialogView.dismiss();return;}
  const fn=el.dataset.action?actions[el.dataset.action]:undefined;if(!fn)return;
  e.preventDefault();void Promise.resolve().then(()=>fn(app,el.dataset,el)).catch(fail);
 };
 const route=(hook:'input'|'change')=>(e:Event)=>{const el=textBoxOf(e.target);if(!el)return;for(const m of Object.values(modules))if(m[hook]?.(app,el))return;};
 const onInput=route('input'),onChange=route('change');
 root.addEventListener('click',click);root.addEventListener('input',onInput);root.addEventListener('change',onChange);
 // Ctrl+F searches the current view: only Sync has a search box, so on the other pages it does nothing. `/` does the same.
 const search=()=>{if(canNavigate())root.querySelector<HTMLInputElement>('#main #search')?.focus();};
 // The layers, the keys, the regions, Ctrl+K and Ctrl+F, and the look and theme commands: one call of the package.
 const stopImago=mountApp(root,registry,{search,labels:{palette:'Commands',search:'Search in this view',palettePlaceholder:'Search commands…',paletteEmpty:'No matching command'},appearance:{get:()=>({look:currentLook(),theme:currentTheme()}),set:next=>{saveAppearance(next);render();}}});
 registry.register({id:'muro.check',title:'Check now',keys:'r',when:()=>canNavigate()&&!state.busy&&!state.checking&&!state.applying&&!hasModal()&&!document.activeElement?.closest('.im-inspector'),run:()=>{void actions.check(app,{},root);}});
 registry.register({id:'quick-search',title:'Search in this view',keys:'/',when:canNavigate,run:search});
 for(const page of PAGES)registry.register({id:page,title:'Open '+tabLabel(page),when:canNavigate,run:()=>go(page)});
 if('__TAURI_INTERNALS__' in window){
  if(!import.meta.env.DEV)stopGuard=guardDesktop(document);
  void Promise.all([import('@acaprino/imago/tauri'),import('@tauri-apps/api/webview')]).then(([adapter,webview])=>{
   if(disposed)return;
   nativeApi=adapter.tauriWindowApi((what,error)=>notify(what+': '+message(error),'err'));wireWindow();
   let storage:Storage|undefined;try{storage=localStorage;}catch{}
   stopZoom=mountZoom(document,{apply:level=>webview.getCurrentWebview().setZoom(level),storage,storageKey:'muro.zoom'});
  }).catch(fail);
 }
 // The background worker and the tray move the registry and the sync record while the window is open or hidden. The window reads them again when it gets the focus (it is shown again, or clicked back to) and every REFRESH_MS while it has it, and only when nothing of the person's is under way: no request, no dialog, nothing being typed (a render would put the stored text back in the box). It asks for no plan: the recorded check says what changed, and a plan is made by Check now, Review and Apply all. A hidden window has no focus: WebView2 keeps `visibilityState` "visible" for it, so that says nothing.
 const typing=()=>{const a=document.activeElement;return !!a&&root.contains(a)&&(a instanceof HTMLSelectElement||a instanceof HTMLTextAreaElement||(a instanceof HTMLInputElement&&!/^(checkbox|radio|button|submit)$/.test(a.type)));};
 let refreshing=false;
 async function refreshIfIdle(){
  if(disposed||refreshing||state.busy||state.checking||state.applying||polling||hasModal()||typing())return;
  refreshing=true;let changed=false;
  try{const s=await request<Snapshot>('snapshot');if(disposed)return;changed=JSON.stringify(s)!==JSON.stringify(state.snapshot);adopt(s,{replan:false});}
  catch{/* the next focus or tick tries again: a refresh nobody asked for shows no error */}
  finally{refreshing=false;}
  // A registry that did not move is not painted again: no needless churn every 30 s.
  if(changed&&!disposed&&!hasModal()&&!typing())render();
 }
 const refreshTimer=setInterval(()=>{if(document.hasFocus())void refreshIfIdle();},REFRESH_MS);
 const focused=()=>void refreshIfIdle();
 window.addEventListener('focus',focused);
 // The shell says when it shows the window again: the page gets no focus event then (WebView2). `shown` is the host's way to hear it, and returns how to stop.
 const stopShown=shown?.(focused);
 const jobTimer=setInterval(async()=>{
  if(disposed||polling||state.busy||hasModal()||!state.snapshot?.jobs?.some(j=>j.status==='running'))return;
  polling=true;
  // The Activity page also shows how long each running adaptation has run: the poll paints it again even when the jobs did not change.
  try{const before=JSON.stringify(state.snapshot.jobs);state.snapshot.jobs=await request<Job[]>('jobs');let changed=false;if(!state.snapshot.jobs.some(j=>j.status==='running')){adopt(await request<Snapshot>('snapshot'));changed=true;}if(changed||state.page==='activity'||JSON.stringify(state.snapshot?.jobs)!==before)render();}
  catch(e){fail(e);}finally{polling=false;}
 },3000);
 void reload().then(()=>{if(!disposed&&state.snapshot){void discover();void modules[state.page].opened?.(app);}});
 return ()=>{disposed=true;closeInspector(true);stopGraph();dialogView.dispose();root.removeEventListener('click',click);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);stopTheme();clearInterval(jobTimer);clearInterval(refreshTimer);window.removeEventListener('focus',focused);stopShown?.();stopImago();stopTabs();stopSteps();stopWindow();stopZoom();stopGuard();clearNotices(root);root.replaceChildren();};
}
