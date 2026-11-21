import type { ViewState, Page } from './types.ts';
import type { PageModule } from './context.ts';
import { noteHtml, pageContentHtml, shellFrameHtml, statusButtonHtml, tabNavigationHtml, titlebarHtml } from '@acaprino/imago/ui';
import { syncHeadline, stamp } from './model.ts';
import { plural, button, head, empty } from './ui.ts';
import * as projects from './pages/projects.ts';
import * as sync from './pages/sync.ts';
import * as activity from './pages/activity.ts';
import * as settings from './pages/settings.ts';
import * as setup from './pages/setup.ts';

/** Page composition and domain state. Imago owns the shell and every visual component. */
export const modules:Record<Page|'setup',PageModule>={projects,sync,activity,settings,setup};
const tabs=[['projects','box','Projects'],['sync','sync','Sync'],['activity','clock','Activity'],['settings','sliders','Settings']] as const;

function stateButton(state:ViewState):string {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),last=s.sync.last_check;
 const text={'no-harness':'No harness','not-checked':'Not checked yet',changes:`${plural(h.operations,'change')} waiting`,blocked:'Needs attention',unreadable:'A harness cannot be read',sources:'Sources not checked',ok:'In sync'}[h.kind];
 return statusButtonHtml({label:text+(last?` · checked ${stamp(last)}`:''),accessibleLabel:`Sync state: ${text}. Open Sync`,action:'page',id:'sync',tone:h.kind==='ok'?'ok':'warn'});
}

/** What went wrong or needs attention, as notes at the top of the content. The running operation is a loader the app mounts there after each paint (`paintBusy`). */
function notes(state:ViewState):string {
 const s=state.snapshot,name=(id:string)=>s?.registry.plugins.find(p=>p.id===id)?.name||id;
 return (state.error&&s?noteHtml({title:'That did not complete',message:state.error,actionsHtml:button('Reload','refresh'),tone:'err'}):'')
  +(state.checkErrors.length?noteHtml({title:`${plural(state.checkErrors.length,'source')} could not be checked`,items:state.checkErrors.map(e=>({label:name(e.plugin_id),message:e.message})),tone:'warn'}):'')
  +(state.discoveryError?noteHtml({title:'Harness detection failed',message:state.discoveryError,tone:'err'}):'')
  ;
}

export function frame(state:ViewState):string {
 const s=state.snapshot,first=!!s&&setup.needed(state),running=s?.jobs?.filter(j=>j.status==='running').length||0,waiting=s?syncHeadline(s,state.plan).operations:0;
 const badge:Record<string,[number,string]>={sync:[waiting,`${plural(waiting,'change')} waiting`],activity:[running,`${plural(running,'run')} in progress`]};
 const nav=first?'':tabNavigationHtml(tabs.map(([id,icon,label])=>{const [count,countLabel]=badge[id]||[0,''];return {id,icon,label,count,countLabel};}),state.page,{label:'Main',action:'page'});
 const page=!s?pageContentHtml(head('Sync','Your plugins and the harnesses they are installed in.')+empty(state.busy?'Opening your registry.':'Registry not available',state.error||'Loading local data.',button('Try again','refresh')),'narrow'):first?setup.view(state):pageContentHtml(modules[state.page].view(state),state.page==='sync'||state.page==='projects'?'normal':'narrow');
 return shellFrameHtml({skipLabel:'Skip to content',busy:!!state.busy,contentHtml:notes(state)+page,contentLabel:state.snapshot&&!first?tabs.find(t=>t[0]===state.page)![2]:first?'Set up Muro':'Sync',inspectorLabel:'Details',titlebarHtml:titlebarHtml({brand:{name:'Muro'},navigationHtml:nav,views:first?undefined:{label:'Views',action:'views'},statusHtml:s&&!first?stateButton(state):'',commands:{label:'Commands',action:'commands',shortcut:'Ctrl K'},windowControls:typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window})});
}
