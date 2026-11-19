use muro_desktop_runtime::{autostart, discovery, jobs};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[test]
fn discovery_uses_all_mukade_entries_without_inventing_plugin_roots() {
    let entries = discovery::catalog();
    assert_eq!(entries.len(), 6);
    assert!(entries.iter().any(|e| e["harness"] == "claude-code"));
    assert!(
        entries
            .iter()
            .any(|e| e["harness"] == "deepseek" && e["supported"] == false)
    );
    assert!(entries.iter().all(|e| e.get("plugin_root").is_none()));
    // The configuration folder is Mukade's, never Muro's guess: DeepSeek's is not established.
    for entry in mukade::catalog::catalog().harnesses.iter() {
        let found = entries
            .iter()
            .find(|e| e["harness"] == discovery::id(entry.id))
            .unwrap();
        let expected = mukade::catalog::config_root(entry.id).map(|(path, _)| path);
        assert_eq!(found["config_root"], serde_json::json!(expected));
    }
    let deepseek = entries.iter().find(|e| e["harness"] == "deepseek").unwrap();
    assert!(deepseek["config_root"].is_null());
}

#[test]
fn adaptation_prompt_preserves_ai_authority_and_validation_boundary() {
    let prompt = jobs::prompt(
        "https://example.com/source",
        "codex",
        "test-plugin",
        "/factory",
        "/job/package",
    );
    assert!(prompt.contains("harmonizer.md"));
    assert!(prompt.contains("sources.json"));
    assert!(prompt.contains("Never install"));
    assert!(prompt.contains("AI"));
    assert!(prompt.contains("custom-instructions"));
    assert!(prompt.contains("never choose delivery by filename"));
}

#[test]
fn agent_command_rejects_unsupported_agent_and_invalid_budget() {
    assert!(jobs::agent_args("hermes", "task", 2.0).is_err());
    assert!(jobs::agent_args("claude-code", "task", -1.0).is_err());
    let args = jobs::agent_args("claude-code", "task", 2.0).unwrap();
    assert!(args.contains(&"--max-budget-usd".to_string()));
    assert!(!args.iter().any(|a| a.contains("dangerously")));
}

#[test]
fn invalid_job_id_never_traverses_data_directory() {
    let root = tempfile::tempdir().unwrap();
    assert!(jobs::cancel(root.path(), "../outside").is_err());
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
}

#[test]
fn adapted_manifest_must_preserve_resolved_revision() {
    let revision = "a".repeat(40);
    let plugin = serde_json::json!({"upstream_revision":revision});
    let wrong = serde_json::json!({"sources":[{"commit":"b".repeat(40)}]});
    assert!(jobs::validate_source_binding(&plugin, &wrong).is_err());
    let matching = serde_json::json!({"sources":[{"commit":revision}]});
    assert!(jobs::validate_source_binding(&plugin, &matching).is_ok());
}

#[test]
fn adaptation_rejects_rewritten_input_and_external_edits_without_changing_originals() {
    let data = tempfile::tempdir().unwrap();
    let folder = data.path().join("custom-instructions/example");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("recap.md"), b"Original\r\n").unwrap();
    let plugin = serde_json::json!({"id":"example"});
    let snapshot = muro_registry::instructions::read(data.path(), &plugin).unwrap();
    let package = tempfile::tempdir().unwrap();
    snapshot.write_to(package.path()).unwrap();
    assert!(jobs::validate_custom_binding(data.path(), &plugin, package.path(), &snapshot).is_ok());
    let copied = package.path().join("custom-instructions/recap.md");
    std::fs::write(&copied,b"AI rewrite").unwrap();
    assert!(jobs::validate_custom_binding(data.path(), &plugin, package.path(), &snapshot).unwrap_err().to_string().contains("AI changed"));
    assert_eq!(std::fs::read(folder.join("recap.md")).unwrap(),b"Original\r\n");
    std::fs::write(&copied,b"Original\r\n").unwrap();
    std::fs::remove_file(folder.join("recap.md")).unwrap();
    assert!(jobs::validate_custom_binding(data.path(), &plugin, package.path(), &snapshot).unwrap_err().to_string().contains("changed during adaptation"));
}

#[test]
fn autostart_command_quotes_a_path_with_spaces() {
    assert_eq!(
        autostart::command(Path::new(r"C:\Program Files\Muro\Muro.exe")),
        r#""C:\Program Files\Muro\Muro.exe" --background"#
    );
}

#[test]
fn autostart_refuses_a_value_name_reg_exe_could_take_for_a_switch() {
    let exe = Path::new(r"C:\Program Files\Muro\Muro.exe");
    for name in ["", "/f", "Muro Test", r"Muro\Run"] {
        assert!(autostart::state(name, exe).is_err(), "{name}");
        assert!(autostart::set(name, exe, true).is_err(), "{name}");
    }
}

/// A Run value name of the test's own. Dropping it deletes the value, so every exit path of
/// the test removes it, a panic included; the deletion does not go through the code tested.
#[cfg(windows)]
struct RunValue(String);

