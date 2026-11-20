// Task 6: the forms, the plugin dialog, the harness sheet and the pieces of the Sync page that carry them (the Add harness
// menu, the plugins outside the list). Rendering and validation only: what the DOM does with them is in browser-harness.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot, Plugin, Target, Discovered, ViewState, InstalledPlugin } from '../src/types.ts';
import { pluginForm, targetForm, distributionRow, pluginErrors, targetErrors, exclusiveSeg, lastPart } from '../src/forms.ts';
import { listedPlugin } from '../src/model.ts';
import { pluginDialog, harnessSheet, adaptDialog, instructionDetails } from '../src/sheets.ts';
import { frame, modules } from '../src/views.ts';
import { field, button } from '../src/ui.ts';

const plugin: Plugin = {id:'pkg',name:'Package',source:'owner/pkg',policy:'stable',pinned_version:'',targets:['t1'],distributions:[{harness:'codex',path:'/artifact',version:'2'}]};
const outside: InstalledPlugin = {id:'native-old',name:'old-snippets',version:'0.2.0',path:'/plugins/old',managed:false};
function snapshot(): Snapshot {
 return {registry:{schema:1,revision:4,plugins:[plugin],targets:[{id:'t1',harness:'codex',name:'Codex',root:'/profile',executable:'codex',exclusive:false,enabled:true},{id:'t2',harness:'opencode',name:'OpenCode',root:'/oc',executable:'opencode',exclusive:false,enabled:true}],settings:{auto_sync:false,interval_minutes:60,close_to_tray:true,agent:'claude-code',python:'python',factory_path:''}},
  inventory:[{target_id:'t1',complete:true,supported:true,error:null,plugins:[{id:'native-pkg',registry_id:'pkg',name:'Package',version:'1',path:'/plugins/pkg',managed:true},outside]},{target_id:'t2',complete:true,supported:true,error:null,plugins:[]}],
  activity:[],sync:{last_check:null,last_sync:null,revision:null,pending:null,blockers:null,errors:null,targets:{}}};
}
const viewState=(s:Snapshot|null,over:Partial<ViewState>={}):ViewState=>({page:'sync',snapshot:s,discovered:[],discovering:false,plan:null,checking:false,applying:null,review:null,query:'',filter:'all',afilter:'all',busy:null,error:null,checkErrors:[],discoveryError:null,maintenance:null,autostart:null,setup:null,...over});
const found=(harness:string,name:string,over:Partial<Discovered>={}):Discovered=>({harness,name,executable:harness,version:'1',config_root:`/config/${harness}`,available:true,supported:true,...over});
const tags=(html:string,attr:string)=>[...html.matchAll(new RegExp(`${attr}="([^"]*)"`,'g'))].map(m=>m[1]);

