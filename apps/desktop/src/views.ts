import type { ViewState, Page } from './types.ts';
import type { PageModule } from './context.ts';
import { chipHtml, noteHtml, pageContentHtml, shellFrameHtml, tabNavigationHtml, titlebarHtml } from '@acaprino/imago/ui';
import { syncHeadline, stamp, nextCheck } from './model.ts';
import { esc, plural, button, head, empty } from './ui.ts';
import * as projects from './pages/projects.ts';
import * as sync from './pages/sync.ts';
import * as activity from './pages/activity.ts';
import * as settings from './pages/settings.ts';
import * as setup from './pages/setup.ts';

/** Page composition and domain state. Imago owns the shell and every visual component. */
export const modules:Record<Page|'setup',PageModule>={projects,sync,activity,settings,setup};
const tabs=[['projects','box','Projects'],['sync','sync','Sync'],['activity','clock','Activity'],['settings','sliders','Settings']] as const;

/** The status row: the state of the sync as a chip, when it was checked and when it is next, and how many harnesses are managed. */
function statusRow(state:ViewState):string {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),last=s.sync.last_check,next=nextCheck(s);
 const text={'no-harness':'No harness','not-checked':'Not checked yet',changes:`${plural(h.operations,'change')} waiting`,blocked:'Needs attention',unreadable:'A harness cannot be read',sources:'Sources not checked',ok:'In sync'}[h.kind];
 return chipHtml(text,h.kind==='ok'?'ok':'warn')+`<span class="im-status-text">Last check ${esc(stamp(last))}${next?` · next check ${esc(next)}`:''}</span><span class="im-spacer"></span><span class="im-status-end">${esc(plural(s.registry.targets.length,'harness','harnesses'))}</span>`;
}
/** The footer: the automatic sync, the last sync and the size of the list; the keys that work on this page are filled from the registry after each paint (`fillKeys`). */
function footerRow(state:ViewState):string {
 const s=state.snapshot!,auto=s.registry.settings.auto_sync;
 return `<span class="im-dot"${auto?' data-im-tone="ok"':''}></span><span class="im-footer-text">Automatic sync ${auto?'on':'off'} · last sync ${esc(stamp(s.sync.last_sync))} · ${esc(plural(s.registry.plugins.length,'plugin'))} in your list</span><span class="im-spacer"></span><span data-muro-footer="${state.page}"></span>`;
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
 const shown=!!s&&!first;
 const nav=first?'':tabNavigationHtml(tabs.map(([id,icon,label])=>{const [count,countLabel]=badge[id]||[0,''];return {id,icon,label,count,countLabel};}),state.page,{label:'Main',action:'page'});
 const page=!s?pageContentHtml(head('Sync','Your plugins and the harnesses they are installed in.')+empty(state.busy?'Opening your registry.':'Registry not available',state.error||'Loading local data.',button('Try again','refresh')),'narrow'):first?setup.view(state):pageContentHtml(modules[state.page].view(state),state.page==='sync'||state.page==='projects'?'normal':'narrow');
 return shellFrameHtml({skipLabel:'Skip to content',busy:!!state.busy,contentHtml:notes(state)+page,contentLabel:state.snapshot&&!first?tabs.find(t=>t[0]===state.page)![2]:first?'Set up Muro':'Sync',inspectorLabel:'Details',statusHtml:shown?statusRow(state):undefined,actionsHtml:shown?modules[state.page].bar?.(state)||undefined:undefined,footerHtml:shown?footerRow(state):undefined,titlebarHtml:titlebarHtml({brand:{name:'Muro'},navigationHtml:nav,views:first?undefined:{label:'Views',action:'views'},commands:{label:'Commands',action:'commands'},windowControls:typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window})});
}