#[cfg(windows)]
impl RunValue {
    fn new() -> Self {
        Self(format!("MuroTest-{}", uuid::Uuid::new_v4()))
    }
}

#[cfg(windows)]
impl Drop for RunValue {
    fn drop(&mut self) {
        // Exits 1 when the test has already removed the value.
        let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        let _ = std::process::Command::new("reg.exe")
            .args(["delete", key, "/v", &self.0, "/f"])
            .output();
    }
}

#[cfg(windows)]
#[test]
fn autostart_round_trip_under_a_test_value_name() {
    let value = RunValue::new();
    let exe = Path::new(r"C:\Program Files\Muro Test\Muro.exe");
    let off = json!({"supported":true,"enabled":false,"current":false});
    let on = json!({"supported":true,"enabled":true,"current":true});
    assert_eq!(autostart::state(&value.0, exe).unwrap(), off);
    assert_eq!(autostart::set(&value.0, exe, true).unwrap(), on);
    assert_eq!(autostart::state(&value.0, exe).unwrap(), on);
    assert_eq!(autostart::set(&value.0, exe, false).unwrap(), off);
    assert_eq!(autostart::state(&value.0, exe).unwrap(), off);
    assert_eq!(autostart::set(&value.0, exe, false).unwrap(), off);
}

#[cfg(windows)]
#[test]
fn repair_rewrites_a_value_that_names_another_executable() {
    let value = RunValue::new();
    let a = Path::new(r"C:\Muro Old\a.exe");
    let b = Path::new(r"C:\Muro New\b.exe");
    autostart::repair(&value.0, b).unwrap();
    assert_eq!(autostart::state(&value.0, b).unwrap()["enabled"], false);
    autostart::set(&value.0, a, true).unwrap();
    let stale = json!({"supported":true,"enabled":true,"current":false});
    assert_eq!(autostart::state(&value.0, b).unwrap(), stale);
    autostart::repair(&value.0, b).unwrap();
    let repaired = json!({"supported":true,"enabled":true,"current":true});
    assert_eq!(autostart::state(&value.0, b).unwrap(), repaired);
    assert_eq!(autostart::state(&value.0, a).unwrap()["current"], false);
}

/// reg.exe prints a value in the console code page, so a path outside ASCII would never read
/// back as the one written.
#[cfg(windows)]
#[test]
fn autostart_is_current_for_a_path_outside_ascii() {
    let value = RunValue::new();
    let exe = Path::new(r"C:\Users\Müller José\Muro\Muro.exe");
    assert_eq!(autostart::set(&value.0, exe, true).unwrap()["current"], true);
    let other = Path::new(r"C:\Users\Muller José\Muro\Muro.exe");
    assert_eq!(autostart::state(&value.0, other).unwrap()["current"], false);
}

#[cfg(windows)]
#[test]
fn autostart_writes_only_an_absolute_executable_path_without_quotes() {
    let value = RunValue::new();
    for exe in ["Muro.exe", r#"C:\Mu"ro\Muro.exe"#] {
        assert!(autostart::set(&value.0, Path::new(exe), true).is_err(), "{exe}");
        assert_eq!(autostart::state(&value.0, Path::new(exe)).unwrap()["enabled"], false);
    }
}

/// The smallest registry `sync_now` needs: OpenCode harnesses over profile folders that hold
/// an `opencode.json`, and the plugin `example`, built in a folder with a `package.json` and
/// an `index.js`.
struct Registry {
    temp: tempfile::TempDir,
}

impl Registry {
    fn new() -> Self {
        Self {
            temp: tempfile::tempdir().unwrap(),
        }
    }
    fn data(&self) -> PathBuf {
        self.temp.path().join("data")
    }
    /// Saves the OpenCode harness `id`, whose profile folder holds `config` as its
    /// `opencode.json`, and returns that folder.
    fn harness(&self, id: &str, config: &str) -> PathBuf {
        let profile = self.temp.path().join(id);
        fs::create_dir_all(&profile).unwrap();
        fs::write(profile.join("opencode.json"), config).unwrap();
        let target = json!({"id":id,"harness":"opencode","name":id,"root":profile,
                            "executable":"","exclusive":true,"enabled":true});
        self.save("save_target", "target", target);
        profile
    }
    /// Saves the plugin `example`, listed for the harnesses `targets`.
    fn plugin(&self, targets: &[&str]) {
        let artifact = self.temp.path().join("artifact");
        fs::create_dir_all(&artifact).unwrap();
        let manifest = r#"{"name":"example","version":"1.0.0","type":"module","main":"index.js"}"#;
        fs::write(artifact.join("package.json"), manifest).unwrap();
        fs::write(artifact.join("index.js"), "export default async () => ({})").unwrap();
        let plugin = json!({"id":"example","name":"Example","source":artifact,"policy":"pinned",
                            "pinned_version":"1.0.0","targets":targets,
                            "distributions":[{"harness":"opencode","path":artifact,"version":"1.0.0"}]});
        self.save("save_plugin", "plugin", plugin);
    }
    fn save(&self, action: &str, key: &str, value: Value) {
        let snapshot = muro_registry::service::request(&self.data(), "snapshot", json!({})).unwrap();
        let mut payload = json!({"revision":snapshot["registry"]["revision"]});
        payload[key] = value;
        muro_registry::service::request(&self.data(), action, payload).unwrap();
    }
    fn sync(&self, payload: Value) -> Value {
        muro_desktop_runtime::request(&self.data(), "sync_now", payload).unwrap()
    }
    /// The event `record_automation` left for the last automatic sync.
    fn automation(&self) -> Value {
        serde_json::from_slice(&fs::read(self.data().join("automation-status.json")).unwrap()).unwrap()
    }
}

