import test from 'node:test';
import assert from 'node:assert/strict';
import { listedPlugin, listing, pluginState, filterPlugins, cellState, harnessState, syncSummary, syncHeadline, sameOperations, unlisted, exclusiveMode, intervalOptions, stamp, versionOf, removals, removalLabel, applyPayload, appliedNotice, mustReview } from '../src/model.ts';
import type { Snapshot, Plugin, Plan, Operation, ViewState } from '../src/types.ts';
import { frame, modules } from '../src/views.ts';
import { cell, rows, actions as syncActions } from '../src/pages/sync.ts';
import type { App } from '../src/context.ts';
import { reviewSheet, pluginPanel, harnessPanel, adaptDialog } from '../src/sheets.ts';
import { when, sw, seg, button } from '../src/ui.ts';
import { storedTheme, resolveTheme } from '../src/look.ts';
import { blankProjects } from '../src/pages/project/state.ts';

const plugin: Plugin = {id:'pkg',name:'Package',source:'owner/pkg',policy:'stable',pinned_version:'',targets:['target'],distributions:[{harness:'codex',path:'/artifact',version:'2'}]};
function snapshot(): Snapshot {return {registry:{schema:1,revision:4,plugins:[plugin],targets:[{id:'target',harness:'codex',name:'Codex',root:'/profile',executable:'codex',exclusive:false,enabled:true}],settings:{auto_sync:false,interval_minutes:60,close_to_tray:true,agent:'claude-code',python:'python',factory_path:''}},inventory:[{target_id:'target',complete:true,supported:true,error:null,plugins:[{id:'pkg',name:'Package',version:'1',path:'/plugin',managed:true}]}],activity:[],sync:{last_check:null,last_sync:null,revision:null,pending:null,blockers:null,errors:null,targets:{}}};}
const viewState=(snapshot:Snapshot|null,over:Partial<ViewState>={}):ViewState=>({page:'sync',snapshot,discovered:[],discovering:false,plan:null,checking:false,applying:null,review:null,query:'',filter:'all',afilter:'all',busy:null,error:null,checkErrors:[],discoveryError:null,maintenance:null,autostart:null,setup:null,...over});
test('version drift requires an update',()=>assert.equal(pluginState(plugin,snapshot()).kind,'update'));
test('incomplete inventory is never marked missing or synchronized',()=>{const s=snapshot();s.inventory[0].complete=false;assert.equal(pluginState(plugin,s).kind,'unknown');});
test('unconfigured and missing distributions have separate states',()=>{const s=snapshot();assert.equal(pluginState({...plugin,targets:[]},s).kind,'unassigned');assert.equal(pluginState({...plugin,distributions:[]},s).kind,'prepare');});
test('filter searches source as well as name without interpreting intent',()=>assert.equal(filterPlugins([plugin],'OWNER','all',snapshot()).length,1));

test('changed custom instructions require regeneration even when versions match',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'/instructions',files:['custom-instructions/recap.md'],digest:'new',stale_harnesses:['codex']}]};
 s.inventory[0].plugins[0].version='2';
 assert.deepEqual(pluginState(plugin,s),{kind:'prepare',label:'Adapt again',tone:'warn'});
 assert.equal(filterPlugins([plugin],'','prepare',s).length,1);
});

test('unreadable custom instructions cannot appear synchronized',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'/instructions',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}]};
 s.inventory[0].plugins[0].version='2';
 assert.equal(pluginState(plugin,s).kind,'unknown');
});

test('staleness on an unused harness does not invalidate the assigned target',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'/instructions',files:[],digest:'',stale_harnesses:['pi']}]};
 s.inventory[0].plugins[0].version='2';
 assert.equal(pluginState(plugin,s).kind,'ok');
});

test('the theme is System until one is chosen, and System follows the operating system',()=>{
 assert.equal(storedTheme(null),'system');assert.equal(storedTheme('stale'),'system');assert.equal(storedTheme('light'),'light');assert.equal(storedTheme('dark'),'dark');
 assert.equal(resolveTheme('system',true),'light');assert.equal(resolveTheme('system',false),'dark');
 assert.equal(resolveTheme('dark',true),'dark');assert.equal(resolveTheme('light',false),'light');
});

test('epoch stamps read as dates, other time text is left alone',()=>{assert.match(when('1795077229'),/2026/);assert.equal(when('2026-11-15'),'2026-11-15');assert.equal(when(undefined),'');});


const op=(kind:string,from:string,to:string,plugin_id='pkg',target_id='target'):Operation=>({target_id,plugin_id,name:'Package',kind,from_version:from,to_version:to,reason:''});
const plan=(operations:Operation[],revision=4,blockers:string[]=[]):Plan=>({id:'plan',revision,operations,blockers});
const at=(y:number,mo:number,d:number,h:number,mi:number)=>String(Math.floor(new Date(y,mo,d,h,mi).getTime()/1000));

test('cellState: a plan of the snapshot revision gives the operation kind and versions',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(cellState(plugin,t,s,plan([op('update','1','2')])),{kind:'update',from:'1',to:'2'});
 assert.deepEqual(cellState(plugin,t,s,plan([op('install','','2')])),{kind:'install',to:'2'});
 assert.deepEqual(cellState(plugin,t,s,plan([op('remove','1','')])),{kind:'remove',from:'1'});
 for(const kind of ['reinstall','activate'])assert.equal(cellState(plugin,t,s,plan([op(kind,'2','2')])).kind,kind);
});
test('cellState: an operation for another plugin or another target is not the cell\'s',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(cellState(plugin,t,s,plan([op('install','','9','other'),op('install','','9','pkg','elsewhere')])),{kind:'update',from:'1',to:'2'});
});
test('cellState: a plan of another revision is ignored and the snapshot is read',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(cellState(plugin,t,s,plan([op('install','','9')],3)),{kind:'update',from:'1',to:'2'});
});
test('cellState: an operation of a kind the interface does not know is unknown',()=>{const s=snapshot();assert.equal(cellState(plugin,s.registry.targets[0],s,plan([op('quarantine','1','2')])).kind,'unknown');});
test('cellState without a plan is read from the snapshot for one target',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(cellState(plugin,t,s,null),{kind:'update',from:'1',to:'2'});
 s.inventory[0].plugins[0].version='2';assert.deepEqual(cellState(plugin,t,s,null),{kind:'ok',from:'2',to:'2'});
 s.inventory[0].plugins=[];assert.deepEqual(cellState(plugin,t,s,null),{kind:'install',to:'2'});
 assert.equal(cellState({...plugin,targets:[]},t,s,null).kind,'none');
 assert.equal(cellState(plugin,{...t,enabled:false},s,null).kind,'paused');
});
test('cellState gives needs-build when the plugin has no distribution for the harness of the target',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.equal(cellState({...plugin,distributions:[{harness:'pi',path:'/x',version:'2'}]},t,s,null).kind,'needs-build');
 assert.equal(cellState({...plugin,distributions:[]},t,s,null).kind,'needs-build');
 assert.equal(cellState({...plugin,distributions:[{harness:'codex',path:'',version:'2'}]},t,s,null).kind,'needs-build');
});
test('cellState: an unreadable inventory or unreadable instructions are unknown, never ok',()=>{
 const t=snapshot().registry.targets[0],ok=snapshot();ok.inventory[0].plugins[0].version='2';
 const incomplete=snapshot();incomplete.inventory[0].plugins[0].version='2';incomplete.inventory[0].complete=false;
 const unsupported=snapshot();unsupported.inventory[0].plugins[0].version='2';unsupported.inventory[0].supported=false;
 const broken={...ok,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}]};
 assert.equal(cellState(plugin,t,ok,null).kind,'ok');
 for(const s of [incomplete,unsupported,broken])assert.equal(cellState(plugin,t,s,null).kind,'unknown');
});
test('cellState: changed instructions need a new build for their harness only',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const stale=(h:string)=>({...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'new',stale_harnesses:[h]}]});
 assert.equal(cellState(plugin,t,stale('codex'),null).kind,'needs-build');
 assert.equal(cellState(plugin,t,stale('pi'),null).kind,'ok');
});

