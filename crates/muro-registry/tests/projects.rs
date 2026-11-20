//! The registry's list of projects, the AI engine settings and what a plan does with a plugin made from
//! a project whose file has changed (ADR-0028).
use muro_registry::{ai, projects, service::request};
use serde_json::{Value, json};
use std::{fs, path::{Path, PathBuf}};

fn registry(root: &Path) -> Value {
    request(root, "registry", json!({})).unwrap()
}

fn absolute(name: &str) -> String {
    let base = if cfg!(windows) { r"C:\Users\someone\Projects" } else { "/home/someone/projects" };
    Path::new(base).join(name).to_string_lossy().into_owned()
}

fn save_projects(root: &Path, list: Value) -> anyhow::Result<Value> {
    request(root, "save_projects", json!({"revision":registry(root)["revision"],"projects":list}))
}

fn save_settings(root: &Path, change: impl FnOnce(&mut Value)) -> anyhow::Result<Value> {
    let current = registry(root);
    let mut settings = current["settings"].clone();
    change(&mut settings);
    request(root, "settings", json!({"revision":current["revision"],"settings":settings}))
}

// --- the list ---------------------------------------------------------------------------------

#[test]
fn a_registry_starts_with_no_projects_and_saves_a_list_with_its_revision() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    assert_eq!(registry(root)["projects"], json!([]));
    let list = json!([{"id":"marionette","path":absolute("marionette.mp")},
                      {"id":"notes","path":absolute("Notes.MP")}]);
    let saved = save_projects(root, list.clone()).unwrap();
    assert_eq!(saved["registry"]["projects"], list);
    assert_eq!(registry(root)["projects"], list);
    assert_eq!(registry(root)["revision"], 1);
    // a stale revision is refused, and the list is as it was
    let stale = request(root, "save_projects", json!({"revision":0,"projects":[]})).unwrap_err();
    assert!(format!("{stale:#}").contains("revision"), "{stale:#}");
    assert_eq!(registry(root)["projects"], list);
    // an empty list empties it
    save_projects(root, json!([])).unwrap();
    assert_eq!(registry(root)["projects"], json!([]));
}

#[test]
fn a_list_of_projects_is_refused_unless_every_project_is_an_id_and_an_absolute_mp_path() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let good = absolute("good.mp");
    let up = format!("{}{}..{}x.mp", absolute("a"), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR);
    let refused = [
        ("not a list", json!({"id":"a","path":good})),
        ("not an object", json!(["a"])),
        ("no id", json!([{"path":good}])),
        ("no path", json!([{"id":"a"}])),
        ("id is not text", json!([{"id":1,"path":good}])),
        ("path is not text", json!([{"id":"a","path":1}])),
        ("bad id", json!([{"id":"../a","path":good}])),
        ("empty id", json!([{"id":"","path":good}])),
        ("relative path", json!([{"id":"a","path":"projects/a.mp"}])),
        ("bare file name", json!([{"id":"a","path":"a.mp"}])),
        ("not an mp", json!([{"id":"a","path":absolute("a.zip")}])),
        ("no extension", json!([{"id":"a","path":absolute("a")}])),
        ("goes up a folder", json!([{"id":"a","path":up}])),
        ("two with one id", json!([{"id":"a","path":good},{"id":"a","path":absolute("other.mp")}])),
        ("two with one file", json!([{"id":"a","path":good},{"id":"b","path":good}])),
        ("an extra field", json!([{"id":"a","path":good,"key":"x"}])),
    ];
    for (why, list) in refused {
        let error = save_projects(root, list).unwrap_err();
        assert!(!format!("{error:#}").is_empty(), "{why}");
        assert_eq!(registry(root)["projects"], json!([]), "{why}: nothing was saved");
        assert_eq!(registry(root)["revision"], 0, "{why}: the revision did not move");
    }
    #[cfg(windows)]
    {
        let spelled = json!([{"id":"a","path":r"C:\Users\x\A.mp"},{"id":"b","path":"c:/users/x/a.MP"}]);
        assert!(save_projects(root, spelled).is_err(), "Windows names one file once, however it is spelled");
    }
}

