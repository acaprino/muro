//! Projects in the desktop runtime: the list, reading a project through the factory, opening a file,
//! installing a project's plugin, the default project and the small actions (ADR-0028). The factory is a
//! stand-in (`common`): what is tested is the runtime around it.
mod common;

use common::{calls, install, plugin, project_file};
use muro_desktop_runtime::{
    projects::{self, DefaultProject},
    request,
};
use muro_registry::{ai, projects as registry_projects};
use serde_json::{Value, json};
use std::{fs, path::{Path, PathBuf}};

struct Home {
    _temp: tempfile::TempDir,
    data: PathBuf,
    factory: PathBuf,
    files: PathBuf,
}

impl Home {
    /// A data directory whose registry names the fake factory.
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let (factory, settings) = install(temp.path());
        let home = Self { files: temp.path().join("files"), _temp: temp, data, factory };
        let current = home.registry();
        let mut all = current["settings"].clone();
        all["python"] = settings["python"].clone();
        all["factory_path"] = settings["factory_path"].clone();
        request(&home.data, "settings", json!({"revision":current["revision"],"settings":all})).unwrap();
        home
    }

    fn registry(&self) -> Value {
        request(&self.data, "registry", json!({})).unwrap()
    }

    fn file(&self, name: &str, descriptor: Value) -> PathBuf {
        project_file(&self.files.join(name), descriptor)
    }

    fn list(&self, projects: &[(&str, &Path)]) {
        let all: Vec<Value> = projects.iter().map(|(id, path)| json!({"id":id,"path":path})).collect();
        request(&self.data, "save_projects", json!({"revision":self.registry()["revision"],"projects":all})).unwrap();
    }

    fn call(&self, action: &str, payload: Value) -> anyhow::Result<Value> {
        request(&self.data, action, payload)
    }

    fn target(&self, id: &str, harness: &str, enabled: bool) {
        let root = self.data.parent().unwrap().join(format!("profile-{id}"));
        fs::create_dir_all(&root).unwrap();
        request(&self.data, "save_target", json!({"revision":self.registry()["revision"],"target":{
            "id":id,"harness":harness,"name":id,"root":root,"executable":"","exclusive":true,"enabled":enabled}})).unwrap();
    }

    fn plugin(&self, id: &str) -> Value {
        self.registry()["plugins"].as_array().unwrap().iter().find(|p| p["id"] == id).cloned().unwrap_or(Value::Null)
    }
}

fn error_of(result: anyhow::Result<Value>) -> String {
    format!("{:#}", result.expect_err("the action must fail"))
}

// --- the list ---------------------------------------------------------------------------------

#[test]
fn an_empty_list_is_empty_and_runs_no_factory() {
    let home = Home::new();
    assert_eq!(home.call("projects", json!({})).unwrap(), json!([]));
    assert!(calls(&home.factory).is_empty());
}

#[test]
fn the_list_has_a_summary_for_each_project_in_order_and_one_bad_file_is_its_own_error() {
    let home = Home::new();
    let good = home.file("good.mp", json!({"plugin":plugin("Good","good")}));
    let broken = home.file("broken.mp", json!({"error":"Not a Muro project file: it is not a zip archive"}));
    let gone = home.files.join("gone.mp");
    let other = home.file("other.mp", json!({"plugin":plugin("Other","other")}));
    home.list(&[("good", &good), ("broken", &broken), ("gone", &gone), ("other", &other)]);
    let shown = home.call("projects", json!({})).unwrap();
    let shown = shown.as_array().unwrap();
    assert_eq!(shown.iter().map(|p| p["id"].as_str().unwrap()).collect::<Vec<_>>(), ["good", "broken", "gone", "other"]);
    assert_eq!(shown[0]["path"], json!(good));
    assert_eq!(shown[0]["plugin"]["slug"], "good");
    assert_eq!((shown[0]["inputs"].as_u64(), shown[0]["runs"].as_u64()), (Some(1), Some(6)));
    assert!(shown[0]["digest"].as_str().unwrap().len() == 64 && shown[0].get("error").is_none());
    assert_eq!(shown[1], json!({"id":"broken","path":broken,"error":"Not a Muro project file: it is not a zip archive"}));
    assert!(shown[2]["error"].as_str().unwrap().starts_with("The project file is missing"), "{}", shown[2]);
    assert!(shown[2].get("plugin").is_none());
    assert_eq!(shown[3]["plugin"]["slug"], "other", "a bad file does not hide the ones after it");
    // The list reads the summary, through the runtime's own cache folder; a missing file is not run at all.
    let made = calls(&home.factory);
    assert_eq!(made.len(), 3, "{made:?}");
    for call in &made {
        assert_eq!(&call[..2], ["project", "info"]);
        assert!(call.contains(&"--summary".to_owned()), "{call:?}");
        assert_eq!(call[call.iter().position(|a| a == "--cache").unwrap() + 1], projects::cache_dir(&home.data).to_string_lossy());
    }
}

