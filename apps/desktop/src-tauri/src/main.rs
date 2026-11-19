#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use anyhow::Context;
use muro_desktop_runtime::{
    autostart,
    cli::{self, Client},
    tray,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex, PoisonError},
    time::{Duration, Instant},
};
use tauri::{
    Manager, WindowEvent,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};

/// How often the worker looks at the registry's settings, and how long the tray's state line
/// may go unread when nothing it depends on has changed.
const POLL: Duration = Duration::from_secs(5);
const TRAY_REFRESH: Duration = Duration::from_secs(30);

/// The backend the window talks to, and what the shell itself answers.
#[derive(Clone)]
struct Backend {
    client: Client,
    executable: PathBuf,
    /// The name of the per-user Run value that starts Muro with Windows.
    autostart: String,
}

impl Backend {
    /// `autostart` and `set_autostart` are the shell's own: only it knows its executable.
    /// Everything else goes to the backend.
    fn request(&self, action: &str, payload: Value) -> anyhow::Result<Value> {
        match action {
            "autostart" => autostart::state(&self.autostart, &self.executable),
            "set_autostart" => {
                let enabled = payload["enabled"]
                    .as_bool()
                    .context("enabled must be a boolean")?;
                autostart::set(&self.autostart, &self.executable, enabled)
            }
            _ => self.client.request(action, payload),
        }
    }
}

#[tauri::command]
async fn request(
    state: tauri::State<'_, Backend>,
    action: String,
    payload: Value,
) -> Result<Value, String> {
    let backend = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        backend
            .request(&action, payload)
            .map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Whether closing the window leaves Muro running in the notification area: the setting
/// `close_to_tray`. When the registry cannot be read, an operation is writing it and the answer
/// is yes: closing must not end that operation halfway.
fn close_to_tray(client: &Client) -> bool {
    client
        .request("registry", json!({}))
        .map(|registry| registry["settings"]["close_to_tray"] != false)
        .unwrap_or(true)
}

/// The tray's two lines that change, and the syncs behind them. One sync runs at a time: the
/// registry refuses a second writer.
#[derive(Clone)]
struct Background {
    client: Client,
    state: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    running: Arc<Mutex<()>>,
}

impl Background {
    /// One `sync_now`. The runtime records its outcome, failures included, for the Activity page.
    fn sync(&self, apply: bool) {
        let _alone = self.running.lock().unwrap_or_else(PoisonError::into_inner);
        let _ = self.client.request("sync_now", json!({"apply":apply}));
        self.refresh();
    }

    /// Sets the state line and the pause item from the registry as it is now.
    fn refresh(&self) {
        if let Ok(snapshot) = self.client.request("snapshot", json!({})) {
            let _ = self
                .state
                .set_text(tray::state_line(&snapshot, tray::local_clock));
            let _ = self.pause.set_text(tray::pause_label(&snapshot));
        }
    }

    /// Flips `auto_sync` in the saved settings; the registry checks the revision.
    fn toggle_pause(&self) -> anyhow::Result<()> {
        let registry = self.client.request("registry", json!({}))?;
        let mut settings = registry["settings"].clone();
        settings["auto_sync"] = json!(settings["auto_sync"] != true);
        self.client.request(
            "settings",
            json!({"revision":registry["revision"],"settings":settings}),
        )?;
        self.refresh();
        Ok(())
    }

    /// At start and then at every interval, always: a sync that applies when `auto_sync` is on,
    /// and a check that only looks when it is off, so the tray and the Sync page stay true.
    /// Settings are read again every pass, so a change takes effect within `POLL`.
    fn run(&self) {
        self.refresh();
        let mut synced: Option<Instant> = None;
        let mut refreshed = Instant::now();
        let mut revision = Value::Null;
        loop {
            if let Ok(registry) = self.client.request("registry", json!({})) {
                let settings = &registry["settings"];
                let interval = Duration::from_secs(
                    settings["interval_minutes"]
                        .as_u64()
                        .unwrap_or(60)
                        .max(1)
                        .saturating_mul(60),
                );
                if synced.is_none_or(|time| time.elapsed() >= interval) {
                    synced = Some(Instant::now());
                    self.sync(settings["auto_sync"] == true);
                    refreshed = Instant::now();
                } else if registry["revision"] != revision || refreshed.elapsed() >= TRAY_REFRESH {
                    self.refresh();
                    refreshed = Instant::now();
                }
                revision = registry["revision"].clone();
            }
            std::thread::sleep(POLL);
        }
    }
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn autostart_name() -> String {
    std::env::var("MURO_AUTOSTART_NAME")
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Muro".into())
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
    // Started with Windows: Muro waits in the notification area, without a window.
    let background = args.iter().skip(1).any(|arg| arg == "--background");
    tauri::Builder::default()
        .setup(move |app| {
            std::fs::create_dir_all(&data)?;
            let client = Client::spawn(&cli::bundled_tool("muroctl")?, &data)?;
            // Handshake surfaces startup failures before showing an apparently connected UI.
            client.request("registry", json!({}))?;
            let backend = Backend {
                client: client.clone(),
                executable,
                autostart: autostart_name(),
            };
            // A Run value that names another copy of Muro starts that copy: it is no reason to
            // stop this one.
            if let Err(error) = autostart::repair(&backend.autostart, &backend.executable) {
                eprintln!("Start with Windows: {error:#}");
            }
            app.manage(backend);
            let state = MenuItem::with_id(app, "state", "Not checked yet", false, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Muro", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
            let pause =
                MenuItem::with_id(app, "pause", "Pause automatic sync", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Muro", true, None::<&str>)?;
            let line = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&state, &show, &sync, &pause, &line, &quit])?;
            let work = Background {
                client,
                state,
                pause,
                running: Arc::new(Mutex::new(())),
            };
            let for_menu = work.clone();
            let mut tray = TrayIconBuilder::new()
                .tooltip("Muro")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_window(app),
                    // A sync lasts as long as it lasts: never on the thread of the menu.
                    "sync" => {
                        let work = for_menu.clone();
                        std::thread::spawn(move || work.sync(true));
                    }
                    "pause" => {
                        let work = for_menu.clone();
                        std::thread::spawn(move || {
                            if let Err(error) = work.toggle_pause() {
                                eprintln!("Automatic sync: {error:#}");
                            }
                        });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            std::thread::spawn(move || work.run());
            if !background {
                show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Before the backend is up there is nothing to keep running.
                let Some(backend) = window.try_state::<Backend>() else {
                    return;
                };
                if close_to_tray(&backend.client) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![request])
        .run(tauri::generate_context!())
        .expect("Muro desktop startup failed");
}
