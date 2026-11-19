use muro_registry::service::request;
use serde_json::{Value, json};
use std::{fs, path::Path};

fn snapshot(root: &Path) -> Value {
    request(root, "snapshot", json!({})).unwrap()
}
fn target(root: &Path, profile: &Path) {
    target_as(root, profile, "oc", true);
}
fn target_as(root: &Path, profile: &Path, id: &str, enabled: bool) {
    let s = snapshot(root);
    request(root,"save_target",json!({"revision":s["registry"]["revision"],"target":{"id":id,"harness":"opencode","name":"Test","root":profile,"executable":"","exclusive":true,"enabled":enabled}})).unwrap();
}
fn plugin(root: &Path, artifact: &Path) {
    plugin_as(root, artifact, "example", &["oc"]);
}
fn plugin_as(root: &Path, artifact: &Path, id: &str, targets: &[&str]) {
    let s = snapshot(root);
    request(root,"save_plugin",json!({"revision":s["registry"]["revision"],"plugin":{"id":id,"name":"Example","source":artifact,"policy":"pinned","pinned_version":"1.0.0","targets":targets,"distributions":[{"harness":"opencode","path":artifact,"version":"1.0.0"}]}})).unwrap();
}
fn fixture() -> (
    tempfile::TempDir,
    std::path::PathBuf,
    std::path::PathBuf,
    std::path::PathBuf,
) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("registry");
    let profile = temp.path().join("profile");
    let artifact = temp.path().join("artifact");
    fs::create_dir_all(&profile).unwrap();
    fs::create_dir_all(&artifact).unwrap();
    fs::write(
        artifact.join("package.json"),
        r#"{"name":"example","version":"1.0.0","type":"module","main":"index.js"}"#,
    )
    .unwrap();
    fs::write(artifact.join("index.js"), "export default async () => ({})").unwrap();
    (temp, root, profile, artifact)
}

#[test]
fn custom_instruction_folder_is_listed_without_changing_registry_revision() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let before = snapshot(&r);
    let info = request(&r, "custom_instructions", json!({"id":"example", "create":true})).unwrap();
    let folder = Path::new(info["path"].as_str().unwrap());
    assert!(folder.is_dir());
    fs::create_dir(folder.join("nested")).unwrap();
    fs::write(folder.join("nested/recap-à.MD"), "Recap corrente.\r\n").unwrap();
    fs::write(folder.join("ignored.txt"), "not an instruction").unwrap();
    let after = snapshot(&r);
    assert_eq!(before["registry"]["revision"], after["registry"]["revision"]);
    assert_eq!(after["custom_instructions"][0]["files"], json!(["custom-instructions/nested/recap-à.MD"]));
    assert_eq!(after["custom_instructions"][0]["stale_harnesses"], json!(["opencode"]));
    assert_ne!(info["digest"], after["custom_instructions"][0]["digest"]);
}

#[test]
fn custom_instructions_block_native_artifact_and_invalidate_a_prepared_plan() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    let info = request(&r, "custom_instructions", json!({"id":"example", "create":true})).unwrap();
    fs::write(Path::new(info["path"].as_str().unwrap()).join("recap.md"), "Report progress").unwrap();
    assert!(request(&r, "apply", json!({"plan_id":plan["id"]})).is_err());
    let blocked = request(&r, "plan", json!({})).unwrap();
    assert!(blocked["blockers"].to_string().contains("custom-instructions"));
    assert!(!p.join("opencode.json").exists());
}

