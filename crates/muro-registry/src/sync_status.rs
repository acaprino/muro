//! When the registry last compared the installed plugins with the desired ones, and when it last
//! brought a target in line: `<data>/sync-status.json`, read into every snapshot as `sync`.
use crate::storage::{event, read, write};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::path::Path;

const FILE: &str = "sync-status.json";

/// The recorded state, or the state before any check when nothing was recorded yet.
pub fn load(root: &Path) -> Result<Value> {
    let path = root.join(FILE);
    if !path.exists() {
        return Ok(
            json!({"last_check":null,"last_sync":null,"revision":null,"pending":null,"blockers":null,"targets":{}}),
        );
    }
    let state = read(&path)?;
    ensure!(
        state["targets"].is_object(),
        "Corrupt sync status: {}",
        path.display()
    );
    Ok(state)
}

/// Records a calculated plan: its time, revision, operation and blocker counts, and the targets
/// it compared.
pub fn record_check(root: &Path, plan: &Value, checked: &[&str]) -> Result<()> {
    let mut state = load(root)?;
    let time = plan["created"].clone();
    ensure!(time.is_string(), "Plan has no creation time");
    state["last_check"] = time.clone();
    state["revision"] = plan["revision"].clone();
    state["pending"] = json!(plan["operations"].as_array().context("operations")?.len());
    state["blockers"] = json!(plan["blockers"].as_array().context("blockers")?.len());
    for id in checked {
        target(&mut state, id)["checked"] = time.clone();
    }
    write(&root.join(FILE), &state)
}

/// Records an applied plan: nothing is pending any more, and the targets it changed are synced.
pub fn record_sync(root: &Path, synced: &[&str]) -> Result<()> {
    let mut state = load(root)?;
    let time = event("sync", "complete", "")["time"].clone();
    state["last_sync"] = time.clone();
    state["pending"] = json!(0);
    for id in synced {
        target(&mut state, id)["synced"] = time.clone();
    }
    write(&root.join(FILE), &state)
}

fn target<'a>(state: &'a mut Value, id: &str) -> &'a mut Value {
    let entry = &mut state["targets"][id];
    if entry.is_null() {
        *entry = json!({"checked":null,"synced":null});
    }
    entry
}
