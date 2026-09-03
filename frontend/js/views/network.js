async function renderNetwork(view) {
  let tab = 'farms';
  view.innerHTML = `
    <div class="page-header">
      <div>
        <div style="font-size:11px; color:#767a6f; font-weight:700; letter-spacing:.05em;">OPERATIONS HUB</div>
        <h1>Milk Network</h1>
        <p class="subtitle">One view for your 20–30 partner farms, daily collection, and invoicing.</p>
      </div>
    </div>
    <div class="tabs" id="netTabs">
      <button data-t="farms" class="active">Farms &amp; Locations</button>
      <button data-t="collection">Milk Collection</button>
      <button data-t="invoices">Farm Invoices</button>
    </div>
    <div id="netBody"></div>
  `;

  const farms = await apiGet('/farms');
  const partnerFarms = farms.filter(f => !f.is_home);

  async function renderFarmsTab() {
    const totalCows = farms.reduce((s, f) => s + f.cows, 0);
    const litersToday = farms.reduce((s, f) => s + f.liters_today, 0);
    document.getElementById('netBody').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Partner Farms</div><div class="value">${partnerFarms.length}</div></div>
        <div class="stat-card"><div class="label">Cows Across Network</div><div class="value">${totalCows}</div></div>
        <div class="stat-card"><div class="label">Collected Today</div><div class="value">${fmtLiters(litersToday)}</div></div>
        <div class="stat-card"><div class="label">Daily Target</div><div class="value">7,000 L</div></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Partner Farm Register</h2></div>
          <div id="farmCards" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px;"></div>
        </div>
        <div class="card">
          <h2>Add Partner Farm</h2>
          <form id="addFarmForm">
            <div class="form-row"><label>Farm Name *</label><input name="name" required placeholder="e.g. Green Valley Dairy"></div>
            <div class="form-row"><label>Location *</label><input name="location" required placeholder="Town, county or route"></div>
            <div class="form-grid">
              <div class="form-row"><label>Contact Name</label><input name="contact_name"></div>
              <div class="form-row"><label>Phone</label><input name="contact_phone" placeholder="+254..."></div>
            </div>
            <div class="form-row"><label>Notes</label><textarea name="notes" placeholder="Pickup or quality notes"></textarea></div>
            <button type="submit" class="primary" style="width:100%;">+ Add Farm Location</button>
          </form>
        </div>
      </div>`;

    document.getElementById('farmCards').innerHTML = partnerFarms.map(f => `
      <div class="card" style="padding:12px;">
        <div style="display:flex; justify-content:space-between;"><b>${f.name}</b><span class="pill ${pillClass(f.status)}">${f.status}</span></div>
        <div class="meta" style="color:#767a6f; font-size:12px; margin-bottom:8px;">📍 ${f.location}</div>
        <div style="display:flex; gap:8px; font-size:12px;">
          <div><b>${f.cows}</b><br>Cows</div>
          <div><b>${f.active_cows}</b><br>Active</div>
          <div><b>${fmtLiters(f.liters_today)}</b><br>Today</div>
        </div>
        <div style="font-size:12px; color:#767a6f; margin-top:8px;">${f.contact_name || ''} ${f.contact_phone ? '· ' + f.contact_phone : ''}</div>
      </div>`).join('') || `<div class="empty-state">No partner farms yet.</div>`;

    document.getElementById('addFarmForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await apiPost('/farms', { ...data, is_home: 0 });
      toast('Partner farm added'); renderNetwork(view);
    });
  }

  async function renderCollectionTab() {
    const tanks = await apiGet('/tanks');
    document.getElementById('netBody').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Log Collection</h2></div>
          <form id="collForm">
            <div class="form-row"><label>Farm</label><select name="farm_id">${partnerFarms.map(f => `<option value="${f.id}">${f.name} — ${f.location}</option>`).join('')}</select></div>
            <div class="form-grid">
              <div class="form-row"><label>Date</label><input type="date" name="date" value="${todayISO()}"></div>
              <div class="form-row"><label>Liters</label><input type="number" step="0.1" name="liters" required></div>
            </div>
            <div class="form-grid">
              <div class="form-row"><label>Rate / Liter</label><input type="number" step="0.01" name="rate_per_liter" value="60"></div>
              <div class="form-row"><label>Into Tank</label><select name="tank_id"><option value="">— None —</option>${tanks.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
            </div>
            <div class="form-row"><label>Notes</label><input name="notes"></div>
            <button type="submit" class="primary" style="width:100%;">Log Collection</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h2>Recent Collections</h2></div>
          <table><thead><tr><th>Farm</th><th>Date</th><th>Liters</th><th>Rate</th><th>Value</th></tr></thead>
          <tbody id="collRows"></tbody></table>
        </div>
      </div>`;

    async function loadCollections() {
      let all = [];
      for (const f of partnerFarms) {
        const c = await apiGet(`/farms/${f.id}/collections`);
        all.push(...c.map(x => ({ ...x, farm_name: f.name })));
      }
      all.sort((a, b) => (a.date < b.date ? 1 : -1));
      document.getElementById('collRows').innerHTML = all.slice(0, 30).map(c => `
        <tr><td>${c.farm_name}</td><td>${fmtDate(c.date)}</td><td>${fmtLiters(c.liters)}</td><td>${fmtMoney(c.rate_per_liter)}</td><td>${fmtMoney(c.liters * c.rate_per_liter)}</td></tr>
      `).join('') || `<tr><td colspan="5"><div class="empty-state">No collections logged yet.</div></td></tr>`;
    }

    document.getElementById('collForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await apiPost(`/farms/${data.farm_id}/collections`, { ...data, liters: Number(data.liters), rate_per_liter: Number(data.rate_per_liter) });
      toast('Collection logged'); e.target.reset(); loadCollections();
    });

    loadCollections();
  }

  async function renderInvoicesTab() {
    document.getElementById('netBody').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Generate Invoice</h2></div>
          <form id="invForm">
            <div class="form-row"><label>Farm</label><select name="farm_id">${partnerFarms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
            <div class="form-grid">
              <div class="form-row"><label>Period Start</label><input type="date" name="period_start" value="${daysAgoISO(30)}"></div>
              <div class="form-row"><label>Period End</label><input type="date" name="period_end" value="${todayISO()}"></div>
            </div>
            <div class="form-row"><label>Rate Override (optional — leave blank to use average collection rate)</label><input type="number" step="0.01" name="rate_per_liter"></div>
            <button type="submit" class="primary" style="width:100%;">Generate Invoice</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h2>Invoices</h2></div>
          <table><thead><tr><th>Farm</th><th>Period</th><th>Liters</th><th>Total</th><th>Status</th><th></th></tr></thead>
          <tbody id="invRows"></tbody></table>
        </div>
      </div>`;

    async function loadInvoices() {
      const invoices = await apiGet('/invoices');
      document.getElementById('invRows').innerHTML = invoices.length ? invoices.map(i => `
        <tr>
          <td>${i.farm_name}</td><td>${fmtDate(i.period_start)} – ${fmtDate(i.period_end)}</td>
          <td>${fmtLiters(i.total_liters)}</td><td><b>${fmtMoney(i.total_amount)}</b></td>
          <td><span class="pill ${pillClass(i.status)}">${i.status}</span></td>
          <td>${i.status === 'Unpaid' ? `<button class="small primary payBtn" data-id="${i.id}">Mark Paid</button>` : ''}</td>
        </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No invoices generated yet.</div></td></tr>`;
      document.querySelectorAll('.payBtn').forEach(b => b.addEventListener('click', async () => {
        await apiPut(`/invoices/${b.dataset.id}/status`, { status: 'Paid' }); toast('Invoice marked paid'); loadInvoices();
      }));
    }

    document.getElementById('invForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        await apiPost('/invoices/generate', {
          farm_id: Number(data.farm_id), period_start: data.period_start, period_end: data.period_end,
          rate_per_liter: data.rate_per_liter ? Number(data.rate_per_liter) : undefined
        });
        toast('Invoice generated'); loadInvoices();
      } catch (err) { toast(err.message, true); }
    });

    loadInvoices();
  }

  const tabs = { farms: renderFarmsTab, collection: renderCollectionTab, invoices: renderInvoicesTab };
  document.querySelectorAll('#netTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#netTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); tabs[b.dataset.t]();
  }));

  renderFarmsTab();
}
