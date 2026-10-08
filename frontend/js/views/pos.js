async function renderPos(view) {
  // Clear any previous auto-refresh interval/listener from an earlier
  // visit to this page — renderPos re-runs every time the user
  // navigates back here, and without this, old ones would keep piling
  // up in the background (and could throw once this page's elements no
  // longer exist in the DOM).
  if (window.__posMilkRefreshInterval) clearInterval(window.__posMilkRefreshInterval);
  if (window.__posFocusHandler) window.removeEventListener('focus', window.__posFocusHandler);

  const [summary, products, milkAvail] = await Promise.all([apiGet('/pos/summary'), apiGet('/products'), apiGet('/pos/milk-availability')]);
  let cart = []; // [{product, qty, unit_price}]
  let categoryFilter = 'All';
  let saleDate = todayISO();
  let dateIsCustom = false;

  const categories = ['All', 'Milk', 'Milk Token', 'Dairy Product', 'Feed', 'Medicine'];

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Point of Sale</h1><p class="subtitle">Everything Ima Langnubi Dairy sells — milk, tokens, paneer, curd, feed, medicine — in one till.</p></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">Today's Revenue</div><div class="value">${fmtMoney(summary.today_revenue)}</div></div>
      <div class="stat-card"><div class="label">Today's Transactions</div><div class="value">${summary.today_transactions}</div></div>
      <div class="stat-card"><div class="label">Today's Milk Sold</div><div class="value">${fmtLiters(summary.today_milk_liters)}</div></div>
      <div class="stat-card"><div class="label">Fresh Milk Remaining <button type="button" id="refreshMilkBtn" class="small" style="padding:1px 6px; font-size:10px; margin-left:4px;" title="Recheck now">↻</button></div><div class="value" id="milkRemainingVal" style="${milkAvail.remaining <= 0 ? 'color:#c0392b;' : ''}">${fmtLiters(milkAvail.remaining)}</div></div>
      <div class="stat-card"><div class="label">Monthly Revenue</div><div class="value">${fmtMoney(summary.month_revenue)}</div></div>
    </div>

    <div class="tabs" id="posTabs">
      <button data-tab="new" class="active">New Sale</button>
      <button data-tab="sales">Recent Sales</button>
      <button data-tab="tokens">Tokens</button>
      <button data-tab="products">Products</button>
    </div>

    <div id="newSalePane">
      <div class="pos-layout">
        <div class="card">
          <div class="card-head">
            <h2>Products</h2>
            <select id="catFilter">${categories.map(c => `<option value="${c}">${c === 'All' ? 'All Products' : c}</option>`).join('')}</select>
          </div>
          <div class="product-grid" id="productGrid"></div>
        </div>

        <div class="card">
          <h2>Cart</h2>
          <div class="form-row">
            <label>Date</label>
            <div class="date-today">
              <span id="dateDisplay">${fmtDate(saleDate)} (today)</span>
              <a class="link" id="backdateLink">change</a>
              <input type="date" id="dateInput" value="${saleDate}" class="hidden" />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Customer Name</label><input type="text" id="custName" placeholder="Walk-in"></div>
            <div class="form-row"><label>Customer Phone</label><input type="tel" id="custPhone" placeholder="+254..."></div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Sale Channel</label>
              <select id="saleChannel">
                <option value="Counter">Counter</option>
                <option value="Delivery">Home Delivery</option>
                <option value="Bulk">Bulk</option>
                <option value="B2B">B2B (Business)</option>
              </select>
            </div>
            <div class="form-row"><label>Payment Method</label>
              <select id="paymentMethod">${['Cash', 'M-Pesa', 'Bank Transfer', 'Credit'].map(m => `<option>${m}</option>`).join('')}</select>
            </div>
          </div>
          <div class="form-grid hidden" id="b2bRow">
            <div class="form-row"><label>Business Name *</label><input type="text" id="bizName" placeholder="e.g. Hotel / Shop / Canteen"></div>
            <div class="form-row"><label>GSTIN (optional)</label><input type="text" id="bizGstin" placeholder="GST number" style="text-transform:uppercase;"></div>
          </div>
          <p class="desc hidden" id="b2bHint" style="margin:0 0 8px;">B2B prices are applied automatically (products without a B2B price use the normal price). You can still edit any line's price.</p>
          <div class="form-row hidden" id="deliveryChargeRow"><label>Delivery Charge</label><input type="number" id="deliveryCharge" value="0" step="0.01"></div>

          <div id="cartLines" style="margin: 10px 0;"></div>
          <div class="empty-state" id="emptyCart" style="padding:16px;">Tap a product to add it to the cart.</div>

          <div style="border-top:1px solid var(--border); padding-top:10px; margin-top:6px;">
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;"><span>Subtotal</span><span id="subtotalVal">$0.00</span></div>
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;"><span>Delivery</span><span id="deliveryVal">$0.00</span></div>
            <div style="display:flex; justify-content:space-between; font-weight:700; font-size:16px;"><span>Total</span><span id="totalVal">$0.00</span></div>
          </div>
          <button class="primary" id="checkoutBtn" style="width:100%; margin-top:14px;">Complete Sale</button>
        </div>
      </div>
    </div>

    <div class="card hidden" id="salesPane">
      <table>
        <thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Channel</th><th>Items</th><th>Total</th><th>Method</th><th></th></tr></thead>
        <tbody id="salesRows"></tbody>
      </table>
    </div>

    <div class="card hidden" id="tokensPane">
      <div class="card-head">
        <h2>Redeem a Token</h2>
      </div>
      <p style="font-size:12.5px; color:var(--muted); margin-top:-6px;">
        Tokens are generated automatically when a Milk Token product is sold in the cart under
        <b>New Sale</b> — that's when payment happens and a unique code is printed. Bringing that
        code back later to collect milk doesn't charge again — just redeem it below to mark it used.
      </p>
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <input type="text" id="redeemCode" placeholder="Token code, e.g. Q-1A2B3C4D" style="flex:1;" />
        <button class="primary" id="redeemBtn">Redeem</button>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:16px; align-items:center;">
        <button class="primary small" id="manualTokenBtn">+ Manual Token Entry (milk / milk product)</button>
        <span class="link" id="issueFreeLink">+ Issue a token without charging (replacement / promo)</span>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Type</th><th>Item</th><th>Qty</th><th>Status</th><th>Issued To</th><th>Issued</th><th>Entered By</th><th></th></tr></thead>
        <tbody id="tokenRows"></tbody>
      </table>
    </div>

    <div class="card hidden" id="productsPane">
      <div class="card-head">
        <h2>Product Catalog</h2>
        <button class="primary small" id="addProductBtn">+ Add Product</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Price</th><th>B2B Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
        <tbody id="productMgmtRows"></tbody>
      </table>
    </div>
  `;

  // ---------- Tabs ----------
  document.querySelectorAll('#posTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#posTabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('newSalePane').classList.toggle('hidden', b.dataset.tab !== 'new');
    document.getElementById('salesPane').classList.toggle('hidden', b.dataset.tab !== 'sales');
    document.getElementById('tokensPane').classList.toggle('hidden', b.dataset.tab !== 'tokens');
    document.getElementById('productsPane').classList.toggle('hidden', b.dataset.tab !== 'products');
    if (b.dataset.tab === 'sales') loadSales();
    if (b.dataset.tab === 'tokens') loadTokens();
    if (b.dataset.tab === 'products') loadProductManagement();
  }));

  // ---------- Date ----------
  document.getElementById('backdateLink').addEventListener('click', () => {
    dateIsCustom = true;
    document.getElementById('dateDisplay').classList.add('hidden');
    document.getElementById('backdateLink').classList.add('hidden');
    document.getElementById('dateInput').classList.remove('hidden');
  });
  document.getElementById('dateInput').addEventListener('change', (e) => { saleDate = e.target.value; });

  // ---------- B2B pricing ----------
  const isB2B = () => document.getElementById('saleChannel').value === 'B2B';
  const priceFor = (p) => (isB2B() && p.b2b_price > 0 ? p.b2b_price : p.price);

  // ---------- Product grid ----------
  function renderGrid() {
    const grid = document.getElementById('productGrid');
    const list = products.filter(p => categoryFilter === 'All' || p.category === categoryFilter);
    grid.innerHTML = list.length ? list.map(p => `
      <button type="button" class="product-tile" data-id="${p.id}">
        <div class="pname">${p.name}</div>
        <div class="pmeta">${fmtMoney(priceFor(p))} / ${p.unit}${isB2B() && p.b2b_price > 0 ? ' · B2B' : ''}</div>
        ${p.track_stock ? `<div class="pmeta">Stock: ${p.stock_qty}</div>` : ''}
      </button>`).join('') : `<div class="empty-state">No products in this category yet.</div>`;
    grid.querySelectorAll('.product-tile').forEach(t => t.addEventListener('click', () => addToCart(Number(t.dataset.id))));
  }
  document.getElementById('catFilter').addEventListener('change', (e) => { categoryFilter = e.target.value; renderGrid(); });

  // ---------- Cart ----------
  function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    const existing = cart.find(c => c.product.id === productId);
    if (existing) existing.qty += 1;
    else cart.push({ product, qty: 1, unit_price: priceFor(product) });
    renderCart();
  }
  function renderCart() {
    const wrap = document.getElementById('cartLines');
    document.getElementById('emptyCart').classList.toggle('hidden', cart.length > 0);
    wrap.innerHTML = cart.map((c, i) => `
      <div class="cart-line">
        <div>
          <div class="cname">${c.product.name}</div>
          <div class="cmeta">${c.product.category}</div>
        </div>
        <input type="number" min="0.01" step="0.01" value="${c.qty}" class="qtyInput" data-i="${i}" />
        <input type="number" min="0" step="0.01" value="${c.unit_price}" class="priceInput" data-i="${i}" title="Price per unit (editable)" />
        <span style="width:66px; text-align:right; font-weight:600;">${fmtMoney(c.qty * c.unit_price)}</span>
        <button type="button" class="small danger removeBtn" data-i="${i}">✕</button>
      </div>`).join('');
    wrap.querySelectorAll('.qtyInput').forEach(inp => inp.addEventListener('input', () => {
      cart[Number(inp.dataset.i)].qty = Number(inp.value) || 0; renderTotals();
    }));
    wrap.querySelectorAll('.priceInput').forEach(inp => inp.addEventListener('input', () => {
      cart[Number(inp.dataset.i)].unit_price = Number(inp.value) || 0; renderTotals();
    }));
    wrap.querySelectorAll('.removeBtn').forEach(btn => btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.i), 1); renderCart();
    }));
    renderTotals();
  }
  function renderTotals() {
    const subtotal = cart.reduce((s, c) => s + c.qty * c.unit_price, 0);
    const channel = document.getElementById('saleChannel').value;
    const delivery = channel === 'Delivery' ? Number(document.getElementById('deliveryCharge').value || 0) : 0;
    document.getElementById('subtotalVal').textContent = fmtMoney(subtotal);
    document.getElementById('deliveryVal').textContent = fmtMoney(delivery);
    document.getElementById('totalVal').textContent = fmtMoney(subtotal + delivery);
  }
  let lastChannel = 'Counter';
  document.getElementById('saleChannel').addEventListener('change', (e) => {
    const ch = e.target.value;
    document.getElementById('deliveryChargeRow').classList.toggle('hidden', ch !== 'Delivery');
    document.getElementById('b2bRow').classList.toggle('hidden', ch !== 'B2B');
    document.getElementById('b2bHint').classList.toggle('hidden', ch !== 'B2B');
    // Switching to/from B2B re-prices cart lines that are still at the standard price
    // (a price the cashier typed by hand is left alone).
    const wasB2B = lastChannel === 'B2B', nowB2B = ch === 'B2B';
    if (wasB2B !== nowB2B) {
      const priceOf = (p, b2b) => (b2b && p.b2b_price > 0 ? p.b2b_price : p.price);
      cart.forEach(c => { if (Number(c.unit_price) === Number(priceOf(c.product, wasB2B))) c.unit_price = priceOf(c.product, nowB2B); });
      renderCart(); renderGrid();
    }
    lastChannel = ch;
    renderTotals();
  });
  document.getElementById('deliveryCharge').addEventListener('input', renderTotals);

  async function refreshStats() {
    // Guard: this can fire (via the focus/interval handlers) after the
    // user has navigated away from POS to a different page, in which
    // case these elements no longer exist — just skip silently.
    if (!document.getElementById('milkRemainingVal')) return;
    const s = await apiGet('/pos/summary');
    const avail = await apiGet('/pos/milk-availability');
    const vals = document.querySelectorAll('.stat-grid .value');
    vals[0].textContent = fmtMoney(s.today_revenue);
    vals[1].textContent = s.today_transactions;
    vals[2].textContent = fmtLiters(s.today_milk_liters);
    vals[4].textContent = fmtMoney(s.month_revenue);
    document.getElementById('milkRemainingVal').textContent = fmtLiters(avail.remaining);
    document.getElementById('milkRemainingVal').style.color = avail.remaining <= 0 ? '#c0392b' : '';
  }
  document.getElementById('refreshMilkBtn').addEventListener('click', () => { refreshStats(); toast('Rechecked'); });
  // Auto-recheck every 20s while this page is open, and immediately when
  // the app window regains focus — covers the case where a collection
  // was logged elsewhere and this page was just left sitting open rather
  // than being freshly navigated to.
  window.__posMilkRefreshInterval = setInterval(refreshStats, 20000);
  window.__posFocusHandler = refreshStats;
  window.addEventListener('focus', window.__posFocusHandler);

  document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (!cart.length) return toast('Add at least one item to the cart', true);
    const bizName = document.getElementById('bizName').value.trim();
    if (isB2B() && !bizName) return toast('Enter the business name for a B2B sale', true);
    const payload = {
      business_name: isB2B() ? bizName : undefined,
      gstin: isB2B() ? (document.getElementById('bizGstin').value.trim().toUpperCase() || undefined) : undefined,
      date: dateIsCustom ? saleDate : undefined,
      customer_name: document.getElementById('custName').value || undefined,
      customer_phone: document.getElementById('custPhone').value || undefined,
      sale_channel: document.getElementById('saleChannel').value,
      delivery_charge: Number(document.getElementById('deliveryCharge').value || 0),
      payment_method: document.getElementById('paymentMethod').value,
      items: cart.map(c => ({ product_id: c.product.id, qty: c.qty, unit_price: c.unit_price })),
    };
    try {
      const sale = await apiPost('/pos/sales', payload);
      let msg = `Sale completed — ${fmtMoney(sale.total)}`;
      if (sale.tokens_issued && sale.tokens_issued.length) {
        msg += ` · Token code(s): ${sale.tokens_issued.map(t => t.code).join(', ')}`;
      }
      toast(msg);
      showReceiptPrompt(sale);
      cart = []; renderCart();
      document.getElementById('custName').value = '';
      document.getElementById('custPhone').value = '';
      document.getElementById('bizName').value = '';
      document.getElementById('bizGstin').value = '';
      await refreshStats();
    } catch (err) { toast(err.message, true); }
  });

  function showReceiptPrompt(sale) {
    const overlay = el(`<div class="modal-overlay"></div>`);
    const modal = el(`<div class="modal" style="width:340px; text-align:center;">
      <h2>Sale Complete — ${fmtMoney(sale.total)}</h2>
      <p style="font-size:13px; color:var(--muted); margin-bottom:18px;">
        ${sale.business_name ? escHtml(sale.business_name) + ' · ' : ''}${sale.customer_name || 'Walk-in'}${sale.customer_phone ? ' · ' + sale.customer_phone : ''}
      </p>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button class="primary" id="printReceiptBtn">🖨 Print / Save Bill</button>
        <button id="whatsappReceiptBtn">💬 Send Bill via WhatsApp</button>
        <button id="closeReceiptBtn" class="small">Close</button>
      </div>
    </div>`);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    modal.querySelector('#printReceiptBtn').addEventListener('click', () => openReceipt(sale));
    modal.querySelector('#whatsappReceiptBtn').addEventListener('click', () => sendReceiptOnWhatsApp(sale));
    modal.querySelector('#closeReceiptBtn').addEventListener('click', () => overlay.remove());
  }

  // ---------- Recent sales ----------
  async function loadSales() {
    const sales = await apiGet('/pos/sales');
    const rows = document.getElementById('salesRows');
    rows.innerHTML = sales.length ? sales.map(s => `
      <tr>
        <td>${fmtDate(s.date)}</td><td>${s.business_name ? `<b>${escHtml(s.business_name)}</b>${s.gstin ? `<div style="font-size:11px; color:var(--muted);">GSTIN ${escHtml(s.gstin)}</div>` : ''}` : escHtml(s.customer_name || 'Walk-in')}</td><td>${s.customer_phone || '-'}</td>
        <td><span class="pill ${s.sale_channel === 'B2B' ? 'amber' : s.sale_channel === 'Bulk' ? 'amber' : s.sale_channel === 'Delivery' ? 'gray' : 'green'}">${s.sale_channel}</span></td>
        <td>${s.items.map(i => `${i.product_name} ×${i.qty}`).join(', ')}</td>
        <td><b>${fmtMoney(s.total)}</b></td><td>${s.payment_method}</td>
        <td><button class="small billBtn" data-id="${s.id}">🧾 Bill</button></td>
      </tr>`).join('') : `<tr><td colspan="8"><div class="empty-state">No sales yet.</div></td></tr>`;
    rows.querySelectorAll('.billBtn').forEach(b => b.addEventListener('click', () => {
      const sale = sales.find(s => s.id === Number(b.dataset.id));
      showReceiptPrompt(sale);
    }));
  }

  // ---------- Tokens ----------
  async function loadTokens() {
    const tokens = await apiGet('/pos/tokens');
    const rows = document.getElementById('tokenRows');
    rows.innerHTML = tokens.length ? tokens.map(t => {
      const isProduct = t.token_type === 'Milk Product';
      const item = isProduct ? (t.item_name || '-') : 'Fresh Milk';
      const qty = isProduct ? (t.size || t.qty) : fmtLiters(t.liters);
      return `<tr>
        <td><code>${escHtml(t.code)}</code>${t.source === 'manual' ? ' <span class="pill gray">manual</span>' : ''}</td>
        <td>${isProduct ? 'Milk Product' : 'Milk'}</td><td>${escHtml(item)}</td><td>${escHtml(qty)}</td>
        <td><span class="pill ${pillClass(t.status)}">${t.status}</span></td>
        <td>${escHtml(t.issued_to || '-')}</td><td>${fmtDate(t.issued_at)}</td><td>${escHtml(t.entered_by || '-')}</td>
        <td>${t.status === 'Issued' ? `<button class="small danger voidBtn" data-id="${t.id}">Void</button>` : ''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="9"><div class="empty-state">No tokens issued yet.</div></td></tr>`;
    rows.querySelectorAll('.voidBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/pos/tokens/${b.dataset.id}/void`); toast('Token voided'); loadTokens();
    }));
  }
  document.getElementById('redeemBtn').addEventListener('click', async () => {
    const code = document.getElementById('redeemCode').value.trim();
    if (!code) return;
    try {
      await apiPost('/pos/tokens/redeem', { code });
      toast('Token redeemed — handed over'); document.getElementById('redeemCode').value = ''; loadTokens();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Free token issuing (admin/staff, no charge) ----------
  document.getElementById('issueFreeLink').addEventListener('click', () => {
    const tokenProducts = products.filter(p => p.category === 'Milk Token');
    if (!tokenProducts.length) return toast('Add a Milk Token product first', true);
    openModal({
      title: 'Issue Token Without Charging',
      fields: [
        { name: 'product_id', label: 'Token Size', type: 'select', required: true,
          options: tokenProducts.map(p => ({ value: p.id, label: p.name })) },
        { name: 'issued_to', label: 'Issued To (name)' },
      ],
      submitLabel: 'Issue Token',
      onSubmit: async (data, overlay) => {
        const res = await apiPost('/pos/tokens/issue-free', { product_id: Number(data.product_id), issued_to: data.issued_to });
        overlay.remove(); toast(`Token issued: ${res.code}`); loadTokens();
      }
    });
  });

  // ---------- Manual token entry (staff record a token from their own token book) ----------
  document.getElementById('manualTokenBtn').addEventListener('click', () => {
    const productOptions = products.filter(p => p.category === 'Dairy Product')
      .map(p => ({ value: p.id, label: `${p.name} (${p.unit})` }));
    const overlay = openModal({
      title: 'Manual Token Entry',
      fields: [
        { name: 'code', label: 'Token Code (from your token book / slip)', required: true, placeholder: 'e.g. A-101' },
        { name: 'token_type', label: 'Token For', type: 'select', value: 'Milk',
          options: [{ value: 'Milk', label: 'Milk' }, { value: 'Milk Product', label: 'Milk Product (paneer, curd, ...)' }] },
        { name: 'liters', label: 'Milk Quantity (liters)', type: 'number', step: '0.01', value: 1 },
        { name: 'product_id', label: 'Product', type: 'select', value: '',
          options: [{ value: '', label: '— Other (type name below) —' }, ...productOptions] },
        { name: 'item_name', label: 'Product Name (if not in the list)' },
        { name: 'qty', label: 'Product Quantity', type: 'number', step: '0.01', value: 1 },
        { name: 'issued_to', label: 'Issued To (name)' },
        { name: 'notes', label: 'Notes' },
      ],
      submitLabel: 'Save Token',
      onSubmit: async (data, ov) => {
        const type = data.token_type;
        const body = { code: data.code, token_type: type, issued_to: data.issued_to || undefined, notes: data.notes || undefined };
        if (type === 'Milk') body.liters = Number(data.liters);
        else { body.qty = Number(data.qty); if (data.product_id) body.product_id = Number(data.product_id); else body.item_name = data.item_name; }
        const res = await apiPost('/pos/tokens/manual', body);
        ov.remove(); toast(`Token saved: ${res.code}`); loadTokens();
      }
    });
    // Show only the fields that apply to the chosen type.
    const rowOf = (name) => overlay.querySelector(`[name="${name}"]`).closest('.form-row');
    const sync = () => {
      const milk = overlay.querySelector('[name="token_type"]').value === 'Milk';
      ['liters'].forEach(n => rowOf(n).classList.toggle('hidden', !milk));
      ['product_id', 'item_name', 'qty'].forEach(n => rowOf(n).classList.toggle('hidden', milk));
    };
    overlay.querySelector('[name="token_type"]').addEventListener('change', sync);
    sync();
  });

  // ---------- Product management ----------
  async function loadProductManagement() {
    const all = await apiGet('/products?status=All');
    const milkAvailForTable = await apiGet('/pos/milk-availability').catch(() => null);
    const rows = document.getElementById('productMgmtRows');
    rows.innerHTML = all.length ? all.map(p => {
      let stockCell = p.track_stock ? p.stock_qty : '—';
      if (p.category === 'Milk') {
        // "Stock Quantity" is intentionally unused for Milk (see the Edit
        // form) — the real, live number comes from Milk Recording +
        // Milk Network collections instead, shown here so this table
        // doesn't look like it's reporting zero/no stock.
        stockCell = milkAvailForTable ? `${fmtLiters(milkAvailForTable.remaining)} today (live)` : '—';
      }
      return `<tr>
        <td>${p.name}</td><td>${p.category}</td><td>${p.unit}</td><td>${fmtMoney(p.price)}</td>
        <td>${p.b2b_price > 0 ? fmtMoney(p.b2b_price) : '—'}</td>
        <td>${stockCell}</td>
        <td><span class="pill ${p.status === 'Active' ? 'green' : 'gray'}">${p.status}</span></td>
        <td>
          <button class="small editProductBtn" data-id="${p.id}">Edit</button>
          ${p.status === 'Active'
            ? `<button class="small danger discontinueBtn" data-id="${p.id}">Discontinue</button>`
            : `<button class="small reactivateBtn" data-id="${p.id}">Reactivate</button>
               <button class="small danger permanentDeleteBtn" data-id="${p.id}" data-name="${p.name}">Delete Permanently</button>`}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="8"><div class="empty-state">No products yet.</div></td></tr>`;

    rows.querySelectorAll('.editProductBtn').forEach(b => b.addEventListener('click', () => editProduct(all.find(p => p.id === Number(b.dataset.id)))));
    rows.querySelectorAll('.discontinueBtn').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Discontinue this product? It will no longer show up at the till.')) {
        await apiDelete(`/products/${b.dataset.id}`); toast('Product discontinued'); loadProductManagement(); refreshProducts();
      }
    }));
    rows.querySelectorAll('.reactivateBtn').forEach(b => b.addEventListener('click', async () => {
      await apiPut(`/products/${b.dataset.id}`, { status: 'Active' }); toast('Product reactivated'); loadProductManagement(); refreshProducts();
    }));
    rows.querySelectorAll('.permanentDeleteBtn').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`Permanently delete "${b.dataset.name}"? This cannot be undone. (Only allowed if it has no past sales — otherwise this will be blocked automatically.)`)) return;
      try {
        await apiDelete(`/products/${b.dataset.id}/permanent`);
        toast('Product permanently deleted'); loadProductManagement(); refreshProducts();
      } catch (err) { toast(err.message, true); }
    }));
  }

  function productFields(p = {}) {
    const isToken = p.category === 'Milk Token';
    return [
      { name: 'name', label: 'Product Name', required: true, value: p.name },
      { name: 'category', label: 'Category', type: 'select', value: p.category || 'Dairy Product',
        options: ['Milk', 'Milk Token', 'Dairy Product', 'Feed', 'Medicine', 'Other'].map(c => ({ value: c, label: c })) },
      { name: 'unit', label: 'Unit', type: 'select', value: p.unit || 'piece',
        options: ['litre', 'kg', 'piece', 'bottle', 'dose', 'bag', 'token'].map(u => ({ value: u, label: u })) },
      { name: 'price', label: 'Price (₹)', type: 'number', step: '0.01', required: true, value: p.price ?? 0 },
      { name: 'b2b_price', label: 'B2B Price (₹) — optional, for business customers', type: 'number', step: '0.01', value: p.b2b_price ?? '' },
      { name: 'stock_qty', label: 'Stock Quantity (ignored for Milk / Milk Token)', type: 'number', step: '0.1', value: p.stock_qty ?? 0 },
      { name: 'token_liters', label: 'Token Size in Liters (0.25 / 0.5 / 1 — only for Milk Token)', type: 'number', step: '0.01', value: p.token_liters ?? (isToken ? '' : '') },
    ];
  }

  function editProduct(p) {
    const overlay = openModal({
      title: 'Edit Product', fields: productFields(p), submitLabel: 'Save Changes',
      extraHtml: `<div style="margin-top:4px; display:flex; gap:8px;">
        <button type="button" id="deleteProductInModalBtn" class="small danger">${p.status === 'Active' ? 'Discontinue Product' : 'Reactivate Product'}</button>
        ${p.status !== 'Active' ? `<button type="button" id="permanentDeleteInModalBtn" class="small danger">Delete Permanently</button>` : ''}
      </div>`,
      onSubmit: async (data, ov) => {
        await apiPut(`/products/${p.id}`, {
          ...data, price: Number(data.price), b2b_price: data.b2b_price ? Number(data.b2b_price) : null, stock_qty: Number(data.stock_qty),
          token_liters: data.token_liters ? Number(data.token_liters) : null,
        });
        ov.remove(); toast('Product updated'); loadProductManagement(); refreshProducts();
      }
    });
    overlay.querySelector('#deleteProductInModalBtn').addEventListener('click', async () => {
      if (p.status === 'Active') {
        if (!confirm('Discontinue this product? It will no longer show up at the till, but past sales referencing it are kept intact.')) return;
        await apiDelete(`/products/${p.id}`);
        toast('Product discontinued');
      } else {
        await apiPut(`/products/${p.id}`, { status: 'Active' });
        toast('Product reactivated');
      }
      overlay.remove(); loadProductManagement(); refreshProducts();
    });
    const permBtn = overlay.querySelector('#permanentDeleteInModalBtn');
    if (permBtn) {
      permBtn.addEventListener('click', async () => {
        if (!confirm(`Permanently delete "${p.name}"? This cannot be undone. (Only allowed if it has no past sales — otherwise this will be blocked automatically.)`)) return;
        try {
          await apiDelete(`/products/${p.id}/permanent`);
          overlay.remove(); toast('Product permanently deleted'); loadProductManagement(); refreshProducts();
        } catch (err) { toast(err.message, true); }
      });
    }
  }

  document.getElementById('addProductBtn').addEventListener('click', () => {
    openModal({
      title: 'Add Product', fields: productFields(), submitLabel: 'Add Product',
      onSubmit: async (data, overlay) => {
        await apiPost('/products', {
          ...data, price: Number(data.price), b2b_price: data.b2b_price ? Number(data.b2b_price) : null, stock_qty: Number(data.stock_qty),
          token_liters: data.token_liters ? Number(data.token_liters) : null,
        });
        overlay.remove(); toast('Product added'); loadProductManagement(); refreshProducts();
      }
    });
  });

  // Refresh the in-memory catalog used by the New Sale product grid after add/edit/discontinue
  async function refreshProducts() {
    const fresh = await apiGet('/products');
    products.length = 0;
    products.push(...fresh);
    renderGrid();
  }

  renderGrid();
  renderCart();
}
