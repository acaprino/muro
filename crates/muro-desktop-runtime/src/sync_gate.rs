//! Which sync runs, and the end of Muro that waits for it. The registry refuses a second writer,
//! so syncs run one at a time; and Muro, which now lives in the notification area and syncs in
//! the background, must not end in the middle of one, so quitting waits for it.

use std::{
    sync::{Condvar, Mutex, MutexGuard, PoisonError},
    time::Duration,
};

#[derive(Default)]
struct State {
    running: bool,
    quitting: bool,
}

#[derive(Default)]
pub struct SyncGate {
    state: Mutex<State>,
    changed: Condvar,
}

impl SyncGate {
    pub fn new() -> Self {
        Self::default()
    }

    // A thread that panicked in a sync leaves a state that is still true: `Running` clears the
    // flag as it unwinds.
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Runs `sync` as the only sync: it waits for the one in progress first. Returns `None`,
    /// without running it, once `quit` has begun: no sync starts that quit would have to wait
    /// for in turn.
    pub fn run<T>(&self, sync: impl FnOnce() -> T) -> Option<T> {
        let mut state = self.lock();
        while state.running && !state.quitting {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(PoisonError::into_inner);
        }
        if state.quitting {
            return None;
        }
        state.running = true;
        drop(state);
        let _running = Running(self);
        Some(sync())
    }

    /// Waits, for `limit` at most, until no sync is running: a request of the window that the
    /// registry would refuse while a sync holds it waits here for the sync to end, and only
    /// the one in progress is waited for, never one queued behind it. Returns whether none is
    /// running at the end; `false` is the limit running out.
    pub fn wait_idle(&self, limit: Duration) -> bool {
        let (state, _) = self
            .changed
            .wait_timeout_while(self.lock(), limit, |state| state.running)
            .unwrap_or_else(PoisonError::into_inner);
        !state.running
    }

    /// Whether `quit` has begun.
    pub fn is_quitting(&self) -> bool {
        self.lock().quitting
    }

    /// Begins quitting and waits, for `limit` at most, for the sync in progress to end. When one
    /// is in progress `waiting` is called first, once, so the tray can say so; it runs without
    /// the gate held. Returns whether no sync was running at the end: `false` is the limit
    /// running out. Afterwards no sync starts.
    pub fn quit(&self, limit: Duration, waiting: impl FnOnce()) -> bool {
        let mut state = self.lock();
        state.quitting = true;
        // Wakes the syncs that were queued behind the one in progress: they will not run.
        self.changed.notify_all();
        if state.running {
            drop(state);
            waiting();
            state = self.lock();
        }
        let (state, _) = self
            .changed
            .wait_timeout_while(state, limit, |state| state.running)
            .unwrap_or_else(PoisonError::into_inner);
        !state.running
    }
}

/// Marks the end of a sync, also when it panics.
struct Running<'a>(&'a SyncGate);

impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.lock().running = false;
        self.0.changed.notify_all();
    }
}
