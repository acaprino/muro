//! The simulator (ADR-0028 decision 10): one free-text request run against a project's decision graph
//! through the engine the settings name. The AI decides which capabilities the request activates;
//! the factory prepares the material and validates the answer with the runtime's own rules
//! (`muro project simulate*`), and this module only reaches the AI:
//!
//! - engine `api`: `muro project simulate` calls an OpenAI-compatible endpoint itself. The key is read
//!   by the factory from the environment of this process, by the variable's name: it is never an
//!   argument, a setting or a file here.
//! - engine `harness`: a coding agent on this computer, headless, with `muro mcp` registered for the
//!   call only. It calls `simulate_prepare`, classifies, calls `simulate_check`. Claude Code's
//!   stream is read for the real `simulate_check` result (what the validator said, not what the
//!   model says it said); Codex's last message is that result as the model relayed it.
//!
//! An invalid answer is a result (`valid: false` with its errors), never repaired here.
use crate::{exec, factory::Factory};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

/// Under the 600 seconds the CLI boundary waits for one request.
pub const LIMIT: Duration = Duration::from_secs(540);
const TASK_LIMIT: usize = 8000;
/// The name the MCP server has in the harness: it is part of the tool names Claude Code is allowed.
const SERVER: &str = "muro";
const TOOLS: [&str; 2] = ["simulate_prepare", "simulate_check"];

/// The request, checked where it enters: text, not empty, not absurdly long, no NUL.
pub fn task(payload: &Value) -> Result<String> {
    let task = payload["task"].as_str().context("Write the request to simulate")?;
    ensure!(!task.trim().is_empty(), "Write the request to simulate");
    ensure!(task.chars().count() <= TASK_LIMIT, "The request is too long (at most {TASK_LIMIT} characters)");
    ensure!(!task.contains('\0'), "The request holds a character that cannot be sent");
    Ok(task.to_owned())
}

/// The stack tokens, when there are any: a short list of short texts without control characters. Whether
/// a token means anything is the factory's check, not this one.
pub fn stack(payload: &Value) -> Result<Vec<String>> {
    let Some(tokens) = payload.get("stack").filter(|v| !v.is_null()) else {
        return Ok(vec![]);
    };
    let tokens = tokens.as_array().context("stack must be a list of tokens")?;
    ensure!(tokens.len() <= 20, "Too many stack tokens");
    tokens
        .iter()
        .map(|token| {
            let token = token.as_str().context("A stack token is text")?;
            ensure!(
                !token.is_empty() && token.len() <= 100 && !token.chars().any(char::is_control),
                "A stack token is not valid"
            );
            Ok(token.to_owned())
        })
        .collect()
}

/// A run's name: the page may pick it to cancel the run later. It names a folder, so it is a plain id.
fn run_id(payload: &Value) -> Result<String> {
    match payload.get("run").filter(|v| !v.is_null()) {
        None => Ok(uuid::Uuid::new_v4().to_string()),
        Some(run) => {
            let run = run.as_str().context("run must be text")?;
            ensure!(
                !run.is_empty() && run.len() <= 64 && run.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
                "Invalid run ID"
            );
            Ok(run.to_owned())
        }
    }
}

fn work_dir(data: &Path, run: &str) -> PathBuf {
    data.join("simulations").join(run)
}

/// Removes a run's folder when the run is over, however it ended.
struct Work(PathBuf);