/// The number of plugins a profile's `opencode.json` lists.
fn plugins_in(profile: &Path) -> usize {
    let config: Value = serde_json::from_slice(&fs::read(profile.join("opencode.json")).unwrap()).unwrap();
    config["plugins"].as_array().map_or(0, Vec::len)
}

#[test]
fn sync_now_applies_a_clean_plan_and_reports_blockers_without_failing() {
    // A clean plan is applied, and the next sync finds nothing to do.
    let clean = Registry::new();
    let profile = clean.harness("oc", "{}");
    clean.plugin(&["oc"]);
    let done = json!({"applied":1,"pending":0,"blockers":[],"errors":[]});
    assert_eq!(clean.sync(json!({})), done);
    assert_eq!(plugins_in(&profile), 1);
    assert_eq!(clean.automation()["status"], "complete");
    let nothing = json!({"applied":0,"pending":0,"blockers":[],"errors":[]});
    assert_eq!(clean.sync(json!({})), nothing);

    // A profile whose opencode.json is not JSON is a blocker, recorded as the message.
    let broken = Registry::new();
    broken.harness("oc", "{broken");
    broken.plugin(&["oc"]);
    let out = broken.sync(json!({}));
    assert_eq!(out["applied"], 0, "{out}");
    assert_eq!(out["blockers"].as_array().unwrap().len(), 1, "{out}");
    let status = broken.automation();
    assert_eq!(status["status"], "failed");
    assert_eq!(status["message"], out["blockers"][0]);

    // One harness readable and one not: the readable one is synced.
    let mixed = Registry::new();
    let good = mixed.harness("good", "{}");
    mixed.harness("bad", "{broken");
    mixed.plugin(&["good", "bad"]);
    let out = mixed.sync(json!({}));
    assert_eq!(out["applied"], 1, "{out}");
    assert_eq!(out["pending"], 0, "{out}");
    assert_eq!(out["blockers"].as_array().unwrap().len(), 1, "{out}");
    assert_eq!(plugins_in(&good), 1);

    // Without apply it only checks: the watch kept while automatic sync is off.
    let watch = Registry::new();
    let profile = watch.harness("oc", "{}");
    watch.plugin(&["oc"]);
    let checked = json!({"applied":0,"pending":1,"blockers":[],"errors":[]});
    assert_eq!(watch.sync(json!({"apply":false})), checked);
    assert_eq!(plugins_in(&profile), 0);
}

#[test]
fn sync_now_syncs_a_healthy_harness_when_another_harness_folder_is_gone() {
    let registry = Registry::new();
    let healthy = registry.harness("healthy", "{}");
    let gone = registry.harness("gone", "{}");
    registry.plugin(&["healthy", "gone"]);
    fs::remove_dir_all(&gone).unwrap();
    let out = registry.sync(json!({}));
    assert_eq!(out["applied"], 1, "{out}");
    let blockers = out["blockers"].as_array().unwrap();
    assert_eq!(blockers.len(), 1, "{out}");
    // The registry names the harness as a JSON string.
    let blocker = blockers[0].as_str().unwrap();
    assert!(blocker.starts_with(r#""gone": "#), "{out}");
    assert_eq!(plugins_in(&healthy), 1);
}

#[test]
fn sync_now_records_a_failure_and_returns_it() {
    let registry = Registry::new();
    registry.harness("oc", "{}");
    fs::write(registry.data().join("registry.json"), "{broken").unwrap();
    let error = muro_desktop_runtime::request(&registry.data(), "sync_now", json!({})).unwrap_err();
    let status = registry.automation();
    assert_eq!(status["status"], "failed");
    assert_eq!(status["message"], format!("{error:#}"));
}

#[test]
fn sync_now_refuses_an_apply_that_is_not_a_boolean() {
    let registry = Registry::new();
    let profile = registry.harness("oc", "{}");
    registry.plugin(&["oc"]);
    let error = muro_desktop_runtime::request(&registry.data(), "sync_now", json!({"apply":"yes"}))
        .unwrap_err();
    assert_eq!(error.to_string(), "apply must be a boolean");
    assert_eq!(plugins_in(&profile), 0);
    assert!(!registry.data().join("automation-status.json").exists());
}