test('harnessState: a paused harness is paused whatever the snapshot says',()=>{const s=snapshot(),t={...s.registry.targets[0],enabled:false};assert.deepEqual(harnessState(t,s,plan([op('update','1','2')])),{kind:'paused',count:0});});
test('an incomplete inventory is never in sync',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessState(t,s,plan([])),{kind:'ok',count:0});
 s.inventory[0].complete=false;
 assert.deepEqual(harnessState(t,s,plan([])),{kind:'unknown',count:0});
 assert.deepEqual(harnessState(t,s,null),{kind:'unknown',count:0});
 s.inventory[0].complete=true;s.inventory=[];
 assert.deepEqual(harnessState(t,s,plan([])),{kind:'unknown',count:0});
});
test('harnessState counts the operations of the plan for that harness, plugins outside the list included',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessState(t,s,plan([op('update','1','2'),op('remove','3','','')])),{kind:'changes',count:2});
 assert.deepEqual(harnessState(t,s,plan([op('update','1','2','pkg','elsewhere')])),{kind:'ok',count:0});
});
test('harnessState without a plan, or with a stale one, reads the snapshot',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(harnessState(t,s,null),{kind:'changes',count:1});
 s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessState(t,s,plan([op('update','1','2')],3)),{kind:'ok',count:0});
});
test('harnessState reports the plugins that have no build for the harness, after the changes',()=>{
 const s=snapshot(),t=s.registry.targets[0],bare={...plugin,id:'bare',name:'Bare',distributions:[]};s.registry.plugins=[plugin,bare];s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessState(t,s,null),{kind:'needs-build',count:1});
 assert.deepEqual(harnessState(t,s,plan([op('reinstall','2','2')])),{kind:'changes',count:1});
});
test('harnessState: a plugin whose instructions cannot be read keeps the harness from reading as in sync',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const broken={...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}]};
 assert.deepEqual(harnessState(t,broken,plan([])),{kind:'unknown',count:1});
});

test('syncSummary: no enabled harness',()=>{
 const s=snapshot();s.registry.targets[0].enabled=false;
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')])),{kind:'no-harness',operations:0,blockers:0,errors:0,byKind:{}});
 s.registry.targets=[];assert.equal(syncSummary(s,null).kind,'no-harness');
});
test('a plan of another revision counts as not checked',()=>{
 const s=snapshot(),empty={kind:'not-checked',operations:0,blockers:0,errors:0,byKind:{}};
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')],3,['Codex: broken'])),empty);
 assert.deepEqual(syncSummary(s,null),empty);
});
test('syncSummary counts the operations of a current plan by kind, and its blockers',()=>{
 const s=snapshot();
 assert.deepEqual(syncSummary(s,plan([op('install','','2','a'),op('update','1','2','b'),op('update','1','2','c'),op('remove','1','','')],4,['Codex / D: no build'])),{kind:'changes',operations:4,blockers:1,errors:0,byKind:{install:1,update:2,remove:1}});
 assert.deepEqual(syncSummary(s,plan([],4,['Codex / D: no build'])),{kind:'blocked',operations:0,blockers:1,errors:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([])),{kind:'ok',operations:0,blockers:0,errors:0,byKind:{}});
});

