//! The simulator (ADR-0028 decision 10): one free-text request run against a project's decision graph
//! through the engine the settings name. The AI decides which capabilities the request activates;
//! the factory prepares the material and validates the answer with the runtime's own rules
//! (`muro project simulate*`), and this module only reaches the AI:
//!
//! - engine `api`: `muro project simulate` calls an OpenAI-compatible endpoint itself. The key is read
//!   by the factory from the environment of this process, by the variable's name: it is never an
//!   argument, a setting or a file here.
//! - engine `harness`: a coding agent on this computer, headless, with `muro mcp` registered for the
//!   call only, serving nothing but `simulate_prepare` and `simulate_check` (the text it works from may
//!   come from a project file of anyone: no other tool of the factory is there to call). It calls
//!   `simulate_prepare`, classifies, calls `simulate_check`, and ends with its answer, the JSON object
//!   it classified with. What the page shows is never the harness's report of a result: this module
//!   takes that answer and the context the factory prepared for this request (`simulate-prepare`, run
//!   here before the harness starts, so the harness cannot change what it is judged against) and has
//!   the factory validate them (`simulate-check`).
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
4. Your last message is exactly the JSON object you gave {check_tool} as the answer, and nothing else: \
no code fence, no comment, not the text {check_tool} returned. If {check_tool} says the answer is \
invalid, do not call the tools again and do not repair the answer: your last message is still that answer.",
        prepare_tool = TOOLS[0],
        check_tool = TOOLS[1],
    )
}

/// The arguments the MCP server is started with: the factory's `mcp`, serving the two simulate tools
/// and no other (`muro mcp --tools`). One list, for every harness: Claude Code reads it in its MCP
/// configuration, Codex in `-c mcp_servers.muro.args`.
fn server_args() -> Vec<String> {
    vec!["mcp".to_owned(), "--tools".to_owned(), TOOLS.join(",")]
}

/// The MCP server the harness starts for the call: the factory's own launcher, run by the same Python,
/// serving only what the simulation needs.
pub fn mcp_config(factory: &Factory) -> Value {
    let (python, args) = factory.invocation(&server_args());
    json!({"mcpServers":{SERVER:{"type":"stdio","command":python,"args":args}}})
}

/// Claude Code, headless, with nothing but the two simulate tools: no built-in tool, no other MCP
/// server, no skills, nothing that would ask (anything not allowed is denied), a dollar budget, a
/// stream whose last line carries the last message and the cost, no session left behind. Every flag is in `claude --help`
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
/// written to `last`. Codex has no dollar budget flag: none is claimed. Its configuration has a per-server
/// allow-list, `enabled_tools`, which neither `codex exec --help` nor `codex mcp --help` names: it is the
/// field of the server's configuration that `codex mcp get <name> --json` printed for
/// `-c mcp_servers.muro.enabled_tools=[...]` on this machine (0.169.0). The server is started with
/// `--tools` as well, so the two limits are each enough on their own.
pub fn codex_args(prompt: &str, factory: &Factory, work: &Path, last: &Path) -> Vec<String> {
    let (python, args) = factory.invocation(&server_args());
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
        "-c".into(),
        format!("mcp_servers.{SERVER}.enabled_tools={}", toml(&json!(TOOLS))),
        prompt.into(),
    ]
}

/// A command for a harness: no input, run in the request's own folder, and without the variable the AI
/// key is read from. The key is the factory's to use for the API engine; a harness, and whatever its model
/// makes it run, has no use for it and must not be able to read it.
pub fn harness_command(program: &str, args: Vec<String>, work: &Path, ai: &Value) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    command.args(args).current_dir(work);
    if let Some(name) = ai["api_key_env"].as_str().filter(|name| !name.is_empty()) {
        command.env_remove(name);
    }
    command
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

/// What a harness's run left: the answer it ended with (the classification it gave `simulate_check`),
/// and what the run cost when the harness says. The answer is not a result: it is judged by the factory.
#[derive(Debug)]
pub struct Harvest {
    pub answer: Value,
    pub cost_usd: Option<f64>,
}

/// What the page is told when the harness ended without an answer to judge.
pub const NO_ANSWER: &str = "The agent gave no answer";

fn text_of(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(parts) => parts.iter().filter_map(|part| part["text"].as_str()).collect::<Vec<_>>().join(""),
        _ => String::new(),
    }
}

/// What Claude Code's stream (`--output-format stream-json --verbose`) ends with: the closing `result`
/// line carries the last message the model wrote and the run's cost. The last message is the answer the
/// prompt asks for: its first JSON object. Nothing else in the stream is read as a verdict: the factory
/// judges the answer. A run that ended in error is an error with the harness's own words, and a last
/// message with no JSON object is `NO_ANSWER`.
pub fn claude_result(stream: &str) -> Result<Harvest> {
    let (mut cost, mut closing) = (None, None);
    for line in stream.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else { continue };
        if event["type"] == "result" {
            cost = event["total_cost_usd"].as_f64();
            closing = Some((event["is_error"] == true, text_of(&event["result"])));
        }
    }
    match closing {
        Some((true, text)) => bail!("Claude Code stopped: {}", text.trim()),
        Some((false, text)) => Ok(Harvest { answer: first_json_object(&text).context(NO_ANSWER)?, cost_usd: cost }),
        None => bail!("Claude Code printed no result"),
    }
}

