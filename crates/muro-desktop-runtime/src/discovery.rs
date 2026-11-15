use mukade::{catalog as source, exe, model::HarnessId, roots::StoreRoots};
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
    let roots = StoreRoots::from_env();
    source::catalog()
        .harnesses
        .iter()
        .map(|entry| {
            let (executable, _) = exe::resolve_source(entry.id, None);
            let session_root = roots
                .root(entry.id)
                .map(ToOwned::to_owned)
                .or_else(|| source::store_default(entry.id));
            json!({"harness":id(entry.id),"name":entry.display,"executable":executable,
            "session_root":session_root,"supported":entry.id != HarnessId::DeepSeekHarness})
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
