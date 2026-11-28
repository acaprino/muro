//! Making and changing projects from the desktop (ADR-0032): what the runtime refuses before an AI run is
//! paid for, the runs themselves, and the edits, deletion, update check and release it makes through the factory. The
//! factory is the stand-in of `common`; the agent is `AGENT`, a Python script a debug build runs in place of
//! Claude Code (`project_jobs::TEST_AGENT_SETTING`), so a run here costs nothing and proves the runtime's part:
//! the status and the message it ends with, what it hands the factory, and the project file it leaves.
mod common;

use common::{calls, install, plugin, project_file};
use muro_desktop_runtime::{jobs, project_jobs, request};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, Instant, SystemTime},
};

/// A stand-in for Claude Code: it writes how it was started beside its work folder (`agent.json`), then does
/// what a `STUB:` word in the owner's request asks (fail, sleep a minute, wait for a `go` file beside the work
/// folder, rewrite an owner's instruction file, have the commit wait for `go-commit`), and otherwise writes a
/// package and a summary, as an AI run would.
const AGENT: &str = r#"
import json, sys, time
from pathlib import Path

args = sys.argv[1:]
prompt = args[args.index("-p") + 1]
work = Path.cwd()
job = work.parent
(job / "agent.json").write_text(json.dumps({"args": args, "cwd": str(work)}), encoding="utf-8")
if "STUB:fail" in prompt:
    print("the agent stopped", file=sys.stderr)
    sys.exit(3)
if "STUB:sleep" in prompt:
    time.sleep(60)
if "STUB:wait" in prompt:
    started = time.time()
    while not (job / "go").exists() and time.time() - started < 60:
        time.sleep(0.05)
if "STUB:instructions" in prompt:
    (work / "custom-instructions" / "rules.md").write_text("Rewritten by the AI", encoding="utf-8")
if "STUB:commit-waits" in prompt:
    (work / "commit-waits").write_text("wait", encoding="utf-8")
(work / "sources.json").write_text("{}", encoding="utf-8")
(work / ".muro-summary.md").write_text("What changed for a user.", encoding="utf-8")
"#;

struct Home {
    temp: tempfile::TempDir,
    data: PathBuf,
    factory: PathBuf,
}

impl Home {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let (factory, settings) = install(temp.path());
        let home = Self { temp, data, factory };
        home.settings(|all| {
            all["python"] = settings["python"].clone();
            all["factory_path"] = settings["factory_path"].clone();
        });
        home
    }

    fn registry(&self) -> Value {
        request(&self.data, "registry", json!({})).unwrap()
    }

    fn settings(&self, change: impl FnOnce(&mut Value)) {
        let current = self.registry();
        let mut all = current["settings"].clone();
        change(&mut all);
        request(&self.data, "settings", json!({"revision":current["revision"],"settings":all})).unwrap();
    }

    fn files(&self) -> PathBuf {
        let folder = self.temp.path().join("files");
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    /// A listed project of id `id`, its file holding `descriptor`.
    fn listed(&self, id: &str, descriptor: Value) -> PathBuf {
        let file = project_file(&self.files().join(format!("{id}.mp")), descriptor);
        let mut all: Vec<Value> = self.registry()["projects"].as_array().cloned().unwrap_or_default();
        all.push(json!({"id":id,"path":file}));
        request(&self.data, "save_projects", json!({"revision":self.registry()["revision"],"projects":all})).unwrap();
        file
    }

    fn call(&self, action: &str, payload: Value) -> anyhow::Result<Value> {
        request(&self.data, action, payload)
    }

    /// The stand-in agent (`AGENT`) in place of Claude Code, for the runs this home starts.
    fn with_agent(self) -> Self {
        let script = self.temp.path().join("agent.py");
        fs::write(&script, AGENT).unwrap();
        self.settings(|all| all[project_jobs::TEST_AGENT_SETTING] = json!(script));
        self
    }
}

fn error_of(result: anyhow::Result<Value>) -> String {
    format!("{:#}", result.expect_err("the action must fail"))
}