/** What the service recorded for the snapshot's own revision (4): the check a person has not seen in this window. */
const recordedSync=(over:Partial<Snapshot['sync']>={}):Snapshot['sync']=>({last_check:'1700000000',last_sync:null,revision:4,pending:3,blockers:0,errors:null,targets:{},...over});
test('with no plan of this revision the summary is the recorded check: its counts, with no breakdown',()=>{
 const s=snapshot();s.sync=recordedSync();
 assert.deepEqual(syncSummary(s,null),{kind:'changes',operations:3,blockers:0,errors:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')],3)),{kind:'changes',operations:3,blockers:0,errors:0,byKind:{}},'a plan of another revision is no plan');
 s.sync=recordedSync({pending:0,blockers:2});assert.deepEqual(syncSummary(s,null),{kind:'blocked',operations:0,blockers:2,errors:0,byKind:{}});
 s.sync=recordedSync({pending:0});assert.deepEqual(syncSummary(s,null),{kind:'ok',operations:0,blockers:0,errors:0,byKind:{}});
 s.sync=recordedSync({pending:2,blockers:1});assert.deepEqual(syncSummary(s,null),{kind:'changes',operations:2,blockers:1,errors:0,byKind:{}});
});
test('a record of another revision, or of none, is not a check of this one',()=>{
 const empty={kind:'not-checked',operations:0,blockers:0,errors:0,byKind:{}},s=snapshot();
 for(const over of [{revision:3},{revision:null},{pending:null,blockers:null},{revision:5}]){s.sync=recordedSync(over);assert.deepEqual(syncSummary(s,null),empty,JSON.stringify(over));}
 s.sync=recordedSync({errors:2,revision:3});assert.equal(syncSummary(s,null).errors,0,'errors recorded for another revision say nothing about this one');
});
test('a plan of this revision wins over the record',()=>{
 const s=snapshot();s.sync=recordedSync({pending:3});
 assert.deepEqual(syncSummary(s,plan([])),{kind:'ok',operations:0,blockers:0,errors:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([op('install','','2')])),{kind:'changes',operations:1,blockers:0,errors:0,byKind:{install:1}});
 s.registry.targets[0].enabled=false;assert.equal(syncSummary(s,null).kind,'no-harness','no harness still comes first');
});
test('the sources a check could not resolve are counted, with or without a plan',()=>{
 const s=snapshot();s.sync=recordedSync({pending:0,errors:2});
 assert.deepEqual(syncSummary(s,null),{kind:'ok',operations:0,blockers:0,errors:2,byKind:{}});
 assert.equal(syncSummary(s,plan([])).errors,2);
 s.sync=recordedSync({pending:0,errors:null});assert.equal(syncSummary(s,null).errors,0,'no count is none');
 s.sync=recordedSync({pending:0,errors:2});s.inventory[0].plugins[0].version='2';
 const h=syncHeadline(s,null);assert.equal(h.kind,'sources');assert.equal(h.errors,2);
 s.sync=recordedSync({pending:0,blockers:1,errors:2});assert.equal(syncHeadline(s,null).kind,'sources','blockers do not hide a source that was not checked');
 s.sync=recordedSync({pending:1,errors:2});assert.equal(syncHeadline(s,null).kind,'changes','changes still lead');
 s.sync=recordedSync({pending:0,errors:0});assert.equal(syncHeadline(s,null).kind,'ok');
 s.inventory[0].complete=false;s.sync=recordedSync({pending:0,errors:2});assert.equal(syncHeadline(s,null).kind,'unreadable','a harness that cannot be read is told first');
});

test('unlisted gives the plugins outside the list of enabled harnesses with a complete inventory, with their index',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 s.inventory[0].plugins.push({id:'a',name:'A',version:'1',path:'/a',managed:false},{id:'b',name:'B',version:'1',path:'/b',managed:true},{id:'c',name:'C',version:'3',path:'/c',managed:false});
 assert.deepEqual(unlisted(s),[{target:t,plugin:s.inventory[0].plugins[1],index:1},{target:t,plugin:s.inventory[0].plugins[3],index:3}]);
 s.inventory[0].complete=false;assert.deepEqual(unlisted(s),[]);
 s.inventory[0].complete=true;t.enabled=false;assert.deepEqual(unlisted(s),[]);
});
test('unlisted leaves out an installed plugin the list holds, though the service still calls it unmanaged',()=>{
 const s=snapshot(),t=s.registry.targets[0],added={id:'native-a',name:'A',version:'1',path:'/a',managed:false},other={id:'native-b',name:'B',version:'1',path:'/b',managed:false};
 s.inventory[0].plugins.push(added,other);
 assert.deepEqual(unlisted(s).map(u=>u.plugin.name),['A','B']);
 s.registry.plugins.push(listedPlugin(added,t));
 assert.deepEqual(unlisted(s).map(u=>u.plugin.name),['B'],'A is a plugin of the list now: its build is in the folder it is installed in');
 s.registry.plugins[1]={...s.registry.plugins[1],targets:[]};
 assert.deepEqual(unlisted(s).map(u=>u.plugin.name),['A','B'],'a plugin of the list that does not target this harness does not hold it');
});
test('exclusiveMode reads whether every, none or some harness uninstalls plugins outside the list',()=>{
 const t=(exclusive:boolean)=>({...snapshot().registry.targets[0],exclusive});
 assert.equal(exclusiveMode([t(true),t(true)]),'remove');assert.equal(exclusiveMode([t(false),t(false)]),'keep');
 assert.equal(exclusiveMode([t(true),t(false)]),'mixed');assert.equal(exclusiveMode([]),'keep');
});

test('adding an installed plugin to the list sends the installation it takes over, with the plugin and the revision',()=>{
 const t=snapshot().registry.targets[0],installed={id:'native-pkg',name:'Package',version:'1.0.0',path:'/plugin',managed:false},body=listing(installed,t,7);
 assert.equal(body.revision,7);assert.deepEqual(body.adopt,{target_id:'target',native_id:'native-pkg'});
 assert.deepEqual({...body.plugin,id:''},{...listedPlugin(installed,t),id:''});assert.equal(body.plugin.source,'/plugin');
});
test('intervalOptions lists the six intervals with the mockup labels',()=>assert.deepEqual(intervalOptions(60),[[15,'Every 15 minutes'],[30,'Every 30 minutes'],[60,'Every hour'],[180,'Every 3 hours'],[720,'Every 12 hours'],[1440,'Once a day']]));
test('intervalOptions(45) keeps 45 between 30 and 60',()=>{const o=intervalOptions(45);assert.deepEqual(o[2],[45,'Every 45 minutes']);assert.deepEqual(o.map(([m])=>m),[15,30,45,60,180,720,1440]);});
test('intervalOptions places any stored interval in order and reads one minute as singular',()=>{
 assert.deepEqual(intervalOptions(1)[0],[1,'Every minute']);assert.deepEqual(intervalOptions(5).slice(0,2),[[5,'Every 5 minutes'],[15,'Every 15 minutes']]);
 assert.deepEqual(intervalOptions(2000).at(-1),[2000,'Every 2000 minutes']);assert.equal(intervalOptions(2000).length,7);
});

test('stamp reads never, today, yesterday, tomorrow, or the day and month with the time',()=>{
 const now=new Date(2026,10,19,14,5);
 assert.equal(stamp(null,now),'never');
 assert.equal(stamp(at(2026,10,19,9,30),now),'today 09:30');
 assert.equal(stamp(at(2026,10,18,23,59),now),'yesterday 23:59');
 assert.equal(stamp(at(2026,10,20,0,5),now),'tomorrow 00:05');
 assert.equal(stamp(at(2026,10,5,9,30),now),'5 Nov 09:30');
 assert.equal(stamp('not a time',now),'not a time');
});

test('the action filter keeps the plugins with a cell that needs action; all keeps every plugin',()=>{
 const s=snapshot(),fine={...plugin,id:'fine',name:'Fine'};s.registry.plugins=[plugin,fine];s.inventory[0].plugins.push({id:'fine',name:'Fine',version:'2',path:'/fine',managed:true});
 const ids=(f:string,p:Plan|null=null)=>filterPlugins(s.registry.plugins,'',f,s,p).map(x=>x.id);
 assert.deepEqual(ids('action'),['pkg']);assert.deepEqual(ids('all'),['pkg','fine']);
 assert.deepEqual(ids('action',plan([op('reinstall','2','2','fine')])),['pkg','fine']);
});

test('syncHeadline: a harness that cannot be read keeps ok and blocked from showing, the changes still lead',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';
 assert.equal(syncHeadline(s,plan([])).kind,'ok');
 s.inventory[0].complete=false;
 const h=syncHeadline(s,plan([]));assert.equal(h.kind,'unreadable');assert.deepEqual(h.unreadable.map(u=>[u.target.id,u.count]),[['target',0]]);
 assert.equal(syncHeadline(s,plan([],4,['Codex: no folder'])).kind,'unreadable');
 assert.equal(syncHeadline(s,plan([op('update','1','2')])).kind,'changes');
 assert.equal(syncHeadline(s,null).kind,'not-checked');
 s.registry.targets[0].enabled=false;assert.deepEqual(syncHeadline(s,plan([])).unreadable,[]);assert.equal(syncHeadline(s,plan([])).kind,'no-harness');
});
test('syncHeadline: instructions that cannot be read also keep a harness from reading as in sync, with a count',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';s.custom_instructions=[{plugin_id:'pkg',path:'/i',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}];
 const h=syncHeadline(s,plan([]));assert.equal(h.kind,'unreadable');assert.deepEqual(h.unreadable.map(u=>u.count),[1]);
});
test('syncHeadline keeps the counts of syncSummary',()=>{
 const s=snapshot(),p=plan([op('install','','2','a'),op('remove','1','','')],4,['Codex / D: no build']);
 const {unreadable,kind,...counts}=syncHeadline(s,p);assert.equal(kind,'changes');assert.deepEqual(unreadable,[]);assert.deepEqual(counts,{operations:2,blockers:1,errors:0,byKind:{install:1,remove:1}});
});
test('sameOperations compares the operations of two plans in any order, and never equates a missing plan',()=>{
 const a=plan([op('install','','2','a'),op('update','1','2','b')]),b=plan([op('update','1','2','b'),op('install','','2','a')],5);
 assert.equal(sameOperations(a,b),true);assert.equal(sameOperations(a,plan([op('install','','2','a')])),false);
 assert.equal(sameOperations(a,plan([op('install','','2','a'),op('update','1','3','b')])),false,'another version is another operation');
 assert.equal(sameOperations(a,plan([op('install','','2','a'),op('remove','1','','b')])),false,'another kind is another operation');
 assert.equal(sameOperations(null,null),false);assert.equal(sameOperations(a,null),false);assert.equal(sameOperations(plan([]),plan([])),true);
});

