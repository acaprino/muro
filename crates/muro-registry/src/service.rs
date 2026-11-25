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
        "take_over" => {
            revision(&registry, &payload)?;
            let before = receipts.clone();
            if !take_over(data_dir, &mut registry, &mut receipts, &payload)? {
                return snapshot(data_dir, &registry, &receipts, false);
            }
            write(&data_dir.join("receipts.json"), &receipts)?;
            if let Err(error) = save_registry(data_dir, &mut registry) {
                // The registry was not saved: the copy stays whose it was.
                let _ = write(&data_dir.join("receipts.json"), &before);
                return Err(error);
            }
            log(data_dir, action, "complete", "Installed copy taken over")?;
            // Codex and Hermes are read from the last scan unless asked: it still names the old owner.
            snapshot(data_dir, &registry, &receipts, true)
        }
        "save_plugin" | "remove_plugin" | "save_target" | "remove_target" | "settings"
        | "save_projects" | "remove_project" => {
            revision(&registry, &payload)?;
            // The receipt written for an adopted installation, until the registry is saved.
            let mut adopted = None;
            let mut removed_target = None;
            let mut cleared_receipts = false;
            match action {
                "save_plugin" => {
                    let p = payload["plugin"].clone();
                    validate_plugin(&p, &registry)?;
                    instructions::directory(data_dir, &p)?;
                    if let Some(expected) = payload.get("expected_custom_instructions_digest") {
                        instructions_unchanged(data_dir, &p, expected)?;
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
                    // Its receipts go with it: left behind they keep its copies managed, out of
                    // "Installed, not in your list" and out of reach of an adoption.
                    if let Some(all) = receipts.as_object_mut() {
                        let before = all.len();
                        all.retain(|_, r| r["plugin_id"] != key);
                        cleared_receipts = all.len() != before;
                    }
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
            if cleared_receipts {
                write(&data_dir.join("receipts.json"), &receipts)?;
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
            // Codex and Hermes are read from the last scan unless asked: that scan still shows
            // the copies of a removed plugin as managed.
            snapshot(data_dir, &registry, &receipts, cleared_receipts)
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
        // The result of an AI adaptation is merged into the plugin as it is now, so a registry
        // that changed while the job ran (a setting, a rename) does not discard the run. The
        // caller carries no revision: only the plugin's source and revision must still be the ones
        // the job started from.
        "register_distributions" => {
            let key = str_field(&payload, "id")?;
            id(key)?;
            let index = registry["plugins"]
                .as_array()
                .context("plugins")?
                .iter()
                .position(|p| p["id"] == key)
                .context("Plugin not found")?;
            let plugin = registry["plugins"][index].clone();
            ensure!(
                plugin["source"] == payload["source"]
                    && plugin["upstream_revision"] == payload["upstream_revision"],
                "The plugin's source changed during adaptation; adapt again"
            );
            instructions_unchanged(
                data_dir,
                &plugin,
                &payload["expected_custom_instructions_digest"],
            )?;
            let digest = str_field(&payload, "expected_custom_instructions_digest")?;
            let asked = str_field(&payload, "asked")?;
            let version = str_field(&payload, "version")?;
            let adapters = payload["adapters"]
                .as_array()
                .context("adapters must be an array")?;
            let current = plugin["distributions"]
                .as_array()
                .context("distributions")?;
            let merged = merged_distributions(
                current,
                adapters,
                asked,
                version,
                &plugin["upstream_revision"],
                digest,
            );
            let mut updated = plugin;
            updated["distributions"] = json!(merged);
            validate_plugin(&updated, &registry)?;
            registry["plugins"][index] = updated;
            save_registry(data_dir, &mut registry)?;
            log(
                data_dir,
                action,
                "complete",
                "Adapter distributions recorded",
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
/// installs. An entry with no folder (a Codex copy outside the cache Muro reads) gives none, and the
/// plan then takes the copy for an older one and updates it.
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
/// is installed there, when it belongs to a plugin of the list already, when the harness records
/// it without its files, or when the plugin is not a new one that lists the target. Returns the
/// receipt's key; the caller saves the plugin.
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
    // A harness that records a copy whose files are gone cannot hand it to the list: the receipt
    // would describe a folder that is not there.
    ensure!(
        entry["present"] != false,
        "{native_id} has no files on {name}; reinstall it there or remove it"
    );
    let receipt = adopted_receipt(root, target_id, plugin, entry)?;
    let key = receipt_key(target_id, plugin_id);
    let all = receipts.as_object_mut().context("receipts")?;
    // A legacy delimiter key for this pair goes, as at an install.
    all.retain(|_, r| r["target_id"] != target_id || r["plugin_id"] != plugin_id);
    all.insert(key.clone(), receipt);
    write(&root.join("receipts.json"), receipts)?;
    Ok(key)
}
/// The receipt that binds `plugin` to `entry`, a copy on `target_id` that Muro did not install for
/// it: written as an install by Muro leaves it, with the version and digest of the copy that is there,
/// and marked adopted (a copy the person switched off is not switched on again).
fn adopted_receipt(root: &Path, target_id: &str, plugin: &Value, entry: &Value) -> Result<Value> {
    Ok(json!({"target_id":target_id,"plugin_id":plugin["id"],"native_id":entry["id"],
        "version":entry["version"],"digest":installed_digest(entry),"path":entry["path"],
        "custom_instructions_digest":instructions::read(root, plugin)?.digest(),
        "adopted":true}))
}
/// `take_over {plugin_id, target_id, name}`: the copy installed on the target under the native name
/// `name` (`plugin_name` of its inventory entry) becomes the plugin's, so the next plan replaces it with
/// the plugin's build (an update) instead of installing a second copy of the same plugin beside it. The
/// copy may be one the person installed, or one another plugin of the list holds: that plugin then lets
/// the target go, since one copy has one owner. The plugin must list the target. Nothing changes, and
/// `false` is returned, when the harness cannot be read, the plugin has a copy of its own there or no
/// copy of that name is there with its files. The caller saves the registry and the receipts.
fn take_over(root: &Path, registry: &mut Value, receipts: &mut Value, payload: &Value) -> Result<bool> {
    let plugin_id = str_field(payload, "plugin_id")?;
    let target_id = str_field(payload, "target_id")?;
    let name = str_field(payload, "name")?;
    let target = registry["targets"]
        .as_array()
        .context("targets")?
        .iter()
        .find(|t| t["id"] == target_id)
        .cloned()
        .context("Target not found")?;
    let inventory = native::inventory(&target, receipts);
    // A harness that cannot be read has its blocker in the next plan; once it reads, installing the
    // project there again takes the copy over.
    if inventory["complete"] != true {
        return Ok(false);
    }
    let entries = inventory["plugins"].as_array().context("inventory plugins")?;
    claim(root, registry, receipts, plugin_id, target_id, name, entries)
}
/// What `take_over` does with the entries of the target's inventory, as `native::inventory` gives them.
fn claim(
    root: &Path,
    registry: &mut Value,
    receipts: &mut Value,
    plugin_id: &str,
    target_id: &str,
    name: &str,
    entries: &[Value],
) -> Result<bool> {
    let plugin = registry["plugins"]
        .as_array()
        .context("plugins")?
        .iter()
        .find(|p| p["id"] == plugin_id)
        .cloned()
        .with_context(|| format!("{plugin_id} is not in your list"))?;
    let label = registry["targets"]
        .as_array()
        .context("targets")?
        .iter()
        .find(|t| t["id"] == target_id)
        .map(|t| text(&t["name"]))
        .context("Target not found")?;
    ensure!(
        plugin["targets"].as_array().context("targets")?.contains(&json!(target_id)),
        "{} must list {label} to take over the copy there",
        text(&plugin["name"])
    );
    if entries.iter().any(|e| e["registry_id"] == plugin_id) {
        return Ok(false);
    }
    let Some(entry) = entries
        .iter()
        .find(|e| e["plugin_name"] == name && e["present"] != false)
    else {
        return Ok(false);
    };
    if let Some(owner) = entry["registry_id"].as_str() {
        for other in registry["plugins"].as_array_mut().context("plugins")? {
            if other["id"] == owner {
                if let Some(targets) = other["targets"].as_array_mut() {
                    targets.retain(|t| t.as_str() != Some(target_id));
                }
            }
        }
    }
    let receipt = adopted_receipt(root, target_id, &plugin, entry)?;
    let all = receipts.as_object_mut().context("receipts")?;
    // The old owner's receipt for the copy goes, and so does any older one of the plugin there.
    all.retain(|_, r| {
        r["target_id"] != target_id || (r["native_id"] != entry["id"] && r["plugin_id"] != plugin_id)
    });
    all.insert(receipt_key(target_id, plugin_id), receipt);
    Ok(true)
}
/// A job that read a plugin's custom instructions before it ran records its result only while
/// the folder still holds what it read: `expected` is the digest it took.
fn instructions_unchanged(root: &Path, plugin: &Value, expected: &Value) -> Result<()> {
    ensure!(
        expected.as_str() == Some(instructions::read(root, plugin)?.digest().as_str()),
        "custom-instructions changed during adaptation; regenerate before recording"
    );
    Ok(())
}
/// The distributions of a plugin once an adaptation for the harness `asked` has built `adapters`
/// (`harness`, `path`), in the order given. A harness takes the adapter when it is the one asked
/// for, when the plugin has no distribution for it, or when its distribution is an earlier
/// adaptation (`origin` `muro`); any other distribution, one found in the source or entered by a
/// person, is left as it is. The adapter replaces a distribution in its place and is added at the
/// end otherwise. `revision` is the upstream revision the adaptation was made from and `digest` the
/// custom instructions it read.
pub fn merged_distributions(
    current: &[Value],
    adapters: &[Value],
    asked: &str,
    version: &str,
    revision: &Value,
    digest: &str,
) -> Vec<Value> {
    let mut all = current.to_vec();
    for adapter in adapters {
        let harness = &adapter["harness"];
        let existing = all.iter().position(|d| d["harness"] == *harness);
        let takes = harness.as_str() == Some(asked)
            || existing.is_none_or(|at| all[at]["origin"] == "muro");
        if !takes {
            continue;
        }
        let built = json!({"harness":harness,"path":adapter["path"],"version":version,"origin":"muro",
            "source_revision":revision,"custom_instructions_digest":digest});
        match existing {
            Some(at) => all[at] = built,
            None => all.push(built),
        }
    }
    all
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
    let (name, version) = native::distribution_identity(h, source, d)?;
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
    let native_id = native::native_id(h, str_field(plugin, "id")?, &name, &artifact)?;
    Ok(
        json!({"source":source,"path":artifact,"digest":digest,"name":name,"version":version,"native_id":native_id,
               "custom_instructions_digest":custom_digest}),
    )
}
/// A repair must restore the files, not only the version. An entry with no folder cannot be
/// compared, and Hermes installs a Git clone whose `.git` is not part of the artifact, so it is not.
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
    // A receipt written before receipts kept the name has a plugin whose manifest names it.
    let (name, version) = native::distribution_identity(harness, path, receipt)
        .context("Recorded artifact version changed")?;
    Ok(
        json!({"source":path,"path":path,"digest":digest,"name":name,"version":version,"native_id":str_field(receipt,"native_id")?,
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
            // An entry that reports no `present` has its files, as a harness that cannot tell does.
            let files_missing = previous.is_some_and(|old| old["present"] == false);
            let mut reason = if previous.is_none() {
                "Missing desired distribution"
            } else {
                "Reconcile desired artifact"
            };
            // Only a copy Muro installed is switched on again: a person who adopted a copy and
            // disabled it chose that.
            let kind = if previous.is_none() {
                Some("install")
            } else if reinstall == Some(pid) {
                Some("reinstall")
            } else if receipt["digest"] != artifact["digest"]
                || previous.unwrap()["version"] != artifact["version"]
            {
                Some("update")
            } else if previous.unwrap()["enabled"] == false
                && h == "claude-code"
                && !receipt.is_null()
                && receipt["adopted"] != true
            {
                Some("activate")
            } else if files_missing {
                reason = "Files missing";
                Some("update")
            } else {
                None
            };
            if let Some(kind) = kind {
                ops.push(json!({"target_id":tid,"plugin_id":pid,"name":plugin["name"],"kind":kind,"from_version":previous.map(|i|i["version"].clone()).unwrap_or(json!("")),"to_version":artifact["version"],"reason":reason,"artifact":artifact,"previous_id":previous.map(|i|i["id"].clone())}));
            }
        }
        // A plan with blockers can be applied in part, so a harness that has one gets no
        // removal until a plan finds it clear.
        if target["exclusive"] == true && blockers.len() == blocked_before {
            for old in installed {
                if !desired_native.contains(&old["id"]) {
                    let mut removal = json!({"target_id":tid,"plugin_id":old["registry_id"].as_str().unwrap_or(""),"name":old["name"],"kind":"remove","from_version":old["version"],"to_version":"","reason":"Not in desired registry for this target","native_id":old["id"]});
                    // A record whose files are gone is cleared, not uninstalled: the sheet says so.
                    if old["present"] == false {
                        removal["present"] = json!(false);
                    }
                    ops.push(removal);
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
/// The inventory read right after an install, an update or an activation must hold the plugin at
/// the version the operation set out to leave, switched on.
fn installed_as_planned(observed: &Value, op: &Value) -> Result<()> {
    observed_complete(observed)?;
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
    Ok(())
}
/// What `apply` answers: the snapshot, the blockers it left out when it was allowed to leave
/// them, and the number of removals it was asked to skip.
fn applied_snapshot(
    root: &Path,
    reg: &Value,
    receipts: &Value,
    left_out: Option<&[Value]>,
    skipped_removals: usize,
) -> Result<Value> {
    let mut result = snapshot(root, reg, receipts, false)?;
    if let Some(left_out) = left_out {
        result["left_out"] = json!(left_out);
    }
    result["skipped_removals"] = json!(skipped_removals);
    Ok(result)
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
    // With `skip_removals` the removals of the plan are left alone and counted in the answer.
    let skip_removals = match &payload["skip_removals"] {
        Value::Null => false,
        v => v.as_bool().context("skip_removals must be a boolean")?,
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
    // A plan that uninstalls runs only when the request names how many plugins it uninstalls:
    // a caller that has not read the plan, or does not know the field, removes nothing.
    let removals = ops.iter().filter(|o| o["kind"] == "remove").count();
    let noun = if removals == 1 { "plugin" } else { "plugins" };
    ensure!(
        skip_removals
            || removals == 0
            || payload["confirm_removals"].as_u64() == Some(removals as u64),
        "This plan uninstalls {removals} {noun}; review it and confirm the removals"
    );
    let skipped = if skip_removals { removals } else { 0 };
    let executed: Vec<&Value> = ops
        .iter()
        .filter(|o| !skip_removals || o["kind"] != "remove")
        .collect();
    if executed.is_empty() {
        return applied_snapshot(
            root,
            reg,
            receipts,
            allow_blocked.then_some(left_out.as_slice()),
            skipped,
        );
    }
    // Only the harnesses this plan changes are locked, and only their configuration is
    // preserved: a harness whose folder was deleted is a blocker of the plan, never a stop
    // for the others.
    let changed: Vec<&Value> = reg["targets"]
        .as_array()
        .context("targets")?
        .iter()
        .filter(|t| executed.iter().any(|o| o["target_id"] == t["id"]))
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
    for op in executed.iter().copied().filter(|o| o["kind"] != "remove") {
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
    for &op in &executed {
        let target = reg["targets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"] == op["target_id"])
            .context("Target disappeared")?;
        let result = (|| -> Result<()> {
            // Whether this install is the first record of the plugin on the target.
            let mut first_install = false;
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
                let path = Path::new(str_field(artifact, "path")?);
                let name = match artifact["name"].as_str() {
                    Some(name) => name.to_owned(),
                    // A plan made before artifacts carried the name: its plugin's manifest names it.
                    None => native::identity(str_field(target, "harness")?, path)?.0,
                };
                let native_id = native::install(
                    target,
                    str_field(op, "plugin_id")?,
                    path,
                    (&name, str_field(artifact, "version")?),
                    op["previous_id"].as_str(),
                    str_field(op, "kind")?,
                )?;
                let target_id = str_field(op, "target_id")?;
                let plugin_id = str_field(op, "plugin_id")?;
                let key = receipt_key(target_id, plugin_id);
                first_install = receipt_for(receipts, target_id, plugin_id).is_none();
                // Remove a legacy delimiter key for this pair while keeping other pairs intact.
                receipts
                    .as_object_mut()
                    .context("receipts")?
                    .retain(|_, r| r["target_id"] != target_id || r["plugin_id"] != plugin_id);
                receipts[&key] = json!({"target_id":op["target_id"],"plugin_id":op["plugin_id"],"native_id":native_id,"name":name,"version":op["to_version"],"digest":artifact["digest"],"path":artifact["path"],"custom_instructions_digest":artifact["custom_instructions_digest"]});
            }
            if op["kind"] != "remove" {
                let observed = native::inventory(target, receipts);
                if let Err(e) = installed_as_planned(&observed, op) {
                    // A first install that fails its check is on the machine all the same: with
                    // no receipt nothing would know it is Muro's. An update keeps the receipt of
                    // the version it replaced, the file as it is, so a reinstall can restore it.
                    if first_install {
                        let _ = write(&root.join("receipts.json"), receipts);
                    }
                    return Err(e);
                }
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
    for &op in &executed {
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
        &format!("{} operations verified", executed.len()),
    )?;
    let mut synced = executed
        .iter()
        .copied()
        .map(|op| str_field(op, "target_id"))
        .collect::<Result<Vec<_>>>()?;
    synced.sort_unstable();
    synced.dedup();
    sync_status::record_sync(root, &synced, executed.len())?;
    applied_snapshot(
        root,
        reg,
        receipts,
        allow_blocked.then_some(left_out.as_slice()),
        skipped,
    )
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
        // An entry with no folder, or one whose folder is gone, has none: the plan then updates.
        for path in [json!(""), json!(null), json!(tmp.path().join("gone"))] {
            assert_eq!(installed_digest(&json!({"path":path})), "");
        }
        assert_eq!(installed_digest(&json!({})), "");
    }
    #[test]
    fn a_copy_of_the_same_name_is_taken_over_from_the_person_or_from_another_plugin_once() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let copy = root.join("cache/sample/sample/0.6.0");
        fs::create_dir_all(&copy).unwrap();
        fs::write(copy.join("SKILL.md"), "PUBLISHED").unwrap();
        let mut registry = json!({"targets":[{"id":"cc","name":"Claude Code"},{"id":"cx","name":"Codex"}],"plugins":[
            {"id":"sample","name":"Sample","targets":["cc","cx"]},
            {"id":"adopted","name":"sample","targets":["cc","cx"]}]});
        let entry = |registry_id: Option<&str>| {
            let mut e = json!({"id":"sample@sample","name":"sample@sample","plugin_name":"sample",
                "version":"0.6.0","path":copy.to_string_lossy(),"managed":registry_id.is_some()});
            if let Some(owner) = registry_id { e["registry_id"] = json!(owner); }
            e
        };
        // Held by another plugin of the list: it lets that harness go, and its receipt goes with it.
        let mut receipts = json!({});
        for target in ["cc", "cx"] {
            receipts[receipt_key(target, "adopted")] =
                json!({"target_id":target,"plugin_id":"adopted","native_id":"sample@sample"});
        }
        assert!(claim(root, &mut registry, &mut receipts, "sample", "cc", "sample", &[entry(Some("adopted"))]).unwrap());
        assert_eq!(registry["plugins"][1]["targets"], json!(["cx"]), "only that harness");
        let all = receipts.as_object().unwrap();
        assert_eq!(all.len(), 2, "{receipts}");
        let taken = &receipts[receipt_key("cc", "sample")];
        assert_eq!((taken["native_id"].as_str(), taken["version"].as_str(), taken["adopted"].as_bool()), (Some("sample@sample"), Some("0.6.0"), Some(true)));
        assert_eq!(taken["digest"], json!(tree_hash(&copy).unwrap()));
        assert_eq!(receipts[receipt_key("cx", "adopted")]["plugin_id"], "adopted", "the other harness is untouched");
        // A copy the person installed, that no plugin of the list holds.
        assert!(claim(root, &mut registry, &mut receipts, "sample", "cx", "sample", &[entry(None)]).unwrap());
        assert_eq!(receipts[receipt_key("cx", "sample")]["plugin_id"], "sample");
        // Nothing to take: the plugin has its own copy there, the name differs, or the files are gone.
        let before = (registry.clone(), receipts.clone());
        let mut gone = entry(None);
        gone["present"] = json!(false);
        for entries in [vec![entry(Some("sample")), entry(None)], vec![entry(None)], vec![gone]] {
            let name = if entries.len() == 1 && entries[0]["present"] != false { "other" } else { "sample" };
            assert!(!claim(root, &mut registry, &mut receipts, "sample", "cx", name, &entries).unwrap());
        }
        assert_eq!((registry.clone(), receipts.clone()), before);
        // A plugin that does not list the harness takes nothing there.
        registry["plugins"][0]["targets"] = json!(["cx"]);
        let error = claim(root, &mut registry, &mut receipts, "sample", "cc", "sample", &[entry(None)]).unwrap_err();
        assert_eq!(error.to_string(), "Sample must list Claude Code to take over the copy there");
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
    #[test]
    fn a_claude_code_plugin_without_a_manifest_is_prepared_under_its_resolved_name_and_version() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path().join("data");
        let source = tmp.path().join("ay");
        fs::create_dir_all(&data).unwrap();
        fs::create_dir_all(source.join("skills/hello")).unwrap();
        fs::write(source.join("skills/hello/SKILL.md"), "Say hello.").unwrap();
        let plugin = json!({"id":"p1","name":"Ay","policy":"head","distributions":[
            {"harness":"claude-code","path":source,"name":"ay","version":"0123456789ab","origin":"native"}]});
        let artifact = prepare(&data, &plugin, "claude-code").unwrap();
        assert_eq!(artifact["name"], "ay");
        assert_eq!(artifact["version"], "0123456789ab");
        assert_eq!(artifact["native_id"], "ay@muro-p1");
        // The receipt keeps the name, so a reinstall of the retained copy needs no manifest either.
        let receipt = json!({"path":artifact["path"],"digest":artifact["digest"],"native_id":"ay@muro-p1",
            "name":"ay","version":"0123456789ab"});
        let retained = retained_artifact(&data, &receipt, "claude-code").unwrap();
        assert_eq!(retained["name"], "ay");
        assert_eq!(retained["version"], "0123456789ab");
    }
}
