import type { SimState } from './pages/project/graph.ts';
export type Harness = 'claude-code'|'codex'|'opencode'|'pi'|'hermes'|'deepseek';
export interface Distribution { harness: string; path: string; version: string; origin?:'native'|'muro'; source_revision?:string; custom_instructions_digest?:string }
/** `project` is the id of the project (a `.mp` file) the plugin is the build of; a plugin without it is installed as its author ships it. */
export interface Plugin { id:string; name:string; source:string; policy:'pinned'|'stable'|'head'; pinned_version:string; targets:string[]; distributions:Distribution[]; resolved_source?:string; upstream_revision?:string; upstream_version?:string; last_checked?:string; custom_instructions_dir?:string; project?:string }
export interface InstructionState { plugin_id:string; path:string; files:string[]; digest:string; error?:string; stale_harnesses:string[] }
export interface Target { id:string; harness:string; name:string; root:string; executable:string; exclusive:boolean; enabled:boolean }
/** The engine that answers an AI job: a coding agent on this computer (`harness`, reached over MCP) or an OpenAI-compatible API. The key is never a setting: `api_key_env` is the NAME of the environment variable it is read from. */
export type AiEngine = 'harness'|'api';
export type AiHarness = 'claude-code'|'codex';
export interface AiSettings { engine:AiEngine; harness:AiHarness; budget_usd:number; api_base:string; model:string; api_key_env:string }
/** `agent` is the old setting of the harness: the service keeps it equal to `ai.harness`. */
export interface Settings { auto_sync:boolean; interval_minutes:number; close_to_tray:boolean; agent:string; python:string; factory_path:string; ai:AiSettings }
export interface Registry { schema:number; revision:number; plugins:Plugin[]; targets:Target[]; settings:Settings }
/** `present` is false for a Claude Code record whose files are gone (its `installPath` is not a folder); a harness that does not say, or an entry without the field, has them. */
export interface InstalledPlugin { id:string; registry_id?:string; name:string; version:string; path:string; managed:boolean; present?:boolean }
export interface Inventory { target_id:string; complete:boolean; error:string|null; plugins:InstalledPlugin[]; supported:boolean }
export interface Activity { id:string; time:string; action:string; status:string; message:string }
/** An AI run of the runtime: an adaptation of a plugin (`plugin_id`, `harness`), or, with `kind` "project", a project made or changed (`project_id`, `operation`, `title`, `file`). */
export interface Job { id:string; kind?:'project'; plugin_id?:string; harness?:string; project_id?:string; operation?:string; title?:string; file?:string; status:string; phase:string; budget_usd:number; log_path:string; message:string; time:string }
/** Epoch seconds as text, or null while it never happened; the overall fields are those of the last full plan, and `errors` is the sources the last check could not resolve (null before any check). */
export interface SyncTimes { checked:string|null; synced:string|null }
export interface SyncStatus { last_check:string|null; last_sync:string|null; revision:number|null; pending:number|null; blockers:number|null; errors:number|null; targets:Record<string,SyncTimes> }
/** `left_out` is what an apply with `allow_blocked` reports: the blockers of its plan, left out of the sync. `skipped_removals` is what an apply reports of the removals it did not execute: their number with `skip_removals`, else 0. */
export interface Snapshot { registry:Registry; inventory:Inventory[]; activity:Activity[]; sync:SyncStatus; jobs?:Job[]; data_dir?:string; custom_instructions?:InstructionState[]; left_out?:string[]; skipped_removals?:number }
export interface Discovered { harness:string; name:string; executable:string; version:string|null; config_root:string|null; available:boolean; supported:boolean }
/** `present` is on a removal, and only when the entry it removes has no files (false); a removal without it uninstalls a real copy. */
export interface Operation { target_id:string; plugin_id:string; name:string; kind:string; from_version:string; to_version:string; reason:string; present?:boolean }
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
export interface ProjectSummary { id:string; path:string; included?:boolean; project?:ProjectMeta; plugin?:{name:string;slug:string;version:string}; inputs?:number; capabilities?:number; entries?:number; examples?:number; records?:number; runs?:number; digest?:string; error?:string }
export type DecisionForm = 'capability'|'always-on'|'hook'|'dropped';
export interface ProjectInput { id:string; url:string|null; pin:string; release:string|null; commit:string|null; license:string|null; paths:string[]; became:Record<DecisionForm,number> }
export interface ProjectDecision { source:string; content:string; form:DecisionForm; targets:string[]; reason:string }
export interface ProjectRecord { id:string; date:string; subjects:string[]; text:string; author:'muro'|'you'; binding:boolean }
export interface ProjectRun { id:string; time:string; version:string; status:'completed'|'cancelled'|'failed'; budget_usd:number|null; engine:string|null; operation?:string; pins:Record<string,string>; changelog:string }
/** One capability and one documented example as the guide's data model carries them (`guide_data`): the keys the graph reads are its own to name. */
export interface GraphCapability { id:string; title:string; [key:string]:unknown }
export interface GraphExample { [key:string]:unknown }
/** What the action `project {id}` returns: `muro project info` of the file as it is, and `included`: whether it is the copy of the project Muro ships (the runtime says so; `project.builtin` is what the file claims of itself, and is not what decides). */
export interface ProjectInfo { included?:boolean; project:ProjectMeta; plugin:{name:string;slug:string;version:string;description:string}; inputs:ProjectInput[]; decisions:ProjectDecision[]; records:ProjectRecord[]; history:ProjectRun[]; changelog:string; prompts:{file:string;text:string}[]; instructions?:{path:string;text:string}[]; graph:{entries:{name:string;description:string;capabilities:string[]}[];capabilities:GraphCapability[];examples:GraphExample[]}; files:{part:string;path:string;detail:string}[]; digest:string }
export type ProjectStep = 'inputs'|'harmonize'|'graph'|'install';
export type ProjectViewKind = 'records'|'choices'|'history'|'prompts';
/** The open project page: which project, which step, step 2's view and filters (`dsrc` an input id or '', `dform` a form or 'all'), and step 3's simulation. Kept across renders and in the session. */
export interface ProjectView { id:string; step:ProjectStep; view:ProjectViewKind; dsrc:string; dform:string; sim:SimState }
/** How one input's pin stands against its upstream (`muro baseline`): `behind` names the newest release or commit in `upstream`. */
export interface ProjectUpdate { id:string; pin:string; pinned:string; upstream:string|null; status:'current'|'behind'|'frozen'|'drifted'|'unknown'|'error'; note:string }
/** The last update check of a project's inputs, for the file it was made on (`digest`). */
export interface ProjectUpdates { id:string; digest:string; inputs:ProjectUpdate[] }
/** What the Projects tab holds: the list, the information of the open project (`infoId` says whose), the update check of its inputs, and which shell actions turned out to be missing. */
export interface ProjectsState { list:ProjectSummary[]|null; loading:boolean; error:string|null; info:ProjectInfo|null; infoId:string|null; infoLoading:boolean; infoError:string|null; noPicker:boolean; noFolder:boolean; updates?:ProjectUpdates|null; checkingUpdates?:boolean; noFolderPicker?:boolean }
/** `plan` is always the last full plan, the one the strip and every column read from; `autostart`, `afilter` and `setup` belong to Settings, Activity and the first run. */
export interface ViewState {page:Page; snapshot:Snapshot|null; discovered:Discovered[]; discovering:boolean; plan:Plan|null; checking:boolean; applying:Applying|null; review:Review|null; query:string; filter:Filter; afilter:ActivityFilter; busy:string|null; error:string|null; checkErrors:CheckResult['errors']; discoveryError:string|null; maintenance:Maintenance|null; autostart:Autostart|null; setup:SetupState|null; projects:ProjectsState; project:ProjectView|null}
