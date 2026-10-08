// Milk Processing — milk goes out to an agent/person, finished paneer/curd comes back.
// Expected yield depends on that day's milk quality; a bonus is paid when the quantity
// returned reaches the target; every step is written to a per-production ledger.
async function renderProcessing(view) {
  const canManage = ['admin', 'manager'].includes((getCurrentUser() || {}).role);
  const num = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const bandPill = (b) => `<span class="pill ${b === 'good' ? 'green' : b === 'warning' ? 'amber' : 'red'}">${{ good: 'Good', warning: 'Warning', low: 'Low' }[b]}</span>`;
  let tab = 'batches';

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Milk Processing</h1><p class="subtitle">Milk given to agents to make paneer / curd — expected yield by daily quality, bonus, and a ledger for every production.</p></div>
    </div>
    <div class="tabs" id="procTabs">
      <button data-t="batches" class="active">🥛 Productions</button>
      <button data-t="ledger">📒 Ledger</button>
      <button data-t="processors">👤 Agents &amp; People</button>
      <button data-t="rules">⚙️ Yield &amp; Bonus Rules</button>
    </div>
    <div id="procBody"></div>`;
  const body = () => document.getElementById('procBody');
  document.querySelectorAll('#procTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#procTabs button').forEach(x => x.classList.toggle('active', x === b));
    tab = b.dataset.t; show();
  }));
  const show = () => ({ batches: tabBatches, ledger: tabLedger, processors: tabProcessors, rules: tabRules }[tab])().catch(err => { body().innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`; });

  // ===================== PRODUCTIONS =====================
  async function tabBatches() {
    const [processors, summary] = await Promise.all([apiGet('/processing/processors'), apiGet('/processing/summary')]);
    const t = summary.totals;
    body().innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Milk With Agents Now</div><div class="value">${num(t.milk_out)} L</div></div>
        <div class="stat-card"><div class="label">Milk Given (all time)</div><div class="value">${num(t.milk_issued)} L</div></div>
        <div class="stat-card"><div class="label">Product Returned</div><div class="value">${num(t.returned_qty)} kg</div></div>
        <div class="stat-card"><div class="label">Bonus Paid</div><div class="value">${fmtMoney(t.bonus_total)}</div></div>
      </div>
      <div class="toolbar">
        <select id="fProc"><option value="">All agents / people</option>${processors.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}</select>
        <select id="fStatus"><option>All</option><option value="Out">Milk still out</option><option value="Returned">Returned</option></select>
        ${canManage ? '<button class="primary" id="issueBtn">+ Give Milk</button>' : ''}
      </div>
      <div class="card" style="overflow-x:auto;"><table>
        <thead><tr><th>#</th><th>Date</th><th>Agent / Person</th><th>Product</th><th>Milk (L)</th><th>Quality</th><th>L per kg</th><th>Expected</th><th>Returned</th><th>Difference</th><th>Bonus</th><th>Status</th><th></th></tr></thead>
        <tbody id="batchRows"></tbody></table></div>`;
    document.getElementById('fProc').addEventListener('change', load);
    document.getElementById('fStatus').addEventListener('change', load);
    if (canManage) document.getElementById('issueBtn').addEventListener('click', () => batchModal(null, processors));

    async function load() {
      const q = new URLSearchParams();
      if (fProc.value) q.set('processor_id', fProc.value);
      q.set('status', fStatus.value);
      const rows = await apiGet('/processing/batches?' + q);
      document.getElementById('batchRows').innerHTML = rows.length ? rows.map(b => {
        const out = b.status === 'Out';
        const diff = b.variance_qty;
        return `<tr>
          <td>${b.id}</td><td>${fmtDate(b.date)}</td>
          <td>${escHtml(b.processor_name)}</td><td>${escHtml(b.product_name)}</td>
          <td>${num(b.milk_liters)}</td>
          <td>${bandPill(b.quality_band)}<div style="font-size:11px; color:var(--muted);">${b.quality_score != null ? 'score ' + b.quality_score : 'set manually'}</div></td>
          <td>${num(b.liters_per_unit)}</td>
          <td>${num(b.expected_qty)} ${b.unit}</td>
          <td>${out ? '—' : `<b>${num(b.actual_qty)} ${b.unit}</b>`}</td>
          <td style="color:${diff < 0 ? '#c0392b' : diff > 0 ? '#178a3f' : 'inherit'};">${out ? '—' : (diff > 0 ? '+' : '') + num(diff)}</td>
          <td>${out ? '—' : b.bonus_amount > 0 ? `<b>${fmtMoney(b.bonus_amount)}</b>` : '—'}</td>
          <td><span class="pill ${out ? 'amber' : 'green'}">${out ? 'Milk out' : 'Returned'}</span></td>
          <td><div style="display:flex; flex-wrap:wrap; gap:4px; min-width:150px;">
            <button class="small ledgerBtn" data-id="${b.id}">Ledger</button>
            ${canManage ? `<button class="small primary retBtn" data-id="${b.id}">${out ? 'Record Return' : 'Correct Return'}</button>` : ''}
            ${canManage && out ? `<button class="small editBtn" data-id="${b.id}">Edit</button>` : ''}
            ${canManage ? `<button class="small danger delBtn" data-id="${b.id}">Delete</button>` : ''}
          </div></td></tr>`;
      }).join('') : `<tr><td colspan="13"><div class="empty-state">No productions yet.${canManage ? ' Press “+ Give Milk” to start one.' : ''}</div></td></tr>`;
      const by = (id) => rows.find(r => r.id === Number(id));
      document.querySelectorAll('.retBtn').forEach(x => x.addEventListener('click', () => returnModal(by(x.dataset.id))));
      document.querySelectorAll('.editBtn').forEach(x => x.addEventListener('click', () => batchModal(by(x.dataset.id), processors)));
      document.querySelectorAll('.ledgerBtn').forEach(x => x.addEventListener('click', () => batchLedgerModal(by(x.dataset.id))));
      document.querySelectorAll('.delBtn').forEach(x => x.addEventListener('click', async () => {
        const b = by(x.dataset.id);
        const extra = b.status === 'Returned' ? ` This will also remove ${num(b.actual_qty)} ${b.unit} from stock${b.bonus_amount > 0 ? ' and delete the bonus entry from the Financial Ledger' : ''}.` : '';
        if (!confirm(`Delete production #${b.id} (${num(b.milk_liters)} L to ${b.processor_name})?${extra} This cannot be undone.`)) return;
        try { await apiDelete(`/processing/batches/${b.id}`); toast('Production deleted'); tabBatches(); } catch (err) { toast(err.message, true); }
      }));
    }
    const fProc = document.getElementById('fProc'), fStatus = document.getElementById('fStatus');
    await load();
  }

  // ----- Give milk (new) / edit (milk still out) -----
  async function batchModal(batch, processors) {
    const products = (await apiGet('/products')).filter(p => p.category === 'Dairy Product');
    const active = processors.filter(p => p.status === 'Active');
    if (!active.length) return toast('Add an agent or person first (Agents & People tab)', true);
    if (!products.length) return toast('Add a Dairy Product such as Paneer in Point of Sale → Products first', true);
    const overlay = openModal({
      title: batch ? `Edit Production #${batch.id}` : 'Give Milk for Processing',
      fields: [
        { name: 'date', label: 'Date', type: 'date', value: batch ? batch.date : todayISO(), required: true },
        { name: 'processor_id', label: 'Agent / Person', type: 'select', value: batch ? batch.processor_id : active[0].id, options: active.map(p => ({ value: p.id, label: p.name })) },
        { name: 'product_id', label: 'Product to make', type: 'select', value: batch ? batch.product_id : products[0].id, options: products.map(p => ({ value: p.id, label: `${p.name} (${p.unit})` })) },
        { name: 'milk_liters', label: 'Milk given (liters)', type: 'number', step: '0.01', value: batch ? batch.milk_liters : '', required: true },
        { name: 'quality_band', label: 'Milk quality', type: 'select', value: batch && batch.quality_source === 'manual' ? batch.quality_band : 'auto',
          options: [{ value: 'auto', label: 'Automatic — from the day’s quality tests' }, { value: 'good', label: 'Good' }, { value: 'warning', label: 'Warning' }, { value: 'low', label: 'Low' }] },
        { name: 'notes', label: 'Notes', value: batch ? escHtml(batch.notes || '') : '' },
      ],
      submitLabel: batch ? 'Save Changes' : 'Give Milk',
      extraHtml: '<div id="planBox" style="margin-top:8px; padding:10px 12px; border-radius:8px; background:var(--cream, #f4f1ea); font-size:13px;">Enter the milk quantity to see the expected product.</div>',
      onSubmit: async (d, ov) => {
        const body = { ...d, processor_id: Number(d.processor_id), product_id: Number(d.product_id), milk_liters: Number(d.milk_liters) };
        if (batch) await apiPut(`/processing/batches/${batch.id}`, body); else await apiPost('/processing/batches', body);
        ov.remove(); toast(batch ? 'Production updated' : 'Milk given — record the return when it comes back'); tabBatches();
      },
    });
    const f = (n) => overlay.querySelector(`[name="${n}"]`);
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(async () => {
      const box = overlay.querySelector('#planBox');
      if (!(Number(f('milk_liters').value) > 0)) { box.textContent = 'Enter the milk quantity to see the expected product.'; return; }
      try {
        const q = new URLSearchParams({ date: f('date').value, product_id: f('product_id').value, milk_liters: f('milk_liters').value, quality_band: f('quality_band').value });
        const p = await apiGet('/processing/preview?' + q);
        const quality = p.quality.source === 'auto' ? `${{ good: 'Good', warning: 'Warning', low: 'Low' }[p.quality.band]} (average score ${p.quality.score} from ${p.quality.tests} test${p.quality.tests > 1 ? 's' : ''})` : `${{ good: 'Good', warning: 'Warning', low: 'Low' }[p.quality.band]} (chosen manually)`;
        box.innerHTML = `Quality: <b>${quality}</b><br>${p.liters_per_unit} L of milk per ${p.unit} → expect about <b>${num(p.expected_qty)} ${p.unit}</b>`
          + (p.bonus_min_qty > 0 && p.bonus_amount > 0 ? `<br>Bonus ${fmtMoney(p.bonus_amount)} if ${num(p.bonus_min_qty)} ${p.unit} or more comes back.` : '')
          + (p.rule_is_default ? `<br><span style="color:#b9770e;">Using starting yield values — confirm them in the Yield &amp; Bonus Rules tab.</span>` : '');
      } catch (err) { box.innerHTML = `<span style="color:#c0392b;">${escHtml(err.message)}</span>`; }
    }, 250); };
    ['date', 'product_id', 'milk_liters', 'quality_band'].forEach(n => { f(n).addEventListener('input', refresh); f(n).addEventListener('change', refresh); });
    refresh();
  }

  // ----- Record / correct the return -----
  async function returnModal(b) {
    const rules = (await apiGet('/processing/rules')).rules.find(r => r.product_id === b.product_id) || {};
    const overlay = openModal({
      title: `${b.status === 'Out' ? 'Record Return' : 'Correct Return'} — #${b.id} ${b.processor_name}`,
      fields: [
        { name: 'actual_qty', label: `${b.product_name} returned (${b.unit})`, type: 'number', step: '0.01', value: b.status === 'Returned' ? b.actual_qty : '', required: true },
        { name: 'returned_date', label: 'Date returned', type: 'date', value: b.returned_date || todayISO(), required: true },
        { name: 'notes', label: 'Notes', value: escHtml(b.notes || '') },
      ],
      submitLabel: 'Save Return',
      extraHtml: `<div id="retBox" style="margin-top:8px; padding:10px 12px; border-radius:8px; background:var(--cream, #f4f1ea); font-size:13px;">
        Milk given: <b>${num(b.milk_liters)} L</b> (${b.quality_band} quality, ${b.liters_per_unit} L per ${b.unit}) → expected <b>${num(b.expected_qty)} ${b.unit}</b>.<br>
        ${rules.bonus_min_qty > 0 && rules.bonus_amount > 0 ? `Bonus <b>${fmtMoney(rules.bonus_amount)}</b> if ${num(rules.bonus_min_qty)} ${b.unit} or more is returned.` : 'No bonus rule is set for this product.'}
        <div id="retLive" style="margin-top:6px;"></div></div>
        ${b.status === 'Returned' ? '<p class="desc" style="margin:8px 0 0;">Saving replaces the earlier return: stock and the bonus entry are corrected automatically.</p>' : ''}`,
      onSubmit: async (d, ov) => {
        const r = await apiPost(`/processing/batches/${b.id}/return`, { ...d, actual_qty: Number(d.actual_qty) });
        ov.remove();
        toast(r.bonus_amount > 0 ? `Return saved — bonus ${fmtMoney(r.bonus_amount)} recorded` : 'Return saved');
        tabBatches();
      },
    });
    const input = overlay.querySelector('[name="actual_qty"]');
    const live = () => {
      const v = input.value; if (v === '') { overlay.querySelector('#retLive').innerHTML = ''; return; }
      const q = Number(v), diff = Math.round((q - b.expected_qty) * 100) / 100;
      const bonus = rules.bonus_min_qty > 0 && q >= rules.bonus_min_qty ? rules.bonus_amount : 0;
      overlay.querySelector('#retLive').innerHTML = `<b style="color:${diff < 0 ? '#c0392b' : '#178a3f'};">${diff >= 0 ? '+' : ''}${num(diff)} ${b.unit} vs expected</b> · ${bonus > 0 ? `<b>Bonus ${fmtMoney(bonus)}</b>` : 'no bonus'}`;
    };
    input.addEventListener('input', live); live();
  }

  // ----- Ledger of one production -----
  async function batchLedgerModal(b) {
    const entries = await apiGet(`/processing/ledger?batch_id=${b.id}`);
    openModal({
      title: `Ledger — Production #${b.id} (${b.processor_name}, ${b.product_name})`,
      fields: [], submitLabel: 'Close',
      extraHtml: ledgerTable(entries.slice().reverse(), false),
      onSubmit: async (d, ov) => ov.remove(),
    });
  }

  function ledgerTable(entries, showBatch = true) {
    if (!entries.length) return '<div class="empty-state">No entries.</div>';
    return `<div style="overflow-x:auto;"><table><thead><tr><th>Date</th>${showBatch ? '<th>Prod. #</th><th>Agent / Person</th>' : ''}<th>Entry</th><th>Milk (L)</th><th>Product</th><th>Amount</th><th>Details</th></tr></thead><tbody>
      ${entries.map(e => `<tr><td>${fmtDate(e.date)}</td>${showBatch ? `<td>${e.batch_id}</td><td>${escHtml(e.processor_name)}</td>` : ''}
        <td><span class="pill ${e.entry_type === 'Bonus' ? 'amber' : e.entry_type === 'Milk Issued' ? 'gray' : 'green'}">${e.entry_type}</span></td>
        <td>${e.liters != null ? num(e.liters) : ''}</td>
        <td style="color:${e.entry_type === 'Yield Variance' && e.qty < 0 ? '#c0392b' : 'inherit'};">${e.qty != null ? (e.entry_type === 'Yield Variance' && e.qty > 0 ? '+' : '') + num(e.qty) + ' ' + e.unit : ''}</td>
        <td>${e.amount != null ? fmtMoney(e.amount) : ''}</td>
        <td style="font-size:12px; max-width:340px;">${escHtml(e.description || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ===================== LEDGER =====================
  async function tabLedger() {
    const processors = await apiGet('/processing/processors');
    body().innerHTML = `
      <div class="toolbar">
        <select id="lProc"><option value="">All agents / people</option>${processors.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}</select>
        <label style="font-size:12px;">From <input type="date" id="lStart"></label>
        <label style="font-size:12px;">To <input type="date" id="lEnd"></label>
      </div>
      <div class="card" style="margin-bottom:16px; overflow-x:auto;"><h2>Totals per agent / person</h2>
        <table><thead><tr><th>Name</th><th>Productions</th><th>Milk given (L)</th><th>Milk still out (L)</th><th>Expected (returned ones)</th><th>Returned</th><th>Difference</th><th>Bonus</th></tr></thead><tbody id="sumRows"></tbody></table></div>
      <div class="card"><h2>Transactions</h2><div id="ledgerBox"></div></div>`;
    async function load() {
      const q = new URLSearchParams();
      if (lProc.value) q.set('processor_id', lProc.value);
      const range = new URLSearchParams();
      if (lStart.value && lEnd.value) { q.set('start', lStart.value); q.set('end', lEnd.value); range.set('start', lStart.value); range.set('end', lEnd.value); }
      const [entries, sum] = await Promise.all([apiGet('/processing/ledger?' + q), apiGet('/processing/summary?' + range)]);
      const rows = sum.perProcessor.filter(r => !lProc.value || String(r.id) === lProc.value);
      document.getElementById('sumRows').innerHTML = rows.length ? rows.map(r => `<tr><td>${escHtml(r.name)}</td><td>${r.batches}</td><td>${num(r.milk_issued)}</td><td>${num(r.milk_pending)}</td><td>${num(r.expected_qty)} kg</td><td>${num(r.returned_qty)} kg</td>
        <td style="color:${r.variance_qty < 0 ? '#c0392b' : 'inherit'};">${r.variance_qty > 0 ? '+' : ''}${num(r.variance_qty)} kg</td><td>${fmtMoney(r.bonus_total)}</td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-state">No productions in this period.</div></td></tr>';
      document.getElementById('ledgerBox').innerHTML = ledgerTable(entries);
    }
    const lProc = document.getElementById('lProc'), lStart = document.getElementById('lStart'), lEnd = document.getElementById('lEnd');
    [lProc, lStart, lEnd].forEach(x => x.addEventListener('change', load));
    await load();
  }

  // ===================== AGENTS & PEOPLE =====================
  async function tabProcessors() {
    const list = await apiGet('/processing/processors');
    body().innerHTML = `
      <div class="toolbar">${canManage ? '<button class="primary" id="addProcBtn">+ Add Agent / Person</button>' : ''}</div>
      <div class="card"><table><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Productions</th><th>Milk with them now</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.length ? list.map(p => `<tr><td>${escHtml(p.name)}</td><td>${p.kind}</td><td>${escHtml(p.phone || '-')}</td><td>${p.batch_count}</td><td>${num(p.milk_with_them)} L</td>
          <td><span class="pill ${p.status === 'Active' ? 'green' : 'gray'}">${p.status}</span></td>
          <td>${canManage ? `<button class="small editProc" data-id="${p.id}">Edit</button> <button class="small danger delProc" data-id="${p.id}">Delete</button>` : ''}</td></tr>`).join('')
          : '<tr><td colspan="7"><div class="empty-state">No agents or people yet.</div></td></tr>'}
      </tbody></table></div>`;
    const form = (p) => openModal({
      title: p ? 'Edit Agent / Person' : 'Add Agent / Person',
      fields: [
        { name: 'name', label: 'Name', required: true, value: p ? escHtml(p.name) : '' },
        { name: 'kind', label: 'Type', type: 'select', value: p ? p.kind : 'Agent', options: [{ value: 'Agent', label: 'Agent' }, { value: 'Person', label: 'Person' }] },
        { name: 'phone', label: 'Phone', value: p ? escHtml(p.phone || '') : '' },
        { name: 'address', label: 'Address', value: p ? escHtml(p.address || '') : '' },
        ...(p ? [{ name: 'status', label: 'Status', type: 'select', value: p.status, options: [{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }] }] : []),
      ],
      submitLabel: 'Save',
      onSubmit: async (d, ov) => { if (p) await apiPut(`/processing/processors/${p.id}`, d); else await apiPost('/processing/processors', d); ov.remove(); toast('Saved'); tabProcessors(); },
    });
    if (canManage) document.getElementById('addProcBtn').addEventListener('click', () => form(null));
    document.querySelectorAll('.editProc').forEach(x => x.addEventListener('click', () => form(list.find(p => p.id === Number(x.dataset.id)))));
    document.querySelectorAll('.delProc').forEach(x => x.addEventListener('click', async () => {
      const p = list.find(r => r.id === Number(x.dataset.id));
      if (!confirm(`Delete ${p.name}?`)) return;
      try { await apiDelete(`/processing/processors/${p.id}`); toast('Deleted'); tabProcessors(); } catch (err) { toast(err.message, true); }
    }));
  }

  // ===================== RULES =====================
  async function tabRules() {
    const { rules, thresholds: t } = await apiGet('/processing/rules');
    body().innerHTML = `
      <p class="desc" style="margin:0 0 12px;">Each day's milk quality is the <b>average score of that day's quality tests</b>: <b>Good</b> at ${t.warning_max} or above, <b>Warning</b> from ${t.low_max} to ${t.warning_max}, <b>Low</b> below ${t.low_max} (change these in the Milk Quality Tests page). Enter how many <b>liters of milk make 1 kg</b> at each level, and the bonus: paid when the quantity returned is at least the target.</p>
      <div class="card" style="overflow-x:auto;"><table><thead><tr><th>Product</th><th>L per kg — Good</th><th>L per kg — Warning</th><th>L per kg — Low</th><th>Bonus target (kg or more)</th><th>Bonus amount (₹)</th><th></th></tr></thead><tbody>
      ${rules.length ? rules.map(r => `<tr data-id="${r.product_id}">
        <td><b>${escHtml(r.name)}</b>${r.is_default ? '<div style="font-size:11px; color:#b9770e;">starting values — save to confirm</div>' : ''}</td>
        ${['lpu_good', 'lpu_warning', 'lpu_low', 'bonus_min_qty', 'bonus_amount'].map(k => `<td><input type="number" step="0.01" min="0" data-k="${k}" value="${r[k]}" style="width:90px;" ${canManage ? '' : 'disabled'}></td>`).join('')}
        <td>${canManage ? '<button class="small primary saveRule">Save</button>' : ''}</td></tr>`).join('')
        : '<tr><td colspan="7"><div class="empty-state">No Dairy Products yet. Add Paneer / Curd in Point of Sale → Products first.</div></td></tr>'}
      </tbody></table></div>`;
    document.querySelectorAll('.saveRule').forEach(btn => btn.addEventListener('click', async () => {
      const tr = btn.closest('tr'); const data = {};
      tr.querySelectorAll('input').forEach(i => { data[i.dataset.k] = Number(i.value); });
      try { await apiPut(`/processing/rules/${tr.dataset.id}`, data); toast('Rule saved'); tabRules(); } catch (err) { toast(err.message, true); }
    }));
  }

  await show();
}