/** The note of the Sync page (what the last check found), the status row, and the action bar of a frame. */
const stripOf=(html:string)=>html.match(/<div id="sync-state">[\s\S]*?<\/span><\/div><\/div><\/div>/)?.[0]||'';
const statusOf=(html:string)=>html.match(/<div class="im-status">[\s\S]*?<\/div><div class="im-columns"/)?.[0]||'';
const barOf=(html:string)=>html.match(/<div class="im-actions">[\s\S]*?<\/div><footer/)?.[0]||'';
const actionsOf=(html:string)=>html.match(/data-action="[a-z-]+"/g)?.map(a=>a.slice(13,-1));
test('the frame is a title bar with four tabs, a status row, an action bar and a footer, no sidebar; Sync is current',()=>{
 const html=frame(viewState(snapshot()));
 assert.equal(html.match(/data-action="page" data-id="[a-z]+"/g)?.length,4,'four tabs: the status row navigates nowhere');assert.match(statusOf(html),/class="im-chip"/);assert.match(html,/<footer class="im-footer">/);assert.doesNotMatch(html,/im-titlebar-status/);
 assert.match(html,/data-id="sync" aria-current="page"/);assert.doesNotMatch(html,/data-id="activity" aria-current/);
 assert.doesNotMatch(html,/class="(sidebar|topbar|bottom|shell)/);assert.match(html,/<header class="im-titlebar" data-tauri-drag-region>/);assert.match(html,/<main id="main"/);
});
test('the strip says Not checked yet and offers only Check now when nothing was recorded for this revision, and for a plan of another revision',()=>{
 for(const held of [null,plan([op('update','1','2')],3)]){const html=frame(viewState(snapshot(),{plan:held})),strip=stripOf(html);assert.match(strip,/Not checked yet/);assert.deepEqual(actionsOf(barOf(html)),['check']);}
});
test('a recorded check shows on open: its count, Review and Apply all, and no text built from a plan that is not there',()=>{
 const s=snapshot();s.sync=recordedSync({pending:3});
 const html=frame(viewState(s)),strip=stripOf(html);
 assert.match(strip,/<b>3 changes ready to apply<\/b>/);
 assert.match(strip,/<span>Nothing changes until you apply\.<\/span>/,'no leading full stop, no breakdown');
 assert.deepEqual(actionsOf(barOf(html)),['check','review','apply-all']);assert.match(barOf(html),/Apply all 3 changes/);assert.equal(barOf(html).match(/im-btn--primary/g)?.length,1,'one primary action');
 assert.doesNotMatch(strip,/Not checked yet/);assert.doesNotMatch(statusOf(html),/Last check never/);
 assert.match(statusOf(html),/3 changes waiting/);assert.match(statusOf(html),/Last check /,'the status row agrees');
 assert.match(html,/aria-label="Sync, 3 changes waiting"/,'and so does the tab badge');
 s.sync=recordedSync({pending:2,blockers:1});
 assert.match(stripOf(frame(viewState(s))),/<span>1 item not ready yet\. Nothing changes until you apply\.<\/span>/);
});
test('a recorded check with blockers or sources not checked or nothing to do reads as such',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';
 s.sync=recordedSync({pending:0,blockers:2});
 const blockedHtml=frame(viewState(s)),blocked=stripOf(blockedHtml);assert.match(blocked,/Some plugins are not ready/);assert.match(blocked,/2 items are not ready yet/);assert.doesNotMatch(blocked,/<span>\./);assert.deepEqual(actionsOf(barOf(blockedHtml)),['check','review']);
 s.sync=recordedSync({pending:0,errors:2});
 const sourcesHtml=frame(viewState(s)),sources=stripOf(sourcesHtml);assert.match(sources,/<b>2 sources could not be checked<\/b>/);assert.doesNotMatch(sources,/Everything is in sync/);assert.deepEqual(actionsOf(barOf(sourcesHtml)),['check']);assert.match(barOf(sourcesHtml),/class="im-btn im-btn--primary" data-action="check"/,'Check now leads');
 assert.match(statusOf(sourcesHtml),/Sources not checked/,'the status row says it too');
 s.sync=recordedSync({pending:2,errors:1});
 assert.match(stripOf(frame(viewState(s))),/1 source could not be checked\. Nothing changes until you apply\./,'changes still lead and the count follows');
 s.sync=recordedSync({pending:0});
 assert.match(stripOf(frame(viewState(s))),/Everything is in sync/);
});
test('a column the record cannot describe says to check, and never In sync',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 s.sync=recordedSync({pending:2});
 assert.deepEqual(harnessState(t,s,null),{kind:'unseen',count:2});
 const html=frame(viewState(s));assert.match(html,/Check to see the changes/);assert.doesNotMatch(html,/>In sync</);
 assert.equal(harnessState(t,s,plan([],4)).kind,'ok','a plan of this revision describes the column itself');
 s.sync=recordedSync({pending:0});assert.equal(harnessState(t,s,null).kind,'ok','nothing pending was recorded');
 s.sync=recordedSync({pending:2});s.inventory[0].plugins[0].version='1';
 assert.deepEqual(harnessState(t,s,null),{kind:'changes',count:1},'what the snapshot shows of its own is still shown');
 s.inventory[0].plugins[0].version='2';t.enabled=false;assert.equal(harnessState(t,s,null).kind,'paused');
});
test('the strip counts the held plan and offers Review and Apply all',()=>{
 const html=frame(viewState(snapshot(),{plan:plan([op('update','1','2')],4,['Codex / D: no build'])})),strip=stripOf(html);
 assert.match(strip,/1 change ready to apply/);assert.match(strip,/1 update · 1 item not ready yet/);
 assert.deepEqual(actionsOf(barOf(html)),['check','review','apply-all']);assert.match(barOf(html),/Apply all 1 change/);
});
test('the strip never says everything is in sync while a harness cannot be read',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';
 assert.match(stripOf(frame(viewState(s,{plan:plan([])}))),/Everything is in sync/);
 s.inventory[0].complete=false;s.inventory[0].error='Folder not found';
 const html=frame(viewState(s,{plan:plan([],4,['Codex: Folder not found'])})),strip=stripOf(html);
 assert.doesNotMatch(html,/Everything is in sync/);assert.match(strip,/Codex cannot be read/);assert.deepEqual(actionsOf(barOf(html)),['check']);
 assert.match(statusOf(html),/A harness cannot be read/);
});
test('while an apply runs the strip says what it applies and only Check now is left, disabled',()=>{
 const html=frame(viewState(snapshot(),{plan:plan([op('update','1','2')]),applying:{index:0,total:1,name:'Pack <b>'}})),strip=stripOf(html);
 assert.match(strip,/Applying 1 change…/);assert.match(strip,/Pack &lt;b&gt;/);assert.doesNotMatch(barOf(html),/data-action="(review|apply-all)"/);assert.match(barOf(html),/data-action="check"[^>]*disabled/);
});
test('names, sources, harnesses, check errors and failures are escaped on the Sync page',()=>{
 const s=snapshot();s.registry.plugins=[{...plugin,name:'<b>Evil</b>',source:'x"><i>y'}];s.registry.targets[0].name='<u>Harness</u>';
 const html=frame(viewState(s,{error:'<img src=x>',checkErrors:[{plugin_id:'pkg',message:'<script>'}]}));
 for(const raw of ['<b>Evil','<u>Harness','<img src=x>','<script>','"><i>'])assert.ok(!html.includes(raw),`${raw} is escaped`);
 for(const text of ['&lt;b&gt;Evil','&lt;u&gt;Harness','&lt;script&gt;'])assert.ok(html.includes(text),text);
 assert.match(html,/1 source could not be checked/);assert.doesNotMatch(html,/<img src=x>|That did not complete/,'a failed operation is a notice of the app, not a note of the page');
});
test('a plugin row opens its dialog, a column header its harness, and each cell reads the held plan',()=>{
 const html=frame(viewState(snapshot(),{plan:plan([op('update','1','2')])}));
 assert.match(html,/data-action="open-plugin" data-id="pkg"/);assert.match(html,/data-action="edit-target" data-id="target"/);
 assert.match(html,/Update 1 → 2/);assert.match(html,/data-action="review" data-id="target"[^>]*>[\s\S]*?Sync 1 change/);
 assert.match(frame(viewState(snapshot(),{plan:plan([],4)})),/Update 1 → 2/,'without an operation the snapshot still says update');
});
test('a paused harness reads Paused in its column and in each of its cells',()=>{
 const s=snapshot();s.registry.targets[0].enabled=false;
 const html=frame(viewState(s,{plan:plan([])}));assert.equal(html.match(/>Paused</g)?.length,2);assert.match(stripOf(html),/No harness is managed/);
});
test('without a snapshot the frame is an empty state that offers Try again',()=>{
 const html=frame(viewState(null,{error:'Service not answering'}));assert.match(html,/Registry not available/);assert.match(html,/Service not answering/);assert.match(html,/data-action="refresh"/);assert.doesNotMatch(html,/class="im-summary/);
});

test('reviewSheet lists the operations by harness, the blockers as left out, and the removals it will make',()=>{
 const s=viewState(snapshot()),p=plan([op('install','','2','a'),op('update','1','2','b'),op('remove','1','','')],4,['Codex / D: no <build>']),html=reviewSheet(s,p,null);
 assert.match(html,/<h2 id="dlg-title">Review changes<\/h2>/);assert.match(html,/Install[\s\S]*Update[\s\S]*Remove/);assert.match(html,/Not ready yet/);assert.match(html,/no &lt;build&gt;/);assert.match(html,/It is left out of this sync\./);
 assert.match(html,/1 plugin will be uninstalled\./);assert.match(html,/data-action="apply"[^>]*>Apply and uninstall 1 plugin/);assert.doesNotMatch(html,/Apply and uninstall 1 plugin…/);assert.doesNotMatch(html,/Apply 3 changes/);
 assert.match(html,/data-action="apply-keep"[^>]*>Apply without uninstalling/);
 assert.match(reviewSheet(s,p,null,s.snapshot!.registry.targets[0]),/<h2 id="dlg-title">Sync Codex<\/h2>[\s\S]*Only the changes of this harness\./);
});
test('reviewSheet with nothing ready has no Apply, and an apply in progress locks the sheet',()=>{
 const s=viewState(snapshot()),none=reviewSheet(s,plan([],4,['Codex: broken']),null);
 assert.match(none,/No change is ready to apply\./);assert.match(none,/Not ready yet/);assert.doesNotMatch(none,/data-action="apply"/);assert.match(none,/>Close</);
 const running=reviewSheet(s,plan([op('update','1','2','a'),op('install','','2','b')],4,['x']),{index:1});
 assert.match(running,/Applying 2 changes…/);assert.match(running,/data-action="apply"[^>]*disabled/);assert.match(running,/data-close[^>]*disabled/);assert.doesNotMatch(running,/Not ready yet/);assert.equal(running.match(/class="im-spinner"/g)?.length,1,'the first is done, the second runs');
 assert.match(reviewSheet(viewState(snapshot(),{error:'Plan has blockers'}),plan([op('update','1','2')]),null),/role="alert">Plan has blockers/);
});

test('sw and seg carry what their change or click runs, and escape their text',()=>{
 const on=sw(true,'Automatic <sync>','toggle','auto');
 assert.match(on,/role="switch" aria-checked="true" aria-label="Automatic &lt;sync&gt;" data-action="toggle" data-id="auto"/);assert.match(sw(false,'x','toggle'),/aria-checked="false"/);
 const group=seg('filter','action',[['all','All'],['action','Needs <action>']],'Filter plugins');
 assert.match(group,/role="radiogroup" aria-label="Filter plugins"/);assert.match(group,/value="action" checked/);assert.doesNotMatch(group,/value="all" checked/);assert.match(group,/Needs &lt;action&gt;/);
 assert.match(button('Go','run',{id:'a"b',sm:true}),/class="im-btn im-btn--sm" data-action="run" data-id="a&quot;b"/);assert.match(button('Go','run',{disabled:true}),/disabled/);assert.match(button('Go','run',{busy:true}),/class="im-spinner"/);
});

test('every action has one owner: no two page modules, and none of them the app, declare the same name',()=>{
 const names=Object.values(modules).flatMap(m=>Object.keys(m.actions));
 assert.equal(new Set(names).size,names.length,'a name is declared twice: '+names.filter((n,i)=>names.indexOf(n)!==i));
 for(const reserved of ['page','refresh'])assert.ok(!names.includes(reserved),`${reserved} belongs to app.ts`);
 for(const wanted of ['check','review','apply','apply-all','open-plugin','edit-target','add-plugin','add-target','manage-found','rescan'])assert.ok(names.includes(wanted),`${wanted} is declared`);
});

// Owner, 2026-11-21: Marionette read "HEAD" and "No version" in Sync, which said neither what it was on nor what was missing.
test('a plugin on its latest commit shows the versions its builds declare and the commit, never HEAD',()=>{
 const head:Plugin={...plugin,policy:'head',upstream_version:'HEAD',upstream_revision:'4ae20142bd43bfdd98d1e3762d8fc1d8730bd177'};
 assert.deepEqual(versionOf(head),{version:'2',commit:'@4ae2014'});
 assert.deepEqual(versionOf({...head,distributions:[]}),{version:'@4ae2014',commit:''});
 assert.deepEqual(versionOf({...plugin,upstream_version:'marionette-v0.5.1'}),{version:'marionette-v0.5.1',commit:''});
 assert.deepEqual(versionOf(plugin),{version:'',commit:''});
 const folder:Plugin={...plugin,upstream_version:'local',distributions:[{harness:'codex',path:'/a',version:'1.0.0'},{harness:'pi',path:'/b',version:'1.0.0'}]};
 assert.deepEqual(versionOf(folder),{version:'1.0.0',commit:''});
 const s=snapshot();s.registry.plugins=[head];
 assert.match(rows(viewState(s)).replace(/<[^>]+>/g,' '),/ 2 +Latest commit · @4ae2014 /);
});
test('a harness with no build of a plugin says it needs one, in its cell and in its column',()=>{
 const s=snapshot(),p={...plugin,distributions:[]};s.registry.plugins=[p];
 const state=viewState(s);
 assert.match(cell(state,p,s.registry.targets[0]),/Needs a build/);
 const html=frame(state);
 assert.match(html,/1 plugin needs a build/);
 assert.doesNotMatch(html,/No version|without a version/);
});
// ---------- work package F: removals are confirmed by the person (design: confirmed removals, CUJ 1) ----------
/** CUJ 1: 1 install and 31 removals, of which 25 are records without files (`present: false`), 3 say `present: true` and 3 do not say: those 6 uninstall a real copy. */
const removal=(i:number,present?:boolean):Operation=>({target_id:'target',plugin_id:'',name:`old-${i}`,kind:'remove',from_version:'1',to_version:'',reason:'',...(present===undefined?{}:{present})});
const cuj1=(blockers:string[]=[]):Plan=>plan([op('install','','2'),...Array.from({length:31},(_,i)=>removal(i,i<25?false:i<28?true:undefined))],4,blockers);
test('removals counts the removals of a plan: those that uninstall a copy and those that clear a record without files; a missing field is a real uninstall',()=>{
 assert.deepEqual(removals(cuj1()),{total:31,uninstall:6,missing:25});
 assert.deepEqual(removals(plan([op('install','','2'),op('update','1','2')])),{total:0,uninstall:0,missing:0});
 assert.deepEqual(removals(plan([{...op('update','1','2'),present:false},removal(1)])),{total:1,uninstall:1,missing:0},'present only counts on a removal');
 assert.deepEqual(removals(plan([removal(1,false)])),{total:1,uninstall:0,missing:1});
 assert.deepEqual(removals(plan([])),{total:0,uninstall:0,missing:0});
});
test('removalLabel says what the removals do: CUJ 1 reads uninstall 6 and clear 25 without files, and the singular is 1 plugin or 1 record',()=>{
 assert.equal(removalLabel(cuj1()),'Apply, uninstall 6 and clear 25 without files');
 const only=(n:number,present?:boolean)=>plan([op('install','','2'),...Array.from({length:n},(_,i)=>removal(i,present))]);
 assert.equal(removalLabel(only(6)),'Apply and uninstall 6 plugins');
 assert.equal(removalLabel(only(1)),'Apply and uninstall 1 plugin');
 assert.equal(removalLabel(only(25,false)),'Apply and clear 25 records without files');
 assert.equal(removalLabel(only(1,false)),'Apply and clear 1 record without files');
 assert.equal(removalLabel(plan([removal(1),removal(2,false)])),'Apply, uninstall 1 and clear 1 without files');
 assert.equal(removalLabel(plan([op('install','','2'),op('update','1','2')])),'Apply 2 changes','without removals it is the plain count');
 assert.equal(removalLabel(plan([op('install','','2')])),'Apply 1 change');
});
test('applyPayload: a plan with removals sends confirm_removals equal to their number or skip_removals; one without sends neither; blockers send allow_blocked',()=>{
 const p=cuj1();
 assert.deepEqual(applyPayload(p,'confirm'),{plan_id:'plan',confirm_removals:31});
 assert.deepEqual(applyPayload(p,'skip'),{plan_id:'plan',skip_removals:true});
 const clear=plan([op('install','','2'),op('update','1','2')]);
 assert.deepEqual(applyPayload(clear,'confirm'),{plan_id:'plan'});assert.deepEqual(applyPayload(clear,'skip'),{plan_id:'plan'});
 assert.deepEqual(applyPayload(cuj1(['Codex: no build']),'confirm'),{plan_id:'plan',allow_blocked:true,confirm_removals:31});
 assert.deepEqual(applyPayload(cuj1(['Codex: no build']),'skip'),{plan_id:'plan',allow_blocked:true,skip_removals:true});
 assert.deepEqual(applyPayload(plan([op('install','','2')],4,['x']),'confirm'),{plan_id:'plan',allow_blocked:true});
 assert.equal(applyPayload(plan([removal(1)]),'confirm').confirm_removals,1,'the number is the plan\'s, not a flag');
});
test('appliedNotice says how many changes were applied and, when removals were left out, how many',()=>{
 assert.equal(appliedNotice(1,31),'1 change applied. 31 removals left out.');
 assert.equal(appliedNotice(1,1),'1 change applied. 1 removal left out.');
 assert.equal(appliedNotice(3,0),'3 changes applied.');assert.equal(appliedNotice(3),'3 changes applied.');
});
test('mustReview: a fresh plan with removals, blockers, nothing to do or that differs from the one shown opens the review; only the same plan without them is applied at once',()=>{
 const same=plan([op('update','1','2')]);
 assert.equal(mustReview(same,plan([op('update','1','2')])),false);
 assert.equal(mustReview(cuj1(),cuj1()),true,'a removal is never applied without the sheet, even when it is what was shown');
 assert.equal(mustReview(same,plan([op('update','1','2')],4,['Codex: no build'])),true);
 assert.equal(mustReview(same,plan([])),true);
 assert.equal(mustReview(same,plan([op('update','1','3')])),true);
 assert.equal(mustReview(null,plan([op('update','1','2')])),true,'nothing was shown');
 assert.equal(mustReview(same,plan([op('update','1','2'),removal(1)])),true);
});
test('the review sheet of CUJ 1 confirms with the label of what the removals do and offers Apply without uninstalling beside it; with only removals it offers no second button',()=>{
 const s=viewState(snapshot()),html=reviewSheet(s,cuj1(),null);
 assert.match(html,/data-action="apply"[^>]*>Apply, uninstall 6 and clear 25 without files<\/button>/);
 assert.match(html,/data-action="apply-keep"[^>]*>Apply without uninstalling<\/button>/);
 assert.equal(html.match(/data-action="apply-keep"/g)?.length,1);assert.match(html,/31 plugins will be uninstalled\./,'the footer line is as it was');
 assert.match(html,/<button type="button" class="im-btn" data-close >Cancel<\/button><button type="button" class="im-btn" data-action="apply-keep" >Apply without uninstalling<\/button><button type="button" class="im-btn im-btn--primary" data-action="apply"/,'the same buttons the sheet already has, in that order');
 const onlyRemoving=reviewSheet(s,plan([removal(1),removal(2,false)]),null);
 assert.match(onlyRemoving,/data-action="apply"[^>]*>Apply, uninstall 1 and clear 1 without files<\/button>/);assert.doesNotMatch(onlyRemoving,/apply-keep|Apply without uninstalling/);
 const plain=reviewSheet(s,plan([op('install','','2'),op('update','1','2','b')]),null);
 assert.match(plain,/data-action="apply"[^>]*>Apply 2 changes<\/button>/);assert.doesNotMatch(plain,/apply-keep|will be uninstalled/);
 const running=reviewSheet(s,cuj1(),{index:1});
 assert.match(running,/data-action="apply"[^>]*disabled[^>]*>Applying 32 changes…/);assert.match(running,/data-action="apply-keep"[^>]*disabled/);
 assert.equal(html.match(/<span class="im-chip" data-im-tone="err">Remove<\/span>/g)?.length,31,'every removal is a line of the sheet');
});

/** The page's own flow for Apply all, the sheet's two buttons and the notice, over the calls a stub transport records: nothing here is the service. */
function applyApp(fresh:Plan,shown:Plan|null){
 const calls:{action:string;payload?:Record<string,unknown>}[]=[],notes:string[]=[],dialogs:string[]=[],state=viewState(snapshot(),{plan:shown});
 const app={state,
  request:async(action:string,payload?:Record<string,unknown>)=>{calls.push({action,payload});
   if(action==='plan')return fresh;
   if(action==='apply')return {...snapshot(),skipped_removals:payload?.skip_removals===true?fresh.operations.filter(o=>o.kind==='remove').length:0};
   throw new Error('Unexpected '+action);},
  run:async(_label:string,work:()=>Promise<unknown>,after?:(v:never)=>void|Promise<void>)=>{if(state.busy)return;state.busy='x';try{const v=await work();await after?.(v as never);}finally{state.busy=null;}},
  adopt:()=>{},replan:async()=>{},render:()=>{},closeDialog:()=>{dialogs.push('closed');},
  openDialog:(html:string)=>{dialogs.push(html);return {} as HTMLDialogElement;},notify:(text:string)=>{notes.push(text);}} as unknown as App;
 return {app,calls,notes,dialogs,state};
}
test('Apply all opens the review sheet whenever the fresh plan has a removal, even when it is the plan shown, and applies nothing',async()=>{
 const p=cuj1(),t=applyApp(p,p);
 await syncActions['apply-all'](t.app,{} as DOMStringMap,{} as HTMLElement);
 assert.deepEqual(t.calls.map(c=>c.action),['plan'],'no apply was sent');
 assert.equal(t.dialogs.length,1);assert.match(t.dialogs[0],/Apply, uninstall 6 and clear 25 without files/);assert.equal(t.state.review?.plan.id,'plan');
});
test('Apply all still applies at once a fresh plan with no removal that is the plan shown, and sends neither removal field',async()=>{
 const p=plan([op('update','1','2')]),t=applyApp(p,p);
 await syncActions['apply-all'](t.app,{} as DOMStringMap,{} as HTMLElement);
 assert.deepEqual(t.calls,[{action:'plan',payload:undefined},{action:'apply',payload:{plan_id:'plan'}}]);
 assert.deepEqual(t.notes,['1 change applied.']);assert.deepEqual(t.dialogs,[]);
});
test('from the sheet, Apply sends confirm_removals equal to the plan\'s removals and Apply without uninstalling sends skip_removals and says what it left out',async()=>{
 const p=cuj1(),confirm=applyApp(p,p);confirm.state.review={plan:p,target_id:null};
 await syncActions.apply(confirm.app,{} as DOMStringMap,{} as HTMLElement);
 assert.deepEqual(confirm.calls,[{action:'apply',payload:{plan_id:'plan',confirm_removals:31}}]);assert.deepEqual(confirm.notes,['32 changes applied.']);
 const keep=applyApp(p,p);keep.state.review={plan:p,target_id:null};
 await syncActions['apply-keep'](keep.app,{} as DOMStringMap,{} as HTMLElement);
 assert.deepEqual(keep.calls,[{action:'apply',payload:{plan_id:'plan',skip_removals:true}}]);assert.deepEqual(keep.notes,['1 change applied. 31 removals left out.']);
 assert.equal(keep.state.applying,null);assert.equal(keep.state.review,null);
});
test('the one-harness review of a plan with removals confirms that plan\'s own number',async()=>{
 const p=plan([removal(1),removal(2,false),removal(3,false)]),t=applyApp(p,null);t.state.review={plan:p,target_id:'target'};
 await syncActions.apply(t.app,{} as DOMStringMap,{} as HTMLElement);
 assert.deepEqual(t.calls,[{action:'apply',payload:{plan_id:'plan',confirm_removals:3}}]);
});
test('every action the review sheet names has an owner: apply and apply-keep',()=>{
 for(const wanted of ['apply','apply-keep'])assert.ok(Object.values(modules).some(m=>wanted in m.actions),`${wanted} is declared`);
});

// The tones of the canon: a note and a message take ok, warn, err or info; the accent stays a tone of data (a chip, a dot, a summary), and good, bad and danger are gone.
const TONES=['ok','warn','err','info'];
const toneFindings=(html:string)=>[...html.matchAll(/<(\w+)\b([^>]*?)\bdata-im-tone="([^"]*)"[^>]*>/g)].filter(([,,attrs,value])=>{
 if(value===''||TONES.includes(value))return false;
 const data=value==='accent'&&/\bclass="[^"]*\bim-(chip|dot|summary)\b/.test(attrs+' ');
 return !data;
}).map(m=>m[0].slice(0,120));
test('the tone check itself reads an accent note, a good chip and a danger tone as findings, and an accent chip as data',()=>{
 assert.equal(toneFindings('<div class="im-note" data-im-tone="accent">').length,1);
 assert.equal(toneFindings('<span class="im-chip" data-im-tone="good">').length,1);
 assert.equal(toneFindings('<span class="im-chip" data-im-tone="danger">').length,1);
 assert.equal(toneFindings('<span class="im-chip" data-im-tone="accent"><span class="im-dot" data-im-tone="accent"><section class="im-summary" data-im-tone="accent">').length,0);
 assert.equal(toneFindings('<span class="im-chip" data-im-tone="warn"><b data-im-tone="">').length,0);
});
test('every page, state and sheet writes data-im-tone only in the four tones, and the accent only on a chip, a dot or a summary',()=>{
 const shells:string[]=[];
 const all=(over:Partial<ViewState>)=>{
  for(const page of ['sync','projects','activity','settings'] as const){const s=snapshot();s.sync=recordedSync({pending:2,errors:1});s.registry.settings.ai={engine:'harness',harness:'claude-code',budget_usd:1,api_base:'',model:'',api_key_env:''};shells.push(frame(viewState(s,{page,projects:blankProjects(),project:null,autostart:{supported:true,enabled:false,current:false},...over})));}
 };
 all({});all({plan:plan([op('install','','2'),op('update','1','2','b'),op('reinstall','2','2','c'),op('activate','1','1','d'),op('remove','1','')])});
 all({applying:{index:0,total:1,name:'Package'},plan:plan([op('update','1','2')])});all({checking:true});all({busy:'Syncing…',error:'Failed'});
 all({checkErrors:[{plugin_id:'pkg',message:'x'}],discoveryError:'x'});all({plan:plan([],4,['blocked'])});
 const unread=snapshot();unread.inventory[0].complete=false;shells.push(frame(viewState(unread,{projects:blankProjects(),project:null})));
 const none=snapshot();none.registry.targets=[];shells.push(frame(viewState(none,{projects:blankProjects(),project:null})));
 const ok=snapshot();ok.sync=recordedSync({pending:0});shells.push(frame(viewState(ok,{projects:blankProjects(),project:null})));
 const v=viewState(snapshot(),{projects:blankProjects(),project:null,plan:plan([op('install','','2'),op('update','1','2'),op('remove','1','','')],4,['blocked'])});
 shells.push(reviewSheet(v,v.plan!,null),reviewSheet(v,v.plan!,{index:1}),pluginPanel(v),pluginPanel(v,plugin),harnessPanel(v),harnessPanel(v,v.snapshot!.registry.targets[0]),adaptDialog(v,plugin));
 assert.ok(shells.length>=20);
 assert.deepEqual(shells.flatMap(toneFindings),[]);
});