#[test]
fn a_file_the_factory_cannot_read_at_all_is_its_own_error_and_hides_no_other() {
    let home = Home::new();
    let before = home.file("before.mp", json!({"plugin":plugin("Before","before")}));
    let crashed = home.file("crashed.mp", json!({"crash":true}));
    let after = home.file("after.mp", json!({"plugin":plugin("After","after")}));
    home.list(&[("before", &before), ("crashed", &crashed), ("after", &after)]);
    let shown = home.call("projects", json!({})).unwrap();
    assert_eq!(shown[0]["plugin"]["slug"], "before");
    assert!(shown[1]["error"].as_str().unwrap().contains("did not print JSON"), "{}", shown[1]);
    assert_eq!(shown[2]["plugin"]["slug"], "after");
}

#[test]
fn the_project_page_reads_the_full_info_and_only_for_a_listed_project() {
    let home = Home::new();
    let file = home.file("demo.mp", json!({"plugin":plugin("Demo","demo")}));
    home.list(&[("demo", &file)]);
    let info = home.call("project", json!({"id":"demo"})).unwrap();
    assert_eq!(info["plugin"]["slug"], "demo");
    assert!(info["graph"].is_object() && info.get("inputs").unwrap().is_array(), "the full info, not the summary");
    assert!(!calls(&home.factory)[0].contains(&"--summary".to_owned()));
    for id in ["nobody", "", "../demo", "demo/../x"] {
        assert!(error_of(home.call("project", json!({"id":id}))).contains("not in your list"), "{id}");
    }
    assert!(error_of(home.call("project", json!({}))).contains("not in your list"));
    assert_eq!(calls(&home.factory).len(), 1, "a refused id runs nothing");
    fs::remove_file(&file).unwrap();
    assert!(error_of(home.call("project", json!({"id":"demo"}))).contains("The project file is missing"));
}

#[test]
fn a_project_that_the_factory_refuses_has_the_factorys_reason() {
    let home = Home::new();
    let file = home.file("bad.mp", json!({"error":"Not a Muro project file: records.json is missing"}));
    home.list(&[("bad", &file)]);
    assert_eq!(error_of(home.call("project", json!({"id":"bad"}))), "Not a Muro project file: records.json is missing");
}

#[test]
fn a_factory_that_cannot_run_is_an_error_of_the_action_not_of_a_project() {
    let home = Home::new();
    let file = home.file("demo.mp", json!({"plugin":plugin("Demo","demo")}));
    home.list(&[("demo", &file)]);
    let current = home.registry();
    let mut settings = current["settings"].clone();
    settings["factory_path"] = json!(home.files);
    request(&home.data, "settings", json!({"revision":current["revision"],"settings":settings})).unwrap();
    assert!(error_of(home.call("projects", json!({}))).contains("Configure the factory path in Settings"));
}

// --- opening a file -----------------------------------------------------------------------------

