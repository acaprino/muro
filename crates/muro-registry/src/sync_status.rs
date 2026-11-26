//! When the registry last compared the installed plugins with the desired ones, and when it last
//! brought a target in line: `<data>/sync-status.json`, read into every snapshot as `sync`.
//! The overall fields describe the last full plan; a plan for one target moves only that
//! target's `checked`. `errors` counts the sources the last full check could not resolve.
use crate::storage::{event, read, write};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::path::Path;

const FILE: &str = "sync-status.json";

/// The state before any check, and what a record that cannot be read stands for.
fn unrecorded() -> Value {
    json!({"last_check":null,"last_sync":null,"revision":null,"pending":null,"blockers":null,"errors":null,"targets":{}})
}

/// The recorded state, or the state before any check when nothing was recorded yet. The record
/// is derived state: a file that cannot be read or does not have the shape is no record at all,
/// never an error that stops every action, and the next check or sync writes it again.
pub fn load(root: &Path) -> Result<Value> {
    let Ok(mut state) = read(&root.join(FILE)) else {
        return Ok(unrecorded());
    };
    if !state["targets"].is_object() {
        return Ok(unrecorded());
    }
    // A record written before `errors` existed has none: that is not a count of zero.
    if state.get("errors").is_none() {
        state["errors"] = Value::Null;
    }
    Ok(state)
}

/// Records a calculated plan: the targets it compared get its time as `checked`; a full plan
/// (`full`, every enabled target) also sets the overall time, revision, and operation and
/// blocker counts. `errors` is the number of sources a `check` could not resolve; a plan
/// resolves none, so it passes `None` and the count stays as the last check left it.
pub fn record_check(
    root: &Path,
    plan: &Value,
    checked: &[&str],
    full: bool,
    errors: Option<usize>,
) -> Result<()> {
    let mut state = load(root)?;
    let time = plan["created"].clone();
    ensure!(time.is_string(), "Plan has no creation time");
    if full {
        state["last_check"] = time.clone();
        state["revision"] = plan["revision"].clone();
        state["pending"] = json!(plan["operations"].as_array().context("operations")?.len());
        state["blockers"] = json!(plan["blockers"].as_array().context("blockers")?.len());
        if let Some(errors) = errors {
            state["errors"] = json!(errors);
        }
    }
    for id in checked {
        target(&mut state, id)["checked"] = time.clone();
    }
    write(&root.join(FILE), &state)
}

/// The registry revision moved from `from` to `to` by a change that does not alter what a sync
/// would do (a setting): the last full plan describes the registry as well as before, so its
/// recorded revision follows. It does nothing when the recorded revision is not `from` (no plan
/// yet, or the plan was already out of date for another change) and then writes no file.
pub fn carry_revision(root: &Path, from: u64, to: u64) -> Result<()> {
    let mut state = load(root)?;
    if state["revision"].as_u64() != Some(from) {
        return Ok(());
    }
    state["revision"] = json!(to);
    write(&root.join(FILE), &state)
}

/// A target left the registry: its times go with it, or a new target given the same id would
/// start with the removed one's `synced` and `checked`. It writes no file when it had none.
pub fn forget_target(root: &Path, id: &str) -> Result<()> {
    let mut state = load(root)?;
    let removed = state["targets"].as_object_mut().and_then(|all| all.remove(id));
    if removed.is_none() {
        return Ok(());
    }
    write(&root.join(FILE), &state)
}

/// A single-plugin install changes the inventory without calculating the remaining full plan.
/// Preserve the timestamps of actual harness checks and syncs until the next one runs.
pub fn invalidate_counts(root: &Path) -> Result<()> {
    let mut state = load(root)?;
    if state["revision"].is_null() { return Ok(()); }
    for field in ["revision", "pending", "blockers"] { state[field] = Value::Null; }
    write(&root.join(FILE), &state)
}

/// Records an applied plan: the targets it changed are synced, and the operations it applied
/// are no longer pending. `blockers` stays as the check counted it: an apply that left
/// blockers out did not resolve them.
pub fn record_sync(root: &Path, synced: &[&str], applied: usize) -> Result<()> {
    let mut state = load(root)?;
    let time = event("sync", "complete", "")["time"].clone();
    state["last_sync"] = time.clone();
    if let Some(pending) = state["pending"].as_u64() {
        state["pending"] = json!(pending.saturating_sub(applied as u64));
    }
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