fn digest(path: &Path) -> String {
    muro_registry::projects::file_digest(path).unwrap()
}

/// The state of the run `started` as the list of jobs shows it.
fn job_of(home: &Home, started: &Value) -> Value {
    let all = home.call("jobs", json!({})).unwrap();
    all.as_array().unwrap().iter().find(|job| job["id"] == started["id"]).cloned().unwrap()
}

/// The run's state once `done` holds of it, waiting a minute at most.
fn wait(home: &Home, started: &Value, done: impl Fn(&Value) -> bool) -> Value {
    let begun = Instant::now();
    loop {
        let state = job_of(home, started);
        if done(&state) {
            return state;
        }
        assert!(begun.elapsed() < Duration::from_secs(60), "the run never got there: {state}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn finished(home: &Home, started: &Value) -> Value {
    wait(home, started, |state| state["status"] != "running")
}

fn job_dir(home: &Home, started: &Value) -> PathBuf {
    home.data.join("jobs").join(started["id"].as_str().unwrap())
}

/// What the stand-in agent wrote of how it was started, once it has started.
fn agent_started(home: &Home, started: &Value) -> Value {
    let file = job_dir(home, started).join("agent.json");
    let begun = Instant::now();
    loop {
        if let Some(said) = fs::read_to_string(&file).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok()) {
            return said;
        }
        assert!(begun.elapsed() < Duration::from_secs(60), "the agent never started");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn harmonize(home: &Home, file: &Path, request: &str) -> Value {
    home.call("project_job", json!({"id":"demo","operation":"harmonize","digest":digest(file),"budget_usd":1.0,"request":request}))
        .unwrap()
}

fn commits(home: &Home) -> Vec<Vec<String>> {
    calls(&home.factory).into_iter().filter(|args| args[..2] == ["project", "commit"]).collect()
}

fn value_after(args: &[String], option: &str) -> String {
    args[args.iter().position(|arg| arg == option).unwrap() + 1].clone()
}

fn new_project(home: &Home, change: impl FnOnce(&mut Value)) -> anyhow::Result<Value> {
    let mut payload = json!({"name":"My Plugin","slug":"my-plugin","author":"me","folder":home.files(),
        "inputs":[{"source":"https://github.com/owner/skills"}],"request":"","budget_usd":2.0});
    change(&mut payload);
    home.call("create_project", payload)
}

// --- a new project: what is refused before the run --------------------------------------------------

#[test]
fn a_new_project_needs_claude_code() {
    let home = Home::new();
    home.settings(|all| {
        all["ai"]["harness"] = json!("codex");
        all["agent"] = json!("codex");
    });
    assert_eq!(error_of(new_project(&home, |_| {})), project_jobs::NEEDS_CLAUDE);
}

#[test]
fn a_new_project_refuses_what_it_cannot_be_before_any_run() {
    let home = Home::new();
    let taken = home.files().join("taken");
    fs::create_dir_all(&taken).unwrap();
    fs::write(taken.join("my-plugin.mp"), b"x").unwrap();
    let cases: Vec<(Box<dyn FnOnce(&mut Value)>, &str)> = vec![
        (Box::new(|p: &mut Value| p["slug"] = json!("My Plugin")), "lowercase letters and digits"),
        (Box::new(|p: &mut Value| p["name"] = json!("  ")), "The project name is required"),
        (Box::new(|p: &mut Value| p["folder"] = json!("relative/folder")), "full path"),
        (Box::new(move |p: &mut Value| p["folder"] = json!(taken)), "already exists"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([])), "Add at least one input"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([{"source":"http://github.com/o/r"}])), "https:// address"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([{"source":"https://a/b"},{"source":"https://a/b"}])), "named twice"),
        (Box::new(|p: &mut Value| p["budget_usd"] = json!(0)), "budget"),
        (Box::new(|p: &mut Value| p["repository"] = json!({"url":"git@github.com:o/r"})), "repository address"),
        (Box::new(|p: &mut Value| p["slug"] = json!("con")), "a name Windows keeps for a device"),
        (Box::new(|p: &mut Value| p["slug"] = json!("lpt1")), "a name Windows keeps for a device"),
    ];
    for (change, said) in cases {
        let error = error_of(new_project(&home, change));
        assert!(error.contains(said), "{said}: {error}");
    }
    assert!(!home.data.join("jobs").exists(), "no run was started");
}