#[test]
fn a_project_file_is_read_by_the_factory_then_listed_under_its_slug_where_it_is() {
    let home = Home::new();
    let file = home.file("elsewhere.mp", json!({"plugin":plugin("My Plugin","my-plugin")}));
    let opened = home.call("open_project", json!({"path":file})).unwrap();
    assert_eq!((opened["id"].as_str(), opened["plugin"]["slug"].as_str()), (Some("my-plugin"), Some("my-plugin")));
    assert_eq!(opened["path"], json!(file));
    assert_eq!(home.registry()["projects"], json!([{"id":"my-plugin","path":file}]));
    assert!(file.is_file(), "the file stays where it is");
    // opened again, it is the same entry
    let again = home.call("open_project", json!({"path":file})).unwrap();
    assert_eq!(again["id"], "my-plugin");
    assert_eq!(home.registry()["projects"].as_array().unwrap().len(), 1);
    assert_eq!(home.registry()["revision"], 2, "settings, then one list save: the second open saved nothing");
}

#[test]
fn another_file_with_the_same_slug_is_refused_and_so_is_anything_that_is_not_a_project() {
    let home = Home::new();
    let first = home.file("one.mp", json!({"plugin":plugin("Same","same")}));
    home.call("open_project", json!({"path":first})).unwrap();
    let second = home.file("two.mp", json!({"plugin":plugin("Same","same")}));
    let refused = error_of(home.call("open_project", json!({"path":second})));
    assert!(refused.contains("already in your list") && refused.contains("one.mp"), "{refused}");
    let invalid = home.file("invalid.mp", json!({"error":"Not a Muro project file: it is not a zip archive"}));
    assert_eq!(error_of(home.call("open_project", json!({"path":invalid}))), "Not a Muro project file: it is not a zip archive");
    let cases = [
        ("no path", json!({})),
        ("not text", json!({"path":7})),
        ("relative", json!({"path":"projects/a.mp"})),
        ("not an mp", json!({"path":home.files.join("a.zip")})),
        ("up a folder", json!({"path":format!("{}{}..{}one.mp", home.files.display(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR)})),
        ("missing", json!({"path":home.files.join("none.mp")})),
    ];
    for (why, payload) in cases {
        assert!(home.call("open_project", payload).is_err(), "{why}");
    }
    assert_eq!(home.registry()["projects"].as_array().unwrap().len(), 1, "nothing refused was listed");
}

// --- installing ---------------------------------------------------------------------------------

fn built(home: &Home, name: &str, kinds: &[&str]) -> (PathBuf, String) {
    let build: serde_json::Map<String, Value> = kinds.iter().map(|k| ((*k).to_owned(), json!("1.0.0"))).collect();
    let file = home.file(&format!("{name}.mp"), json!({"plugin":plugin("Demo", name),"build":build}));
    home.list(&[(name, &file)]);
    let digest = registry_projects::file_digest(&file).unwrap();
    (file, digest)
}

#[test]
fn install_puts_the_build_in_the_list_and_sets_its_targets_in_one_place() {
    let home = Home::new();
    // Targets of kinds that read configuration files: those of Claude Code and Codex run the harness's
    // own command for their inventory, which a test must not depend on.
    home.target("pi-main", "pi", true);
    home.target("pi-off", "pi", false);
    home.target("oc", "opencode", true);
    let (file, digest) = built(&home, "demo", &["pi", "opencode", "claude-code"]);
    let done = home.call("install_project", json!({"id":"demo","harnesses":["pi","opencode"]})).unwrap();
    assert_eq!((done["id"].as_str(), done["digest"].as_str()), (Some("demo"), Some(digest.as_str())));
    assert_eq!(done["unmanaged"], json!([]));
    let installed = home.plugin("demo");
    assert_eq!(installed["project"], "demo");
    assert_eq!(installed["name"], "Demo");
    // every enabled target of each kind named, none of a kind left out, no disabled one
    assert_eq!(installed["targets"], json!(["pi-main", "oc"]));
    let builds = installed["distributions"].as_array().unwrap();
    assert_eq!(builds.iter().map(|d| d["harness"].as_str().unwrap()).collect::<Vec<_>>(), ["pi", "opencode"]);
    for build in builds {
        assert_eq!((build["origin"].as_str(), build["version"].as_str()), (Some("muro"), Some("1.0.0")));
        assert_eq!(build["project_digest"], json!(digest));
        assert_eq!(build["source_revision"], installed["upstream_revision"]);
        assert!(build["path"].as_str().unwrap().contains(&digest), "the build is the cached unpack of this file");
    }
    // it is what the next plan installs, and the registry refuses nothing about it
    let plan = home.call("plan", json!({"target_id":"oc"})).unwrap();
    assert_eq!(plan["blockers"], json!([]));
    assert_eq!(plan["operations"].as_array().unwrap().iter().map(|o| o["kind"].as_str().unwrap()).collect::<Vec<_>>(), ["install"]);
    // a second call is the same plugin, not a second one
    home.call("install_project", json!({"id":"demo","harnesses":["pi","opencode"]})).unwrap();
    assert_eq!(home.plugin("demo")["targets"], json!(["pi-main", "oc"]));
    assert_eq!(home.plugin("demo")["distributions"].as_array().unwrap().len(), 2);
    assert!(file.is_file());
}

#[test]
fn a_kind_left_out_loses_its_target_for_that_plugin_and_one_added_gains_it() {
    let home = Home::new();
    home.target("pi-main", "pi", true);
    home.target("oc", "opencode", true);
    built(&home, "demo", &["pi", "opencode"]);
    home.call("install_project", json!({"id":"demo","harnesses":["pi"]})).unwrap();
    assert_eq!(home.plugin("demo")["targets"], json!(["pi-main"]));
    home.call("install_project", json!({"id":"demo","harnesses":["pi","opencode"]})).unwrap();
    assert_eq!(home.plugin("demo")["targets"], json!(["pi-main", "oc"]));
    assert_eq!(home.plugin("demo")["distributions"].as_array().unwrap().len(), 2);
    home.call("install_project", json!({"id":"demo","harnesses":["opencode"]})).unwrap();
    let kept = home.plugin("demo");
    assert_eq!(kept["targets"], json!(["oc"]));
    assert_eq!(kept["distributions"].as_array().unwrap().iter().map(|d| d["harness"].as_str().unwrap()).collect::<Vec<_>>(), ["opencode"]);
}

#[test]
fn a_kind_without_a_target_is_reported_and_a_disabled_target_that_holds_the_plugin_stays() {
    let home = Home::new();
    home.target("pi-off", "pi", false);
    built(&home, "demo", &["pi", "claude-code"]);
    let done = home.call("install_project", json!({"id":"demo","harnesses":["pi","claude-code"]})).unwrap();
    assert_eq!(done["unmanaged"], json!(["pi", "claude-code"]));
    assert_eq!(home.plugin("demo")["targets"], json!([]), "a disabled target is not added");
    // the person turns it on for this plugin by hand: a later install keeps it while the kind is named
    let current = home.registry();
    let mut held = home.plugin("demo");
    held["targets"] = json!(["pi-off"]);
    request(&home.data, "save_plugin", json!({"revision":current["revision"],"plugin":held})).unwrap();
    home.call("install_project", json!({"id":"demo","harnesses":["pi"]})).unwrap();
    assert_eq!(home.plugin("demo")["targets"], json!(["pi-off"]));
    home.call("install_project", json!({"id":"demo","harnesses":["claude-code"]})).unwrap();
    assert_eq!(home.plugin("demo")["targets"], json!([]), "a kind left out loses it, disabled or not");
}

#[test]
fn install_refuses_what_it_cannot_do_and_changes_nothing() {
    let home = Home::new();
    home.target("oc", "opencode", true);
    built(&home, "demo", &["claude-code"]);
    let before = home.registry();
    let cases = [
        ("no harnesses key", json!({"id":"demo"}), "Name the harnesses"),
        ("not a list", json!({"id":"demo","harnesses":"claude-code"}), "Name the harnesses"),
        ("an empty list", json!({"id":"demo","harnesses":[]}), "at least one harness"),
        ("not a name", json!({"id":"demo","harnesses":[1]}), "A harness is its name"),
        ("an unknown harness", json!({"id":"demo","harnesses":["vim"]}), "No Muro adapter for the harness vim"),
        ("a path as a harness", json!({"id":"demo","harnesses":["../claude-code"]}), "No Muro adapter"),
        ("a build that is not in the file", json!({"id":"demo","harnesses":["codex"]}), "no adapter for codex"),
        ("an unlisted project", json!({"id":"other","harnesses":["claude-code"]}), "not in your list"),
        ("a bad id", json!({"id":"../demo","harnesses":["claude-code"]}), "not in your list"),
    ];
    for (why, payload, reason) in cases {
        let error = error_of(home.call("install_project", payload));
        assert!(error.contains(reason), "{why}: {error}");
    }
    assert_eq!(home.registry(), before, "nothing was saved");
}

#[test]
fn a_project_whose_file_has_no_built_plugin_cannot_be_installed() {
    let home = Home::new();
    let file = home.file("nobuild.mp", json!({"plugin":plugin("No Build","nobuild")}));
    home.list(&[("nobuild", &file)]);
    // the fake factory unpacks an empty release folder: nothing under adapters/
    let error = error_of(home.call("install_project", json!({"id":"nobuild","harnesses":["claude-code"]})));
    assert!(error.contains("no adapter for claude-code"), "{error}");
    assert_eq!(home.plugin("nobuild"), Value::Null);
}

#[test]
fn a_file_that_now_holds_another_plugin_is_not_installed_under_the_old_id() {
    let home = Home::new();
    let (file, _) = built(&home, "demo", &["claude-code"]);
    project_file(&file, json!({"plugin":plugin("Renamed","renamed"),"build":{"claude-code":"1.0.0"}}));
    let error = error_of(home.call("install_project", json!({"id":"demo","harnesses":["claude-code"]})));
    assert!(error.contains("renamed") && error.contains("open the project again"), "{error}");
}

#[test]
fn a_plugin_of_the_same_name_that_is_not_the_projects_is_never_touched() {
    let home = Home::new();
    let own = home.files.join("own-source");
    fs::create_dir_all(&own).unwrap();
    fs::write(own.join("package.json"), r#"{"name":"demo","version":"1.0.0"}"#).unwrap();
    request(&home.data, "save_plugin", json!({"revision":home.registry()["revision"],"plugin":{
        "id":"demo","name":"My own","source":own,"policy":"head","pinned_version":"","targets":[],"distributions":[]}})).unwrap();
    built(&home, "demo", &["claude-code"]);
    let before = home.plugin("demo");
    let error = error_of(home.call("install_project", json!({"id":"demo","harnesses":["claude-code"]})));
    assert!(error.contains("not this project's"), "{error}");
    assert_eq!(home.plugin("demo"), before);
}

#[test]
fn a_changed_file_makes_the_installed_build_stale_until_the_project_is_installed_again() {
    let home = Home::new();
    home.target("oc", "opencode", true);
    let (file, first) = built(&home, "demo", &["opencode"]);
    home.call("install_project", json!({"id":"demo","harnesses":["opencode"]})).unwrap();
    assert_eq!(home.call("plan", json!({})).unwrap()["blockers"], json!([]));
    project_file(&file, json!({"plugin":plugin("Demo","demo"),"build":{"opencode":"1.1.0"}}));
    let second = registry_projects::file_digest(&file).unwrap();
    assert_ne!(first, second);
    let blockers = home.call("plan", json!({})).unwrap()["blockers"].clone();
    assert!(blockers[0].as_str().unwrap().ends_with("Project file changed: open the project again"), "{blockers}");
    // installing again takes the file as it is now: a new unpack, a new source, the same plugin
    home.call("install_project", json!({"id":"demo","harnesses":["opencode"]})).unwrap();
    let plugin = home.plugin("demo");
    assert_eq!(plugin["distributions"][0]["project_digest"], json!(second));
    assert_eq!(plugin["distributions"][0]["version"], "1.1.0");
    assert_eq!(plugin["targets"], json!(["oc"]));
    assert_eq!(home.call("plan", json!({})).unwrap()["blockers"], json!([]));
}

// --- the default project --------------------------------------------------------------------------

fn resources(home: &Home) -> PathBuf {
    let folder = home.files.join("resources");
    fs::create_dir_all(folder.join("projects")).unwrap();
    fs::write(folder.join("projects").join("marionette.mp"), b"the project Muro ships").unwrap();
    folder
}

#[test]
fn a_muro_without_a_bundled_project_installs_none() {
    let home = Home::new();
    let empty = home.files.join("none");
    fs::create_dir_all(&empty).unwrap();
    assert_eq!(projects::install_default(&home.data, &empty).unwrap(), DefaultProject::NotBundled);
    assert_eq!(home.registry()["projects"], json!([]));
    assert!(!projects::projects_dir(&home.data).exists());
}

#[test]
fn the_default_project_is_copied_and_listed_once_and_never_overwritten() {
    let home = Home::new();
    let bundled = resources(&home);
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::Installed);
    let kept = projects::projects_dir(&home.data).join("marionette.mp");
    assert_eq!(fs::read(&kept).unwrap(), b"the project Muro ships");
    assert_eq!(home.registry()["projects"], json!([{"id":"marionette","path":kept}]));
    // the person edits it (or a newer one is kept there): a start again leaves it exactly as it is
    fs::write(&kept, b"the person's own version").unwrap();
    let revision = home.registry()["revision"].clone();
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::AlreadyThere);
    assert_eq!(fs::read(&kept).unwrap(), b"the person's own version");
    assert_eq!(home.registry()["revision"], revision);
}