fn remove_project(root: &Path, id: &str) -> anyhow::Result<Value> {
    request(root, "remove_project", json!({"revision":registry(root)["revision"],"id":id}))
}

#[test]
fn a_project_is_removed_from_the_list_and_only_from_the_list() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (file, other) = (root.join("notes.mp"), root.join("other.mp"));
    fs::write(&file, b"a project").unwrap();
    save_projects(root, json!([{"id":"marionette","path":absolute("marionette.mp")},{"id":"notes","path":file},{"id":"other","path":other}])).unwrap();
    let removed = remove_project(root, "notes").unwrap();
    assert_eq!(removed["registry"]["projects"], json!([{"id":"marionette","path":absolute("marionette.mp")},{"id":"other","path":other}]));
    assert_eq!(registry(root)["projects"], removed["registry"]["projects"]);
    assert_eq!(fs::read(&file).unwrap(), b"a project", "the file is the person's: it stays");
    assert_eq!(registry(root)["revision"], 2, "one save for the list, one for the removal");
    // an id the list does not hold, a stale revision and an id that is no id change nothing
    let unlisted = remove_project(root, "notes").unwrap_err();
    assert!(format!("{unlisted:#}").contains("not in your list"), "{unlisted:#}");
    let stale = request(root, "remove_project", json!({"revision":0,"id":"other"})).unwrap_err();
    assert!(format!("{stale:#}").contains("revision"), "{stale:#}");
    for bad in [json!({"id":"../other"}), json!({"id":""}), json!({"id":7}), json!({})] {
        let mut payload = bad.clone();
        payload["revision"] = registry(root)["revision"].clone();
        assert!(request(root, "remove_project", payload).is_err(), "{bad}");
    }
    assert_eq!(registry(root)["projects"].as_array().unwrap().len(), 2);
    assert_eq!(registry(root)["revision"], 2);
}

#[test]
fn the_default_project_cannot_be_removed_from_the_list() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let list = json!([{"id":projects::DEFAULT_ID,"path":absolute("marionette.mp")},{"id":"notes","path":absolute("notes.mp")}]);
    save_projects(root, list.clone()).unwrap();
    let before = registry(root);
    let refused = remove_project(root, "marionette").unwrap_err();
    assert_eq!(format!("{refused:#}"), "The default project stays in the list");
    assert_eq!(projects::DEFAULT_ID, "marionette");
    assert_eq!(registry(root), before, "nothing was saved, not even the revision");
    assert!(projects::remove(&list, "marionette").is_err());
    assert_eq!(projects::remove(&list, "notes").unwrap(), json!([{"id":"marionette","path":absolute("marionette.mp")}]));
}

#[test]
fn an_older_registry_without_projects_reads_with_an_empty_list() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::write(root.join("registry.json"), json!({"schema":1,"revision":4,"plugins":[],"targets":[],
        "settings":{"auto_sync":false,"interval_minutes":60,"agent":"claude-code","python":"python","factory_path":""}}).to_string()).unwrap();
    let loaded = registry(root);
    assert_eq!(loaded["projects"], json!([]));
    assert_eq!(loaded["revision"], 4, "reading changes nothing");
    save_projects(root, json!([{"id":"a","path":absolute("a.mp")}])).unwrap();
    assert_eq!(registry(root)["revision"], 5);
}

// --- the AI settings --------------------------------------------------------------------------

#[test]
fn settings_start_at_the_ai_defaults() {
    let temp = tempfile::tempdir().unwrap();
    let defaults = json!({"engine":"harness","harness":"claude-code","budget_usd":0.5,
                          "api_base":"https://api.openai.com/v1","model":"","api_key_env":"MURO_API_KEY"});
    assert_eq!(registry(temp.path())["settings"]["ai"], defaults);
    assert_eq!(ai::defaults(), defaults);
    assert_eq!(request(temp.path(), "status", json!({})).unwrap()["settings"]["ai"], defaults);
}