impl Drop for Work {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Asks a running simulation to stop: its process and what it started are ended within a moment.
pub fn cancel(data: &Path, payload: &Value) -> Result<Value> {
    let run = run_id(payload)?;
    ensure!(payload["run"].is_string(), "Name the run to cancel");
    let dir = work_dir(data, &run);
    ensure!(dir.is_dir(), "That simulation is not running");
    std::fs::write(dir.join("cancel"), b"cancel")?;
    Ok(json!({"status":"cancelling"}))
}

// --- the API engine ---------------------------------------------------------------------------

/// The factory's arguments for one request through an endpoint. The key is not among them, only the
/// name of the variable it is read from; `--name=value` forms, so a request that begins with a dash is
/// still its value.
pub fn api_args(file: &Path, cache: &Path, task: &str, stack: &[String], ai: &Value) -> Vec<String> {
    let mut args = vec!["project".to_owned(), "simulate".into(), file.to_string_lossy().into_owned(), format!("--task={task}")];
    args.extend(stack.iter().map(|token| format!("--stack={token}")));
    args.push(format!("--model={}", ai["model"].as_str().unwrap_or("")));
    args.push(format!("--api-base={}", ai["api_base"].as_str().unwrap_or("")));
    args.push(format!("--api-key-env={}", ai["api_key_env"].as_str().unwrap_or("")));
    args.extend(["--cache".into(), cache.to_string_lossy().into_owned()]);
    args
}

fn through_api(factory: &Factory, file: &Path, cache: &Path, task: &str, stack: &[String], ai: &Value, cancelled: &dyn Fn() -> bool) -> Result<Value> {
    // The address and the key's name were checked with the whole `ai` setting before anything ran; the
    // registry saves a model that is still empty (a page saves on every change), a request needs one.
    let model = ai["model"].as_str().unwrap_or("");
    ensure!(!model.is_empty(), "Choose a model in Settings, AI");
    let mut result = factory.json(&api_args(file, cache, task, stack, ai), "The simulation", cancelled, LIMIT)?;
    let object = result.as_object_mut().context("The simulation did not answer with an object")?;
    object.insert("engine".into(), json!("api"));
    object.insert("model".into(), json!(model));
    object.insert("cost_usd".into(), Value::Null);
    Ok(result)
}

// --- the harness engine -----------------------------------------------------------------------

/// What the harness is asked: the whole job, in order, so the classification is its own judgment and the
/// validation is the factory's. The request and the package's manifest go in as JSON strings, so no
/// character of either can be read as part of the instructions. The manifest is the `sources.json` of
/// the project's unpacked folder (the factory's own cache, which this runtime names), so the MCP server
/// reads the project exactly as the digest said and keeps no cache of its own.
pub fn harness_prompt(manifest: &Path, task: &str, stack: &[String]) -> String {
    let project = json!({"manifest": manifest.to_string_lossy()});
    let prepare = json!({"manifest": manifest.to_string_lossy(), "task": task, "stack": stack});
    format!(
        "You classify one simulated request against a Muro project. Do exactly these steps, with the \
tools of the MCP server {SERVER} and no other tool.\n\
1. Call {prepare_tool} with these arguments: {prepare}\n\
2. It returns an object with a context and a prompt. Answer that prompt yourself, by the meaning of the \
request and of the capabilities (never by matching words): produce the JSON object it asks for.\n\
3. Call {check_tool} once with the argument manifest from {project}, context=the context it returned, \
unchanged, answer=your JSON object.\n\
4. Your last message is exactly the text {check_tool} returned, and nothing else. If it says the \
answer is invalid, report that as it is: do not call the tools again and do not repair the answer.",
        prepare_tool = TOOLS[0],
        check_tool = TOOLS[1],
    )
}

/// The MCP server the harness starts for the call: the factory's own launcher, run by the same Python.
pub fn mcp_config(factory: &Factory) -> Value {
    let (python, args) = factory.invocation(&["mcp".to_owned()]);
    json!({"mcpServers":{SERVER:{"type":"stdio","command":python,"args":args}}})
}

/// Claude Code, headless, with nothing but the two simulate tools: no built-in tool, no other MCP
/// server, no skills, nothing that would ask (anything not allowed is denied), a dollar budget, a
/// stream that carries the tool results, no session left behind. Every flag is in `claude --help`
/// (2.1.327); `--allowedTools` and `--tools` take lists, so each gets one argument and a flag after it.
pub fn claude_args(prompt: &str, config: &Path, budget: f64) -> Result<Vec<String>> {
    muro_registry::ai::validate_budget(budget)?;
    let allowed = TOOLS.map(|tool| format!("mcp__{SERVER}__{tool}")).join(",");
    Ok(vec![
        "-p".into(),
        prompt.into(),
        "--mcp-config".into(),
        config.to_string_lossy().into_owned(),
        "--strict-mcp-config".into(),
        "--allowedTools".into(),
        allowed,
        "--tools".into(),
        String::new(),
        "--permission-mode".into(),
        "dontAsk".into(),
        // The person's plugins, hooks and skills load every turn otherwise (about 114,000 tokens
        // on the owner's setup, AGENTS.md): this call needs none of them.
        "--setting-sources".into(),
        "project,local".into(),
        "--disable-slash-commands".into(),
        "--max-budget-usd".into(),
        budget.to_string(),
        "--output-format".into(),
        "stream-json".into(),
        "--verbose".into(),
        "--no-session-persistence".into(),
    ])
}

/// A TOML value for `-c key=value`, written as a JSON string or list: valid TOML for the text here.
fn toml(value: &Value) -> String {
    value.to_string()
}

/// Codex, headless (`codex exec --help`, 0.169.0), with the MCP server given for the call through `-c`
/// (the keys `codex mcp add` writes), no session kept, shell commands read-only, the last message
/// written to `last`. Codex has no dollar budget flag: none is claimed.
pub fn codex_args(prompt: &str, factory: &Factory, work: &Path, last: &Path) -> Vec<String> {
    let (python, args) = factory.invocation(&["mcp".to_owned()]);
    vec![
        "exec".into(),
        "--ephemeral".into(),
        "--skip-git-repo-check".into(),
        "-s".into(),
        "read-only".into(),
        "-C".into(),
        work.to_string_lossy().into_owned(),
        "-o".into(),
        last.to_string_lossy().into_owned(),
        "-c".into(),
        format!("mcp_servers.{SERVER}.command={}", toml(&json!(python))),
        "-c".into(),
        format!("mcp_servers.{SERVER}.args={}", toml(&json!(args))),
        prompt.into(),
    ]
}

/// The first JSON object in a text a model wrote, which may wrap it in prose or a code fence.
pub fn first_json_object(text: &str) -> Option<Value> {
    let mut start = text.find('{');
    while let Some(at) = start {
        if let Some(Ok(value)) = serde_json::Deserializer::from_str(&text[at..]).into_iter::<Value>().next() {
            if value.is_object() {
                return Some(value);
            }
        }
        start = text[at + 1..].find('{').map(|next| at + 1 + next);
    }
    None
}

/// What the validator said and what the run cost.
#[derive(Debug)]
pub struct Harvest {
    pub check: Value,
    pub cost_usd: Option<f64>,
    /// The check is the model's relay of the result (the stream carried no result of the tool to read),
    /// not the result itself.
    pub relayed: bool,
}

fn text_of(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter().filter_map(|part| part["text"].as_str()).collect::<Vec<_>>().join(""),
        _ => String::new(),
    }
}

