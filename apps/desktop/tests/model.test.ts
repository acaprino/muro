import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessWarnings, listedPlugin, listing, inList, pluginState, filterPlugins, cellState, harnessState, syncSummary, syncHeadline, sameOperations, unlisted, exclusiveMode, intervalOptions, stamp, versionOf, removals, removalLabel, applyPayload, appliedNotice, mustReview } from '../src/model.ts';
import type { Snapshot, Plugin, Plan, Operation, Target, InstalledPlugin } from '../src/types.ts';

// The rules of the window's model (src/model.ts): what a snapshot and a plan say of each plugin, harness and sync. Plan R0, Task 6 took out of this file what tested the
// Imago window's strings (the frame, the Sync page, the sheets, the buttons, the theme of look.ts): the pages come back in R1 to R3 with their own tests.

const plugin: Plugin = {id:'pkg',name:'Package',source:'owner/pkg',policy:'stable',pinned_version:'',targets:['target'],distributions:[{harness:'codex',path:'/artifact',version:'2'}]};
function snapshot(): Snapshot {return {registry:{schema:1,revision:4,plugins:[plugin],targets:[{id:'target',harness:'codex',name:'Codex',root:'/profile',executable:'codex',exclusive:false,enabled:true}],settings:{auto_sync:false,interval_minutes:60,close_to_tray:true,agent:'claude-code',python:'python',factory_path:''}},inventory:[{target_id:'target',complete:true,supported:true,error:null,plugins:[{id:'pkg',name:'Package',version:'1',path:'/plugin',managed:true}]}],activity:[],sync:{last_check:null,last_sync:null,revision:null,pending:null,blockers:null,errors:null,targets:{}}};}

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
test('cellState: a plugin with no distribution for the harness of the target is unavailable there, never to build',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.equal(cellState({...plugin,distributions:[{harness:'pi',path:'/x',version:'2'}]},t,s,null).kind,'unavailable');
 assert.equal(cellState({...plugin,distributions:[]},t,s,null).kind,'unavailable');
 assert.equal(cellState({...plugin,distributions:[{harness:'codex',path:'',version:'2'}]},t,s,null).kind,'unavailable');
});
test('a Hermes server component cannot stand in for its main plugin in the Sync table', () => {
  const s = snapshot(), target = { ...s.registry.targets[0], harness: 'hermes' };
  const packagePlugin = { ...plugin, distributions: [{ harness: 'hermes', path: '/hermes', version: '2' }] };
  const main = s.inventory[0].plugins[0];
  const server = { ...main, id: 'server', registry_id: plugin.id, component: 'hermes-mcp', version: '2' };
  s.inventory[0].plugins = [server, main];
  assert.equal(cellState(packagePlugin, target, s, null).kind, 'update');
  s.inventory[0].plugins = [server];
  assert.equal(cellState(packagePlugin, target, s, null).kind, 'install');
});
test('cellState: an unreadable inventory or unreadable instructions are unknown, never ok',()=>{
 const t=snapshot().registry.targets[0],ok=snapshot();ok.inventory[0].plugins[0].version='2';
 const incomplete=snapshot();incomplete.inventory[0].plugins[0].version='2';incomplete.inventory[0].complete=false;
 const unsupported=snapshot();unsupported.inventory[0].plugins[0].version='2';unsupported.inventory[0].supported=false;
 const broken={...ok,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}]};
 assert.equal(cellState(plugin,t,ok,null).kind,'ok');
 for(const s of [incomplete,unsupported,broken])assert.equal(cellState(plugin,t,s,null).kind,'unknown');
});
test('cellState: changed instructions ask to adapt again for their harness only',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const stale=(h:string)=>({...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'new',stale_harnesses:[h]}]});
 assert.equal(cellState(plugin,t,stale('codex'),null).kind,'adapt-again');
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
 assert.deepEqual(harnessState(t,s,plan([op('update','1','2')],3)),{kind:'not-checked',count:0},'a plan of another revision checked nothing current: never in sync');
 s.sync={...s.sync,revision:4,pending:0};
 assert.deepEqual(harnessState(t,s,null),{kind:'ok',count:0},'a recorded check of this revision with nothing pending is');
});
test('a refused archive check explains its selected cells even with an old installed build', () => {
  const s = snapshot(), target = s.registry.targets[0];
  const broken = { ...plugin, project_source_error: 'The plugin build differs from its project.' };
  s.registry.plugins = [broken];
  s.inventory[0].plugins[0].version = '2';
  assert.deepEqual(cellState(broken, target, s, null), {kind:'source-error',reason:broken.project_source_error});
  assert.equal(harnessState(target, s, null).kind, 'source-error');
  assert.equal(pluginState(broken, s).kind, 'unknown');
  assert.equal(syncHeadline(s, plan([])).kind, 'projects', 'a project file that needs attention is not a source that did not answer');
  s.inventory[0].plugins = [];
  assert.equal(cellState(broken, target, s, plan([])).kind, 'source-error');
  assert.equal(cellState({...broken,targets:[]}, target, s, null).kind, 'none');
});
test('a main plugin and its server count as two changes in the same row and target', () => {
  const s = snapshot(), target = s.registry.targets[0];
  const pair = plan([op('install','','2'), {...op('install','','2'), name:'Package MCP'}]);
  assert.deepEqual(cellState(plugin, target, s, pair), {kind:'changes',count:2});
  assert.deepEqual(harnessState(target, s, pair), {kind:'changes',count:2});
  assert.equal(syncSummary(s, pair).operations, 2);
});
test('harnessState reports the plugins not available on the harness, after the changes and after those to adapt again',()=>{
 const s=snapshot(),t=s.registry.targets[0],bare={...plugin,id:'bare',name:'Bare',distributions:[]};s.registry.plugins=[plugin,bare];s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessState(t,s,null),{kind:'unavailable',count:1});
 const stale={...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'new',stale_harnesses:['codex']}]};
 assert.deepEqual(harnessState(t,stale,null),{kind:'adapt-again',count:1});
 assert.deepEqual(harnessState(t,s,plan([op('reinstall','2','2')])),{kind:'changes',count:1});
});
test('harnessState: a plugin whose instructions cannot be read keeps the harness from reading as in sync',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const broken={...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'',stale_harnesses:[],error:'Unreadable Markdown'}]};
 assert.deepEqual(harnessState(t,broken,plan([])),{kind:'unknown',count:1});
});