// ---------- the plugin form ----------
test('the plugin form keeps every field: source, name, harnesses, updates, pinned version, instructions folder and prepared builds',()=>{
 const html=pluginForm(snapshot(),{...plugin,custom_instructions_dir:'D:/Markdown'});
 for(const name of ['source','name','targets','policy','pinned_version','custom_instructions_dir'])assert.match(html,new RegExp(`name="${name}"`),name);
 assert.match(html,/value="D:\/Markdown"/);assert.doesNotMatch(html,/<textarea/);
 assert.match(html,/id="distributions"/);assert.match(html,/data-action="add-distribution"/);assert.match(html,/<summary>Advanced<\/summary>/);
 assert.match(html,/<legend>Install on<\/legend>/);assert.match(html,/<legend>Updates<\/legend>/);
 assert.match(html,/<input type="radio" name="policy" value="stable" checked>/);
 assert.match(html,/<div id="pinned-field" hidden>/,'the pinned version shows only for a pinned plugin');
 assert.doesNotMatch(pluginForm(snapshot(),{...plugin,policy:'pinned',pinned_version:'1.0'}),/<div id="pinned-field" hidden>/);
});
test('a new plugin starts with every enabled harness checked, a saved one with its own',()=>{
 const s=snapshot();s.registry.targets[1].enabled=false;
 assert.deepEqual(tags(pluginForm(s).match(/<input type="checkbox" name="targets"[^>]*>/g)!.join(''),'value'),['t1','t2'],'both are listed');
 assert.equal(pluginForm(s).match(/name="targets"[^>]*checked/g)?.length,1,'only the enabled one is checked');
 const saved=pluginForm(snapshot(),plugin);assert.equal(saved.match(/name="targets"[^>]*checked/g)?.length,1);assert.match(saved,/value="t1" checked/);
 assert.match(pluginForm({...snapshot(),registry:{...snapshot().registry,targets:[]}}),/No harness yet\. Add one in Sync\./);
});
test('every field names its error: an alert slot the input is described by',()=>{
 const html=pluginForm(snapshot());
 for(const name of ['source','name','pinned_version','custom_instructions_dir']){assert.match(html,new RegExp(`aria-describedby="[^"]*err-${name}"`),name);assert.match(html,new RegExp(`<small class="err" id="err-${name}" role="alert"></small>`),name);}
 assert.match(html,/<small class="err" id="err-distributions" role="alert"><\/small>/);
 assert.match(distributionRow('codex','/a','1')+distributionRow(),/^(?:(?!id="err-distribution)[\s\S])*$/,'a build row has no id of its own, so two rows never repeat one');
});
test('a field escapes its label, value, hint and placeholder, and a build row its values',()=>{
 const html=field('A <b>','n','"><script>',{hint:'<i>',placeholder:'<p>'});
 assert.doesNotMatch(html,/<script>|<i>|<p>|<b>/);assert.match(html,/value="&quot;&gt;&lt;script&gt;"/);
 assert.doesNotMatch(distributionRow('codex','"><img src=x>','<v>'),/<img|<v>/);
 const form=pluginForm(snapshot(),{...plugin,name:'<u>n</u>',source:'"><i>s',distributions:[{harness:'codex',path:'<b>p',version:'1'}]});
 assert.doesNotMatch(form,/<u>|<i>|<b>p/);
});

test('a button carries extra attributes and a class, escaped, with one space between its attributes',()=>{
 assert.match(button('Go','run',{id:'a',cls:'left',attrs:{'data-native':'x"y','aria-haspopup':'menu'}}),/<button type="button" class="btn left" data-action="run" data-id="a" data-native="x&quot;y" aria-haspopup="menu"><span>Go<\/span><\/button>/);
 assert.match(button('Go','run',{disabled:true}),/<button type="button" class="btn" data-action="run" disabled>/);
});

// ---------- validation: the messages of the mockup ----------
test('a plugin needs a source and a name, and a pinned one a version; builds need a folder and a version, one per harness',()=>{
 const base:Plugin={...plugin,distributions:[]};
 assert.deepEqual(pluginErrors(base),{});
 assert.deepEqual(pluginErrors({...base,source:'',name:''}),{source:'Enter where the plugin comes from.',name:'Give the plugin a name.'});
 assert.deepEqual(Object.keys(pluginErrors({...base,source:'',name:'',policy:'pinned'})),['source','name','pinned_version'],'in the order of the form');
 assert.equal(pluginErrors({...base,policy:'pinned'}).pinned_version,'A pinned plugin needs a version.');
 assert.equal(pluginErrors({...base,distributions:[{harness:'codex',path:'',version:'1'}]}).distributions,'Each build needs a folder and a version.');
 assert.equal(pluginErrors({...base,distributions:[{harness:'codex',path:'/a',version:'1'},{harness:'codex',path:'/b',version:'2'}]}).distributions,'Only one build per harness.');
});
test('a harness needs a name, an absolute configuration folder and an executable',()=>{
 const base:Target={id:'x',harness:'codex',name:'Codex',root:'C:\\Users\\you\\.codex',executable:'codex',enabled:true,exclusive:false};
 assert.deepEqual(targetErrors(base),{});
 for(const root of ['C:/Users/you/.codex','/home/you/.codex','~/.codex','\\\\server\\share'])assert.deepEqual(targetErrors({...base,root}),{},root);
 assert.deepEqual(targetErrors({...base,name:'',root:'',executable:''}),{name:'Give the harness a name.',root:'Enter the configuration folder.',executable:'Enter the command or full path of the executable.'});
 assert.equal(targetErrors({...base,root:'codex'}).root,'Enter the full path of the folder, such as C:\\Users\\you\\.codex.');
 assert.equal(targetErrors({...base,root:'.codex'}).root,'Enter the full path of the folder, such as C:\\Users\\you\\.codex.');
});

// ---------- the plugin dialog ----------
test('a saved plugin\'s dialog has its own heading, Save, and a More disclosure with the five actions; a new one has neither',()=>{
 const state=viewState(snapshot()),html=pluginDialog(state,plugin);
 assert.match(html,/<h2 id="dlg-title">Package<\/h2>/);assert.match(html,/<form class="dl" id="plugin-form" novalidate data-named="1">/);
 assert.match(html,/<details id="plugin-more"[^>]*><summary>More<\/summary>/);
 const more=html.slice(html.indexOf('<summary>More</summary>'));
 for(const [action,label] of [['resolve-plugin','Check for updates'],['adapt-plugin','Adapt with AI'],['reinstall-plugin','Plan a reinstall'],['open-custom-instructions','Open instructions folder'],['remove-plugin','Remove from my list']])assert.match(more,new RegExp(`data-action="${action}" data-id="pkg"[^>]*>(?:<svg[\\s\\S]*?</svg>)?<span>${label}</span>`),label);
 assert.match(html,/<button type="submit" class="btn primary">Save<\/button>/);assert.match(html,/id="form-error" class="error" role="alert"/);
 const fresh=pluginDialog(state);
 assert.match(fresh,/<h2 id="dlg-title">Add a plugin<\/h2>/);assert.doesNotMatch(fresh,/More|remove-plugin|resolve-plugin/);assert.match(fresh,/<button type="submit" class="btn primary">Add plugin<\/button>/);assert.doesNotMatch(fresh,/data-named/);
 const draft=pluginDialog(state,{...plugin,id:'not-in-the-list'});assert.match(draft,/Add a plugin/);assert.doesNotMatch(draft,/remove-plugin/,'a plugin that is not in the list has nothing to remove or check');
});
test('the dialog shows the custom instructions with their errors and stale warning, escaped, and a way to read them again',()=>{
 const s={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'D:/<folder>',files:['custom-instructions/<script>.md'],digest:'',stale_harnesses:['codex'],error:'Cannot read <file>'}]};
 const html=instructionDetails(plugin,viewState(s));
 assert.match(html,/D:\/&lt;folder&gt;/);assert.match(html,/custom-instructions\/&lt;script&gt;\.md/);assert.match(html,/Cannot read &lt;file&gt;/);assert.match(html,/Adapt again for: Codex/);
 assert.match(html,/data-action="reload-instructions" data-id="pkg"/);assert.match(html,/id="notes-status" role="status"/);assert.doesNotMatch(html,/<script>/);
 assert.match(pluginDialog(viewState(s),plugin),/class="notes"/,'the dialog carries the section');
});
test('the dialog of a plugin with no instructions yet says so',()=>{
 assert.match(pluginDialog(viewState(snapshot()),plugin),/Custom instructions · none yet/);
});

// ---------- the adapt dialog ----------
test('the adapt dialog asks for a harness and a budget above zero, tied to its error, and names the agent',()=>{
 const state=viewState(snapshot()),html=adaptDialog(state,plugin);
 assert.match(html,/<h2 id="dlg-title">Adapt Package with AI<\/h2>/);assert.match(html,/Claude Code/);
 assert.match(html,/name="budget" value="2" type="number"/);assert.match(html,/aria-describedby="[^"]*err-budget"/);assert.match(html,/id="err-budget" role="alert"/);
 assert.doesNotMatch(html,/value="deepseek"/);assert.match(html,/<button type="submit" class="btn primary">Start<\/button>/);
 assert.match(adaptDialog(state,{...plugin,targets:['t1','t2']}),/<option value="opencode" selected>/,'the harness the plugin has no build for is chosen');
 const stale={...snapshot(),custom_instructions:[{plugin_id:'pkg',path:'p',files:[],digest:'',stale_harnesses:['codex']}]};
 assert.match(adaptDialog(viewState(stale),plugin),/<option value="codex" selected>/,'a harness whose instructions changed comes first');
 assert.doesNotMatch(adaptDialog(viewState(snapshot()),{...plugin,name:'<b>x</b>'}),/<b>x/);
});

// Settings, section AI, owns the engine: the dialog reads `registry.settings.ai` (the harness, the budget it starts from) and never the old `agent` alone.
const settingsWith=(ai:Record<string,unknown>|undefined,agent='claude-code'):Snapshot=>{
 const s=snapshot();s.registry.settings={...s.registry.settings,agent,...(ai?{ai:{engine:'harness',harness:'claude-code',budget_usd:2,api_base:'https://api.openai.com/v1',model:'',api_key_env:'MURO_API_KEY',...ai}}:{})} as Snapshot['registry']['settings'];return s;
};
const plain=(html:string)=>html.replace(/<[^>]*>/g,' ').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
/** What the dialog says under its title: the choice of harnesses below it lists them all by name. */
const said=(html:string)=>plain(html.match(/<div class="dlhead">[\s\S]*?<\/p>/)![0]);
test('the adapt dialog names the harness of the AI settings and starts from their budget',()=>{
 const codex=adaptDialog(viewState(settingsWith({harness:'codex',budget_usd:0.5},'claude-code')),plugin);
 assert.match(said(codex),/Codex rebuilds this plugin/);assert.match(said(codex),/It uses Codex's own credentials/);assert.doesNotMatch(said(codex),/Claude Code/,'the old agent setting does not name it');
 assert.match(codex,/name="budget" value="0.5" type="number"/);
 const claude=adaptDialog(viewState(settingsWith({harness:'claude-code',budget_usd:3.25})),plugin);
 assert.match(said(claude),/Claude Code rebuilds this plugin/);assert.match(claude,/name="budget" value="3.25"/);
 assert.doesNotMatch(said(claude),/needs a coding agent/,'a harness engine needs no explanation');
});
test('with the API as the engine the dialog says adapting runs a coding agent on this computer, and names the harness of the settings',()=>{
 const api=adaptDialog(viewState(settingsWith({engine:'api',harness:'codex',budget_usd:1.5,model:'gpt-test'})),plugin);
 assert.match(said(api),/Adapting a plugin needs a coding agent on this computer: Codex\./);
 assert.match(said(api),/It uses Codex's own credentials/);assert.doesNotMatch(api,/gpt-test/);assert.doesNotMatch(said(api),/Claude Code/);
 assert.match(api,/name="budget" value="1.5"/);
 assert.match(said(adaptDialog(viewState(settingsWith({engine:'api'})),plugin)),/Adapting a plugin needs a coding agent on this computer: Claude Code\./);
});
test('a service with no AI settings yet falls back to its agent and to a budget of 2; a budget of nothing is not offered',()=>{
 const old=adaptDialog(viewState(settingsWith(undefined,'codex')),plugin);
 assert.match(said(old),/Codex rebuilds this plugin/);assert.match(old,/name="budget" value="2"/);
 assert.match(adaptDialog(viewState(settingsWith({budget_usd:0})),plugin),/name="budget" value="2"/);
});

// ---------- the harness sheet ----------
test('the harness sheet has the mockup\'s fields and words, and Stop managing only for a harness that exists',()=>{
 const s=snapshot(),state=viewState(s),target=s.registry.targets[0],html=harnessSheet(state,target);
 assert.match(html,/<h2 id="dlg-title">Codex<\/h2>/);assert.match(html,/Checked never · last sync never/);
 for(const name of ['name','harness','root','executable','enabled','exclusive'])assert.match(html,new RegExp(`name="${name}"`),name);
 assert.match(html,/<strong>Keep this harness in sync<\/strong>/);assert.match(html,/Switch off to pause: Muro leaves it alone\./);
 assert.match(html,/<strong>Always uninstall plugins that are not in my list<\/strong>/);assert.match(html,/Only on this harness\. The rule for all of them is in Settings\./);
 assert.match(html,/name="enabled" checked/);assert.doesNotMatch(html,/name="exclusive" checked/);
 assert.match(html,/data-action="remove-target" data-id="t1"[^>]*>(?:(?!<\/button>)[\s\S])*Stop managing/);
 assert.match(html,/<button type="submit" class="btn primary">Save<\/button>/);
 const fresh=harnessSheet(state);
 assert.match(fresh,/<h2 id="dlg-title">Add a harness<\/h2>/);assert.match(fresh,/Tell Muro where this harness keeps its plugin configuration\./);assert.doesNotMatch(fresh,/Stop managing|Installed here/);assert.match(fresh,/<button type="submit" class="btn primary">Add harness<\/button>/);
 assert.match(fresh,/name="name" value="" type="text"[^>]* autofocus/,'a new harness starts in its name');
});
test('a paused or exclusive harness shows its own switches, and the times of its last check and sync',()=>{
 const s=snapshot();s.registry.targets[0]={...s.registry.targets[0],enabled:false,exclusive:true};s.sync.targets.t1={checked:String(Math.floor(Date.now()/1000)),synced:null};
 const html=harnessSheet(viewState(s),s.registry.targets[0]);
 assert.doesNotMatch(html,/name="enabled" checked/);assert.match(html,/name="exclusive" checked/);assert.match(html,/Checked today \d\d:\d\d · last sync never/);
});
test('a found harness fills in its folder, executable and name and says it did',()=>{
 const html=harnessSheet(viewState(snapshot()),undefined,found('claude-code','Claude Code'));
 assert.match(html,/Muro filled in the folder where this harness keeps its plugin configuration by default\. Change it for a custom installation\./);
 assert.match(html,/name="name" value="Claude Code"/);assert.match(html,/name="root" value="\/config\/claude-code"/);assert.match(html,/name="executable" value="claude-code"/);assert.match(html,/<option value="claude-code" selected>/);
 assert.match(harnessSheet(viewState(snapshot()),undefined,found('pi','Pi',{config_root:null})),/Tell Muro where this harness keeps its plugin configuration\./,'with no folder found it asks for one');
});
test('Installed here lists what the harness holds, and offers Add to my list only for what is outside the list',()=>{
 const s=snapshot(),html=harnessSheet(viewState(s),s.registry.targets[0]);
 assert.match(html,/<section id="installed-here" tabindex="-1">/);assert.match(html,/<h3>Installed here<\/h3>/);
 assert.match(html,/Package<\/strong><small>1 · in your list/);assert.match(html,/old-snippets<\/strong><small>0\.2\.0 · not in your list/);
 assert.equal(html.match(/data-action="add-to-list"/g)?.length,1);assert.match(html,/data-action="add-to-list" data-id="t1" data-native="native-old"/);
 assert.match(harnessSheet(viewState(s),s.registry.targets[1]),/No plugins installed here\./);
 const broken=snapshot();broken.inventory[1]={...broken.inventory[1],complete:false,error:'Configuration folder not found <x>'};
 assert.match(harnessSheet(viewState(broken),broken.registry.targets[1]),/Configuration folder not found &lt;x&gt;/);
 const added=snapshot();added.registry.plugins.push(listedPlugin(outside,added.registry.targets[0]));
 assert.doesNotMatch(harnessSheet(viewState(added),added.registry.targets[0]),/add-to-list/,'what the list already points at is not offered again');
 assert.match(harnessSheet(viewState(added),added.registry.targets[0]),/old-snippets<\/strong><small>0\.2\.0 · in your list/);
});
test('the harness sheet escapes names, folders, plugin names and errors',()=>{
 const s=snapshot();s.registry.targets[0]={...s.registry.targets[0],name:'<u>H</u>',root:'"><i>r'};s.inventory[0]={...s.inventory[0],plugins:[{...outside,name:'<b>P</b>',version:'<v>'}]};
 const html=harnessSheet(viewState(s),s.registry.targets[0]);
 for(const raw of ['<u>H','<i>r','<b>P','<v>'])assert.ok(!html.includes(raw),raw);
 assert.ok(html.includes('&lt;u&gt;H')&&html.includes('&lt;b&gt;P'));
});
test('targetForm without a target is a harness to add, with the codex mark only as the default choice',()=>{
 assert.match(targetForm(),/<option value="codex" selected>/);assert.match(targetForm(undefined,found('hermes','Hermes')),/<option value="hermes" selected>/);
 assert.match(targetForm({id:'x',harness:'pi',name:'n',root:'/r',executable:'e',enabled:true,exclusive:true}),/<option value="pi" selected>/);
});

// ---------- plugins outside the list ----------
test('the rule for plugins outside the list is Leave alone, Always uninstall or Differs per harness',()=>{
 const t=(exclusive:boolean):Target=>({id:'x',harness:'codex',name:'n',root:'/r',executable:'e',enabled:true,exclusive});
 const keep=exclusiveSeg([t(false),t(false)]),remove=exclusiveSeg([t(true),t(true)]),mixed=exclusiveSeg([t(true),t(false)]);
 assert.match(keep,/name="excl" value="keep" checked/);assert.match(remove,/name="excl" value="remove" checked/);assert.doesNotMatch(mixed,/checked/);
 assert.match(mixed,/<small>Differs per harness<\/small>/);assert.doesNotMatch(keep,/Differs/);
 assert.match(keep,/<span>Leave alone<\/span>/);assert.match(keep,/<span>Always uninstall<\/span>/);assert.match(keep,/aria-label="Plugins that are not in my list"/);
});
test('a plugin takes its name from the last part of its source until a name is typed',()=>{
 assert.equal(lastPart('https://github.com/owner/repository.git'),'repository');assert.equal(lastPart('C:\\Users\\you\\my-plugin\\'),'my-plugin');assert.equal(lastPart('  owner/pkg '),'pkg');assert.equal(lastPart(''),'');
});

function syncPage(over:Partial<ViewState>={},s=snapshot()){return frame(viewState(s,over));}
const menuOf=(html:string)=>html.slice(html.indexOf('<div class="menu"'),html.indexOf('</div>',html.indexOf('<div class="menu"')+1)+6);
test('Add harness is a menu: the harnesses found to manage, the ones with no plugin support disabled, Add by hand and Rescan',()=>{
 const html=syncPage({discovered:[found('claude-code','Claude Code'),found('pi','Pi',{supported:false}),found('hermes','Hermes',{available:false})]});
 assert.match(html,/<div class="menuwrap"><button type="button" class="btn" data-action="menu" aria-haspopup="menu" aria-expanded="false"[^>]*>[\s\S]*?<span>Add harness<\/span><\/button><div class="menu" role="menu" hidden>/);
 const menu=html.slice(html.indexOf('<div class="menu" role="menu"'),html.indexOf('Rescan this computer'));
 assert.match(menu,/role="menuitem" data-action="manage-found" data-id="claude-code">[\s\S]*?Manage Claude Code/);
 assert.match(menu,/<button type="button" role="menuitem" disabled>[\s\S]*?Pi · no plugin support yet/);
 assert.doesNotMatch(menu,/Hermes/,'a harness that is not on this computer is not offered');
 assert.match(html,/role="menuitem" data-action="add-target">Add by hand…<\/button>/);assert.match(html,/role="menuitem" data-action="rescan">Rescan this computer<\/button>/);
 assert.doesNotMatch(menu,/No other harness found/);
});
test('the menu says when nothing is found, or that it is looking, and never offers a harness that is managed already',()=>{
 assert.match(syncPage(),/<div class="lbl">No other harness found on this computer<\/div>/);
 assert.match(syncPage({discovering:true}),/<div class="lbl">Looking for harnesses…<\/div>/);
 const s=snapshot();
 const same=syncPage({discovered:[found('codex','Codex',{config_root:'/profile'})]},s);assert.doesNotMatch(same,/Manage Codex/,'the same harness in the same folder is managed already');
 assert.doesNotMatch(syncPage({discovered:[found('codex','Codex',{config_root:'\\PROFILE/'})]},s),/Manage Codex/,'slashes, case and a trailing slash do not make another folder');
 assert.match(syncPage({discovered:[found('codex','Codex',{config_root:'/other'})]},s),/Manage Codex/,'another folder of the same kind of harness is another harness');
 assert.match(syncPage({discovered:[found('claude-code','<b>Claude</b>')]}),/Manage &lt;b&gt;Claude&lt;\/b&gt;/);
});
test('plugins outside the list: the section, one line each with its fate, and the rule beside the title',()=>{
 const html=syncPage();
 assert.match(html,/<div class="sec"><h2>Installed, not in your list<\/h2><span class="count">1<\/span><span class="grow"><\/span>/);
 assert.match(html,/<strong>old-snippets<\/strong><small>0\.2\.0 · on Codex<\/small><\/div><small>Left alone<\/small>/);
 assert.match(html,/data-action="add-to-list" data-id="t1" data-native="native-old"/);assert.match(html,/name="excl" value="keep" checked/);
 const s=snapshot();s.registry.targets[0].exclusive=true;
 const removing=syncPage({},s);assert.match(removing,/<span class="tag bad">Removed at the next sync<\/span>/);assert.doesNotMatch(removing,/Left alone<\/small>/);assert.match(removing,/Differs per harness/);
 s.registry.targets[1].exclusive=true;assert.match(syncPage({},s),/name="excl" value="remove" checked/);
});
test('nothing outside the list, a paused harness or an unreadable one has no section',()=>{
 const s=snapshot();s.inventory[0].plugins=[s.inventory[0].plugins[0]];assert.doesNotMatch(syncPage({},s),/Installed, not in your list/);
 const paused=snapshot();paused.registry.targets[0].enabled=false;assert.doesNotMatch(syncPage({},paused),/Installed, not in your list/);
 const broken=snapshot();broken.inventory[0].complete=false;assert.doesNotMatch(syncPage({},broken),/Installed, not in your list/);
 const added=snapshot();added.registry.plugins.push(listedPlugin(outside,added.registry.targets[0]));assert.doesNotMatch(syncPage({},added),/Installed, not in your list/,'a plugin imported into the list is no longer outside it');
});
test('the section escapes plugin and harness names; an empty list still offers the plugins outside it',()=>{
 const s=snapshot();s.registry.targets[0].name='<u>H</u>';s.inventory[0].plugins=[{...outside,name:'<b>P</b>'}];s.registry.plugins=[];
 const html=syncPage({},s);assert.ok(!html.includes('<b>P')&&!html.includes('<u>H'));assert.match(html,/Your list is empty/);assert.match(html,/Installed, not in your list/);
});

test('every action the markup of this task names has an owner among the page modules',()=>{
 const owned=new Set([...Object.values(modules).flatMap(m=>Object.keys(m.actions)),'page','refresh']);
 const s=snapshot(),state=viewState(s,{discovered:[found('claude-code','Claude Code')]});
 const pieces=[pluginDialog(state,plugin),pluginDialog(state),harnessSheet(state,s.registry.targets[0]),harnessSheet(state),adaptDialog(state,plugin),syncPage({discovered:[found('claude-code','Claude Code')]})];
 for(const html of pieces)for(const action of tags(html,'data-action'))assert.ok(owned.has(action),`${action} has no owner`);
 for(const wanted of ['set-exclusive','add-to-list','resolve-plugin','adapt-plugin','reinstall-plugin','open-custom-instructions','reload-instructions','remove-plugin','remove-target','remove-distribution','menu'])assert.ok(owned.has(wanted),`${wanted} is declared`);
});
