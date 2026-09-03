const HEALTH_TYPES = ['Vaccination', 'Treatment', 'Deworming', 'Checkup', 'Surgery', 'Calving', 'Insemination'];

async function renderHealth(view) {
  const cows = await apiGet('/cows');
  let status = 'All';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Health Events</h1><p class="subtitle">Manage vaccinations, illnesses, and vet visits across the herd.</p></div>
      <button class="primary" id="logEventBtn">+ Log Event</button>
    </div>
    <div class="tabs" id="statusTabs">
      <button data-s="All" class="active">All</button>
      <button data-s="Open">Open</button>
      <button data-s="In Progress">In Progress</button>
      <button data-s="Resolved">Resolved</button>
    </div>
    <div class="card"><table>
      <thead><tr><th>Date</th><th>Cow</th><th>Type</th><th>Description</th><th>Vet</th><th>Cost</th><th>Status</th><th></th></tr></thead>
      <tbody id="healthRows"></tbody>
    </table></div>
  `;

  async function load() {
    const params = status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
    const events = await apiGet('/health-events' + params);
    const rows = document.getElementById('healthRows');
    rows.innerHTML = events.length ? events.map(h => `
      <tr>
        <td>${fmtDate(h.date)}</td><td>${h.cow_tag}</td><td>${h.type}</td><td>${h.description || '-'}</td>
        <td>${h.vet_name || '-'}</td><td>${h.cost ? fmtMoney(h.cost) : '-'}</td>
        <td><span class="pill ${pillClass(h.status)}">${h.status}</span></td>
        <td>
          ${h.status !== 'Resolved' ? `<button class="small nextBtn" data-id="${h.id}" data-next="${h.status === 'Open' ? 'In Progress' : 'Resolved'}">${h.status === 'Open' ? 'Start' : 'Resolve'}</button>` : `<button class="small reopenBtn" data-id="${h.id}">Reopen</button>`}
          <button class="small danger delBtn" data-id="${h.id}">Delete</button>
        </td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">No health events found.</div></td></tr>`;

    rows.querySelectorAll('.nextBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/health-events/${b.dataset.id}/status`, { status: b.dataset.next }); toast('Status updated'); load();
    }));
    rows.querySelectorAll('.reopenBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/health-events/${b.dataset.id}/status`, { status: 'Open' }); toast('Reopened'); load();
    }));
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      await apiDelete(`/health-events/${b.dataset.id}`); toast('Deleted'); load();
    }));
  }

  document.querySelectorAll('#statusTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#statusTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); status = b.dataset.s; load();
  }));

  document.getElementById('logEventBtn').addEventListener('click', () => {
    openModal({
      title: 'Log Health Event',
      fields: [
        { name: 'cow_id', label: 'Cow', type: 'select', required: true, options: cows.map(c => ({ value: c.id, label: `${c.tag} ${c.name ? '(' + c.name + ')' : ''}` })) },
        { name: 'type', label: 'Event Type', type: 'select', value: 'Checkup', options: HEALTH_TYPES.map(t => ({ value: t, label: t })) },
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'vet_name', label: 'Vet Name' },
        { name: 'cost', label: 'Cost', type: 'number', step: '0.01', value: 0 },
        { name: 'follow_up_date', label: 'Follow-up Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', value: 'Open', options: ['Open', 'In Progress', 'Resolved'].map(s => ({ value: s, label: s })) },
      ],
      submitLabel: 'Log Event',
      onSubmit: async (data, overlay) => {
        await apiPost('/health-events', { ...data, cost: Number(data.cost || 0) });
        overlay.remove(); toast('Health event logged'); load();
      }
    });
  });

  load();
}
