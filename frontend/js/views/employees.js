async function renderEmployees(view) {
  const farms = await apiGet('/farms');
  const farmById = Object.fromEntries(farms.map(f => [f.id, f.name]));

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Staff Directory</h1><p class="subtitle">Manage employees, payroll, and leave/duties across all locations.</p></div>
      <div style="display:flex; gap:8px;">
        <button id="requestLeaveBtn">🗓 Request Leave</button>
        <button class="primary" id="addEmployeeBtn">+ Add Employee</button>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Active Staff</div><div class="value" id="activeStaffVal">-</div></div>
      <div class="stat-card"><div class="label">Monthly Payroll</div><div class="value" id="payrollVal">-</div></div>
    </div>

    <div class="tabs" id="empTabs">
      <button data-tab="directory" class="active">Directory</button>
      <button data-tab="leave">Leave Requests</button>
    </div>

    <div class="card" id="directoryPane">
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Farm</th><th>Contact</th><th>Start Date</th><th>Salary/Mo</th><th>Status</th><th></th></tr></thead>
        <tbody id="empRows"></tbody>
      </table>
    </div>
    <div class="card hidden" id="leavePane">
      <table>
        <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
        <tbody id="leaveRows"></tbody>
      </table>
    </div>
  `;

  let employees = [];
  async function loadEmployees() {
    employees = await apiGet('/employees');
    document.getElementById('activeStaffVal').textContent = employees.filter(e => e.status === 'Active').length;
    document.getElementById('payrollVal').textContent = fmtMoney(employees.filter(e => e.status !== 'Terminated').reduce((s, e) => s + e.salary, 0));
    const rows = document.getElementById('empRows');
    rows.innerHTML = employees.length ? employees.map(e => `
      <tr>
        <td>${e.name}</td><td>${e.role}</td><td>${farmById[e.farm_id] || '-'}</td>
        <td>${e.phone || ''}${e.email ? '<br>' + e.email : ''}</td>
        <td>${fmtDate(e.start_date)}</td><td>${fmtMoney(e.salary)}</td>
        <td><span class="pill ${pillClass(e.status)}">${e.status}</span></td>
        <td><button class="small editBtn" data-id="${e.id}">Edit</button> <button class="small danger delBtn" data-id="${e.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">No employees yet.</div></td></tr>`;

    rows.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => editEmployee(employees.find(e => e.id == b.dataset.id))));
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Remove this employee?')) { await apiDelete(`/employees/${b.dataset.id}`); toast('Employee removed'); loadEmployees(); }
    }));
  }

  async function loadLeaves() {
    const leaves = await apiGet('/employees/leaves/all');
    const rows = document.getElementById('leaveRows');
    rows.innerHTML = leaves.length ? leaves.map(l => `
      <tr>
        <td>${l.employee_name}</td><td>${l.type}</td><td>${fmtDate(l.start_date)}</td><td>${fmtDate(l.end_date)}</td>
        <td><span class="pill ${pillClass(l.status)}">${l.status}</span></td>
        <td>
          ${l.status === 'Pending' ? `<button class="small primary approveBtn" data-id="${l.id}">Approve</button> <button class="small danger rejectBtn" data-id="${l.id}">Reject</button>` : ''}
        </td>
      </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No leave requests yet.</div></td></tr>`;
    rows.querySelectorAll('.approveBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/employees/leaves/${b.dataset.id}/status`, { status: 'Approved' }); toast('Leave approved'); loadLeaves(); loadEmployees();
    }));
    rows.querySelectorAll('.rejectBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/employees/leaves/${b.dataset.id}/status`, { status: 'Rejected' }); toast('Leave rejected'); loadLeaves();
    }));
  }

  document.querySelectorAll('#empTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#empTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('directoryPane').classList.toggle('hidden', b.dataset.tab !== 'directory');
    document.getElementById('leavePane').classList.toggle('hidden', b.dataset.tab !== 'leave');
    if (b.dataset.tab === 'leave') loadLeaves();
  }));

  function empFields(e = {}) {
    return [
      { name: 'name', label: 'Full Name', required: true, value: e.name },
      { name: 'role', label: 'Role', type: 'select', value: e.role || 'Milker',
        options: ['Farm Manager', 'Milker', 'Vet Assistant', 'General Worker', 'Driver'].map(r => ({ value: r, label: r })) },
      { name: 'farm_id', label: 'Farm / Location', type: 'select', value: e.farm_id, options: farms.map(f => ({ value: f.id, label: f.name })) },
      { name: 'phone', label: 'Phone', value: e.phone },
      { name: 'email', label: 'Email', value: e.email },
      { name: 'start_date', label: 'Start Date', type: 'date', value: e.start_date },
      { name: 'salary', label: 'Salary / Month', type: 'number', step: '0.01', value: e.salary || 0 },
      { name: 'status', label: 'Status', type: 'select', value: e.status || 'Active', options: ['Active', 'On Leave', 'Terminated'].map(s => ({ value: s, label: s })) },
    ];
  }

  function editEmployee(e) {
    openModal({ title: 'Edit Employee', fields: empFields(e), submitLabel: 'Save Changes',
      onSubmit: async (data, overlay) => { await apiPut(`/employees/${e.id}`, { ...data, salary: Number(data.salary) }); overlay.remove(); toast('Employee updated'); loadEmployees(); } });
  }

  document.getElementById('addEmployeeBtn').addEventListener('click', () => {
    openModal({ title: 'Add Employee', fields: empFields(), submitLabel: 'Add Employee',
      onSubmit: async (data, overlay) => { await apiPost('/employees', { ...data, salary: Number(data.salary) }); overlay.remove(); toast('Employee added'); loadEmployees(); } });
  });

  document.getElementById('requestLeaveBtn').addEventListener('click', () => {
    openModal({
      title: 'Request Leave',
      fields: [
        { name: 'employee_id', label: 'Employee', type: 'select', required: true, options: employees.map(e => ({ value: e.id, label: e.name })) },
        { name: 'type', label: 'Leave Type', type: 'select', value: 'Annual', options: ['Annual', 'Sick', 'Unpaid', 'Compassionate'].map(t => ({ value: t, label: t })) },
        { name: 'start_date', label: 'Start Date', type: 'date', required: true, value: todayISO() },
        { name: 'end_date', label: 'End Date', type: 'date', required: true, value: todayISO() },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      submitLabel: 'Submit Request',
      onSubmit: async (data, overlay) => {
        await apiPost('/employees/leaves', data); overlay.remove(); toast('Leave request submitted');
        document.querySelector('[data-tab="leave"]').click();
      }
    });
  });

  loadEmployees();
}
