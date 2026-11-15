use crate::{native, storage::*};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};

fn git(args: &[&str], cwd: Option<&Path>) -> Result<String> {
    native::command(
        "git",
        &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        Some(("GIT_TERMINAL_PROMPT", "0")),
        cwd,
    )
    .map(|s| s.trim().to_owned())
}
fn source_url(input: &str) -> Result<(url::Url, Option<String>)> {
    let raw = if !input.contains("://") && !input.starts_with("git@") {
        format!("https://github.com/{input}")
    } else {
        input.to_owned()
    };
    let mut url = url::Url::parse(&raw)
        .context("Source must be a local path, HTTPS Git URL or owner/repository")?;
    ensure!(
        matches!(url.scheme(), "https" | "file"),
        "Only HTTPS and local file Git sources are supported"
    );
    ensure!(
        url.username().is_empty() && url.password().is_none(),
        "Do not put credentials in source URLs; configure Git authentication"
    );
    let sub = url.fragment().map(str::to_owned);
    url.set_fragment(None);
    if let Some(ref s) = sub {
        ensure!(
            Path::new(s)
                .components()
                .all(|c| matches!(c, std::path::Component::Normal(_))),
            "Source subdirectory must stay inside the repository"
        );
    }
    Ok((url, sub))
}
fn latest_release(url: &url::Url) -> Result<Option<String>> {
    if url.host_str() != Some("github.com") {
        return Ok(None);
    }
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    ensure!(
        parts.len() == 2,
        "Use a repository URL, with #subdirectory when needed"
    );
    let api = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        parts[0],
        parts[1].trim_end_matches(".git")
    );
    let exe = if cfg!(windows) { "curl.exe" } else { "curl" };
    let output = native::command(
        exe,
        &[
            "--silent".into(),
            "--show-error".into(),
            "--location".into(),
            "--max-time".into(),
            "40".into(),
            "--header".into(),
            "Accept: application/vnd.github+json".into(),
            "--user-agent".into(),
            "muro-registry".into(),
            "--write-out".into(),
            "\n%{http_code}".into(),
            api,
        ],
        None,
        None,
    )?;
    let (body, status) = output.rsplit_once('\n').context("Missing HTTP status")?;
    if status == "404" {
        return Ok(None);
    }
    ensure!(
        status == "200",
        "GitHub release lookup failed (HTTP {status}); current installations were preserved"
    );
    let doc: Value = serde_json::from_str(body)?;
    ensure!(
        doc["draft"] == false && doc["prerelease"] == false,
        "GitHub returned a non-stable release"
    );
    Ok(Some(str_field(&doc, "tag_name")?.to_owned()))
}
fn select_ref(plugin: &Value, repo: &Path, url: &url::Url) -> Result<String> {
    match str_field(plugin, "policy")? {
        "pinned" => Ok(str_field(plugin, "pinned_version")?.to_owned()),
        "head" => Ok("HEAD".into()),
        "stable" => {
            if let Some(release) = latest_release(url)? {
                return Ok(release);
            }
            let tags = git(&["tag", "--sort=-version:refname"], Some(repo))?;
            let tags: Vec<_> = tags.lines().filter(|s| !s.trim().is_empty()).collect();
            if tags.is_empty() {
                Ok("HEAD".into())
            } else {
                bail!(
                    "This upstream has tags but no published stable release. Choose an explicit tag with pinned policy; no tag is silently selected."
                )
            }
        }
        _ => bail!("Invalid version policy"),
    }
}
fn checkout(root: &Path, plugin: &Value) -> Result<(PathBuf, String, String)> {
    let source = str_field(plugin, "source")?;
    let path = Path::new(source);
    if path.is_dir() {
        let path = path.canonicalize()?;
        return Ok((path.clone(), tree_hash(&path)?, "local".into()));
    }
    let (url, sub) = source_url(source)?;
    let source_key = hash(&json!(url.as_str()));
    let repos = root.join("sources");
    fs::create_dir_all(&repos)?;
    let repo = repos.join(&source_key).join("repository");
    if !repo.exists() {
        fs::create_dir_all(repo.parent().unwrap())?;
        git(
            &[
                "clone",
                "--mirror",
                "--",
                url.as_str(),
                &repo.to_string_lossy(),
            ],
            None,
        )?;
    } else {
        git(&["fetch", "--prune", "--tags", "origin"], Some(&repo))?;
    }
    let reference = select_ref(plugin, &repo, &url)?;
    ensure!(
        !reference.is_empty() && !reference.starts_with('-') && !reference.contains(['\n', '\r']),
        "Invalid source reference"
    );
    let revision = git(
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
        Some(&repo),
    )?;
    ensure!(
        revision.len() == 40 && revision.chars().all(|c| c.is_ascii_hexdigit()),
        "Expected immutable Git commit"
    );
    let destination = repos.join(&source_key).join(&revision);
    if !destination.exists() {
        let temp = tempfile::tempdir_in(repo.parent().unwrap())?;
        let staged = temp.path().join("checkout");
        git(
            &[
                "clone",
                "--no-checkout",
                "--",
                &repo.to_string_lossy(),
                &staged.to_string_lossy(),
            ],
            None,
        )?;
        git(&["checkout", "--detach", &revision], Some(&staged))?;
        fs::rename(staged, &destination)?;
    }
    let source = if let Some(sub) = sub {
        let candidate = destination.join(sub).canonicalize()?;
        ensure!(
            candidate.starts_with(destination.canonicalize()?),
            "Source subdirectory escapes checkout"
        );
        candidate
    } else {
        destination
    };
    Ok((source, revision, reference))
}
pub fn resolve(root: &Path, plugin: &Value) -> Result<Value> {
    let (source, revision, version) = checkout(root, plugin)?;
    let mut next = plugin.clone();
    let mut distributions = vec![];
    // Explicit artifacts belong to the owner. Resolution only replaces its own discoveries.
    for old in plugin["distributions"].as_array().into_iter().flatten() {
        if old["origin"].is_null() || old["origin"] == "manual" {
            distributions.push(old.clone());
        }
    }
    let custom = crate::instructions::read(root, plugin)?;
    if !custom.files.is_empty() {
        for old in plugin["distributions"].as_array().into_iter().flatten() {
            if old["origin"] == "muro" && old["source_revision"] == revision
                && crate::instructions::distribution_matches(&custom, old)
                && !distributions.iter().any(|d| d["harness"] == old["harness"])
            {
                distributions.push(old.clone());
            }
        }
    }
    for h in ["claude-code", "codex", "opencode", "pi", "hermes"] {
        if distributions.iter().any(|d| d["harness"] == h) {
            continue;
        }
        let candidate = source.join("adapters").join(h);
        let is_adapter = candidate.is_dir();
        let dir = if is_adapter {
            candidate
        } else {
            source.clone()
        };
        if let Ok((_, native_version)) = native::identity(h, &dir) {
            if matches!(h, "opencode" | "pi") && !is_adapter {
                let m = read(&dir.join("package.json"))?;
                if m.get(h).is_none() {
                    continue;
                }
            }
            distributions.push(json!({"harness":h,"path":dir.canonicalize()?.to_string_lossy(),"version":native_version,"origin":"native","source_revision":revision}));
        }
    }
    for old in plugin["distributions"].as_array().into_iter().flatten() {
        if old["origin"] == "muro"
            && old["source_revision"] == revision
            && !distributions.iter().any(|d| d["harness"] == old["harness"])
        {
            distributions.push(old.clone());
        }
    }
    next["distributions"] = json!(distributions);
    next["resolved_source"] = json!(source);
    next["upstream_revision"] = json!(revision);
    next["upstream_version"] = json!(version);
    next["last_checked"] = event("resolve", "complete", "")["time"].clone();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolution_preserves_custom_folder_and_current_adaptation_over_native() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source");
        let custom = root.path().join("instructions");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&custom).unwrap();
        fs::write(source.join("package.json"), r#"{"name":"example","version":"1.0.0","opencode":{}}"#).unwrap();
        fs::write(custom.join("recap.md"), "Report progress").unwrap();
        let mut plugin = json!({"id":"example","source":source,"policy":"stable","custom_instructions_dir":custom,"distributions":[]});
        let first = resolve(root.path(),&plugin).unwrap();
        plugin["distributions"] = json!([{"harness":"opencode","origin":"muro","source_revision":first["upstream_revision"],"version":"1.0.0","path":source,
            "custom_instructions_digest":crate::instructions::read(root.path(),&plugin).unwrap().digest()}]);
        let second = resolve(root.path(),&plugin).unwrap();
        assert_eq!(second["custom_instructions_dir"],plugin["custom_instructions_dir"]);
        assert_eq!(second["distributions"][0]["origin"],"muro");
    }
    #[test]
    fn url_boundaries() {
        assert!(source_url("https://github.com/org/repo#../escape").is_err());
        assert!(source_url("https://secret@example.com/repo").is_err());
        let (u, s) = source_url("org/repo#plugins/demo").unwrap();
        assert_eq!(u.as_str(), "https://github.com/org/repo");
        assert_eq!(s.as_deref(), Some("plugins/demo"));
    }
    #[test]
    fn local_changed_source_invalidates_adaptation() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("source");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("input.md"), "first").unwrap();
        let mut plugin = json!({"id":"test","source":src,"policy":"stable","distributions":[]});
        let one = resolve(t.path(), &plugin).unwrap();
        plugin["distributions"] = json!([{"harness":"pi","origin":"muro","source_revision":one["upstream_revision"],"version":"1.0","path":src}]);
        assert_eq!(
            resolve(t.path(), &plugin).unwrap()["distributions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::write(src.join("input.md"), "second").unwrap();
        assert!(
            resolve(t.path(), &plugin).unwrap()["distributions"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    #[test]
    fn resolution_preserves_explicit_distribution_without_native_manifest() {
        let tmp = tempfile::tempdir().unwrap();
        let source = tmp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(
            source.join("package.json"),
            r#"{"name":"explicit-plugin","version":"1.0.0"}"#,
        )
        .unwrap();
        let plugin = json!({"id":"explicit-plugin","source":source,"policy":"stable","distributions":[{"harness":"opencode","path":source,"version":"1.0.0"}]});
        let resolved = resolve(tmp.path(), &plugin).unwrap();
        assert_eq!(resolved["distributions"], plugin["distributions"]);
    }
}
