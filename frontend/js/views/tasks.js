async function renderTasks(view) {
  const employees = await apiGet('/employees');
  let status = 'Pending';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Task Board</h1><p class="subtitle">Manage daily operations and assignments.</p></div>
      <button class="primary" id="newTaskBtn">+ New Task</button>
    </div>
    <div class="tabs" id="statusTabs">
      <button data-s="Pending" class="active">Pending</button>
      <button data-s="In Progress">In Progress</button>
      <button data-s="Done">Done</button>
      <button data-s="All">All</button>
    </div>
    <div class="kanban" id="kanban"></div>
  `;

  async function load() {
    const params = status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    const tasks = await apiGet('/tasks' + params);
    const wrap = document.getElementById('kanban');
    wrap.innerHTML = tasks.length ? tasks.map(t => `
      <div class="task-card">
        <div class="badges">
          <span class="pill ${{ Low: 'gray', Medium: 'amber', High: 'amber', Urgent: 'red' }[t.priority]}">${t.priority}</span>
          ${t.overdue ? '<span class="pill red">Overdue</span>' : ''}
        </div>
        <h3>${t.title}</h3>
        <p>${t.description || ''}</p>
        <div class="meta-row">Due: ${fmtDate(t.due_date)} ${t.assignee_name ? '· ' + t.assignee_name : ''}</div>
        <div style="display:flex; gap:8px;">
          ${t.status !== 'Done' ? `<button class="small primary completeBtn" data-id="${t.id}" data-next="${t.status === 'Pending' ? 'In Progress' : 'Done'}">${t.status === 'Pending' ? '▶ Start' : '✓ Complete'}</button>` : `<span class="pill green">Done</span>`}
          <button class="small danger delBtn" data-id="${t.id}">🗑</button>
        </div>
      </div>
    `).join('') : `<div class="empty-state">No tasks in this view.</div>`;

    wrap.querySelectorAll('.completeBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/tasks/${b.dataset.id}/status`, { status: b.dataset.next }); toast('Task updated'); load();
    }));
    wrap.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      await apiDelete(`/tasks/${b.dataset.id}`); toast('Task deleted'); load();
    }));
  }

  document.querySelectorAll('#statusTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#statusTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); status = b.dataset.s; load();
  }));

  document.getElementById('newTaskBtn').addEventListener('click', () => {
    openModal({
      title: 'New Task',
      fields: [
        { name: 'title', label: 'Title', required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'priority', label: 'Priority', type: 'select', value: 'Medium', options: ['Low', 'Medium', 'High', 'Urgent'].map(p => ({ value: p, label: p })) },
        { name: 'due_date', label: 'Due Date', type: 'date', value: todayISO() },
        { name: 'assigned_to', label: 'Assign To', type: 'select', options: [{ value: '', label: '— Unassigned —' }, ...employees.map(e => ({ value: e.id, label: `${e.name} (${e.role})` }))] },
      ],
      submitLabel: 'Create Task',
      onSubmit: async (data, overlay) => {
        await apiPost('/tasks', { ...data, assigned_to: data.assigned_to || null });
        overlay.remove(); toast('Task created'); load();
      }
    });
  });

  load();
}
