use muro_desktop_runtime::{autostart, discovery, jobs, single_instance, sync_gate::SyncGate, tray};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread,
    time::Duration,
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

/// A file that exists, for a Run value to name.
#[cfg(windows)]
fn existing_executable() -> PathBuf {
    std::env::current_exe().unwrap()
}

#[cfg(windows)]
#[test]
fn repair_rewrites_a_value_whose_executable_is_gone() {
    let value = RunValue::new();
    let gone = Path::new(r"C:\Muro Old\a.exe");
    let here = existing_executable();
    assert!(!gone.exists());
    autostart::repair(&value.0, &here).unwrap();
    assert_eq!(autostart::state(&value.0, &here).unwrap()["enabled"], false);
    autostart::set(&value.0, gone, true).unwrap();
    let stale = json!({"supported":true,"enabled":true,"current":false});
    assert_eq!(autostart::state(&value.0, &here).unwrap(), stale);
    autostart::repair(&value.0, &here).unwrap();
    let repaired = json!({"supported":true,"enabled":true,"current":true});
    assert_eq!(autostart::state(&value.0, &here).unwrap(), repaired);
    assert_eq!(autostart::state(&value.0, gone).unwrap()["current"], false);
}

/// A value that names a folder starts nothing either.
#[cfg(windows)]
#[test]
fn repair_rewrites_a_value_that_names_a_folder() {
    let value = RunValue::new();
    let folder = tempfile::tempdir().unwrap();
    let here = existing_executable();
    autostart::set(&value.0, folder.path(), true).unwrap();
    autostart::repair(&value.0, &here).unwrap();
    assert_eq!(autostart::state(&value.0, &here).unwrap()["current"], true);
}

/// reg.exe prints a value in the console code page, so a path outside ASCII read from its output
/// would look gone and the value would be taken over.
#[cfg(windows)]
#[test]
fn repair_reads_a_path_outside_ascii_as_it_was_written() {
    let value = RunValue::new();
    let folder = tempfile::tempdir().unwrap();
    let installed = folder.path().join("Müller José").join("Muro.exe");
    fs::create_dir_all(installed.parent().unwrap()).unwrap();
    fs::write(&installed, b"").unwrap();
    autostart::set(&value.0, &installed, true).unwrap();
    autostart::repair(&value.0, &existing_executable()).unwrap();
    assert_eq!(autostart::state(&value.0, &installed).unwrap()["current"], true);
}

/// Writes a Run value the way another program would: reg.exe, with the type chosen.
#[cfg(windows)]
fn write_run_value(name: &str, kind: &str, data: &str) {
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let added = std::process::Command::new("reg.exe")
        .args(["add", key, "/v", name, "/t", kind, "/d", data, "/f"])
        .output()
        .unwrap();
    assert!(added.status.success(), "{kind} {data}");
}

/// Only the command Muro writes names an executable with no doubt. A value in another shape
/// is somebody else's: it stays, whatever it points at.
#[cfg(windows)]
#[test]
fn repair_leaves_a_value_it_cannot_read_as_a_command_of_its_own() {
    let value = RunValue::new();
    let here = existing_executable();
    for data in [r"C:\Muro Old\a.exe --background", r#""C:\Muro Old\a.exe"#, r#""" --background"#] {
        write_run_value(&value.0, "REG_SZ", data);
        autostart::repair(&value.0, &here).unwrap();
        let state = autostart::state(&value.0, &here).unwrap();
        assert_eq!(state["enabled"], true, "{data}");
        assert_eq!(state["current"], false, "{data}");
    }
}

