async function renderTanks(view) {
  view.innerHTML = `
    <div class="page-header">
      <div><h1>Inventory Tanks</h1><p class="subtitle">Cooling tanks and chillers holding collected &amp; own milk.</p></div>
      <button class="primary" id="addTankBtn">+ Add Tank</button>
    </div>
    <div class="grid-2b" id="tankCards"></div>
  `;

  async function load() {
    const tanks = await apiGet('/tanks');
    const wrap = document.getElementById('tankCards');
    wrap.innerHTML = tanks.length ? tanks.map(t => {
      const pct = t.capacity_liters ? Math.min(100, Math.round((t.current_liters / t.capacity_liters) * 100)) : 0;
      return `
      <div class="card">
        <div class="card-head">
          <h2>${t.name}</h2>
          <span class="pill ${pillClass(t.status)}">${t.status}</span>
        </div>
        <div class="meta" style="color:#767a6f; font-size:12.5px; margin-bottom:10px;">📍 ${t.location || 'Unspecified'}</div>
        <div style="background:#efece2; border-radius:8px; height:10px; overflow:hidden; margin-bottom:6px;">
          <div style="background:#2d5233; height:100%; width:${pct}%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#767a6f; margin-bottom:14px;">
          <span>${fmtLiters(t.current_liters)} / ${fmtLiters(t.capacity_liters)}</span><span>${pct}%</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="small fillBtn" data-id="${t.id}">+ Fill</button>
          <button class="small drawBtn" data-id="${t.id}">− Draw Off</button>
          <button class="small editBtn" data-id="${t.id}">Edit</button>
        </div>
      </div>`;
    }).join('') : `<div class="empty-state">No tanks yet.</div>`;

    wrap.querySelectorAll('.fillBtn').forEach(b => b.addEventListener('click', () => adjustTank(Number(b.dataset.id), 1)));
    wrap.querySelectorAll('.drawBtn').forEach(b => b.addEventListener('click', () => adjustTank(Number(b.dataset.id), -1)));
    wrap.querySelectorAll('.editBtn').forEach(b => b.addEventListener('click', () => editTank(tanks.find(t => t.id === Number(b.dataset.id)))));
  }

  function adjustTank(id, sign) {
    openModal({
      title: sign > 0 ? 'Fill Tank' : 'Draw Off from Tank',
      fields: [
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'amount', label: 'Liters', type: 'number', step: '0.1', required: true },
        { name: 'reason', label: 'Reason', type: 'select', value: sign > 0 ? 'Collection' : 'Sale',
          options: ['Collection', 'Sale', 'Transfer', 'Spoilage', 'Adjustment'].map(r => ({ value: r, label: r })) },
        { name: 'notes', label: 'Notes' },
      ],
      submitLabel: sign > 0 ? 'Add to Tank' : 'Draw Off',
      onSubmit: async (data, overlay) => {
        await apiPost(`/tanks/${id}/adjust`, { date: data.date, change_liters: sign * Number(data.amount), reason: data.reason, notes: data.notes });
        overlay.remove(); toast('Tank updated'); load();
      }
    });
  }

  function editTank(t) {
    openModal({
      title: 'Edit Tank',
      fields: [
        { name: 'name', label: 'Name', required: true, value: t.name },
        { name: 'location', label: 'Location', value: t.location },
        { name: 'capacity_liters', label: 'Capacity (Liters)', type: 'number', step: '1', value: t.capacity_liters },
        { name: 'status', label: 'Status', type: 'select', value: t.status, options: ['Active', 'Maintenance', 'Idle'].map(s => ({ value: s, label: s })) },
        { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes },
      ],
      submitLabel: 'Save Changes',
      onSubmit: async (data, overlay) => {
        await apiPut(`/tanks/${t.id}`, { ...data, capacity_liters: Number(data.capacity_liters) });
        overlay.remove(); toast('Tank updated'); load();
      }
    });
  }

  document.getElementById('addTankBtn').addEventListener('click', () => {
    openModal({
      title: 'Add Tank',
      fields: [
        { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Cooling Tank C' },
        { name: 'location', label: 'Location' },
        { name: 'capacity_liters', label: 'Capacity (Liters)', type: 'number', step: '1', value: 1000, required: true },
        { name: 'current_liters', label: 'Starting Level (Liters)', type: 'number', step: '1', value: 0 },
      ],
      submitLabel: 'Add Tank',
      onSubmit: async (data, overlay) => {
        await apiPost('/tanks', { ...data, capacity_liters: Number(data.capacity_liters), current_liters: Number(data.current_liters) });
        overlay.remove(); toast('Tank added'); load();
      }
    });
  });

  load();
}