/// Codex's last message (`-o`), which the prompt asks to be the answer: its first JSON object.
pub fn codex_answer(last_message: &str) -> Result<Value> {
    first_json_object(last_message).context(NO_ANSWER)
}

/// The context the factory prepares for this request (`muro project simulate-prepare`): the one the
/// harness's answer is judged against. It is asked of the factory here, with the real request, before the
/// harness starts; the harness never supplies it.
pub fn prepared_context(factory: &Factory, manifest: &Path, task: &str, stack: &[String], cancelled: &dyn Fn() -> bool) -> Result<Value> {
    let mut args = vec!["project".to_owned(), "simulate-prepare".into(), "--manifest".into(), manifest.to_string_lossy().into_owned(), format!("--task={task}")];
    args.extend(stack.iter().map(|token| format!("--stack={token}")));
    let mut prepared = factory.json(&args, "Preparing the request", cancelled, crate::factory::READ_LIMIT)?;
    let context = prepared["context"].take();
    ensure!(context.is_object(), "The factory prepared no context for the request");
    Ok(context)
}

/// What the page shows of a harness's run: the factory's validation (`muro project simulate-check`) of the
/// answer the harness ended with, against the context the factory prepared, both written to the run's
/// folder first. A result the harness reports of itself, a relayed verdict or a tool result in its stream,
/// is never what is shown.
pub fn judge(factory: &Factory, manifest: &Path, context: &Value, answer: &Value, work: &Path, cancelled: &dyn Fn() -> bool) -> Result<Value> {
    let (context_file, answer_file) = (work.join("context.json"), work.join("answer.json"));
    std::fs::write(&context_file, serde_json::to_vec(context)?)?;
    std::fs::write(&answer_file, serde_json::to_vec(answer)?)?;
    let args = [
        "project".to_owned(),
        "simulate-check".into(),
        "--manifest".into(),
        manifest.to_string_lossy().into_owned(),
        "--context".into(),
        context_file.to_string_lossy().into_owned(),
        "--answer".into(),
        answer_file.to_string_lossy().into_owned(),
    ];
    factory.json(&args, "The validation of the answer", cancelled, crate::factory::READ_LIMIT)
}

fn resolved(harness: &str) -> Result<String> {
    let exe = crate::cli::resolve_executable(harness)?;
    ensure!(!mukade::exe::is_batch(&exe), "Choose an executable, not a batch launcher");
    Ok(exe)
}

fn through_harness(factory: &Factory, manifest: &Path, task: &str, stack: &[String], ai: &Value, work: &Path, cancelled: &dyn Fn() -> bool) -> Result<Value> {
    // What the answer is judged against comes from the factory, now: the harness never gives it.
    let context = prepared_context(factory, manifest, task, stack, cancelled)?;
    let prompt = harness_prompt(manifest, task, stack);
    let harness = ai["harness"].as_str().unwrap_or("claude-code");
    let (answer, cost) = match harness {
        "claude-code" => {
            let config = work.join("mcp.json");
            std::fs::write(&config, serde_json::to_vec_pretty(&mcp_config(factory))?)?;
            let args = claude_args(&prompt, &config, ai["budget_usd"].as_f64().unwrap_or(f64::NAN))?;
            let command = harness_command(&resolved("claude-code")?, args, work, ai);
            let done = exec::capture(command, "Claude Code", cancelled, LIMIT)?;
            let harvest = claude_result(&done.stdout).map_err(|error| match (done.status.success(), done.stderr.trim()) {
                (false, reason) if !reason.is_empty() => anyhow::anyhow!("Claude Code failed ({}): {reason}", done.status),
                _ => error,
            })?;
            let cost = json!(harvest.cost_usd);
            (harvest.answer, cost)
        }
        "codex" => {
            let last = work.join("last-message.txt");
            let command = harness_command(&resolved("codex")?, codex_args(&prompt, factory, work, &last), work, ai);
            let done = exec::capture(command, "Codex", cancelled, LIMIT)?;
            let message = std::fs::read_to_string(&last).unwrap_or_default();
            if !done.status.success() && message.trim().is_empty() {
                bail!("Codex failed ({}): {}", done.status, done.stderr.trim());
            }
            // Codex's stream is not read, and has no cost to report.
            (codex_answer(&message)?, Value::Null)
        }
        _ => bail!("The AI harness must be claude-code or codex"),
    };
    let mut result = judge(factory, manifest, &context, &answer, work, cancelled)?;
    let object = result.as_object_mut().context("The validation did not answer with an object")?;
    object.insert("engine".into(), json!("harness"));
    object.insert("harness".into(), json!(harness));
    object.insert("cost_usd".into(), cost);
    Ok(result)
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
