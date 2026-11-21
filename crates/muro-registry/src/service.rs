use crate::{ai, instructions, native, projects, sources, storage::*, sync_status};
use anyhow::{Context, Result, bail, ensure};
use fs2::FileExt;
use serde_json::{Value, json};
use std::{fs, path::Path};

/// How a request that met another writer starts its error: the text a client looks for to try
/// again. The refusal comes before the request did anything, so trying again is safe.
pub const BUSY: &str = "Registry is busy";
/// The events of the activity log that are kept: the oldest go first.
const ACTIVITY_LIMIT: usize = 500;

pub fn request(data_dir: &Path, action: &str, payload: Value) -> Result<Value> {
    fs::create_dir_all(data_dir)?;
    ensure!(
        !data_dir.is_symlink(),
        "Registry directory must not be a symbolic link"
    );
    // A read of two small files that are only ever replaced whole: it waits for no writer, so a
    // check that lasts minutes does not blind the tray and the background worker.
    if action == "status" {
        return status(data_dir);
    }
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(data_dir.join("writer.lock"))?;
    lock.try_lock_exclusive()
        .context(format!("{BUSY}; wait for the running operation"))?;
    let mut registry = load_registry(data_dir)?;
    let mut receipts = optional(&data_dir.join("receipts.json"))?;
    match action {
        "registry" => Ok(registry),
        "snapshot" => snapshot(data_dir, &registry, &receipts, false),
        "scan" => snapshot(data_dir, &registry, &receipts, true),
        "custom_instructions" => {
            let key = str_field(&payload, "id")?;
            let plugin = registry["plugins"].as_array().context("plugins")?.iter()
                .find(|p| p["id"] == key).context("Plugin not found")?;
            instructions::info(data_dir, plugin, payload["create"] == true)
        }
        "save_plugin" | "remove_plugin" | "save_target" | "remove_target" | "settings"
        | "save_projects" | "remove_project" => {
            revision(&registry, &payload)?;
            // The receipt written for an adopted installation, until the registry is saved.
            let mut adopted = None;
            let mut removed_target = None;
            match action {
                "save_plugin" => {
                    let p = payload["plugin"].clone();
                    validate_plugin(&p, &registry)?;
                    instructions::directory(data_dir, &p)?;
                    if let Some(expected) = payload.get("expected_custom_instructions_digest") {
                        ensure!(expected.as_str() == Some(instructions::read(data_dir, &p)?.digest().as_str()),
                                "custom-instructions changed during adaptation; regenerate before recording");
                    }
                    if let Some(old) = registry["plugins"]
                        .as_array()
                        .and_then(|all| all.iter().find(|old| old["id"] == p["id"]))
                    {
                        if old["source"] != p["source"] {
                            ensure!(
                                p["distributions"].as_array().is_some_and(|d| d.is_empty()),
                                "Changing source requires clearing previous distributions"
                            );
                            ensure!(
                                [
                                    "resolved_source",
                                    "upstream_revision",
                                    "upstream_version",
                                    "last_checked"
                                ]
                                .iter()
                                .all(|key| p.get(*key).is_none_or(Value::is_null)),
                                "Changing source requires clearing resolved upstream metadata"
                            );
                        }
                    }
                    if let Some(adopt) = payload.get("adopt").filter(|a| !a.is_null()) {
                        adopted = Some(adopt_installation(
                            data_dir,
                            &registry,
                            &mut receipts,
                            &p,
                            adopt,
                        )?);
                    }
                    upsert(&mut registry["plugins"], p)?;
                }
                "save_target" => {
                    let t = payload["target"].clone();
                    validate_target(&t, &registry)?;
                    upsert(&mut registry["targets"], t)?;
                }
                "remove_plugin" => {
                    let key = str_field(&payload, "id")?;
                    id(key)?;
                    registry["plugins"]
                        .as_array_mut()
                        .context("plugins")?
                        .retain(|p| p["id"] != key);
                }
                "remove_target" => {
                    let key = str_field(&payload, "id")?;
                    id(key)?;
                    ensure!(
                        !registry["plugins"]
                            .as_array()
                            .context("plugins")?
                            .iter()
                            .any(|p| p["targets"]
                                .as_array()
                                .is_some_and(|a| a.contains(&json!(key)))),
                        "Remove this target from its plugins first"
                    );
                    registry["targets"]
                        .as_array_mut()
                        .context("targets")?
                        .retain(|t| t["id"] != key);
                    removed_target = Some(key);
                }
                "settings" => {
                    let s = payload["settings"].clone();
                    ensure!(s["auto_sync"].is_boolean(), "auto_sync must be boolean");
                    ensure!(
                        s["close_to_tray"].is_boolean(),
                        "close_to_tray must be boolean"
                    );
                    ensure!(
                        s["interval_minutes"].as_u64().is_some_and(|v| v >= 1),
                        "interval_minutes must be at least 1"
                    );
                    for k in ["agent", "python", "factory_path"] {
                        str_field(&s, k)?;
                    }
                    let mut s = s;
                    ai::apply(&mut s, &registry["settings"])?;
                    registry["settings"] = s;
                }
                "save_projects" => {
                    registry["projects"] = projects::validate_list(&payload["projects"])?;
                }
                "remove_project" => {
                    let key = str_field(&payload, "id")?;
                    id(key)?;
                    registry["projects"] = projects::remove(&registry["projects"], key)?;
                }
                _ => unreachable!(),
            }
            let from = registry["revision"].as_u64().context("revision")?;
            if let Err(error) = save_registry(data_dir, &mut registry) {
                // The plugin was not saved: the installation is not its own.
                if let Some(key) = adopted {
                    if let Some(all) = receipts.as_object_mut() {
                        all.remove(&key);
                    }
                    let _ = write(&data_dir.join("receipts.json"), &receipts);
                }
                return Err(error);
            }
            if let Some(key) = removed_target {
                sync_status::forget_target(data_dir, key)?;
            }
            if action == "settings" {
                // Settings do not change what a sync would do: the last plan stays current, so a
                // switch does not cost a new inventory scan and the shell does not read "not checked".
                let to = registry["revision"].as_u64().context("revision")?;
                sync_status::carry_revision(data_dir, from, to)?;
            }
            log(data_dir, action, "complete", "Registry configuration saved")?;
            snapshot(data_dir, &registry, &receipts, false)
        }
        "plan" => check_plan(
            data_dir,
            &registry,
            &receipts,
            payload["reinstall"].as_str(),
            only_target(&payload)?,
            None,
        ),
        "check" => {
            let only = only_target(&payload)?;
            // Refuse an unknown or disabled target before resolving anything.
            planned_targets(&registry, only)?;
            let before = registry["plugins"].clone();
            let mut errors = vec![];
            for index in 0..registry["plugins"].as_array().context("plugins")?.len() {
                let plugin = registry["plugins"][index].clone();
                match sources::resolve(data_dir, &plugin) {
                    Ok(resolved) => registry["plugins"][index] = resolved,
                    Err(e) => {
                        errors.push(json!({"plugin_id":plugin["id"],"message":format!("{e:#}")}))
                    }
                }
            }
            // A check that found nothing new keeps the revision, or every interval of the
            // background worker would make open forms and held plans stale.
            if without_check_times(&registry["plugins"]) == without_check_times(&before) {
                registry["plugins"] = before;
            } else {
                save_registry(data_dir, &mut registry)?;
            }
            let plan = check_plan(data_dir, &registry, &receipts, None, only, Some(errors.len()))?;
            if errors.is_empty() {
                log(
                    data_dir,
                    "check",
                    "complete",
                    "Sources resolved and plan calculated",
                )?;
            } else {
                let failed: Vec<_> = errors
                    .iter()
                    .filter_map(|e| e["plugin_id"].as_str())
                    .collect();
                log(
                    data_dir,
                    "check",
                    "failed",
                    &format!(
                        "Plan calculated; sources not resolved: {}",
                        failed.join(", ")
                    ),
                )?;
            }
            Ok(
                json!({"snapshot":snapshot(data_dir, &registry, &receipts, false)?,"plan":plan,"errors":errors}),
            )
        }
        "apply" => apply(data_dir, &registry, &mut receipts, &payload),
        "resolve" => {
            let key = str_field(&payload, "id")?;
            id(key)?;
            let index = registry["plugins"]
                .as_array()
                .context("plugins")?
                .iter()
                .position(|p| p["id"] == key)
                .context("Plugin not found")?;
            let plugin = registry["plugins"][index].clone();
            let resolved = sources::resolve(data_dir, &plugin)?;
            registry["plugins"][index] = resolved;
            save_registry(data_dir, &mut registry)?;
            log(
                data_dir,
                "resolve",
                "complete",
                "Source resolved and native distributions inspected",
            )?;
            snapshot(data_dir, &registry, &receipts, false)
        }
        "maintenance" => maintenance(data_dir, &registry, &receipts, &payload),
        _ => bail!("Unknown registry action: {action}"),
    }
}
fn load_registry(root: &Path) -> Result<Value> {
    let path = root.join("registry.json");
    let mut v = if path.exists() {
        let v = read(&path)?;
        ensure!(
            v["schema"] == 1
                && v["revision"].is_u64()
                && v["plugins"].is_array()
                && v["targets"].is_array()
                && v["settings"].is_object(),
            "Unsupported or corrupt registry schema"
        );
        v
    } else {
        json!({"schema":1,"revision":0,"plugins":[],"targets":[],"projects":[],"settings":{"auto_sync":false,"interval_minutes":60,"agent":"claude-code","python":"python","factory_path":""}})
    };
    // A setting added after registries were first written starts at its default.
    if v["settings"].get("close_to_tray").is_none() {
        v["settings"]["close_to_tray"] = json!(true);
    }
    // The AI engine: an older registry has only `agent`, which becomes its harness. The list of
    // projects starts empty. Neither is written until the next save.
    ai::migrate(&mut v["settings"]);
    if !v["projects"].is_array() {
        v["projects"] = json!([]);
    }
    Ok(v)
}
fn revision(reg: &Value, payload: &Value) -> Result<()> {
    ensure!(
        payload["revision"].as_u64() == reg["revision"].as_u64(),
        "Registry revision changed; refresh before saving"
    );
    Ok(())
}
fn receipt_key(target_id: &str, plugin_id: &str) -> String {
    serde_json::to_string(&[target_id, plugin_id]).expect("Two IDs serialize to JSON")
}
fn receipt_for<'a>(receipts: &'a Value, target_id: &str, plugin_id: &str) -> Option<&'a Value> {
    receipts
        .as_object()?
        .values()
        .find(|r| r["target_id"] == target_id && r["plugin_id"] == plugin_id)
}
/// The digest of the copy a person already has: its folder, hashed as Muro hashes the build it
/// installs. A harness that reports no folder (Codex) gives none, and the plan then takes the
/// copy for an older one and updates it.
fn installed_digest(entry: &Value) -> String {
    entry["path"]
        .as_str()
        .map(Path::new)
        .filter(|path| path.is_dir())
        .and_then(|path| tree_hash(path).ok())
        .unwrap_or_default()
}
/// The installation a new plugin of the list takes over (`adopt`: `target_id` and `native_id`):
/// the receipt that binds the plugin to it, written as an install by Muro leaves it, with the
/// version and digest of the copy that is there. The next plan then finds the plugin installed:
/// nothing to do when the copy is the build, an update when it is not, never a second copy.
/// Refused when the target is not in the registry or cannot be read, when nothing with that id
/// is installed there, when it belongs to a plugin of the list already, or when the plugin is
/// not a new one that lists the target. Returns the receipt's key; the caller saves the plugin.
fn adopt_installation(
    root: &Path,
    registry: &Value,
    receipts: &mut Value,
    plugin: &Value,
    adopt: &Value,
) -> Result<String> {
    ensure!(
        adopt.is_object(),
        "adopt must be an object with target_id and native_id"
    );
    let target_id = str_field(adopt, "target_id")?;
    let native_id = str_field(adopt, "native_id")?;
    let plugin_id = str_field(plugin, "id")?;
    ensure!(
        !registry["plugins"]
            .as_array()
            .context("plugins")?
            .iter()
            .any(|p| p["id"] == plugin["id"]),
        "An installation is adopted by a plugin that is being added; {plugin_id} is in the list already"
    );
    let target = registry["targets"]
        .as_array()
        .context("targets")?
        .iter()
        .find(|t| t["id"] == target_id)
        .context("Target not found")?;
    let name = text(&target["name"]);
    ensure!(
        plugin["targets"]
            .as_array()
            .context("targets")?
            .contains(&json!(target_id)),
        "The plugin must list {name} to adopt an installation there"
    );
    let inventory = native::inventory(target, receipts);
    ensure!(
        inventory["complete"] == true,
        "{name} could not be read: {}",
        text(&inventory["error"])
    );
    let entry = inventory["plugins"]
        .as_array()
        .context("inventory plugins")?
        .iter()
        .find(|i| i["id"] == native_id)
        .with_context(|| format!("{native_id} is not installed on {name}"))?;
    ensure!(
        entry["managed"] != true,
        "{native_id} already belongs to {} on {name}",
        text(&entry["registry_id"])
    );
    let receipt = json!({"target_id":target_id,"plugin_id":plugin_id,"native_id":native_id,
        "version":entry["version"],"digest":installed_digest(entry),"path":entry["path"],
        "custom_instructions_digest":instructions::read(root, plugin)?.digest(),
        "adopted":true});
    let key = receipt_key(target_id, plugin_id);
    let all = receipts.as_object_mut().context("receipts")?;
    // A legacy delimiter key for this pair goes, as at an install.
    all.retain(|_, r| r["target_id"] != target_id || r["plugin_id"] != plugin_id);
    all.insert(key.clone(), receipt);
    write(&root.join("receipts.json"), receipts)?;
    Ok(key)
}
/// Plugin entries as a check compares them: the time of the check itself is not a change.
fn without_check_times(plugins: &Value) -> Value {
    let mut plugins = plugins.clone();
    for plugin in plugins.as_array_mut().into_iter().flatten() {
        if let Some(entry) = plugin.as_object_mut() {
            entry.remove("last_checked");
        }
    }
    plugins
}
fn save_registry(root: &Path, reg: &mut Value) -> Result<()> {
    reg["revision"] = json!(reg["revision"].as_u64().context("revision")? + 1);
    write(&root.join("registry.json"), reg)
}
fn upsert(list: &mut Value, item: Value) -> Result<()> {
    let list = list.as_array_mut().context("Expected array")?;
    if let Some(i) = list.iter().position(|v| v["id"] == item["id"]) {
        list[i] = item
    } else {
        list.push(item)
    }
    Ok(())
}
fn validate_plugin(p: &Value, reg: &Value) -> Result<()> {
    id(str_field(p, "id")?)?;
    for k in ["name", "source", "pinned_version"] {
        str_field(p, k)?;
    }
    ensure!(
        !str_field(p, "name")?.trim().is_empty(),
        "Plugin name is required"
    );
    ensure!(
        !str_field(p, "source")?.trim().is_empty(),
        "Source is required"
    );
    ensure!(
        matches!(str_field(p, "policy")?, "pinned" | "stable" | "head"),
        "Invalid update policy"
    );
    if p["policy"] == "pinned" {
        ensure!(
            !str_field(p, "pinned_version")?.is_empty(),
            "Pinned version is required"
        );
    }
    let targets = p["targets"]
        .as_array()
        .context("targets must be an array")?;
    for t in targets {
        ensure!(
            reg["targets"]
                .as_array()
                .context("targets")?
                .iter()
                .any(|r| r["id"] == *t),
            "Unknown target {t}"
        );
    }
    let ds = p["distributions"]
        .as_array()
        .context("distributions must be an array")?;
    let mut seen = std::collections::HashSet::new();
    for d in ds {
        let h = str_field(d, "harness")?;
        ensure!(seen.insert(h), "Duplicate distribution for {h}");
        str_field(d, "version")?;
        let path = Path::new(str_field(d, "path")?);
        ensure!(path.is_absolute(), "Distribution path must be absolute");
    }
    Ok(())
}
fn validate_target(t: &Value, reg: &Value) -> Result<()> {
    id(str_field(t, "id")?)?;
    for k in ["name", "harness", "executable"] {
        str_field(t, k)?;
    }
    ensure!(
        matches!(
            str_field(t, "harness")?,
            "claude-code" | "codex" | "opencode" | "pi" | "hermes" | "deepseek"
        ),
        "Unknown harness"
    );
    ensure!(
        t["exclusive"].is_boolean() && t["enabled"].is_boolean(),
        "Target enabled/exclusive must be booleans"
    );
    let root = Path::new(str_field(t, "root")?);
    ensure!(
        root.is_absolute() && root.is_dir(),
        "Choose an existing absolute configuration directory"
    );
    ensure!(
        !root.is_symlink(),
        "Linked configuration roots are not supported"
    );
    let canonical = root.canonicalize()?;
    for other in reg["targets"].as_array().context("targets")? {
        if other["id"] == t["id"] {
            continue;
        }
        let p = Path::new(str_field(other, "root")?).canonicalize()?;
        ensure!(
            !(canonical.starts_with(&p) || p.starts_with(&canonical)),
            "Target configuration directories overlap"
        );
    }
    Ok(())
}
fn inventories(root: &Path, reg: &Value, receipts: &Value, fresh: bool) -> Result<Value> {
    let cache = optional(&root.join("inventory.json"))?;
    let mut results = vec![];
    for target in reg["targets"].as_array().context("targets")? {
        let tid = str_field(target, "id")?;
        let inv = if matches!(target["harness"].as_str(), Some("codex" | "hermes")) && !fresh {
            cache.get(tid).filter(|v|v["target_hash"]==hash(target)).cloned().unwrap_or(json!({"target_id":tid,"complete":false,"supported":true,"error":"Run inventory scan to inspect Codex plugins","plugins":[],"fingerprint":""}))
        } else {
            native::inventory(target, receipts)
        };
        results.push(inv);
    }
    if fresh {
        let mut next = json!({});
        for (inv, t) in results.iter().zip(reg["targets"].as_array().unwrap()) {
            let mut v = inv.clone();
            v["target_hash"] = json!(hash(t));
            next[str_field(t, "id")?] = v;
        }
        write(&root.join("inventory.json"), &next)?;
    }
    Ok(json!(results))
}
fn snapshot(root: &Path, reg: &Value, receipts: &Value, fresh: bool) -> Result<Value> {
    let path = root.join("activity.json");
    let activity = if path.exists() {
        read(&path)?
    } else {
        json!([])
    };
    Ok(
        json!({"registry":reg,"inventory":inventories(root,reg,receipts,fresh)?,"activity":activity,
               "custom_instructions":instructions::states(root,reg),"sync":sync_status::load(root)?}),
    )
}
/// The revision, the settings and the sync state: what the tray and the worker need to know, and
/// nothing a full `snapshot` scans for.
fn status(root: &Path) -> Result<Value> {
    let registry = load_registry(root)?;
    Ok(
        json!({"revision":registry["revision"],"settings":registry["settings"],"sync":sync_status::load(root)?}),
    )
}
fn log(root: &Path, action: &str, status: &str, message: &str) -> Result<()> {
    let path = root.join("activity.json");
    let mut events = if path.exists() {
        read(&path)?
    } else {
        json!([])
    };
    let list = events.as_array_mut().context("Invalid activity log")?;
    list.push(event(action, status, message));
    if list.len() > ACTIVITY_LIMIT {
        list.drain(..list.len() - ACTIVITY_LIMIT);
    }
    write(&path, &events)
}
fn prepare(root: &Path, plugin: &Value, h: &str) -> Result<Value> {
    let ds = plugin["distributions"]
        .as_array()
        .context("distributions")?;
    let d = ds
        .iter()
        .find(|d| d["harness"] == h)
        .with_context(|| sources::missing(plugin, h))?;
    let custom_digest = instructions::ensure_distribution(root, plugin, d)?;
    let source = Path::new(str_field(d, "path")?);
    ensure!(
        source.is_dir(),
        "Distribution not found: {}",
        source.display()
    );
    let (_name, version) = native::identity(h, source)?;
    ensure!(
        !version.is_empty(),
        "Plugin manifest must declare its version"
    );
    ensure!(
        version == str_field(d, "version")?,
        "Distribution version differs from its manifest"
    );
    if plugin["policy"] == "pinned" {
        if plugin["upstream_revision"].is_string() && plugin["upstream_version"] != "local" {
            ensure!(
                plugin["upstream_version"] == plugin["pinned_version"],
                "Resolved upstream does not match its pin"
            );
            ensure!(
                d["source_revision"] == plugin["upstream_revision"],
                "Distribution belongs to a different upstream revision; resolve or adapt again"
            );
        } else {
            ensure!(
                plugin["pinned_version"] == version,
                "Local distribution does not match pinned version"
            );
        }
    }
    let canonical_source = source.canonicalize()?;
    ensure!(
        !root.canonicalize()?.starts_with(&canonical_source),
        "Distribution cannot contain the registry data directory"
    );
    if d["origin"] == "muro" {
        ensure!(
            d["source_revision"] == plugin["upstream_revision"],
            "AI adaptation is stale; regenerate for the current source revision"
        );
    }
    let digest = tree_hash(source)?;
    let artifact = root.join("artifacts").join(&digest).join("plugin");
    if artifact.exists() {
        ensure!(
            tree_hash(&artifact)? == digest,
            "Cached artifact is corrupt: {}",
            artifact.display()
        );
    } else {
        let parent = artifact.parent().context("artifact parent")?;
        fs::create_dir_all(parent)?;
        let tmp = tempfile::tempdir_in(parent)?;
        copy_tree(source, tmp.path())?;
        ensure!(
            tree_hash(tmp.path())? == digest,
            "Source changed during preparation"
        );
        fs::rename(tmp.path(), &artifact)?;
    }
    let native_id = native::native_id(h, str_field(plugin, "id")?, &artifact)?;
    Ok(
        json!({"source":source,"path":artifact,"digest":digest,"version":version,"native_id":native_id,
               "custom_instructions_digest":custom_digest}),
    )
}
/// A repair must restore the files, not only the version. Codex reports no install path, and
/// Hermes installs a Git clone whose `.git` is not part of the artifact, so neither is compared.
fn reinstalled_files_match(harness: &str, entry: &Value, op: &Value) -> bool {
    match entry["path"].as_str().filter(|p| !p.is_empty() && harness != "hermes") {
        Some(path) => tree_hash(Path::new(path)).ok().as_deref() == op["artifact"]["digest"].as_str(),
        None => true,
    }
}
fn retained_artifact(root: &Path, receipt: &Value, harness: &str) -> Result<Value> {
    let path = Path::new(str_field(receipt, "path")?);
    let owned = root.join("artifacts").canonicalize()?;
    ensure!(
        path.canonicalize()?.starts_with(&owned),
        "Recorded artifact is outside the registry cache"
    );
    let digest = str_field(receipt, "digest")?;
    ensure!(
        tree_hash(path)? == digest,
        "Recorded artifact is missing or changed"
    );
    let (_, version) = native::identity(harness, path)?;
    ensure!(
        version == str_field(receipt, "version")?,
        "Recorded artifact version changed"
    );
    Ok(
        json!({"source":path,"path":path,"digest":digest,"version":version,"native_id":str_field(receipt,"native_id")?,
               "custom_instructions_digest":receipt["custom_instructions_digest"]}),
    )
}
/// The optional `target_id` of a `plan` or `check` payload.
fn only_target(payload: &Value) -> Result<Option<&str>> {
    match &payload["target_id"] {
        Value::Null => Ok(None),
        v => Ok(Some(v.as_str().context("target_id must be a string")?)),
    }
}
/// The targets a plan compares: every enabled target, or only the one named.
fn planned_targets<'a>(reg: &'a Value, only: Option<&str>) -> Result<Vec<&'a Value>> {
    let targets = reg["targets"].as_array().context("targets")?;
    let Some(tid) = only else {
        return Ok(targets.iter().filter(|t| t["enabled"] == true).collect());
    };
    let target = targets
        .iter()
        .find(|t| t["id"] == tid)
        .context("Target not found")?;
    ensure!(target["enabled"] == true, "Target is disabled");
    Ok(vec![target])
}
/// Calculates a plan, stores it for `apply` and records the check. `errors` is the number of
/// sources the `check` behind it could not resolve; a plan alone has none to report.
fn check_plan(
    root: &Path,
    reg: &Value,
    receipts: &Value,
    reinstall: Option<&str>,
    only: Option<&str>,
    errors: Option<usize>,
) -> Result<Value> {
    let plan = plan(root, reg, receipts, reinstall, only)?;
    write(
        &root
            .join("plans")
            .join(format!("{}.json", str_field(&plan, "id")?)),
        &plan,
    )?;
    let checked = planned_targets(reg, only)?
        .into_iter()
        .map(|t| str_field(t, "id"))
        .collect::<Result<Vec<_>>>()?;
    sync_status::record_check(root, &plan, &checked, only.is_none(), errors)?;
    Ok(plan)
}
/// A value as a person reads it in a message: a string without its JSON quotes.
fn text(value: &Value) -> String {
    value.as_str().map_or_else(|| value.to_string(), str::to_owned)
}
fn plan(
    root: &Path,
    reg: &Value,
    receipts: &Value,
    reinstall: Option<&str>,
    only_target: Option<&str>,
) -> Result<Value> {
    let targets = planned_targets(reg, only_target)?;
    let instruction_bindings = instructions::bindings(root, reg)?;
    let invs = inventories(root, reg, receipts, true)?;
    let currency = projects::Currency::new(reg);
    let mut ops = vec![];
    let mut blockers = vec![];
    for target in targets {
        let tid = str_field(target, "id")?;
        let h = str_field(target, "harness")?;
        let inv = invs
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["target_id"] == tid)
            .unwrap();
        if inv["complete"] != true {
            blockers.push(format!("{}: {}", text(&target["name"]), text(&inv["error"])));
            continue;
        }
        let installed = inv["plugins"].as_array().context("inventory plugins")?;
        let blocked_before = blockers.len();
        let mut desired_native = vec![];
        for plugin in reg["plugins"]
            .as_array()
            .context("plugins")?
            .iter()
            .filter(|p| {
                p["targets"]
                    .as_array()
                    .is_some_and(|a| a.contains(&json!(tid)))
            })
        {
            let pid = str_field(plugin, "id")?;
            let previous = installed.iter().find(|i| i["registry_id"] == pid);
            let absent = Value::Null;
            let receipt = receipt_for(receipts, tid, pid).unwrap_or(&absent);
            // A build made from a project file that has changed since is stale, whatever else holds.
            let artifact =
                match currency.check(plugin, h).and_then(|()| if reinstall == Some(pid)
                    && previous.is_some()
                    && !receipt.is_null()
                    && receipt["adopted"] != true
                {
                    instructions::ensure_distribution(root, plugin, receipt)
                        .and_then(|_| retained_artifact(root, receipt, h))
                } else {
                    prepare(root, plugin, h)
                }) {
                    Ok(a) => a,
                    Err(e) => {
                        blockers.push(format!(
                            "{} / {}: {e:#}",
                            text(&target["name"]),
                            text(&plugin["name"])
                        ));
                        // A listed plugin whose build fails is still wanted: its copy stays.
                        if let Some(old) = previous {
                            desired_native.push(old["id"].clone());
                        }
                        continue;
                    }
                };
            if desired_native.contains(&artifact["native_id"]) {
                blockers.push(format!(
                    "{}: more than one registry plugin owns native installation {}",
                    text(&target["name"]),
                    text(&artifact["native_id"])
                ));
                continue;
            }
            desired_native.push(artifact["native_id"].clone());
            if let Some(old) = previous {
                desired_native.push(old["id"].clone());
            }
            let kind = if previous.is_none() {
                Some("install")
            } else if reinstall == Some(pid) {
                Some("reinstall")
            } else if receipt["digest"] != artifact["digest"]
                || previous.unwrap()["version"] != artifact["version"]
            {
                Some("update")
            } else if previous.unwrap()["enabled"] == false && h == "claude-code" {
                Some("activate")
            } else {
                None
            };
            if let Some(kind) = kind {
                ops.push(json!({"target_id":tid,"plugin_id":pid,"name":plugin["name"],"kind":kind,"from_version":previous.map(|i|i["version"].clone()).unwrap_or(json!("")),"to_version":artifact["version"],"reason":if kind=="install"{"Missing desired distribution"}else{"Reconcile desired artifact"},"artifact":artifact,"previous_id":previous.map(|i|i["id"].clone())}));
            }
        }
        // A plan with blockers can be applied in part, so a harness that has one gets no
        // removal until a plan finds it clear.
        if target["exclusive"] == true && blockers.len() == blocked_before {
            for old in installed {
                if !desired_native.contains(&old["id"]) {
                    ops.push(json!({"target_id":tid,"plugin_id":old["registry_id"].as_str().unwrap_or(""),"name":old["name"],"kind":"remove","from_version":old["version"],"to_version":"","reason":"Not in desired registry for this target","native_id":old["id"]}));
                }
            }
        }
    }
    ops.sort_by_key(|v| v["kind"] == "remove");
    ensure!(instructions::bindings(root, reg)? == instruction_bindings,
            "custom-instructions changed while preparing the plan; calculate a new plan");
    Ok(
        json!({"id":uuid::Uuid::new_v4().to_string(),"revision":reg["revision"],"operations":ops,"blockers":blockers,"inventory_hash":hash(&invs),"custom_instructions_hash":hash(&instruction_bindings),"created":event("plan","ready","")["time"]}),
    )
}
/// The inventory read right after an operation must be complete, or nothing can be verified.
fn observed_complete(observed: &Value) -> Result<()> {
    ensure!(
        observed["complete"] == true,
        "Replacement verification failed: {}",
        text(&observed["error"])
    );
    Ok(())
}
fn apply(root: &Path, reg: &Value, receipts: &mut Value, payload: &Value) -> Result<Value> {
    let pid = str_field(payload, "plan_id")?;
    id(pid)?;
    // With `allow_blocked` the operations that are ready run and the blockers are reported
    // as left out; `plan` gives a harness with a blocker no removal.
    let allow_blocked = match &payload["allow_blocked"] {
        Value::Null => false,
        v => v.as_bool().context("allow_blocked must be a boolean")?,
    };
    let path = root.join("plans").join(format!("{pid}.json"));
    let plan = read(&path)?;
    ensure!(
        plan["revision"] == reg["revision"],
        "Registry revision changed; calculate a new plan"
    );
    let left_out = plan["blockers"].as_array().context("blockers")?;
    ensure!(
        allow_blocked || left_out.is_empty(),
        "Plan has blockers; resolve them before applying"
    );
    let ops = plan["operations"].as_array().context("operations")?;
    // Only the harnesses this plan changes are locked, and only their configuration is
    // preserved: a harness whose folder was deleted is a blocker of the plan, never a stop
    // for the others.
    let changed: Vec<&Value> = reg["targets"]
        .as_array()
        .context("targets")?
        .iter()
        .filter(|t| ops.iter().any(|o| o["target_id"] == t["id"]))
        .collect();
    let mut target_locks = vec![];
    for target in &changed {
        let lock_path = Path::new(str_field(target, "root")?).join(".muro-plugin-writer.lock");
        ensure!(!lock_path.is_symlink(), "Linked target lock is not allowed");
        let lock = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(lock_path)
            .with_context(|| format!("Cannot lock target {}", target["name"]))?;
        lock.try_lock_exclusive()
            .context("Another Muro instance is updating this target")?;
        target_locks.push(lock);
    }
    ensure!(plan["custom_instructions_hash"] == hash(&instructions::bindings(root, reg)?),
            "custom-instructions changed since plan; calculate a new plan");
    let invs = inventories(root, reg, receipts, true)?;
    ensure!(
        hash(&invs) == str_field(&plan, "inventory_hash")?,
        "Installed inventory changed; calculate a new plan"
    );
    for op in ops.iter().filter(|o| o["kind"] != "remove") {
        let a = &op["artifact"];
        let plugin = reg["plugins"].as_array().context("plugins")?.iter()
            .find(|plugin| plugin["id"] == op["plugin_id"]).context("Plugin disappeared")?;
        instructions::ensure_distribution(root, plugin, a)?;
        ensure!(
            tree_hash(Path::new(str_field(a, "source")?))? == a["digest"]
                && tree_hash(Path::new(str_field(a, "path")?))? == a["digest"],
            "Artifact changed since plan; prepare again"
        );
    }
    // Preserve only affected configuration files, never credentials or session stores.
    for target in &changed {
        if let Ok(config) = native::config(target) {
            if config.exists() {
                write(
                    &root
                        .join("recovery")
                        .join(pid)
                        .join(format!("{}.json", str_field(target, "id")?)),
                    &json!({"path":config,"contents":read(&config)?}),
                )?;
            }
        }
    }
    let journal = root.join("journal.json");
    write(
        &journal,
        &json!({"plan_id":pid,"status":"running","completed":[]}),
    )?;
    let mut done = vec![];
    for op in ops {
        let target = reg["targets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == op["target_id"])
            .context("Target disappeared")?;
        let result = (|| -> Result<()> {
            if op["kind"] == "remove" {
                native::remove(target, str_field(op, "native_id")?)?;
                let keys: Vec<String> = receipts
                    .as_object()
                    .context("receipts")?
                    .iter()
                    .filter(|(_, r)| {
                        r["target_id"] == op["target_id"] && r["native_id"] == op["native_id"]
                    })
                    .map(|(k, _)| k.clone())
                    .collect();
                for k in keys {
                    receipts.as_object_mut().unwrap().remove(&k);
                }
            } else if op["kind"] == "activate" {
                native::activate(target, str_field(op, "previous_id")?)?;
            } else {
                let artifact = &op["artifact"];
                let native_id = native::install(
                    target,
                    str_field(op, "plugin_id")?,
                    Path::new(str_field(artifact, "path")?),
                    op["previous_id"].as_str(),
                    str_field(op, "kind")?,
                )?;
                let target_id = str_field(op, "target_id")?;
                let plugin_id = str_field(op, "plugin_id")?;
                let key = receipt_key(target_id, plugin_id);
                // Remove a legacy delimiter key for this pair while keeping other pairs intact.
                receipts
                    .as_object_mut()
                    .context("receipts")?
                    .retain(|_, r| r["target_id"] != target_id || r["plugin_id"] != plugin_id);
                receipts[&key] = json!({"target_id":op["target_id"],"plugin_id":op["plugin_id"],"native_id":native_id,"version":op["to_version"],"digest":artifact["digest"],"path":artifact["path"],"custom_instructions_digest":artifact["custom_instructions_digest"]});
            }
            if op["kind"] != "remove" {
                let observed = native::inventory(target, receipts);
                observed_complete(&observed)?;
                ensure!(
                    observed["plugins"]
                        .as_array()
                        .context("plugins")?
                        .iter()
                        .any(|p| p["registry_id"] == op["plugin_id"]
                            && p["version"] == op["to_version"]
                            && p["enabled"] != false),
                    "Replacement version/activation did not match; removals stopped"
                );
            }
            write(&root.join("receipts.json"), receipts)?;
            Ok(())
        })();
        if let Err(e) = result {
            write(
                &journal,
                &json!({"plan_id":pid,"status":"failed","completed":done,"error":format!("{e:#}")}),
            )?;
            log(root, "sync", "failed", &format!("{e:#}"))?;
            return Err(e);
        }
        done.push(op.clone());
        write(
            &journal,
            &json!({"plan_id":pid,"status":"running","completed":done}),
        )?;
    }
    let post = inventories(root, reg, receipts, true)?;
    for op in ops {
        let inv = post
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["target_id"] == op["target_id"])
            .context("Missing post-inventory")?;
        ensure!(
            inv["complete"] == true,
            "Post-install inventory failed; inspect activity and rescan"
        );
        let entries = inv["plugins"].as_array().unwrap();
        if op["kind"] == "remove" {
            ensure!(
                !entries.iter().any(|p| p["id"] == op["native_id"]),
                "Uninstall did not remove {}",
                op["name"]
            );
        } else {
            let entry = entries
                .iter()
                .find(|p| p["registry_id"] == op["plugin_id"] && p["version"] == op["to_version"])
                .with_context(|| format!("Installed version did not match {}", op["name"]))?;
            ensure!(
                op["kind"] != "reinstall"
                    || reinstalled_files_match(
                        reg["targets"]
                            .as_array()
                            .into_iter()
                            .flatten()
                            .find(|t| t["id"] == op["target_id"])
                            .and_then(|t| t["harness"].as_str())
                            .unwrap_or(""),
                        entry,
                        op
                    ),
                "Reinstalled files of {} do not match the verified artifact",
                op["name"]
            );
        }
    }
    write(
        &journal,
        &json!({"plan_id":pid,"status":"complete","completed":done}),
    )?;
    log(
        root,
        "sync",
        "complete",
        &format!("{} operations verified", ops.len()),
    )?;
    let mut synced = ops
        .iter()
        .map(|op| str_field(op, "target_id"))
        .collect::<Result<Vec<_>>>()?;
    synced.sort_unstable();
    synced.dedup();
    sync_status::record_sync(root, &synced, ops.len())?;
    let mut result = snapshot(root, reg, receipts, false)?;
    if allow_blocked {
        result["left_out"] = json!(left_out);
    }
    Ok(result)
}
fn maintenance(root: &Path, reg: &Value, receipts: &Value, p: &Value) -> Result<Value> {
    let kind = str_field(p, "kind")?;
    match kind {
        "verify" => {
            let mut details = vec![];
            for (_, r) in receipts.as_object().context("receipts")? {
                let path = Path::new(str_field(r, "path")?);
                match tree_hash(path) {
                    Ok(h) if r["digest"] == h => details.push(format!(
                        "{} / {}: artifact intact",
                        r["target_id"], r["plugin_id"]
                    )),
                    _ => details.push(format!(
                        "{} / {}: artifact missing or changed; resolve and reinstall",
                        r["target_id"], r["plugin_id"]
                    )),
                }
            }
            let inv = inventories(root, reg, receipts, true)?;
            for i in inv.as_array().unwrap() {
                if i["complete"] != true {
                    details.push(format!("Inventory error: {}", text(&i["error"])));
                }
            }
            Ok(json!({"message":"Artifact and inventory inspection complete","details":details}))
        }
        "cleanup" => {
            let mut removed = vec![];
            let dir = root.join("artifacts");
            if dir.exists() {
                for e in fs::read_dir(&dir)? {
                    let e = e?;
                    let name = e.file_name().to_string_lossy().to_string();
                    if !receipts
                        .as_object()
                        .unwrap()
                        .values()
                        .any(|r| r["digest"] == name)
                    {
                        ensure!(
                            name.len() == 64
                                && name.chars().all(|c| c.is_ascii_hexdigit())
                                && !e.path().is_symlink(),
                            "Unexpected artifact directory"
                        );
                        let resolved = e.path().canonicalize()?;
                        ensure!(
                            resolved.starts_with(dir.canonicalize()?),
                            "Artifact outside cache"
                        );
                        fs::remove_dir_all(resolved)?;
                        removed.push(name);
                    }
                }
            }
            log(
                root,
                "maintenance",
                "complete",
                "Unused artifacts removed; existing plans must be recalculated",
            )?;
            Ok(
                json!({"message":format!("Removed {} unused artifacts",removed.len()),"details":removed}),
            )
        }
        _ => bail!("Unknown maintenance action"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_failed_verification_gives_the_error_as_text_not_as_a_json_value() {
        let observed = json!({"complete":false,"error":r"Target configuration directory does not exist: C:\gone"});
        assert_eq!(
            observed_complete(&observed).unwrap_err().to_string(),
            r"Replacement verification failed: Target configuration directory does not exist: C:\gone"
        );
        assert!(observed_complete(&json!({"complete":true,"error":null})).is_ok());
    }
    #[test]
    fn the_digest_of_an_installed_copy_is_its_folder_hash_or_none_when_there_is_no_folder() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("SKILL.md"), "INSTALLED").unwrap();
        let digest = tree_hash(tmp.path()).unwrap();
        assert_eq!(installed_digest(&json!({"path":tmp.path()})), digest);
        // Codex reports no folder, a folder that is gone is none either: the plan then updates.
        for path in [json!(""), json!(null), json!(tmp.path().join("gone"))] {
            assert_eq!(installed_digest(&json!({"path":path})), "");
        }
        assert_eq!(installed_digest(&json!({})), "");
    }
    #[test]
    fn reinstall_check_compares_installed_files_with_the_artifact() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("SKILL.md"), "ORIGINAL").unwrap();
        let op = json!({"artifact":{"digest":tree_hash(tmp.path()).unwrap()}});
        let entry = json!({"path":tmp.path()});
        assert!(reinstalled_files_match("claude-code", &entry, &op));
        fs::write(tmp.path().join("SKILL.md"), "BROKEN").unwrap();
        assert!(!reinstalled_files_match("claude-code", &entry, &op));
        assert!(!reinstalled_files_match("claude-code", &json!({"path":tmp.path().join("missing")}), &op));
        assert!(reinstalled_files_match("codex", &json!({"path":""}), &op));
        assert!(reinstalled_files_match("hermes", &entry, &op));
    }
}