test('every state of the strip, and of the empty list, has at most one primary action in the window',()=>{
 const base=()=>{const s=snapshot();s.registry.settings.ai={engine:'harness',harness:'claude-code',budget_usd:1,api_base:'',model:'',api_key_env:''};return s;};
 const states:ViewState[]=[];
 const add=(mut:(s:Snapshot)=>void,over:Partial<ViewState>={})=>{const s=base();mut(s);states.push(viewState(s,{projects:blankProjects(),project:null,...over}));};
 add(()=>{});add(s=>{s.sync=recordedSync({pending:3});});add(s=>{s.sync=recordedSync({pending:0,blockers:2});});add(s=>{s.sync=recordedSync({pending:0,errors:2});});
 add(s=>{s.sync=recordedSync({pending:0});});add(s=>{s.registry.targets=[];});add(s=>{s.registry.plugins=[];});add(s=>{s.inventory[0].complete=false;});
 add(()=>{},{plan:plan([op('update','1','2')])});add(()=>{},{checking:true});add(()=>{},{applying:{index:0,total:1,name:'Package'},plan:plan([op('update','1','2')])});
 for(const state of states){const html=frame(state);assert.ok((html.match(/im-btn--primary/g)?.length??0)<=1,'at most one primary action: '+stripOf(html).slice(0,120));}
});
