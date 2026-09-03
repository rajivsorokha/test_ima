const routes = {
  dashboard: renderDashboard,
  cows: renderCows,
  milk: renderMilk,
  quality: renderQuality,
  tanks: renderTanks,
  pos: renderPos,
  finance: renderFinance,
  health: renderHealth,
  tasks: renderTasks,
  employees: renderEmployees,
  reports: renderReports,
  network: renderNetwork,
  users: renderUsers,
  settings: renderSettings,
};

// Mirrors the data-roles on each nav link — used to catch direct hash
// navigation to a page the current role can't see (not just hide the link).
const ROUTE_ROLES = {
  cows: ['admin', 'manager'],
  milk: ['admin', 'manager'],
  quality: ['admin', 'manager'],
  tanks: ['admin', 'manager'],
  finance: ['admin', 'manager', 'accountant'],
  health: ['admin', 'manager'],
  tasks: ['admin', 'manager'],
  employees: ['admin', 'manager', 'accountant'],
  reports: ['admin', 'manager', 'accountant'],
  network: ['admin', 'manager', 'accountant'],
  users: ['admin'],
  settings: ['admin'],
};

async function router() {
  if (!getAuthToken()) return; // login screen owns the UI until authenticated
  const hash = (window.location.hash || '#dashboard').slice(1);
  const route = routes[hash] ? hash : 'dashboard';
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  const view = document.getElementById('view');

  const user = getCurrentUser();
  const allowedRoles = ROUTE_ROLES[route];
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    view.innerHTML = `<div class="empty-state">
      Your role (${roleLabel(user.role)}) doesn't have access to this page.<br><br>
      <a href="#dashboard" class="link">Go to Dashboard</a>
    </div>`;
    return;
  }

  view.innerHTML = `<div class="empty-state">Loading…</div>`;
  try {
    await routes[route](view);
  } catch (err) {
    view.innerHTML = `<div class="empty-state">Couldn't load this page: ${err.message}<br><br>Is the API server running at ${API_BASE}?</div>`;
  }
}

window.addEventListener('hashchange', router);
