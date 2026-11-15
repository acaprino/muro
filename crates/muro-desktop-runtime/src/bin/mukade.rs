use anyhow::{Context, Result, ensure};
use serde_json::json;
use std::path::PathBuf;
fn run() -> Result<()> {
    muro_desktop_runtime::cli::prepare_environment()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("muro-discover") => {
            ensure!(
                args.len() == 3 && args[1] == "--cache",
                "Usage: mukade muro-discover --cache DIRECTORY"
            );
            println!(
                "{}",
                json!(muro_desktop_runtime::discovery::discover(&PathBuf::from(
                    &args[2]
                )))
            );
            Ok(())
        }
        Some("muro-resolve") => {
            ensure!(args.len() == 2, "Usage: mukade muro-resolve HARNESS");
            let entry = mukade::catalog::catalog()
                .harnesses
                .iter()
                .find(|e| muro_desktop_runtime::discovery::id(e.id) == args[1])
                .context("Unknown harness")?;
            println!(
                "{}",
                json!({"executable":mukade::exe::resolve(entry.id,None)})
            );
            Ok(())
        }
        Some("muro-help") => {
            println!(
                "Muro bundled Mukade: upstream CLI plus muro-discover --cache DIRECTORY and muro-resolve HARNESS (JSON)."
            );
            Ok(())
        }
        _ => mukade::cli::run(&args),
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error:#}");
        std::process::exit(1);
    }
}
