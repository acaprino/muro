mod native;
pub mod instructions;
pub mod service;
pub fn artifact_digest(path: &std::path::Path) -> anyhow::Result<String> {
    storage::tree_hash(path)
}
mod sources;
mod storage;