#[test]
fn deleting_last_instruction_invalidates_an_adapted_distribution() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let info = request(&r, "custom_instructions", json!({"id":"example", "create":true})).unwrap();
    let file = Path::new(info["path"].as_str().unwrap()).join("recap.md");
    fs::write(&file, "Report progress").unwrap();
    let state = snapshot(&r);
    let mut updated = state["registry"]["plugins"][0].clone();
    updated["upstream_revision"] = json!("revision");
    updated["upstream_version"] = json!("local");
    updated["distributions"][0]["origin"] = json!("muro");
    updated["distributions"][0]["source_revision"] = json!("revision");
    updated["distributions"][0]["custom_instructions_digest"] = state["custom_instructions"][0]["digest"].clone();
    request(&r,"save_plugin",json!({"revision":state["registry"]["revision"],"plugin":updated})).unwrap();
    let plan = request(&r,"plan",json!({})).unwrap();
    assert_eq!(plan["blockers"],json!([]));
    request(&r,"apply",json!({"plan_id":plan["id"]})).unwrap();
    fs::remove_file(file).unwrap();
    let state = snapshot(&r);
    assert_eq!(state["custom_instructions"][0]["files"], json!([]));
    assert_eq!(state["custom_instructions"][0]["stale_harnesses"], json!(["opencode"]));
    assert!(request(&r,"plan",json!({})).unwrap()["blockers"].to_string().contains("custom-instructions"));
    assert!(request(&r,"plan",json!({"reinstall":"example"})).unwrap()["blockers"].to_string().contains("custom-instructions"));
}

