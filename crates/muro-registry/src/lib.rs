pub mod ai;
mod native;
pub mod instructions;
pub mod projects;
pub mod service;
pub fn artifact_digest(path: &std::path::Path) -> anyhow::Result<String> {
    storage::tree_hash(path)
}
mod sources;
mod storage;
mod sync_status;
