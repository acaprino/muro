import test from 'node:test';
import assert from 'node:assert/strict';
import { listedPlugin, listing, pluginState, filterPlugins, cellState, harnessState, syncSummary, syncHeadline, sameOperations, unlisted, exclusiveMode, intervalOptions, stamp } from '../src/model.ts';
import type { Snapshot, Plugin, Plan, Operation, ViewState } from '../src/types.ts';
import { frame, modules } from '../src/views.ts';
import { reviewSheet } from '../src/sheets.ts';
import { when, sw, seg, button } from '../src/ui.ts';
import { storedTheme, resolveTheme } from '../src/look.ts';

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

const stripOf=(html:string)=>html.match(/<section class="strip[\s\S]*?<\/section>/)?.[0]||'';
const actionsOf=(html:string)=>html.match(/data-action="[a-z-]+"/g)?.map(a=>a.slice(13,-1));
test('the frame is an app bar with three tabs and a state button, no sidebar; Sync is current',()=>{
 const html=frame(viewState(snapshot()));
 assert.equal(html.match(/data-action="page" data-id="[a-z]+"/g)?.length,4,'three tabs and the state button');
 assert.match(html,/data-id="sync" aria-current="page"/);assert.doesNotMatch(html,/data-id="activity" aria-current/);
 assert.doesNotMatch(html,/class="(sidebar|topbar|bottom|shell)/);assert.match(html,/<header class="appbar">/);assert.match(html,/<main id="main"/);
});
test('the strip says Not checked yet and offers only Check now when nothing was recorded for this revision, and for a plan of another revision',()=>{
 for(const held of [null,plan([op('update','1','2')],3)]){const strip=stripOf(frame(viewState(snapshot(),{plan:held})));assert.match(strip,/Not checked yet/);assert.deepEqual(actionsOf(strip),['check']);}
});
test('a recorded check shows on open: its count, Review and Apply all, and no text built from a plan that is not there',()=>{
 const s=snapshot();s.sync=recordedSync({pending:3});
 const html=frame(viewState(s)),strip=stripOf(html);
 assert.match(strip,/<strong>3 changes ready to apply<\/strong>/);
 assert.match(strip,/<small>Nothing changes until you apply\.<\/small>/,'no leading full stop, no breakdown');
 assert.deepEqual(actionsOf(strip),['check','review','apply-all']);assert.match(strip,/Apply all 3 changes/);
 assert.doesNotMatch(strip,/Not checked yet/);assert.doesNotMatch(strip,/Last check <b>never/);
 assert.match(html,/3 changes waiting · checked /,'the app bar button agrees');
 assert.match(html,/aria-label="Sync, 3 changes waiting"/,'and so does the tab badge');
 s.sync=recordedSync({pending:2,blockers:1});
 assert.match(stripOf(frame(viewState(s))),/<small>1 item not ready yet\. Nothing changes until you apply\.<\/small>/);
});
test('a recorded check with blockers or sources not checked or nothing to do reads as such',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';
 s.sync=recordedSync({pending:0,blockers:2});
 const blocked=stripOf(frame(viewState(s)));assert.match(blocked,/Some plugins are not ready/);assert.match(blocked,/2 items are not ready yet/);assert.doesNotMatch(blocked,/<small>\./);assert.deepEqual(actionsOf(blocked),['check','review']);
 s.sync=recordedSync({pending:0,errors:2});
 const sources=stripOf(frame(viewState(s)));assert.match(sources,/<strong>2 sources could not be checked<\/strong>/);assert.doesNotMatch(sources,/Everything is in sync/);assert.deepEqual(actionsOf(sources),['check']);assert.match(sources,/class="btn primary" data-action="check"/,'Check now leads');
 assert.match(frame(viewState(s)),/Sources not checked/,'the app bar button says it too');
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
 const strip=stripOf(frame(viewState(snapshot(),{plan:plan([op('update','1','2')],4,['Codex / D: no build'])})));
 assert.match(strip,/1 change ready to apply/);assert.match(strip,/1 update · 1 item not ready yet/);
 assert.deepEqual(actionsOf(strip),['check','review','apply-all']);assert.match(strip,/Apply all 1 change/);
});
test('the strip never says everything is in sync while a harness cannot be read',()=>{
 const s=snapshot();s.inventory[0].plugins[0].version='2';
 assert.match(stripOf(frame(viewState(s,{plan:plan([])}))),/Everything is in sync/);
 s.inventory[0].complete=false;s.inventory[0].error='Folder not found';
 const html=frame(viewState(s,{plan:plan([],4,['Codex: Folder not found'])})),strip=stripOf(html);
 assert.doesNotMatch(html,/Everything is in sync/);assert.match(strip,/Codex cannot be read/);assert.deepEqual(actionsOf(strip),['check']);
 assert.match(html,/A harness cannot be read/);
});
test('while an apply runs the strip says what it applies and only Check now is left, disabled',()=>{
 const strip=stripOf(frame(viewState(snapshot(),{plan:plan([op('update','1','2')]),applying:{index:0,total:1,name:'Pack <b>'}})));
 assert.match(strip,/Applying 1 change…/);assert.match(strip,/Pack &lt;b&gt;/);assert.doesNotMatch(strip,/data-action="(review|apply-all)"/);assert.match(strip,/data-action="check"[^>]*disabled/);
});
test('names, sources, harnesses, check errors and failures are escaped on the Sync page',()=>{
 const s=snapshot();s.registry.plugins=[{...plugin,name:'<b>Evil</b>',source:'x"><i>y'}];s.registry.targets[0].name='<u>Harness</u>';
 const html=frame(viewState(s,{error:'<img src=x>',checkErrors:[{plugin_id:'pkg',message:'<script>'}]}));
 for(const raw of ['<b>Evil','<u>Harness','<img src=x>','<script>','"><i>'])assert.ok(!html.includes(raw),`${raw} is escaped`);
 for(const text of ['&lt;b&gt;Evil','&lt;u&gt;Harness','&lt;img src=x&gt;','&lt;script&gt;'])assert.ok(html.includes(text),text);
 assert.match(html,/1 source could not be checked/);assert.match(html,/Reload/);
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
 const html=frame(viewState(null,{error:'Service not answering'}));assert.match(html,/Registry not available/);assert.match(html,/Service not answering/);assert.match(html,/data-action="refresh"/);assert.doesNotMatch(html,/class="strip/);
});

test('reviewSheet lists the operations by harness, the blockers as left out, and the removals it will make',()=>{
 const s=viewState(snapshot()),p=plan([op('install','','2','a'),op('update','1','2','b'),op('remove','1','','')],4,['Codex / D: no <build>']),html=reviewSheet(s,p,null);
 assert.match(html,/<h2 id="dlg-title">Review changes<\/h2>/);assert.match(html,/Install[\s\S]*Update[\s\S]*Remove/);assert.match(html,/Not ready yet/);assert.match(html,/no &lt;build&gt;/);assert.match(html,/It is left out of this sync\./);
 assert.match(html,/1 plugin will be uninstalled\./);assert.match(html,/data-action="apply"[^>]*>Apply 3 changes/);assert.doesNotMatch(html,/Apply 3 changes…/);
 assert.match(reviewSheet(s,p,null,s.snapshot!.registry.targets[0]),/<h2 id="dlg-title">Sync Codex<\/h2>[\s\S]*Only the changes of this harness\./);
});
test('reviewSheet with nothing ready has no Apply, and an apply in progress locks the sheet',()=>{
 const s=viewState(snapshot()),none=reviewSheet(s,plan([],4,['Codex: broken']),null);
 assert.match(none,/No change is ready to apply\./);assert.match(none,/Not ready yet/);assert.doesNotMatch(none,/data-action="apply"/);assert.match(none,/>Close</);
 const running=reviewSheet(s,plan([op('update','1','2','a'),op('install','','2','b')],4,['x']),{index:1});
 assert.match(running,/Applying 2 changes…/);assert.match(running,/data-action="apply"[^>]*disabled/);assert.match(running,/data-close[^>]*disabled/);assert.doesNotMatch(running,/Not ready yet/);assert.equal(running.match(/class="spin"/g)?.length,1,'the first is done, the second runs');
 assert.match(reviewSheet(viewState(snapshot(),{error:'Plan has blockers'}),plan([op('update','1','2')]),null),/role="alert">Plan has blockers/);
});

test('sw and seg carry what their change or click runs, and escape their text',()=>{
 const on=sw(true,'Automatic <sync>','toggle','auto');
 assert.match(on,/role="switch" aria-checked="true" aria-label="Automatic &lt;sync&gt;" data-action="toggle" data-id="auto"/);assert.match(sw(false,'x','toggle'),/aria-checked="false"/);
 const group=seg('filter','action',[['all','All'],['action','Needs <action>']],'Filter plugins');
 assert.match(group,/role="radiogroup" aria-label="Filter plugins"/);assert.match(group,/value="action" checked/);assert.doesNotMatch(group,/value="all" checked/);assert.match(group,/Needs &lt;action&gt;/);
 assert.match(button('Go','run',{id:'a"b',sm:true,accent:true}),/class="btn accent sm" data-action="run" data-id="a&quot;b"/);assert.match(button('Go','run',{disabled:true}),/disabled/);assert.match(button('Go','run',{busy:true}),/class="spin"/);
});

test('every action has one owner: no two page modules, and none of them the app, declare the same name',()=>{
 const names=Object.values(modules).flatMap(m=>Object.keys(m.actions));
 assert.equal(new Set(names).size,names.length,'a name is declared twice: '+names.filter((n,i)=>names.indexOf(n)!==i));
 for(const reserved of ['page','refresh'])assert.ok(!names.includes(reserved),`${reserved} belongs to app.ts`);
 for(const wanted of ['check','review','apply','apply-all','open-plugin','edit-target','add-plugin','add-target','manage-found','rescan'])assert.ok(names.includes(wanted),`${wanted} is declared`);
});
