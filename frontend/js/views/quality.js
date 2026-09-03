async function renderQuality(view) {
  const farms = await apiGet('/farms');
  let farmFilter = '';
  let resultFilter = 'All';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Milk Quality Tests</h1><p class="subtitle">Fat %, SNF %, density, and adulteration checks per farm/location.</p></div>
      <button class="primary" id="logTestBtn">+ Log Test</button>
    </div>
    <div class="toolbar">
      <select id="farmFilter"><option value="">All Locations</option>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>
      <select id="resultFilter"><option>All</option><option>Pass</option><option>Fail</option></select>
    </div>
    <div class="card"><table>
      <thead><tr><th>Date</th><th>Farm</th><th>Fat %</th><th>SNF %</th><th>Density</th><th>Temp °C</th><th>Result</th><th>Tested By</th><th></th></tr></thead>
      <tbody id="testRows"></tbody>
    </table></div>
  `;

  async function load() {
    const params = new URLSearchParams();
    if (farmFilter) params.set('farm_id', farmFilter);
    if (resultFilter !== 'All') params.set('result', resultFilter);
    const tests = await apiGet('/quality-tests?' + params.toString());
    const rows = document.getElementById('testRows');
    rows.innerHTML = tests.length ? tests.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td><td>${t.farm_name}</td>
        <td>${t.fat_percent ?? '-'}</td><td>${t.snf_percent ?? '-'}</td>
        <td>${t.density ?? '-'}</td><td>${t.temperature_c ?? '-'}</td>
        <td><span class="pill ${t.adulteration_result === 'Pass' ? 'green' : 'red'}">${t.adulteration_result}</span></td>
        <td>${t.tested_by || '-'}</td>
        <td><button class="small danger delBtn" data-id="${t.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="9"><div class="empty-state">No quality tests logged yet.</div></td></tr>`;
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      await apiDelete(`/quality-tests/${b.dataset.id}`); toast('Test deleted'); load();
    }));
  }

  document.getElementById('farmFilter').addEventListener('change', (e) => { farmFilter = e.target.value; load(); });
  document.getElementById('resultFilter').addEventListener('change', (e) => { resultFilter = e.target.value; load(); });

  document.getElementById('logTestBtn').addEventListener('click', () => {
    openModal({
      title: 'Log Milk Quality Test',
      fields: [
        { name: 'farm_id', label: 'Farm / Location', type: 'select', required: true, options: farms.map(f => ({ value: f.id, label: f.name })) },
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'fat_percent', label: 'Fat %', type: 'number', step: '0.1' },
        { name: 'snf_percent', label: 'SNF %', type: 'number', step: '0.1' },
        { name: 'density', label: 'Density (g/mL)', type: 'number', step: '0.0001' },
        { name: 'temperature_c', label: 'Temperature (°C)', type: 'number', step: '0.1' },
        { name: 'adulteration_result', label: 'Result', type: 'select', value: 'Pass', options: [{ value: 'Pass', label: 'Pass' }, { value: 'Fail', label: 'Fail' }] },
        { name: 'tested_by', label: 'Tested By' },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ],
      submitLabel: 'Log Test',
      onSubmit: async (data, overlay) => {
        await apiPost('/quality-tests', {
          ...data,
          fat_percent: data.fat_percent ? Number(data.fat_percent) : null,
          snf_percent: data.snf_percent ? Number(data.snf_percent) : null,
          density: data.density ? Number(data.density) : null,
          temperature_c: data.temperature_c ? Number(data.temperature_c) : null,
        });
        overlay.remove(); toast('Quality test logged'); load();
      }
    });
  });

  load();
}
