use crate::storage::*;
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub fn supported(h: &str) -> bool {
    matches!(h, "claude-code" | "codex" | "opencode" | "pi" | "hermes")
}
pub fn config(target: &Value) -> Result<PathBuf> {
    let root = Path::new(str_field(target, "root")?);
    Ok(root.join(match str_field(target, "harness")? {
        "opencode" => "opencode.json",
        "pi" => "settings.json",
        _ => bail!("No direct configuration adapter"),
    }))
}
pub fn command(
    exe: &str,
    args: &[String],
    env: Option<(&str, &str)>,
    cwd: Option<&Path>,
) -> Result<String> {
    ensure!(!exe.trim().is_empty(), "Harness executable is missing");
    ensure!(
        !exe.ends_with(".cmd") && !exe.ends_with(".bat") && !exe.ends_with(".ps1"),
        "Choose a native executable (for npm harnesses use a verified Node launcher)"
    );
    let mut c = Command::new(exe);
    c.args(args.iter().map(|s| native_arg(s)))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some((k, v)) = env {
        c.env(k, native_arg(v));
    }
    if let Some(p) = cwd {
        c.current_dir(p);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    let mut child = c.spawn().with_context(|| format!("Cannot run {exe}"))?;
    let out = child.stdout.take().context("stdout")?;
    let err = child.stderr.take().context("stderr")?;
    let reader = |mut r: Box<dyn std::io::Read + Send>| {
        thread::spawn(move || {
            let mut s = String::new();
            let _ = r.read_to_string(&mut s);
            s
        })
    };
    let stdout = reader(Box::new(out));
    let stderr = reader(Box::new(err));
    let deadline = Instant::now() + Duration::from_secs(120);
    let status = loop {
        if let Some(s) = child.try_wait()? {
            break s;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!("Command timed out after 120 seconds")
        }
        thread::sleep(Duration::from_millis(30));
    };
    let stdout = stdout.join().unwrap_or_default();
    let stderr = stderr.join().unwrap_or_default();
    ensure!(
        status.success(),
        "{REFUSED}{}",
        if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        }
    );
    Ok(stdout)
}
/// How the error of a harness command that ran and failed starts.
const REFUSED: &str = "Harness command failed: ";
/// Whether the harness ran the command and failed it: not an executable that is missing, nor a
/// command that timed out.
fn refused(error: &anyhow::Error) -> bool {
    error.to_string().starts_with(REFUSED)
}
fn native_arg(value: &str) -> String {
    if let Some(rest) = value.strip_prefix("\\\\?\\UNC\\") {
        return format!("\\\\{rest}");
    }
    value
        .strip_prefix("\\\\?\\")
        .or_else(|| value.strip_prefix("//?/"))
        .unwrap_or(value)
        .to_owned()
}
fn run(target: &Value, args: &[String]) -> Result<String> {
    let h = str_field(target, "harness")?;
    let env = match h {
        "claude-code" => "CLAUDE_CONFIG_DIR",
        "codex" => "CODEX_HOME",
        "pi" => "PI_CODING_AGENT_DIR",
        "hermes" => "HERMES_HOME",
        _ => bail!("No command adapter for {h}"),
    };
    command(
        str_field(target, "executable")?,
        args,
        Some((env, str_field(target, "root")?)),
        None,
    )
}
pub fn inventory(target: &Value, receipts: &Value) -> Value {
    let tid = target["id"].as_str().unwrap_or("");
    let h = target["harness"].as_str().unwrap_or("");
    let result = scan(target).map(|(mut entries, fingerprint, broken)| {
        let warnings: Vec<&Value> = broken.iter().map(|b| &b["message"]).collect();
        for p in &mut entries {
            let name = plugin_name(h, p);
            p["plugin_name"] = name;
        }
        let mut inventory = json!({"target_id":tid,"complete":true,"supported":supported(h),"error":null,"warnings":warnings,"broken":broken,"plugins":entries,"fingerprint":fingerprint});
        bind_receipts(&mut inventory, tid, receipts);
        inventory
    });
    match result {
        Ok(v) => v,
        Err(e) => {
            json!({"target_id":tid,"complete":false,"supported":supported(h),"error":format!("{e:#}"),"warnings":[],"broken":[],"plugins":[],"fingerprint":""})
        }
    }
}
/// Ownership belongs to the registry. A cached observation of the host's files must show
/// the same owners as a fresh scan after an adoption, takeover or removal from the list.
pub(crate) fn bind_receipts(inventory: &mut Value, target_id: &str, receipts: &Value) {
    let Some(plugins) = inventory["plugins"].as_array_mut() else { return };
    for plugin in plugins {
        let Some(fields) = plugin.as_object_mut() else { continue };
        fields.remove("registry_id");
        fields.remove("receipt_id");
        fields.remove("component");
        plugin["managed"] = json!(false);
        if let Some((key, receipt)) = receipts.as_object().into_iter().flatten().find(|(_, r)| {
            r["target_id"] == target_id && r["native_id"] == plugin["id"]
        }) {
            plugin["managed"] = json!(true);
            plugin["registry_id"] = receipt["plugin_id"].clone();
            plugin["receipt_id"] = json!(key);
            if let Some(component) = receipt.get("component") {
                plugin["component"] = component.clone();
            }
        }
    }
}
/// What is installed on the target, the fingerprint of what was read, and what is broken: what the
/// harness holds that it cannot load itself and Muro read around (`codex_broken_marketplaces`), each
/// `{"name","message","plugins"}`: the marketplace, the sentence for the person, and the ids of the
/// plugins the harness has configured from it. The inventory carries them as `broken`, and their
/// sentences as `warnings`.
fn scan(target: &Value) -> Result<(Vec<Value>, String, Vec<Value>)> {
    let h = str_field(target, "harness")?;
    ensure!(
        supported(h),
        "Plugin installation adapter not available for {h}"
    );
    let root = Path::new(str_field(target, "root")?);
    ensure!(
        root.is_dir(),
        "Target configuration directory does not exist: {}",
        root.display()
    );
    ensure!(
        !root.is_symlink(),
        "Linked configuration roots are not supported"
    );
    match h {
        "opencode" | "pi" => {
            let cfg = config(target)?;
            ensure!(
                !cfg.is_symlink(),
                "Linked configuration file is not supported"
            );
            if h == "opencode" {
                ensure!(
                    !root.join("opencode.jsonc").exists(),
                    "opencode.jsonc requires reconciliation before this JSON adapter can manage the target"
                );
            }
            let value = optional(&cfg)?;
            let key = if h == "pi" { "packages" } else { "plugins" };
            let entries=match value.get(key){None=>vec![],Some(v)=>v.as_array().context("Plugin list must be an array")?.iter().map(|v|{let s=v.as_str().or_else(||v["source"].as_str()).context("Plugin entry must be a string or an object with source")?;let local=local_path(s,root);let version=local.as_deref().and_then(|p|optional(&p.join("package.json")).ok()).and_then(|v|v["version"].as_str().map(String::from)).unwrap_or_default();Ok(json!({"id":s,"name":s,"version":version,"path":local.map(|p|p.to_string_lossy().to_string()).unwrap_or_default(),"managed":false}))}).collect::<Result<Vec<_>>>()?};
            Ok((entries, hash(&value), vec![]))
        }
        "claude-code" => {
            let path = root.join("plugins/installed_plugins.json");
            let doc = optional(&path)?;
            let listed: Value = serde_json::from_str(&run(
                target,
                &["plugin".into(), "list".into(), "--json".into()],
            )?)
            .context("Claude plugin list did not return JSON")?;
            let listed = listed.as_array().context("Expected Claude plugin array")?;
            let entries = claude_entries(&doc, listed)?;
            Ok((entries, hash(&json!({"installed":doc,"list":listed})), vec![]))
        }
        "hermes" => {
            let output = run(
                target,
                &[
                    "plugins".into(),
                    "list".into(),
                    "--user".into(),
                    "--json".into(),
                ],
            )?;
            let doc: Value =
                serde_json::from_str(&output).context("Hermes plugins list did not return JSON")?;
            let list = doc.as_array().context("Expected Hermes plugin array")?;
            let entries=list.iter().map(|p|json!({"id":p["name"],"name":p["name"],"version":p["version"],"path":root.join("plugins").join(p["name"].as_str().unwrap_or("")),"enabled":p["status"]=="enabled","managed":false})).collect();
            Ok((entries, hash(&doc), vec![]))
        }
        "codex" => {
            let output = match run(target, &["plugin".into(), "list".into(), "--json".into()]) {
                Ok(output) => output,
                // Codex refuses the whole list when one configured marketplace cannot be loaded, and
                // still starts, adds and removes (read on codex-cli 0.169.0): its files are read instead,
                // and the marketplace is named. Any other refusal stays the error it was.
                Err(refusal) => {
                    let config = match codex_config(root) {
                        Ok(config) if refused(&refusal) => config,
                        _ => return Err(refusal),
                    };
                    let broken: Vec<Value> =
                        codex_broken_marketplaces(&config, &format!("{refusal:#}"))
                            .into_iter()
                            .map(|(name, message)| {
                                let plugins = codex_plugins_of(&config, &name);
                                json!({"name":name,"message":message,"plugins":plugins})
                            })
                            .collect();
                    if broken.is_empty() {
                        return Err(refusal);
                    }
                    let rows = codex_rows(&config, root);
                    let fingerprint = hash(&json!({"files":rows,"broken":broken}));
                    return Ok((codex_entries(&rows, root), fingerprint, broken));
                }
            };
            let doc: Value =
                serde_json::from_str(&output).context("Codex plugin list did not return JSON")?;
            let list = doc["installed"]
                .as_array()
                .context("Missing Codex installed array")?;
            Ok((codex_entries(list, root), hash(&doc["installed"]), vec![]))
        }
        _ => unreachable!(),
    }
}
/// The user-scope entries of Claude Code's `installed_plugins.json` (`installed`), each with the
/// enabled state of its row in `claude plugin list --json` (`listed`) and `present`, whether the
/// folder it records exists. The command returns one row per scope: the entry takes the user-scope
/// row, or the first row of its id when none says its scope.
fn claude_entries(installed: &Value, listed: &[Value]) -> Result<Vec<Value>> {
    let mut entries = vec![];
    if let Some(plugins) = installed.get("plugins") {
        for (id, installs) in plugins
            .as_object()
            .context("Invalid Claude installed plugins")?
        {
            for p in installs.as_array().context("Invalid Claude install list")? {
                if p["scope"] != "user" {
                    continue;
                }
                let path = p["installPath"].as_str().unwrap_or("");
                let present = !path.is_empty() && Path::new(path).is_dir();
                entries.push(json!({"id":id,"name":id,"version":p["version"].as_str().unwrap_or(""),"path":path,"managed":false,"present":present}));
            }
        }
    }
    for entry in &mut entries {
        let id = entry["id"].as_str().unwrap_or("");
        let row = listed
            .iter()
            .find(|p| (p["id"] == id || p["name"] == id) && p["scope"] == "user")
            .or_else(|| listed.iter().find(|p| p["id"] == id || p["name"] == id))
            .with_context(|| format!("Claude plugin {id} missing from CLI inventory"))?;
        entry["enabled"] = row["enabled"]
            .as_bool()
            .context("Claude plugin list omitted enabled state")?
            .into();
    }
    Ok(entries)
}
/// The entries of `codex plugin list --json` (`installed`), each with the folder Codex installed it
/// in and whether it is switched on. `codex plugin add` puts a copy of the plugin's folder, as it is,
/// in `plugins/cache/<marketplaceName>/<name>/<version>` of its home, and the command names neither
/// that folder nor lists an entry whose folder is gone (read on codex-cli 0.171.0). A folder Muro
/// cannot find there is left empty, as before, and nothing is said about its files.
fn codex_entries(installed: &[Value], root: &Path) -> Vec<Value> {
    installed
        .iter()
        .map(|p| {
            let part = |key: &str| p[key].as_str().filter(|s| plain_component(s));
            let folder = match (part("marketplaceName"), part("name"), part("version")) {
                (Some(market), Some(name), Some(version)) => Some(
                    root.join("plugins").join("cache").join(market).join(name).join(version),
                )
                .filter(|folder| folder.is_dir() && !folder.is_symlink()),
                _ => None,
            };
            let path = folder.map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
            let mut entry = json!({"id":p["pluginId"],"name":p["name"],"version":p["version"].as_str().unwrap_or(""),"path":path,"managed":false});
            if let Some(enabled) = p["enabled"].as_bool() {
                entry["enabled"] = json!(enabled);
            }
            entry
        })
        .collect()
}
/// Codex's `config.toml`, from its home, as JSON; empty when there is no file. Muro only reads it.
fn codex_config(root: &Path) -> Result<Value> {
    let path = root.join("config.toml");
    if !path.exists() {
        return Ok(json!({}));
    }
    let text = fs::read_to_string(&path).context("Cannot read Codex config.toml")?;
    toml::from_str(&text).context("Codex config.toml is not valid TOML")
}
/// What Codex's own files say is installed, in rows with the fields of `codex plugin list --json` that
/// `codex_entries` reads, for when the command refuses to answer. A row is a
/// `[plugins."<name>@<marketplace>"]` table of `config.toml` whose marketplace is configured and whose
/// copy is in `plugins/cache/<marketplace>/<name>/<version>`: what the command lists when it answers
/// (read on codex-cli 0.169.0: a plugin without its copy, or of a marketplace that is not configured, is
/// not listed). `enabled` is the table's. The rows are in the order of their ids.
fn codex_rows(config: &Value, root: &Path) -> Vec<Value> {
    let mut rows = vec![];
    for (id, table) in config["plugins"].as_object().into_iter().flatten() {
        let Some((name, market)) = id.split_once('@') else {
            continue;
        };
        if !plain_component(name)
            || !plain_component(market)
            || !config["marketplaces"][market].is_object()
        {
            continue;
        }
        let copies = root.join("plugins").join("cache").join(market).join(name);
        let versions: Vec<String> = fs::read_dir(&copies)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|folder| folder.path().is_dir() && !folder.path().is_symlink())
            .filter_map(|folder| folder.file_name().into_string().ok())
            .collect();
        let Some(version) = versions
            .iter()
            .max_by(|a, b| version_order(a).cmp(&version_order(b)))
        else {
            continue;
        };
        let mut row =
            json!({"pluginId":id,"name":name,"marketplaceName":market,"version":version});
        if let Some(enabled) = table["enabled"].as_bool() {
            row["enabled"] = json!(enabled);
        }
        rows.push(row);
    }
    rows.sort_by(|a, b| a["pluginId"].as_str().cmp(&b["pluginId"].as_str()));
    rows
}
/// The order of the version folders of one cached plugin; Codex reports the last. Read on codex-cli
/// 0.169.0 with several folders side by side: 1.10.0 over 1.9.0, 1.9.0 over 1.9.0-rc1 and over 1.9, a
/// word (`local`) over any number.
// shortcut: the order is inferred from those cases, not from Codex's code; a plugin Muro installs has one folder (`codex plugin add` replaces it). Upgrade when Codex documents the choice.
fn version_order(version: &str) -> (Vec<(bool, u64, &str)>, bool) {
    let core = version.split(['-', '+']).next().unwrap_or(version);
    let parts = core
        .split('.')
        .map(|part| match part.parse::<u64>() {
            Ok(number) => (false, number, ""),
            Err(_) => (true, 0, part),
        })
        .collect();
    (parts, core.len() == version.len())
}
/// The ids of the plugins `config.toml` has a table for from the marketplace `market`, with or without
/// a copy in the cache, in order.
fn codex_plugins_of(config: &Value, market: &str) -> Vec<String> {
    let mut ids: Vec<String> = config["plugins"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(id, _)| id.clone())
        .filter(|id| id.split_once('@').is_some_and(|(_, of)| of == market))
        .collect();
    ids.sort();
    ids
}
/// The configured marketplaces Codex cannot load, each with a sentence for the person, in the order of
/// their names: a local one whose folder is gone (Muro looks), and any other one that `refusal`, what
/// Codex answered, names between backticks, with Codex's reason. One of them is enough for
/// `codex plugin list` and `codex plugin marketplace list` to answer nothing (codex-cli 0.169.0).
fn codex_broken_marketplaces(config: &Value, refusal: &str) -> Vec<(String, String)> {
    let mut names: Vec<&String> = config["marketplaces"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(name, _)| name)
        .collect();
    names.sort();
    let mut broken = vec![];
    for name in names {
        let market = &config["marketplaces"][name.as_str()];
        let folder = market["source"]
            .as_str()
            .filter(|_| market["source_type"] == "local")
            .map(native_arg);
        if let Some(folder) = folder.filter(|folder| !Path::new(folder).is_dir()) {
            broken.push((
                name.clone(),
                format!("The marketplace {name} points to a folder that is gone: {folder}"),
            ));
        } else if let Some(line) = refusal
            .lines()
            .find(|line| line.contains(&format!("`{name}`")))
        {
            let reason = line.rsplit_once(": ").map_or(line, |(_, reason)| reason);
            broken.push((
                name.clone(),
                format!("The marketplace {name} cannot be loaded: {}", reason.trim()),
            ));
        }
    }
    broken
}
/// A name the harness reported that can be one folder of a path: not empty, not `.` or `..`, and
/// without a separator or a drive.
fn plain_component(s: &str) -> bool {
    !s.is_empty() && s != "." && s != ".." && !s.contains(['/', '\\', ':'])
}
/// The name a harness installs a plugin under, read from its inventory entry: the part of a Claude
/// Code or Codex id before its marketplace (`<name>@<marketplace>`), Hermes' name. The harnesses that
/// list a plugin by its folder or its source have none. It is what a plugin's manifest calls it, so
/// two entries of the same name on one harness are copies of the same plugin.
fn plugin_name(h: &str, entry: &Value) -> Value {
    match h {
        "claude-code" | "codex" => entry["id"]
            .as_str()
            .and_then(|id| id.split_once('@'))
            .map_or(Value::Null, |(name, _)| json!(name)),
        "hermes" => entry["name"].clone(),
        _ => Value::Null,
    }
}
fn local_path(s: &str, root: &Path) -> Option<PathBuf> {
    if s.starts_with("file:") {
        url::Url::parse(s).ok()?.to_file_path().ok()
    } else {
        let p = Path::new(s);
        if p.is_absolute() {
            Some(p.to_owned())
        } else if s.starts_with('.') {
            Some(root.join(p))
        } else {
            None
        }
    }
}
/// The manifest of a harness's plugin, from the plugin's folder.
pub fn manifest(h: &str) -> Result<&'static str> {
    Ok(match h {
        "claude-code" => ".claude-plugin/plugin.json",
        "codex" => ".codex-plugin/plugin.json",
        "pi" | "opencode" => "package.json",
        "hermes" => "plugin.yaml",
        _ => bail!("Adapter not available for {h}"),
    })
}
/// The marketplace file of a harness that has one, from the folder that is the marketplace: how the
/// harness finds the plugins of a repository, and where Muro writes the one it installs from.
pub fn marketplace(h: &str) -> Option<&'static str> {
    match h {
        "claude-code" => Some(".claude-plugin/marketplace.json"),
        "codex" => Some(".agents/plugins/marketplace.json"),
        _ => None,
    }
}
/// The name a person reads for a harness.
pub fn harness_name(h: &str) -> &str {
    match h {
        "claude-code" => "Claude Code",
        "codex" => "Codex",
        "opencode" => "OpenCode",
        "pi" => "Pi",
        "hermes" => "Hermes",
        "deepseek" => "DeepSeek",
        other => other,
    }
}
/// A name the harness can install a plugin under, and Muro can put in a native id.
pub fn valid_name(h: &str, name: &str) -> bool {
    !name.is_empty() && !name.starts_with('-') && !name.contains(['@', '/', '\\'])
        || matches!(h, "pi" | "opencode")
}
pub fn identity(h: &str, artifact: &Path) -> Result<(String, String)> {
    let manifest = manifest(h)?;
    let v: Value = if h == "hermes" {
        serde_yaml::from_slice(&fs::read(artifact.join(manifest))?)?
    } else {
        read(&artifact.join(manifest))?
    };
    let name = str_field(&v, "name")?.to_owned();
    ensure!(valid_name(h, &name), "Invalid native plugin name");
    Ok((name, v["version"].as_str().unwrap_or("").to_owned()))
}

