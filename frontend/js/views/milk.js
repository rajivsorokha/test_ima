async function renderMilk(view) {
  const [farms, todayData] = await Promise.all([apiGet('/farms'), apiGet('/milk/today')]);
  const homeFarm = farms.find(f => f.is_home) || farms[0];

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Milk Recording</h1><p class="subtitle">Log AM/PM sessions and track yield for the home farm.</p></div>
      <button class="primary" id="logMilkBtn">🥛 Log Milk</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Today's Total</div><div class="value">${fmtLiters(todayData.total)}</div></div>
      <div class="stat-card"><div class="label">AM Session</div><div class="value">${fmtLiters(todayData.am)}</div></div>
      <div class="stat-card"><div class="label">PM Session</div><div class="value">${fmtLiters(todayData.pm)}</div></div>
    </div>
    <div class="card">
      <div class="card-head">
        <h2>Milk History</h2>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="date" id="startDate" value="${daysAgoISO(14)}" />
          <span>to</span>
          <input type="date" id="endDate" value="${todayISO()}" />
        </div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Session</th><th>Cow</th><th>Liters</th><th>Notes</th><th></th></tr></thead>
        <tbody id="milkRows"></tbody>
      </table>
    </div>
  `;

  async function load() {
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const res = await apiGet(`/milk?start=${start}&end=${end}&limit=100`);
    const rows = document.getElementById('milkRows');
    rows.innerHTML = res.data.length ? res.data.map(m => `
      <tr>
        <td>${fmtDate(m.date)}</td><td>${m.session}</td><td>${m.cow_tag || 'General Herd'}</td>
        <td>${fmtLiters(m.liters)}</td><td>${m.notes || ''}</td>
        <td><button class="small danger delBtn" data-id="${m.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No milk records in this range.</div></td></tr>`;
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      await apiDelete(`/milk/${b.dataset.id}`); toast('Record deleted'); load(); refreshStats();
    }));
  }

  async function refreshStats() {
    const t = await apiGet('/milk/today');
    document.querySelector('.stat-grid .stat-card:nth-child(1) .value').textContent = fmtLiters(t.total);
    document.querySelector('.stat-grid .stat-card:nth-child(2) .value').textContent = fmtLiters(t.am);
    document.querySelector('.stat-grid .stat-card:nth-child(3) .value').textContent = fmtLiters(t.pm);
  }

  document.getElementById('startDate').addEventListener('change', load);
  document.getElementById('endDate').addEventListener('change', load);

  document.getElementById('logMilkBtn').addEventListener('click', async () => {
    const cows = await apiGet(`/cows?farm_id=${homeFarm.id}`);
    openModal({
      title: 'Log Milk',
      fields: [
        { name: 'farm_id', label: 'Farm', type: 'select', value: homeFarm.id, options: farms.map(f => ({ value: f.id, label: f.name })) },
        { name: 'cow_id', label: 'Cow (optional — leave blank for general herd)', type: 'select',
          options: [{ value: '', label: '— General Herd —' }, ...cows.map(c => ({ value: c.id, label: `${c.tag} ${c.name ? '(' + c.name + ')' : ''}` }))] },
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'session', label: 'Session', type: 'select', value: 'AM', options: [{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }] },
        { name: 'liters', label: 'Liters', type: 'number', step: '0.1', required: true },
        { name: 'notes', label: 'Notes', type: 'textarea' },
      ],
      submitLabel: 'Save',
      onSubmit: async (data, overlay) => {
        await apiPost('/milk', { ...data, cow_id: data.cow_id || null, liters: Number(data.liters) });
        overlay.remove(); toast('Milk logged'); load(); refreshStats();
      }
    });
  });

  load();
}
