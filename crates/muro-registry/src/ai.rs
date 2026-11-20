//! The AI engine settings (`settings.ai`): which engine answers a request (a coding agent on this
//! computer, or an OpenAI-compatible API) and how. The key is never a setting: the registry holds
//! only the NAME of the environment variable it is read from, and refuses anything else there
//! without repeating it (ADR-0022, ADR-0028).
use anyhow::{Result, bail, ensure};
use serde_json::{Value, json};
use url::{Host, Url};

/// What a refused key setting says. It never repeats the value: it may be a key pasted by mistake.
pub const KEY_REFUSED: &str = "The key setting must name an environment variable, not hold a key";
pub const ENGINES: [&str; 2] = ["harness", "api"];
pub const HARNESSES: [&str; 2] = ["claude-code", "codex"];
const KEYS: [&str; 6] = ["engine", "harness", "budget_usd", "api_base", "model", "api_key_env"];
/// The longest name accepted for the key's variable: the same limit as `muro/agent.py`.
const NAME_LIMIT: usize = 128;

pub fn defaults() -> Value {
    json!({"engine":"harness","harness":"claude-code","budget_usd":0.5,
           "api_base":"https://api.openai.com/v1","model":"","api_key_env":"MURO_API_KEY"})
}

/// `[A-Za-z_][A-Za-z0-9_]*`, the shape of an environment variable's name, and nothing more.
pub fn validate_key_env(name: &str) -> Result<()> {
    let mut chars = name.chars();
    let valid = name.len() <= NAME_LIMIT
        && chars.next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
    ensure!(valid, KEY_REFUSED);
    Ok(())
}

/// https, or http only on this computer (`localhost`, `127.0.0.1`, `::1`: the rule of `muro/agent.py`),
/// with no user name or password in it. What was given is never repeated: it could hold a key.
pub fn validate_api_base(base: &str) -> Result<()> {
    ensure!(base.len() <= 2048, "The API address is too long");
    let Ok(url) = Url::parse(base) else {
        bail!("The API address must be an https URL (http only on localhost)");
    };
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "The API address must not hold a user name or a password"
    );
    match url.scheme() {
        "https" => ensure!(url.host().is_some(), "The API address has no host"),
        "http" => ensure!(
            match url.host() {
                Some(Host::Domain(name)) => name.eq_ignore_ascii_case("localhost"),
                Some(Host::Ipv4(ip)) => ip == std::net::Ipv4Addr::LOCALHOST,
                Some(Host::Ipv6(ip)) => ip == std::net::Ipv6Addr::LOCALHOST,
                None => false,
            },
            "Plain http is allowed only on localhost; use https"
        ),
        _ => bail!("The API address must be an https URL (http only on localhost)"),
    }
    Ok(())
}

/// A complete `ai` object: every key present and right. The engine "api" needs an address, and a
/// model is asked for when a request is made, not when the setting is saved (a page that saves on
/// every change cannot require both at once).
pub fn validate(ai: &Value) -> Result<()> {
    let Some(object) = ai.as_object() else {
        bail!("The ai setting must be an object");
    };
    // A field it does not know is refused by name only where the name is its own: nothing is echoed.
    ensure!(
        object.keys().all(|key| KEYS.contains(&key.as_str())),
        "The ai setting has a field that is not one of {}",
        KEYS.join(", ")
    );
    let text = |key: &str| {
        ai[key]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("The AI setting {key} must be text"))
    };
    let engine = text("engine")?;
    ensure!(ENGINES.contains(&engine), "The AI engine must be harness or api");
    ensure!(
        HARNESSES.contains(&text("harness")?),
        "The AI harness must be claude-code or codex"
    );
    ensure!(
        ai["budget_usd"]
            .as_f64()
            .is_some_and(|b| b.is_finite() && b > 0.0 && b <= 100.0),
        "The AI budget must be above 0 and at most 100 USD"
    );
    let base = text("api_base")?;
    if engine == "api" || !base.is_empty() {
        validate_api_base(base)?;
    }
    let model = text("model")?;
    ensure!(
        model.len() <= 200 && !model.chars().any(char::is_control),
        "The AI model name is not valid"
    );
    validate_key_env(text("api_key_env")?)
}

/// The `ai` of a registry saved before it existed: the defaults, with the old `agent` as the harness.
fn legacy(settings: &Value) -> Value {
    let mut ai = defaults();
    if let Some(agent) = settings["agent"].as_str().filter(|a| HARNESSES.contains(a)) {
        ai["harness"] = json!(agent);
    }
    ai
}

/// A registry read from disk: `ai` is filled in when an older one has none. Nothing is saved here.
pub fn migrate(settings: &mut Value) {
    if !settings["ai"].is_object() {
        settings["ai"] = legacy(settings);
    }
}

/// The settings a request asks to save, with their `ai` complete and checked. A request without
/// `ai` (an older page) keeps the stored one, its `agent` standing for `ai.harness`; one with a
/// partial `ai` changes only the keys it names. `agent`, kept for what still reads it, always ends
/// as `ai.harness`: there is one truth, and when both are sent `ai` wins.
pub fn apply(settings: &mut Value, stored: &Value) -> Result<()> {
    let sent = settings["ai"].clone();
    let mut ai = match stored["ai"].is_object() {
        true => stored["ai"].clone(),
        false => legacy(stored),
    };
    match &sent {
        Value::Null => {
            if let Some(agent) = settings["agent"].as_str() {
                ai["harness"] = json!(agent);
            }
        }
        Value::Object(keys) => {
            for (key, value) in keys {
                ai[key.as_str()] = value.clone();
            }
        }
        _ => bail!("The ai setting must be an object"),
    }
    validate(&ai)?;
    settings["agent"] = ai["harness"].clone();
    settings["ai"] = ai;
    Ok(())
}
