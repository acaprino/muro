import type { Plugin, Snapshot, Target, Discovered } from './types.ts';
import { field, button, mark, seg, esc } from './ui.ts';
import { harnessNames, exclusiveMode } from './model.ts';
import { selectFieldHtml, checkboxOptionHtml, formGroupHtml, fieldErrorHtml, repeatableFieldRowHtml, showFieldErrors, iconButtonHtml } from '@acaprino/imago/ui';
export { selectFieldHtml as choice, clearFieldError as clearError, formSignature as signature } from '@acaprino/imago/ui';

// The fields of the plugin dialog and of the harness sheet, what is read back from them, and what is wrong with it.
// The dialog and sheet around them (heading, footer) are in sheets.ts.

const harnessChoice=(label:string,name:string,selected='codex')=>selectFieldHtml(label,name,Object.entries(harnessNames),selected);

/** A prepared build of a plugin: one row. It repeats its field names, so a row has no error slot of its own: the one under the rows speaks for all. */
export function distributionRow(harness='codex',path='',version=''):string {
 return repeatableFieldRowHtml(`${harnessChoice('Harness','distribution_harness',harness)}${field('Build folder','distribution_path',path,{error:false})}${field('Version','distribution_version',version,{error:false})}${iconButtonHtml('Remove build','remove-distribution','x')}`);
}
/** The fields of a plugin. A new one starts with every enabled harness checked; the policy is a segmented choice, the pinned version shows only for a pinned plugin. */
export function pluginForm(snapshot:Snapshot,plugin?:Plugin):string {
 const policy=plugin?.policy||'stable',checked=(t:Target)=>plugin?plugin.targets.includes(t.id):t.enabled,targets=snapshot.registry.targets;
 return field('Source','source',plugin?.source,{mono:true,placeholder:'https://github.com/owner/repository',autofocus:true,hint:plugin?'Changing the source removes the prepared builds: check for updates or adapt again after saving.':'A repository or a folder on this computer. For a plugin in a folder of its repository, add #folder to the address.'})
  +field('Name','name',plugin?.name)
  +formGroupHtml('Install on',targets.length?targets.map(t=>checkboxOptionHtml({name:'targets',value:t.id,checked:checked(t),label:t.name,leadingHtml:mark(t.harness)})).join(''):'<p class="im-muted">No harness yet. Add one in Sync.</p>')
  +formGroupHtml('Updates',`${seg('policy',policy,[['stable','Latest release'],['pinned','Pinned version'],['head','Latest commit']],'Updates')}<div id="pinned-field" class="im-field-space" ${policy==='pinned'?'':'hidden'}>${field('Pinned version','pinned_version',plugin?.pinned_version,{placeholder:'0.4.1'})}</div>`)
  +`<details id="plugin-advanced"><summary>Advanced</summary>${field('Custom instructions folder','custom_instructions_dir',plugin?.custom_instructions_dir,{mono:true,hint:'Optional. Full path of a folder with your own .md notes, subfolders included. Leave empty to use the folder Muro keeps. After editing the files, adapt the plugin again.'})}${formGroupHtml('Prepared builds',`<div id="distributions" class="im-hide-empty">${(plugin?.distributions||[]).map(d=>distributionRow(d.harness,d.path,d.version)).join('')}</div>${fieldErrorHtml('err-distributions')}${button('Add build','add-distribution',{icon:'plus'})}`,'Leave empty: Check for updates or Adapt with AI fills this in. Add one by hand only for a build you made yourself.')}</details>`;
}
/** The fields of a harness; `found` is a harness the computer was searched for, whose folder and executable fill the fields in. */
export function targetForm(target?:Target,found?:Discovered):string {
 return field('Name','name',target?.name||found?.name,{autofocus:!target})
  +harnessChoice('Harness','harness',target?.harness||found?.harness)
  +field('Configuration folder','root',target?.root||found?.config_root||'',{mono:true,hint:'Where the harness keeps its settings. OpenCode: the folder of opencode.json. Pi: the folder of settings.json.'})
  +field('Executable','executable',target?.executable||found?.executable,{mono:true})
  +checkboxOptionHtml({name:'enabled',checked:target?.enabled!==false,label:'Keep this harness in sync',hint:'Switch off to pause: Muro leaves it alone.',top:true})
  +checkboxOptionHtml({name:'exclusive',checked:!!target?.exclusive,label:'Uninstall plugins that are not in my list',hint:'Muro asks before it uninstalls. Only on this harness. The rule for all of them is in Settings.',top:true});
}
/** The one rule for plugins outside the list, for every harness; a harness can differ in its own sheet, then neither option is chosen. A change reaches `set-exclusive`. */
export const exclusiveSeg=(targets:Target[])=>{const mode=exclusiveMode(targets);return `${mode==='mixed'?'<small>Differs per harness</small>':''}${seg('excl',mode,[['keep','Leave alone'],['remove','Uninstall, asking first']],'Plugins that are not in my list')}`;};

