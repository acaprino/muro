pub mod autostart;
pub mod cli;
pub mod discovery;
pub mod exec;
pub mod factory;
pub mod jobs;
mod process_tree;
pub mod projects;
pub mod simulate;
pub mod single_instance;
pub mod sync_gate;
pub mod tray;

use anyhow::{Context, Result};
use serde_json::{Value, json};
use std::path::Path;

/// Opens a folder in the system's file manager. The one launch, for the custom-instructions folder and
/// for the folder of a project file.
pub fn open_in_file_manager(path: &Path) -> Result<()> {
    #[cfg(windows)]
    let mut command = std::process::Command::new("explorer.exe");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(path)
        .spawn()
        .with_context(|| format!("Cannot open the folder {}", path.display()))?;
    Ok(())
}

pub fn request(data: &Path, action: &str, payload: Value) -> Result<Value> {
    match action {
        "projects" => projects::projects(data),
        "project" => projects::project(data, &payload),
        "open_project" => projects::open(data, &payload),
        "install_project" => projects::install(data, &payload),
        "open_folder" => projects::open_folder(data, &payload),
        "env_present" => projects::env_present(&payload),
        "simulate" => simulate::simulate(data, &payload),
        "cancel_simulation" => simulate::cancel(data, &payload),
        "discover" => cli::discover_via_cli(&data.join("discovery-cache")),
        "recover_jobs" => {
            jobs::recover(data)?;
            Ok(json!({"status":"ok"}))
        }
        "automation_record" => {
            record_automation(data, payload["error"].as_str())?;
            Ok(json!({"status":"ok"}))
        }
        "sync_now" => sync_now(data, &payload),
        "adapt" => jobs::start(data, &payload),
        "jobs" => Ok(json!(jobs::list(data)?)),
        "cancel_job" => jobs::cancel(data, payload["id"].as_str().unwrap_or("")),
        "open_custom_instructions" => {
            let info = muro_registry::service::request(data, "custom_instructions",
                json!({"id":payload["id"],"create":true}))?;
            let path = info["path"].as_str().context("Instruction directory missing")?;
            open_in_file_manager(Path::new(path))?;
            Ok(info)
        }
        "snapshot" => {
            let mut snapshot = muro_registry::service::request(data, action, payload)?;
            snapshot["jobs"] = json!(jobs::list(data)?);
            snapshot["data_dir"] = json!(data);
            if let Ok(bytes) = std::fs::read(data.join("automation-status.json")) {
                if let Ok(event) = serde_json::from_slice::<Value>(&bytes) {
                    if let Some(activity) = snapshot["activity"].as_array_mut() {
                        activity.push(event);
                    }
                }
            }
            Ok(snapshot)
        }
        _ => muro_registry::service::request(data, action, payload),
    }
}

/// One sync of the enabled harnesses, for the tray and the background worker: a registry
/// `check`, then, when `apply` (default true) and the plan has operations, an `apply` of that
/// plan that leaves its blockers out. With `apply` false it only checks. The outcome is
/// recorded for the Activity page: an `Automatic sync` when it applies, a `Background check`
/// when it only checks; failed with the error, or with the sources that could not be resolved
/// and the blockers as the message (they are a result, not an error), else complete with what
/// was applied or is waiting.
fn sync_now(data: &Path, payload: &Value) -> Result<Value> {
    let apply = match &payload["apply"] {
        Value::Null => true,
        v => v.as_bool().context("apply must be a boolean")?,
    };
    let outcome = check_and_apply(data, apply);
    let (failed, message) = match &outcome {
        Err(e) => (true, format!("{e:#}")),
        Ok((result, unchecked)) => {
            let blockers: Vec<&str> = result["blockers"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .collect();
            let mut problems = vec![];
            if !unchecked.is_empty() {
                problems.push(format!("Sources not checked: {}", unchecked.join(", ")));
            }
            if !blockers.is_empty() {
                problems.push(blockers.join("; "));
            }
            if problems.is_empty() {
                (false, summary(apply, result))
            } else {
                (true, problems.join(". "))
            }
        }
    };
    let action = if apply { "Automatic sync" } else { "Background check" };
    let recorded = record(data, action, failed, &message);
    let (result, _) = outcome?;
    recorded?;
    Ok(result)
}

/// What a sync that found no blocker tells a person: the changes it applied, or the changes
/// that are waiting when it only checked.
fn summary(apply: bool, result: &Value) -> String {
    let (count, said) = if apply {
        (&result["applied"], "applied")
    } else {
        (&result["pending"], "waiting")
    };
    match count.as_u64() {
        Some(1) => format!("1 change {said}"),
        Some(n) if n > 1 => format!("{n} changes {said}"),
        _ if apply => "Nothing to apply".into(),
        _ => "Everything is in sync".into(),
    }
}

/// The result of one sync, and the names of the plugins whose source could not be resolved.
fn check_and_apply(data: &Path, apply: bool) -> Result<(Value, Vec<String>)> {
    let checked = muro_registry::service::request(data, "check", json!({}))?;
    let unchecked = checked["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|error| error["plugin_id"].as_str())
        .map(|id| {
            checked["snapshot"]["registry"]["plugins"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|plugin| plugin["id"] == id)
                .and_then(|plugin| plugin["name"].as_str())
                .unwrap_or(id)
                .to_owned()
        })
        .collect();
    let plan = &checked["plan"];
    let operations = plan["operations"]
        .as_array()
        .context("Plan operations missing")?
        .len();
    let applied = if apply && operations > 0 {
        let payload = json!({"plan_id":plan["id"],"allow_blocked":true});
        muro_registry::service::request(data, "apply", payload)?;
        operations
    } else {
        0
    };
    Ok((
        json!({"applied":applied,"pending":operations - applied,
               "blockers":plan["blockers"],"errors":checked["errors"]}),
        unchecked,
    ))
}

pub fn record_automation(data: &Path, error: Option<&str>) -> Result<()> {
    record(
        data,
        "Automatic sync",
        error.is_some(),
        error.unwrap_or("Automatic sync verified"),
    )
}

/// Replaces `automation-status.json`, the event the Activity page shows for the background work.
fn record(data: &Path, action: &str, failed: bool, message: &str) -> Result<()> {
    use std::io::Write;
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let event = json!({"id":"automation","time":time.to_string(),"action":action,"status":if failed{"failed"}else{"complete"},"message":message});
    let mut file = tempfile::NamedTempFile::new_in(data)?;
    file.write_all(&serde_json::to_vec_pretty(&event)?)?;
    file.as_file().sync_all()?;
    file.persist(data.join("automation-status.json"))
        .map_err(|e| e.error)?;
    Ok(())
}
