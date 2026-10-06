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
      <button data-t="loans">Loans Issued</button>
      <button data-t="loan-repayments">Loan Repayments</button>
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
    } else if (reportType === 'health') {
      const events = await apiGet('/health-events');
      const filtered = events.filter(e => e.date >= start && e.date <= end);
      body.innerHTML = `
        <div class="card"><h2>Health Events Summary</h2><table>
          <thead><tr><th>Date</th><th>Cow</th><th>Type</th><th>Vet</th><th>Cost</th><th>Status</th></tr></thead>
          <tbody>${filtered.length ? filtered.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${r.cow_tag}</td><td>${r.type}</td><td>${r.vet_name || '-'}</td><td>${r.cost ? fmtMoney(r.cost) : '-'}</td><td><span class="pill ${pillClass(r.status)}">${r.status}</span></td></tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No health events in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    } else if (reportType === 'loans') {
      const data = await apiGet(`/reports/loans/data?start=${start}&end=${end}`);
      body.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Total Issued</div><div class="value">${fmtMoney(data.total_issued)}</div></div>
          <div class="stat-card"><div class="label">Currently Outstanding</div><div class="value">${fmtMoney(data.total_outstanding)}</div></div>
          <div class="stat-card"><div class="label">Defaulters</div><div class="value ${data.defaulter_count ? 'neg' : ''}">${data.defaulter_count}</div></div>
        </div>
        <div class="card"><h2>Loans Issued This Period</h2><table>
          <thead><tr><th>Date</th><th>Type</th><th>Borrower</th><th>Term</th><th>Principal</th><th>Balance</th><th>Guarantor(s)</th><th>Status</th></tr></thead>
          <tbody>${data.rows.length ? data.rows.map(r => `<tr>
            <td>${fmtDate(r.date_issued)}</td><td>${r.borrower_type}</td><td>${r.borrower}</td><td>${r.term}</td>
            <td>${fmtMoney(r.principal)}</td><td>${fmtMoney(r.balance)}</td><td>${r.guarantors}</td>
            <td><span class="pill ${pillClass(r.status)}">${r.status}</span>${r.defaulter === 'Yes' ? ' <span class="pill red">Defaulter</span>' : ''}</td>
          </tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">No loans issued in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    } else if (reportType === 'loan-repayments') {
      const data = await apiGet(`/reports/loan-repayments/data?start=${start}&end=${end}`);
      body.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card"><div class="label">Total Repaid</div><div class="value">${fmtMoney(data.total_paid)}</div></div>
        </div>
        <div class="card"><h2>Loan Repayments This Period</h2><table>
          <thead><tr><th>Date</th><th>Type</th><th>Borrower</th><th>Term</th><th>Paid</th><th>Interest</th><th>Source</th></tr></thead>
          <tbody>${data.rows.length ? data.rows.map(r => `<tr>
            <td>${fmtDate(r.date)}</td><td>${r.borrower_type}</td><td>${r.borrower}</td><td>${r.term}</td>
            <td>${fmtMoney(r.amount_paid)}</td><td>${fmtMoney(r.interest_accrued)}</td><td>${r.source}</td>
          </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">No repayments in this range.</div></td></tr>`}</tbody>
        </table></div>`;
    }
  }

  document.querySelectorAll('#reportTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#reportTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); reportType = b.dataset.t; load();
  }));
  document.getElementById('startDate').addEventListener('change', load);
  document.getElementById('endDate').addEventListener('change', load);

  // Downloads go through fetch+blob (downloadWithAuth), not window.open()
  // — the latter is unreliable inside the Tauri webview (same issue as
  // WhatsApp/printing elsewhere in the app).
  document.getElementById('csvBtn').addEventListener('click', () => {
    const { start, end } = currentRange();
    downloadWithAuth(`${API_BASE}/reports/${reportType}/csv?start=${start}&end=${end}`, `${reportType}-${start}-to-${end}.csv`, 'CSV downloaded');
  });
  document.getElementById('pdfBtn').addEventListener('click', () => {
    const { start, end } = currentRange();
    downloadWithAuth(`${API_BASE}/reports/${reportType}/pdf?start=${start}&end=${end}`, `${reportType}-${start}-to-${end}.pdf`, 'PDF downloaded');
  });

  load();
}
