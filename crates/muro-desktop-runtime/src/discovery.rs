use mukade::{catalog as source, exe, model::HarnessId};
use serde_json::{Value, json};
use std::path::Path;

pub fn id(h: HarnessId) -> &'static str {
    match h {
        HarnessId::ClaudeCode => "claude-code",
        HarnessId::DeepSeekHarness => "deepseek",
        _ => h.as_str(),
    }
}

pub fn catalog() -> Vec<Value> {
    source::catalog()
        .harnesses
        .iter()
        .map(|entry| {
            let (executable, _) = exe::resolve_source(entry.id, None);
            // Mukade's catalog states where each harness keeps its configuration.
            let config_root = source::config_root(entry.id).map(|(path, _)| path);
            json!({"harness":id(entry.id),"name":entry.display,"executable":executable,
            "config_root":config_root,"supported":entry.id != HarnessId::DeepSeekHarness})
        })
        .collect()
}

pub fn discover(cache: &Path) -> Vec<Value> {
    // Version probes run in parallel and Mukade bounds each one. Roots remain session metadata.
    std::thread::scope(|scope| {
        let handles: Vec<_> = catalog()
            .into_iter()
            .map(|mut entry| {
                scope.spawn(move || {
                    let version =
                        exe::version_of_in(entry["executable"].as_str().unwrap_or(""), Some(cache));
                    entry["available"] = json!(version.is_some());
                    entry["version"] = json!(version);
                    entry
                })
            })
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect()
    })
}
