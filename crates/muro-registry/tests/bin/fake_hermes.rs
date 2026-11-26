//! Narrow Hermes CLI fixture: read the actual pinned Git tree that Sync hands to the host.
use serde_json::{Value, json};
use std::{env, fs, path::PathBuf, process::Command};

fn main() {
    let args: Vec<_> = env::args().skip(1).collect();
    let home = PathBuf::from(env::var_os("HERMES_HOME").unwrap());
    let state = home.join("installed.json");
    let mut plugins: Vec<Value> = if state.exists() {
        serde_json::from_slice(&fs::read(&state).unwrap()).unwrap()
    } else { Vec::new() };
    let args: Vec<_> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        ["plugins", "list", "--user", "--json"] => {
            println!("{}", json!(plugins));
            return;
        }
        ["plugins", "install", source, "--ref", revision, "--enable", "--yes-deps", rest @ ..] => {
            let repo = url::Url::parse(source).unwrap().to_file_path().unwrap();
            let record = ["plugin.yaml", "plugin.json"].into_iter().find_map(|manifest| {
                let file = Command::new("git").arg("--git-dir").arg(&repo)
                    .args(["show", &format!("{revision}:{manifest}")]).output().unwrap();
                if !file.status.success() { return None; }
                Some(serde_yaml::from_slice::<Value>(&file.stdout).unwrap())
            }).expect("the pinned tree needs its own manifest");
            if record["name"] == "demo-mcp" && home.join("refuse-server").exists() {
                std::process::exit(1);
            }
            if plugins.iter().any(|p| p["name"] == record["name"]) {
                assert_eq!(rest, &["--force"]);
                plugins.retain(|p| p["name"] != record["name"]);
            }
            plugins.push(json!({"name":record["name"],"version":record["version"],"status":"enabled"}));
        }
        ["plugins", "remove", name] => plugins.retain(|p| p["name"].as_str() != Some(*name)),
        _ => panic!("unexpected Hermes call: {args:?}"),
    }
    fs::write(state, serde_json::to_vec(&plugins).unwrap()).unwrap();
}
