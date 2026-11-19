import type { ViewState, Page } from './types.ts';
import type { PageModule } from './context.ts';
import { syncHeadline, stamp } from './model.ts';
import { icon, esc, plural, spin, button, head, empty } from './ui.ts';
import * as sync from './pages/sync.ts';
import * as activity from './pages/activity.ts';
import * as settings from './pages/settings.ts';
import * as setup from './pages/setup.ts';

/** The page modules: what each page shows and the actions, events and first-paint hook it brings. app.ts merges them. */
export const modules:Record<Page|'setup',PageModule>={sync,activity,settings,setup};
const tabs=[['sync','sync','Sync'],['activity','clock','Activity'],['settings','sliders','Settings']] as const;

/** The state button of the app bar: the strip's headline in a few words, and when it was last checked. */
function stateButton(state:ViewState):string {
 const s=state.snapshot!,h=syncHeadline(s,state.plan),last=s.sync.last_check;
 const text={'no-harness':'No harness','not-checked':'Not checked yet',changes:`${plural(h.operations,'change')} waiting`,blocked:'Needs attention',unreadable:'A harness cannot be read',ok:'In sync'}[h.kind];
 return `<button type="button" class="tstatus" data-action="page" data-id="sync" aria-label="Sync state: ${esc(text)}. Open Sync"><i class="dot${h.kind==='ok'?'':' pending'}" aria-hidden="true"></i><span>${esc(text)}${last?` · checked ${esc(stamp(last))}`:''}</span></button>`;
}
function banners(state:ViewState):string {
 const s=state.snapshot,name=(id:string)=>s?.registry.plugins.find(p=>p.id===id)?.name||id;
 return (state.error&&s?`<div class="banner bad" role="alert"><div><strong>That did not complete</strong><p>${esc(state.error)}</p></div>${button('Reload','refresh')}</div>`:'')
  +(state.checkErrors.length?`<div class="banner warn" role="alert"><div><strong>${plural(state.checkErrors.length,'source')} could not be checked</strong><ul>${state.checkErrors.map(e=>`<li><b>${esc(name(e.plugin_id))}</b>: ${esc(e.message)}</li>`).join('')}</ul></div></div>`:'')
  +(state.discoveryError?`<div class="banner bad" role="alert"><div><strong>Harness detection failed</strong><p>${esc(state.discoveryError)}</p></div></div>`:'')
  +(state.busy&&!state.checking&&!state.applying?`<div class="busy" role="status">${spin}<span>${esc(state.busy)}</span></div>`:'');
}
/** The window's content: the app bar (logo, the three tabs, the state button) over the page of the current module. The first run takes the tabs and the page. */
export function frame(state:ViewState):string {
 const s=state.snapshot,first=!!s&&setup.needed(state),running=s?.jobs?.filter(j=>j.status==='running').length||0,waiting=s?syncHeadline(s,state.plan).operations:0;
 const badge:Record<string,[number,string]>={sync:[waiting,`${plural(waiting,'change')} waiting`],activity:[running,`${plural(running,'run')} in progress`]};
 const nav=first?'':`<nav aria-label="Main">${tabs.map(([id,ico,label])=>{const [n,what]=badge[id]||[0,''];return `<button type="button" data-action="page" data-id="${id}" ${state.page===id?'aria-current="page"':''} ${n?`aria-label="${label}, ${what}"`:''}>${icon(ico)}<span class="label">${label}</span>${n?`<span class="n" aria-hidden="true">${n}</span>`:''}</button>`;}).join('')}</nav>`;
 const page=!s?`<div class="page narrow">${head('Sync','Your plugins and the harnesses they are installed in.')+empty(state.busy?'Opening your registry…':'Registry not available',state.error||'Loading local data.',button('Try again','refresh'))}</div>`:first?setup.view(state):`<div class="page ${state.page==='sync'?'':'narrow'}">${modules[state.page].view(state)}</div>`;
 return `<a class="skip" href="#main">Skip to content</a><header class="appbar"><img class="logo" src="/muro-logo.png" alt="Muro">${nav}${s&&!first?stateButton(state):''}</header><main id="main" class="main" tabindex="-1" aria-busy="${!!state.busy}">${banners(state)}${page}</main>`;
}