#[test]
fn a_new_project_refuses_an_id_already_in_the_list() {
    let home = Home::new();
    home.listed("my-plugin", json!({"plugin":plugin("Mine","my-plugin")}));
    // another folder: in the listed project's own, the file that is already there is refused first
    let elsewhere = home.temp.path().join("elsewhere");
    fs::create_dir_all(&elsewhere).unwrap();
    let error = error_of(new_project(&home, |p: &mut Value| p["folder"] = json!(elsewhere)));
    assert!(error.contains("already in your list"), "{error}");
}

// --- a change of a project: what is refused before the run ------------------------------------------

#[test]
fn a_change_names_a_known_operation_and_the_file_as_the_page_read_it() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let unknown = home.call("project_job", json!({"id":"demo","operation":"rename","digest":digest(&file)}));
    assert!(error_of(unknown).contains("Unknown change rename"));
    let stale = home.call("project_job", json!({"id":"demo","operation":"harmonize","digest":"0".repeat(64)}));
    assert_eq!(error_of(stale), project_jobs::CHANGED);
    let none = home.call("project_job", json!({"id":"demo","operation":"harmonize"}));
    assert!(error_of(none).contains("Open the project again"));
    let missing = home.call("project_job", json!({"id":"other","operation":"harmonize","digest":digest(&file)}));
    assert!(error_of(missing).contains("not in your list"));
}

// --- the runs, with the stand-in agent ----------------------------------------------------------------

#[test]
fn the_agent_is_configured_by_nothing_in_its_work_folder() {
    // the person's user settings only (their sign-in), no project or local settings and no MCP server: the work
    // folder holds what a project file from anyone carries (adaptation shares these arguments)
    let args = jobs::agent_args("claude-code", "THE PROMPT", 2.0).unwrap();
    assert_eq!(args, [
        "-p", "THE PROMPT",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Read,Write,Edit,Glob,Grep,Bash",
        "--setting-sources", "user",
        "--strict-mcp-config",
        "--max-budget-usd", "2",
        "--output-format", "json",
        "--no-session-persistence",
    ]);
}

#[test]
fn a_change_whose_agent_fails_leaves_the_file_as_it_was() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let before = fs::read(&file).unwrap();
    let started = harmonize(&home, &file, "STUB:fail");
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "failed", "{ended}");
    let message = ended["message"].as_str().unwrap();
    assert!(message.starts_with("The AI run failed (") && message.ends_with("; see output.log. The project file was not changed"), "{message}");
    assert_eq!(fs::read(&file).unwrap(), before);
    assert!(commits(&home).is_empty(), "nothing was saved");
    assert!(job_dir(&home, &started).join("work").is_dir(), "the work folder stays, for the log to be read against");
    // the agent ran in the work folder, with the arguments that keep that folder from configuring it
    let agent = agent_started(&home, &started);
    let args: Vec<&str> = agent["args"].as_array().unwrap().iter().map(|arg| arg.as_str().unwrap()).collect();
    assert!(args.windows(2).any(|pair| pair == ["--setting-sources", "user"]) && args.contains(&"--strict-mcp-config"), "{args:?}");
    assert!(Path::new(agent["cwd"].as_str().unwrap()).ends_with("work"), "{agent}");
}

#[test]
fn a_cancel_before_the_project_is_saved_stops_the_agent_and_leaves_the_file() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let before = fs::read(&file).unwrap();
    let started = harmonize(&home, &file, "STUB:sleep");
    agent_started(&home, &started);
    let asked = Instant::now();
    home.call("cancel_job", json!({"id":started["id"]})).unwrap();
    let ended = finished(&home, &started);
    assert!(asked.elapsed() < Duration::from_secs(30), "the agent sleeps a minute: the cancel ended it");
    assert_eq!(ended["status"], "cancelled", "{ended}");
    assert_eq!(ended["message"], "The AI run was cancelled. The project file was not changed");
    assert_eq!(fs::read(&file).unwrap(), before);
    assert!(commits(&home).is_empty(), "nothing was saved");
}

