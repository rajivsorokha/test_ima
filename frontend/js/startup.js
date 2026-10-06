// Waits for the backend to actually be reachable before showing the login
// screen. Without this, the Tauri window appears instantly (it's just
// static HTML) while the backend Node process is still spawning in the
// background -- so a user who logs in within that first second or two used
// to see "Couldn't reach the server", even though the backend was about to
// be ready a moment later. This is especially likely on a fresh install,
// where antivirus / Windows SmartScreen may do a first-run scan of the
// bundled node.exe before letting it fully execute, delaying startup.

(function () {
  function resolveApiBase() {
    if (window.__API_BASE__) return window.__API_BASE__;
    const isTauriShell =
      window.location.hostname === 'tauri.localhost' ||
      !!window.__TAURI_INTERNALS__ ||
      !!window.__TAURI__;
    if (isTauriShell) return 'http://localhost:4000';
    const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    return isWebProtocol ? window.location.origin : 'http://localhost:4000';
  }

  let HEALTH_URL = resolveApiBase() + '/api/health';
  const POLL_INTERVAL_MS = 400;
  const GIVE_UP_AFTER_MS = 25000; // show a retry option after ~25s of trying

  const startupScreen = document.getElementById('startupScreen');
  const loginScreen = document.getElementById('loginScreen');
  const message = document.getElementById('startupMessage');
  const spinner = document.getElementById('startupSpinner');
  const retryBtn = document.getElementById('startupRetryBtn');

  function showLoginNow() {
    startupScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }

  function checkOnce() {
    return fetch(HEALTH_URL, { cache: 'no-store' }).then((res) => res.ok);
  }

  // Multi-computer (LAN) mode: if this computer is set up as a "Client"
  // (Settings -> Network Setup), it has no local backend to wait for at
  // all — go straight to checking the Server computer's address instead.
  // Resolved before the first poll attempt, so there's no race with
  // api.js's own copy of this same check.
  async function applyNetworkConfig() {
    if (!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)) return;
    try {
      const config = await window.__TAURI__.core.invoke('get_network_config');
      if (config && config.mode === 'client' && config.server_ip) {
        HEALTH_URL = `http://${config.server_ip}:4000/api/health`;
        message.textContent = `Connecting to ${config.server_ip}...`;
      }
    } catch (err) { /* not fatal — stays on this machine's own localhost */ }
  }

  function pollUntilReady() {
    const startedAt = Date.now();
    message.textContent = 'Starting up…';
    spinner.classList.remove('hidden');
    retryBtn.classList.add('hidden');

    (function attempt() {
      checkOnce()
        .then((ok) => {
          if (ok) { showLoginNow(); return; }
          throw new Error('not ready');
        })
        .catch(() => {
          if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
            message.textContent = "Still can't reach the app's backend. It may need a moment longer, or something is blocking it.";
            spinner.classList.add('hidden');
            retryBtn.classList.remove('hidden');
            return;
          }
          setTimeout(attempt, POLL_INTERVAL_MS);
        });
    })();
  }

  retryBtn.addEventListener('click', pollUntilReady);

  applyNetworkConfig().then(pollUntilReady);
})();
