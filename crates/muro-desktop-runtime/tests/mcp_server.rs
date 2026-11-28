//! Muro's MCP server in a harness of the registry (`mcp_status`, `install_mcp`, `remove_mcp`): what the
//! runtime reads of Claude Code's own file, the harnesses it does not register in, and what it refuses
//! before any command runs. No harness runs here: `claude mcp` and `codex mcp` were run on this machine
//! against a scratch folder (Claude Code 2.1.332, Codex 0.169.0), and their argument lists are unit tests
//! of the module.
mod common;

use common::install;
use muro_desktop_runtime::{factory::Factory, request};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

struct Home {
    _temp: tempfile::TempDir,
    data: PathBuf,
}

impl Home {
    /// A data directory whose registry names the fake factory.
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let data = temp.path().join("data");
        fs::create_dir_all(&data).unwrap();
        let (_, settings) = install(temp.path());
        let current = request(&data, "registry", json!({})).unwrap();
        let mut all = current["settings"].clone();
        all["python"] = settings["python"].clone();
        all["factory_path"] = settings["factory_path"].clone();
        request(&data, "settings", json!({"revision":current["revision"],"settings":all})).unwrap();
        Self { data, _temp: temp }
    }

    /// A harness on a folder of its own, never Claude Code's default one, and with no executable.
    fn target(&self, id: &str, harness: &str) -> PathBuf {
        let root = self.data.parent().unwrap().join(format!("profile-{id}"));
        fs::create_dir_all(&root).unwrap();
        let revision = request(&self.data, "registry", json!({})).unwrap()["revision"].clone();
        request(&self.data, "save_target", json!({"revision":revision,"target":{
            "id":id,"harness":harness,"name":id,"root":root,"executable":"","exclusive":false,"enabled":true}})).unwrap();
        root
    }

    fn call(&self, action: &str, id: &str) -> anyhow::Result<Value> {
        request(&self.data, action, json!({"target_id":id}))
    }

    /// The server as this Muro starts it: what a current entry holds.
    fn wanted(&self) -> (String, Vec<String>) {
        let settings = request(&self.data, "registry", json!({})).unwrap()["settings"].clone();
        Factory::from_settings(&settings).unwrap().invocation(&["mcp".to_owned()])
    }
}

fn error_of(result: anyhow::Result<Value>) -> String {
    format!("{:#}", result.expect_err("the action must fail"))
}

fn status(registered: bool, current: bool) -> Value {
    json!({"target_id":"cc","supported":true,"registered":registered,"current":current})
}

#[test]
fn claude_codes_own_file_says_whether_the_server_is_there_and_whether_it_starts_this_muro() {
    let home = Home::new();
    let root = home.target("cc", "claude-code");
    assert_eq!(home.call("mcp_status", "cc").unwrap(), status(false, false), "no file yet");
    // A folder other than the default one holds its own `.claude.json`, as `claude mcp add -s user` wrote it there.
    let (python, args) = home.wanted();
    let entry = |args: Vec<String>| json!({"mcpServers":{"other":{"type":"stdio","command":"node","args":["x.js"]},
        "muro":{"type":"stdio","command":python,"args":args,"env":{}}},"projects":{}});
    fs::write(root.join(".claude.json"), entry(args.clone()).to_string()).unwrap();
    assert_eq!(home.call("mcp_status", "cc").unwrap(), status(true, true));
    // An entry that starts another copy of Muro (moved, updated elsewhere) is there and not current.
    let mut elsewhere = args;
    elsewhere[2] = "C:/Old Muro/resources/factory/muro_build.py".into();
    fs::write(root.join(".claude.json"), entry(elsewhere).to_string()).unwrap();
    assert_eq!(home.call("mcp_status", "cc").unwrap(), status(true, false));
    fs::write(root.join(".claude.json"), json!({"mcpServers":{"other":{}}}).to_string()).unwrap();
    assert_eq!(home.call("mcp_status", "cc").unwrap(), status(false, false), "another server is not Muro's");
}

#[test]
fn a_file_that_cannot_be_read_is_an_error_not_a_server_that_is_missing() {
    let home = Home::new();
    let root = home.target("cc", "claude-code");
    fs::write(root.join(".claude.json"), "{ half").unwrap();
    assert!(error_of(home.call("mcp_status", "cc")).contains("is not JSON"));
}

#[test]
fn a_harness_muro_does_not_register_in_is_said_and_nothing_is_written() {
    let home = Home::new();
    let root = home.target("pi-main", "pi");
    assert_eq!(home.call("mcp_status", "pi-main").unwrap(), json!({"target_id":"pi-main","supported":false,"registered":false,"current":false}));
    for action in ["install_mcp", "remove_mcp"] {
        assert_eq!(error_of(home.call(action, "pi-main")), "Muro installs its MCP server in Claude Code and Codex only", "{action}");
    }
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    assert!(error_of(home.call("mcp_status", "nobody")).contains("No harness nobody"));
    assert!(error_of(request(&home.data, "mcp_status", json!({}))).contains("Name the harness"));
}

#[test]
fn without_an_executable_nothing_is_installed_or_removed() {
    let home = Home::new();
    let root = home.target("cc", "claude-code");
    assert_eq!(error_of(home.call("install_mcp", "cc")), "The harness has no executable");
    assert!(!root.join(".claude.json").exists());
    let held = json!({"mcpServers":{"muro":{"type":"stdio","command":"py","args":["mcp"]}}}).to_string();
    fs::write(root.join(".claude.json"), &held).unwrap();
    assert_eq!(error_of(home.call("remove_mcp", "cc")), "The harness has no executable");
    assert_eq!(fs::read_to_string(root.join(".claude.json")).unwrap(), held, "the entry is as it was");
    // Codex is read through its own command: with no executable, its status is that refusal too.
    home.target("cx", "codex");
    assert_eq!(error_of(home.call("mcp_status", "cx")), "The harness has no executable");
}
