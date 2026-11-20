//! The runtime against the repository's real factory, once through: a real `.mp` (packed by the factory
//! with a small local Git source and a built release), listed, read, installed on an OpenCode target,
//! made stale by a changed file, installed again, and a request simulated through an OpenAI-compatible
//! endpoint on this machine. What the stand-in factory of the other tests cannot say: that the factory's
//! digest is the SHA-256 the registry compares, that its options are the ones the runtime passes, and
//! what its summary holds. A source checkout, Python and Git are needed; without them it returns at once.
mod common;

use muro_desktop_runtime::request;
use muro_registry::projects as registry_projects;
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
};

fn repository() -> Option<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").canonicalize().ok()?;
    let ready = root.join("muro_build.py").is_file()
        && root.join("tests").join("test_project_file.py").is_file()
        && Command::new("git").arg("--version").output().is_ok()
        && Command::new(common::python()).arg("--version").output().is_ok();
    ready.then_some(root)
}

fn pack(repository: &Path, folder: &Path, variant: &str) -> PathBuf {
    let output = Command::new(common::python())
        .arg(repository.join("crates/muro-desktop-runtime/tests/common/make_project.py"))
        .args([repository.as_os_str(), folder.as_os_str(), variant.as_ref()])
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    folder.join(format!("{variant}.mp"))
}

/// One OpenAI-compatible endpoint that answers once with `content`, and keeps what it was sent.
fn endpoint(content: &'static str) -> (String, Arc<Mutex<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://127.0.0.1:{}/v1", listener.local_addr().unwrap().port());
    let seen = Arc::new(Mutex::new(String::new()));
    let kept = seen.clone();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut received = vec![];
        let mut buffer = [0; 8192];
        let (end, length) = loop {
            let read = stream.read(&mut buffer).unwrap();
            received.extend_from_slice(&buffer[..read]);
            let text = String::from_utf8_lossy(&received).into_owned();
            if let Some(end) = text.find("\r\n\r\n") {
                let length = text[..end]
                    .lines()
                    .find_map(|line| line.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                    .unwrap_or(0);
                if received.len() >= end + 4 + length {
                    break (end, length);
                }
            }
            assert!(read > 0, "the client closed before it finished");
        };
        *kept.lock().unwrap() = String::from_utf8_lossy(&received[..end + 4 + length]).into_owned();
        let body = json!({"choices":[{"message":{"content":content}}]}).to_string();
        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
    });
    (base, seen)
}