test('syncSummary: no enabled harness',()=>{
 const s=snapshot();s.registry.targets[0].enabled=false;
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')])),{kind:'no-harness',operations:0,blockers:0,errors:0,projects:0,byKind:{}});
 s.registry.targets=[];assert.equal(syncSummary(s,null).kind,'no-harness');
});
test('a plan of another revision counts as not checked',()=>{
 const s=snapshot(),empty={kind:'not-checked',operations:0,blockers:0,errors:0,projects:0,byKind:{}};
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')],3,['Codex: broken'])),empty);
 assert.deepEqual(syncSummary(s,null),empty);
});
test('syncSummary counts the operations of a current plan by kind, and its blockers',()=>{
 const s=snapshot();
 assert.deepEqual(syncSummary(s,plan([op('install','','2','a'),op('update','1','2','b'),op('update','1','2','c'),op('remove','1','','')],4,['Codex / D: no build'])),{kind:'changes',operations:4,blockers:1,errors:0,projects:0,byKind:{install:1,update:2,remove:1}});
 assert.deepEqual(syncSummary(s,plan([],4,['Codex / D: no build'])),{kind:'blocked',operations:0,blockers:1,errors:0,projects:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([])),{kind:'ok',operations:0,blockers:0,errors:0,projects:0,byKind:{}});
});

