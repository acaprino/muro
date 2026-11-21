import { attachLayers, closeLayers, createRegistry, hasModal, notify as notice, clearNotices, createContentDialog, confirm as confirmDialog, renderShellFrame, captureDomState, restoreDomState, restoreFocus, type FocusSnapshot, openPalette, openMenu, regions, roving } from '@acaprino/imago/ui';
import { graphView, type GraphViewport } from '@acaprino/imago/graph';
import { guardDesktop, mountZoom, mountWindowControls, type WindowApi } from '@acaprino/imago/shell';
import type { Transport, ViewState, Snapshot, Discovered, Plan, Job, Page } from './types.ts';
import type { App, Actions } from './context.ts';
import { textBoxOf } from './context.ts';
import { frame, modules } from './views.ts';
import { watchTheme } from './look.ts';
import { serial, ALONE } from './queue.ts';
import { needed as setupNeeded } from './pages/setup.ts';
import { blankProjects, recall, remember } from './pages/project/state.ts';
import { sceneFor, decisionGraphOptions } from './pages/project/graph.ts';

/** How often the open window reads the registry again while it has the focus: the background worker and the tray change it behind the window's back. */
export const REFRESH_MS=30_000;

/** State, the one render, focus and scroll kept across it, the event listeners. What a page does is in pages/*.ts: app.ts merges their actions and routes their events, and is not edited to add a page feature. */
export function mountApp(root:HTMLElement,transport:Transport,shown?:(wake:()=>void)=>()=>void):()=>void {
 const request=serial(transport,ALONE);
 const state:ViewState={page:'sync',snapshot:null,discovered:[],discovering:false,plan:null,checking:false,applying:null,review:null,query:'',filter:'all',afilter:'all',busy:null,error:null,checkErrors:[],discoveryError:null,maintenance:null,autostart:null,setup:null,projects:blankProjects(),project:recall()};
 root.classList.add('im-shell','im-native-controls','im-app-layout');root.dataset.imSidebar='off';renderShellFrame(root,frame(state));
 const titlebar=root.querySelector<HTMLElement>('.im-titlebar')!,body=root.querySelector<HTMLElement>('.im-body')!;
 const dialogView=createContentDialog(root,{canDismiss:()=>!state.applying,onClose:()=>render(),fallbackFocus:()=>root.querySelector<HTMLElement>('#main')});
 const dialog=dialogView.element;
 const stopLayers=attachLayers(root),stopRegions=regions(root),registry=createRegistry();
 let nativeApi:WindowApi|undefined,stopWindow=()=>{},stopZoom=()=>{},stopGuard=()=>{},stopTabs=()=>{};
 const wireWindow=()=>{stopWindow();if(nativeApi)stopWindow=mountWindowControls(titlebar,nativeApi,{onError:(what,error)=>notify(what+': '+message(error),'bad')});};
 let disposed=false,polling=false,planning:Promise<void>|null=null,again=false;
 let wantedFocus:FocusSnapshot|null=null;
 const viewports=new Map<string,GraphViewport>();
 let mountedGraph:ReturnType<typeof graphView>|null=null,graphProject='';
 const stopGraph=()=>{if(mountedGraph){viewports.set(graphProject,mountedGraph.viewport());mountedGraph.dispose();mountedGraph=null;}};
 const message=(e:unknown)=>String(e instanceof Error?e.message:e);
 const fail=(e:unknown)=>{state.error=message(e);render();};
 const stopTheme=watchTheme();

 function render(){
  if(disposed)return;
  const dom=captureDomState(root,{scroll:['#main','.im-table-scroll']});
  if(!hasModal()){
   if(document.activeElement?.id!=='main')wantedFocus=dom.focus;
  }
  stopGraph();
  closeLayers(['menu','sheet']);
  stopTabs();renderShellFrame(root,frame(state));
  const tabs=titlebar.querySelector<HTMLElement>('.im-tabs');if(tabs)stopTabs=roving(tabs,{item:'.im-tab',orientation:'horizontal',onSelect:el=>el.click()});
  wireWindow();remember(state.project);
  const host=body.querySelector<HTMLElement>('[data-project-graph]');
  if(host&&state.project&&state.projects.info&&state.projects.infoId===state.project.id){
   graphProject=state.project.id;
   host.inert=!!state.busy;
   mountedGraph=graphView(host,decisionGraphOptions(id=>{if(state.busy||hasModal())return;const action=actions['open-capability'];if(action)void Promise.resolve(action(app,{id},host)).catch(fail);}));
   mountedGraph.draw(sceneFor(state,state.projects.info));
   const viewport=viewports.get(graphProject);if(viewport)mountedGraph.restoreViewport(viewport);
  }
  restoreDomState(root,dom,{focus:false});
  const main=root.querySelector<HTMLElement>('#main');
  if(state.busy)root.querySelectorAll<HTMLButtonElement>('button[data-action]:not([data-action=page])').forEach(b=>b.disabled=true);
  if(state.discovering)root.querySelectorAll<HTMLButtonElement>('button[data-action=rescan]').forEach(b=>b.disabled=true);
  if(wantedFocus&&!hasModal())restoreFocus(root,wantedFocus,{fallback:main});
 }
 async function run<T>(label:string,work:()=>Promise<T>,after?:(value:T)=>void|Promise<void>):Promise<void>{
  if(state.busy)return;state.busy=label;state.error=null;render();
  try{const value=await work();await after?.(value);}catch(e){state.error=message(e);}finally{state.busy=null;render();}
 }
 // The shell sends the jobs and the data folder only with `snapshot`: a snapshot a mutation returns keeps the ones already held.
 function adopt(s:Snapshot,options?:{replan?:boolean}){
  const before=state.snapshot;state.snapshot={...s,jobs:s.jobs??before?.jobs,data_dir:s.data_dir??before?.data_dir};
  if(options?.replan!==false&&before&&before.registry.revision!==s.registry.revision&&state.plan?.revision!==s.registry.revision)void replan();
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
 const notify=(text:string,tone?:'good'|'bad')=>{if(!disposed)notice(root,text,{tone:tone==='bad'?'err':undefined});};
 function openDialog(html:string,kind:'dialog'|'sheet'='dialog'):HTMLDialogElement{
  return dialogView.show(html,kind==='sheet'?'drawer':'dialog');
 }
 const closeDialog=()=>dialogView.close();
 function confirm(title:string,text:string,ok:string,then:()=>void,danger=false){
  if(disposed||(dialog.open&&!dialogView.dismiss()))return;
  void confirmDialog(root,{title,body:text,confirm:ok,cancel:'Cancel',danger}).then(accepted=>{if(accepted&&!disposed)then();}).catch(fail);
 }
 const app:App={state,request,render,run,notify,reload,replan,adopt,discover,openDialog,closeDialog,confirm};

 const canNavigate=()=>!disposed&&!!state.snapshot&&!setupNeeded(state);
 const go=(page:Page)=>{if(!canNavigate())return;state.page=page;render();void modules[page].opened?.(app);};
 // The Projects tab, clicked while a project is open, goes back to the list.
 // A page button inside a dialog (the Adapt with AI dialog links to Settings) takes the person there: the dialog closes first, unless an apply is running in it.
 const actions:Actions={page:(_app,d)=>{if(!state.applying)closeDialog();if(d.id==='projects'&&state.page==='projects')state.project=null;if(d.id==='projects'||d.id==='sync'||d.id==='activity'||d.id==='settings')go(d.id);},refresh:()=>reload(),views:(_app,_d,el)=>{openMenu(el,(['projects','sync','activity','settings'] as const).map(page=>({label:page[0].toUpperCase()+page.slice(1),run:()=>go(page)})));},commands:()=>{openPalette(root,registry,{placeholder:'Search commands…',empty:'No matching command'});}};
 for(const [name,m] of Object.entries(modules))for(const [action,fn] of Object.entries(m.actions)){if(action in actions)throw new Error(`The action "${action}" of the ${name} page is already declared`);actions[action]=fn;}

 const click=(e:Event)=>{
  const el=(e.target as Element).closest<HTMLButtonElement>('button');if(!el||el.disabled)return;
  if(hasModal()&&!dialog.contains(el)&&el.dataset.action)return;
  if(el.hasAttribute('data-close')){dialogView.dismiss();return;}
  const fn=el.dataset.action?actions[el.dataset.action]:undefined;if(!fn)return;
  e.preventDefault();void Promise.resolve().then(()=>fn(app,el.dataset,el)).catch(fail);
 };
 const route=(hook:'input'|'change')=>(e:Event)=>{const el=textBoxOf(e.target);if(!el)return;for(const m of Object.values(modules))if(m[hook]?.(app,el))return;};
 const keys=(e:KeyboardEvent)=>{for(const m of Object.values(modules))if(m.keydown?.(app,e))return;};
 const onInput=route('input'),onChange=route('change');
 root.addEventListener('click',click);root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('keydown',keys);
 const search=()=>{if(state.page!=='sync')go('sync');root.querySelector<HTMLInputElement>('#search')?.focus();};
 registry.register({id:'commands',title:'Commands',keys:'Ctrl+K',run:()=>{openPalette(root,registry,{placeholder:'Search commands…',empty:'No matching command'});}});
 registry.register({id:'search',title:'Search plugins',keys:'Ctrl+F',when:canNavigate,run:search});
 registry.register({id:'quick-search',title:'Search plugins',keys:'/',when:canNavigate,run:search});
 for(const page of ['projects','sync','activity','settings'] as const)registry.register({id:page,title:'Open '+page,when:canNavigate,run:()=>go(page)});
 const stopCommands=registry.attach(document);
 if('__TAURI_INTERNALS__' in window){
  if(!import.meta.env.DEV)stopGuard=guardDesktop(document,{keyPhase:'bubble'});
  void Promise.all([import('@acaprino/imago/tauri'),import('@tauri-apps/api/webview')]).then(([adapter,webview])=>{
   if(disposed)return;
   nativeApi=adapter.tauriWindowApi((what,error)=>notify(what+': '+message(error),'bad'));wireWindow();
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
  try{const held=state.snapshot.jobs??[],before=JSON.stringify(held);const jobs=await request<Job[]>('jobs');state.snapshot.jobs=jobs;let changed=false;if(!jobs.some(j=>j.status==='running')){adopt(await request<Snapshot>('snapshot'));changed=true;}if(changed||state.page==='activity'||state.page==='projects'||JSON.stringify(state.snapshot?.jobs)!==before)render();for(const m of Object.values(modules))m.jobsChanged?.(app,held,jobs);}
  catch(e){fail(e);}finally{polling=false;}
 },3000);
 void reload().then(()=>{if(!disposed&&state.snapshot){void discover();void modules[state.page].opened?.(app);}});
 return ()=>{disposed=true;stopGraph();dialogView.dispose();root.removeEventListener('click',click);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);root.removeEventListener('keydown',keys);stopTheme();clearInterval(jobTimer);clearInterval(refreshTimer);window.removeEventListener('focus',focused);stopShown?.();stopCommands();stopTabs();stopWindow();stopZoom();stopGuard();stopRegions();stopLayers();clearNotices(root);root.replaceChildren();};
}
