import type { Plugin, Snapshot, Target, Plan, InstalledPlugin } from './types.ts';
export interface PluginStatus { kind:string; label:string; tone:string }
const status=(kind:string,label:string,tone:string):PluginStatus=>({kind,label,tone});
/** What the snapshot holds about one plugin on one target; the plugin state and the cell read it the same way. */
const readable=(t:Target,s:Snapshot)=>s.inventory.some(i=>i.target_id===t.id&&i.complete&&i.supported);
const distributionFor=(p:Plugin,t:Target)=>p.distributions.find(d=>d.harness===t.harness&&d.path);
const installedOn=(p:Plugin,t:Target,s:Snapshot)=>s.inventory.find(i=>i.target_id===t.id)?.plugins.find(i=>(i.registry_id||i.id)===p.id);
const instructionsOf=(p:Plugin,s:Snapshot)=>s.custom_instructions?.find(i=>i.plugin_id===p.id);
/** A plan counts only for the registry revision it was made for: another revision is as good as none. */
const fresh=(s:Snapshot,plan:Plan|null)=>plan&&plan.revision===s.registry.revision?plan:null;
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
  return status('ok','Up to date','good');
}
export type CellKind = 'ok'|'install'|'update'|'reinstall'|'activate'|'remove'|'needs-build'|'unknown'|'paused'|'none';
export interface CellStatus { kind:CellKind; from?:string; to?:string }
const cell=(kind:CellKind,from?:string,to?:string):CellStatus=>({kind,...(from?{from}:{}),...(to?{to}:{})});
/** The operation kinds the service plans: each one is a change waiting to be applied. */
const CHANGES=new Set<string>(['install','update','reinstall','activate','remove']);
/** One plugin on one target: the operation of a current plan for that pair, otherwise what the snapshot shows. A removal is only ever read from a plan, because a harness with a blocker gets none. */
export function cellState(plugin:Plugin,target:Target,snapshot:Snapshot,plan:Plan|null):CellStatus {
  if(!target.enabled) return cell('paused');
  const op=fresh(snapshot,plan)?.operations.find(o=>o.target_id===target.id&&o.plugin_id===plugin.id);
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
export interface HarnessStatus { kind:'paused'|'unknown'|'changes'|'needs-build'|'ok'; count:number }
/** The state line of a harness column. A harness that cannot be read is never in sync; the count is of what the kind names. */
export function harnessState(target:Target,snapshot:Snapshot,plan:Plan|null):HarnessStatus {
  if(!target.enabled) return {kind:'paused',count:0};
  if(!readable(target,snapshot)) return {kind:'unknown',count:0};
  const kinds=snapshot.registry.plugins.map(p=>cellState(p,target,snapshot,plan).kind);
  const count=(wanted:(k:CellKind)=>boolean)=>kinds.filter(wanted).length;
  // A plugin outside the list has no row: its removal is in the plan alone.
  const outside=fresh(snapshot,plan)?.operations.filter(o=>o.target_id===target.id&&!snapshot.registry.plugins.some(p=>p.id===o.plugin_id)).length??0;
  const changes=count(k=>CHANGES.has(k))+outside,build=count(k=>k==='needs-build'),unreadable=count(k=>k==='unknown');
  return changes?{kind:'changes',count:changes}:build?{kind:'needs-build',count:build}:unreadable?{kind:'unknown',count:unreadable}:{kind:'ok',count:0};
}
export interface SyncSummary { kind:'no-harness'|'not-checked'|'changes'|'blocked'|'ok'; operations:number; blockers:number; byKind:Record<string,number> }
/** The strip over the table. Counts come from the plan only while it is of the snapshot's revision; otherwise nothing was checked. */
export function syncSummary(snapshot:Snapshot,plan:Plan|null):SyncSummary {
  const empty=(kind:SyncSummary['kind']):SyncSummary=>({kind,operations:0,blockers:0,byKind:{}});
  if(!snapshot.registry.targets.some(t=>t.enabled)) return empty('no-harness');
  const checked=fresh(snapshot,plan);
  if(!checked) return empty('not-checked');
  const byKind:Record<string,number>={};
  for(const o of checked.operations) byKind[o.kind]=(byKind[o.kind]||0)+1;
  const operations=checked.operations.length,blockers=checked.blockers.length;
  return {kind:operations?'changes':blockers?'blocked':'ok',operations,blockers,byKind};
}
/** Installed on an enabled harness that was read completely, and not put there by Muro: `index` is its place in the inventory. */
export function unlisted(snapshot:Snapshot):{target:Target;plugin:InstalledPlugin;index:number}[] {
  return snapshot.registry.targets.filter(t=>t.enabled).flatMap(target=>{const inventory=snapshot.inventory.find(i=>i.target_id===target.id);return inventory?.complete?inventory.plugins.map((plugin,index)=>({target,plugin,index})).filter(u=>!u.plugin.managed):[];});
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
export function summarize(snapshot:Snapshot) {const targets=snapshot.registry.targets.filter(t=>t.enabled);const complete=targets.every(t=>snapshot.inventory.some(i=>i.target_id===t.id&&i.complete));return {plugins:snapshot.registry.plugins.length,targets:targets.length,updates:snapshot.registry.plugins.filter(p=>pluginState(p,snapshot).kind==='update').length,external:complete?snapshot.inventory.filter(i=>targets.some(t=>t.id===i.target_id)).reduce((n,i)=>n+i.plugins.filter(p=>!p.managed).length,0):null};}
/** `action` keeps the plugins with a cell still to act on (anything but in sync or not here); any other filter is a plugin state kind. */
const needsAction=(p:Plugin,s:Snapshot,plan:Plan|null)=>s.registry.targets.some(t=>t.enabled&&!['ok','none'].includes(cellState(p,t,s,plan).kind));
export function filterPlugins(plugins:Plugin[],query:string,filter:string,snapshot:Snapshot,plan:Plan|null=null):Plugin[] {return plugins.filter(p=>(p.name+' '+p.source).toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(filter==='all'||(filter==='action'?needsAction(p,snapshot,plan):filter===pluginState(p,snapshot).kind)));}
export const harnessNames:Record<string,string>={'claude-code':'Claude Code',codex:'Codex',opencode:'OpenCode',pi:'Pi',hermes:'Hermes',deepseek:'DeepSeek'};
export const harnessInitials:Record<string,string>={'claude-code':'C',codex:'X',opencode:'O',pi:'P',hermes:'H',deepseek:'D'};