#[test]
fn a_change_that_succeeds_is_saved_over_the_file_it_was_asked_on() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let asked_on = digest(&file);
    let started = harmonize(&home, &file, "");
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "completed", "{ended}");
    assert_eq!(ended["message"], "The project was saved. Use Install via Sync… to bring the change to your harnesses");
    let held: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(held["committed"], json!({"operation":"Harmonize again","step":"patch","summary":"What changed for a user."}));
    let commit = commits(&home).pop().unwrap();
    assert_eq!(value_after(&commit, "--expect-digest"), asked_on);
    for wanted in ["--step=patch", "--operation=Harmonize again", "--engine=claude-code", "--budget=1"] {
        assert!(commit.contains(&wanted.to_owned()), "{wanted} in {commit:?}");
    }
    assert!(!job_dir(&home, &started).join("work").exists(), "a run that succeeded keeps no copy of the project");
}

#[test]
fn a_change_saved_over_a_file_that_changed_meanwhile_is_refused_with_the_factorys_reason() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let asked_on = digest(&file);
    let started = harmonize(&home, &file, "STUB:wait");
    agent_started(&home, &started);
    let theirs = json!({"plugin":plugin("Demo","demo"),"edited":{"--name":"Someone else"}}).to_string();
    fs::write(&file, &theirs).unwrap();
    fs::write(job_dir(&home, &started).join("go"), b"go").unwrap();
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "failed", "{ended}");
    // the factory's own reason, and nothing that says the file was left as it was: it was not, by someone else
    assert_eq!(ended["message"], project_jobs::CHANGED);
    assert_eq!(fs::read_to_string(&file).unwrap(), theirs, "the other change stays");
    assert_eq!(value_after(&commits(&home).pop().unwrap(), "--expect-digest"), asked_on);
    assert!(fs::read_to_string(job_dir(&home, &started).join("output.log")).unwrap().contains("Project commit failed: "));
}

#[test]
fn a_cancel_once_the_project_is_being_saved_is_refused_and_the_save_finishes() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let started = harmonize(&home, &file, "STUB:commit-waits");
    wait(&home, &started, |state| state["phase"] == project_jobs::SAVING);
    let refused = home.call("cancel_job", json!({"id":started["id"]}));
    assert_eq!(error_of(refused), project_jobs::SAVING_NOT_CANCELLED);
    // a Cancel that reached the run all the same (another client, a race) is not obeyed either
    let dir = job_dir(&home, &started);
    fs::write(dir.join("cancel"), b"cancel").unwrap();
    std::thread::sleep(Duration::from_millis(500));
    fs::write(dir.join("go-commit"), b"go").unwrap();
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "completed", "{ended}");
    let held: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(held["committed"]["operation"], "Harmonize again");
}

#[test]
fn a_run_that_changed_the_owners_instruction_files_saves_nothing() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"instructions":{"rules.md":"Owner rules"}}));
    let before = fs::read(&file).unwrap();
    let ended = finished(&home, &harmonize(&home, &file, "STUB:instructions"));
    assert_eq!(ended["status"], "failed", "{ended}");
    let message = ended["message"].as_str().unwrap();
    assert!(message.starts_with("The AI changed the custom instruction files") && message.ends_with(". The project file was not changed"), "{message}");
    assert_eq!(fs::read(&file).unwrap(), before);
    assert!(commits(&home).is_empty());
}

