//! Muro's own MCP server in a coding agent of the registry: `muro mcp`, every tool of the factory,
//! registered at user scope with the agent's own command, so each of its sessions can drive the factory
//! (docs/cli.md, "Drive the factory from Claude Code or Codex"). Claude Code and Codex only: their
//! `mcp add`, `mcp remove` and the place of the entry were run on this machine against a scratch
//! configuration folder (Claude Code 2.1.332, Codex 0.169.0, 2026-11-28). The entry is the factory's
//! launcher run by the registry's Python, both absolute paths: a Muro moved or updated elsewhere leaves
//! an entry that starts another copy, which the status says (`current` false) and Install replaces.
use crate::{exec, factory::Factory, simulate::SERVER};
use anyhow::{Context, Result, ensure};
use mukade::{catalog, model::HarnessId};
use muro_registry::projects::same_file;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

const UNSUPPORTED: &str = "Muro installs its MCP server in Claude Code and Codex only";
/// What one `mcp` command of an agent may take: it reads or writes one configuration file.
const LIMIT: Duration = Duration::from_secs(60);

/// Where an agent keeps the entry, and how its command reaches that place.
enum Agent {
    /// The user's MCP servers are in `file`; `folder` is the configuration folder the command is given
    /// through `CLAUDE_CONFIG_DIR`, none for the folder Claude Code uses by itself.
    Claude { file: PathBuf, folder: Option<String> },
    /// `config.toml` of `CODEX_HOME`, read and written by `codex mcp` alone.
    Codex { home: String },
}

/// Claude Code keeps the user's MCP servers in `.claude.json`: inside the folder `CLAUDE_CONFIG_DIR`
/// names, but beside its default folder (`~/.claude.json`) when the variable is not set. A target on
/// the default folder is reached without the variable, as the person's own sessions reach it: named, it
/// would put the entry in `~/.claude/.claude.json`, which they never read. `inherited` is the variable
/// this process has, which the command then keeps.
fn claude_place(root: &Path, default: Option<&Path>, inherited: Option<&Path>) -> (PathBuf, Option<String>) {
    let spelled = |path: &Path| same_file(&path.to_string_lossy());
    let is_default = default.is_some_and(|folder| spelled(folder) == spelled(root));
    match (is_default, inherited, root.parent()) {
        (true, Some(folder), _) => (folder.join(".claude.json"), None),
        (true, None, Some(home)) => (home.join(".claude.json"), None),
        _ => (root.join(".claude.json"), Some(root.to_string_lossy().into_owned())),
    }
}

fn agent(target: &Value) -> Result<Option<Agent>> {
    let root = Path::new(target["root"].as_str().context("The harness has no configuration folder")?);
    Ok(match target["harness"].as_str() {
        Some("claude-code") => {
            let default = catalog::config_default_with(HarnessId::ClaudeCode, &catalog::Vars::from_env());
            let inherited = std::env::var_os("CLAUDE_CONFIG_DIR").filter(|v| !v.is_empty()).map(PathBuf::from);
            let (file, folder) = claude_place(root, default.as_deref(), inherited.as_deref());
            Some(Agent::Claude { file, folder })
        }
        Some("codex") => Some(Agent::Codex { home: root.to_string_lossy().into_owned() }),
        _ => None,
    })
}

/// The agent's own command, run with the target's executable on the target's folder. Its refusal is
/// the error, in its own words.
fn run(target: &Value, agent: &Agent, args: &[String]) -> Result<String> {
    let exe = target["executable"].as_str().filter(|exe| !exe.trim().is_empty()).context("The harness has no executable")?;
    ensure!(!mukade::exe::is_batch(exe), "Choose an executable, not a batch launcher");
    let mut command = Command::new(exe);
    command.args(args);
    match agent {
        Agent::Claude { folder: Some(folder), .. } => { command.env("CLAUDE_CONFIG_DIR", folder); }
        Agent::Claude { folder: None, .. } => {}
        Agent::Codex { home } => { command.env("CODEX_HOME", home); }
    }
    let what = format!("{} {}", target["name"].as_str().unwrap_or(exe), args[..2].join(" "));
    let done = exec::capture(command, &what, &|| false, LIMIT)?;
    let said = if done.stderr.trim().is_empty() { done.stdout.trim() } else { done.stderr.trim() };
    ensure!(done.status.success(), "{what} failed ({}): {said}", done.status);
    Ok(done.stdout)
}

