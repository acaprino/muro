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
        "Harness command failed: {}",
        if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        }
    );
    Ok(stdout)
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
    let result = scan(target).map(|(mut entries, fingerprint)| {
        for p in &mut entries {
            for (rid,r) in receipts.as_object().into_iter().flatten() {
                if r["target_id"] == tid && r["native_id"] == p["id"] {
                    p["managed"]=json!(true);
                    p["registry_id"]=r["plugin_id"].clone();
                    p["receipt_id"]=json!(rid);
                }
            }
        }
        json!({"target_id":tid,"complete":true,"supported":supported(h),"error":null,"plugins":entries,"fingerprint":fingerprint})
    });
    match result {
        Ok(v) => v,
        Err(e) => {
            json!({"target_id":tid,"complete":false,"supported":supported(h),"error":format!("{e:#}"),"plugins":[],"fingerprint":""})
        }
    }
}
fn scan(target: &Value) -> Result<(Vec<Value>, String)> {
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
            Ok((entries, hash(&value)))
        }
        "claude-code" => {
            let path = root.join("plugins/installed_plugins.json");
            let doc = optional(&path)?;
            let mut entries = vec![];
            if let Some(plugins) = doc.get("plugins") {
                for (id, installs) in plugins
                    .as_object()
                    .context("Invalid Claude installed plugins")?
                {
                    for p in installs.as_array().context("Invalid Claude install list")? {
                        if p["scope"] != "user" {
                            continue;
                        }
                        entries.push(json!({"id":id,"name":id,"version":p["version"].as_str().unwrap_or(""),"path":p["installPath"].as_str().unwrap_or(""),"managed":false}));
                    }
                }
            }
            let listed: Value = serde_json::from_str(&run(
                target,
                &["plugin".into(), "list".into(), "--json".into()],
            )?)
            .context("Claude plugin list did not return JSON")?;
            let listed = listed.as_array().context("Expected Claude plugin array")?;
            for entry in &mut entries {
                let id = entry["id"].as_str().unwrap_or("");
                let installed = listed
                    .iter()
                    .find(|p| p["id"] == id || p["name"] == id)
                    .with_context(|| format!("Claude plugin {id} missing from CLI inventory"))?;
                entry["enabled"] = installed["enabled"]
                    .as_bool()
                    .context("Claude plugin list omitted enabled state")?
                    .into();
            }
            Ok((entries, hash(&json!({"installed":doc,"list":listed}))))
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
            Ok((entries, hash(&doc)))
        }
        "codex" => {
            let output = run(target, &["plugin".into(), "list".into(), "--json".into()])?;
            let doc: Value =
                serde_json::from_str(&output).context("Codex plugin list did not return JSON")?;
            let list = doc["installed"]
                .as_array()
                .context("Missing Codex installed array")?;
            let entries=list.iter().map(|p|json!({"id":p["pluginId"],"name":p["name"],"version":p["version"],"path":"","managed":false})).collect();
            Ok((entries, hash(&doc["installed"])))
        }
        _ => unreachable!(),
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
pub fn identity(h: &str, artifact: &Path) -> Result<(String, String)> {
    let manifest = manifest(h)?;
    let v: Value = if h == "hermes" {
        serde_yaml::from_slice(&fs::read(artifact.join(manifest))?)?
    } else {
        read(&artifact.join(manifest))?
    };
    let name = str_field(&v, "name")?.to_owned();
    ensure!(
        !name.is_empty() && !name.starts_with('-') && !name.contains(['@', '/', '\\'])
            || matches!(h, "pi" | "opencode"),
        "Invalid native plugin name"
    );
    Ok((name, v["version"].as_str().unwrap_or("").to_owned()))
}
pub fn native_id(h: &str, plugin_id: &str, artifact: &Path) -> Result<String> {
    let (name, _) = identity(h, artifact)?;
    match h {
        "claude-code" | "codex" => Ok(format!("{name}@muro-{plugin_id}")),
        "opencode" => Ok(url::Url::from_directory_path(artifact)
            .map_err(|_| anyhow::anyhow!("Cannot form artifact URL"))?
            .to_string()),
        "pi" => Ok(artifact.to_string_lossy().to_string()),
        "hermes" => Ok(name),
        _ => bail!("Unsupported adapter"),
    }
}
pub fn install(
    target: &Value,
    plugin_id: &str,
    artifact: &Path,
    previous: Option<&str>,
    kind: &str,
) -> Result<String> {
    ensure!(
        matches!(kind, "install" | "update" | "reinstall"),
        "Invalid native install operation: {kind}"
    );
    let h = str_field(target, "harness")?;
    let id = native_id(h, plugin_id, artifact)?;
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
        let repo = data.join("native-sources").join("hermes").join(plugin_id);
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
        let name = identity(h, artifact)?.0;
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
        let relative = format!("./releases/{digest}");
        let file = marketplace(h).with_context(|| format!("{h} has no marketplace"))?;
        let source = if h == "claude-code" {
            json!(relative)
        } else {
            json!({"source":"local","path":relative})
        };
        let entry = if h == "claude-code" {
            json!({"name":name,"source":source,"version":identity(h,artifact)?.1})
        } else {
            json!({"name":name,"source":source,"policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"},"category":"Productivity"})
        };
        write(
            &market.join(file),
            &json!({"name":format!("muro-{plugin_id}"),"owner":{"name":"Muro"},"interface":{"displayName":"Muro registry"},"plugins":[entry]}),
        )?;
        let marketplaces: Value = serde_json::from_str(&run(
            target,
            &[
                "plugin".into(),
                "marketplace".into(),
                "list".into(),
                "--json".into(),
            ],
        )?)?;
        let list = if h == "codex" {
            marketplaces["marketplaces"].as_array()
        } else {
            marketplaces.as_array()
        }
        .context("Unexpected native marketplace list")?;
        let market_name = format!("muro-{plugin_id}");
        if !list.iter().any(|m| m["name"] == market_name) {
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
        if h == "claude-code" && previous.is_some() {
            run(
                target,
                &[
                    "plugin".into(),
                    "uninstall".into(),
                    previous.unwrap().into(),
                    "--scope".into(),
                    "user".into(),
                ],
            )?;
        }
        let op = if h == "codex" { "add" } else { "install" };
        run(target, &vec!["plugin".into(), op.into(), id.clone()])?;
    }
    Ok(id)
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
        let id = install(&target, "demo", &artifact, None, "install").unwrap();
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
        install(&target, "demo", &artifact, Some(&id), "reinstall").unwrap();
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
        install(&target, "demo", &artifact, Some(&id), "update").unwrap();
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
}
