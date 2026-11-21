//! Making and changing projects from the desktop (ADR-0030): what the runtime refuses before an AI run is
//! paid for, and the edits, deletion and update check it makes through the factory. The factory is the
//! stand-in of `common`; an AI run itself is not started here (it needs Claude Code), so what is tested is
//! everything around it.
mod common;

use common::{calls, install, plugin, project_file};
use muro_desktop_runtime::{project_jobs, request};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

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
}

fn error_of(result: anyhow::Result<Value>) -> String {
    format!("{:#}", result.expect_err("the action must fail"))
}

fn digest(path: &Path) -> String {
    muro_registry::projects::file_digest(path).unwrap()
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
        (Box::new(|p: &mut Value| p["slug"] = json!("marionette")), "the project Muro ships"),
        (Box::new(|p: &mut Value| p["name"] = json!("  ")), "The project name is required"),
        (Box::new(|p: &mut Value| p["folder"] = json!("relative/folder")), "full path"),
        (Box::new(move |p: &mut Value| p["folder"] = json!(taken)), "already exists"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([])), "Add at least one input"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([{"source":"http://github.com/o/r"}])), "https:// address"),
        (Box::new(|p: &mut Value| p["inputs"] = json!([{"source":"https://a/b"},{"source":"https://a/b"}])), "named twice"),
        (Box::new(|p: &mut Value| p["budget_usd"] = json!(0)), "budget"),
        (Box::new(|p: &mut Value| p["repository"] = json!({"url":"git@github.com:o/r"})), "repository address"),
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
    assert!(error_of(new_project(&home, |_| {})).contains("already in your list"));
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
fn the_project_muro_ships_cannot_be_deleted() {
    let home = Home::new();
    let file = home.listed("marionette", json!({"plugin":plugin("Marionette","marionette")}));
    let refused = home.call("delete_project", json!({"id":"marionette","revision":home.registry()["revision"]}));
    assert!(error_of(refused).contains("cannot be deleted"));
    assert!(file.exists());
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