#[test]
fn the_old_agent_setting_becomes_the_harness_of_a_registry_saved_before() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let old = |agent: &str| json!({"schema":1,"revision":2,"plugins":[],"targets":[],
        "settings":{"auto_sync":true,"interval_minutes":15,"close_to_tray":true,"agent":agent,"python":"py","factory_path":"f"}});
    fs::write(root.join("registry.json"), old("codex").to_string()).unwrap();
    let settings = registry(root)["settings"].clone();
    assert_eq!(settings["ai"]["harness"], "codex");
    assert_eq!(settings["ai"]["engine"], "harness");
    assert_eq!(settings["ai"]["budget_usd"], 0.5);
    assert_eq!(settings["python"], "py", "the rest is as it was");
    // an agent that is no harness of the engine keeps the default one
    fs::write(root.join("registry.json"), old("hermes").to_string()).unwrap();
    assert_eq!(registry(root)["settings"]["ai"]["harness"], "claude-code");
}

#[test]
fn ai_settings_are_saved_and_agent_follows_the_harness() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let saved = save_settings(root, |s| {
        s["ai"] = json!({"engine":"api","harness":"codex","budget_usd":2.5,"api_base":"http://localhost:8080/v1",
                         "model":"gpt-x","api_key_env":"MY_KEY"});
    })
    .unwrap();
    let settings = &saved["registry"]["settings"];
    assert_eq!(settings["ai"], json!({"engine":"api","harness":"codex","budget_usd":2.5,
        "api_base":"http://localhost:8080/v1","model":"gpt-x","api_key_env":"MY_KEY"}));
    assert_eq!(settings["agent"], "codex", "what still reads `agent` sees the harness");
    assert_eq!(registry(root)["settings"], *settings);
}

#[test]
fn a_page_that_sends_only_the_old_agent_keeps_the_rest_of_the_ai_settings() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    save_settings(root, |s| {
        s["ai"] = json!({"engine":"api","harness":"claude-code","budget_usd":3,"api_base":"https://example.org/v1",
                         "model":"m","api_key_env":"K"});
    })
    .unwrap();
    save_settings(root, |s| {
        s.as_object_mut().unwrap().remove("ai");
        s["agent"] = json!("codex");
    })
    .unwrap();
    let ai = registry(root)["settings"]["ai"].clone();
    assert_eq!((ai["harness"].as_str(), ai["engine"].as_str(), ai["model"].as_str()), (Some("codex"), Some("api"), Some("m")));
    // sent together, `ai` is the truth
    save_settings(root, |s| {
        s["agent"] = json!("claude-code");
        s["ai"]["harness"] = json!("codex");
    })
    .unwrap();
    assert_eq!(registry(root)["settings"]["agent"], "codex");
    // a partial `ai` changes only what it names
    save_settings(root, |s| s["ai"] = json!({"model":"other"})).unwrap();
    let ai = registry(root)["settings"]["ai"].clone();
    assert_eq!((ai["model"].as_str(), ai["engine"].as_str(), ai["api_base"].as_str()),
               (Some("other"), Some("api"), Some("https://example.org/v1")));
}

