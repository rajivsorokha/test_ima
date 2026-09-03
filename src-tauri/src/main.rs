// Ima Langnubi Dairy — Tauri shell.
//
// This spawns the Node.js/Express API (which serves both the REST API and the
// static frontend) as a child process, then opens a window pointing at it.
//
// On Windows this also suppresses two things that would otherwise show a
// black CMD-style console window: the console subsystem of this Rust app
// itself in release builds, and the console Windows normally allocates for
// any spawned console-subsystem child process (node.exe). The backend's
// stdout/stderr are written to backend/backend.log instead, so startup
// problems are still visible there rather than just disappearing.
//
// DEV MODE: run `npm install` in /backend once, then `cargo tauri dev` from
// this src-tauri/ directory. It resolves the backend relative to this crate.
// (Dev builds intentionally keep a console — that's normal and useful while
// developing.)
//
// PRODUCTION BUILD: the `backend` folder is bundled as a resource (see
// tauri.conf.json -> bundle.resources). For a real installer you should
// package the Node backend as a self-contained binary (e.g. with `pkg` or
// `nexe`) and point the `Command::new("node")` call below at it instead,
// since end users won't have Node installed.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::OpenOptions;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct BackendProcess(Mutex<Option<Child>>);

const PORT: u16 = 4000;

fn resolve_backend_dir(app: &tauri::AppHandle) -> PathBuf {
    // Production: look inside the bundled resources directory.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("backend");
        if bundled.join("server.js").exists() {
            return bundled;
        }
    }
    // Dev fallback: ../backend relative to this crate (src-tauri/).
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend")
}

/// Opens (or creates) backend/backend.log for the child process's stdout and
/// stderr, so startup errors are still recorded even with no visible console.
fn backend_log_stdio(backend_dir: &PathBuf) -> (Stdio, Stdio) {
    let log_path = backend_dir.join("backend.log");
    let open_log = || OpenOptions::new().create(true).append(true).open(&log_path);
    match (open_log(), open_log()) {
        (Ok(out), Ok(err)) => (Stdio::from(out), Stdio::from(err)),
        _ => (Stdio::null(), Stdio::null()),
    }
}

fn spawn_backend(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let backend_dir = resolve_backend_dir(app);
    let (stdout, stderr) = backend_log_stdio(&backend_dir);

    let mut cmd = Command::new("node");
    cmd.arg("server.js")
        .current_dir(&backend_dir)
        .env("PORT", PORT.to_string())
        .env("FARM_NAME", "Ima Langnubi Dairy")
        .stdout(stdout)
        .stderr(stderr);

    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            match spawn_backend(&handle) {
                Ok(child) => {
                    app.manage(BackendProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!(
                        "[ima-langnubi-dairy] Failed to start backend automatically: {e}. \
                         Make sure Node.js is installed, or start it manually with \
                         `npm start` inside /backend, then reload the window."
                    );
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // When the main window closes, kill the backend child process so it
            // doesn't linger in the background.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Ima Langnubi Dairy");
}