#[test]
fn a_default_project_the_person_removed_and_deleted_does_not_come_back_at_every_start() {
    let home = Home::new();
    let bundled = resources(&home);
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::Installed);
    let kept = projects::projects_dir(&home.data).join("marionette.mp");
    request(&home.data, "save_projects", json!({"revision":home.registry()["revision"],"projects":[]})).unwrap();
    fs::remove_file(&kept).unwrap();
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::AlreadyThere);
    assert_eq!(home.registry()["projects"], json!([]));
    assert!(!kept.exists());
}

#[test]
fn a_file_the_person_already_keeps_there_is_never_replaced_even_without_the_mark() {
    let home = Home::new();
    let bundled = resources(&home);
    let kept = projects::projects_dir(&home.data).join("marionette.mp");
    fs::create_dir_all(kept.parent().unwrap()).unwrap();
    fs::write(&kept, b"already mine").unwrap();
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::AlreadyThere);
    assert_eq!(fs::read(&kept).unwrap(), b"already mine");
    assert_eq!(home.registry()["projects"], json!([]), "a file that was not listed is not listed for them");
}

#[test]
fn a_start_that_ended_after_listing_is_finished_by_the_next_one() {
    let home = Home::new();
    let bundled = resources(&home);
    let kept = projects::projects_dir(&home.data).join("marionette.mp");
    home.list(&[("marionette", &kept)]);
    assert!(!kept.exists());
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::Installed);
    assert_eq!(fs::read(&kept).unwrap(), b"the project Muro ships");
    assert_eq!(home.registry()["projects"].as_array().unwrap().len(), 1, "listed once");
}