#[test]
fn stale_job_cannot_record_an_old_custom_instruction_snapshot() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let info = request(&r, "custom_instructions", json!({"id":"example", "create":true})).unwrap();
    let state = snapshot(&r);
    fs::write(Path::new(info["path"].as_str().unwrap()).join("recap.md"), "New instructions").unwrap();
    let result = request(&r,"save_plugin",json!({"revision":state["registry"]["revision"],
        "plugin":state["registry"]["plugins"][0], "expected_custom_instructions_digest":info["digest"]}));
    assert!(result.unwrap_err().to_string().contains("changed during adaptation"));
    assert_eq!(snapshot(&r)["registry"],state["registry"]);
}
#[test]
fn persists_registry_and_rejects_stale_edit() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    assert_eq!(
        snapshot(&r)["registry"]["plugins"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        request(&r, "remove_plugin", json!({"id":"example","revision":0}))
            .unwrap_err()
            .to_string()
            .contains("revision")
    );
    assert_eq!(
        snapshot(&r)["registry"]["plugins"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn changing_source_requires_clearing_old_distributions_even_through_cli() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let state = snapshot(&r);
    let mut changed = state["registry"]["plugins"][0].clone();
    changed["source"] = json!(a.with_extension("other"));
    assert!(request(&r,"save_plugin",json!({"revision":state["registry"]["revision"],"plugin":changed})).is_err());
    assert_eq!(snapshot(&r)["registry"]["plugins"][0]["source"], json!(a));
}
#[test]
fn reinstall_uses_retained_verified_artifact_after_source_is_removed() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r,"plan",json!({})).unwrap();
    request(&r,"apply",json!({"plan_id":plan["id"]})).unwrap();
    let receipt = serde_json::from_slice::<Value>(&fs::read(r.join("receipts.json")).unwrap()).unwrap();
    let retained = receipt.as_object().unwrap().values().next().unwrap()["path"].clone();
    fs::rename(&a, a.with_extension("moved")).unwrap();
    let plan = request(&r,"plan",json!({"reinstall":"example"})).unwrap();
    assert_eq!(plan["blockers"], json!([]), "{plan}");
    assert_eq!(plan["operations"][0]["kind"], "reinstall");
    assert_eq!(plan["operations"][0]["artifact"]["path"], retained);
    request(&r,"apply",json!({"plan_id":plan["id"]})).unwrap();
}
#[test]
fn receipt_keys_distinguish_valid_hyphenated_id_pairs() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("registry");
    for (target_id, plugin_id, name) in [("x--y","z","alpha"),("x","y--z","beta")] {
        let profile = temp.path().join(format!("profile-{target_id}"));
        let artifact = temp.path().join(format!("source-{plugin_id}"));
        fs::create_dir_all(&profile).unwrap();
        fs::create_dir_all(&artifact).unwrap();
        fs::write(artifact.join("package.json"),format!(r#"{{"name":"{name}","version":"1.0.0","main":"index.js"}}"#)).unwrap();
        fs::write(artifact.join("index.js"),"export default () => ({})").unwrap();
        let state = snapshot(&root);
        request(&root,"save_target",json!({"revision":state["registry"]["revision"],"target":{"id":target_id,"harness":"opencode","name":name,"root":profile,"executable":"","exclusive":false,"enabled":true}})).unwrap();
        let state = snapshot(&root);
        request(&root,"save_plugin",json!({"revision":state["registry"]["revision"],"plugin":{"id":plugin_id,"name":name,"source":artifact,"policy":"stable","pinned_version":"","targets":[target_id],"distributions":[{"harness":"opencode","path":artifact,"version":"1.0.0"}]}})).unwrap();
    }
    let plan = request(&root,"plan",json!({})).unwrap();
    assert_eq!(plan["blockers"],json!([]));
    request(&root,"apply",json!({"plan_id":plan["id"]})).unwrap();
    let receipts:Value=serde_json::from_slice(&fs::read(root.join("receipts.json")).unwrap()).unwrap();
    assert_eq!(receipts.as_object().unwrap().len(),2);
    assert_eq!(request(&root,"plan",json!({})).unwrap()["operations"],json!([]));
}
#[test]
fn sync_preserves_config_and_second_pass_is_empty() {
    let (_t, r, p, a) = fixture();
    fs::write(
        p.join("opencode.json"),
        r#"{"model":"untouched","plugins":["external-plugin@1.0.0"]}"#,
    )
    .unwrap();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    assert_eq!(plan["operations"].as_array().unwrap().len(), 2);
    assert_eq!(plan["blockers"], json!([]));
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    let config: Value =
        serde_json::from_slice(&fs::read(p.join("opencode.json")).unwrap()).unwrap();
    assert_eq!(config["model"], "untouched");
    assert_eq!(config["plugins"].as_array().unwrap().len(), 1);
    assert_eq!(
        request(&r, "plan", json!({})).unwrap()["operations"],
        json!([])
    );
    assert_eq!(
        request(&r, "plan", json!({"reinstall":"example"})).unwrap()["operations"][0]["kind"],
        "reinstall"
    );
}
#[test]
fn changed_inventory_refuses_old_plan() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    fs::write(p.join("opencode.json"), r#"{"plugins":["new-external"]}"#).unwrap();
    assert!(
        request(&r, "apply", json!({"plan_id":plan["id"]}))
            .unwrap_err()
            .to_string()
            .contains("changed")
    );
}
#[test]
fn corrupt_inventory_blocks_without_mutation() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    fs::write(p.join("opencode.json"), "{broken").unwrap();
    let plan = request(&r, "plan", json!({})).unwrap();
    assert!(!plan["blockers"].as_array().unwrap().is_empty());
    assert!(request(&r, "apply", json!({"plan_id":plan["id"]})).is_err());
    assert_eq!(
        fs::read_to_string(p.join("opencode.json")).unwrap(),
        "{broken"
    );
}
#[test]
fn changed_artifact_blocks_removal() {
    let (_t, r, p, a) = fixture();
    fs::write(
        p.join("opencode.json"),
        r#"{"plugins":["keep-until-ready"]}"#,
    )
    .unwrap();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    fs::write(a.join("index.js"), "changed").unwrap();
    assert!(request(&r, "apply", json!({"plan_id":plan["id"]})).is_err());
    assert!(
        fs::read_to_string(p.join("opencode.json"))
            .unwrap()
            .contains("keep-until-ready")
    );
}
#[test]
fn invalid_ids_and_overlapping_targets_are_rejected() {
    let (_t, r, p, _a) = fixture();
    target(&r, &p);
    let s = snapshot(&r);
    assert!(request(&r,"save_target",json!({"revision":s["registry"]["revision"],"target":{"id":"second","harness":"opencode","name":"Other","root":p,"executable":"","exclusive":false,"enabled":true}})).is_err());
    assert!(
        request(
            &r,
            "remove_plugin",
            json!({"id":"../escape","revision":s["registry"]["revision"]})
        )
        .is_err()
    );
}