#[test]
fn ai_settings_that_are_not_valid_are_refused_and_change_nothing() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let before = registry(root);
    let refused = [
        ("engine", json!({"engine":"cloud"})),
        ("engine type", json!({"engine":1})),
        ("harness", json!({"harness":"opencode"})),
        ("budget zero", json!({"budget_usd":0})),
        ("budget negative", json!({"budget_usd":-1})),
        ("budget too large", json!({"budget_usd":101})),
        ("budget text", json!({"budget_usd":"2"})),
        ("plain http off localhost", json!({"api_base":"http://example.com/v1"})),
        ("lookalike of localhost", json!({"api_base":"http://localhost.evil.example/v1"})),
        ("credentials in the address", json!({"api_base":"http://localhost@evil.example/v1"})),
        ("credentials at https", json!({"api_base":"https://user:pass@example.com/v1"})),
        ("not a url", json!({"api_base":"sk-not-an-address"})),
        ("another scheme", json!({"api_base":"ftp://example.com/v1"})),
        ("file scheme", json!({"api_base":"file:///etc/passwd"})),
        ("model with a control character", json!({"model":"a\nb"})),
        ("a field it does not know", json!({"api_key":"sk-live-0123456789"})),
        ("not an object", json!("sk-live-0123456789")),
    ];
    for (why, ai) in refused {
        let error = save_settings(root, |s| s["ai"] = ai.clone()).unwrap_err();
        assert!(!format!("{error:#}").is_empty(), "{why}");
        assert!(!format!("{error:#}").contains("sk-live-0123456789"), "{why}: the value is never echoed");
    }
    assert_eq!(registry(root), before, "nothing was saved");
    // and what is allowed, on this machine and over https
    // The scheme is compared without regard to case, as the factory compares it (`muro/agent.py`).
    for base in ["https://api.example.com/v1", "HTTPS://api.example.com/v1", "Https://API.example.com/v1",
                 "http://localhost:11434/v1", "HTTP://localhost:11434/v1", "http://127.0.0.1:8080/v1",
                 "http://[::1]:8080/v1", "http://LOCALHOST/v1", "HTTP://LOCALHOST/v1"] {
        save_settings(root, |s| s["ai"] = json!({"engine":"api","api_base":base})).unwrap_or_else(|e| panic!("{base}: {e:#}"));
    }
    for base in ["HTTP://example.com/v1", "Http://example.com/v1", "HTTP://localhost.evil.example/v1", "FTP://example.com/v1"] {
        assert!(save_settings(root, |s| s["ai"] = json!({"engine":"api","api_base":base})).is_err(), "{base}");
    }
    // an empty address is only a setting that is not used: allowed while the engine is the harness
    save_settings(root, |s| s["ai"] = json!({"engine":"harness","api_base":""})).unwrap();
    assert!(save_settings(root, |s| s["ai"] = json!({"engine":"api"})).is_err(), "the api engine needs its address");
}

#[test]
fn the_key_setting_names_a_variable_and_never_holds_a_key() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    for name in ["MY_KEY", "_X1", "MURO_API_KEY", "OPENAI_API_KEY", "K1", &"A".repeat(64)] {
        save_settings(root, |s| s["ai"] = json!({"api_key_env":name})).unwrap_or_else(|e| panic!("{name}: {e:#}"));
        assert_eq!(registry(root)["settings"]["ai"]["api_key_env"], name);
    }
    let value = "sk-live-0123456789abcdef";
    // Real keys of providers whose keys carry no hyphen read as a name under a looser rule: they are not names.
    let mixed = "Zk3dQp9RtLm2NvXw8YbHc5JfGs7AaE1uOi4TyP6e";
    for pasted in [value, "has space", "1abc", "a=b", "", &"A".repeat(65), "gsk_abc123", "hf_xyz", mixed, "key2", "a",
                   "MixedCase_Key", "abcdef0123456789", "\u{0130}STANBUL", "KEY\n"] {
        let error = save_settings(root, |s| s["ai"] = json!({"api_key_env":pasted})).unwrap_err();
        assert_eq!(format!("{error:#}"), "The key setting must name an environment variable, not hold a key", "{pasted}");
        assert_eq!(format!("{error:#}"), ai::KEY_REFUSED);
    }
    assert_eq!(registry(root)["settings"]["ai"]["api_key_env"], "A".repeat(64), "the refused values were not saved");
    assert!(ai::validate_key_env("_X1").is_ok());
    for key in ["gsk_abc123", "hf_xyz", mixed] {
        let error = format!("{:#}", ai::validate_key_env(key).unwrap_err());
        assert_eq!(error, ai::KEY_REFUSED);
        assert!(!error.contains(key), "{key}: the value is never echoed");
    }
    // nothing the registry wrote holds a key, and the refused text is nowhere on disk
    for entry in fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.is_file() {
            assert!(!String::from_utf8_lossy(&fs::read(&path).unwrap()).contains(value), "{}", path.display());
        }
    }
    assert!(ai::validate_key_env("OPENAI_API_KEY").is_ok() && ai::validate_key_env(value).is_err());
    assert!(ai::validate_api_base("https://api.openai.com/v1").is_ok());
}

