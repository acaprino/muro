import type { SimState } from './pages/project/graph.ts';
export type Harness = 'claude-code'|'codex'|'opencode'|'pi'|'hermes'|'deepseek';
export interface Distribution { harness: string; path: string; version: string; origin?:'native'|'muro'; source_revision?:string; custom_instructions_digest?:string }
/** `project` is the id of the project (a `.mp` file) the plugin is the build of; a plugin without it is installed as its author ships it. */
export interface Plugin { id:string; name:string; source:string; policy:'pinned'|'stable'|'head'; pinned_version:string; targets:string[]; distributions:Distribution[]; resolved_source?:string; upstream_revision?:string; upstream_version?:string; last_checked?:string; custom_instructions_dir?:string; project?:string }
export interface InstructionState { plugin_id:string; path:string; files:string[]; digest:string; error?:string; stale_harnesses:string[] }
export interface Target { id:string; harness:string; name:string; root:string; executable:string; exclusive:boolean; enabled:boolean }
export interface Settings { auto_sync:boolean; interval_minutes:number; close_to_tray:boolean; agent:string; python:string; factory_path:string }
export interface Registry { schema:number; revision:number; plugins:Plugin[]; targets:Target[]; settings:Settings }
export interface InstalledPlugin { id:string; registry_id?:string; name:string; version:string; path:string; managed:boolean }
export interface Inventory { target_id:string; complete:boolean; error:string|null; plugins:InstalledPlugin[]; supported:boolean }
export interface Activity { id:string; time:string; action:string; status:string; message:string }
export interface Job { id:string; plugin_id:string; harness:string; status:string; phase:string; budget_usd:number; log_path:string; message:string; time:string }
/** Epoch seconds as text, or null while it never happened; the overall fields are those of the last full plan, and `errors` is the sources the last check could not resolve (null before any check). */
export interface SyncTimes { checked:string|null; synced:string|null }
export interface SyncStatus { last_check:string|null; last_sync:string|null; revision:number|null; pending:number|null; blockers:number|null; errors:number|null; targets:Record<string,SyncTimes> }
/** `left_out` is what an apply with `allow_blocked` reports: the blockers of its plan, left out of the sync. */
export interface Snapshot { registry:Registry; inventory:Inventory[]; activity:Activity[]; sync:SyncStatus; jobs?:Job[]; data_dir?:string; custom_instructions?:InstructionState[]; left_out?:string[] }
export interface Discovered { harness:string; name:string; executable:string; version:string|null; config_root:string|null; available:boolean; supported:boolean }
export interface Operation { target_id:string; plugin_id:string; name:string; kind:string; from_version:string; to_version:string; reason:string }
export interface Plan { id:string; revision:number; operations:Operation[]; blockers:string[] }
export interface CheckResult { snapshot:Snapshot; plan:Plan; errors:{plugin_id:string;message:string}[] }
export interface Autostart { supported:boolean; enabled:boolean; current:boolean }
export interface Maintenance { message:string; details:string[] }
export type Transport = <T>(action:string,payload?:Record<string,unknown>)=>Promise<T>;
export type Page = 'projects'|'sync'|'activity'|'settings';
export type Filter = 'all'|'action';
export type ActivityFilter = 'all'|'sync'|'ai'|'problems';
/** An apply in progress: `index` operations are done of `total`, `name` lists the plugins it changes. */
export interface Applying { index:number; total:number; name:string }
/** The review sheet that is open: a plan, and the harness it was made for (null for the whole plan). A one-harness plan is never `plan` of the state. */
export interface Review { plan:Plan; target_id:string|null }
export interface SetupState { step:1|2|3; pick:Record<string,boolean>; keep:Record<string,boolean>; auto:boolean; autostart:boolean }
/** `project.json` of a project file. */
export interface ProjectMeta { schema:number; name:string; slug:string; version:string; author:string; created:string; changed:string; repository:{url:string;branch:string;tag_prefix:string}|null; builtin:boolean }
/** What the action `projects` returns for each listed project: its id and file, then what `muro project info` knows in short (a count the runtime does not send is absent), or `error` when the file is missing or invalid. */
export interface ProjectSummary { id:string; path:string; project?:ProjectMeta; plugin?:{name:string;slug:string;version:string}; inputs?:number; capabilities?:number; entries?:number; examples?:number; records?:number; runs?:number; digest?:string; error?:string }
export type DecisionForm = 'capability'|'always-on'|'hook'|'dropped';
export interface ProjectInput { id:string; url:string|null; pin:string; release:string|null; commit:string|null; license:string|null; paths:string[]; became:Record<DecisionForm,number> }
export interface ProjectDecision { source:string; content:string; form:DecisionForm; targets:string[]; reason:string }
export interface ProjectRecord { id:string; date:string; subjects:string[]; text:string; author:'muro'|'you'; binding:boolean }
export interface ProjectRun { id:string; time:string; version:string; status:'completed'|'cancelled'|'failed'; budget_usd:number|null; engine:string|null; pins:Record<string,string>; changelog:string }
/** One capability and one documented example as the guide's data model carries them (`guide_data`): the keys the graph reads are its own to name. */
export interface GraphCapability { id:string; title:string; [key:string]:unknown }
export interface GraphExample { [key:string]:unknown }
/** What the action `project {id}` returns: `muro project info` of the file as it is. */
export interface ProjectInfo { project:ProjectMeta; plugin:{name:string;slug:string;version:string;description:string}; inputs:ProjectInput[]; decisions:ProjectDecision[]; records:ProjectRecord[]; history:ProjectRun[]; changelog:string; prompts:{file:string;text:string}[]; graph:{entries:{name:string;description:string;capabilities:string[]}[];capabilities:GraphCapability[];examples:GraphExample[]}; files:{part:string;path:string;detail:string}[]; digest:string }
export type ProjectStep = 'inputs'|'harmonize'|'graph'|'install';
export type ProjectViewKind = 'records'|'choices'|'history'|'prompts';
/** The open project page: which project, which step, step 2's view and filters (`dsrc` an input id or '', `dform` a form or 'all'), and step 3's simulation. Kept across renders and in the session. */
export interface ProjectView { id:string; step:ProjectStep; view:ProjectViewKind; dsrc:string; dform:string; sim:SimState }
/** What the Projects tab holds: the list, the information of the open project (`infoId` says whose), and which shell actions turned out to be missing. */
export interface ProjectsState { list:ProjectSummary[]|null; loading:boolean; error:string|null; info:ProjectInfo|null; infoId:string|null; infoLoading:boolean; infoError:string|null; noPicker:boolean; noFolder:boolean }
/** `plan` is always the last full plan, the one the strip and every column read from; `autostart`, `afilter` and `setup` belong to Settings, Activity and the first run. */
export interface ViewState {page:Page; snapshot:Snapshot|null; discovered:Discovered[]; discovering:boolean; plan:Plan|null; checking:boolean; applying:Applying|null; review:Review|null; query:string; filter:Filter; afilter:ActivityFilter; busy:string|null; error:string|null; checkErrors:CheckResult['errors']; discoveryError:string|null; maintenance:Maintenance|null; autostart:Autostart|null; setup:SetupState|null; projects:ProjectsState; project:ProjectView|null}