#[test]
fn upstream_tag_is_distinct_from_native_version() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let s = snapshot(&r);
    let mut entry = s["registry"]["plugins"][0].clone();
    entry["pinned_version"] = json!("v1.0.0");
    entry["upstream_version"] = json!("v1.0.0");
    entry["upstream_revision"] = json!("0123456789012345678901234567890123456789");
    entry["distributions"][0]["source_revision"] = entry["upstream_revision"].clone();
    request(
        &r,
        "save_plugin",
        json!({"revision":s["registry"]["revision"],"plugin":entry}),
    )
    .unwrap();
    assert_eq!(
        request(&r, "plan", json!({})).unwrap()["blockers"],
        json!([])
    );
}

#[test]
fn two_logical_plugins_cannot_own_one_native_install() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let s = snapshot(&r);
    let mut entry = s["registry"]["plugins"][0].clone();
    entry["id"] = json!("duplicate");
    request(
        &r,
        "save_plugin",
        json!({"revision":s["registry"]["revision"],"plugin":entry}),
    )
    .unwrap();
    assert!(
        !request(&r, "plan", json!({})).unwrap()["blockers"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

fn is_epoch_seconds(v: &Value) -> bool {
    v.as_str()
        .is_some_and(|s| s.len() == 10 && s.chars().all(|c| c.is_ascii_digit()))
}

#[test]
fn snapshot_carries_an_empty_sync_state_before_any_check() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    assert_eq!(
        snapshot(&r)["sync"],
        json!({"last_check":null,"last_sync":null,"revision":null,"pending":null,"blockers":null,"targets":{}})
    );
    assert!(!r.join("sync-status.json").exists());
}

#[test]
fn plan_records_the_check_and_the_pending_count() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    assert_eq!(plan["operations"].as_array().unwrap().len(), 1);
    assert!(r.join("sync-status.json").is_file());
    let s = snapshot(&r);
    let sync = &s["sync"];
    assert!(is_epoch_seconds(&sync["last_check"]), "{sync}");
    assert_eq!(sync["pending"], 1);
    assert_eq!(sync["blockers"], 0);
    assert_eq!(sync["revision"], s["registry"]["revision"]);
    assert_eq!(sync["targets"]["oc"]["checked"], sync["last_check"]);
    assert!(sync["targets"]["oc"]["synced"].is_null());
    assert!(sync["last_sync"].is_null());
}

#[test]
fn apply_records_the_sync_and_clears_the_pending_count() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    let applied = request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    let sync = &applied["sync"];
    assert!(is_epoch_seconds(&sync["last_sync"]), "{sync}");
    assert_eq!(sync["targets"]["oc"]["synced"], sync["last_sync"]);
    assert_eq!(sync["pending"], 0);
    assert_eq!(snapshot(&r)["sync"], *sync);
}

#[test]
fn apply_that_fails_does_not_record_a_sync() {
    let (_t, r, p, a) = fixture();
    target(&r, &p);
    plugin(&r, &a);
    let plan = request(&r, "plan", json!({})).unwrap();
    fs::write(a.join("index.js"), "changed").unwrap();
    assert!(request(&r, "apply", json!({"plan_id":plan["id"]})).is_err());
    let sync = &snapshot(&r)["sync"];
    assert!(sync["last_sync"].is_null());
    assert!(sync["targets"]["oc"]["synced"].is_null());
    assert_eq!(sync["pending"], 1);
}

