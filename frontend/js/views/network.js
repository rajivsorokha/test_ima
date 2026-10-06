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
  const rules = await apiGet('/farms/delivery-rules').catch(() => null);

  function seasonForClient(dateStr) {
    const month = Number((dateStr || todayISO()).slice(5, 7));
    return (month >= 4 && month <= 9) ? 'summer' : 'winter';
  }
  function tierForClient(season, session, time) {
    if (!time || !rules) return 0;
    const c = rules.seasons[season].cutoffs[session === 'PM' ? 'PM' : 'AM'];
    if (time <= c.normal) return 0;
    if (time <= c.late1) return 1;
    if (time <= c.late2) return 2;
    return 3;
  }
  function computeRatePreview(band, liters, session, time, date) {
    if (!rules) return { tier: 0, rate: 0, label: 'Rate table unavailable' };
    const season = seasonForClient(date);
    const tier = tierForClient(season, session, time);
    const qtyBand = liters >= 20 ? 'over20' : 'under20';
    const rate = rules.rate_table[band][qtyBand][tier];
    return { tier, rate, label: rules.tier_labels[tier] };
  }

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
              <div class="form-row"><label>Phone</label><input name="contact_phone" placeholder="+91..."></div>
            </div>
            <div class="form-row"><label>Distance from Collection Point</label>
              <select name="distance_band">
                <option value="within_10km">Within 10 km</option>
                <option value="10km_plus">10 km &amp; above</option>
              </select>
            </div>
            <div class="form-row"><label>Share Deposit (₹)</label><input type="number" step="0.01" name="share_deposit" value="0" placeholder="Cooperative share capital held"></div>
            <div class="form-row"><label>Feed/Medicine Deposit (₹)</label><input type="number" step="0.01" name="feed_medicine_deposit" value="0" placeholder="Deposit to enable feed/medicine purchases"></div>
            <div class="form-row"><label>Notes</label><textarea name="notes" placeholder="Pickup or quality notes"></textarea></div>
            <p class="desc">New members start as <b>Pending</b> — approve them from their card once ready, to make them eligible for a Loan/Borrow.</p>
            <button type="submit" class="primary" style="width:100%;">+ Add Farm Location</button>
          </form>
        </div>
      </div>`;

    document.getElementById('farmCards').innerHTML = partnerFarms.map(f => `
      <div class="card" style="padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <b>${f.name}</b>
          <div style="display:flex; gap:4px;"><span class="pill ${pillClass(f.status)}">${f.status}</span><span class="pill ${f.membership_status === 'Approved' ? 'green' : 'amber'}">${f.membership_status || 'Pending'}</span></div>
        </div>
        <div class="meta" style="color:#767a6f; font-size:12px; margin-bottom:8px;">📍 ${f.location}</div>
        <div style="display:flex; gap:8px; font-size:12px;">
          <div><b>${f.cows}</b><br>Cows</div>
          <div><b>${f.active_cows}</b><br>Active</div>
          <div><b>${fmtLiters(f.liters_today)}</b><br>Today</div>
        </div>
        <div style="font-size:12px; color:#767a6f; margin-top:8px;">${f.contact_name || ''} ${f.contact_phone ? '· ' + f.contact_phone : ''}</div>
        <div style="font-size:11px; color:#767a6f;">📏 ${f.distance_band === '10km_plus' ? '10 km & above' : 'Within 10 km'} · 💳 Share: ${fmtMoney(f.share_deposit || 0)}</div>
        <div style="font-size:11px; color:#767a6f;">🌾 Feed/Medicine Deposit: ${fmtMoney(f.feed_medicine_deposit || 0)}</div>
        ${f.membership_status === 'Approved' ? `<div style="font-size:10.5px; color:#767a6f;">Approved ${f.approved_at ? fmtDate(f.approved_at) : ''}${f.approved_by ? ' by ' + f.approved_by : ''}</div>` : ''}
        <div style="display:flex; gap:6px; margin-top:10px;">
          <button type="button" class="small editFarmBtn" data-id="${f.id}" style="flex:1;">✎ Edit</button>
          ${f.membership_status === 'Approved'
            ? `<button type="button" class="small revokeApprovalBtn" data-id="${f.id}" style="flex:1;">Revoke Approval</button>`
            : `<button type="button" class="small primary approveFarmBtn" data-id="${f.id}" style="flex:1;">✓ Approve Member</button>`}
        </div>
      </div>`).join('') || `<div class="empty-state">No partner farms yet.</div>`;

    document.getElementById('addFarmForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await apiPost('/farms', { ...data, is_home: 0 });
      toast('Partner farm added — Pending approval until approved'); renderNetwork(view);
    });

    document.querySelectorAll('.approveFarmBtn').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Approve this member? They will then be eligible for a Share Deposit and Loans/Borrows.')) return;
      await apiPost(`/farms/${b.dataset.id}/approve`, {});
      toast('Member approved'); renderNetwork(view);
    }));
    document.querySelectorAll('.revokeApprovalBtn').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Revoke this member\'s approval? They will no longer be eligible for new Loans/Borrows until re-approved.')) return;
      await apiPost(`/farms/${b.dataset.id}/revoke-approval`, {});
      toast('Approval revoked'); renderNetwork(view);
    }));

    document.querySelectorAll('.editFarmBtn').forEach(b => b.addEventListener('click', () => {
      const farm = partnerFarms.find(f => String(f.id) === b.dataset.id);
      if (!farm) return;
      openModal({
        title: `Edit ${farm.name}`,
        fields: [
          { name: 'name', label: 'Farm Name', value: farm.name, required: true },
          { name: 'location', label: 'Location', value: farm.location, required: true },
          { name: 'contact_name', label: 'Contact Name', value: farm.contact_name || '' },
          { name: 'contact_phone', label: 'Phone', value: farm.contact_phone || '' },
          { name: 'distance_band', label: 'Distance from Collection Point', type: 'select', value: farm.distance_band || 'within_10km',
            options: [{ value: 'within_10km', label: 'Within 10 km' }, { value: '10km_plus', label: '10 km & above' }] },
          { name: 'share_deposit', label: 'Share Deposit (₹) — Approved members only', type: 'number', step: '0.01', value: farm.share_deposit || 0 },
          { name: 'feed_medicine_deposit', label: 'Feed/Medicine Deposit (₹)', type: 'number', step: '0.01', value: farm.feed_medicine_deposit || 0 },
          { name: 'notes', label: 'Notes', type: 'textarea', value: farm.notes || '' },
          { name: 'status', label: 'Status', type: 'select', value: farm.status, options: ['Active', 'Inactive'].map(s => ({ value: s, label: s })) },
        ],
        submitLabel: 'Save Changes',
        onSubmit: async (data, overlay) => {
          await apiPut(`/farms/${farm.id}`, { ...data, is_home: 0 });
          overlay.remove(); toast('Farm details updated'); renderNetwork(view);
        }
      });
    }));
  }

  async function renderCollectionTab() {
    const tanks = await apiGet('/tanks');
    document.getElementById('netBody').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Log Collection</h2></div>
          <p class="desc" style="margin-bottom:12px;">Rate is calculated automatically from the farm's distance band, delivery time, and liters — see Settings for the full rate table.</p>
          <form id="collForm">
            <div class="form-row"><label>Farm</label><select name="farm_id" id="collFarmSelect">${partnerFarms.map(f => `<option value="${f.id}" data-band="${f.distance_band || 'within_10km'}">${f.name} — ${f.location}</option>`).join('')}</select></div>
            <div class="form-grid">
              <div class="form-row"><label>Date</label><input type="date" name="date" id="collDate" value="${todayISO()}"></div>
              <div class="form-row"><label>Shift</label><select name="session" id="collSession"><option value="AM">Morning</option><option value="PM">Evening</option></select></div>
            </div>
            <div class="form-grid">
              <div class="form-row"><label>Delivery Time</label><input type="time" name="delivered_at" id="collTime"></div>
              <div class="form-row"><label>Liters</label><input type="number" step="0.01" name="liters" id="collLiters" required></div>
            </div>
            <div class="form-row"><label>Into Tank</label><select name="tank_id"><option value="">— None —</option>${tanks.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
            <div class="form-row"><label>Notes</label><input name="notes"></div>
            <div id="ratePreview" class="rate-preview">Fill in liters and delivery time to see the calculated rate.</div>
            <button type="submit" class="primary" style="width:100%;">Log Collection</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h2>Recent Collections</h2></div>
          <table><thead><tr><th>Farm</th><th>Date</th><th>Shift</th><th>Time</th><th>Liters</th><th>Rate</th><th>Value</th><th>Tier</th></tr></thead>
          <tbody id="collRows"></tbody></table>
        </div>
      </div>`;

    function updateRatePreview() {
      const opt = document.getElementById('collFarmSelect').selectedOptions[0];
      const band = opt ? opt.dataset.band : 'within_10km';
      const liters = Number(document.getElementById('collLiters').value || 0);
      const time = document.getElementById('collTime').value;
      const session = document.getElementById('collSession').value;
      const date = document.getElementById('collDate').value || todayISO();
      const preview = document.getElementById('ratePreview');
      if (!liters) { preview.textContent = 'Fill in liters and delivery time to see the calculated rate.'; return; }
      const { tier, rate, label } = computeRatePreview(band, liters, session, time, date);
      const normalRate = rules ? rules.rate_table[band][liters >= 20 ? 'over20' : 'under20'][0] : rate;
      preview.innerHTML = `<b>${label}</b> · Rate: <b>₹${rate}/L</b> · Value: <b>${fmtMoney(rate * liters)}</b>` +
        (tier > 0 ? ` <span style="color:#c0392b;">(late — normally ₹${normalRate}/L)</span>` : '');
    }
    ['collFarmSelect', 'collLiters', 'collTime', 'collSession', 'collDate'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateRatePreview);
      document.getElementById(id).addEventListener('change', updateRatePreview);
    });

    async function loadCollections() {
      let all = [];
      for (const f of partnerFarms) {
        const c = await apiGet(`/farms/${f.id}/collections`);
        all.push(...c.map(x => ({ ...x, farm_name: f.name })));
      }
      all.sort((a, b) => (a.date < b.date ? 1 : -1));
      document.getElementById('collRows').innerHTML = all.slice(0, 30).map(c => {
        const late = c.penalty_amount > 0;
        return `<tr>
          <td>${c.farm_name}</td><td>${fmtDate(c.date)}</td><td>${c.session === 'PM' ? 'Evening' : 'Morning'}</td>
          <td>${c.delivered_at || '-'}</td><td>${fmtLiters(c.liters)}</td><td>${fmtMoney(c.rate_per_liter)}</td>
          <td>${fmtMoney(c.liters * c.rate_per_liter)}</td>
          <td><span class="${late ? 'pill red' : 'pill green'}" title="${c.bonus_note || ''}">${c.bonus_note || '—'}</span></td>
        </tr>`;
      }).join('') || `<tr><td colspan="8"><div class="empty-state">No collections logged yet.</div></td></tr>`;
    }

    document.getElementById('collForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await apiPost(`/farms/${data.farm_id}/collections`, { ...data, liters: Number(data.liters) });
      toast('Collection logged'); e.target.reset(); document.getElementById('ratePreview').textContent = 'Fill in liters and delivery time to see the calculated rate.'; loadCollections();
    });

    loadCollections();
  }

  async function renderInvoicesTab() {
    document.getElementById('netBody').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>Generate Invoice</h2></div>
          <form id="invForm">
            <div class="form-row"><label>Farm</label><select name="farm_id" id="invFarmSelect">${partnerFarms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div>
            <div class="form-grid">
              <div class="form-row"><label>Period Start</label><input type="date" name="period_start" value="${daysAgoISO(30)}"></div>
              <div class="form-row"><label>Period End</label><input type="date" name="period_end" value="${todayISO()}"></div>
            </div>
            <div class="form-row"><label>Rate Override (optional — leave blank to use average collection rate)</label><input type="number" step="0.01" name="rate_per_liter"></div>
            <p class="desc">Late-delivery deductions already applied to each collection's rate are totaled and shown separately below.</p>
            <div id="loanDeductionWrap"></div>
            <button type="submit" class="primary" style="width:100%;">Generate Invoice</button>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><h2>Invoices</h2></div>
          <table><thead><tr><th>Farm</th><th>Period</th><th>Liters</th><th>Bonus</th><th>Penalty</th><th>Milk Value</th><th>Loan Deduction</th><th>Net Payout</th><th>Status</th><th></th></tr></thead>
          <tbody id="invRows"></tbody></table>
        </div>
      </div>`;

    async function updateLoanDeductionToggle() {
      const farmId = document.getElementById('invFarmSelect').value;
      const wrap = document.getElementById('loanDeductionWrap');
      const loans = await apiGet(`/loans?farm_id=${farmId}&status=Active&borrower_type=member`);
      if (loans.length === 0) { wrap.innerHTML = ''; return; }
      const summary = loans.map(l => `${l.kind === 'long' ? 'Long term' : 'Short term'} (${fmtMoney(l.balance)} outstanding)`).join(', ');
      wrap.innerHTML = `<label style="display:flex; align-items:flex-start; gap:8px; font-size:13px; margin:10px 0; padding:10px; background:var(--green-bg,#eef7ee); border-radius:8px;">
        <input type="checkbox" id="applyLoanDeductionCheck" checked style="width:auto; margin-top:2px;">
        <span>This farm has an active loan: <b>${summary}</b>. Deduct this cycle's installment/repayment from this invoice?</span>
      </label>`;
    }
    document.getElementById('invFarmSelect').addEventListener('change', updateLoanDeductionToggle);
    updateLoanDeductionToggle();

    async function loadInvoices() {
      const invoices = await apiGet('/invoices');
      document.getElementById('invRows').innerHTML = invoices.length ? invoices.map(i => `
        <tr>
          <td>${i.farm_name}</td><td>${fmtDate(i.period_start)} – ${fmtDate(i.period_end)}</td>
          <td>${fmtLiters(i.total_liters)}</td>
          <td style="color:#178a3f;">${i.total_bonus ? '+' + fmtMoney(i.total_bonus) : '—'}</td>
          <td style="color:#c0392b;">${i.total_penalty ? '-' + fmtMoney(i.total_penalty) : '—'}</td>
          <td>${fmtMoney(i.total_amount)}</td>
          <td style="color:#c0392b;">${i.total_loan_deduction ? '-' + fmtMoney(i.total_loan_deduction) : '—'}</td>
          <td><b>${fmtMoney(i.net_payout)}</b></td>
          <td><span class="pill ${pillClass(i.status)}">${i.status}</span></td>
          <td>${i.status === 'Unpaid' ? `<button class="small primary payBtn" data-id="${i.id}">Mark Paid</button>` : ''}</td>
        </tr>`).join('') : `<tr><td colspan="10"><div class="empty-state">No invoices generated yet.</div></td></tr>`;
      document.querySelectorAll('.payBtn').forEach(b => b.addEventListener('click', async () => {
        await apiPut(`/invoices/${b.dataset.id}/status`, { status: 'Paid' }); toast('Invoice marked paid'); loadInvoices();
      }));
    }

    document.getElementById('invForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      const applyCheck = document.getElementById('applyLoanDeductionCheck');
      try {
        await apiPost('/invoices/generate', {
          farm_id: Number(data.farm_id), period_start: data.period_start, period_end: data.period_end,
          rate_per_liter: data.rate_per_liter ? Number(data.rate_per_liter) : undefined,
          apply_loan_deduction: applyCheck ? applyCheck.checked : true,
        });
        toast('Invoice generated'); loadInvoices(); updateLoanDeductionToggle();
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
