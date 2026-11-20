//! A stand-in for the bundled factory, for the tests of what the runtime does around it: which command
//! line it builds, what it does with the JSON and the exit code that come back. It is a Python script
//! named `muro_build.py` in a folder, run by the same Python the runtime runs the real one with, and it
//! answers `project info [--summary]` and `project simulate` from a descriptor held in the `.mp` file
//! (a JSON file here, not a zip), so a test says what a project "holds" in one line.
//!
//! The descriptor: `{"plugin":{"name","slug","version"}, "error": "...", "unpacks": true, "build":
//! {"<harness>": "<version>"}, "mismatch": true, "result": {...}}`. `error` is what `info` answers for an
//! invalid project (with `unpacks`, after leaving an unpack of it in the cache); `build` is the release the
//! unpack gets; `mismatch` makes `verify` refuse; `result` is what `project simulate` prints. The stand-in
//! also prepares a request (`simulate-prepare`) and validates an answer against a context (`simulate-check`)
//! in the one way a test needs: the answer must copy the context. Every call is appended to `calls.ndjson`
//! beside the script as `{"args": [...]}`.
#![allow(dead_code)]
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

pub const SCRIPT: &str = r#"
import hashlib, json, os, sys, time
from pathlib import Path

here = Path(__file__).resolve().parent
args = sys.argv[1:]
with open(here / "calls.ndjson", "a", encoding="utf-8") as log:
    log.write(json.dumps({"args": args}, ensure_ascii=False) + "\n")


def option(name, default=None):
    for item in args:
        if item.startswith(name + "="):
            return item[len(name) + 1:]
    if name in args:
        return args[args.index(name) + 1]
    return default


if args[:2] == ["project", "info"]:
    mp = Path(args[2])
    cache = Path(option("--cache"))
    try:
        data = mp.read_bytes()
        held = json.loads(data)
    except OSError as exc:
        if "--summary" in args:
            print(json.dumps({"error": str(exc)}))
            sys.exit(0)
        print(str(exc), file=sys.stderr)
        sys.exit(1)
    if held.get("error"):
        if held.get("unpacks"):
            # a file the factory unpacked and then refused: the unpack stays behind until the runtime removes it
            (cache / hashlib.sha256(data).hexdigest()).mkdir(parents=True, exist_ok=True)
            (cache / hashlib.sha256(data).hexdigest() / "sources.json").write_text("{}", encoding="utf-8")
        if "--summary" in args:
            print(json.dumps({"error": held["error"]}))
            sys.exit(0)
        print(held["error"], file=sys.stderr)
        sys.exit(1)
    if held.get("crash"):
        print("this is not JSON")
        sys.exit(0)
    digest = hashlib.sha256(data).hexdigest()
    folder = cache / digest
    (folder / "release" / held["plugin"]["slug"]).mkdir(parents=True, exist_ok=True)
    (folder / "sources.json").write_text("{}", encoding="utf-8")
    for harness, version in held.get("build", {}).items():
        adapter = folder / "release" / held["plugin"]["slug"] / "adapters" / harness
        adapter.mkdir(parents=True, exist_ok=True)
        if harness == "claude-code":
            (adapter / ".claude-plugin").mkdir(exist_ok=True)
            (adapter / ".claude-plugin" / "plugin.json").write_text(json.dumps({"name": held["plugin"]["slug"], "version": version}))
        elif harness == "codex":
            (adapter / ".codex-plugin").mkdir(exist_ok=True)
            (adapter / ".codex-plugin" / "plugin.json").write_text(json.dumps({"name": held["plugin"]["slug"], "version": version}))
        else:
            (adapter / "package.json").write_text(json.dumps({"name": held["plugin"]["slug"], "version": version}))
            (adapter / "index.js").write_text("export default async () => ({})")
    shown = {"project": {"schema": 1, **({"builtin": True} if held.get("builtin") else {})}, "plugin": held["plugin"], "digest": digest}
    if "--summary" in args:
        shown.update(inputs=1, capabilities=2, entries=3, examples=4, records=5, runs=6)
    else:
        shown.update(inputs=[], decisions=[], records=[], history=[], changelog="", prompts=[], graph={}, files=[])
    print(json.dumps(shown, ensure_ascii=False))
elif args[:2] == ["project", "verify"]:
    held = json.loads(Path(args[2]).read_text(encoding="utf-8"))
    if held.get("mismatch"):
        print("Project verify failed: The plugin inside this project does not match the project: it was not built from it (it is version 9.9.9, the project's is 1.0.0)", file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"verified": True}))
elif args[:2] == ["project", "simulate-prepare"]:
    # what the real factory prepares: the request's context (stack tokens sorted) and the prompt that carries it
    tokens = sorted(item[len("--stack="):] for item in args if item.startswith("--stack="))
    print(json.dumps({"context": {"task": option("--task"), "stack_tokens": tokens, "catalog_digest": "d" * 64}, "prompt": "the prompt"}))
elif args[:2] == ["project", "simulate-check"]:
    # a minimal stand-in for the validation: the answer must copy the context; a selected one gets its steps
    context = json.loads(Path(option("--context")).read_text(encoding="utf-8"))
    answer = json.loads(Path(option("--answer")).read_text(encoding="utf-8"))
    if not all(answer.get(key) == context[key] for key in ("task", "stack_tokens", "catalog_digest")):
        print(json.dumps({"valid": False, "errors": ["the answer must copy the context exactly"]}))
    elif answer.get("status") != "selected":
        print(json.dumps({"valid": True, "status": answer.get("status"), "steps": []}))
    else:
        steps = [{"step_id": s["capability"], "capability": s["capability"]} for s in answer["selections"]]
        print(json.dumps({"valid": True, "status": "selected", "steps": steps}))
elif args[:2] == ["project", "simulate"]:
    held = json.loads(Path(args[2]).read_text(encoding="utf-8"))
    if option("--task") == "sleep":
        time.sleep(60)
    if held.get("simulate_error"):
        print(held["simulate_error"], file=sys.stderr)
        sys.exit(1)
    print(json.dumps(held.get("result", {"valid": True, "steps": []})))
else:
    print("unknown command", file=sys.stderr)
    sys.exit(2)
"#;

pub fn python() -> &'static str {
    if cfg!(windows) { "python" } else { "python3" }
}

/// A folder holding the fake factory; the settings that name it.
pub fn install(root: &Path) -> (PathBuf, Value) {
    let folder = root.join("factory");
    std::fs::create_dir_all(&folder).unwrap();
    std::fs::write(folder.join("muro_build.py"), SCRIPT).unwrap();
    let settings = json!({"python": python(), "factory_path": folder});
    (folder, settings)
}

/// The calls the fake factory has answered, each one's arguments.
pub fn calls(folder: &Path) -> Vec<Vec<String>> {
    std::fs::read_to_string(folder.join("calls.ndjson"))
        .unwrap_or_default()
        .lines()
        .map(|line| {
            serde_json::from_str::<Value>(line).unwrap()["args"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| a.as_str().unwrap().to_owned())
                .collect()
        })
        .collect()
}

/// A project file that holds `descriptor`.
pub fn project_file(path: &Path, descriptor: Value) -> PathBuf {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, descriptor.to_string()).unwrap();
    path.to_owned()
}

pub fn plugin(name: &str, slug: &str) -> Value {
    json!({"name": name, "slug": slug, "version": "1.0.0"})
}
