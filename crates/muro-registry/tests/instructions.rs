use muro_registry::instructions;
use serde_json::json;
use std::fs;

#[test]
fn snapshot_digest_matches_factory_bytes_paths_and_case_insensitive_markdown() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("nested")).unwrap();
    fs::write(root.path().join("nested/recap-à.MD"), "Recap corrente.\r\n").unwrap();
    fs::write(root.path().join("ignore.txt"), "Ignored").unwrap();
    let input = instructions::read_directory(root.path()).unwrap();
    assert_eq!(
        input.digest(),
        "52061a6d96248f9d5514c01baee03af30b150b2a053a70c8af0c90212ea8c544"
    );
    let package = tempfile::tempdir().unwrap();
    input.write_to(package.path()).unwrap();
    assert_eq!(
        instructions::read_directory(&package.path().join("custom-instructions"))
            .unwrap()
            .digest(),
        input.digest()
    );
    assert!(input.write_to(package.path()).is_err());
}

#[test]
fn invalid_utf8_and_relative_explicit_folders_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("invalid.md"), [255]).unwrap();
    assert!(
        instructions::read_directory(root.path())
            .unwrap_err()
            .to_string()
            .contains("UTF-8")
    );
    assert!(
        instructions::directory(
            root.path(),
            &json!({"id":"example","custom_instructions_dir":"../outside"})
        )
        .is_err()
    );
}

#[test]
fn relative_registry_root_still_exposes_an_absolute_managed_folder() {
    let folder =
        instructions::directory(std::path::Path::new("test-data"), &json!({"id":"example"}))
            .unwrap();
    assert!(folder.is_absolute());
    assert!(folder.ends_with("test-data/custom-instructions/example"));
}

#[cfg(windows)]
#[test]
fn junctions_inside_instruction_directory_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let junction = root.path().join("linked");
    let output = std::process::Command::new("cmd.exe")
        .args(["/D", "/C", "mklink", "/J"])
        .arg(&junction)
        .arg(outside.path())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        instructions::read_directory(root.path())
            .unwrap_err()
            .to_string()
            .contains("Linked")
    );
}

#[cfg(unix)]
#[test]
fn symlinks_inside_instruction_directory_are_rejected() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("linked")).unwrap();
    assert!(
        instructions::read_directory(root.path())
            .unwrap_err()
            .to_string()
            .contains("Linked")
    );
}