// ---------- reading a form ----------
/** The plugin a form describes. What the form does not show stays as it was: a changed source drops what was prepared from the old one (builds, resolved version and revision), the instructions folder stays. */
export function readPlugin(form:HTMLFormElement,existing?:Plugin):Plugin {
 const data=new FormData(form),name=String(data.get('name')||'').trim(),policy=String(data.get('policy')||'stable') as Plugin['policy'],pin=String(data.get('pinned_version')||'').trim(),source=String(data.get('source')||'').trim();
 const customInstructionsDir=String(data.get('custom_instructions_dir')||'').trim();
 const sourceChanged=existing!==undefined&&source!==existing.source;
 const distributions=sourceChanged?[]:Array.from(form.querySelectorAll<HTMLElement>('.im-repeat-row')).map(row=>{const value={harness:row.querySelector<HTMLSelectElement>('select')!.value,path:row.querySelector<HTMLInputElement>('[name=distribution_path]')!.value.trim(),version:row.querySelector<HTMLInputElement>('[name=distribution_version]')!.value.trim()};const previous=existing?.distributions.find(d=>d.harness===value.harness&&d.path===value.path&&d.version===value.version);return {...previous,...value};});
 const metadata=source===existing?.source?existing:{...existing,resolved_source:undefined,upstream_revision:undefined,upstream_version:undefined,last_checked:undefined};
 return {...metadata,id:existing?.id||crypto.randomUUID(),name,source,policy,pinned_version:pin,custom_instructions_dir:customInstructionsDir||undefined,targets:data.getAll('targets').map(String),distributions};
}
/** The harness a form describes; fields the form does not show stay as they were. */
export function readTarget(form:HTMLFormElement,existing?:Target):Target {
 const d=new FormData(form),text=(name:string)=>String(d.get(name)||'').trim();
 return {...existing,id:existing?.id||crypto.randomUUID(),harness:String(d.get('harness')),name:text('name'),root:text('root'),executable:text('executable'),enabled:d.has('enabled'),exclusive:d.has('exclusive')};
}
/** The name a plugin gets from its source while nobody typed one: the last part of the address or folder, without `.git`. */
export const lastPart=(source:string)=>(source.trim().split(/[\\/]/).filter(Boolean).pop()||'').replace(/\.git$/,'');

// ---------- what is wrong with a form: the messages of the mockup, by field name, in the order of the form ----------
export type Errors=Record<string,string>;
export function pluginErrors(plugin:Plugin):Errors {
 const errors:Errors={};
 if(!plugin.source)errors.source='Enter where the plugin comes from.';
 if(!plugin.name)errors.name='Give the plugin a name.';
 if(plugin.policy==='pinned'&&!plugin.pinned_version)errors.pinned_version='A pinned plugin needs a version.';
 if(plugin.distributions.some(d=>!d.path||!d.version))errors.distributions='Each build needs a folder and a version.';
 else if(new Set(plugin.distributions.map(d=>d.harness)).size!==plugin.distributions.length)errors.distributions='Only one build per harness.';
 return errors;
}
export function targetErrors(target:Target):Errors {
 const errors:Errors={};
 if(!target.name)errors.name='Give the harness a name.';
 if(!target.root)errors.root='Enter the configuration folder.';
 else if(!/^([A-Za-z]:[\\/]|[\\/~])/.test(target.root))errors.root='Enter the full path of the folder, such as C:\\Users\\you\\.codex.';
 if(!target.executable)errors.executable='Enter the command or full path of the executable.';
 return errors;
}
/** A prepared-build error belongs to the collection rather than one ordinary named field. */
export const showErrors=(form:HTMLFormElement,errors:Errors)=>showFieldErrors(form,errors,{field:(form,name)=>name==='distributions'?form.querySelector<HTMLElement>('#distributions input, [data-action=add-distribution]'):undefined});

