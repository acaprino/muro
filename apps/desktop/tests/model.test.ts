import test from 'node:test';
import assert from 'node:assert/strict';
import { pluginState, summarize, filterPlugins } from '../src/model.ts';
import type { Snapshot, Plugin } from '../src/types.ts';
import { frame } from '../src/views.ts';
import { pluginForm } from '../src/forms.ts';
import { when } from '../src/ui.ts';
import { storedLook, storedTheme, resolveTheme } from '../src/look.ts';

const plugin: Plugin = {id:'pkg',name:'Package',source:'owner/pkg',policy:'stable',pinned_version:'',targets:['target'],distributions:[{harness:'codex',path:'/artifact',version:'2'}]};
function snapshot(): Snapshot {return {registry:{schema:1,revision:4,plugins:[plugin],targets:[{id:'target',harness:'codex',name:'Codex',root:'/profile',executable:'codex',exclusive:false,enabled:true}],settings:{auto_sync:false,interval_minutes:60,agent:'claude-code',python:'python',factory_path:''}},inventory:[{target_id:'target',complete:true,supported:true,error:null,plugins:[{id:'pkg',name:'Package',version:'1',path:'/plugin',managed:true}]}],activity:[]};}
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
