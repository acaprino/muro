import type { Plugin, Snapshot } from './types.ts';
export interface PluginStatus { kind:string; label:string; tone:string }
const status=(kind:string,label:string,tone:string):PluginStatus=>({kind,label,tone});
export function pluginState(plugin:Plugin,snapshot:Snapshot):PluginStatus {
  const targets=snapshot.registry.targets.filter(t=>t.enabled&&plugin.targets.includes(t.id));
  if(!targets.length) return status('unassigned','No harness chosen','muted');
  const instructions=snapshot.custom_instructions?.find(i=>i.plugin_id===plugin.id);
  if(instructions?.error) return status('unknown','Check instructions','warn');
  if(targets.some(t=>instructions?.stale_harnesses.includes(t.harness))) return status('prepare','Adapt again','warn');
  if(targets.some(t=>!snapshot.inventory.some(i=>i.target_id===t.id&&i.complete&&i.supported))) return status('unknown','Needs checking','warn');
  if(targets.some(t=>!plugin.distributions.some(d=>d.harness===t.harness&&d.path))) return status('prepare','Needs preparing','accent');
  const installations=targets.map(t=>({target:t,installed:snapshot.inventory.find(i=>i.target_id===t.id)?.plugins.find(p=>(p.registry_id||p.id)===plugin.id)}));
  if(installations.some(i=>!i.installed)) return status('missing','Not installed yet','accent');
  if(installations.some(i=>i.installed?.version!==plugin.distributions.find(d=>d.harness===i.target.harness)?.version)) return status('update','Update available','warn');
  return status('ok','Up to date','good');
}
export function summarize(snapshot:Snapshot) {const targets=snapshot.registry.targets.filter(t=>t.enabled);const complete=targets.every(t=>snapshot.inventory.some(i=>i.target_id===t.id&&i.complete));return {plugins:snapshot.registry.plugins.length,targets:targets.length,updates:snapshot.registry.plugins.filter(p=>pluginState(p,snapshot).kind==='update').length,external:complete?snapshot.inventory.filter(i=>targets.some(t=>t.id===i.target_id)).reduce((n,i)=>n+i.plugins.filter(p=>!p.managed).length,0):null};}
export function filterPlugins(plugins:Plugin[],query:string,filter:string,snapshot:Snapshot):Plugin[] {return plugins.filter(p=>(p.name+' '+p.source).toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(filter==='all'||filter===pluginState(p,snapshot).kind));}
export const harnessNames:Record<string,string>={'claude-code':'Claude Code',codex:'Codex',opencode:'OpenCode',pi:'Pi',hermes:'Hermes',deepseek:'DeepSeek'};
export const harnessInitials:Record<string,string>={'claude-code':'C',codex:'X',opencode:'O',pi:'P',hermes:'H',deepseek:'D'};