#[test]
fn a_new_project_is_saved_with_the_identity_it_was_asked_for_and_listed() {
    let home = Home::new().with_agent();
    let started = new_project(&home, |p: &mut Value| p["name"] = json!("-My Plugin")).unwrap();
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "completed", "{ended}");
    assert_eq!(ended["message"], "The project was created and added to your list. Install it with Install via Sync…");
    let file = home.files().join("my-plugin.mp");
    assert!(file.is_file());
    assert_eq!(home.registry()["projects"], json!([{"id":"my-plugin","path":file}]));
    let made = calls(&home.factory);
    // `--option=value`: a name that begins with a dash is still the name
    let new = made.iter().find(|args| args[..2] == ["project", "new"]).unwrap();
    for wanted in ["--slug=my-plugin", "--name=-My Plugin", "--author=me"] {
        assert!(new.contains(&wanted.to_owned()), "{wanted} in {new:?}");
    }
    let commit = commits(&home).pop().unwrap();
    for wanted in ["--create", "--slug=my-plugin", "--name=-My Plugin", "--author=me", "--operation=New project -My Plugin", "--budget=2"] {
        assert!(commit.contains(&wanted.to_owned()), "{wanted} in {commit:?}");
    }
    assert!(!job_dir(&home, &started).join("work").exists());
}

#[test]
fn a_new_project_whose_agent_fails_says_no_file_was_written() {
    let home = Home::new().with_agent();
    let started = new_project(&home, |p: &mut Value| p["request"] = json!("STUB:fail")).unwrap();
    let ended = finished(&home, &started);
    assert_eq!(ended["status"], "failed", "{ended}");
    assert!(ended["message"].as_str().unwrap().ends_with(". No project file was written"), "{ended}");
    assert!(!home.files().join("my-plugin.mp").exists());
    assert_eq!(home.registry()["projects"], json!([]));
}

#[test]
fn a_run_removes_the_work_folders_of_project_runs_that_ended_a_week_ago_and_keeps_their_logs() {
    let home = Home::new().with_agent();
    let jobs_dir = home.data.join("jobs");
    let job = |id: &str, kind: &str, status: &str, days: u64| -> PathBuf {
        let dir = jobs_dir.join(id);
        fs::create_dir_all(dir.join("work")).unwrap();
        fs::write(dir.join("output.log"), b"what happened").unwrap();
        fs::write(dir.join("state.json"), json!({"id":id,"kind":kind,"status":status,"time":1}).to_string()).unwrap();
        let when = SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60);
        fs::File::options().write(true).open(dir.join("state.json")).unwrap().set_modified(when).unwrap();
        dir
    };
    let failed = job("00000000-0000-4000-8000-000000000001", "project", "failed", 8);
    let cancelled = job("00000000-0000-4000-8000-000000000002", "project", "cancelled", 8);
    let interrupted = job("00000000-0000-4000-8000-000000000003", "project", "interrupted", 8);
    let recent = job("00000000-0000-4000-8000-000000000004", "project", "failed", 6);
    let adaptation = job("00000000-0000-4000-8000-000000000005", "adaptation", "failed", 8);
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    finished(&home, &harmonize(&home, &file, "STUB:fail"));
    for gone in [&failed, &cancelled, &interrupted] {
        assert!(!gone.join("work").exists(), "{}", gone.display());
        assert!(gone.join("output.log").is_file() && gone.join("state.json").is_file(), "the log and the state stay");
    }
    assert!(recent.join("work").is_dir(), "a week is not over");
    assert!(adaptation.join("work").is_dir(), "an adaptation's folders are what its plugin was installed from");
}

#[test]
fn one_job_that_cannot_be_read_is_left_out_of_the_list_not_the_list() {
    let home = Home::new().with_agent();
    let jobs_dir = home.data.join("jobs");
    let (good, bad) = (jobs_dir.join("00000000-0000-4000-8000-000000000001"), jobs_dir.join("00000000-0000-4000-8000-000000000002"));
    fs::create_dir_all(&good).unwrap();
    fs::create_dir_all(&bad).unwrap();
    let state = json!({"id":"00000000-0000-4000-8000-000000000001","status":"failed","time":1});
    fs::write(good.join("state.json"), state.to_string()).unwrap();
    fs::write(bad.join("state.json"), b"{ cut short").unwrap();
    assert_eq!(home.call("jobs", json!({})).unwrap(), json!([state]));
    // a run starts all the same: the list it looks at for a running one leaves that job out
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    assert_eq!(finished(&home, &harmonize(&home, &file, "STUB:fail"))["status"], "failed");
}

