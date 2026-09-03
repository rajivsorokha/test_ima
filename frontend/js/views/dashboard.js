async function renderDashboard(view) {
  const d = await apiGet('/dashboard');
  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Overview</h1>
        <p class="subtitle">Welcome back. Here's what's happening across Ima Langnubi Dairy today.</p>
      </div>
      <div style="display:flex; gap:10px;">
        <button id="logMilkBtn">🥛 Log Milk</button>
        <button class="primary" id="newSaleBtn">🧾 New Sale</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">Active Cows <span class="stat-icon">🐄</span></div>
        <div class="value">${d.active_cows}</div>
      </div>
      <div class="stat-card">
        <div class="label">Today's Yield (Home Farm) <span class="stat-icon">💧</span></div>
        <div class="value">${fmtLiters(d.todays_yield)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Running Balance <span class="stat-icon">₹</span></div>
        <div class="value ${d.running_balance < 0 ? 'neg' : ''}">${fmtMoney(d.running_balance)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Overdue Tasks <span class="stat-icon">📋</span></div>
        <div class="value warn">${d.overdue_tasks}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>7-Day Milk Production (Home + Network)</h2></div>
        <div class="chart-wrap" id="trendChart"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Tasks</h2><a href="#tasks" class="link">View All</a></div>
        <div id="taskList"></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-head"><h2>Recent Transactions</h2><a href="#finance" class="link">View All</a></div>
        <div id="txList"></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Recent Health Events</h2><a href="#health" class="link">View All</a></div>
        <div id="healthList"></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-head"><h2>Milk Network</h2><a href="#network" class="link">Open Milk Network</a></div>
      <div class="stat-grid" style="margin-bottom:0;">
        <div class="stat-card"><div class="label">Partner Farms</div><div class="value">${d.network?.partner_farms ?? '—'}</div></div>
        <div class="stat-card"><div class="label">Cows Across Network</div><div class="value">${d.network?.cows_across_network ?? '—'}</div></div>
        <div class="stat-card"><div class="label">Collected (30 days)</div><div class="value">${d.network ? fmtLiters(d.network.collected_in_period) : '—'}</div></div>
        <div class="stat-card"><div class="label">Daily Target</div><div class="value">${d.network ? fmtLiters(d.network.daily_target) : '—'}</div></div>
      </div>
    </div>
  `;

  document.getElementById('logMilkBtn').addEventListener('click', () => { window.location.hash = '#milk'; });
  document.getElementById('newSaleBtn').addEventListener('click', () => { window.location.hash = '#milkpos'; });

  const taskList = document.getElementById('taskList');
  taskList.innerHTML = d.tasks.length ? d.tasks.map(t => `
    <div class="list-item">
      <div><span class="dot"></span><span class="title">${t.title}</span>
        <div class="meta" style="margin-left:15px;">Due: ${fmtDate(t.due_date)}</div>
      </div>
      ${t.overdue ? '<span class="pill red">Overdue</span>' : ''}
    </div>`).join('') : `<div class="empty-state">No pending tasks 🎉</div>`;

  const txList = document.getElementById('txList');
  txList.innerHTML = d.recent_transactions.length ? d.recent_transactions.map(t => `
    <div class="list-item">
      <div class="tx-row">
        <span class="tx-icon ${t.type === 'Income' ? 'pos' : 'neg'}">${t.type === 'Income' ? '↗' : '↘'}</span>
        <div><div class="title">${t.category}</div><div class="meta">${fmtDate(t.date)}</div></div>
      </div>
      <span class="amount ${t.type === 'Income' ? 'pos' : 'neg'}">${t.type === 'Income' ? '+' : '-'}${fmtMoney(Math.abs(t.amount))}</span>
    </div>`).join('') : `<div class="empty-state">No transactions yet</div>`;

  const healthList = document.getElementById('healthList');
  healthList.innerHTML = d.recent_health_events.length ? d.recent_health_events.map(h => `
    <div class="list-item">
      <div><div class="title">${h.cow_tag} · ${h.type}</div><div class="meta">${fmtDate(h.date)}</div></div>
      <span class="pill ${pillClass(h.status)}">${h.status}</span>
    </div>`).join('') : `<div class="empty-state">No health events yet</div>`;

  const ctx = document.getElementById('trendChart');
  drawLineChart(ctx, d.trend.map(t => ({
    label: new Date(t.date).toLocaleDateString('en-US', { weekday: 'short' }),
    value: t.liters
  })), { valueFormatter: (v) => Math.round(v) });
}
