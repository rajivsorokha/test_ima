async function renderQuality(view) {
  const farms = await apiGet('/farms');
  const thresholds = await apiGet('/quality-tests/thresholds').catch(() => null);
  let farmFilter = '';
  let labelFilter = 'All';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Milk Quality Tests</h1><p class="subtitle">Lactometer &amp; thermometer readings per member, per shift.</p></div>
      <button class="primary" id="logTestBtn">+ Log Test</button>
    </div>
    ${thresholds ? `<p class="desc" style="margin-bottom:10px;">
      Quality Score = Lactometer + (Thermometer − 20) / 1.5 &nbsp;·&nbsp;
      <span class="pill red">${thresholds.low_label}</span> below ${thresholds.low_max} &nbsp;
      <span class="pill amber">${thresholds.warning_label}</span> ${thresholds.low_max}–${thresholds.warning_max} &nbsp;
      <span class="pill green">${thresholds.good_label}</span> ${thresholds.warning_max}+
    </p>` : ''}
    <div class="toolbar">
      <select id="farmFilter"><option value="">All Members</option>${farms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select>
      <select id="labelFilter"><option>All</option><option>Low Quality</option><option>Warning</option><option>Good</option></select>
    </div>
    <div class="card"><table>
      <thead><tr><th>Date</th><th>Shift</th><th>Member</th><th>Lactometer</th><th>Thermometer</th><th>Quality Score</th><th>Grade</th><th>Adulteration</th><th>Tested By</th><th></th></tr></thead>
      <tbody id="testRows"></tbody>
    </table></div>
  `;

  function gradePill(label) {
    if (!label) return '-';
    const cls = label === thresholds?.good_label ? 'green' : label === thresholds?.warning_label ? 'amber' : 'red';
    return `<span class="pill ${cls}">${label}</span>`;
  }

  async function load() {
    const params = new URLSearchParams();
    if (farmFilter) params.set('farm_id', farmFilter);
    const tests = await apiGet('/quality-tests?' + params.toString());
    const filtered = labelFilter === 'All' ? tests : tests.filter(t => t.quality_label === labelFilter);
    const rows = document.getElementById('testRows');
    rows.innerHTML = filtered.length ? filtered.map(t => `
      <tr>
        <td>${fmtDate(t.date)}</td><td>${t.session === 'PM' ? 'Evening' : 'Morning'}</td><td>${t.farm_name}</td>
        <td>${t.lactometer_reading ?? '-'}</td><td>${t.thermometer_reading ?? '-'}</td>
        <td>${t.quality_score !== null ? t.quality_score.toFixed(2) : '-'}</td>
        <td>${gradePill(t.quality_label)}</td>
        <td><span class="pill ${t.adulteration_result === 'Pass' ? 'green' : 'red'}">${t.adulteration_result}</span></td>
        <td>${t.tested_by || '-'}</td>
        <td><button class="small danger delBtn" data-id="${t.id}">Delete</button></td>
      </tr>`).join('') : `<tr><td colspan="10"><div class="empty-state">No quality tests logged yet.</div></td></tr>`;
    rows.querySelectorAll('.delBtn').forEach(b => b.addEventListener('click', async () => {
      await apiDelete(`/quality-tests/${b.dataset.id}`); toast('Test deleted'); load();
    }));
  }

  document.getElementById('farmFilter').addEventListener('change', (e) => { farmFilter = e.target.value; load(); });
  document.getElementById('labelFilter').addEventListener('change', (e) => { labelFilter = e.target.value; load(); });

  document.getElementById('logTestBtn').addEventListener('click', () => {
    const overlay = openModal({
      title: 'Log Milk Quality Test',
      fields: [
        { name: 'farm_id', label: 'Member / Farm', type: 'select', required: true, options: farms.map(f => ({ value: f.id, label: f.name })) },
        { name: 'date', label: 'Date', type: 'date', value: todayISO(), required: true },
        { name: 'session', label: 'Shift', type: 'select', value: 'AM', options: [{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }] },
        { name: 'lactometer_reading', label: 'Lactometer Reading', type: 'number', step: '0.01', id: 'qLacto' },
        { name: 'thermometer_reading', label: 'Thermometer Reading', type: 'number', step: '0.01', id: 'qTherm' },
        { name: 'adulteration_result', label: 'Adulteration Result', type: 'select', value: 'Pass', options: [{ value: 'Pass', label: 'Pass' }, { value: 'Fail', label: 'Fail' }] },
        { name: 'tested_by', label: 'Tested By' },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ],
      extraHtml: `<div id="qualityPreview" class="rate-preview">Enter both readings to see the computed quality score.</div>`,
      submitLabel: 'Log Test',
      onSubmit: async (data, ov) => {
        await apiPost('/quality-tests', {
          ...data,
          lactometer_reading: data.lactometer_reading ? Number(data.lactometer_reading) : null,
          thermometer_reading: data.thermometer_reading ? Number(data.thermometer_reading) : null,
        });
        ov.remove(); toast('Quality test logged'); load();
      }
    });
    function updatePreview() {
      const lacto = Number(overlay.querySelector('[name="lactometer_reading"]').value || '');
      const therm = Number(overlay.querySelector('[name="thermometer_reading"]').value || '');
      const preview = overlay.querySelector('#qualityPreview');
      if (!lacto || !therm) { preview.textContent = 'Enter both readings to see the computed quality score.'; return; }
      const score = Math.round((lacto + (therm - 20) / 1.5) * 100) / 100;
      const label = !thresholds ? '' : (score < thresholds.low_max ? thresholds.low_label : score < thresholds.warning_max ? thresholds.warning_label : thresholds.good_label);
      preview.innerHTML = `Quality Score: <b>${score}</b> — ${gradePill(label)}`;
    }
    overlay.querySelector('[name="lactometer_reading"]').addEventListener('input', updatePreview);
    overlay.querySelector('[name="thermometer_reading"]').addEventListener('input', updatePreview);
  });

  load();
}
