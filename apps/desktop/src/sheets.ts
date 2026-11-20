import type { ViewState, Plan, Plugin, Target, Discovered } from './types.ts';
import { esc, icon, plural, mark, button, spin, field } from './ui.ts';
import { harnessNames, inList, stamp, engineOf } from './model.ts';
import { choice, pluginForm, targetForm } from './forms.ts';

/** The head of a sheet or dialog: the heading is the dialog's name (`openDialog` names it), the cross closes it. */
export const dlHead=(title:string,sub='',locked=false)=>`<div class="dlhead"><div><h2 id="dlg-title">${esc(title)}</h2>${sub?`<p class="muted">${esc(sub)}</p>`:''}</div><button type="button" class="iconbtn" data-close aria-label="Close" ${locked?'disabled':''}>${icon('x')}</button></div>`;

const KINDS:Record<string,string>={install:'Install',update:'Update',reinstall:'Reinstall',activate:'Activate',remove:'Remove'};
const tone=(kind:string)=>kind==='remove'?'bad':kind==='update'?'warn':'accent';
/** The review sheet: what a plan would change, harness by harness, and what it leaves out. `scope` is the harness a one-harness plan was made for; `running` is an apply in progress (`index` operations done), which locks the sheet. */
export function reviewSheet(state:ViewState,plan:Plan,running:{index:number}|null,scope:Target|null=null):string {
 const s=state.snapshot!,ops=plan.operations,removing=ops.filter(o=>o.kind==='remove').length;
 const sections=s.registry.targets.map(t=>({t,own:ops.filter(o=>o.target_id===t.id)})).filter(x=>x.own.length);
 const line=(o:Plan['operations'][number])=>{const i=ops.indexOf(o),st=running?(i<running.index?`<span class="good">${icon('check')}</span>`:spin):'';return `<li><span class="tag ${tone(o.kind)}">${esc(KINDS[o.kind]||o.kind)}</span><div><strong>${esc(o.name)}</strong><small>${o.kind==='remove'?`${esc(o.from_version)}${o.reason?` · ${esc(o.reason)}`:''}`:o.kind==='update'?`${esc(o.from_version)} → ${esc(o.to_version)}`:esc(o.to_version)}</small></div><span class="st">${st}</span></li>`;};
 return `<div class="dl">${dlHead(scope?`Sync ${scope.name}`:'Review changes',(scope?'Only the changes of this harness. ':'')+'Nothing changes until you apply.',!!running)}
 ${sections.map(({t,own})=>`<section class="ops"><h3>${mark(t.harness)}${esc(t.name)}</h3><ul>${own.map(line).join('')}</ul></section>`).join('')}
 ${!ops.length?'<p class="muted">No change is ready to apply.</p>':''}
 ${plan.blockers.length&&!running?`<section class="ops"><h3><span class="warn">${icon('alert')}</span>Not ready yet</h3><ul>${plan.blockers.map(b=>`<li><div><strong class="break">${esc(b)}</strong><small>It is left out of this sync.</small></div></li>`).join('')}</ul></section>`:''}
 ${state.error&&!running?`<p class="err" role="alert">${esc(state.error)}</p>`:''}
 <footer>${removing&&!running?`<small class="left">${plural(removing,'plugin')} will be uninstalled.</small>`:''}<button type="button" class="btn" data-close ${running?'disabled':''}>${ops.length?'Cancel':'Close'}</button>${ops.length?`<button type="button" class="btn primary" data-action="apply" autofocus ${running?'disabled':''}>${running?`Applying ${plural(ops.length,'change')}…`:`Apply ${plural(ops.length,'change')}`}</button>`:''}</footer></div>`;
}

/** A plugin's custom-instructions folder and files as its dialog shows them: what the folder holds, what changed, what cannot be read, and a way to read it again (opening the folder is under More). `#notes-status` says what the last action did. */
export function instructionDetails(p:Plugin,state:ViewState):string {
 const instructions=state.snapshot?.custom_instructions?.find(i=>i.plugin_id===p.id),folder=instructions?.path||p.custom_instructions_dir,files=instructions?.files||[];
 return `<section class="notes" aria-label="Custom instructions">${instructions?.error?`<p class="err" role="alert">${esc(instructions.error)}</p>`:''}${instructions?.stale_harnesses.length?`<p class="warn">Instructions changed. Adapt again for: ${esc(instructions.stale_harnesses.map(h=>harnessNames[h]||h).join(', '))}.</p>`:''}<details id="instructions-${esc(p.id)}"><summary>Custom instructions · ${files.length?plural(files.length,'Markdown file'):'none yet'}</summary><p class="muted">Your own Markdown notes. The AI reads them with the source when it adapts this plugin.</p>${folder?`<p class="mono break">${esc(folder)}</p>`:''}${files.length?`<ul class="files">${files.map(file=>`<li class="mono break">${esc(file)}</li>`).join('')}</ul>`:''}<div class="acts">${button('Reload files','reload-instructions',{id:p.id,icon:'sync'})}</div></details><p class="muted" id="notes-status" role="status"></p></section>`;
}

const foot=(ok:string,left='',disabled=false)=>`<footer>${left}<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary"${disabled?' disabled':''}>${esc(ok)}</button></footer>`;
const errorSlot='<div id="form-error" class="error" role="alert"></div>';

