function showLogin() {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function showApp(user) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('userBadge').innerHTML = `<b>${user.name}</b><span class="role-pill">${roleLabel(user.role)}</span>`;
  applyRoleVisibility(user.role);
  router();
}

function applyRoleVisibility(role) {
  // Nav items without data-roles are visible to everyone signed in.
  // Nav items with data-roles="admin manager" show only if the user's role is in that list.
  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(/\s+/);
    el.classList.toggle('hidden', !allowed.includes(role));
  });
}

window.showLogin = showLogin;

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('loginError');
  errorBox.classList.add('hidden');
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    const res = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    setAuthToken(res.token);
    setCurrentUser(res.user);
    showApp(res.user);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove('hidden');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await apiPost('/auth/logout', {}); } catch (e) { /* ignore */ }
  setAuthToken(null); setCurrentUser(null);
  showLogin();
});

(function initAuth() {
  const token = getAuthToken();
  const user = getCurrentUser();
  if (token && user) {
    showApp(user);
  } else {
    showLogin();
  }
})();
