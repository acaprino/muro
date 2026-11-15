use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};

pub fn read(path: &Path) -> Result<Value> {
    Ok(serde_json::from_slice(
        &fs::read(path).with_context(|| format!("Cannot read {}", path.display()))?,
    )
    .with_context(|| format!("Invalid JSON: {}", path.display()))?)
}
pub fn optional(path: &Path) -> Result<Value> {
    if path.exists() {
        read(path)
    } else {
        Ok(json!({}))
    }
}
pub fn write(path: &Path, value: &Value) -> Result<()> {
    let parent = path.parent().context("Missing parent")?;
    fs::create_dir_all(parent)?;
    ensure!(
        !path.is_symlink(),
        "Refusing symbolic link {}",
        path.display()
    );
    let mut f = tempfile::NamedTempFile::new_in(parent)?;
    f.write_all(&serde_json::to_vec_pretty(value)?)?;
    f.as_file().sync_all()?;
    f.persist(path).map_err(|e| e.error)?;
    Ok(())
}
pub fn hash(v: &Value) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(v).unwrap_or_default())
    )
}
pub fn id(value: &str) -> Result<()> {
    ensure!(
        !value.is_empty()
            && value.len() <= 100
            && value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
        "Invalid ID: {value}"
    );
    Ok(())
}
pub fn str_field<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    v[k].as_str().with_context(|| format!("Missing string {k}"))
}
pub fn tree_hash(path: &Path) -> Result<String> {
    let mut digest = Sha256::new();
    walk_hash(path, path, &mut digest)?;
    Ok(format!("{:x}", digest.finalize()))
}
fn walk_hash(root: &Path, path: &Path, digest: &mut Sha256) -> Result<()> {
    let md = fs::symlink_metadata(path)?;
    ensure!(
        !md.file_type().is_symlink(),
        "Symbolic links are not supported in plugin artifacts: {}",
        path.display()
    );
    if md.is_dir() {
        if path != root {
            let name = path.strip_prefix(root)?.to_string_lossy();
            digest.update(b"D");
            digest.update((name.len() as u64).to_be_bytes());
            digest.update(name.as_bytes());
        }
        let mut entries = fs::read_dir(path)?.collect::<std::io::Result<Vec<_>>>()?;
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            if e.file_name() == ".git" {
                continue;
            }
            walk_hash(root, &e.path(), digest)?;
        }
    } else {
        ensure!(md.is_file(), "Unsupported file type");
        let name = path.strip_prefix(root)?.to_string_lossy();
        let mut file_digest = Sha256::new();
        let mut file = fs::File::open(path)?;
        let mut buf = [0; 65536];
        loop {
            let n = file.read(&mut buf)?;
            if n == 0 {
                break;
            }
            file_digest.update(&buf[..n]);
        }
        digest.update(b"F");
        digest.update((name.len() as u64).to_be_bytes());
        digest.update(name.as_bytes());
        digest.update(md.len().to_be_bytes());
        digest.update(file_digest.finalize());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn different_trees_cannot_share_boundary_encoding() {
        let tmp = tempfile::tempdir().unwrap();
        let first = tmp.path().join("first");
        let second = tmp.path().join("second");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        fs::write(first.join("a"), b"x\0b\0y").unwrap();
        fs::write(second.join("a"), b"x").unwrap();
        fs::write(second.join("b"), b"y").unwrap();
        assert_ne!(tree_hash(&first).unwrap(), tree_hash(&second).unwrap());
    }
    #[test]
    fn empty_directory_affects_artifact_identity() {
        let tmp = tempfile::tempdir().unwrap();
        let first = tmp.path().join("first");
        let second = tmp.path().join("second");
        fs::create_dir(&first).unwrap();
        fs::create_dir(&second).unwrap();
        fs::create_dir(first.join("empty")).unwrap();
        assert_ne!(tree_hash(&first).unwrap(), tree_hash(&second).unwrap());
    }
}
pub fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    ensure!(!from.is_symlink(), "Refusing linked artifact");
    fs::create_dir_all(to)?;
    for e in fs::read_dir(from)? {
        let e = e?;
        if e.file_name() == ".git" {
            continue;
        }
        let ty = e.file_type()?;
        ensure!(
            !ty.is_symlink(),
            "Refusing linked artifact {}",
            e.path().display()
        );
        if ty.is_dir() {
            copy_tree(&e.path(), &to.join(e.file_name()))?;
        } else {
            ensure!(ty.is_file(), "Unsupported file type");
            fs::copy(e.path(), to.join(e.file_name()))?;
        }
    }
    Ok(())
}
pub fn event(action: &str, status: &str, message: &str) -> Value {
    json!({"id":uuid::Uuid::new_v4().to_string(),"time":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs().to_string(),"action":action,"status":status,"message":message})
}