/// The real result of the last `simulate_check` call in Claude Code's stream (`--output-format
/// stream-json --verbose`): the `tool_result` the MCP server returned to the harness, found through
/// its `tool_use` id, and the run's cost from the closing `result` line. What the model says in its
/// last message is not read as the check. A run that ended in error, or never called the tool, is an
/// error with the harness's own words.
pub fn claude_result(stream: &str) -> Result<Harvest> {
    let check_tool = format!("mcp__{SERVER}__{}", TOOLS[1]);
    let mut calls = std::collections::HashSet::new();
    let (mut check, mut failure, mut cost, mut closing) = (None, None, None, None);
    let mut answered = false;
    for line in stream.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else { continue };
        match event["type"].as_str() {
            Some("assistant") => {
                for part in event["message"]["content"].as_array().into_iter().flatten() {
                    if part["type"] == "tool_use" && part["name"] == check_tool.as_str() {
                        if let Some(id) = part["id"].as_str() {
                            calls.insert(id.to_owned());
                        }
                    }
                }
            }
            Some("user") => {
                for part in event["message"]["content"].as_array().into_iter().flatten() {
                    let ours = part["tool_use_id"].as_str().is_some_and(|id| calls.contains(id));
                    if part["type"] == "tool_result" && ours {
                        answered = true;
                        let text = text_of(&part["content"]);
                        match (part["is_error"] == true, serde_json::from_str::<Value>(text.trim())) {
                            (false, Ok(value)) if value["valid"].is_boolean() => {
                                check = Some(value);
                                failure = None;
                            }
                            _ => failure = Some(text),
                        }
                    }
                }
            }
            Some("result") => {
                cost = event["total_cost_usd"].as_f64();
                closing = Some((event["is_error"] == true, text_of(&event["result"])));
            }
            _ => {}
        }
    }
    if let Some(check) = check {
        return Ok(Harvest { check, cost_usd: cost, relayed: false });
    }
    if let Some(text) = failure {
        bail!("simulate_check did not return a result: {}", text.trim());
    }
    match closing {
        Some((true, text)) => bail!("Claude Code stopped: {}", text.trim()),
        // The tool was called but the stream shows no answer of it to read (a shape this reader does not
        // know): the model's relay of it is taken, and marked as one. A tool that was never called
        // is never excused: a result nobody validated is not a result.
        Some((false, text)) if !calls.is_empty() && !answered => {
            let relay = first_json_object(&text).filter(|value| value["valid"].is_boolean());
            let check = relay.context("Claude Code called simulate_check but its result was not in the stream")?;
            Ok(Harvest { check, cost_usd: cost, relayed: true })
        }
        Some((false, _)) => bail!("Claude Code finished without calling simulate_check"),
        None => bail!("Claude Code printed no result"),
    }
}

/// Codex's last message, which the prompt asks to be the `simulate_check` result: its first JSON object,
/// with a `valid` flag. It is the result as the model relayed it.
pub fn codex_result(last_message: &str) -> Result<Value> {
    let found = first_json_object(last_message).filter(|value| value["valid"].is_boolean());
    found.with_context(|| "Codex's last message was not a simulate_check result".to_owned())
}