pub const HERMES_MCP: &str = "hermes-mcp";

/// Hermes loads its MCP package as a second, portable plugin (ADR-0030).
fn hermes_mcp_identity(path: &Path) -> Result<(String, String)> {
    ensure!(path.join("mcp.json").is_file() && !path.join("plugin.yaml").exists()
        && !path.join("plugin.yml").exists(), "Expected a portable Hermes MCP package");
    let manifest = read(&path.join("plugin.json"))?;
    let name = str_field(&manifest, "name")?;
    ensure!(valid_name("hermes", name), "Invalid Hermes MCP plugin name");
    Ok((name.to_owned(), str_field(&manifest, "version")?.to_owned()))
}

/// The name and version a harness installs the plugin in `path` under, `recorded` being its
/// distribution or receipt: the manifest's. Claude Code needs neither in the manifest, nor the
/// manifest itself: it takes them from the marketplace entry, which Muro writes from `recorded`
/// (`name`, `version`), so a missing one is taken from there.
pub fn distribution_identity(h: &str, path: &Path, recorded: &Value) -> Result<(String, String)> {
    let version = recorded["version"].as_str().unwrap_or("");
    let claude = h == "claude-code";
    let (name, declared) = if h == "hermes" && recorded["component"] == HERMES_MCP {
        hermes_mcp_identity(path)?
    } else if claude && !path.join(manifest(h)?).exists() {
        let name = recorded["name"].as_str().unwrap_or("");
        ensure!(
            valid_name(h, name),
            "No .claude-plugin/plugin.json and no valid plugin name recorded for it; check for updates"
        );
        (name.to_owned(), String::new())
    } else {
        identity(h, path)?
    };
    if declared.is_empty() {
        ensure!(
            claude && !version.is_empty(),
            "Plugin manifest must declare its version"
        );
        return Ok((name, version.to_owned()));
    }
    ensure!(
        declared == version,
        "Distribution version differs from its manifest"
    );
    Ok((name, declared))
}
pub fn native_id(h: &str, plugin_id: &str, name: &str, artifact: &Path) -> Result<String> {
    match h {
        "claude-code" | "codex" => Ok(format!("{name}@muro-{plugin_id}")),
        "opencode" => Ok(url::Url::from_directory_path(artifact)
            .map_err(|_| anyhow::anyhow!("Cannot form artifact URL"))?
            .to_string()),
        "pi" => Ok(artifact.to_string_lossy().to_string()),
        "hermes" => Ok(name.to_owned()),
        _ => bail!("Unsupported adapter"),
    }
}
/// The marketplace Muro installs one artifact from on Claude Code or Codex. Claude Code reads the
/// plugin's name and version from its entry when the plugin's manifest lacks them, so the entry
/// carries the ones the plan resolved.
fn market_document(h: &str, plugin_id: &str, name: &str, version: &str, digest: &str) -> Value {
    let relative = format!("./releases/{digest}");
    let entry = if h == "claude-code" {
        json!({"name":name,"source":relative,"version":version})
    } else {
        json!({"name":name,"source":{"source":"local","path":relative},"policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"},"category":"Productivity"})
    };
    json!({"name":format!("muro-{plugin_id}"),"owner":{"name":"Muro"},"interface":{"displayName":"Muro registry"},"plugins":[entry]})
}
/// Installs `artifact` on `target` as the plugin `name` at `version`, the identity the plan
/// resolved for it (`distribution_identity`).
pub fn install(
    target: &Value,
    plugin_id: &str,
    artifact: &Path,
    (name, version): (&str, &str),
    previous: Option<&str>,
    kind: &str,
) -> Result<String> {
    ensure!(
        matches!(kind, "install" | "update" | "reinstall"),
        "Invalid native install operation: {kind}"
    );
    let h = str_field(target, "harness")?;
    let id = native_id(h, plugin_id, name, artifact)?;
    if matches!(h, "pi" | "opencode") {
        let path = config(target)?;
        let mut value = optional(&path)?;
        let key = if h == "pi" { "packages" } else { "plugins" };
        let list = value
            .as_object_mut()
            .context("Configuration must be an object")?
            .entry(key)
            .or_insert(json!([]))
            .as_array_mut()
            .context("Invalid plugin array")?;
        if let Some(old) = previous {
            if let Some(index) = list
                .iter()
                .position(|v| v.as_str().or_else(|| v["source"].as_str()) == Some(old))
            {
                if old != id
                    && list.iter().enumerate().any(|(i, v)| {
                        i != index && v.as_str().or_else(|| v["source"].as_str()) == Some(&id)
                    })
                {
                    bail!("Replacement source already configured: {id}");
                }
                if h == "pi" && list[index].is_object() {
                    list[index]["source"] = json!(id);
                } else {
                    list[index] = json!(id);
                }
            } else if !list
                .iter()
                .any(|v| v.as_str().or_else(|| v["source"].as_str()) == Some(&id))
            {
                list.push(json!(id));
            }
        } else if !list
            .iter()
            .any(|v| v.as_str().or_else(|| v["source"].as_str()) == Some(&id))
        {
            list.push(json!(id));
        }
        write(&path, &value)?;
    } else if h == "hermes" {
        // Hermes consumes Git sources. A private bare repository is its native
        // transport for an already verified immutable artifact, never a project commit.
        let data = artifact
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .context("Artifact data root")?;
        // Hermes records the source URL of each plugin, including its exact revision.
        // Give the two independently updatable packages distinct Git sources.
        let transport = if artifact.join("plugin.yaml").is_file() { "hermes" } else { HERMES_MCP };
        let repo = data.join("native-sources").join(transport).join(plugin_id);
        if !repo.exists() {
            fs::create_dir_all(repo.parent().unwrap())?;
            command(
                "git",
                &[
                    "init".into(),
                    "--bare".into(),
                    repo.to_string_lossy().to_string(),
                ],
                None,
                None,
            )?;
        }
        let base = vec![
            "--git-dir".into(),
            repo.to_string_lossy().to_string(),
            "--work-tree".into(),
            artifact.to_string_lossy().to_string(),
            "-c".into(),
            "core.autocrlf=false".into(),
        ];
        let mut add = base.clone();
        add.extend(["add".into(), "--all".into(), "--force".into(), ".".into()]);
        command("git", &add, None, Some(artifact))?;
        let mut commit = base;
        commit.extend([
            "-c".into(),
            "user.name=Muro artifact transport".into(),
            "-c".into(),
            "user.email=muro@localhost".into(),
            "commit".into(),
            "--allow-empty".into(),
            "-m".into(),
            "Prepared plugin artifact".into(),
        ]);
        command("git", &commit, None, Some(artifact))?;
        let revision = command(
            "git",
            &[
                "--git-dir".into(),
                repo.to_string_lossy().to_string(),
                "rev-parse".into(),
                "HEAD".into(),
            ],
            None,
            None,
        )?;
        let source = url::Url::from_directory_path(&repo)
            .map_err(|_| anyhow::anyhow!("Cannot form Hermes artifact URL"))?;
        let mut args = vec![
            "plugins".into(),
            "install".into(),
            source.to_string(),
            "--ref".into(),
            revision.trim().to_owned(),
            "--enable".into(),
            "--yes-deps".into(),
        ];
        if previous.is_some() {
            args.push("--force".into());
        }
        run(target, &args)?;
    } else {
        let data = artifact
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .context("Artifact data root")?;
        let digest = tree_hash(artifact)?;
        let market = data.join("native-markets").join(h).join(plugin_id);
        let release = market.join("releases").join(&digest);
        if !release.exists() {
            copy_tree(artifact, &release)?;
        }
        ensure!(
            tree_hash(&release)? == digest,
            "Native marketplace copy is corrupt"
        );
        let file = marketplace(h).with_context(|| format!("{h} has no marketplace"))?;
        write(
            &market.join(file),
            &market_document(h, plugin_id, name, version, &digest),
        )?;
        let market_name = format!("muro-{plugin_id}");
        if !marketplace_configured(target, &market_name)? {
            run(
                target,
                &[
                    "plugin".into(),
                    "marketplace".into(),
                    "add".into(),
                    market.to_string_lossy().replace('\\', "/"),
                ],
            )?;
        } else if h == "claude-code" {
            run(
                target,
                &[
                    "plugin".into(),
                    "marketplace".into(),
                    "update".into(),
                    market_name,
                ],
            )?;
        }
        for (args, ignored) in install_commands(h, &id, previous) {
            let done = run(target, &args);
            if !ignored {
                done?;
            }
        }
    }
    Ok(id)
}
/// Whether Claude Code or Codex has the marketplace `name` configured, as its own list says. Codex
/// refuses that list too when another marketplace cannot be loaded (`codex_broken_marketplaces`), and
/// goes on adding marketplaces and plugins: its `config.toml` then says whether `name` is there.
fn marketplace_configured(target: &Value, name: &str) -> Result<bool> {
    let codex = str_field(target, "harness")? == "codex";
    let args = ["plugin", "marketplace", "list", "--json"].map(String::from);
    let listed = match run(target, &args) {
        Ok(listed) => listed,
        Err(refusal) => {
            return match codex_config(Path::new(str_field(target, "root")?)) {
                Ok(config) if codex && refused(&refusal) => {
                    Ok(config["marketplaces"][name].is_object())
                }
                _ => Err(refusal),
            };
        }
    };
    let marketplaces: Value = serde_json::from_str(&listed)?;
    let list = if codex {
        marketplaces["marketplaces"].as_array()
    } else {
        marketplaces.as_array()
    }
    .context("Unexpected native marketplace list")?;
    Ok(list.iter().any(|m| m["name"] == name))
}
/// The commands that put `id` on Claude Code or Codex and take `previous`, the copy it replaces,
/// off, in the order they run, each with whether its failure is ignored. A copy under another id
/// is removed after the new one is installed, so a failed install leaves it; its removal failing
/// does not fail the install. A copy under the same id is replaced: Claude Code uninstalls it
/// first, and Codex's add replaces it.
fn install_commands(h: &str, id: &str, previous: Option<&str>) -> Vec<(Vec<String>, bool)> {
    let codex = h == "codex";
    let op = if codex { "add" } else { "install" };
    let add: Vec<String> = vec!["plugin".into(), op.into(), id.into()];
    let uninstall = |old: &str| -> Vec<String> {
        if codex {
            vec!["plugin".into(), "remove".into(), old.into()]
        } else {
            vec![
                "plugin".into(),
                "uninstall".into(),
                old.into(),
                "--scope".into(),
                "user".into(),
            ]
        }
    };
    match previous {
        Some(old) if old != id => vec![(add, false), (uninstall(old), true)],
        Some(old) if !codex => vec![(uninstall(old), false), (add, false)],
        _ => vec![(add, false)],
    }
}
/// Takes a marketplace Codex cannot load out of Codex, with Codex's own commands, which go on working
/// beside it (read on codex-cli 0.169.0): `codex plugin remove` for each of `plugins`, the plugins
/// configured from it, then `codex plugin marketplace remove`, which alone leaves their tables and
/// their copies behind. A plugin that is already gone does not stop the rest.
pub fn remove_marketplace(target: &Value, name: &str, plugins: &[&str]) -> Result<()> {
    ensure!(
        str_field(target, "harness")? == "codex",
        "Marketplace removal unavailable for this harness"
    );
    for selector in plugins.iter().chain([&name]) {
        ensure!(
            !selector.starts_with('-') && !selector.is_empty(),
            "Invalid native selector"
        );
    }
    for id in plugins {
        let _ = run(target, &["plugin".into(), "remove".into(), (*id).into()]);
    }
    run(
        target,
        &[
            "plugin".into(),
            "marketplace".into(),
            "remove".into(),
            name.into(),
        ],
    )?;
    Ok(())
}
pub fn activate(target: &Value, native_id: &str) -> Result<()> {
    ensure!(
        !native_id.starts_with('-') && !native_id.is_empty(),
        "Invalid native plugin selector"
    );
    ensure!(
        str_field(target, "harness")? == "claude-code",
        "Native activation unavailable for this harness"
    );
    run(
        target,
        &[
            "plugin".into(),
            "enable".into(),
            native_id.into(),
            "--scope".into(),
            "user".into(),
        ],
    )?;
    Ok(())
}
pub fn remove(target: &Value, native_id: &str) -> Result<()> {
    ensure!(
        !native_id.starts_with('-') && !native_id.is_empty(),
        "Invalid native plugin selector"
    );
    let h = str_field(target, "harness")?;
    if matches!(h, "opencode" | "pi") {
        let cfg = config(target)?;
        let mut value = optional(&cfg)?;
        let key = if h == "pi" { "packages" } else { "plugins" };
        let list = value[key].as_array_mut().context("Missing plugin list")?;
        list.retain(|v| v.as_str().or_else(|| v["source"].as_str()) != Some(native_id));
        write(&cfg, &value)?;
    } else if h == "hermes" {
        run(
            target,
            &["plugins".into(), "remove".into(), native_id.into()],
        )?;
    } else {
        run(
            target,
            &vec![
                "plugin".into(),
                if h == "codex" { "remove" } else { "uninstall" }.into(),
                native_id.into(),
            ],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hermes_server_package_uses_its_own_portable_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("plugin.json"), r#"{"name":"demo-mcp","version":"1.0"}"#).unwrap();
        fs::write(tmp.path().join("mcp.json"), "{}").unwrap();
        let record = json!({"version":"1.0","component":HERMES_MCP});
        assert_eq!(distribution_identity("hermes", tmp.path(), &record).unwrap(), ("demo-mcp".into(), "1.0".into()));
        assert!(identity("hermes", tmp.path()).is_err());
        fs::write(tmp.path().join("plugin.yaml"), "{}").unwrap();
        assert!(distribution_identity("hermes", tmp.path(), &record).is_err());
    }

    #[test]
    fn pi_replacement_preserves_resource_filters() {
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        fs::create_dir_all(&profile).unwrap();
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(
            new.join("package.json"),
            r#"{"name":"pi-test","version":"1.0.0"}"#,
        )
        .unwrap();
        let target = json!({"harness":"pi","root":profile,"executable":""});
        let cfg = profile.join("settings.json");
        write(&cfg, &json!({"packages":[{"source":old.to_string_lossy(),"skills":[],"extensions":["allowed.js"]}]})).unwrap();
        install(
            &target,
            "pi-test",
            &new,
            ("pi-test", "1.0.0"),
            Some(old.to_str().unwrap()),
            "update",
        )
        .unwrap();
        let actual = read(&cfg).unwrap();
        assert_eq!(
            actual["packages"][0]["source"],
            json!(new.to_string_lossy())
        );
        assert_eq!(actual["packages"][0]["skills"], json!([]));
        assert_eq!(actual["packages"][0]["extensions"], json!(["allowed.js"]));
    }

    #[test]
    #[ignore = "uses an installed Claude CLI against an isolated temporary profile"]
    fn claude_reinstall_repairs_files_and_reenables() {
        let exe = std::env::var("MURO_CLAUDE_TEST_EXE").expect("MURO_CLAUDE_TEST_EXE");
        let tmp = tempfile::tempdir().unwrap();
        let profile = tmp.path().join("profile");
        let artifact = tmp.path().join("data/artifacts/demo/revision");
        fs::create_dir_all(&profile).unwrap();
        fs::create_dir_all(artifact.join(".claude-plugin")).unwrap();
        fs::create_dir_all(artifact.join("skills/verify")).unwrap();
        fs::write(
            artifact.join(".claude-plugin/plugin.json"),
            r#"{"name":"muro-native-verify","version":"1.0.0"}"#,
        )
        .unwrap();
        fs::write(artifact.join("skills/verify/SKILL.md"), "ORIGINAL").unwrap();
        let target = json!({"id":"test","harness":"claude-code","root":profile,"executable":exe});
        let identity = ("muro-native-verify", "1.0.0");
        let id = install(&target, "demo", &artifact, identity, None, "install").unwrap();
        let entries = inventory(&target, &json!({}));
        assert_eq!(entries["complete"], true, "{entries}");
        let installed = entries["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap();
        assert_eq!(installed["enabled"], true);
        let skill = Path::new(installed["path"].as_str().unwrap()).join("skills/verify/SKILL.md");
        assert_eq!(fs::read_to_string(&skill).unwrap(), "ORIGINAL");
        fs::write(&skill, "BROKEN").unwrap();
        run(&target, &["plugin".into(), "disable".into(), id.clone()]).unwrap();
        let disabled = inventory(&target, &json!({}));
        assert_eq!(
            disabled["plugins"]
                .as_array()
                .unwrap()
                .iter()
                .find(|p| p["id"] == id)
                .unwrap()["enabled"],
            false
        );
        activate(&target, &id).unwrap();
        let active = inventory(&target, &json!({}));
        assert_eq!(
            active["plugins"]
                .as_array()
                .unwrap()
                .iter()
                .find(|p| p["id"] == id)
                .unwrap()["enabled"],
            true
        );
        install(&target, "demo", &artifact, identity, Some(&id), "reinstall").unwrap();
        let repaired = inventory(&target, &json!({}));
        let installed = repaired["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap();
        let skill = Path::new(installed["path"].as_str().unwrap()).join("skills/verify/SKILL.md");
        assert_eq!(fs::read_to_string(&skill).unwrap(), "ORIGINAL");
        // The service's post-reinstall content check relies on Claude installing an exact copy.
        assert_eq!(
            tree_hash(Path::new(installed["path"].as_str().unwrap())).unwrap(),
            tree_hash(&artifact).unwrap()
        );
        fs::write(&skill, "BROKEN AGAIN").unwrap();
        install(&target, "demo", &artifact, identity, Some(&id), "update").unwrap();
        let updated = inventory(&target, &json!({}));
        let installed = updated["plugins"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == id)
            .unwrap();
        let skill = Path::new(installed["path"].as_str().unwrap()).join("skills/verify/SKILL.md");
        assert_eq!(fs::read_to_string(skill).unwrap(), "ORIGINAL");
    }

    // Owner, 2026-11-21, "fixalo": Claude Code installs a plugin without a manifest, or whose
    // manifest declares no version, taking both from the marketplace entry. Run live that day in an
    // isolated profile: an entry's name and version became the installed id and version, and with
    // no version anywhere Claude Code recorded "unknown".
    fn plugin_folder(manifest: Option<&str>) -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        fs::create_dir_all(t.path().join("skills/hello")).unwrap();
        fs::write(t.path().join("skills/hello/SKILL.md"), "Say hello.").unwrap();
        if let Some(text) = manifest {
            fs::create_dir_all(t.path().join(".claude-plugin")).unwrap();
            fs::write(t.path().join(".claude-plugin/plugin.json"), text).unwrap();
        }
        t
    }
    #[test]
    fn a_claude_code_plugin_takes_what_its_manifest_lacks_from_its_distribution() {
        let recorded = json!({"name":"ay","version":"1.4.0"});
        let none = plugin_folder(None);
        assert_eq!(
            distribution_identity("claude-code", none.path(), &recorded).unwrap(),
            ("ay".to_owned(), "1.4.0".to_owned())
        );
        let unversioned = plugin_folder(Some(r#"{"name":"bee"}"#));
        assert_eq!(
            distribution_identity("claude-code", unversioned.path(), &recorded).unwrap(),
            ("bee".to_owned(), "1.4.0".to_owned())
        );
        let versioned = plugin_folder(Some(r#"{"name":"bee","version":"1.4.0"}"#));
        assert_eq!(
            distribution_identity("claude-code", versioned.path(), &recorded).unwrap(),
            ("bee".to_owned(), "1.4.0".to_owned())
        );
    }
    #[test]
    fn what_a_manifest_declares_still_binds_and_other_harnesses_still_need_it() {
        let declared = plugin_folder(Some(r#"{"name":"bee","version":"2.0.0"}"#));
        let error =
            distribution_identity("claude-code", declared.path(), &json!({"version":"1.4.0"}));
        assert_eq!(
            error.unwrap_err().to_string(),
            "Distribution version differs from its manifest"
        );
        let none = plugin_folder(None);
        for recorded in [
            json!({"version":"1.4.0"}),
            json!({"name":"a@b","version":"1.4.0"}),
        ] {
            assert!(distribution_identity("claude-code", none.path(), &recorded).is_err());
        }
        assert!(distribution_identity("claude-code", none.path(), &json!({"name":"ay"})).is_err());
        let codex = tempfile::tempdir().unwrap();
        fs::create_dir_all(codex.path().join(".codex-plugin")).unwrap();
        fs::write(
            codex.path().join(".codex-plugin/plugin.json"),
            r#"{"name":"cx"}"#,
        )
        .unwrap();
        assert_eq!(
            distribution_identity(
                "codex",
                codex.path(),
                &json!({"name":"cx","version":"1.0.0"})
            )
            .unwrap_err()
            .to_string(),
            "Plugin manifest must declare its version"
        );
    }
    #[test]
    fn the_marketplace_muro_installs_from_carries_the_resolved_name_and_version() {
        let claude = market_document("claude-code", "p1", "ay", "0123456789ab", "d1");
        assert_eq!(claude["name"], "muro-p1");
        assert_eq!(
            claude["plugins"],
            json!([{"name":"ay","source":"./releases/d1","version":"0123456789ab"}])
        );
        let codex = market_document("codex", "p1", "cx", "1.0.0", "d1");
        assert_eq!(codex["plugins"][0]["name"], "cx");
        assert_eq!(
            codex["plugins"][0]["source"],
            json!({"source":"local","path":"./releases/d1"})
        );
    }

    fn entry<'a>(entries: &'a [Value], id: &str) -> &'a Value {
        entries.iter().find(|e| e["id"] == id).unwrap()
    }
    #[test]
    fn a_claude_code_entry_says_whether_its_folder_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let there = tmp.path().join("cache/there");
        fs::create_dir_all(&there).unwrap();
        let gone = tmp.path().join("cache/gone");
        let installed = json!({"plugins":{
            "there@m":[{"scope":"user","version":"1.0.0","installPath":there.to_string_lossy()}],
            "gone@m":[{"scope":"user","version":"1.0.0","installPath":gone.to_string_lossy()}],
            "blank@m":[{"scope":"user","version":"1.0.0","installPath":""}],
            "nopath@m":[{"scope":"user","version":"1.0.0"}],
            "project@m":[{"scope":"project","version":"1.0.0","installPath":there.to_string_lossy()}]
        }});
        let listed = vec![
            json!({"id":"there@m","scope":"user","enabled":true}),
            json!({"id":"gone@m","scope":"user","enabled":true}),
            json!({"id":"blank@m","scope":"user","enabled":true}),
            json!({"id":"nopath@m","scope":"user","enabled":true}),
            json!({"id":"project@m","scope":"project","enabled":true}),
        ];
        let entries = claude_entries(&installed, &listed).unwrap();
        assert_eq!(entries.len(), 4, "only user-scope entries are listed");
        assert_eq!(entry(&entries, "there@m")["present"], true);
        assert_eq!(
            entry(&entries, "there@m")["path"],
            json!(there.to_string_lossy())
        );
        assert_eq!(entry(&entries, "gone@m")["present"], false);
        assert_eq!(entry(&entries, "blank@m")["present"], false);
        assert_eq!(entry(&entries, "nopath@m")["present"], false);
        assert_eq!(entry(&entries, "there@m")["managed"], false);
        assert_eq!(entry(&entries, "there@m")["version"], "1.0.0");
    }
    #[test]
    fn a_claude_code_entry_takes_its_enabled_state_from_its_user_scope_row() {
        let installed = json!({"plugins":{
            "codebase-map@daodan":[{"scope":"user","version":"1.0.0","installPath":""}]
        }});
        let id = "codebase-map@daodan";
        let enabled = |listed: Vec<Value>| {
            let entries = claude_entries(&installed, &listed).unwrap();
            entry(&entries, id)["enabled"].clone()
        };
        // The user-scope row decides, whichever row comes first and whichever field names the plugin.
        assert_eq!(
            enabled(vec![
                json!({"id":id,"scope":"local","enabled":false}),
                json!({"id":id,"scope":"user","enabled":true}),
            ]),
            true
        );
        assert_eq!(
            enabled(vec![
                json!({"id":id,"scope":"user","enabled":false}),
                json!({"id":id,"scope":"local","enabled":true}),
            ]),
            false
        );
        assert_eq!(
            enabled(vec![
                json!({"name":id,"scope":"project","enabled":true}),
                json!({"name":id,"scope":"user","enabled":false}),
            ]),
            false
        );
        // With no user-scope row, or rows that carry no scope, the first row of the id decides.
        assert_eq!(
            enabled(vec![json!({"id":id,"scope":"local","enabled":false})]),
            false
        );
        assert_eq!(
            enabled(vec![
                json!({"id":id,"enabled":true}),
                json!({"id":id,"enabled":false}),
            ]),
            true
        );
    }
    #[test]
    fn a_codex_entry_has_the_folder_codex_installed_it_in_and_its_enabled_state() {
        let tmp = tempfile::tempdir().unwrap();
        let there = tmp.path().join("plugins").join("cache").join("muro-demo").join("demo").join("1.2.3");
        fs::create_dir_all(&there).unwrap();
        // The rows as codex-cli 0.171.0 writes them under `installed`.
        let row = |id: &str, market: &str, name: &str, version: &str, enabled: bool| {
            json!({"pluginId":id,"name":name,"marketplaceName":market,"version":version,"installed":true,"enabled":enabled,
                   "source":{"source":"local","path":"/elsewhere"},"installPolicy":"AVAILABLE","authPolicy":"ON_INSTALL"})
        };
        let installed = vec![
            row("demo@muro-demo", "muro-demo", "demo", "1.2.3", true),
            row("gone@muro-demo", "muro-demo", "gone", "1.0.0", false),
            row("up@muro-demo", "..", "demo", "1.2.3", true),
            row("sep@muro-demo", "muro-demo", "demo/../demo", "1.2.3", true),
        ];
        let entries = codex_entries(&installed, tmp.path());
        let demo = entry(&entries, "demo@muro-demo");
        assert_eq!(demo["path"], json!(there.to_string_lossy()));
        assert_eq!((demo["name"].as_str(), demo["version"].as_str()), (Some("demo"), Some("1.2.3")));
        assert_eq!((demo["enabled"].clone(), demo["managed"].clone()), (json!(true), json!(false)));
        assert_eq!(entry(&entries, "gone@muro-demo")["path"], "", "no folder there: none is named");
        assert_eq!(entry(&entries, "gone@muro-demo")["enabled"], false);
        for id in ["up@muro-demo", "sep@muro-demo"] {
            assert_eq!(entry(&entries, id)["path"], "", "{id}: a name that is not one folder is never a path");
        }
        let bare = codex_entries(&[json!({"pluginId":"a@m","name":"a"})], tmp.path());
        assert_eq!((bare[0]["path"].as_str(), bare[0]["version"].as_str()), (Some(""), Some("")));
        assert!(bare[0].get("enabled").is_none(), "a row that does not say is not said to be off");
    }
    // Owner, 2026-11-25, "Muro deve funzionare": one marketplace whose folder was gone made
    // `codex plugin list --json` answer nothing (codex-cli 0.169.0), and Sync said Codex could not be read.
    fn codex_home(config: &str, copies: &[&str]) -> tempfile::TempDir {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join("config.toml"), config).unwrap();
        for copy in copies {
            fs::create_dir_all(home.path().join("plugins").join("cache").join(copy)).unwrap();
        }
        home
    }
    #[test]
    fn codex_files_say_what_is_installed_as_the_command_would() {
        let home = codex_home(
            r#"
model = "any"
[marketplaces.lost]
source_type = "local"
source = '\\?\Z:\nowhere\lost'
[marketplaces.kept]
source_type = "git"
source = "https://example.invalid/kept.git"
[plugins."notes@lost"]
enabled = true
[plugins."off@kept"]
enabled = false
[plugins."unsaid@kept"]
[plugins."nocopy@kept"]
enabled = true
[plugins."orphan@unconfigured"]
enabled = true
[plugins."../up@kept"]
enabled = true
"#,
            &[
                "lost/notes/0.4.1",
                "kept/off/1.9.0",
                "kept/off/1.10.0",
                "kept/unsaid/2.0.0",
                "unconfigured/orphan/1.0.0",
                "kept/remote-only/1.0.0",
            ],
        );
        let config = codex_config(home.path()).unwrap();
        let rows = codex_rows(&config, home.path());
        let ids: Vec<&str> = rows.iter().map(|r| r["pluginId"].as_str().unwrap()).collect();
        assert_eq!(
            ids,
            ["notes@lost", "off@kept", "unsaid@kept"],
            "a copy, a table and a configured marketplace"
        );
        assert_eq!(
            rows[0],
            json!({"pluginId":"notes@lost","name":"notes","marketplaceName":"lost","version":"0.4.1","enabled":true})
        );
        assert_eq!(
            (rows[1]["version"].as_str(), rows[1]["enabled"].as_bool()),
            (Some("1.10.0"), Some(false))
        );
        assert!(rows[2].get("enabled").is_none(), "a table that does not say is not said to be off");
        let entries = codex_entries(&rows, home.path());
        let folder = home.path().join("plugins").join("cache").join("lost").join("notes").join("0.4.1");
        assert_eq!(entry(&entries, "notes@lost")["path"], json!(folder.to_string_lossy()));
        assert_eq!(codex_rows(&json!({}), home.path()), Vec::<Value>::new());
        assert_eq!(codex_config(tempfile::tempdir().unwrap().path()).unwrap(), json!({}));
    }
    #[test]
    fn the_version_folder_of_a_codex_copy_is_the_one_codex_reports() {
        fn last(versions: &[&'static str]) -> &'static str {
            versions
                .iter()
                .copied()
                .max_by(|a, b| version_order(a).cmp(&version_order(b)))
                .unwrap()
        }
        assert_eq!(last(&["0.5.0", "1.10.0", "1.9.0"]), "1.10.0");
        assert_eq!(last(&["1.10.0", "2.0.0-beta", "0.5.0"]), "2.0.0-beta");
        assert_eq!(last(&["0.5.0", "1.9.0", "1.9.0-rc1", "1.9"]), "1.9.0");
        assert_eq!(last(&["0.5.0", "1.9.0", "1.9.0+b2", "10"]), "10");
        assert_eq!(last(&["1.10.0", "abc", "2.0.0-beta"]), "abc");
        assert_eq!(last(&["1.10.0", "local", "2.0.0-beta"]), "local");
    }
    fn said(broken: Vec<(String, String)>) -> Vec<String> {
        broken.into_iter().map(|(_, message)| message).collect()
    }
    #[test]
    fn a_marketplace_codex_cannot_load_is_named_in_a_sentence() {
        let here = tempfile::tempdir().unwrap();
        let config = json!({"marketplaces":{
            "lost":{"source_type":"local","source":"\\\\?\\Z:\\nowhere\\lost"},
            "here":{"source_type":"local","source":here.path().to_string_lossy()},
            "empty":{"source_type":"local","source":here.path().to_string_lossy()},
            "remote":{"source_type":"git","source":"https://example.invalid/remote.git"},
            "fine":{"source_type":"git","source":"https://example.invalid/fine.git"}
        }});
        // The refusal as codex-cli 0.169.0 words it, behind Muro's own start.
        let refusal = format!(
            "{REFUSED}Error: failed to load configured marketplace snapshot(s):\n- `lost` at \\\\?\\Z:\\nowhere\\lost: marketplace root does not contain a supported manifest\n- `empty` at {}: marketplace root does not contain a supported manifest\n- `remote` at https://example.invalid/remote.git: snapshot is missing",
            here.path().display()
        );
        assert_eq!(
            said(codex_broken_marketplaces(&config, &refusal)),
            vec![
                "The marketplace empty cannot be loaded: marketplace root does not contain a supported manifest".to_owned(),
                "The marketplace lost points to a folder that is gone: Z:\\nowhere\\lost".to_owned(),
                "The marketplace remote cannot be loaded: snapshot is missing".to_owned(),
            ]
        );
        // A refusal that names no marketplace, with every folder there: nothing to read around.
        let whole = json!({"marketplaces":{"here":{"source_type":"local","source":here.path().to_string_lossy()}}});
        assert_eq!(
            said(codex_broken_marketplaces(
                &whole,
                "Harness command failed: Error: not logged in"
            )),
            Vec::<String>::new()
        );
        assert_eq!(
            said(codex_broken_marketplaces(&json!({}), &refusal)),
            Vec::<String>::new()
        );
        let names: Vec<String> = codex_broken_marketplaces(&config, &refusal)
            .into_iter()
            .map(|(name, _)| name)
            .collect();
        assert_eq!(names, ["empty", "lost", "remote"]);
        let tables = json!({"plugins":{"b@lost":{},"a@lost":{"enabled":false},"c@kept":{},"nomarket":{}}});
        assert_eq!(codex_plugins_of(&tables, "lost"), ["a@lost", "b@lost"]);
        assert_eq!(codex_plugins_of(&json!({}), "lost"), Vec::<String>::new());
    }
    #[test]
    fn only_a_command_the_harness_ran_and_failed_is_a_refusal() {
        assert!(refused(&anyhow::anyhow!("{REFUSED}Error: failed to load marketplace(s)")));
        assert!(!refused(&anyhow::anyhow!("Cannot run codex")));
        assert!(!refused(&anyhow::anyhow!("Command timed out after 120 seconds")));
    }
    #[test]
    fn the_plugin_name_of_an_entry_is_the_name_the_harness_installed_it_under() {
        assert_eq!(plugin_name("claude-code", &json!({"id":"sample@sample","name":"sample@sample"})), "sample");
        assert_eq!(plugin_name("codex", &json!({"id":"sample@muro-sample","name":"sample"})), "sample");
        assert_eq!(plugin_name("codex", &json!({"id":"nomarket"})), Value::Null);
        assert_eq!(plugin_name("hermes", &json!({"id":"tidy","name":"tidy"})), "tidy");
        for h in ["opencode", "pi"] {
            assert_eq!(plugin_name(h, &json!({"id":"/plugins/a","name":"/plugins/a"})), Value::Null, "{h}");
        }
    }
    #[test]
    fn a_claude_code_entry_with_no_row_in_the_cli_inventory_is_an_error() {
        let installed =
            json!({"plugins":{"a@m":[{"scope":"user","version":"1.0.0","installPath":""}]}});
        let listed = vec![json!({"id":"b@m","scope":"user","enabled":true})];
        assert_eq!(
            claude_entries(&installed, &listed).unwrap_err().to_string(),
            "Claude plugin a@m missing from CLI inventory"
        );
    }

    fn words(commands: &[(Vec<String>, bool)]) -> Vec<(String, bool)> {
        commands
            .iter()
            .map(|(args, ignored)| (args.join(" "), *ignored))
            .collect()
    }
    #[test]
    fn a_changed_native_id_is_installed_before_the_old_one_is_removed() {
        assert_eq!(
            words(&install_commands(
                "claude-code",
                "codebase-map@muro-p1",
                Some("codebase-map@daodan")
            )),
            vec![
                ("plugin install codebase-map@muro-p1".to_owned(), false),
                (
                    "plugin uninstall codebase-map@daodan --scope user".to_owned(),
                    true
                ),
            ]
        );
        assert_eq!(
            words(&install_commands(
                "codex",
                "codebase-map@muro-p1",
                Some("codebase-map@daodan")
            )),
            vec![
                ("plugin add codebase-map@muro-p1".to_owned(), false),
                ("plugin remove codebase-map@daodan".to_owned(), true),
            ]
        );
    }
    #[test]
    fn a_copy_under_the_same_native_id_is_replaced_in_the_order_each_harness_needs() {
        assert_eq!(
            words(&install_commands(
                "claude-code",
                "ay@muro-p1",
                Some("ay@muro-p1")
            )),
            vec![
                ("plugin uninstall ay@muro-p1 --scope user".to_owned(), false),
                ("plugin install ay@muro-p1".to_owned(), false),
            ]
        );
        assert_eq!(
            words(&install_commands("codex", "ay@muro-p1", Some("ay@muro-p1"))),
            vec![("plugin add ay@muro-p1".to_owned(), false)]
        );
    }
    #[test]
    fn a_first_install_runs_only_the_install_command() {
        assert_eq!(
            words(&install_commands("claude-code", "ay@muro-p1", None)),
            vec![("plugin install ay@muro-p1".to_owned(), false)]
        );
        assert_eq!(
            words(&install_commands("codex", "ay@muro-p1", None)),
            vec![("plugin add ay@muro-p1".to_owned(), false)]
        );
    }
}
