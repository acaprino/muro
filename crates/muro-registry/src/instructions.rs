//! Mechanical snapshots of owner-authored Markdown; meaning remains the host AI's job.
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug)]
pub struct InstructionSet {
    pub files: BTreeMap<String, Vec<u8>>,
}

impl InstructionSet {
    pub fn digest(&self) -> String {
        let mut digest = Sha256::new();
        for (path, bytes) in &self.files {
            digest.update(format!("{path}\n{:x}\n", Sha256::digest(bytes)).as_bytes());
        }
        format!("{:x}", digest.finalize())
    }

    pub fn metadata(&self) -> Value {
        let files: BTreeMap<_, _> = self
            .files
            .iter()
            .map(|(path, bytes)| (path.clone(), format!("{:x}", Sha256::digest(bytes))))
            .collect();
        json!({"digest":self.digest(), "files":files})
    }

    pub fn write_to(&self, package: &Path) -> Result<()> {
        for (relative, bytes) in &self.files {
            let path = package.join(relative);
            ensure!(
                !path.exists(),
                "Custom instruction snapshot already exists: {}",
                path.display()
            );
            fs::create_dir_all(path.parent().context("Instruction parent missing")?)?;
            fs::write(path, bytes)?;
        }
        Ok(())
    }
}

fn linked(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

fn check_ancestors(path: &Path) -> Result<()> {
    for ancestor in path.ancestors() {
        match fs::symlink_metadata(ancestor) {
            Ok(md) => ensure!(
                !linked(&md),
                "Linked custom-instructions paths are not supported: {}",
                ancestor.display()
            ),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

pub fn directory(root: &Path, plugin: &Value) -> Result<PathBuf> {
    let id = crate::storage::str_field(plugin, "id")?;
    crate::storage::id(id)?;
    let path = match plugin
        .get("custom_instructions_dir")
        .filter(|v| !v.is_null())
    {
        Some(value) => {
            let value = value
                .as_str()
                .context("custom_instructions_dir must be a string")?;
            if value.is_empty() {
                root.join("custom-instructions").join(id)
            } else {
                let path = PathBuf::from(value);
                ensure!(
                    path.is_absolute(),
                    "custom_instructions_dir must be absolute"
                );
                path
            }
        }
        None => root.join("custom-instructions").join(id),
    };
    let path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()?.join(path)
    };
    check_ancestors(&path)?;
    Ok(path)
}

pub fn read_directory(path: &Path) -> Result<InstructionSet> {
    check_ancestors(path)?;
    let mut files = BTreeMap::new();
    if !path.exists() {
        return Ok(InstructionSet { files });
    }
    ensure!(
        path.is_dir(),
        "custom-instructions path is not a directory: {}",
        path.display()
    );
    walk(path, path, &mut files)?;
    Ok(InstructionSet { files })
}

fn walk(root: &Path, path: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> Result<()> {
    for entry in fs::read_dir(path)? {
        let path = entry?.path();
        let md = fs::symlink_metadata(&path)?;
        let markdown = path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("md"));
        if md.is_dir() || (linked(&md) && path.is_dir()) {
            ensure!(
                !linked(&md),
                "Linked custom-instructions paths are not supported: {}",
                path.display()
            );
            walk(root, &path, files)?;
        } else if markdown {
            ensure!(
                !linked(&md),
                "Linked custom-instructions paths are not supported: {}",
                path.display()
            );
            ensure!(
                md.is_file(),
                "Custom instruction must be a regular file: {}",
                path.display()
            );
            let name = path
                .strip_prefix(root)?
                .components()
                .map(|part| {
                    part.as_os_str()
                        .to_str()
                        .context("Custom instruction path must be Unicode")
                })
                .collect::<Result<Vec<_>>>()?
                .join("/");
            ensure!(
                !name.contains(['\r', '\n', '\\', ':']),
                "Custom instruction filename must not contain a newline, backslash or colon"
            );
            let bytes = fs::read(&path)?;
            std::str::from_utf8(&bytes)
                .with_context(|| format!("Custom instruction must be UTF-8: {}", path.display()))?;
            files.insert(format!("custom-instructions/{name}"), bytes);
        }
    }
    Ok(())
}

pub fn read(root: &Path, plugin: &Value) -> Result<InstructionSet> {
    read_directory(&directory(root, plugin)?)
}

pub fn distribution_matches(input: &InstructionSet, distribution: &Value) -> bool {
    match distribution
        .get("custom_instructions_digest")
        .filter(|v| !v.is_null())
    {
        Some(value) => value.as_str() == Some(input.digest().as_str()),
        None => input.files.is_empty(),
    }
}

pub fn ensure_distribution(root: &Path, plugin: &Value, distribution: &Value) -> Result<String> {
    let input = read(root, plugin)?;
    ensure!(
        distribution_matches(&input, distribution),
        "custom-instructions changed or are missing from this distribution; run AI adaptation again"
    );
    Ok(input.digest())
}

pub fn info(root: &Path, plugin: &Value, create: bool) -> Result<Value> {
    let path = directory(root, plugin)?;
    if create {
        fs::create_dir_all(&path)?;
    }
    let input = read_directory(&path)?;
    let stale: Vec<_> = plugin["distributions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|d| !distribution_matches(&input, d))
        .map(|d| d["harness"].clone())
        .collect();
    Ok(
        json!({"plugin_id":plugin["id"],"path":path,"files":input.files.keys().collect::<Vec<_>>(),
              "digest":input.digest(),"stale_harnesses":stale}),
    )
}

pub fn states(root: &Path, registry: &Value) -> Vec<Value> {
    registry["plugins"].as_array().into_iter().flatten().map(|plugin| {
        info(root, plugin, false).unwrap_or_else(|error| json!({
            "plugin_id":plugin["id"],"path":plugin["custom_instructions_dir"].as_str().unwrap_or(""),
            "files":[],"digest":"","stale_harnesses":[],"error":format!("{error:#}")
        }))
    }).collect()
}

pub fn bindings(root: &Path, registry: &Value) -> Result<Value> {
    let mut values = BTreeMap::new();
    for plugin in registry["plugins"].as_array().context("plugins")? {
        values.insert(
            crate::storage::str_field(plugin, "id")?,
            read(root, plugin)?.digest(),
        );
    }
    Ok(json!(values))
}