fn resolved(harness: &str) -> Result<String> {
    let exe = crate::cli::resolve_executable(harness)?;
    ensure!(!mukade::exe::is_batch(&exe), "Choose an executable, not a batch launcher");
    Ok(exe)
}

fn through_harness(factory: &Factory, manifest: &Path, task: &str, stack: &[String], ai: &Value, work: &Path, cancelled: &dyn Fn() -> bool) -> Result<Value> {
    let prompt = harness_prompt(manifest, task, stack);
    let harness = ai["harness"].as_str().unwrap_or("claude-code");
    match harness {
        "claude-code" => {
            let config = work.join("mcp.json");
            std::fs::write(&config, serde_json::to_vec_pretty(&mcp_config(factory))?)?;
            let args = claude_args(&prompt, &config, ai["budget_usd"].as_f64().unwrap_or(f64::NAN))?;
            let mut command = std::process::Command::new(resolved("claude-code")?);
            command.args(args).current_dir(work);
            let done = exec::capture(command, "Claude Code", cancelled, LIMIT)?;
            let harvest = claude_result(&done.stdout).map_err(|error| match (done.status.success(), done.stderr.trim()) {
                (false, reason) if !reason.is_empty() => anyhow::anyhow!("Claude Code failed ({}): {reason}", done.status),
                _ => error,
            })?;
            let mut result = harvest.check;
            let object = result.as_object_mut().context("simulate_check did not answer with an object")?;
            object.insert("engine".into(), json!("harness"));
            object.insert("harness".into(), json!("claude-code"));
            object.insert("cost_usd".into(), json!(harvest.cost_usd));
            if harvest.relayed {
                object.insert("relayed".into(), json!(true));
            }
            Ok(result)
        }
        "codex" => {
            let last = work.join("last-message.txt");
            let mut command = std::process::Command::new(resolved("codex")?);
            command.args(codex_args(&prompt, factory, work, &last)).current_dir(work);
            let done = exec::capture(command, "Codex", cancelled, LIMIT)?;
            let message = std::fs::read_to_string(&last).unwrap_or_default();
            if !done.status.success() && message.trim().is_empty() {
                bail!("Codex failed ({}): {}", done.status, done.stderr.trim());
            }
            let mut result = codex_result(&message)?;
            let object = result.as_object_mut().context("The result is not an object")?;
            object.insert("engine".into(), json!("harness"));
            object.insert("harness".into(), json!("codex"));
            object.insert("cost_usd".into(), Value::Null);
            // Codex's stream is not read: this is the result as the model relayed it.
            object.insert("relayed".into(), json!(true));
            Ok(result)
        }
        _ => bail!("The AI harness must be claude-code or codex"),
    }
}

/// `simulate {id, task, stack?, run?}`: the check result of the request against the project, plus the
/// engine, the model or harness, the cost when the engine reports it and the time it took.
pub fn simulate(data: &Path, payload: &Value) -> Result<Value> {
    let registry = muro_registry::service::request(data, "registry", json!({}))?;
    let settings = &registry["settings"];
    let ai = &settings["ai"];
    muro_registry::ai::validate(ai)?;
    let factory = Factory::from_settings(settings)?;
    let file = crate::projects::listed_file(&registry, payload["id"].as_str().unwrap_or(""))?;
    let (task, stack) = (task(payload)?, stack(payload)?);
    let run = run_id(payload)?;
    let work = work_dir(data, &run);
    ensure!(!work.exists(), "That simulation is already running");
    std::fs::create_dir_all(&work)?;
    let _work = Work(work.clone());
    let cancelled = || work.join("cancel").exists();
    let cache = crate::projects::cache_dir(data);
    let started = Instant::now();
    let mut result = match ai["engine"].as_str() {
        Some("api") => through_api(&factory, &file, &cache, &task, &stack, ai, &cancelled)?,
        _ => {
            // The project is unpacked once, by the factory, into this runtime's cache; the harness's
            // MCP server reads that folder, so what it classifies is the file as it is now.
            let read = factory.project_info(&file, &cache, true)?;
            if let Some(error) = read["error"].as_str() {
                bail!("{error}");
            }
            let digest = read["digest"].as_str().context("The factory gave no digest")?;
            let manifest = cache.join(digest).join("sources.json");
            ensure!(manifest.is_file(), "The unpacked project has no sources.json");
            through_harness(&factory, &manifest, &task, &stack, ai, &work, &cancelled)?
        }
    };
    result["duration_ms"] = json!(started.elapsed().as_millis() as u64);
    Ok(result)
}
