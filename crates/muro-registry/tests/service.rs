use muro_registry::service::request;
use serde_json::{Value, json};
use std::{fs, path::Path};

fn snapshot(root: &Path) -> Value {
    request(root, "snapshot", json!({})).unwrap()
}
fn target(root: &Path, profile: &Path) {
    let s = snapshot(root);
    request(root,"save_target",json!({"revision":s["registry"]["revision"],"target":{"id":"oc","harness":"opencode","name":"Test","root":profile,"executable":"","exclusive":true,"enabled":true}})).unwrap();
}
fn plugin(root: &Path, artifact: &Path) {
    let s = snapshot(root);
    request(root,"save_plugin",json!({"revision":s["registry"]["revision"],"plugin":{"id":"example","name":"Example","source":artifact,"policy":"pinned","pinned_version":"1.0.0","targets":["oc"],"distributions":[{"harness":"opencode","path":artifact,"version":"1.0.0"}]}})).unwrap();
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
