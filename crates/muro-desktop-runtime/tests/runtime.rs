use muro_desktop_runtime::{discovery, jobs};

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