#[test]
fn a_project_of_the_person_with_the_id_marionette_is_left_alone() {
    let home = Home::new();
    let bundled = resources(&home);
    let mine = home.file("mine.mp", json!({"plugin":plugin("Mine","marionette")}));
    home.list(&[("marionette", &mine)]);
    assert_eq!(projects::install_default(&home.data, &bundled).unwrap(), DefaultProject::IdTaken);
    assert_eq!(home.registry()["projects"], json!([{"id":"marionette","path":mine}]));
    assert!(!projects::projects_dir(&home.data).join("marionette.mp").exists());
}

// --- small actions -------------------------------------------------------------------------------

#[test]
fn env_present_says_whether_a_variable_is_set_and_never_what_it_holds() {
    let home = Home::new();
    let secret = "sk-live-0123456789abcdef";
    // SAFETY: names unique to this test; no other test reads them
    unsafe {
        std::env::set_var("MURO_TEST_KEY_SET", secret);
        std::env::set_var("MURO_TEST_KEY_EMPTY", "");
        std::env::remove_var("MURO_TEST_KEY_UNSET");
    }
    assert_eq!(home.call("env_present", json!({"name":"MURO_TEST_KEY_SET"})).unwrap(), json!({"set":true}));
    assert_eq!(home.call("env_present", json!({"name":"MURO_TEST_KEY_EMPTY"})).unwrap(), json!({"set":false}));
    assert_eq!(home.call("env_present", json!({"name":"MURO_TEST_KEY_UNSET"})).unwrap(), json!({"set":false}));
    for pasted in [secret, "has space", "", "1ABC", "a=b"] {
        let error = error_of(home.call("env_present", json!({"name":pasted})));
        assert_eq!(error, ai::KEY_REFUSED);
        assert!(pasted.is_empty() || !error.contains(pasted));
    }
    assert!(home.call("env_present", json!({})).is_err());
    assert!(home.call("env_present", json!({"name":5})).is_err());
}