// --- edits by hand ----------------------------------------------------------------------------------

#[test]
fn an_edit_asks_the_factory_for_exactly_what_changed_and_returns_the_new_digest() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let before = digest(&file);
    let record = json!({"id":"mine-1","date":"2026-11-21","subjects":[],"text":"Keep it short.","author":"you","binding":true});
    let done = home
        .call("edit_project", json!({"id":"demo","digest":before.clone(),"name":"Renamed","repository":{"url":"https://example.invalid/r","branch":"","tag_prefix":"r-v"},
            "records":[record],"changelog":"# Demo 1.0.0\n"}))
        .unwrap();
    assert_eq!(done["digest"], json!(digest(&file)));
    let held: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(held["edited"], json!({"--name":"Renamed","--repository":"https://example.invalid/r","--branch":"main","--tag-prefix":"r-v",
        "records":[record],"changelog":"# Demo 1.0.0\n"}));
    let edit = calls(&home.factory).into_iter().find(|args| args[..2] == ["project", "edit"]).unwrap();
    assert_eq!(edit[3..5], ["--expect-digest".to_owned(), before]);
}

#[test]
fn a_field_that_begins_with_a_dash_is_still_its_value() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    home.call("edit_project", json!({"id":"demo","digest":digest(&file),"name":"-draft","author":"--me",
        "repository":{"url":"https://example.invalid/r","branch":"-b","tag_prefix":"-v"}})).unwrap();
    let held: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(held["edited"], json!({"--name":"-draft","--author":"--me","--repository":"https://example.invalid/r","--branch":"-b","--tag-prefix":"-v"}));
    let edit = calls(&home.factory).into_iter().find(|args| args[..2] == ["project", "edit"]).unwrap();
    for wanted in ["--name=-draft", "--author=--me", "--branch=-b", "--tag-prefix=-v"] {
        assert!(edit.contains(&wanted.to_owned()), "{wanted} in {edit:?}");
    }
}

#[test]
fn an_edit_takes_the_repository_away_with_null() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    home.call("edit_project", json!({"id":"demo","digest":digest(&file),"repository":null})).unwrap();
    let held: Value = serde_json::from_str(&fs::read_to_string(&file).unwrap()).unwrap();
    assert_eq!(held["edited"], json!({"--no-repository":true}));
}

#[test]
fn an_edit_of_a_file_that_changed_says_so_and_one_with_nothing_to_change_is_refused() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let stale = home.call("edit_project", json!({"id":"demo","digest":"0".repeat(64),"name":"X"}));
    assert_eq!(error_of(stale), project_jobs::CHANGED);
    let nothing = home.call("edit_project", json!({"id":"demo","digest":digest(&file)}));
    assert_eq!(error_of(nothing), "Nothing to change");
    let bad = home.call("edit_project", json!({"id":"demo","digest":digest(&file),"name":"two\nlines"}));
    assert!(error_of(bad).contains("one line"));
}

// --- deleting a project -----------------------------------------------------------------------------

#[test]
fn deleting_a_project_takes_it_off_the_list_and_deletes_its_file() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let kept = home.listed("other", json!({"plugin":plugin("Other","other")}));
    let saved = home.call("delete_project", json!({"id":"demo","revision":home.registry()["revision"]})).unwrap();
    assert_eq!(saved["registry"]["projects"], json!([{"id":"other","path":kept}]));
    assert!(!file.exists() && kept.exists());
}

