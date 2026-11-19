pub mod autostart;
pub mod cli;
pub mod discovery;
pub mod jobs;
mod process_tree;

use anyhow::{Context, Result};
use serde_json::{Value, json};
use std::path::Path;

pub fn request(data: &Path, action: &str, payload: Value) -> Result<Value> {
    match action {
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
            #[cfg(windows)]
            let mut command = std::process::Command::new("explorer.exe");
            #[cfg(target_os = "macos")]
            let mut command = std::process::Command::new("open");
            #[cfg(all(unix, not(target_os = "macos")))]
            let mut command = std::process::Command::new("xdg-open");
            command.arg(path).spawn().context("Cannot open custom-instructions folder")?;
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
/// plan that leaves its blockers out. With `apply` false it only checks. The outcome goes to
/// `record_automation`: the error, else the blockers as its message. Blockers are a result,
/// not an error.
fn sync_now(data: &Path, payload: &Value) -> Result<Value> {
    let apply = match &payload["apply"] {
        Value::Null => true,
        v => v.as_bool().context("apply must be a boolean")?,
    };
    let outcome = check_and_apply(data, apply);
    let message = match &outcome {
        Err(e) => Some(format!("{e:#}")),
        Ok(result) => {
            let blockers: Vec<&str> = result["blockers"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .collect();
            (!blockers.is_empty()).then(|| blockers.join("; "))
        }
    };
    let recorded = record_automation(data, message.as_deref());
    let result = outcome?;
    recorded?;
    Ok(result)
}

fn check_and_apply(data: &Path, apply: bool) -> Result<Value> {
    let checked = muro_registry::service::request(data, "check", json!({}))?;
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
    Ok(json!({"applied":applied,"pending":operations - applied,
              "blockers":plan["blockers"],"errors":checked["errors"]}))
}

pub fn record_automation(data: &Path, error: Option<&str>) -> Result<()> {
    use std::io::Write;
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let event = json!({"id":"automation","time":time.to_string(),"action":"Automatic sync","status":if error.is_some(){"failed"}else{"complete"},"message":error.unwrap_or("Automatic sync verified")});
    let mut file = tempfile::NamedTempFile::new_in(data)?;
    file.write_all(&serde_json::to_vec_pretty(&event)?)?;
    file.as_file().sync_all()?;
    file.persist(data.join("automation-status.json"))
        .map_err(|e| e.error)?;
    Ok(())
}
