import test from 'node:test';
import assert from 'node:assert/strict';
import { pluginState, summarize, filterPlugins, cellState, harnessState, syncSummary, unlisted, exclusiveMode, intervalOptions, stamp } from '../src/model.ts';
import type { Snapshot, Plugin, Plan, Operation } from '../src/types.ts';
import { frame } from '../src/views.ts';
import { pluginForm } from '../src/forms.ts';
import { when } from '../src/ui.ts';
import { storedLook, storedTheme, resolveTheme } from '../src/look.ts';

const plugin: Plugin = {id:'pkg',name:'Package',source:'owner/pkg',policy:'stable',pinned_version:'',targets:['target'],distributions:[{harness:'codex',path:'/artifact',version:'2'}]};
function snapshot(): Snapshot {return {registry:{schema:1,revision:4,plugins:[plugin],targets:[{id:'target',harness:'codex',name:'Codex',root:'/profile',executable:'codex',exclusive:false,enabled:true}],settings:{auto_sync:false,interval_minutes:60,close_to_tray:true,agent:'claude-code',python:'python',factory_path:''}},inventory:[{target_id:'target',complete:true,supported:true,error:null,plugins:[{id:'pkg',name:'Package',version:'1',path:'/plugin',managed:true}]}],activity:[],sync:{last_check:null,last_sync:null,revision:null,pending:null,blockers:null,targets:{}}};}
test('version drift requires an update',()=>assert.equal(pluginState(plugin,snapshot()).kind,'update'));
test('incomplete inventory is never marked missing or synchronized',()=>{const s=snapshot();s.inventory[0].complete=false;assert.equal(pluginState(plugin,s).kind,'unknown');});
test('unconfigured and missing distributions have separate states',()=>{const s=snapshot();assert.equal(pluginState({...plugin,targets:[]},s).kind,'unassigned');assert.equal(pluginState({...plugin,distributions:[]},s).kind,'prepare');});
test('summary counts actual external plugins and enabled targets',()=>{const s=snapshot();s.inventory[0].plugins.push({id:'other',name:'Other',version:'1',path:'/other',managed:false});assert.deepEqual(summarize(s),{plugins:1,targets:1,updates:1,external:1});});
test('filter searches source as well as name without interpreting intent',()=>assert.equal(filterPlugins([plugin],'OWNER','all',snapshot()).length,1));
test('external count stays unknown until all managed inventories are complete',()=>{const s=snapshot();s.inventory[0].complete=false;assert.equal(summarize(s).external,null);});

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

test('instruction folder, files and errors render as escaped text with an explicit open action',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'D:/<folder>',files:['custom-instructions/<script>.md'],digest:'',stale_harnesses:['codex'],error:'Cannot read <file>'}]};
 const html=frame({page:'registry',snapshot:s,discovered:[],discovering:false,plan:null,selected:'pkg',query:'',filter:'all',busy:null,error:null,discoveryError:null,maintenance:null});
 assert.match(html,/D:\/\&lt;folder\&gt;/);
 assert.match(html,/custom-instructions\/\&lt;script\&gt;\.md/);
 assert.match(html,/Cannot read \&lt;file\&gt;/);
 assert.match(html,/data-action="open-custom-instructions"/);
 assert.match(html,/Adapt again for: Codex/);
 assert.match(html,/class="next-step"/);
 assert.doesNotMatch(html,/<script>/);
});

test('plugin editor exposes a folder choice instead of a text policy',()=>{
 const html=pluginForm(snapshot(),{...plugin,custom_instructions_dir:'D:/Markdown'});
 assert.match(html,/name="custom_instructions_dir"/);
 assert.match(html,/value="D:\/Markdown"/);
 assert.doesNotMatch(html,/<textarea/);
});

test('Smooth is the default look and follows the system theme; Classic is always dark',()=>{
 assert.equal(storedLook(null),'smooth');assert.equal(storedLook('stale'),'smooth');assert.equal(storedLook('classic'),'classic');
 assert.equal(storedTheme(null),'system');assert.equal(storedTheme('light'),'light');
 assert.equal(resolveTheme('smooth','system',true),'light');assert.equal(resolveTheme('smooth','system',false),'dark');
 assert.equal(resolveTheme('smooth','dark',true),'dark');assert.equal(resolveTheme('classic','light',true),'dark');
});

