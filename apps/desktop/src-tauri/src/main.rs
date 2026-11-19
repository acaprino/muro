#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use anyhow::Context;
#[cfg(windows)]
use muro_desktop_runtime::single_instance;
use muro_desktop_runtime::{
    autostart,
    cli::{self, Client},
    sync_gate::SyncGate,
    tray,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::Arc,
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
/// How long Quit waits for a sync in progress before it ends Muro anyway.
const QUIT_WAIT: Duration = Duration::from_secs(60);

/// The backend the window talks to, and what the shell itself answers.
#[derive(Clone)]
struct Backend {
    client: Client,
    executable: PathBuf,
    /// The name of the per-user Run value that starts Muro with Windows.
    autostart: String,
    /// Every `sync_now` goes through it, whoever asks: one at a time, and Quit waits for it.
    gate: Arc<SyncGate>,
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
            "sync_now" => self
                .gate
                .run(|| self.client.request(action, payload))
                .context("Muro is closing")?,
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

/// The tray's two lines that change, and the syncs behind them.
#[derive(Clone)]
struct Background {
    backend: Backend,
    state: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
}

impl Background {
    /// One `sync_now`. The runtime records its outcome, failures included, for the Activity page.
    fn sync(&self, apply: bool) {
        let _ = self.backend.request("sync_now", json!({"apply":apply}));
        self.refresh();
    }

    /// Sets the state line and the pause item from the registry as it is now. Once Muro is
    /// quitting the line says what it waits for, and nothing else writes it.
    fn refresh(&self) {
        if let Ok(snapshot) = self.backend.client.request("snapshot", json!({})) {
            if self.backend.gate.is_quitting() {
                return;
            }
            let _ = self
                .state
                .set_text(tray::state_line(&snapshot, tray::local_clock));
            let _ = self.pause.set_text(tray::pause_label(&snapshot));
        }
    }

    /// Flips `auto_sync` in the saved settings; the registry checks the revision.
    fn toggle_pause(&self) -> anyhow::Result<()> {
        let registry = self.backend.client.request("registry", json!({}))?;
        let mut settings = registry["settings"].clone();
        settings["auto_sync"] = json!(settings["auto_sync"] != true);
        self.backend.client.request(
            "settings",
            json!({"revision":registry["revision"],"settings":settings}),
        )?;
        self.refresh();
        Ok(())
    }

    /// Ends Muro without cutting a sync off: none starts from now on, the one in progress ends
    /// (for `QUIT_WAIT` at most) while the state line says so, and then the process exits. The
    /// one way out of Muro: Quit in the tray and a close with `close_to_tray` off both come
    /// here. It waits on a thread of its own, never on the one that asked.
    fn quit(&self, app: &tauri::AppHandle) {
        let (work, app) = (self.clone(), app.clone());
        std::thread::spawn(move || {
            work.backend.gate.quit(QUIT_WAIT, || {
                let _ = work.state.set_text(tray::FINISHING);
            });
            app.exit(0);
        });
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
            if let Ok(registry) = self.backend.client.request("registry", json!({})) {
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
    // Started with Windows: Muro waits in the notification area, without a window.
    let background = args.iter().skip(1).any(|arg| arg == "--background");
    // One Muro for each data directory, claimed before anything touches that directory. A Muro
    // started while another runs asks it to show its window, unless it was started in the
    // background, and ends: there is no second backend and nothing to report.
    #[cfg(windows)]
    let signal = match single_instance::Signal::open(&data) {
        Ok((signal, true)) => Some(signal),
        Ok((signal, false)) => {
            let raised = if background { Ok(()) } else { signal.raise() };
            if let Err(error) = raised {
                eprintln!("Show the running Muro: {error:#}");
            }
            return;
        }
        // Without the signal Muro still runs, as it did before: a second one is then refused
        // by the backend's own lock on the data directory.
        Err(error) => {
            eprintln!("Single instance: {error:#}");
            None
        }
    };
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
            let backend = Backend {
                client,
                executable,
                autostart: autostart_name(),
                gate: Arc::new(SyncGate::new()),
            };
            // A Run value whose executable is gone is pointed at this copy; one that names a
            // copy that exists is that copy's, and a failure is no reason to stop this one.
            if let Err(error) = autostart::repair(&backend.autostart, &backend.executable) {
                eprintln!("Start with Windows: {error:#}");
            }
            app.manage(backend.clone());
            let state = MenuItem::with_id(app, "state", "Not checked yet", false, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Open Muro", true, None::<&str>)?;
            let sync = MenuItem::with_id(app, "sync", "Sync now", true, None::<&str>)?;
            let pause =
                MenuItem::with_id(app, "pause", "Pause automatic sync", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Muro", true, None::<&str>)?;
            let line = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&state, &show, &sync, &pause, &line, &quit])?;
            let work = Background {
                backend,
                state,
                pause,
            };
            app.manage(work.clone());
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
                    "quit" => for_menu.quit(app),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            // Each raise of the signal is a Muro that the user started again, asking this one
            // to show its window. One that comes while this Muro is still starting waits here.
            #[cfg(windows)]
            if let Some(signal) = signal {
                let (app, gate) = (app.handle().clone(), work.backend.gate.clone());
                std::thread::spawn(move || {
                    loop {
                        match signal.wait(None) {
                            // A Muro that is quitting does not open a window to close it again.
                            Ok(_) if gate.is_quitting() => {}
                            Ok(_) => show_window(&app),
                            Err(error) => {
                                eprintln!("Single instance: {error:#}");
                                break;
                            }
                        }
                    }
                });
            }
            std::thread::spawn(move || work.run());
            if !background {
                show_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Before the backend is up there is nothing to keep running.
                let (Some(backend), Some(work)) = (
                    window.try_state::<Backend>(),
                    window.try_state::<Background>(),
                ) else {
                    return;
                };
                // The window always goes away; whether Muro stays is the setting.
                api.prevent_close();
                let _ = window.hide();
                if !close_to_tray(&backend.client) {
                    work.quit(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![request])
        .run(tauri::generate_context!())
        .expect("Muro desktop startup failed");
}