/** What the service recorded for the snapshot's own revision (4): the check a person has not seen in this window. */
const recordedSync=(over:Partial<Snapshot['sync']>={}):Snapshot['sync']=>({last_check:'1700000000',last_sync:null,revision:4,pending:3,blockers:0,errors:null,targets:{},...over});
test('with no plan of this revision the summary is the recorded check: its counts, with no breakdown',()=>{
 const s=snapshot();s.sync=recordedSync();
 assert.deepEqual(syncSummary(s,null),{kind:'changes',operations:3,blockers:0,errors:0,projects:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')],3)),{kind:'changes',operations:3,blockers:0,errors:0,projects:0,byKind:{}},'a plan of another revision is no plan');
 s.sync=recordedSync({pending:0,blockers:2});assert.deepEqual(syncSummary(s,null),{kind:'blocked',operations:0,blockers:2,errors:0,projects:0,byKind:{}});
 s.sync=recordedSync({pending:0});assert.deepEqual(syncSummary(s,null),{kind:'ok',operations:0,blockers:0,errors:0,projects:0,byKind:{}});
 s.sync=recordedSync({pending:2,blockers:1});assert.deepEqual(syncSummary(s,null),{kind:'changes',operations:2,blockers:1,errors:0,projects:0,byKind:{}});
});
test('a record of another revision, or of none, is not a check of this one',()=>{
 const empty=(kind:string)=>({kind,operations:0,blockers:0,errors:0,projects:0,byKind:{}}),s=snapshot();
 for(const over of [{revision:3},{revision:null},{revision:5}]){s.sync=recordedSync(over);assert.deepEqual(syncSummary(s,null),empty('changed'),`checked at ${JSON.stringify(over)}: the list changed since`);}
 s.sync=recordedSync({revision:3,last_check:null});assert.deepEqual(syncSummary(s,null),empty('not-checked'),'no check at all');
 s.sync=recordedSync({pending:null,blockers:null});assert.deepEqual(syncSummary(s,null),empty('not-checked'),'a record of this revision without counts');
 s.sync=recordedSync({errors:2,revision:3});assert.equal(syncSummary(s,null).errors,0,'errors recorded for another revision say nothing about this one');
});
test('a plan of this revision wins over the record',()=>{
 const s=snapshot();s.sync=recordedSync({pending:3});
 assert.deepEqual(syncSummary(s,plan([])),{kind:'ok',operations:0,blockers:0,errors:0,projects:0,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([op('install','','2')])),{kind:'changes',operations:1,blockers:0,errors:0,projects:0,byKind:{install:1}});
 s.registry.targets[0].enabled=false;assert.equal(syncSummary(s,null).kind,'no-harness','no harness still comes first');
});
test('the sources a check could not resolve are counted, with or without a plan',()=>{
 const s=snapshot();s.sync=recordedSync({pending:0,errors:2});
 assert.deepEqual(syncSummary(s,null),{kind:'ok',operations:0,blockers:0,errors:2,projects:0,byKind:{}});
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
 const {unreadable,kind,...counts}=syncHeadline(s,p);assert.equal(kind,'changes');assert.deepEqual(unreadable,[]);assert.deepEqual(counts,{operations:2,blockers:1,errors:0,projects:0,byKind:{install:1,remove:1}});
});
test('sameOperations compares the operations of two plans in any order, and never equates a missing plan',()=>{
 const a=plan([op('install','','2','a'),op('update','1','2','b')]),b=plan([op('update','1','2','b'),op('install','','2','a')],5);
 assert.equal(sameOperations(a,b),true);assert.equal(sameOperations(a,plan([op('install','','2','a')])),false);
 assert.equal(sameOperations(a,plan([op('install','','2','a'),op('update','1','3','b')])),false,'another version is another operation');
 assert.equal(sameOperations(a,plan([op('install','','2','a'),op('remove','1','','b')])),false,'another kind is another operation');
 assert.equal(sameOperations(null,null),false);assert.equal(sameOperations(a,null),false);assert.equal(sameOperations(plan([]),plan([])),true);
});

test('a column the record cannot describe is unseen, and never ok',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 s.sync=recordedSync({pending:2});
 assert.deepEqual(harnessState(t,s,null),{kind:'unseen',count:2});
 assert.equal(harnessState(t,s,plan([],4)).kind,'ok','a plan of this revision describes the column itself');
 s.sync=recordedSync({pending:0});assert.equal(harnessState(t,s,null).kind,'ok','nothing pending was recorded');
 s.sync=recordedSync({pending:2});s.inventory[0].plugins[0].version='1';
 assert.deepEqual(harnessState(t,s,null),{kind:'changes',count:1},'what the snapshot shows of its own is still shown');
 s.inventory[0].plugins[0].version='2';t.enabled=false;assert.equal(harnessState(t,s,null).kind,'paused');
});

// Owner, 2026-11-21: a plugin read "HEAD" and "No version" in Sync, which said neither what it was on nor what was missing.
test('a plugin on its latest commit shows the versions its builds declare and the commit, never HEAD',()=>{
 const head:Plugin={...plugin,policy:'head',upstream_version:'HEAD',upstream_revision:'4ae20142bd43bfdd98d1e3762d8fc1d8730bd177'};
 assert.deepEqual(versionOf(head),{version:'2',commit:'@4ae2014'});
 assert.deepEqual(versionOf({...head,distributions:[]}),{version:'@4ae2014',commit:''});
 assert.deepEqual(versionOf({...plugin,upstream_version:'sample-v0.5.1'}),{version:'sample-v0.5.1',commit:''});
 assert.deepEqual(versionOf(plugin),{version:'',commit:''});
 const folder:Plugin={...plugin,upstream_version:'local',distributions:[{harness:'codex',path:'/a',version:'1.0.0'},{harness:'pi',path:'/b',version:'1.0.0'}]};
 assert.deepEqual(versionOf(folder),{version:'1.0.0',commit:''});
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

// ---------- what an installed plugin becomes in the list (they were in setup.test.ts, which tested the first-run page as well) ----------
const listTarget: Target = { id: 't1', harness: 'claude-code', name: 'Claude Code', root: 'D:/config/claude-code', executable: 'claude', exclusive: false, enabled: true };
const listInstalled: InstalledPlugin = { id: 'native-commit-helper', name: 'commit-helper', version: '2.1.0', path: 'D:/plugins/commit-helper', managed: false };
const holding = (plugins: Plugin[] = []): Snapshot => ({ registry: { schema: 1, revision: 3, plugins, targets: [listTarget], settings: { auto_sync: false, interval_minutes: 60, close_to_tray: true, agent: 'claude-code', python: 'python', factory_path: '' } }, inventory: [], activity: [], sync: { last_check: null, last_sync: null, revision: null, pending: null, blockers: null, errors: null, targets: {} } } as unknown as Snapshot);

test('an installed plugin becomes a list entry kept at the version it has, built from its own folder', () => {
  const entry = listedPlugin(listInstalled, listTarget);
  assert.match(entry.id, /^[0-9a-f-]{36}$/, 'a new id the service accepts (letters, digits, dashes)');
  assert.deepEqual({ ...entry, id: '' }, { id: '', name: 'commit-helper', source: 'D:/plugins/commit-helper', policy: 'pinned', pinned_version: '2.1.0', targets: ['t1'], distributions: [{ harness: 'claude-code', path: 'D:/plugins/commit-helper', version: '2.1.0' }] });
  assert.notEqual(listedPlugin(listInstalled, listTarget).id, entry.id, 'every entry has an id of its own');
});

test('an installed plugin that reports no version cannot be pinned, so it follows the stable policy', () => {
  const entry = listedPlugin({ ...listInstalled, version: '' }, listTarget);
  assert.equal(entry.policy, 'stable');
  assert.equal(entry.pinned_version, '');
});

test('the list already holds a plugin Muro installed or one with a build in the folder it is installed in', () => {
  assert.equal(inList(holding(), listTarget, listInstalled), false, 'an empty list holds nothing');
  assert.equal(inList(holding(), listTarget, { ...listInstalled, managed: true }), true, 'Muro put it there');
  assert.equal(inList(holding([listedPlugin(listInstalled, listTarget)]), listTarget, listInstalled), true, 'an entry built from this folder');
  assert.equal(inList(holding([listedPlugin({ ...listInstalled, path: 'D:/plugins/other' }, listTarget)]), listTarget, listInstalled), false, 'another folder is another plugin');
  assert.equal(inList(holding([{ ...listedPlugin(listInstalled, listTarget), targets: ['t2'] }]), listTarget, listInstalled), false, 'an entry for another harness does not count');
  assert.equal(inList(holding([listedPlugin({ ...listInstalled, path: '' }, listTarget)]), listTarget, { ...listInstalled, path: '' }), false, 'no folder never matches by its emptiness');
});
// Owner, 2026-11-25, "Muro deve funzionare": a marketplace of Codex whose folder was gone made Sync say that Codex could not be read. The service now reads around it and says
// so in `warnings`: the harness is read, its state is what its plugins say, and the warning is told beside it.
test('harnessWarnings: what a harness cannot load is told with its harness, and the harness still reads as what its plugins say',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 assert.deepEqual(harnessWarnings(s),[],'a record without the field has none');
 s.inventory[0].warnings=['The marketplace old-notes points to a folder that is gone: D:/gone'];s.inventory[0].plugins[0].version='2';
 assert.deepEqual(harnessWarnings(s).map(w=>[w.target.id,w.message]),[['target','The marketplace old-notes points to a folder that is gone: D:/gone']]);
 assert.deepEqual(harnessState(t,s,plan([])),{kind:'ok',count:0},'read all the same: never "cannot be read" for a warning');
 assert.equal(syncHeadline(s,plan([])).kind,'ok');assert.deepEqual(syncHeadline(s,plan([])).unreadable,[]);
 assert.equal(cellState(plugin,t,s,plan([])).kind,'ok');
 s.registry.targets[0].enabled=false;assert.deepEqual(harnessWarnings(s),[],'a paused harness says nothing');
});
test('a broken marketplace to take out of a harness is a change of the plan, counted on its harness, and Apply all shows it first',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const out:Operation={target_id:'target',plugin_id:'',name:'old-notes',kind:'remove-marketplace',from_version:'',to_version:'',reason:'The marketplace old-notes points to a folder that is gone: D:/gone',plugins:['notes@old-notes']};
 const p=plan([out]);
 assert.deepEqual(harnessState(t,s,p),{kind:'changes',count:1});
 assert.deepEqual(syncSummary(s,p).byKind,{'remove-marketplace':1});assert.equal(syncHeadline(s,p).kind,'changes');
 assert.deepEqual(removals(p),{total:1,uninstall:1,missing:0},'it takes a plugin away: a removal the person confirms by its number');
 assert.deepEqual(applyPayload(p,'confirm'),{plan_id:p.id,confirm_removals:1});
 assert.deepEqual(applyPayload(p,'skip'),{plan_id:p.id,skip_removals:true},'Apply without uninstalling leaves it');
 assert.equal(removalLabel(p),'Apply and uninstall 1 plugin');
 assert.deepEqual(removals(plan([{...out,plugins:[]}])),{total:0,uninstall:0,missing:0},'an empty broken marketplace takes nothing away');
 assert.equal(mustReview(p,p),true,'the sheet names what goes with it');
});

test('cellState: a pair the current plan holds back is not ready, with its reason; one with no build stays not available and carries the reason',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 const held:Plan={...plan([]),blocked:[{target_id:'target',plugin_id:'pkg',reason:'Project file changed: open the project again'}]};
 assert.deepEqual(cellState(plugin,t,s,held),{kind:'blocked',reason:'Project file changed: open the project again'});
 assert.deepEqual(harnessState(t,s,held),{kind:'blocked',count:1});
 assert.deepEqual(cellState(plugin,t,s,{...held,revision:3}).kind,'ok','a plan of another revision holds nothing back');
 assert.deepEqual(cellState({...plugin,distributions:[]},t,s,held),{kind:'unavailable',reason:'Project file changed: open the project again'});
});
test('cellState: a record whose files are gone is put back, one turned off is not in sync',()=>{
 const s=snapshot(),t=s.registry.targets[0];s.inventory[0].plugins[0].version='2';
 s.inventory[0].plugins[0].present=false;
 assert.deepEqual(cellState(plugin,t,s,null),{kind:'update',from:'2',to:'2',reason:'Files missing'});
 s.inventory[0].plugins[0].present=true;s.inventory[0].plugins[0].enabled=false;
 assert.deepEqual(cellState(plugin,t,s,null),{kind:'disabled',from:'2',to:'2'});
 assert.deepEqual(harnessState(t,s,plan([])),{kind:'disabled',count:1});
});
test('cellState: instructions added to a plugin no one adapted ask for a first adaptation, not to adapt again',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 const stale={...s,custom_instructions:[{plugin_id:'pkg',path:'/i',files:['a.md'],digest:'new',stale_harnesses:['codex']}]};
 assert.deepEqual(cellState(plugin,t,stale,null),{kind:'adapt-again',from:'never'});
 const adapted={...plugin,distributions:[{harness:'codex',path:'/x',version:'2',origin:'muro' as const}]};
 assert.deepEqual(cellState(adapted,t,stale,null),{kind:'adapt-again'});
});