#[test]
fn plan_for_one_target_leaves_the_others_out() {
    let (t, r, p, a) = fixture();
    let other = t.path().join("other-profile");
    let off = t.path().join("disabled-profile");
    fs::create_dir_all(&other).unwrap();
    fs::create_dir_all(&off).unwrap();
    target(&r, &p);
    target_as(&r, &other, "other", true);
    target_as(&r, &off, "off", false);
    plugin_as(&r, &a, "example", &["oc", "other"]);
    assert_eq!(
        request(&r, "plan", json!({})).unwrap()["operations"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let plan = request(&r, "plan", json!({"target_id":"other"})).unwrap();
    let ops = plan["operations"].as_array().unwrap();
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0]["target_id"], "other");
    assert_eq!(plan["blockers"], json!([]));
    assert!(
        request(&r, "plan", json!({"target_id":"missing"}))
            .unwrap_err()
            .to_string()
            .contains("Target not found")
    );
    assert!(
        request(&r, "plan", json!({"target_id":"off"}))
            .unwrap_err()
            .to_string()
            .contains("disabled")
    );
    assert!(request(&r, "plan", json!({"target_id":7})).is_err());
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    let sync = &snapshot(&r)["sync"];
    assert_eq!(sync["targets"]["other"]["synced"], sync["last_sync"]);
    assert!(sync["targets"]["oc"]["synced"].is_null());
    assert!(sync["targets"].get("off").is_none());
}