/// The entry named `SERVER` in a `.claude.json`, or null.
fn claude_entry(config: &Value) -> Value {
    config["mcpServers"][SERVER].clone()
}

/// The entry named `SERVER` in what `codex mcp list --json` prints (its `transport`: command and args), or null.
fn codex_entry(listed: &Value) -> Value {
    listed.as_array().into_iter().flatten()
        .find(|server| server["name"] == SERVER)
        .map_or(Value::Null, |server| server["transport"].clone())
}

/// The agent's entry named `SERVER` (`command`, `args`), or null when it has none.
fn entry(target: &Value, agent: &Agent) -> Result<Value> {
    match agent {
        Agent::Claude { file, .. } => match std::fs::read_to_string(file) {
            Ok(text) => Ok(claude_entry(&serde_json::from_str(&text).with_context(|| format!("{} is not JSON", file.display()))?)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Value::Null),
            Err(error) => Err(error).with_context(|| format!("Cannot read {}", file.display())),
        },
        Agent::Codex { .. } => {
            let listed = run(target, agent, &words(&["mcp", "list", "--json"]))?;
            Ok(codex_entry(&serde_json::from_str(listed.trim()).context("Codex did not list its MCP servers as JSON")?))
        }
    }
}

fn words(all: &[&str]) -> Vec<String> {
    all.iter().map(|word| (*word).to_owned()).collect()
}

/// `mcp add` at user scope, the launcher after `--` so that its `-X` is not read as an option of the agent.
fn add_args(agent: &Agent, (python, args): &(String, Vec<String>)) -> Vec<String> {
    let mut all = match agent {
        Agent::Claude { .. } => words(&["mcp", "add", "-s", "user", SERVER, "--"]),
        Agent::Codex { .. } => words(&["mcp", "add", SERVER, "--"]),
    };
    all.push(python.clone());
    all.extend(args.iter().cloned());
    all
}

fn remove_args(agent: &Agent) -> Vec<String> {
    match agent {
        Agent::Claude { .. } => words(&["mcp", "remove", "-s", "user", SERVER]),
        Agent::Codex { .. } => words(&["mcp", "remove", SERVER]),
    }
}

/// The target the payload names (`target_id`) and the registry's settings.
fn place(data: &Path, payload: &Value) -> Result<(Value, Value)> {
    let id = payload["target_id"].as_str().context("Name the harness")?;
    let registry = muro_registry::service::request(data, "registry", json!({}))?;
    let target = registry["targets"].as_array().into_iter().flatten()
        .find(|target| target["id"] == id).cloned()
        .with_context(|| format!("No harness {id} in the list"))?;
    Ok((target, registry["settings"].clone()))
}

/// The server as this Muro starts it: its Python and the factory's launcher with `mcp`, every tool.
fn wanted(settings: &Value) -> Result<(String, Vec<String>)> {
    Ok(Factory::from_settings(settings)?.invocation(&["mcp".to_owned()]))
}

fn report(target: &Value, entry: &Value, wanted: Option<&(String, Vec<String>)>) -> Value {
    let current = wanted.is_some_and(|(python, args)| entry["command"] == json!(python) && entry["args"] == json!(args));
    json!({"target_id":target["id"],"supported":true,"registered":!entry.is_null(),"current":current})
}

/// `mcp_status {target_id}`: whether the agent has an entry by Muro's name and whether it starts this
/// Muro (`current`). `supported` is false, and nothing runs, for an agent Muro does not register it in.
pub fn status(data: &Path, payload: &Value) -> Result<Value> {
    let (target, settings) = place(data, payload)?;
    let Some(agent) = agent(&target)? else {
        return Ok(json!({"target_id":target["id"],"supported":false,"registered":false,"current":false}));
    };
    let wanted = wanted(&settings)?;
    Ok(report(&target, &entry(&target, &agent)?, Some(&wanted)))
}

/// `install_mcp {target_id}`: registers the server, replacing an entry of the same name (another copy of
/// Muro, an older place), and answers the status read again.
pub fn install(data: &Path, payload: &Value) -> Result<Value> {
    let (target, settings) = place(data, payload)?;
    let agent = agent(&target)?.context(UNSUPPORTED)?;
    let wanted = wanted(&settings)?;
    // Claude Code refuses to add a name it has; Codex would overwrite it. One way for both.
    if !entry(&target, &agent)?.is_null() {
        run(&target, &agent, &remove_args(&agent))?;
    }
    run(&target, &agent, &add_args(&agent, &wanted))?;
    Ok(report(&target, &entry(&target, &agent)?, Some(&wanted)))
}

