import type { Plugin, Snapshot, Target, Plan, Operation, InstalledPlugin } from './types.ts';
import { plural } from './words.ts';
export interface PluginStatus { kind:string; label:string; tone:string }
const status=(kind:string,label:string,tone:string):PluginStatus=>({kind,label,tone});
/** What the snapshot holds about one plugin on one target; the plugin state and the cell read it the same way. */
const readable=(t:Target,s:Snapshot)=>s.inventory.some(i=>i.target_id===t.id&&i.complete&&i.supported);
const distributionFor=(p:Plugin,t:Target)=>p.distributions.find(d=>d.harness===t.harness&&d.path);
const installedOn=(p:Plugin,t:Target,s:Snapshot)=>s.inventory.find(i=>i.target_id===t.id)?.plugins.find(i=>(i.registry_id||i.id)===p.id);
const instructionsOf=(p:Plugin,s:Snapshot)=>s.custom_instructions?.find(i=>i.plugin_id===p.id);
/** A plan counts only for the registry revision it was made for: another revision is as good as none. */
export const currentPlan=(s:Snapshot,plan:Plan|null)=>plan&&plan.revision===s.registry.revision?plan:null;
/** What the service recorded for the last full plan, while it is of the snapshot's revision. A window that was just opened, or whose registry a background check or the tray moved, holds no plan of this revision: the record is then all it knows of the changes. */
const recorded=(s:Snapshot)=>s.sync.revision===s.registry.revision&&s.sync.pending!==null?s.sync:null;
export function pluginState(plugin:Plugin,snapshot:Snapshot):PluginStatus {
  const targets=snapshot.registry.targets.filter(t=>t.enabled&&plugin.targets.includes(t.id));
  if(!targets.length) return status('unassigned','No harness chosen','muted');
  const instructions=instructionsOf(plugin,snapshot);
  if(instructions?.error) return status('unknown','Check instructions','warn');
  if(targets.some(t=>instructions?.stale_harnesses.includes(t.harness))) return status('prepare','Adapt again','warn');
  if(targets.some(t=>!readable(t,snapshot))) return status('unknown','Needs checking','warn');
  if(targets.some(t=>!distributionFor(plugin,t))) return status('prepare','Needs preparing','accent');
  const installations=targets.map(t=>({target:t,installed:installedOn(plugin,t,snapshot)}));
  if(installations.some(i=>!i.installed)) return status('missing','Not installed yet','accent');
  if(installations.some(i=>i.installed?.version!==distributionFor(plugin,i.target)?.version)) return status('update','Update available','warn');
  return status('ok','Up to date','ok');
}
export type CellKind = 'ok'|'install'|'update'|'reinstall'|'activate'|'remove'|'needs-build'|'unknown'|'paused'|'none';
export interface CellStatus { kind:CellKind; from?:string; to?:string }
const cell=(kind:CellKind,from?:string,to?:string):CellStatus=>({kind,...(from?{from}:{}),...(to?{to}:{})});
/** The operation kinds the service plans: each one is a change waiting to be applied. */
export const CHANGES=new Set<string>(['install','update','reinstall','activate','remove','remove-marketplace']);
/** One plugin on one target: the operation of a current plan for that pair, otherwise what the snapshot shows. A removal is only ever read from a plan, because a harness with a blocker gets none. */
export function cellState(plugin:Plugin,target:Target,snapshot:Snapshot,plan:Plan|null):CellStatus {
  if(!target.enabled) return cell('paused');
  const op=currentPlan(snapshot,plan)?.operations.find(o=>o.target_id===target.id&&o.plugin_id===plugin.id);
  if(op) return CHANGES.has(op.kind)?cell(op.kind as CellKind,op.from_version,op.to_version):cell('unknown');
  if(!plugin.targets.includes(target.id)) return cell('none');
  const instructions=instructionsOf(plugin,snapshot);
  if(instructions?.error) return cell('unknown');
  if(instructions?.stale_harnesses.includes(target.harness)) return cell('needs-build');
  if(!readable(target,snapshot)) return cell('unknown');
  const wanted=distributionFor(plugin,target);
  if(!wanted) return cell('needs-build');
  const installed=installedOn(plugin,target,snapshot);
  if(!installed) return cell('install',undefined,wanted.version);
  return cell(installed.version===wanted.version?'ok':'update',installed.version,wanted.version);
}
export interface HarnessStatus { kind:'paused'|'unknown'|'changes'|'needs-build'|'unseen'|'ok'; count:number }
/** The state line of a harness column. A harness that cannot be read is never in sync; the count is of what the kind names. `unseen`: the record says changes are waiting and this column has none of its own to show (the record does not say where they are), so it cannot say it is in sync: `count` is the recorded total. */
export function harnessState(target:Target,snapshot:Snapshot,plan:Plan|null):HarnessStatus {
  if(!target.enabled) return {kind:'paused',count:0};
  if(!readable(target,snapshot)) return {kind:'unknown',count:0};
  const kinds=snapshot.registry.plugins.map(p=>cellState(p,target,snapshot,plan).kind);
  const count=(wanted:(k:CellKind)=>boolean)=>kinds.filter(wanted).length;
  // A plugin outside the list has no row: its removal is in the plan alone.
  const outside=currentPlan(snapshot,plan)?.operations.filter(o=>o.target_id===target.id&&!snapshot.registry.plugins.some(p=>p.id===o.plugin_id)).length??0;
  const changes=count(k=>CHANGES.has(k))+outside,build=count(k=>k==='needs-build'),unreadable=count(k=>k==='unknown');
  const unseen=currentPlan(snapshot,plan)?0:recorded(snapshot)?.pending??0;
  return changes?{kind:'changes',count:changes}:build?{kind:'needs-build',count:build}:unreadable?{kind:'unknown',count:unreadable}:unseen?{kind:'unseen',count:unseen}:{kind:'ok',count:0};
}
export interface SyncSummary { kind:'no-harness'|'not-checked'|'changes'|'blocked'|'ok'; operations:number; blockers:number; errors:number; byKind:Record<string,number> }
/** The strip over the table. The counts are those of the plan while it is of the snapshot's revision; with none, those the service recorded for this revision, with no breakdown by kind (`byKind` is empty); with neither, nothing was checked. `errors` is the sources the last check could not resolve. */
export function syncSummary(snapshot:Snapshot,plan:Plan|null):SyncSummary {
  const empty=(kind:SyncSummary['kind']):SyncSummary=>({kind,operations:0,blockers:0,errors:0,byKind:{}});
  if(!snapshot.registry.targets.some(t=>t.enabled)) return empty('no-harness');
  const checked=currentPlan(snapshot,plan),record=checked?null:recorded(snapshot);
  if(!checked&&!record) return empty('not-checked');
  const byKind:Record<string,number>={};
  for(const o of checked?.operations??[]) byKind[o.kind]=(byKind[o.kind]||0)+1;
  const operations=checked?checked.operations.length:record!.pending!,blockers=checked?checked.blockers.length:record!.blockers??0,errors=snapshot.sync.errors??0;
  return {kind:operations?'changes':blockers?'blocked':'ok',operations,blockers,errors,byKind};
}
export interface SyncHeadline { kind:SyncSummary['kind']|'unreadable'|'sources'; operations:number; blockers:number; errors:number; byKind:Record<string,number>; unreadable:{target:Target;count:number}[] }
/** What the strip leads with. A harness column that cannot be read (its inventory, or the instructions of one of its plugins; `count` tells which) never reads as in sync, and neither does a source that could not be resolved: with nothing to apply they replace "ok" and "blocked", the unreadable harness first. */
export function syncHeadline(snapshot:Snapshot,plan:Plan|null):SyncHeadline {
  const summary=syncSummary(snapshot,plan);
  const unreadable=snapshot.registry.targets.filter(t=>t.enabled).map(target=>({target,state:harnessState(target,snapshot,plan)})).filter(x=>x.state.kind==='unknown').map(x=>({target:x.target,count:x.state.count}));
  const quiet=summary.kind==='ok'||summary.kind==='blocked';
  return {...summary,kind:quiet&&unreadable.length?'unreadable':quiet&&summary.errors?'sources':summary.kind,unreadable};
}
/** What an enabled harness holds that it cannot load itself (the `warnings` of its inventory), each with its harness. The service read around it: the harness is listed and managed all the same, so this is told beside the sync state and never takes its place. */
export function harnessWarnings(snapshot:Snapshot):{target:Target;message:string}[] {
  return snapshot.registry.targets.filter(t=>t.enabled).flatMap(target=>(snapshot.inventory.find(i=>i.target_id===target.id)?.warnings??[]).map(message=>({target,message})));
}
/** Whether two plans ask for the same operations (harness, plugin, kind, versions), in any order. */
export function sameOperations(a:Plan|null,b:Plan|null):boolean {
  if(!a||!b||a.operations.length!==b.operations.length) return false;
  const key=(o:Operation)=>JSON.stringify([o.target_id,o.plugin_id,o.name,o.kind,o.from_version,o.to_version]),left=a.operations.map(key).sort(),right=b.operations.map(key).sort();
  return left.every((k,i)=>k===right[i]);
}
/** What a plan removes: `total` is its operations of kind `remove`; `missing` of them clear a record whose files are gone (`present === false`: an operation without the field is a real uninstall), `uninstall` of them remove a copy that is there. */
export function removals(plan:Plan):{total:number;uninstall:number;missing:number} {
 const gone=plan.operations.filter(o=>o.kind==='remove'),missing=gone.filter(o=>o.present===false).length;
 return {total:gone.length,uninstall:gone.length-missing,missing};
}
/** The primary button of the review sheet. With removals it says what they do (uninstall, clear a record without files, or both), so confirming is reading; without any it is the plain count of changes. */
export function removalLabel(plan:Plan):string {
 const {total,uninstall,missing}=removals(plan);
 if(!total) return `Apply ${plural(plan.operations.length,'change')}`;
 return uninstall&&missing?`Apply, uninstall ${uninstall} and clear ${missing} without files`:missing?`Apply and clear ${plural(missing,'record')} without files`:`Apply and uninstall ${plural(uninstall,'plugin')}`;
}
/** The body of `apply` for a stored plan. A plan with removals sends `confirm_removals` (their number: the person read it) when the choice is `confirm`, or `skip_removals` when it is `skip`; a plan without removals sends neither. `allow_blocked` goes with blockers. */
export function applyPayload(plan:Plan,choice:'confirm'|'skip'):Record<string,unknown> {
 const {total}=removals(plan);
 return {plan_id:plan.id,...(plan.blockers.length?{allow_blocked:true}:{}),...(total?choice==='skip'?{skip_removals:true}:{confirm_removals:total}:{})};
}
/** What the notice says after an apply: the changes it applied, and the removals it left out (`skipped`, from the service's answer). */
export const appliedNotice=(applied:number,skipped=0):string=>`${plural(applied,'change')} applied.${skipped?` ${plural(skipped,'removal')} left out.`:''}`;
/** Whether Apply all must open the review sheet instead of applying: a fresh plan that has blockers, nothing to do, a removal or a broken marketplace to take out of a harness (the sheet names what goes with it), or is not what was shown, was not seen as it is. A removal is never applied without the person's confirmation in the sheet. */
export const mustReview=(shown:Plan|null,fresh:Plan):boolean=>!!fresh.blockers.length||!fresh.operations.length||removals(fresh).total>0||fresh.operations.some(o=>o.kind==='remove-marketplace')||!sameOperations(shown,fresh);
/** Installed on an enabled harness that was read completely, and that the list does not hold (`inList`: not put there by Muro, and not added to the list since): `index` is its place in the inventory. */
export function unlisted(snapshot:Snapshot):{target:Target;plugin:InstalledPlugin;index:number}[] {
  return snapshot.registry.targets.filter(t=>t.enabled).flatMap(target=>{const inventory=snapshot.inventory.find(i=>i.target_id===target.id);return inventory?.complete?inventory.plugins.map((plugin,index)=>({target,plugin,index})).filter(u=>!inList(snapshot,target,u.plugin)):[];});
}
export const exclusiveMode=(targets:Target[]):'keep'|'remove'|'mixed'=>targets.length&&targets.every(t=>t.exclusive)?'remove':targets.some(t=>t.exclusive)?'mixed':'keep';
const INTERVALS:[number,string][]=[[15,'Every 15 minutes'],[30,'Every 30 minutes'],[60,'Every hour'],[180,'Every 3 hours'],[720,'Every 12 hours'],[1440,'Once a day']];
/** The options of the check interval; a stored interval none of them names stays an option, so saving another setting does not change it. */
export const intervalOptions=(current:number):[number,string][]=>INTERVALS.some(([minutes])=>minutes===current)?[...INTERVALS]:[...INTERVALS,[current,current===1?'Every minute':`Every ${current} minutes`] as [number,string]].sort((a,b)=>a[0]-b[0]);
/** A time the service recorded (epoch seconds as text) in the words of the interface. */
export function stamp(value:string|null,now=new Date()):string {
  if(!value) return 'never';
  if(!/^\d+$/.test(value)) return value;
  const at=new Date(Number(value)*1000),day=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),diff=Math.round((day(now)-day(at))/864e5),time=at.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  return diff===0?`today ${time}`:diff===1?`yesterday ${time}`:diff===-1?`tomorrow ${time}`:`${at.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} ${time}`;
}
/** `action` keeps the plugins with a cell still to act on (anything but in sync or not here); any other filter is a plugin state kind. */
const needsAction=(p:Plugin,s:Snapshot,plan:Plan|null)=>s.registry.targets.some(t=>t.enabled&&!['ok','none'].includes(cellState(p,t,s,plan).kind));
export function filterPlugins(plugins:Plugin[],query:string,filter:string,snapshot:Snapshot,plan:Plan|null=null):Plugin[] {return plugins.filter(p=>(p.name+' '+p.source).toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(filter==='all'||(filter==='action'?needsAction(p,snapshot,plan):filter===pluginState(p,snapshot).kind)));}
/** What a plugin's row says for its version. A release or a pin is its version; the latest commit (`HEAD`) and a folder on this computer (`local`) have none, so the versions their builds declare stand in, and `commit` is the commit when the version is not it. */
export function versionOf(p:Plugin):{version:string;commit:string} {
 const resolved=p.upstream_version||'';
 if(resolved!=='HEAD'&&resolved!=='local')return {version:resolved,commit:''};
 const builds=[...new Set(p.distributions.map(d=>d.version).filter(Boolean))].join(', ');
 const commit=resolved==='HEAD'&&p.upstream_revision?`@${p.upstream_revision.slice(0,7)}`:'';
 return builds?{version:builds,commit}:{version:commit||resolved,commit:''};
}
export const harnessNames:Record<string,string>={'claude-code':'Claude Code',codex:'Codex',opencode:'OpenCode',pi:'Pi',hermes:'Hermes',deepseek:'DeepSeek'};
export const harnessInitials:Record<string,string>={'claude-code':'CC',codex:'CX',opencode:'OC',pi:'PI',hermes:'HM',deepseek:'DS'};
// Readers of data the page did not write (a project file from elsewhere, a service older than the window): a field of the wrong type is left out, never guessed.
export const obj=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
export const text=(v:unknown,fallback=''):string=>typeof v==='string'?v:fallback;
export const amount=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
/** The AI engine as the pages say it: what answers a free-text simulation (a coding agent or an API) and an AI adaptation (a coding agent today). */
export interface Engine {api:boolean;harness:string;budget:number|null;model:string;base:string}
/** `registry.settings.ai` of the snapshot. A service that has none yet has its agent: the old `agent` setting is the harness. The one reading of the engine, for the simulator and for the Adapt with AI dialog. */
export function engineOf(settings:unknown):Engine {
 const s=obj(settings)??{},ai=obj(s.ai)??{};
 return {api:ai.engine==='api',harness:text(ai.harness)||text(s.agent)||'claude-code',budget:amount(ai.budget_usd),model:text(ai.model).trim(),base:text(ai.api_base).trim()};
}
/** What an installed plugin becomes in the list: its own folder is the source and its one build, kept at the version it has. A plugin that reports no version cannot be pinned, so it follows the stable policy; the id is new. */
export const listedPlugin=(installed:InstalledPlugin,target:Target):Plugin=>({id:crypto.randomUUID(),name:installed.name,source:installed.path,policy:installed.version?'pinned':'stable',pinned_version:installed.version,targets:[target.id],distributions:[{harness:target.harness,path:installed.path,version:installed.version}]});
/** What "Add to my list" and the first run save for an installed plugin: the plugin, and the installation it takes over (`adopt`), which the service binds to the plugin, so the next sync finds it installed instead of installing a second copy beside it. */
export const listing=(installed:InstalledPlugin,target:Target,revision:number)=>({revision,plugin:listedPlugin(installed,target),adopt:{target_id:target.id,native_id:installed.id}});
/** Whether the list already holds this installed plugin: Muro put it there, or a plugin of the list targets the harness with a build in the folder it is installed in. */
export const inList=(snapshot:Snapshot,target:Target,installed:InstalledPlugin):boolean=>installed.managed||(!!installed.path&&snapshot.registry.plugins.some(p=>p.targets.includes(target.id)&&p.distributions.some(d=>d.harness===target.harness&&d.path===installed.path)));
/** What a line of an inventory adds for an entry whose files are gone (`present === false`): its record is still there, its folder is not. */
export const filesMissing=(installed:InstalledPlugin):string=>installed.present===false?' · files missing':'';
/** When the automatic sync checks next: its interval after the last check, "soon" when there is no last check to count from, and nothing when the automatic sync is off. */
export const nextCheck=(snapshot:Snapshot):string|null=>{const settings=snapshot.registry.settings,last=snapshot.sync.last_check;return !settings.auto_sync?null:last&&/^\d+$/.test(last)?stamp(String(Number(last)+settings.interval_minutes*60)):'soon';};
