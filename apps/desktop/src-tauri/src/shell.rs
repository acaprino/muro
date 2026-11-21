//! App wiring for the shared Imago native shell. Registry/tray behaviour remains in main.rs.
use imago_shell::{
    ProcessFailure, Recovery, RecoveryAction, SnapLayouts, apply_theme,
    disable_browser_accelerators, glass_window_config, guard_navigation_with_scheme,
    install_reload_menu, install_snap_layouts, parse_theme, recovery_action, save_theme,
    saved_theme, watch_process_failures,
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Mutex,
        atomic::{AtomicBool, AtomicU8, Ordering},
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewWindow, WebviewWindowBuilder};

pub struct Shell {
    data: PathBuf,
    overlays: Mutex<HashMap<String, SnapLayouts>>,
    recovery: Mutex<HashMap<String, Recovery>>,
    lifecycle: WindowLifecycle,
    ready: AtomicBool,
}

/// Creation/replacement is single-flight. A show request made during recovery is
/// consumed atomically when it finishes, so a tray click cannot disappear between
/// clearing the recovery flag and checking whether the new window should open.
#[derive(Default)]
struct WindowLifecycle(AtomicU8);
impl WindowLifecycle {
    const REBUILDING: u8 = 1;
    const SHOW: u8 = 2;

    fn rebuilding(&self) -> bool {
        self.0.load(Ordering::SeqCst) & Self::REBUILDING != 0
    }
    fn request_show(&self) -> bool {
        self.0.fetch_or(Self::SHOW, Ordering::SeqCst) & Self::REBUILDING == 0
    }
    fn begin(&self) -> bool {
        self.0.fetch_or(Self::REBUILDING, Ordering::SeqCst) & Self::REBUILDING == 0
    }
    fn finish(&self) -> bool {
        self.0.swap(0, Ordering::SeqCst) & Self::SHOW != 0
    }
    fn shown(&self) {
        // A concurrent replacement still needs the show request on its new window.
        let _ = self
            .0
            .compare_exchange(Self::SHOW, 0, Ordering::SeqCst, Ordering::SeqCst);
    }
}
impl Shell {
    pub fn new(data: PathBuf) -> Self {
        Self {
            data,
            overlays: Mutex::default(),
            recovery: Mutex::default(),
            lifecycle: WindowLifecycle::default(),
            ready: AtomicBool::new(false),
        }
    }
}

pub fn recovering(app: &AppHandle) -> bool {
    app.try_state::<Shell>()
        // Keep the tray alive even if the implicit exit from destroying the old
        // window arrives after a failed rebuild has released its single-flight
        // gate. Explicit Quit carries an exit code and is never blocked by this.
        .is_some_and(|s| s.lifecycle.rebuilding() || !s.ready.load(Ordering::SeqCst))
}

/// Tray/single-instance requests can restore a main window even after rebuilding
/// failed. Building and waiting for a label to be released never block the UI thread.
pub fn show(app: &AppHandle) {
    let state = app.state::<Shell>();
    if !state.lifecycle.request_show() {
        return;
    }
    if state.ready.load(Ordering::SeqCst) {
        if let Some(window) = app.get_webview_window("main") {
            super::reveal_window(&window);
            state.lifecycle.shown();
            return;
        }
    }
    if !state.lifecycle.begin() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let state = app.state::<Shell>();
        let result = (|| -> tauri::Result<()> {
            // Recovery might have finished between the initial lookup and taking
            // the gate. Reuse a complete window; remove a failed partial build.
            if let Some(window) = app.get_webview_window("main") {
                if state.ready.load(Ordering::SeqCst) {
                    return Ok(());
                }
                destroy_main(&app, &window)?;
            }
            build(&app)
        })();
        finish_recovery(&app, result, false, "Open interface");
    });
}