#[test]
fn check_reports_a_source_that_cannot_be_resolved_and_still_plans() {
    let (t, r, p, a) = fixture();
    let gone = t.path().join("gone");
    fs::create_dir_all(&gone).unwrap();
    target(&r, &p);
    plugin_as(&r, &gone, "broken", &[]);
    plugin(&r, &a);
    fs::remove_dir_all(&gone).unwrap();
    let out = request(&r, "check", json!({})).unwrap();
    let errors = out["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 1, "{out}");
    assert_eq!(errors[0]["plugin_id"], "broken");
    assert!(errors[0]["message"].as_str().is_some_and(|m| !m.is_empty()));
    let plan = &out["plan"];
    assert_eq!(plan["blockers"], json!([]), "{plan}");
    assert_eq!(plan["operations"].as_array().unwrap().len(), 1);
    assert!(
        r.join("plans")
            .join(format!("{}.json", plan["id"].as_str().unwrap()))
            .is_file()
    );
    let s = snapshot(&r);
    assert_eq!(out["snapshot"]["registry"], s["registry"]);
    assert_eq!(out["snapshot"]["sync"], s["sync"]);
    assert!(is_epoch_seconds(&s["sync"]["last_check"]));
    let plugins = s["registry"]["plugins"].as_array().unwrap();
    assert_eq!(plugins[1]["upstream_version"], "local");
    assert!(plugins[0]["upstream_revision"].is_null());
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
}

#[test]
fn close_to_tray_defaults_to_true_and_must_be_boolean() {
    let (_t, r, _p, _a) = fixture();
    let s = snapshot(&r);
    assert_eq!(s["registry"]["settings"]["close_to_tray"], true);
    let mut older = s["registry"].clone();
    older["settings"]
        .as_object_mut()
        .unwrap()
        .remove("close_to_tray");
    fs::write(r.join("registry.json"), serde_json::to_vec(&older).unwrap()).unwrap();
    assert_eq!(snapshot(&r)["registry"]["settings"]["close_to_tray"], true);
    let mut settings = s["registry"]["settings"].clone();
    for wrong in [json!("no"), json!(null)] {
        settings["close_to_tray"] = wrong;
        assert!(
            request(
                &r,
                "settings",
                json!({"revision":s["registry"]["revision"],"settings":settings})
            )
            .unwrap_err()
            .to_string()
            .contains("close_to_tray")
        );
    }
    settings["close_to_tray"] = json!(false);
    request(
        &r,
        "settings",
        json!({"revision":s["registry"]["revision"],"settings":settings}),
    )
    .unwrap();
    assert_eq!(snapshot(&r)["registry"]["settings"]["close_to_tray"], false);
}

#[test]
#[ignore = "runs an installed native Hermes in an isolated temporary home"]
fn hermes_native_round_trip() {
    let exe = std::env::var("MURO_HERMES_TEST_EXE").expect("MURO_HERMES_TEST_EXE");
    let (_t, r, p, a) = fixture();
    fs::write(a.join("plugin.yaml"),"name: muro-registry-test\nversion: 1.0.0\ndescription: Isolated registry verification\nauthor: Muro\n").unwrap();
    fs::write(a.join("__init__.py"), "def register(ctx):\n    pass\n").unwrap();
    request(&r,"save_target",json!({"revision":0,"target":{"id":"hermes","harness":"hermes","name":"Isolated Hermes","root":p,"executable":exe,"exclusive":true,"enabled":true}})).unwrap();
    let s = snapshot(&r);
    request(&r,"save_plugin",json!({"revision":s["registry"]["revision"],"plugin":{"id":"hermes-test","name":"Hermes test","source":a,"policy":"pinned","pinned_version":"1.0.0","targets":["hermes"],"distributions":[{"harness":"hermes","path":a,"version":"1.0.0"}]}})).unwrap();
    let plan = request(&r, "plan", json!({})).unwrap();
    assert_eq!(plan["blockers"], json!([]), "{plan}");
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    assert_eq!(
        request(&r, "plan", json!({})).unwrap()["operations"],
        json!([])
    );
    let s = snapshot(&r);
    request(
        &r,
        "remove_plugin",
        json!({"id":"hermes-test","revision":s["registry"]["revision"]}),
    )
    .unwrap();
    let plan = request(&r, "plan", json!({})).unwrap();
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    assert!(!p.join("plugins/muro-registry-test").exists());
}

fn marketplace_round_trip(h: &str, exe: &str) {
    let (_t, r, p, a) = fixture();
    let manifest = if h == "codex" {
        ".codex-plugin"
    } else {
        ".claude-plugin"
    };
    fs::create_dir_all(a.join(manifest)).unwrap();
    fs::write(a.join(manifest).join("plugin.json"),r#"{"name":"muro-registry-test","version":"1.0.0","description":"Isolated registry verification"}"#).unwrap();
    request(&r,"save_target",json!({"revision":0,"target":{"id":"host","harness":h,"name":"Isolated host","root":p,"executable":exe,"exclusive":true,"enabled":true}})).unwrap();
    let s = snapshot(&r);
    request(&r,"save_plugin",json!({"revision":s["registry"]["revision"],"plugin":{"id":"native-test","name":"Native test","source":a,"policy":"pinned","pinned_version":"1.0.0","targets":["host"],"distributions":[{"harness":h,"path":a,"version":"1.0.0"}]}})).unwrap();
    let plan = request(&r, "plan", json!({})).unwrap();
    assert_eq!(plan["blockers"], json!([]), "{plan}");
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
    assert_eq!(
        request(&r, "plan", json!({})).unwrap()["operations"],
        json!([])
    );
    let reinstall = request(&r, "plan", json!({"reinstall":"native-test"})).unwrap();
    request(&r, "apply", json!({"plan_id":reinstall["id"]})).unwrap();
    let s = snapshot(&r);
    request(
        &r,
        "remove_plugin",
        json!({"id":"native-test","revision":s["registry"]["revision"]}),
    )
    .unwrap();
    let plan = request(&r, "plan", json!({})).unwrap();
    request(&r, "apply", json!({"plan_id":plan["id"]})).unwrap();
}
#[test]
#[ignore = "requires installed native Claude, uses isolated home"]
fn claude_native_round_trip() {
    marketplace_round_trip(
        "claude-code",
        &std::env::var("MURO_CLAUDE_TEST_EXE").unwrap(),
    );
}
#[test]
#[ignore = "requires installed native Codex, uses isolated home"]
fn codex_native_round_trip() {
    marketplace_round_trip("codex", &std::env::var("MURO_CODEX_TEST_EXE").unwrap());
}
