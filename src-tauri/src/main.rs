// Ima Langnubi Dairy — Tauri shell.
//
// This spawns the Node.js/Express API (which serves both the REST API and the
// static frontend) as a child process, then opens a window pointing at it.
//
// On Windows this also suppresses two things that would otherwise show a
// black CMD-style console window: the console subsystem of this Rust app
// itself in release builds, and the console Windows normally allocates for
// any spawned console-subsystem child process (node.exe). The backend's
// stdout/stderr, and its SQLite database, are written to the per-user app
// data dir (e.g. %APPDATA%\com.imalangnubi.dairy on Windows) — NOT inside
// the install folder, which is often read-only for non-admin users (e.g.
// Program Files) and would otherwise crash the backend on first DB write.
//
// DEV MODE: run `npm install` in /backend once, then `cargo tauri dev` from
// this src-tauri/ directory. It resolves the backend relative to this crate.
// (Dev builds intentionally keep a console — that's normal and useful while
// developing.)
//
// PRODUCTION BUILD: the `backend` folder is bundled as a resource (see
// tauri.conf.json -> bundle.resources). End users do NOT need Node.js
// installed: we launch a portable copy of `node.exe` (Windows) / `node`
// (macOS/Linux) that must be placed at `backend/node-runtime/` *before*
// running `cargo tauri build`. See backend/node-runtime/README.md for the
// exact steps. If that folder is missing, we silently fall back to
// whatever `node` is on the system PATH (fine for dev, NOT fine to ship).

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

/// Name of the portable Node.js executable we look for inside
/// `backend/node-runtime/`. This is a plain copy of node.exe (Windows) or
/// the `node` binary (macOS/Linux) — NOT a system install. Bundling it here
/// means end users don't need Node.js installed at all.
#[cfg(windows)]
const BUNDLED_NODE_NAME: &str = "node.exe";
#[cfg(not(windows))]
const BUNDLED_NODE_NAME: &str = "node";

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

/// Picks which `node` executable to launch:
///  1. A portable copy bundled at `backend/node-runtime/<node.exe|node>` —
///     used in production so end users need nothing pre-installed.
///  2. Falls back to whatever `node` is on the system PATH — used in dev,
///     or if someone forgot to drop the portable runtime in before building.
fn resolve_node_command(backend_dir: &PathBuf) -> String {
    let bundled_node = backend_dir.join("node-runtime").join(BUNDLED_NODE_NAME);
    if bundled_node.exists() {
        return bundled_node.to_string_lossy().into_owned();
    }
    "node".to_string()
}

/// Opens (or creates) `backend.log` in the given directory for the child
/// process's stdout/stderr, so startup problems are still visible there
/// rather than just disappearing (no console window is shown in release).
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
    let node_command = resolve_node_command(&backend_dir);

    // Never write app data (the SQLite DB, logs) inside the install
    // directory — on Windows that's typically Program Files, which a
    // normal (non-admin) user can't write to. Writes there fail silently
    // from the app's perspective: the process crashes on first DB access,
    // even though Express had already logged a successful "listening"
    // line moments earlier. Use the OS-appropriate per-user app data dir
    // instead (e.g. %APPDATA%\com.imalangnubi.dairy on Windows).
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| backend_dir.clone());
    let _ = std::fs::create_dir_all(&data_dir);

    let db_path = data_dir.join("ima_langnubi_dairy.db");
    let (stdout, stderr) = backend_log_stdio(&data_dir);

    let mut cmd = Command::new(node_command);
    cmd.arg("server.js")
        .current_dir(&backend_dir)
        .env("PORT", PORT.to_string())
        .env("FARM_NAME", "Ima Langnubi Dairy")
        .env("DB_PATH", &db_path)
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