/// Called only off the UI thread, with the lifecycle gate held.
fn destroy_main(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    let state = app.state::<Shell>();
    state.ready.store(false, Ordering::SeqCst);
    state
        .overlays
        .lock()
        .map_err(|_| std::io::Error::other("Window overlays unavailable"))?
        .remove(window.label());
    let destroyed = window.destroy();
    let deadline = Instant::now() + Duration::from_secs(5);
    while app.get_webview_window("main").is_some() {
        if Instant::now() >= deadline {
            return destroyed.and(Err(
                std::io::Error::other("The old window did not close").into()
            ));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    // A concurrent native destruction may already have removed this window even
    // when destroy() reports it gone. The released label is what the rebuild needs.
    Ok(())
}

fn finish_recovery(app: &AppHandle, result: tauri::Result<()>, visible: bool, operation: &str) {
    let state = app.state::<Shell>();
    // Capture this attempt's readiness before another recovery can acquire the
    // gate and clear it. show() will queue the visibility request on that attempt.
    let ready = state.ready.load(Ordering::SeqCst);
    let requested = state.lifecycle.finish();
    if let Err(error) = result {
        eprintln!("{operation}: {error}; choose Open Muro in the notification area to retry");
    }
    // Geometry restoration may fail after a valid window was created. Keep that
    // usable window visible; failed native initialization is retried on the next
    // explicit request instead of entering an automatic recreation loop.
    if ready && (visible || requested) {
        super::show_window(app);
    }
}

#[tauri::command]
pub fn set_window_theme(
    window: WebviewWindow,
    shell: State<'_, Shell>,
    theme: String,
) -> Result<(), String> {
    let theme = parse_theme(&theme).ok_or_else(|| "Unknown window theme".to_string())?;
    apply_theme(&window, theme).map_err(|e| e.to_string())?;
    save_theme(&shell.data, theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_caption_maximize(
    window: WebviewWindow,
    shell: State<'_, Shell>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    let overlays = shell
        .overlays
        .lock()
        .map_err(|_| "Window overlays unavailable")?;
    let overlay = overlays
        .get(window.label())
        .ok_or("Window overlay not ready")?;
    overlay.set_rect(x, y, width, height);
    Ok(())
}

fn failed(app: &AppHandle, window: &WebviewWindow, failure: ProcessFailure) {
    let state = app.state::<Shell>();
    let action = {
        let Ok(mut histories) = state.recovery.lock() else {
            return;
        };
        recovery_action(
            failure,
            histories.entry(window.label().to_owned()).or_default(),
            Instant::now(),
            state.lifecycle.rebuilding(),
        )
    };
    match action {
        RecoveryAction::Reload => {
            let window = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(failure.reload_delay());
                let _ = window.reload();
            });
        }
        RecoveryAction::Rebuild => {
            if !state.lifecycle.begin() {
                return;
            }
            // The Imago watcher invokes us off the UI thread. Wait here for Tauri to
            // release the old label; waiting on the UI thread would block destruction.
            let visible = window.is_visible().unwrap_or(false);
            let position = window.outer_position().ok();
            let size = window.inner_size().ok();
            let maximized = window.is_maximized().unwrap_or(false);
            let result = (|| -> tauri::Result<()> {
                destroy_main(app, window)?;
                build(app)?;
                if let Some(next) = app.get_webview_window("main") {
                    if let Some(size) = size {
                        next.set_size(size)?;
                    }
                    if let Some(position) = position {
                        next.set_position(position)?;
                    }
                    if maximized {
                        next.maximize()?;
                    }
                }
                Ok(())
            })();
            finish_recovery(app, result, visible, "Rebuild interface");
        }
        RecoveryAction::GiveUp => eprintln!(
            "Muro interface repeatedly failed; use Reload interface in the window menu: {failure:?}"
        ),
        RecoveryAction::Ignore => {}
    }
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let state = app.state::<Shell>();
    state.ready.store(false, Ordering::SeqCst);
    let base = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or_else(|| std::io::Error::other("Main window configuration is missing"))?;
    let config = glass_window_config(base, saved_theme(&state.data));
    let origins: &[&str] = if tauri::is_dev() {
        &["http://127.0.0.1:1421"]
    } else {
        &[]
    };
    let window = guard_navigation_with_scheme(
        WebviewWindowBuilder::from_config(app, &config)?,
        origins,
        config.use_https_scheme,
    )
    .build()?;
    if !tauri::is_dev() {
        disable_browser_accelerators(&window)?;
    }
    let (handle, watched) = (app.clone(), window.clone());
    watch_process_failures(&window, move |failure| failed(&handle, &watched, failure))?;
    let overlay = install_snap_layouts(&window)?;
    state
        .overlays
        .lock()
        .map_err(|_| std::io::Error::other("Window overlays unavailable"))?
        .insert(window.label().to_owned(), overlay);
    let reload = window.clone();
    let handle = app.clone();
    install_reload_menu(&window, "Reload interface", move || {
        if let Ok(mut histories) = handle.state::<Shell>().recovery.lock() {
            if let Some(history) = histories.get_mut(reload.label()) {
                history.reset();
            }
        }
        let _ = reload.reload();
    })?;
    state.ready.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::WindowLifecycle;
    use std::sync::{Arc, Barrier};

    #[test]
    fn simultaneous_retries_have_one_builder() {
        let lifecycle = Arc::new(WindowLifecycle::default());
        let start = Arc::new(Barrier::new(8));
        let attempts: Vec<_> = (0..8)
            .map(|_| {
                let (lifecycle, start) = (lifecycle.clone(), start.clone());
                std::thread::spawn(move || {
                    start.wait();
                    lifecycle.request_show();
                    lifecycle.begin()
                })
            })
            .collect();
        let builders = attempts
            .into_iter()
            .map(|attempt| usize::from(attempt.join().unwrap()))
            .sum::<usize>();
        assert_eq!(builders, 1);
        assert!(lifecycle.finish(), "the successful retry must be shown");
        assert!(!lifecycle.rebuilding());
    }

    #[test]
    fn show_requests_survive_recovery_and_failure_allows_another_retry() {
        let lifecycle = WindowLifecycle::default();
        assert!(lifecycle.begin());
        assert!(
            !lifecycle.request_show(),
            "the running recovery owns creation"
        );
        lifecycle.shown();
        assert!(
            lifecycle.finish(),
            "showing an old window cannot consume the new one's request"
        );
        assert!(
            lifecycle.request_show(),
            "a request after failure can start again"
        );
        assert!(lifecycle.begin());
        assert!(lifecycle.finish());
    }

    #[test]
    fn showing_a_ready_window_does_not_leave_a_pending_request() {
        let lifecycle = WindowLifecycle::default();
        assert!(lifecycle.request_show());
        lifecycle.shown();
        assert!(lifecycle.begin());
        assert!(!lifecycle.finish());
    }
}