// ---------- a multi-line field ----------
/** A text area with the label, hint and error slot of Imago's text field (`textFieldHtml`), drawn with Imago's own `im-native-textarea`. Imago has
 * no markup helper for it yet: this is the one place it is written, to be moved into Imago with the next release (docs/imago-migration.md). */
export function textArea(label:string,name:string,value='',o:{hint?:string;rows?:number;autofocus?:boolean;optional?:boolean;mono?:boolean}={}):string {
 const key=encodeURIComponent(name),hint=o.hint?`<small id="hint-${esc(key)}">${esc(o.hint)}</small>`:'';
 return `<label class="im-field"><span>${esc(label)}${o.optional?'<em>optional</em>':''}</span><textarea class="im-native-textarea${o.mono?' im-mono':''}" name="${esc(name)}" rows="${o.rows??4}"${o.autofocus?' autofocus':''} aria-describedby="${o.hint?`hint-${esc(key)} `:''}err-${esc(key)}">${esc(value)}</textarea>${hint}<small class="im-field-error" id="err-${esc(key)}" role="alert"></small></label>`;
}

// ---------- projects ----------
/** A plugin id as the factory takes it: lowercase letters and digits joined by single dashes. */
export const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The plugin id a project gets from its name while nobody typed one: accents dropped, every other run of characters a dash. */
export const slugOf=(name:string)=>name.normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64).replace(/-+$/,'');
/** A full path of this computer: a drive letter, a share or a root. */
export const FULL_PATH=/^([A-Za-z]:[\\/]|\\\\|\/)/;
/** Where an input comes from: an https address of a repository, or the full path of a folder. */
export const isInput=(value:string)=>/^https:\/\/\S+$/.test(value)||FULL_PATH.test(value);
/** The project's repository from the fields of a form: none when the address is empty. */
export function readRepository(data:FormData):{url:string;branch:string;tag_prefix:string}|null {
 const url=String(data.get('repo_url')||'').trim();
 return url?{url,branch:String(data.get('repo_branch')||'').trim()||'main',tag_prefix:String(data.get('repo_prefix')||'').trim()}:null;
}
export const repositoryErrors=(repo:{url:string}|null):Errors=>repo&&!/^https:\/\/\S+$/.test(repo.url)?{repo_url:'Enter the https:// address of the repository, or leave it empty.'}:{};
/** The fields of a project's repository: its address, branch and the prefix of its release tags. Empty address: none. */
export const repositoryFields=(repo?:{url:string;branch:string;tag_prefix:string}|null)=>field('Repository','repo_url',repo?.url||'',{mono:true,placeholder:'https://github.com/owner/repository',hint:'Optional. The Git repository the project is published from. Leave it empty for a project that lives on this computer only.'})
 +field('Branch','repo_branch',repo?.branch||'main',{mono:true})+field('Release tag prefix','repo_prefix',repo?.tag_prefix||'',{mono:true,placeholder:'my-plugin-v',hint:'Releases are tagged with this prefix and the version.'});
/** A budget for an AI run, in US dollars: above zero, at most 100 (the runtime's limit). */
export function budgetError(value:number):Errors {
 return Number.isFinite(value)&&value>0&&value<=100?{}:{budget:'Enter a budget above zero and at most 100.'};
}