#[test]
fn the_file_dialog_filter_is_read_as_a_name_and_extensions_and_nothing_else() {
    assert_eq!(projects::dialog_filter("Muro project (*.mp)").unwrap(), Some(("Muro project".to_owned(), vec!["mp".to_owned()])));
    assert_eq!(
        projects::dialog_filter(" Images (*.png; *.JPG,*.jpeg) ").unwrap(),
        Some(("Images".to_owned(), vec!["png".to_owned(), "JPG".to_owned(), "jpeg".to_owned()]))
    );
    assert_eq!(projects::dialog_filter("Name (with parens) (*.mp)").unwrap().unwrap().0, "Name (with parens)");
    assert_eq!(projects::dialog_filter("").unwrap(), None);
    assert_eq!(projects::dialog_filter("   ").unwrap(), None);
    for bad in ["Muro project", "(*.mp)", "Muro project (*.mp", "Muro project ()", "Muro project (mp)", "Muro project (*.)",
                "Muro project (*.m p3x\u{0}q)", "Muro project (*.*)", "Muro project (*.tar.gz)", "x (*.mp) trailing",
                "Na\nme (*.mp)", "N (*.a1234567890)", "N (*.a *.b *.c *.d *.e *.f *.g *.h *.i)"] {
        assert!(projects::dialog_filter(bad).is_err(), "{bad:?}");
    }
}