/// A value of type REG_EXPAND_SZ is what Windows starts after it expands the variables in it:
/// repair reads it that way, for the executable that exists as for the one that is gone.
#[cfg(windows)]
#[test]
fn repair_reads_a_value_with_variables_as_windows_starts_it() {
    let value = RunValue::new();
    let here = existing_executable();
    let installed = r#""%SystemRoot%\System32\reg.exe" --background"#;
    write_run_value(&value.0, "REG_EXPAND_SZ", installed);
    autostart::repair(&value.0, &here).unwrap();
    assert_eq!(autostart::state(&value.0, &here).unwrap()["current"], false);
    write_run_value(&value.0, "REG_EXPAND_SZ", r#""%SystemRoot%\Muro Old\a.exe" --background"#);
    autostart::repair(&value.0, &here).unwrap();
    assert_eq!(autostart::state(&value.0, &here).unwrap()["current"], true);
}

/// `named_executable` is the reverse of `command`: the path Muro wrote comes back as it was.
#[test]
fn the_executable_a_run_value_names_is_the_one_command_wrote() {
    for exe in [
        r"C:\Program Files\Muro\Muro.exe",
        r"C:\Users\Müller José\Muro\Muro.exe",
        r"D:\muro.exe",
    ] {
        let command = autostart::command(Path::new(exe));
        assert_eq!(autostart::named_executable(&command), Some(PathBuf::from(exe)));
    }
    assert_eq!(
        autostart::named_executable(r#""C:\Muro\Muro.exe""#),
        Some(PathBuf::from(r"C:\Muro\Muro.exe"))
    );
    for other in [
        "",
        "muro --background",
        r"C:\Muro\Muro.exe --background",
        r#""C:\Muro\Muro.exe"#,
        r#"" --background"#,
    ] {
        assert_eq!(autostart::named_executable(other), None, "{other}");
    }
}

/// The owner's installed Muro starts with Windows; a development build or a portable copy that
/// starts later must not take the value over.
#[cfg(windows)]
#[test]
fn repair_leaves_a_value_that_names_another_existing_executable() {
    let value = RunValue::new();
    let installed = existing_executable();
    let development = Path::new(r"C:\Muro Development\muro-desktop.exe");
    autostart::set(&value.0, &installed, true).unwrap();
    let before = autostart::state(&value.0, &installed).unwrap();
    autostart::repair(&value.0, development).unwrap();
    assert_eq!(autostart::state(&value.0, &installed).unwrap(), before);
    assert_eq!(autostart::state(&value.0, development).unwrap()["current"], false);
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
    // A person reads the blocker: the harness name and the error as text, not as JSON values
    // with their quotes and doubled backslashes.
    let missing = format!("gone: Target configuration directory does not exist: {}", gone.display());
    assert_eq!(blockers[0], missing.as_str(), "{out}");
    assert_eq!(registry.automation()["message"], missing.as_str());
    assert_eq!(plugins_in(&healthy), 1);
}

/// What `sync_now` leaves for the Activity page: a run that applies is an automatic sync, a
/// run that only checks is a background check, and each says what it found or did.
#[test]
fn sync_now_records_what_it_did_and_what_it_only_checked() {
    let registry = Registry::new();
    let profile = registry.harness("one", "{}");
    registry.plugin(&["one"]);
    let recorded = |action: &str, message: &str| {
        let status = registry.automation();
        assert_eq!(status["status"], "complete", "{status}");
        assert_eq!(status["action"], action, "{status}");
        assert_eq!(status["message"], message, "{status}");
    };

    // Checking only never says "verified": it says what is waiting.
    registry.sync(json!({"apply":false}));
    recorded("Background check", "1 change waiting");
    assert_eq!(plugins_in(&profile), 0);
    registry.sync(json!({}));
    recorded("Automatic sync", "1 change applied");
    assert_eq!(plugins_in(&profile), 1);
    registry.sync(json!({}));
    recorded("Automatic sync", "Nothing to apply");
    registry.sync(json!({"apply":false}));
    recorded("Background check", "Everything is in sync");

    // The plural.
    let two = Registry::new();
    let (a, b) = (two.harness("a", "{}"), two.harness("b", "{}"));
    two.plugin(&["a", "b"]);
    two.sync(json!({"apply":false}));
    assert_eq!(two.automation()["message"], "2 changes waiting");
    two.sync(json!({}));
    assert_eq!(two.automation()["message"], "2 changes applied");
    assert_eq!((plugins_in(&a), plugins_in(&b)), (1, 1));
}

#[test]
fn a_background_check_with_blockers_lists_them_and_fails() {
    let registry = Registry::new();
    registry.harness("oc", "{broken");
    registry.plugin(&["oc"]);
    let out = registry.sync(json!({"apply":false}));
    let blockers = out["blockers"].as_array().unwrap();
    assert_eq!(blockers.len(), 1, "{out}");
    let status = registry.automation();
    assert_eq!(status["action"], "Background check", "{status}");
    assert_eq!(status["status"], "failed", "{status}");
    assert_eq!(status["message"], blockers[0], "{status}");
}

#[test]
fn a_failed_background_check_is_recorded_as_one() {
    let registry = Registry::new();
    registry.harness("oc", "{}");
    fs::write(registry.data().join("registry.json"), "{broken").unwrap();
    let error = muro_desktop_runtime::request(&registry.data(), "sync_now", json!({"apply":false}))
        .unwrap_err();
    let status = registry.automation();
    assert_eq!(status["action"], "Background check", "{status}");
    assert_eq!(status["status"], "failed", "{status}");
    assert_eq!(status["message"], format!("{error:#}"));
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

/// A snapshot with the registry at `revision` and the sync state the last full check left.
fn checked(revision: u64, sync: Value) -> Value {
    json!({"registry":{"revision":revision,"settings":{"auto_sync":true}},"sync":sync})
}

/// The clock of a test: the epoch second itself, so a line shows which time it was given.
fn seconds(epoch: u64) -> Option<String> {
    Some(format!("t{epoch}"))
}

#[test]
fn tray_state_line_reads_the_last_check_of_this_revision() {
    let line = |sync: Value| tray::state_line(&checked(7, sync), seconds);
    let sync = |pending: u64, blockers: u64| {
        json!({"last_check":"1000","last_sync":null,"revision":7,"pending":pending,"blockers":blockers,"targets":{}})
    };
    assert_eq!(line(sync(0, 0)), "In sync · checked t1000");
    assert_eq!(line(sync(1, 0)), "1 change waiting · checked t1000");
    assert_eq!(line(sync(3, 0)), "3 changes waiting · checked t1000");
    // Changes still read as waiting when a harness also has a blocker; with none to apply, a
    // blocker is what needs a person.
    assert_eq!(line(sync(3, 1)), "3 changes waiting · checked t1000");
    assert_eq!(line(sync(0, 2)), "Needs attention · checked t1000");
}

#[test]
fn tray_state_line_does_not_trust_a_check_of_another_revision() {
    let never = json!({"last_check":null,"last_sync":null,"revision":null,"pending":null,"blockers":null,"targets":{}});
    assert_eq!(tray::state_line(&checked(7, never), seconds), "Not checked yet");
    let old = json!({"last_check":"1000","revision":6,"pending":0,"blockers":0,"targets":{}});
    assert_eq!(tray::state_line(&checked(7, old), seconds), "Not checked yet");
    // A plan for one harness moves that harness's time only: the overall fields stay unset.
    let one = json!({"last_check":null,"revision":null,"pending":null,"blockers":null,"targets":{"a":{"checked":"1000","synced":null}}});
    assert_eq!(tray::state_line(&checked(7, one), seconds), "Not checked yet");
    // A snapshot without the sync field, or a time that is not epoch seconds.
    assert_eq!(tray::state_line(&json!({"registry":{"revision":7}}), seconds), "Not checked yet");
    let odd = json!({"last_check":"yesterday","revision":7,"pending":0,"blockers":0,"targets":{}});
    assert_eq!(tray::state_line(&checked(7, odd), seconds), "Not checked yet");
}

/// The tray reads what `sync_now` and the registry really leave in a snapshot: the check of
/// this revision, then nothing once the registry changes.
#[test]
fn tray_state_line_follows_a_real_sync_and_a_registry_change() {
    let registry = Registry::new();
    registry.harness("oc", "{}");
    let line = || {
        let snapshot = muro_desktop_runtime::request(&registry.data(), "snapshot", json!({})).unwrap();
        tray::state_line(&snapshot, seconds)
    };
    assert_eq!(line(), "Not checked yet");
    registry.sync(json!({"apply":false}));
    assert!(line().starts_with("In sync · checked t1"), "{}", line());
    registry.plugin(&["oc"]);
    assert_eq!(line(), "Not checked yet");
    registry.sync(json!({"apply":false}));
    assert!(line().starts_with("1 change waiting · checked t1"), "{}", line());
    registry.sync(json!({}));
    assert!(line().starts_with("In sync · checked t1"), "{}", line());
}

#[test]
fn tray_state_line_says_no_time_when_the_clock_has_none() {
    let sync = json!({"last_check":"1000","revision":7,"pending":0,"blockers":0,"targets":{}});
    assert_eq!(tray::state_line(&checked(7, sync), |_| None), "In sync");
}

#[test]
fn tray_pause_item_offers_the_opposite_of_the_setting() {
    let with = |auto: Value| json!({"registry":{"settings":{"auto_sync":auto}}});
    assert_eq!(tray::pause_label(&with(json!(true))), "Pause automatic sync");
    assert_eq!(tray::pause_label(&with(json!(false))), "Resume automatic sync");
    assert_eq!(tray::pause_label(&json!({"registry":{"settings":{}}})), "Resume automatic sync");
}

/// The local clock is the machine's, so the test cannot name an hour: it checks the shape, and
/// that a minute later is a minute later (an epoch on a whole UTC hour sits at a quarter hour
/// in every time zone there is).
#[cfg(windows)]
#[test]
fn tray_local_clock_gives_zero_padded_hours_and_minutes() {
    let hour = 1_750_000_000 - 1_750_000_000 % 3600; // a whole UTC hour in mid June 2025
    let at = |epoch| tray::local_clock(epoch).unwrap();
    let (now, later) = (at(hour), at(hour + 60));
    let parts = |clock: &str| -> (u32, u32) {
        let (h, m) = clock.split_once(':').unwrap();
        assert_eq!((h.len(), m.len()), (2, 2), "{clock}");
        (h.parse().unwrap(), m.parse().unwrap())
    };
    let (h, m) = parts(&now);
    assert!(h < 24 && [0, 15, 30, 45].contains(&m), "{now}");
    assert_eq!(parts(&later), (h, m + 1), "{now} then {later}");
    // Three hours later is three hours later, midnight included (no daylight change in mid June).
    assert_eq!(parts(&at(hour + 3 * 3600)).0, (h + 3) % 24);
}

/// What Windows takes in the name of an event of the user's own session: `Local\` and then
/// no backslash, and at most MAX_PATH characters.
fn is_a_name_windows_takes(name: &str) -> bool {
    name.strip_prefix(r"Local\").is_some_and(|rest| {
        !rest.is_empty() && rest.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    }) && name.len() < 260
}

#[test]
fn the_signal_name_follows_the_data_directory_and_only_it() {
    let one = single_instance::name(Path::new(r"C:\Muro\data"));
    assert_eq!(one, single_instance::name(Path::new(r"C:\Muro\data")));
    assert_ne!(one, single_instance::name(Path::new(r"C:\Muro\portable\data")));
    assert_ne!(one, single_instance::name(Path::new(r"C:\Muro\data2")));
    assert!(is_a_name_windows_takes(&one), "{one}");
}

/// The path is the user's or an environment variable's: whatever it holds, the name stays one
/// Windows takes, and it is a hash of the path, never the path.
#[test]
fn the_signal_name_takes_no_character_from_the_path() {
    let hostile = [
        r"C:\Muro\da\ta".to_string(),
        "C:\\Muro\\\"data\"*?<>|\r\n\t".to_string(),
        r"\\?\GLOBALROOT\Device\x".to_string(),
        r"Local\Muro-1".to_string(),
        "Müller José 日本語 🙂".to_string(),
        "a".repeat(5000),
        String::new(),
    ];
    let mut names = std::collections::HashSet::new();
    for path in &hostile {
        let name = single_instance::name(Path::new(path));
        assert!(is_a_name_windows_takes(&name), "{path:?} -> {name}");
        assert!(names.insert(name), "{path:?} shares its name");
    }
}

/// A running Muro and a new one must agree on the name even if they were not built together, so
/// the hash is pinned: `c:\muro\data` hashed with FNV-1a 64 by another program.
#[cfg(windows)]
#[test]
fn the_signal_name_is_stable_and_ignores_how_a_windows_path_is_spelled() {
    assert_eq!(
        single_instance::name(Path::new(r"C:\Muro\data")),
        r"Local\MuroShow-cc033abbd7c81f5b"
    );
    for spelling in [r"c:\muro\DATA", r"C:\Muro\data\", "C:/Muro/data", r"\\?\C:\Muro\data", r"C:\Muro\x\..\data"] {
        assert_eq!(
            single_instance::name(Path::new(spelling)),
            r"Local\MuroShow-cc033abbd7c81f5b",
            "{spelling}"
        );
    }
}

#[cfg(windows)]
#[test]
fn a_second_process_reaches_the_first_through_the_signal_of_the_same_directory() {
    use single_instance::Signal;
    let id = uuid::Uuid::new_v4();
    let data = PathBuf::from(format!(r"C:\Muro Signal Test\{id}\data"));
    let other = PathBuf::from(format!(r"C:\Muro Signal Test\{id}\other"));
    let short = Some(Duration::from_millis(100));
    let (first, created) = Signal::open(&data).unwrap();
    assert!(created);
    assert!(!first.wait(short).unwrap(), "raised by nobody");
    let (second, created) = Signal::open(&data).unwrap();
    assert!(!created, "the same directory has one signal");
    // Raised before anyone waits: it is kept for the first instance, which may still be starting.
    second.raise().unwrap();
    assert!(first.wait(Some(Duration::from_secs(5))).unwrap());
    assert!(!first.wait(short).unwrap(), "one raise is one show");
    // Another directory is another Muro.
    let (independent, created) = Signal::open(&other).unwrap();
    assert!(created);
    second.raise().unwrap();
    assert!(!independent.wait(short).unwrap());
    assert!(first.wait(Some(Duration::from_secs(5))).unwrap());
    // The signal goes with the last handle: the next Muro is the first again.
    drop((first, second));
    let (again, created) = Signal::open(&data).unwrap();
    assert!(created);
    drop((again, independent));
}

#[cfg(windows)]
#[test]
fn a_waiting_thread_wakes_when_another_handle_raises_the_signal() {
    use single_instance::Signal;
    let data = PathBuf::from(format!(r"C:\Muro Signal Test\{}", uuid::Uuid::new_v4()));
    let (first, _) = Signal::open(&data).unwrap();
    let waiter = thread::spawn(move || first.wait(Some(Duration::from_secs(10))).unwrap());
    thread::sleep(Duration::from_millis(200));
    Signal::open(&data).unwrap().0.raise().unwrap();
    assert!(waiter.join().unwrap());
}

/// A sync that starts and then waits until the test lets it end.
fn held_sync(gate: &Arc<SyncGate>) -> (mpsc::Sender<()>, thread::JoinHandle<Option<u8>>) {
    let (release, released) = mpsc::channel::<()>();
    let (started, has_started) = mpsc::channel::<()>();
    let gate = gate.clone();
    let sync = thread::spawn(move || {
        gate.run(|| {
            started.send(()).unwrap();
            let _ = released.recv();
            7
        })
    });
    has_started.recv_timeout(Duration::from_secs(5)).unwrap();
    (release, sync)
}

#[test]
fn syncs_run_one_at_a_time() {
    let gate = Arc::new(SyncGate::new());
    let active = Arc::new(AtomicUsize::new(0));
    let most = Arc::new(AtomicUsize::new(0));
    let runs: Vec<_> = (0..4)
        .map(|_| {
            let (gate, active, most) = (gate.clone(), active.clone(), most.clone());
            thread::spawn(move || {
                gate.run(|| {
                    let now = active.fetch_add(1, Ordering::SeqCst) + 1;
                    most.fetch_max(now, Ordering::SeqCst);
                    thread::sleep(Duration::from_millis(30));
                    active.fetch_sub(1, Ordering::SeqCst);
                })
            })
        })
        .collect();
    for run in runs {
        assert_eq!(run.join().unwrap(), Some(()));
    }
    assert_eq!(most.load(Ordering::SeqCst), 1);
}

#[test]
fn quit_waits_for_the_sync_in_progress_and_then_lets_no_other_start() {
    let gate = Arc::new(SyncGate::new());
    let (release, sync) = held_sync(&gate);
    // A sync that was already waiting its turn behind the one in progress.
    let queued = {
        let gate = gate.clone();
        thread::spawn(move || gate.run(|| panic!("a queued sync started during quit")))
    };
    thread::sleep(Duration::from_millis(200));
    let waiting = Arc::new(AtomicBool::new(false));
    let quit = {
        let (gate, waiting) = (gate.clone(), waiting.clone());
        thread::spawn(move || gate.quit(Duration::from_secs(30), || waiting.store(true, Ordering::SeqCst)))
    };
    let end = std::time::Instant::now() + Duration::from_secs(5);
    while !waiting.load(Ordering::SeqCst) && std::time::Instant::now() < end {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(waiting.load(Ordering::SeqCst), "the tray was not told a sync is being finished");
    thread::sleep(Duration::from_millis(200));
    assert!(!quit.is_finished(), "quit did not wait for the sync");
    assert!(gate.is_quitting());
    // The queued sync and the next one do not start, and say so: neither waits for the end of
    // the sync in progress only to start another that quit would wait for in turn.
    let next = {
        let gate = gate.clone();
        thread::spawn(move || gate.run(|| panic!("a sync started during quit")))
    };
    let end = std::time::Instant::now() + Duration::from_secs(5);
    while !(queued.is_finished() && next.is_finished()) && std::time::Instant::now() < end {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(queued.is_finished() && next.is_finished(), "a sync is waiting behind quit");
    assert_eq!(queued.join().unwrap(), None);
    assert_eq!(next.join().unwrap(), None);
    release.send(()).unwrap();
    assert_eq!(sync.join().unwrap(), Some(7), "the sync in progress ended whole");
    assert!(quit.join().unwrap(), "quit saw the sync end");
}

#[test]
fn quit_gives_up_waiting_after_its_limit() {
    let gate = Arc::new(SyncGate::new());
    let (release, sync) = held_sync(&gate);
    let told = AtomicUsize::new(0);
    let started = std::time::Instant::now();
    let ended = gate.quit(Duration::from_millis(300), || {
        told.fetch_add(1, Ordering::SeqCst);
    });
    assert!(!ended, "the sync was still running");
    assert!(started.elapsed() >= Duration::from_millis(300));
    assert_eq!(told.load(Ordering::SeqCst), 1);
    release.send(()).unwrap();
    assert_eq!(sync.join().unwrap(), Some(7));
}

#[test]
fn quit_with_no_sync_in_progress_does_not_wait_or_tell_the_tray() {
    let gate = SyncGate::new();
    assert!(!gate.is_quitting());
    let started = std::time::Instant::now();
    assert!(gate.quit(Duration::from_secs(60), || panic!("no sync to finish")));
    assert!(started.elapsed() < Duration::from_secs(5));
    assert!(gate.is_quitting());
}

#[test]
fn a_sync_that_panics_does_not_hold_the_gate() {
    let gate = SyncGate::new();
    let panicked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| gate.run(|| panic!("sync failed"))));
    assert!(panicked.is_err());
    assert_eq!(gate.run(|| 3), Some(3));
    assert!(gate.quit(Duration::from_secs(5), || panic!("no sync to finish")));
}
