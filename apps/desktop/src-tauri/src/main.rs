#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use muro_desktop_runtime::cli::{self, Client};
use serde_json::{Value, json};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

struct Backend(Client);
#[tauri::command]
async fn request(
    state: tauri::State<'_, Backend>,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    let client = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        client
            .request(&action, payload)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    let executable = std::env::current_exe().expect("Muro executable location");
    let data = cli::default_data_dir(&executable).expect("Cannot determine Muro data directory");
    let args: Vec<String> = std::env::args().collect();
    // Compatibility diagnostics still go through the exact bundled CLI boundary.
    if args.get(1).map(String::as_str) == Some("--request") {
        let result = (|| -> anyhow::Result<Value> {
            let client = Client::spawn(&cli::bundled_tool("muroctl")?, &data)?;
            let action = args
                .get(2)
                .ok_or_else(|| anyhow::anyhow!("Missing action"))?;
            let result = client.request(
                action,
                serde_json::from_str(args.get(3).map(String::as_str).unwrap_or("{}"))?,
            )?;
            if action == "adapt" {
                loop {
                    let jobs = client.request("jobs", json!({}))?;
                    if let Some(job) = jobs
                        .as_array()
                        .and_then(|a| a.iter().find(|j| j["id"] == result["id"]))
                    {
                        if job["status"] != "running" {
                            return Ok(job.clone());
                        }
                    }
                    std::thread::sleep(Duration::from_millis(250));
                }
            }
            Ok(result)
        })();
        match result {
            Ok(value) => println!("{value}"),
            Err(error) => {
                eprintln!("{error:#}");
                std::process::exit(1)
            }
        }
        return;
    }
    #[cfg(windows)]
    {
        let profile = data.join("webview");
        std::fs::create_dir_all(&profile).expect("Cannot create Muro WebView profile");
        // Startup is still single-threaded. Avoid inheriting another desktop app's live profile.
        unsafe {
            std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", profile);
        }
    }
    tauri::Builder::default()
        .setup(move |app| {
            std::fs::create_dir_all(&data)?;
            let client = Client::spawn(&cli::bundled_tool("muroctl")?, &data)?;
            // Handshake surfaces startup failures before showing an apparently connected UI.
            client.request("registry", json!({}))?;
            app.manage(Backend(client.clone()));
            let show = MenuItem::with_id(app, "show", "Open Muro", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Muro — Registry")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            let running = Arc::new(AtomicBool::new(true));
            let worker_running = running.clone();
            app.manage(running);
            std::thread::spawn(move || {
                let mut last: Option<Instant> = None;
                while worker_running.load(Ordering::Relaxed) {
                    let Ok(registry) = client.request("registry", json!({})) else {
                        std::thread::sleep(Duration::from_secs(5));
                        continue;
                    };
                    let settings = &registry["settings"];
                    let interval = Duration::from_secs(
                        settings["interval_minutes"]
                            .as_u64()
                            .unwrap_or(60)
                            .max(1)
                            .saturating_mul(60),
                    );
                    if settings["auto_sync"] == true
                        && !last.is_some_and(|time| time.elapsed() < interval)
                    {
                        last = Some(Instant::now());
                        let result = (|| -> anyhow::Result<()> {
                            for plugin in registry["plugins"].as_array().into_iter().flatten() {
                                client.request("resolve", json!({"id":plugin["id"]}))?;
                            }
                            let plan = client.request("plan", json!({}))?;
                            if plan["blockers"].as_array().is_some_and(|b| !b.is_empty()) {
                                anyhow::bail!("{}", plan["blockers"])
                            }
                            client.request("apply", json!({"plan_id":plan["id"]}))?;
                            Ok(())
                        })();
                        let _ = client.request(
                            "automation_record",
                            json!({"error":result.err().map(|e|format!("{e:#}"))}),
                        );
                    }
                    std::thread::sleep(Duration::from_secs(5));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![request])
        .run(tauri::generate_context!())
        .expect("Muro desktop startup failed");
}
