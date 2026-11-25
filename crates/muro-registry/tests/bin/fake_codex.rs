//! A stand-in for the `plugin` commands of the Codex CLI, for the tests of what Muro does around them
//! (`tests/service.rs` runs it as a target's executable). It keeps its state where Codex keeps it, in
//! the home `CODEX_HOME` names: `[marketplaces.<name>]` and `[plugins."<name>@<marketplace>"]` in
//! `config.toml`, and a copy of each installed plugin in `plugins/cache/<marketplace>/<name>/<version>`.
//!
//! It behaves as codex-cli 0.169.0 was seen to on 2026-11-25, in an isolated home: `plugin list --json`
//! and `plugin marketplace list --json` answer nothing, with exit code 1 and that version's words, when
//! one configured local marketplace has no marketplace file, while `plugin marketplace add`,
//! `plugin add`, `plugin remove` and `plugin marketplace remove` go on working beside it. The list
//! holds a plugin that has its table, its marketplace configured and its copy; removing a plugin that
//! is not there succeeds, and removing a marketplace leaves the tables and the copies of its plugins.
use serde_json::{Value, json};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::exit,
};

const MANIFEST: &str = ".agents/plugins/marketplace.json";

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let home = PathBuf::from(env::var("CODEX_HOME").expect("CODEX_HOME"));
    let file = home.join("config.toml");
    let mut config: Value = match fs::read_to_string(&file) {
        Ok(text) => toml::from_str(&text).expect("config.toml"),
        Err(_) => json!({}),
    };
    let cache = home.join("plugins").join("cache");
    match args.as_slice() {
        ["plugin", "list", "--json"] => {
            refuse_when_broken(&config, "failed to load configured marketplace snapshot(s)");
            let mut installed = vec![];
            for (id, table) in config["plugins"].as_object().into_iter().flatten() {
                let (name, market) = id.split_once('@').expect("plugin id");
                let version = fs::read_dir(cache.join(market).join(name))
                    .ok()
                    .and_then(|mut copies| copies.next())
                    .and_then(|copy| copy.ok())
                    .and_then(|copy| copy.file_name().into_string().ok());
                if let (Some(version), true) = (version, config["marketplaces"][market].is_object()) {
                    installed.push(json!({"pluginId":id,"name":name,"marketplaceName":market,"version":version,
                        "installed":true,"enabled":table["enabled"].as_bool().unwrap_or(true)}));
                }
            }
            println!("{}", json!({"installed":installed,"available":[]}));
        }
        ["plugin", "marketplace", "list", "--json"] => {
            refuse_when_broken(&config, "failed to load marketplace(s)");
            let listed: Vec<Value> = config["marketplaces"]
                .as_object()
                .into_iter()
                .flatten()
                .map(|(name, market)| json!({"name":name,"root":market["source"]}))
                .collect();
            println!("{}", json!({"marketplaces":listed}));
        }
        ["plugin", "marketplace", "add", root] => {
            let Some(manifest) = manifest(Path::new(root)) else {
                fail(&format!("{root}: marketplace root does not contain a supported manifest"))
            };
            let name = manifest["name"].as_str().expect("marketplace name").to_owned();
            if !config["marketplaces"].is_object() {
                config["marketplaces"] = json!({});
            }
            config["marketplaces"][&name] = json!({"source_type":"local","source":root});
            save(&file, &config);
            println!("Added marketplace `{name}` from {root}.");
        }
        // As Codex does: the marketplace goes, the tables and the copies of its plugins stay.
        ["plugin", "marketplace", "remove", name] => {
            let removed = config["marketplaces"].as_object_mut().and_then(|all| all.remove(*name));
            if removed.is_none() {
                fail(&format!("marketplace `{name}` is not configured or installed"))
            }
            save(&file, &config);
            println!("Removed marketplace `{name}`.");
        }
        ["plugin", "add", id] => {
            let (name, market) = id.split_once('@').expect("PLUGIN@MARKETPLACE");
            let Some(root) = config["marketplaces"][market]["source"].as_str().map(PathBuf::from) else {
                fail(&format!("marketplace `{market}` is not configured"))
            };
            let Some(manifest) = manifest(&root) else {
                fail(&format!("marketplace `{market}` cannot be loaded"))
            };
            let Some(entry) = manifest["plugins"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|entry| entry["name"] == name)
            else {
                fail(&format!("plugin `{name}` was not found in marketplace `{market}`"))
            };
            let source = root.join(entry["source"]["path"].as_str().expect("local plugin path"));
            let plugin: Value = serde_json::from_slice(
                &fs::read(source.join(".codex-plugin").join("plugin.json")).expect("plugin.json"),
            )
            .expect("plugin.json");
            let version = plugin["version"].as_str().expect("plugin version");
            let copies = cache.join(market).join(name);
            let _ = fs::remove_dir_all(&copies);
            copy(&source, &copies.join(version));
            if !config["plugins"].is_object() {
                config["plugins"] = json!({});
            }
            config["plugins"][*id] = json!({"enabled":true});
            save(&file, &config);
            println!("Added plugin `{name}` from marketplace `{market}`.");
        }
        ["plugin", "remove", id] => {
            let (name, market) = id.split_once('@').expect("PLUGIN@MARKETPLACE");
            let _ = fs::remove_dir_all(cache.join(market).join(name));
            if let Some(plugins) = config["plugins"].as_object_mut() {
                plugins.remove(*id);
            }
            save(&file, &config);
            println!("Removed plugin `{name}` from marketplace `{market}`.");
        }
        other => fail(&format!("the stand-in does not know `{}`", other.join(" "))),
    }
}

/// The marketplace file of a marketplace's folder, when it has one that reads.
fn manifest(root: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(root.join(MANIFEST)).ok()?).ok()
}

/// Ends as Codex does when a configured marketplace cannot be loaded: every one named, nothing listed.
fn refuse_when_broken(config: &Value, heading: &str) {
    let broken: Vec<String> = config["marketplaces"]
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(name, market)| {
            let source = market["source"].as_str().unwrap_or_default();
            manifest(Path::new(source)).is_none().then(|| {
                format!("- `{name}` at {source}: marketplace root does not contain a supported manifest")
            })
        })
        .collect();
    if !broken.is_empty() {
        fail(&format!("{heading}:\n{}", broken.join("\n")));
    }
}

fn fail(message: &str) -> ! {
    eprintln!("Error: {message}");
    exit(1)
}

fn save(file: &Path, config: &Value) {
    fs::write(file, toml::to_string(config).expect("config as TOML")).expect("config.toml");
}

fn copy(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("copy folder");
    for entry in fs::read_dir(from).expect("plugin folder") {
        let entry = entry.expect("plugin entry");
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).expect("plugin file");
        }
    }
}