#[test]
fn a_project_file_kept_in_the_data_directory_is_listed_and_deleted_like_any_other() {
    // A registry may list a file inside Muro's own data folder: no id and no place is kept from deletion.
    let home = Home::new();
    let file = project_file(&home.data.join("projects").join("sample.mp"), json!({"plugin":plugin("Sample","sample")}));
    let other = home.listed("other", json!({"plugin":plugin("Other","other")}));
    let mut all = home.registry()["projects"].as_array().cloned().unwrap();
    all.insert(0, json!({"id":"sample","path":file}));
    request(&home.data, "save_projects", json!({"revision":home.registry()["revision"],"projects":all})).unwrap();
    let shown = home.call("projects", json!({})).unwrap();
    assert_eq!((shown[0]["id"].as_str(), shown[0]["error"].as_str()), (Some("sample"), None), "{}", shown[0]);
    assert_eq!(shown[0].get("included"), None, "no project is marked as Muro's own");
    let saved = home.call("delete_project", json!({"id":"sample","revision":home.registry()["revision"]})).unwrap();
    assert_eq!(saved["registry"]["projects"], json!([{"id":"other","path":other}]));
    assert!(!file.exists() && other.exists());
}

// --- updates of the inputs --------------------------------------------------------------------------

#[test]
fn the_update_check_reads_the_report_whatever_its_exit_code() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo")}));
    let report = home.call("project_updates", json!({"id":"demo"})).unwrap();
    assert_eq!(report["digest"], json!(digest(&file)));
    assert_eq!(report["inputs"][0]["status"], "behind");
    assert_eq!(report["inputs"][0]["upstream"], "v2.0.0");
    let baseline = calls(&home.factory).into_iter().find(|args| args[0] == "baseline").unwrap();
    assert!(baseline[2].ends_with("sources.json") && baseline[3] == "--json");
}

// --- releasing a project ----------------------------------------------------------------------------

fn repository() -> Value {
    json!({"url":"https://example.invalid/owner/demo","branch":"main","tag_prefix":"demo-v"})
}

fn releases(home: &Home) -> Vec<Vec<String>> {
    calls(&home.factory).into_iter().filter(|args| args[..2] == ["project", "release"]).collect()
}

#[test]
fn a_release_asks_the_factory_on_the_digest_the_page_read_and_answers_what_it_printed() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"repository":repository()}));
    let asked_on = digest(&file);
    let done = home.call("release_project", json!({"id":"demo","digest":asked_on.clone()})).unwrap();
    // the command's document as it is; its warning, a line on stderr too, is the end of the reason and nothing else
    assert_eq!(done, json!({"repository":"https://example.invalid/owner/demo","branch":"main","file":"demo.mp","version":"1.0.0","tag":"demo-v1.0.0",
        "pushed":true,"commit":"c".repeat(40),"initialized":false,
        "reason":"Pushed demo.mp to main. No workflow of the repository calls Muro's store workflow."}));
    let asked = releases(&home);
    assert_eq!(asked.len(), 1);
    // the file, the digest that guards it and the runtime's own cache; neither switch unless it was asked for
    assert_eq!(asked[0][2..], [file.to_string_lossy().into_owned(), "--expect-digest".to_owned(), asked_on,
        "--cache".to_owned(), home.data.join("project-cache").to_string_lossy().into_owned()]);
    assert_eq!(digest(&file), done_on(&home), "a release reads the file and never writes it");
}

/// The digest the last release was asked on.
fn done_on(home: &Home) -> String {
    value_after(&releases(home).pop().unwrap(), "--expect-digest")
}

