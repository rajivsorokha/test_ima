async function renderReports(view) {
  let reportType = 'milk';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Farm Reports</h1><p class="subtitle">Generate and export operations data.</p></div>
      <div style="display:flex; gap:8px;">
        <button id="csvBtn">⬇ Export CSV</button>
        <button class="primary" id="pdfBtn">🖨 Print PDF</button>
      </div>
    </div>

    <div class="tabs" id="reportTabs">
      <button data-t="milk" class="active">Milk Production</button>
      <button data-t="finance">Financial</button>
      <button data-t="health">Health Events</button>
    </div>
    <div class="toolbar">
      <label>Start Date <input type="date" id="startDate" value="${daysAgoISO(30)}" /></label>
      <label>End Date <input type="date" id="endDate" value="${todayISO()}" /></label>
    </div>

    <div id="reportBody"></div>
  `;

  function currentRange() {
    return { start: document.getElementById('startDate').value, end: document.getElementById('endDate').value };
  }

  async function load() {
    const { start, end } = currentRange();
    const body = document.getElementById('reportBody');
    if (reportType === 'milk') {
      const data = await apiGet(`/reports/milk/data?start=${start}&end=${end}`);
      body.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Total Yield</div><div class="value">${fmtLiters(data.total_liters)}</div></div>
          <div class="stat-card"><div class="label">Daily Average</div><div class="value">${fmtLiters(data.daily_average)}/day</div></div>
        </div>
        <div class="card"><h2>Production Logs</h2><table>
          <thead><tr><th>Date</th><th>Session</th><th>Farm</th><th>Cow</th><th>Liters</th></tr></thead>
          <tbody>${data.rows.length ? data.rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${r.session}</td><td>${r.farm}</td><td>${r.cow}</td><td>${fmtLiters(r.liters)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No records in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    } else if (reportType === 'finance') {
      const data = await apiGet(`/finance?start=${start}&end=${end}`);
      body.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Total Income</div><div class="value">${fmtMoney(data.total_income)}</div></div>
          <div class="stat-card"><div class="label">Total Expenses</div><div class="value">${fmtMoney(data.total_expense)}</div></div>
          <div class="stat-card"><div class="label">Net Balance</div><div class="value ${data.running_balance < 0 ? 'neg' : ''}">${fmtMoney(data.running_balance)}</div></div>
        </div>
        <div class="card"><h2>Transactions</h2><table>
          <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
          <tbody>${data.data.length ? data.data.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${r.type}</td><td>${r.category}</td><td>${r.description || ''}</td><td class="amount ${r.type === 'Income' ? 'pos' : 'neg'}">${r.type === 'Income' ? '+' : '-'}${fmtMoney(r.amount)}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No transactions in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    } else {
      const events = await apiGet('/health-events');
      const filtered = events.filter(e => e.date >= start && e.date <= end);
      body.innerHTML = `
        <div class="card"><h2>Health Events Summary</h2><table>
          <thead><tr><th>Date</th><th>Cow</th><th>Type</th><th>Vet</th><th>Cost</th><th>Status</th></tr></thead>
          <tbody>${filtered.length ? filtered.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${r.cow_tag}</td><td>${r.type}</td><td>${r.vet_name || '-'}</td><td>${r.cost ? fmtMoney(r.cost) : '-'}</td><td><span class="pill ${pillClass(r.status)}">${r.status}</span></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No health events in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    }
  }

  document.querySelectorAll('#reportTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#reportTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); reportType = b.dataset.t; load();
  }));
  document.getElementById('startDate').addEventListener('change', load);
  document.getElementById('endDate').addEventListener('change', load);

  document.getElementById('csvBtn').addEventListener('click', () => {
    const { start, end } = currentRange();
    window.open(`${API_BASE}/reports/${reportType}/csv?start=${start}&end=${end}`, '_blank');
  });
  document.getElementById('pdfBtn').addEventListener('click', () => {
    const { start, end } = currentRange();
    window.open(`${API_BASE}/reports/${reportType}/pdf?start=${start}&end=${end}`, '_blank');
  });

  load();
}
