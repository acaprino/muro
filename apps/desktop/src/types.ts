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
/** `present` is false for a Claude Code record whose files are gone (its `installPath` is not a folder); a harness that does not say, or an entry without the field, has them.
 * `plugin_name` is the name the harness installed it under (what its manifest calls it), as the service reads it from the entry: null where the harness lists a plugin by its folder or its source. `enabled` is absent where the harness does not say. */
export interface InstalledPlugin { id:string; registry_id?:string; name:string; version:string; path:string; managed:boolean; present?:boolean; plugin_name?:string|null; enabled?:boolean }
/** `warnings`: what the harness holds that it cannot load itself and the service read around, each in a sentence (a marketplace of Codex whose folder is gone): the inventory is complete all the same. Absent in a record written before the field existed. */
export interface Inventory { target_id:string; complete:boolean; error:string|null; warnings?:string[]; plugins:InstalledPlugin[]; supported:boolean }
export interface Activity { id:string; time:string; action:string; status:string; message:string }
/** An AI run of the runtime (`jobs`): an adaptation of a plugin (`plugin_id`, `harness`; no `kind`), or, with `kind` "project", a project made or changed (`project_id`, `operation`, `title`, `file`).
 * `status` is running, completed, failed, cancelled or interrupted. `time` is when it started, in epoch seconds (the runtime sends a number; a text of digits is read the same). */
export interface Job { id:string; kind?:'project'; plugin_id?:string; harness?:string; project_id?:string; operation?:string; title?:string; file?:string; status:string; phase:string; budget_usd:number; log_path:string; message:string; time:string|number }
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
/** A source the last check could not resolve, with the service's words. */
export type CheckError = CheckResult['errors'][number];
/** The review sheet that is open: a plan, and the harness it was made for (null for the whole plan). A one-harness plan is never the plan the note and the table read. */
export interface Review { plan:Plan; target_id:string|null }
/** An apply under way: the plan, how many operations it runs (the removals it leaves out are not counted) and the names of their plugins, for the note and the sheet. */
export interface ApplyProgress { plan_id:string; total:number; names:string }
export interface Autostart { supported:boolean; enabled:boolean; current:boolean }
export interface Maintenance { message:string; details:string[] }
export type Transport = <T>(action:string,payload?:Record<string,unknown>)=>Promise<T>;
export type Page = 'projects'|'sync'|'activity'|'settings';
/** `project.json` of a project file. */
export interface ProjectMeta { schema:number; name:string; slug:string; version:string; author:string; created:string; changed:string; repository:{url:string;branch:string;tag_prefix:string}|null; builtin:boolean }
/** What the action `projects` returns for each listed project: its id and file, then what `muro project info` knows in short (a count the runtime does not send is absent), or `error` when the file is missing or invalid. */
export interface ProjectSummary { id:string; path:string; project?:ProjectMeta; plugin?:{name:string;slug:string;version:string}; inputs?:number; capabilities?:number; entries?:number; examples?:number; records?:number; runs?:number; digest?:string; error?:string }
export type DecisionForm = 'capability'|'always-on'|'hook'|'dropped';
export interface ProjectInput { id:string; url:string|null; pin:string; release:string|null; commit:string|null; license:string|null; paths:string[]; became:Record<DecisionForm,number> }
export interface ProjectDecision { source:string; content:string; form:DecisionForm; targets:string[]; reason:string }
export interface ProjectRecord { id:string; date:string; subjects:string[]; text:string; author:'muro'|'you'; binding:boolean }
export interface ProjectRun { id:string; time:string; version:string; status:'completed'|'cancelled'|'failed'; budget_usd:number|null; engine:string|null; operation?:string; pins:Record<string,string>; changelog:string }
/** One capability and one documented example as the guide's data model carries them (`guide_data`): the keys the graph reads are its own to name. */
export interface GraphCapability { id:string; title:string; [key:string]:unknown }
export interface GraphExample { [key:string]:unknown }
/** What the action `project {id}` returns: `muro project info` of the file as it is. */
export interface ProjectInfo { project:ProjectMeta; plugin:{name:string;slug:string;version:string;description:string}; inputs:ProjectInput[]; decisions:ProjectDecision[]; records:ProjectRecord[]; history:ProjectRun[]; changelog:string; prompts:{file:string;text:string}[]; instructions?:InstructionFile[]; graph:{entries:{name:string;description:string;capabilities:string[]}[];capabilities:GraphCapability[];examples:GraphExample[]}; files:{part:string;path:string;detail:string}[]; digest:string }
/** One of the owner's Markdown files under `custom-instructions/` as `muro project info` reads it: its path relative to that folder and its text. */
export interface InstructionFile { path:string; text:string }
/** The repository a project is published from: the https address, the branch and the prefix of its release tags. */
export type ProjectRepository = { url:string; branch:string; tag_prefix:string };
/** The changes of a project that an AI run makes (`project_job` `operation`), and the run that makes a new project. */
export type ChangeOperation = 'harmonize'|'add_input'|'remove_input'|'move_pin'|'instructions';
export type ProjectOperation = ChangeOperation|'create';
/** How the version of a project moves after an AI run. */
export type VersionStep = 'patch'|'minor'|'major';
/** What a change of an instruction file says: the file written whole, or `text` null to remove it. */
export type InstructionEdit = { path:string; text:string|null };
/** How one input's pin stands against its upstream (`project_updates`, from `muro baseline`): `behind` names the newest release or commit in `upstream`. */
export interface ProjectUpdate { id:string; pin:string; pinned:string; upstream:string|null; status:'current'|'behind'|'frozen'|'drifted'|'unknown'|'error'; note:string }
/** The last update check of a project's inputs, for the file it was made on (`digest`). */
export interface ProjectUpdates { id:string; digest:string; inputs:ProjectUpdate[] }
