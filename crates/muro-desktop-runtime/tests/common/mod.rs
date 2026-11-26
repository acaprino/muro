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
//!
//! For the runs that make and change projects it also answers `project new` (a folder with a `project.json`
//! naming what it was asked), `project unpack` (a folder with the descriptor's `instructions`, `{path: text}`,
//! under `custom-instructions/`) and `project commit`: refused when `--expect-digest` is not the file's, or when
//! the work folder holds `commit-fails`; waiting for a `go-commit` file beside the work folder when it holds
//! `commit-waits`; else the file written as a descriptor with what the commit was asked under `committed`.
//!
//! `project extract` answers from the descriptor's `build`: refused for a harness it does not name; else it writes
//! `<out>/<harness>/INSTALL.md` and prints `{"harness", "folders"}`.
//!
//! `project release` answers from the descriptor too, and reaches no repository: refused when `--expect-digest` is
//! not the file's, when the descriptor has no `repository` (`{"url","branch","tag_prefix"}`) or when its `release`
//! says `{"refused": "<sentence>"}`; nothing to push when `release` says `{"held": true}`; else the document the
//! real command prints, with `--init` and `--dry-run` shown in it. A repository without the caller workflow
//! (`release` without `"caller": true`, and no `--init`) adds a `Warning:` line on stderr, as the real command does.
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
elif args[:2] == ["project", "edit"]:
    # the descriptor takes the edit: a test reads back what the runtime asked for
    mp = Path(args[2])
    if option("--expect-digest") != hashlib.sha256(mp.read_bytes()).hexdigest():
        print("Project edit failed: The project file changed since it was opened: open it again and repeat the change", file=sys.stderr)
        sys.exit(1)
    held = json.loads(mp.read_text(encoding="utf-8"))
    edited = held.setdefault("edited", {})
    for key in ("--name", "--author", "--repository", "--branch", "--tag-prefix"):
        if option(key) is not None:
            edited[key] = option(key)
    if "--no-repository" in args:
        edited["--no-repository"] = True
    if option("--records") is not None:
        edited["records"] = json.loads(Path(option("--records")).read_text(encoding="utf-8"))["records"]
    if option("--changelog") is not None:
        edited["changelog"] = Path(option("--changelog")).read_text(encoding="utf-8")
    mp.write_text(json.dumps(held), encoding="utf-8")
    print(json.dumps({"path": str(mp), "digest": hashlib.sha256(mp.read_bytes()).hexdigest()}))
elif args[:2] == ["project", "new"]:
    folder = Path(args[2])
    folder.mkdir(parents=True)
    asked = {"name": option("--name"), "slug": option("--slug"), "author": option("--author")}
    (folder / "project.json").write_text(json.dumps(asked), encoding="utf-8")
    print(folder)
elif args[:2] == ["project", "unpack"]:
    held = json.loads(Path(args[2]).read_text(encoding="utf-8"))
    out = Path(option("--out"))
    out.mkdir(parents=True)
    (out / "project.json").write_text(json.dumps(held.get("plugin", {})), encoding="utf-8")
    for relative, text in held.get("instructions", {}).items():
        target = out / "custom-instructions" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
    print(out)
elif args[:2] == ["project", "commit"]:
    work, out = Path(args[2]), Path(option("--out"))
    if (work / "commit-waits").exists():
        started = time.time()
        while not (work.parent / "go-commit").exists() and time.time() - started < 60:
            time.sleep(0.05)
    if (work / "commit-fails").exists():
        print("Project commit failed: the build failed", file=sys.stderr)
        sys.exit(1)
    if "--create" in args:
        held = {"plugin": {"name": option("--name"), "slug": option("--slug"), "version": "0.1.0"}}
    else:
        if option("--expect-digest") != hashlib.sha256(out.read_bytes()).hexdigest():
            print("Project commit failed: The project file changed since it was opened: open it again and repeat the change", file=sys.stderr)
            sys.exit(1)
        held = json.loads(out.read_text(encoding="utf-8"))
    summary = option("--summary")
    held["committed"] = {"operation": option("--operation"), "step": option("--step"),
                         "summary": Path(summary).read_text(encoding="utf-8") if summary else None}
    out.write_text(json.dumps(held), encoding="utf-8")
    print(json.dumps({"path": str(out), "digest": hashlib.sha256(out.read_bytes()).hexdigest()}))
elif args[:2] == ["project", "extract"]:
    held = json.loads(Path(args[2]).read_text(encoding="utf-8"))
    harness, offered = option("--harness"), sorted(held.get("build", {}))
    if harness not in offered:
        print(f"Project extract failed: This project's build has no adapter for {harness}: it has {', '.join(offered)}", file=sys.stderr)
        sys.exit(1)
    target = Path(option("--out")) / harness
    target.mkdir(parents=True)
    (target / "INSTALL.md").write_text("Install\n", encoding="utf-8")
    print(json.dumps({"harness": harness, "folders": [str(target)]}))
elif args[:2] == ["project", "release"]:
    # what a repository would answer is in the descriptor: nothing is fetched or pushed
    data = Path(args[2]).read_bytes()
    held = json.loads(data)

    def refuse(sentence):
        print("Project release failed: " + sentence, file=sys.stderr)
        sys.exit(1)

    if option("--expect-digest") not in (None, hashlib.sha256(data).hexdigest()):
        refuse("The project file changed since it was opened: open it again and repeat the change")
    repo = held.get("repository")
    if not repo:
        refuse("This project names no repository: give it one with `muro project edit --repository`")
    knobs = held.get("release", {})
    if knobs.get("refused"):
        refuse(knobs["refused"])
    plugin, branch = held["plugin"], repo.get("branch", "main")
    name, tag = plugin["slug"] + ".mp", repo.get("tag_prefix", "") + plugin["version"]
    init = "--init" in args and not knobs.get("caller")
    shown = {"repository": repo["url"], "branch": branch, "file": name, "version": plugin["version"], "tag": tag,
             "pushed": False, "commit": None, "initialized": init, "reason": ""}
    if knobs.get("held") and not init:
        shown["reason"] = "The repository already holds this file as " + name + ": nothing to push."
    elif "--dry-run" in args:
        shown["reason"] = "Dry run: nothing was pushed. It would push " + name + " to " + branch + "."
    else:
        shown.update(pushed=True, commit="c" * 40)
        shown["reason"] = "Pushed " + name + " to " + branch + "."
    if not init and not knobs.get("caller"):
        # a warning is a line on stderr and the end of the reason; stdout stays the one JSON object
        warning = "No workflow of the repository calls Muro's store workflow."
        print("Warning: " + warning, file=sys.stderr)
        shown["reason"] += " " + warning
    print(json.dumps(shown))
elif args[:1] == ["baseline"]:
    # exit 1: something moved, and the JSON is the report all the same
    print(json.dumps({"baseline": [{"id": "alpha", "pin": "release", "pinned": "v1.0.0", "upstream": "v2.0.0", "status": "behind", "note": ""},
                                   {"id": "beta", "pin": "head", "pinned": "abc", "upstream": "abc", "status": "current", "note": ""}]}))
    sys.exit(1)
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