/** The plugin dialog opened by a row, or by Add plugin. A plugin that is in the list has More: check its source, adapt it, plan a reinstall, open its instructions folder, remove it. One that is not (a new one, or an installed plugin being added) has none of them. */
export function pluginDialog(state:ViewState,plugin?:Plugin):string {
 const s=state.snapshot!,saved=!!plugin&&s.registry.plugins.some(p=>p.id===plugin.id),id=plugin?.id??'';
 const more=saved?`<details id="plugin-more" class="more"><summary>More</summary><div class="acts">${button('Check for updates','resolve-plugin',{id,icon:'sync'})}${button('Adapt with AI','adapt-plugin',{id})}${button('Plan a reinstall','reinstall-plugin',{id})}${button('Open instructions folder','open-custom-instructions',{id,icon:'folder'})}${button('Remove from my list','remove-plugin',{id,danger:true})}</div></details>`:'';
 return `<form class="dl" id="plugin-form" novalidate${plugin?.name?' data-named="1"':''}>${dlHead(saved?plugin!.name:'Add a plugin',saved?'Installed as its author ships it.':'A plugin installed as its author ships it.')}${pluginForm(s,plugin)}${saved?instructionDetails(plugin!,state):''}${more}${errorSlot}${foot(saved?'Save':'Add plugin')}</form>`;
}

/** What a harness holds, by the snapshot's inventory: what is in the list, and what is not, with a way to add it. Its own element, so adding one repaints only this. */
export function installedHere(state:ViewState,target:Target):string {
 const s=state.snapshot!,inventory=s.inventory.find(i=>i.target_id===target.id);
 return `<section id="installed-here" tabindex="-1"><h3>Installed here</h3>${inventory&&!inventory.complete&&inventory.error?`<p class="err" role="alert">${esc(inventory.error)}</p>`:''}<ul class="ops">${inventory?.plugins.map(p=>{const listed=inList(s,target,p);return `<li><div><strong>${esc(p.name)}</strong><small>${esc(p.version)} · ${listed?'in your list':'not in your list'}</small></div>${listed?'':button('Add to my list','add-to-list',{id:target.id,attrs:{'data-native':p.id}})}</li>`;}).join('')||'<li class="muted">No plugins installed here.</li>'}</ul></section>`;
}
/** The sheet of a harness: to add one (`found` is what the computer was searched for), or to change one, with what is installed there. */
export function harnessSheet(state:ViewState,target?:Target,found?:Discovered):string {
 const times=target?state.snapshot!.sync.targets[target.id]:undefined;
 const sub=target?`Checked ${stamp(times?.checked??null)} · last sync ${stamp(times?.synced??null)}`:found?.config_root?'Muro filled in the folder where this harness keeps its plugin configuration by default. Change it for a custom installation.':'Tell Muro where this harness keeps its plugin configuration.';
 return `<form class="dl" id="target-form" novalidate>${dlHead(target?target.name:'Add a harness',sub)}${targetForm(target,found)}${target?installedHere(state,target):''}${errorSlot}${foot(target?'Save':'Add harness',target?button('Stop managing','remove-target',{id:target.id,danger:true,cls:'left'}):'')}</form>`;
}

/** What the dialog says, before anything starts, when the coding agent of the AI settings is Codex: adapting holds the run to a dollar budget, which only Claude Code allows. */
export const ADAPT_NEEDS_CLAUDE='Adapting a plugin needs Claude Code (the only agent Muro can hold to a budget). Choose Claude Code in Settings → AI.';
/** Adapting a plugin with AI: for which harness, with how much budget. The coding agent and the budget it starts from are Settings' (section AI: `registry.settings.ai`). Adaptation runs a coding agent on this computer whatever engine answers free-text simulations: with the API chosen, the dialog says so. With Codex as that agent (whatever the engine) it says what is needed instead, links to Settings and cannot be started. The harness first offered is one whose instructions changed, or one the plugin targets and has no build for. */
export function adaptDialog(state:ViewState,plugin:Plugin):string {
 const s=state.snapshot!,engine=engineOf(s.registry.settings),agentName=harnessNames[engine.harness]||engine.harness,budget=engine.budget&&engine.budget>0?engine.budget:2,codex=engine.harness==='codex';
 const needs=s.custom_instructions?.find(i=>i.plugin_id===plugin.id)?.stale_harnesses[0]??plugin.targets.map(id=>s.registry.targets.find(t=>t.id===id)?.harness).find(h=>h&&!plugin.distributions.some(d=>d.harness===h));
 const lead=engine.api?`Adapting a plugin needs a coding agent on this computer: ${agentName}. It`:agentName;
 const said=codex?ADAPT_NEEDS_CLAUDE:`${lead} rebuilds this plugin for a harness that has no native version of it, and validates the result. It uses ${agentName}'s own credentials and spends at most the budget below.`;
 return `<form class="dl" id="adapt-form" novalidate>${dlHead(`Adapt ${plugin.name} with AI`,said)}<p class="muted">Your custom instructions are read with the source: the AI decides how to fit them in and records why.</p>${choice('For harness','harness',Object.entries(harnessNames).filter(([h])=>h!=='deepseek'),needs||'')}${field('Maximum budget (USD)','budget',String(budget),{type:'number',autofocus:true,hint:'Checked between turns: the run can end slightly above it.',attrs:{min:'0',step:'0.5',inputmode:'decimal'}})}${errorSlot}${foot('Start',codex?button('Open Settings','page',{id:'settings',cls:'left'}):'',codex)}</form>`;
}