#[test]
fn the_switches_of_a_release_are_passed_through_and_anything_but_a_switch_is_refused() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"repository":repository()}));
    let release = |more: Value| {
        let mut payload = json!({"id":"demo","digest":digest(&file)});
        for (key, value) in more.as_object().unwrap() {
            payload[key.as_str()] = value.clone();
        }
        home.call("release_project", payload)
    };
    let with_workflow = release(json!({"init":true})).unwrap();
    assert_eq!((&with_workflow["initialized"], &with_workflow["pushed"]), (&json!(true), &json!(true)));
    let asked = releases(&home).pop().unwrap();
    assert!(asked.contains(&"--init".to_owned()) && !asked.contains(&"--dry-run".to_owned()), "{asked:?}");
    let preview = release(json!({"dry_run":true,"init":false})).unwrap();
    assert_eq!((&preview["pushed"], &preview["commit"]), (&json!(false), &Value::Null));
    assert!(preview["reason"].as_str().unwrap().starts_with("Dry run: nothing was pushed."), "{preview}");
    let asked = releases(&home).pop().unwrap();
    assert!(asked.contains(&"--dry-run".to_owned()) && !asked.contains(&"--init".to_owned()), "{asked:?}");
    // null is off, as an absent key is
    release(json!({"init":null,"dry_run":null})).unwrap();
    assert_eq!(releases(&home).pop().unwrap().len(), 7, "the file, the digest and the cache, and no switch");
    for (bad, said) in [(json!({"init":"yes"}), "init must be true or false"), (json!({"dry_run":1}), "dry_run must be true or false")] {
        assert_eq!(error_of(release(bad)), said);
    }
    assert_eq!(releases(&home).len(), 3, "a request that is wrong reaches no factory");
}

#[test]
fn a_release_with_nothing_to_push_is_an_answer_and_not_an_error() {
    let home = Home::new();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"repository":repository(),"release":{"held":true,"caller":true}}));
    let done = home.call("release_project", json!({"id":"demo","digest":digest(&file)})).unwrap();
    assert_eq!((&done["pushed"], &done["commit"]), (&json!(false), &Value::Null));
    assert_eq!(done["reason"], "The repository already holds this file as demo.mp: nothing to push.");
}

#[test]
fn a_release_that_is_refused_says_the_commands_sentence_as_it_is() {
    let home = Home::new();
    // the command's own refusals: its sentence, without the prefix it prints before it
    let taken = "demo-v1.0.0: the same version was already released from another file: change the version";
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"repository":repository(),"release":{"refused":taken}}));
    assert_eq!(error_of(home.call("release_project", json!({"id":"demo","digest":digest(&file)}))), taken);
    let stale = home.call("release_project", json!({"id":"demo","digest":"0".repeat(64)}));
    assert_eq!(error_of(stale), project_jobs::CHANGED);
    let local = home.listed("local", json!({"plugin":plugin("Local","local")}));
    let unnamed = home.call("release_project", json!({"id":"local","digest":digest(&local)}));
    assert_eq!(error_of(unnamed), "This project names no repository: give it one with `muro project edit --repository`");
    assert_eq!(releases(&home).len(), 3);
    // the runtime's own, before any factory runs
    let none = home.call("release_project", json!({"id":"demo"}));
    assert_eq!(error_of(none), "Open the project again: the release names no version of its file");
    let missing = home.call("release_project", json!({"id":"other","digest":digest(&file)}));
    assert!(error_of(missing).contains("not in your list"));
    assert_eq!(releases(&home).len(), 3);
}

#[test]
fn a_project_an_ai_run_is_changing_is_not_released_and_another_one_is() {
    let home = Home::new().with_agent();
    let file = home.listed("demo", json!({"plugin":plugin("Demo","demo"),"repository":repository()}));
    let other = home.listed("other", json!({"plugin":plugin("Other","other"),"repository":repository()}));
    let started = harmonize(&home, &file, "STUB:wait");
    agent_started(&home, &started);
    let refused = home.call("release_project", json!({"id":"demo","digest":digest(&file)}));
    assert_eq!(error_of(refused), "An AI run is changing this project: wait for it to finish");
    assert!(releases(&home).is_empty(), "nothing left this computer");
    // a release is no AI run: the run of one project does not hold back the release of another
    let done = home.call("release_project", json!({"id":"other","digest":digest(&other)})).unwrap();
    assert_eq!(done["pushed"], true);
    fs::write(job_dir(&home, &started).join("go"), b"go").unwrap();
    assert_eq!(finished(&home, &started)["status"], "completed");
    // the run wrote the file: the release of it names the file as it is now
    let done = home.call("release_project", json!({"id":"demo","digest":digest(&file)})).unwrap();
    assert_eq!(done["file"], "demo.mp");
}
