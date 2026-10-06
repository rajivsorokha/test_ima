// Auto-locks the app after a period of no mouse/keyboard/touch activity.
// Unlike a full logout, this keeps the current session (token) and
// whatever page the user was on — it just blocks the screen behind a
// password prompt until the SAME user unlocks it, or chooses to log out
// properly instead.
//
// The timeout is a per-device preference (stored in localStorage, not
// tied to the user account), selectable from the dropdown next to the
// theme switcher: 5 / 10 / 15 / 20 minutes, or "Never".

(function () {
  const STORAGE_KEY = 'ild_idle_minutes';
  const DEFAULT_MINUTES = 10;

  const lockScreen = document.getElementById('lockScreen');
  const appShell = document.getElementById('appShell');
  const lockUserLine = document.getElementById('lockUserLine');
  const unlockForm = document.getElementById('unlockForm');
  const unlockPassword = document.getElementById('unlockPassword');
  const unlockError = document.getElementById('unlockError');
  const lockLogoutLink = document.getElementById('lockLogoutLink');
  const autoLockSelect = document.getElementById('autoLockSelect');

  let idleTimer = null;
  let locked = false;

  function getTimeoutMinutes() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const n = stored === null ? DEFAULT_MINUTES : Number(stored);
    return Number.isFinite(n) ? n : DEFAULT_MINUTES;
  }

  function setTimeoutMinutes(n) {
    localStorage.setItem(STORAGE_KEY, String(n));
  }

  // Only meaningful once the app itself is actually visible (i.e. the
  // user is logged in and past the startup/login screens) — no point
  // idle-tracking the login screen itself.
  function isAppActive() {
    return !appShell.classList.contains('hidden');
  }

  function showLockScreen() {
    if (locked || !isAppActive()) return;
    locked = true;
    const user = getCurrentUser();
    lockUserLine.textContent = user ? `Locked — signed in as ${user.name}` : 'Locked due to inactivity';
    unlockError.classList.add('hidden');
    unlockPassword.value = '';
    lockScreen.classList.remove('hidden');
    setTimeout(() => unlockPassword.focus(), 50);
  }

  function hideLockScreen() {
    locked = false;
    lockScreen.classList.add('hidden');
    resetIdleTimer();
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    const minutes = getTimeoutMinutes();
    if (minutes <= 0) return; // "Never"
    idleTimer = setTimeout(showLockScreen, minutes * 60 * 1000);
  }

  // Throttled activity listener — no need to reset the timer on every
  // single mousemove event, once a second is plenty.
  let lastActivityReset = 0;
  function onActivity() {
    if (locked) return; // typing the unlock password shouldn't itself unlock anything
    const now = Date.now();
    if (now - lastActivityReset < 1000) return;
    lastActivityReset = now;
    resetIdleTimer();
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((evt) => {
    document.addEventListener(evt, onActivity, { passive: true });
  });

  unlockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlockError.classList.add('hidden');
    const user = getCurrentUser();
    if (!user) { showLogin(); return; }
    try {
      // Re-uses the normal login endpoint to verify the password without
      // adding a new backend route. On success this also issues a fresh
      // token, which is fine — it just quietly extends the session.
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: user.username, password: unlockPassword.value }),
      });
      setAuthToken(res.token);
      setCurrentUser(res.user);
      hideLockScreen();
    } catch (err) {
      unlockError.textContent = 'Incorrect password';
      unlockError.classList.remove('hidden');
      unlockPassword.value = '';
      unlockPassword.focus();
    }
  });

  lockLogoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    locked = false;
    lockScreen.classList.add('hidden');
    try { await apiPost('/auth/logout', {}); } catch (err) { /* ignore */ }
    setAuthToken(null);
    setCurrentUser(null);
    showLogin();
  });

  if (autoLockSelect) {
    autoLockSelect.value = String(getTimeoutMinutes());
    autoLockSelect.addEventListener('change', () => {
      setTimeoutMinutes(Number(autoLockSelect.value));
      resetIdleTimer();
    });
  }

  // Start (and keep re-arming) the idle timer only while the app is
  // actually shown; showApp()/showLogin() elsewhere toggle appShell's
  // visibility, so a light poll here is simpler and more robust than
  // hooking every place that could show/hide the app.
  setInterval(() => {
    if (isAppActive() && !locked && !idleTimer) resetIdleTimer();
    if (!isAppActive() && idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }, 2000);
})();
