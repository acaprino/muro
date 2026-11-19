export type Harness = 'claude-code'|'codex'|'opencode'|'pi'|'hermes'|'deepseek';
export interface Distribution { harness: string; path: string; version: string; origin?:'native'|'muro'; source_revision?:string; custom_instructions_digest?:string }
export interface Plugin { id:string; name:string; source:string; policy:'pinned'|'stable'|'head'; pinned_version:string; targets:string[]; distributions:Distribution[]; resolved_source?:string; upstream_revision?:string; upstream_version?:string; last_checked?:string; custom_instructions_dir?:string }
export interface InstructionState { plugin_id:string; path:string; files:string[]; digest:string; error?:string; stale_harnesses:string[] }
export interface Target { id:string; harness:string; name:string; root:string; executable:string; exclusive:boolean; enabled:boolean }
export interface Settings { auto_sync:boolean; interval_minutes:number; agent:string; python:string; factory_path:string }
export interface Registry { schema:number; revision:number; plugins:Plugin[]; targets:Target[]; settings:Settings }
export interface InstalledPlugin { id:string; registry_id?:string; name:string; version:string; path:string; managed:boolean }
export interface Inventory { target_id:string; complete:boolean; error:string|null; plugins:InstalledPlugin[]; supported:boolean }
export interface Activity { id:string; time:string; action:string; status:string; message:string }
export interface Job { id:string; plugin_id:string; harness:string; status:string; phase:string; budget_usd:number; log_path:string; message:string; time:string }
export interface Snapshot { registry:Registry; inventory:Inventory[]; activity:Activity[]; jobs?:Job[]; data_dir?:string; custom_instructions?:InstructionState[] }
export interface Discovered { harness:string; name:string; executable:string; version:string|null; config_root:string|null; available:boolean; supported:boolean }
export interface Operation { target_id:string; plugin_id:string; name:string; kind:string; from_version:string; to_version:string; reason:string }
export interface Plan { id:string; revision:number; operations:Operation[]; blockers:string[] }
export interface Maintenance { message:string; details:string[] }
export type Transport = <T>(action:string,payload?:Record<string,unknown>)=>Promise<T>;
export type Page = 'registry'|'harness'|'sync'|'activity'|'settings';
export interface ViewState {page:Page; snapshot:Snapshot|null; discovered:Discovered[]; discovering:boolean; plan:Plan|null; selected:string|null; query:string; filter:string; busy:string|null; error:string|null; discoveryError:string|null; maintenance:Maintenance|null}