// --- a plugin made from a project -------------------------------------------------------------

struct Made {
    _temp: tempfile::TempDir,
    root: PathBuf,
    profile: PathBuf,
    artifact: PathBuf,
    file: PathBuf,
}

/// A registry with one target, a plugin `demo` made from the project `demo` (its file is `demo.mp`), the
/// build recorded with the digest of that file as it is, and an ordinary plugin `plain` beside it.
fn made() -> Made {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("registry");
    let profile = temp.path().join("profile");
    let artifact = temp.path().join("demo-build");
    fs::create_dir_all(&profile).unwrap();
    // two builds with different content: the native id of an OpenCode plugin is its cached folder
    for name in ["demo", "plain"] {
        let build = temp.path().join(format!("{name}-build"));
        fs::create_dir_all(&build).unwrap();
        fs::write(build.join("package.json"), format!(r#"{{"name":"{name}","version":"1.0.0","type":"module","main":"index.js"}}"#)).unwrap();
        fs::write(build.join("index.js"), format!("export default async () => ({{name:'{name}'}})")).unwrap();
    }
    let file = temp.path().join("demo.mp");
    fs::write(&file, b"the project file as it was built").unwrap();
    let made = Made { _temp: temp, root, profile, artifact, file };
    let current = registry(&made.root);
    request(&made.root, "save_target", json!({"revision":current["revision"],"target":{
        "id":"oc","harness":"opencode","name":"Test","root":made.profile,"executable":"","exclusive":true,"enabled":true}})).unwrap();
    save_projects(&made.root, json!([{"id":"demo","path":made.file}])).unwrap();
    let digest = projects::file_digest(&made.file).unwrap();
    for (id, project) in [("demo", Some("demo")), ("plain", None)] {
        let build = made.artifact.with_file_name(format!("{id}-build"));
        let mut plugin = json!({"id":id,"name":id,"source":build,"policy":"pinned","pinned_version":"1.0.0",
            "targets":["oc"],"distributions":[{"harness":"opencode","path":build,"version":"1.0.0","origin":"muro"}]});
        if let Some(project) = project {
            plugin["project"] = json!(project);
            plugin["distributions"][0]["project_digest"] = json!(digest);
        }
        // `origin: muro` is checked against the upstream revision at plan time: record the same one
        plugin["upstream_revision"] = json!("r");
        plugin["distributions"][0]["source_revision"] = json!("r");
        plugin["upstream_version"] = json!("local");
        let revision = registry(&made.root)["revision"].clone();
        request(&made.root, "save_plugin", json!({"revision":revision,"plugin":plugin})).unwrap();
    }
    made
}

fn blockers(root: &Path) -> Vec<String> {
    request(root, "plan", json!({})).unwrap()["blockers"]
        .as_array().unwrap().iter().map(|b| b.as_str().unwrap().to_owned()).collect()
}

fn operations(root: &Path) -> Vec<String> {
    request(root, "plan", json!({})).unwrap()["operations"]
        .as_array().unwrap().iter().map(|o| format!("{} {}", o["kind"].as_str().unwrap(), o["plugin_id"].as_str().unwrap())).collect()
}

#[test]
fn a_project_file_that_is_what_its_builds_were_made_from_plans_as_any_plugin_does() {
    let made = made();
    assert_eq!(blockers(&made.root), Vec::<String>::new());
    assert_eq!(operations(&made.root), ["install demo", "install plain"]);
}

#[test]
fn a_changed_project_file_makes_its_distributions_stale() {
    let made = made();
    fs::write(&made.file, b"the project file after a change").unwrap();
    let blocked = blockers(&made.root);
    assert_eq!(blocked.len(), 1, "{blocked:?}");
    assert!(blocked[0].starts_with("Test / demo: "), "{}", blocked[0]);
    assert!(blocked[0].ends_with("Project file changed: open the project again"), "{}", blocked[0]);
    assert_eq!(projects::CHANGED, "Project file changed: open the project again");
    // only the plugin made from the project is held back: the other one is still planned
    assert_eq!(operations(&made.root), ["install plain"]);
    // building from the file as it is now (its digest recorded again) clears the blocker
    let digest = projects::file_digest(&made.file).unwrap();
    let current = registry(&made.root);
    let mut plugin = current["plugins"].as_array().unwrap().iter().find(|p| p["id"] == "demo").unwrap().clone();
    plugin["distributions"][0]["project_digest"] = json!(digest);
    request(&made.root, "save_plugin", json!({"revision":current["revision"],"plugin":plugin})).unwrap();
    assert_eq!(blockers(&made.root), Vec::<String>::new());
    assert_eq!(operations(&made.root), ["install demo", "install plain"]);
}

#[test]
fn a_distribution_that_records_no_project_digest_is_stale_too() {
    let made = made();
    let current = registry(&made.root);
    let mut plugin = current["plugins"].as_array().unwrap().iter().find(|p| p["id"] == "demo").unwrap().clone();
    plugin["distributions"][0].as_object_mut().unwrap().remove("project_digest");
    request(&made.root, "save_plugin", json!({"revision":current["revision"],"plugin":plugin})).unwrap();
    assert!(blockers(&made.root)[0].contains("Project file changed: open the project again"));
}

#[test]
fn a_project_that_left_the_list_or_whose_file_is_gone_is_changed_and_nothing_is_removed_for_it() {
    let made = made();
    // installed first, so there is a copy to protect
    let plan = request(&made.root, "plan", json!({})).unwrap();
    request(&made.root, "apply", json!({"plan_id":plan["id"]})).unwrap();
    let installed = fs::read_to_string(made.profile.join("opencode.json")).unwrap();
    fs::remove_file(&made.file).unwrap();
    let blocked = blockers(&made.root);
    assert!(blocked[0].starts_with("Test / demo: Project file changed: open the project again"), "{blocked:?}");
    assert!(blocked[0].contains("Cannot read the project file"), "{blocked:?}");
    save_projects(&made.root, json!([])).unwrap();
    let blocked = blockers(&made.root);
    assert!(blocked[0].contains("no longer in your list"), "{blocked:?}");
    // the plan changes nothing for it: its installed copy stays
    let plan = request(&made.root, "plan", json!({})).unwrap();
    assert!(plan["operations"].as_array().unwrap().iter().all(|o| o["kind"] != "remove"), "{plan}");
    request(&made.root, "apply", json!({"plan_id":plan["id"],"allow_blocked":true})).unwrap();
    assert_eq!(fs::read_to_string(made.profile.join("opencode.json")).unwrap(), installed);
}

#[test]
fn a_distribution_of_a_plugin_that_is_not_from_a_project_is_never_compared_with_a_file() {
    let made = made();
    let current = registry(&made.root);
    let plain = current["plugins"].as_array().unwrap().iter().find(|p| p["id"] == "plain").unwrap();
    assert!(plain.get("project").is_none());
    fs::write(&made.file, b"changed").unwrap();
    assert!(blockers(&made.root).iter().all(|b| !b.contains("plain")));
}