test('settings offer both looks, hold maintenance, and the interface has five pages',()=>{
 const html=frame({page:'settings',snapshot:snapshot(),discovered:[],discovering:false,plan:null,selected:null,query:'',filter:'all',busy:null,error:null,discoveryError:null,maintenance:null});
 assert.match(html,/id="look-select"/);assert.match(html,/value="classic"/);assert.match(html,/id="theme-select"/);
 assert.match(html,/data-action="verify"/);assert.match(html,/data-action="cleanup"/);
 assert.equal(html.match(/data-page="[a-z]+" aria-label/g)?.length,5);
});

test('epoch stamps read as dates, other time text is left alone',()=>{assert.match(when('1795077229'),/2026/);assert.equal(when('2026-11-15'),'2026-11-15');assert.equal(when(undefined),'');});

test('a plugin whose instructions changed is told to adapt again, once',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'/i',files:[],digest:'new',stale_harnesses:['codex']}]};
 const html=frame({page:'registry',snapshot:s,discovered:[],discovering:false,plan:null,selected:'pkg',query:'',filter:'all',busy:null,error:null,discoveryError:null,maintenance:null});
 assert.match(html,/Your custom instructions changed since the last adaptation\./);assert.equal(html.match(/data-action="adapt"/g)?.length,1);
});
test('first use shows the step to do now and disappears once a plugin is installed',()=>{
 const view=(s:Snapshot)=>frame({page:'registry',snapshot:s,discovered:[],discovering:false,plan:null,selected:null,query:'',filter:'all',busy:null,error:null,discoveryError:null,maintenance:null});
 const empty=snapshot();empty.registry.plugins=[];empty.registry.targets=[];
 assert.match(view(empty),/aria-current="step"><span class="step-n">1</);
 assert.doesNotMatch(view(snapshot()),/class="steps"/);
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
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')])),{kind:'no-harness',operations:0,blockers:0,byKind:{}});
 s.registry.targets=[];assert.equal(syncSummary(s,null).kind,'no-harness');
});
test('a plan of another revision counts as not checked',()=>{
 const s=snapshot(),empty={kind:'not-checked',operations:0,blockers:0,byKind:{}};
 assert.deepEqual(syncSummary(s,plan([op('update','1','2')],3,['Codex: broken'])),empty);
 assert.deepEqual(syncSummary(s,null),empty);
});
test('syncSummary counts the operations of a current plan by kind, and its blockers',()=>{
 const s=snapshot();
 assert.deepEqual(syncSummary(s,plan([op('install','','2','a'),op('update','1','2','b'),op('update','1','2','c'),op('remove','1','','')],4,['Codex / D: no build'])),{kind:'changes',operations:4,blockers:1,byKind:{install:1,update:2,remove:1}});
 assert.deepEqual(syncSummary(s,plan([],4,['Codex / D: no build'])),{kind:'blocked',operations:0,blockers:1,byKind:{}});
 assert.deepEqual(syncSummary(s,plan([])),{kind:'ok',operations:0,blockers:0,byKind:{}});
});

test('unlisted gives the plugins outside the list of enabled harnesses with a complete inventory, with their index',()=>{
 const s=snapshot(),t=s.registry.targets[0];
 s.inventory[0].plugins.push({id:'a',name:'A',version:'1',path:'/a',managed:false},{id:'b',name:'B',version:'1',path:'/b',managed:true},{id:'c',name:'C',version:'3',path:'/c',managed:false});
 assert.deepEqual(unlisted(s),[{target:t,plugin:s.inventory[0].plugins[1],index:1},{target:t,plugin:s.inventory[0].plugins[3],index:3}]);
 s.inventory[0].complete=false;assert.deepEqual(unlisted(s),[]);
 s.inventory[0].complete=true;t.enabled=false;assert.deepEqual(unlisted(s),[]);
});
test('exclusiveMode reads whether every, none or some harness uninstalls plugins outside the list',()=>{
 const t=(exclusive:boolean)=>({...snapshot().registry.targets[0],exclusive});
 assert.equal(exclusiveMode([t(true),t(true)]),'remove');assert.equal(exclusiveMode([t(false),t(false)]),'keep');
 assert.equal(exclusiveMode([t(true),t(false)]),'mixed');assert.equal(exclusiveMode([]),'keep');
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
