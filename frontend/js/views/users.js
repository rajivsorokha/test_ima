const ROLE_OPTIONS = [
  { value: 'admin', label: 'Owner/Admin — full access' },
  { value: 'manager', label: 'Manager — operations + finance' },
  { value: 'accountant', label: 'Accountant — finance, payroll, reports' },
  { value: 'salesman', label: 'Salesman — Point of Sale only' },
];

async function renderUsers(view) {
  view.innerHTML = `
    <div class="page-header">
      <div><h1>Users</h1><p class="subtitle">Manage who can sign in and what they can access.</p></div>
      <button class="primary" id="addUserBtn">+ Add User</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody id="userRows"></tbody>
    </table></div>
    <div class="card" style="margin-top:16px;">
      <h2>What each role can see</h2>
      <table>
        <thead><tr><th>Role</th><th>Access</th></tr></thead>
        <tbody>
          <tr><td><span class="pill amber">Owner/Admin</span></td><td>Everything, including user accounts.</td></tr>
          <tr><td><span class="pill green">Manager</span></td><td>Cows, milk, quality tests, tanks, POS, health, tasks, finance, employees &amp; leave, reports, milk network. No user management.</td></tr>
          <tr><td><span class="pill gray">Accountant</span></td><td>Financial ledger, employees &amp; payroll, reports, milk network &amp; invoices, and the dashboard/POS.</td></tr>
          <tr><td><span class="pill gray">Salesman</span></td><td>Dashboard and Point of Sale only.</td></tr>
        </tbody>
      </table>
    </div>
  `;

  async function load() {
    const users = await apiGet('/auth/users');
    const rows = document.getElementById('userRows');
    rows.innerHTML = users.length ? users.map(u => `
      <tr>
        <td>${u.name}</td><td>${u.username}</td>
        <td><span class="pill ${u.role === 'admin' ? 'amber' : u.role === 'manager' ? 'green' : 'gray'}">${roleLabel(u.role)}</span></td>
        <td><span class="pill ${pillClass(u.status)}">${u.status}</span></td>
        <td><button class="small editBtn" data-id="${u.id}">Edit</button> <button class="small danger delBtn" data-id="${u.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No users yet.</div></td></tr>`;

    rows.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => editUser(users.find(u => u.id == b.dataset.id))));
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Remove this user? They will no longer be able to sign in.')) {
        try { await apiDelete(`/auth/users/${b.dataset.id}`); toast('User removed'); load(); }
        catch (err) { toast(err.message, true); }
      }
    }));
  }

  function editUser(u) {
    openModal({
      title: 'Edit User',
      fields: [
        { name: 'name', label: 'Name', required: true, value: u.name },
        { name: 'role', label: 'Role', type: 'select', value: u.role, options: ROLE_OPTIONS },
        { name: 'status', label: 'Status', type: 'select', value: u.status, options: ['Active', 'Inactive'].map(s => ({ value: s, label: s })) },
        { name: 'password', label: 'New Password (leave blank to keep current)', type: 'password' },
      ],
      submitLabel: 'Save Changes',
      onSubmit: async (data, overlay) => {
        await apiPut(`/auth/users/${u.id}`, data); overlay.remove(); toast('User updated'); load();
      }
    });
  }

  document.getElementById('addUserBtn').addEventListener('click', () => {
    openModal({
      title: 'Add User',
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'username', label: 'Username', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'role', label: 'Role', type: 'select', value: 'salesman', options: ROLE_OPTIONS },
      ],
      submitLabel: 'Add User',
      onSubmit: async (data, overlay) => {
        try { await apiPost('/auth/users', data); overlay.remove(); toast('User added'); load(); }
        catch (err) { toast(err.message, true); }
      }
    });
  });

  load();
}