/// `remove_mcp {target_id}`: takes the entry out, when there is one, and answers the status read again.
pub fn remove(data: &Path, payload: &Value) -> Result<Value> {
    let (target, _) = place(data, payload)?;
    let agent = agent(&target)?.context(UNSUPPORTED)?;
    if !entry(&target, &agent)?.is_null() {
        run(&target, &agent, &remove_args(&agent))?;
    }
    Ok(report(&target, &entry(&target, &agent)?, None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_claude_folder_is_reached_without_the_variable_and_its_entry_is_beside_it() {
        let home = Path::new("/home/me");
        let default = home.join(".claude");
        assert_eq!(claude_place(&default, Some(default.as_path()), None), (home.join(".claude.json"), None));
        // The person's own variable moves the file, and the command keeps it.
        let moved = Path::new("/elsewhere/claude");
        assert_eq!(claude_place(&default, Some(default.as_path()), Some(moved)), (moved.join(".claude.json"), None));
    }

    #[test]
    fn another_claude_folder_is_named_and_holds_its_own_entry() {
        let profile = Path::new("/profiles/work");
        let (file, folder) = claude_place(profile, Some(Path::new("/home/me/.claude")), None);
        assert_eq!(file, profile.join(".claude.json"));
        assert_eq!(folder.as_deref(), Some(profile.to_string_lossy().as_ref()));
    }

    #[cfg(windows)]
    #[test]
    fn the_default_claude_folder_is_known_whatever_its_spelling() {
        let (file, folder) = claude_place(Path::new("c:/users/me/.claude/"), Some(Path::new(r"C:\Users\me\.claude")), None);
        assert_eq!((file, folder), (Path::new("c:/users/me").join(".claude.json"), None));
    }

    #[test]
    fn the_entry_is_read_from_each_agents_own_form() {
        let server = json!({"type":"stdio","command":"python","args":["-X","utf8","C:/m/muro_build.py","mcp"],"env":{}});
        assert_eq!(claude_entry(&json!({"mcpServers":{"other":{},"muro":server}})), server);
        assert!(claude_entry(&json!({"projects":{}})).is_null());
        // As `codex mcp list --json` printed it (0.169.0).
        let transport = json!({"type":"stdio","command":"python","args":["-X","utf8","C:/m/muro_build.py","mcp"],"env":null,"env_vars":[],"cwd":null});
        let listed = json!([{"name":"other","transport":{"command":"node"}},{"name":"muro","enabled":true,"transport":transport}]);
        assert_eq!(codex_entry(&listed), transport);
        assert!(codex_entry(&json!([])).is_null());
    }

    #[test]
    fn the_server_is_added_at_user_scope_and_removed_by_its_name() {
        let claude = Agent::Claude { file: PathBuf::from("/h/.claude.json"), folder: None };
        let codex = Agent::Codex { home: "/h/.codex".into() };
        let wanted = ("py".to_owned(), words(&["-X", "utf8", "/f/muro_build.py", "mcp"]));
        assert_eq!(add_args(&claude, &wanted), words(&["mcp", "add", "-s", "user", "muro", "--", "py", "-X", "utf8", "/f/muro_build.py", "mcp"]));
        assert_eq!(add_args(&codex, &wanted), words(&["mcp", "add", "muro", "--", "py", "-X", "utf8", "/f/muro_build.py", "mcp"]));
        assert_eq!(remove_args(&claude), words(&["mcp", "remove", "-s", "user", "muro"]));
        assert_eq!(remove_args(&codex), words(&["mcp", "remove", "muro"]));
    }

    #[test]
    fn an_entry_is_current_only_when_it_starts_this_muro() {
        let target = json!({"id":"t1"});
        let wanted = ("py".to_owned(), words(&["-X", "utf8", "/f/muro_build.py", "mcp"]));
        let same = json!({"command":"py","args":["-X","utf8","/f/muro_build.py","mcp"]});
        let other = json!({"command":"py","args":["-X","utf8","/old/muro_build.py","mcp"]});
        assert_eq!(report(&target, &same, Some(&wanted)), json!({"target_id":"t1","supported":true,"registered":true,"current":true}));
        assert_eq!(report(&target, &other, Some(&wanted))["current"], false);
        assert_eq!(report(&target, &Value::Null, Some(&wanted)), json!({"target_id":"t1","supported":true,"registered":false,"current":false}));
    }
}