#[test]
fn the_folder_to_open_is_the_folder_of_a_listed_project_and_nothing_else() {
    let home = Home::new();
    let file = home.file("a/demo.mp", json!({"plugin":plugin("Demo","demo")}));
    home.list(&[("demo", &file)]);
    let registry = home.registry();
    let folder = file.parent().unwrap();
    for path in [file.to_string_lossy().into_owned(), folder.to_string_lossy().into_owned()] {
        assert_eq!(projects::folder_to_open(&registry, &path).unwrap(), folder, "{path}");
    }
    let sibling = home.files.join("b");
    fs::create_dir_all(&sibling).unwrap();
    let longer = format!("{}-more", folder.display());
    let up = format!("{}{}..{}b", folder.display(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR);
    let refused = [
        sibling.to_string_lossy().into_owned(),
        home.files.to_string_lossy().into_owned(),
        longer,
        up,
        home.data.to_string_lossy().into_owned(),
        String::new(),
        "..".into(),
        "demo.mp".into(),
    ];
    for path in refused {
        assert!(projects::folder_to_open(&registry, &path).is_err(), "{path:?}");
    }
    assert!(error_of(home.call("open_folder", json!({"path":sibling}))).contains("Only the folder of a project in your list"));
    assert!(error_of(home.call("open_folder", json!({}))).contains("Only the folder of a project in your list"));
}