#[test]
fn a_real_project_is_listed_read_installed_made_stale_and_simulated() {
    let Some(repository) = repository() else { return };
    let temp = tempfile::tempdir().unwrap();
    let (data, packed) = (temp.path().join("data"), temp.path().join("packed"));
    fs::create_dir_all(&data).unwrap();
    fs::create_dir_all(&packed).unwrap();
    let (one, two) = (pack(&repository, &packed, "one"), pack(&repository, &packed, "two"));
    let file = temp.path().join("mine").join("tester.mp");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::copy(&one, &file).unwrap();
    let first = registry_projects::file_digest(&file).unwrap();
    assert_ne!(first, registry_projects::file_digest(&two).unwrap(), "the two variants are two files");

    let call = |action: &str, payload: Value| request(&data, action, payload);
    let current = call("registry", json!({})).unwrap();
    let mut settings = current["settings"].clone();
    settings["python"] = json!(common::python());
    settings["factory_path"] = json!(repository);
    call("settings", json!({"revision":current["revision"],"settings":settings})).unwrap();

    // opened from anywhere: listed under its slug, where it is
    let opened = call("open_project", json!({"path":file})).unwrap();
    assert_eq!((opened["id"].as_str(), opened["plugin"]["name"].as_str()), (Some("tester"), Some("Tester")));
    // the list: flat counts, and the digest is the SHA-256 the registry compares
    let list = call("projects", json!({})).unwrap();
    assert_eq!(list.as_array().unwrap().len(), 1);
    let shown = &list[0];
    assert_eq!(shown["digest"], json!(first), "the factory's digest is the file's SHA-256");
    assert_eq!((shown["inputs"].as_u64(), shown["capabilities"].as_u64(), shown["records"].as_u64()), (Some(1), Some(1), Some(1)));
    assert!(shown.get("graph").is_none() && shown.get("changelog").is_none(), "the summary holds no capability bodies");
    // the project page: the full info
    let info = call("project", json!({"id":"tester"})).unwrap();
    assert_eq!(info["digest"], json!(first));
    assert!(info["graph"]["capabilities"].as_array().unwrap().len() == 1 && info["changelog"].is_string());
    assert!(projects_cache(&data, &first).join("release").join("tester").is_dir(), "unpacked into the runtime's own cache");

    // installed on an OpenCode target (config files only: no harness runs), the targets set in one place
    let profile = temp.path().join("profile");
    fs::create_dir_all(&profile).unwrap();
    call("save_target", json!({"revision":call("registry", json!({})).unwrap()["revision"],"target":{
        "id":"oc","harness":"opencode","name":"OpenCode","root":profile,"executable":"","exclusive":true,"enabled":true}})).unwrap();
    let done = call("install_project", json!({"id":"tester","harnesses":["opencode","claude-code"]})).unwrap();
    assert_eq!(done["unmanaged"], json!(["claude-code"]), "no Claude Code target is registered");
    let plugin = &done["plugin"];
    assert_eq!(plugin["targets"], json!(["oc"]));
    assert_eq!(plugin["distributions"][0]["version"], "0.1.0");
    assert_eq!(plugin["distributions"][0]["project_digest"], json!(first));
    let plan = call("plan", json!({})).unwrap();
    assert_eq!(plan["blockers"], json!([]), "{plan}");
    assert_eq!(plan["operations"][0]["kind"], "install");

    // the file changes: what was built is stale until the project is installed again
    fs::copy(&two, &file).unwrap();
    let second = registry_projects::file_digest(&file).unwrap();
    let blocked = call("plan", json!({})).unwrap()["blockers"][0].as_str().unwrap().to_owned();
    assert!(blocked.ends_with("Project file changed: open the project again"), "{blocked}");
    assert_eq!(call("projects", json!({})).unwrap()[0]["digest"], json!(second));
    call("install_project", json!({"id":"tester","harnesses":["opencode"]})).unwrap();
    assert_eq!(call("plan", json!({})).unwrap()["blockers"], json!([]));
    assert_eq!(call("registry", json!({})).unwrap()["plugins"][0]["distributions"][0]["project_digest"], json!(second));

    // a request through an endpoint on this machine: the key reaches it from the environment, never
    // an argument; its answer is not a classification, so it is an invalid result, not an error
    let (base, seen) = endpoint("This is not JSON.");
    let key = "sk-test-0123456789abcdef";
    // SAFETY: a name unique to this test, read by the factory's child process
    unsafe { std::env::set_var("MURO_TEST_REAL_KEY", key) };
    let current = call("registry", json!({})).unwrap();
    let mut settings = current["settings"].clone();
    settings["ai"] = json!({"engine":"api","api_base":base,"model":"test-model","api_key_env":"MURO_TEST_REAL_KEY"});
    call("settings", json!({"revision":current["revision"],"settings":settings})).unwrap();
    let result = call("simulate", json!({"id":"tester","task":"--not-an-option, a request that starts with dashes","stack":["stack:rust"]})).unwrap();
    assert_eq!((result["valid"].as_bool(), result["engine"].as_str(), result["model"].as_str()), (Some(false), Some("api"), Some("test-model")));
    assert!(result["errors"].as_array().is_some_and(|errors| !errors.is_empty()), "{result}");
    let sent = seen.lock().unwrap().clone();
    assert!(sent.contains(&format!("Bearer {key}")), "the key reached the endpoint from the environment");
    assert!(sent.contains("--not-an-option, a request that starts with dashes"), "the request is in the prompt");
    assert!(sent.starts_with("POST /v1/chat/completions"), "{}", sent.lines().next().unwrap_or(""));
}

fn projects_cache(data: &Path, digest: &str) -> PathBuf {
    muro_desktop_runtime::projects::cache_dir(data).join(digest)
}
