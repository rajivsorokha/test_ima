// Figure out where the API actually lives:
//  - Normal web use (opened via http/https at a real address, e.g.
//    http://<server-ip>:4000/) -> use that same origin, so it works correctly
//    from any computer/device, not just the machine the server happens to run on.
//  - Tauri desktop shell -> Tauri's own webview serves the frontend from a
//    virtual "tauri.localhost" address that LOOKS like a normal http(s) URL
//    but isn't where the backend lives, so that case must be special-cased —
//    the real backend is a separate local process on a fixed port.
//  - window.__API_BASE__ can still be set manually to override either case.
function resolveApiBase() {
  if (window.__API_BASE__) return window.__API_BASE__;
  const isTauriShell =
    window.location.hostname === 'tauri.localhost' ||
    !!window.__TAURI_INTERNALS__ ||
    !!window.__TAURI__;
  if (isTauriShell) return 'http://localhost:4000';
  const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  return isWebProtocol ? window.location.origin : 'http://localhost:4000';
}
let API_BASE = resolveApiBase() + '/api';

// Multi-computer (LAN) mode: if this computer is configured as a
// "Client" (Settings -> Network Setup), point every API call at the
// Server computer's IP instead of this machine's own localhost. Runs
// once at startup; by the time any real API call happens (after the
// startup health-check screen finishes, or the login form is submitted)
// this has always already resolved, since it's just a fast local IPC
// call to the Tauri backend, not a network request.
(async function applyNetworkConfig() {
  if (!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)) return;
  try {
    const config = await window.__TAURI__.core.invoke('get_network_config');
    if (config && config.mode === 'client' && config.server_ip) {
      API_BASE = `http://${config.server_ip}:4000/api`;
    }
  } catch (err) {
    // Not fatal — just stays on the default (this machine as its own server).
  }
})();

const ROLE_LABELS = { admin: 'Owner/Admin', manager: 'Manager', accountant: 'Accountant', salesman: 'Salesman' };
function roleLabel(role) { return ROLE_LABELS[role] || role; }

function getAuthToken() { return localStorage.getItem('ild_token') || ''; }
function setAuthToken(token) { if (token) localStorage.setItem('ild_token', token); else localStorage.removeItem('ild_token'); }
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('ild_user') || 'null'); } catch { return null; }
}
function setCurrentUser(user) { if (user) localStorage.setItem('ild_user', JSON.stringify(user)); else localStorage.removeItem('ild_user'); }

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (networkErr) {
    // fetch() itself throwing (not an HTTP error response) means the browser
    // couldn't reach the server at all — wrong address, backend not running,
    // or blocked by a firewall. Give a message that actually helps diagnose it.
    throw new Error(`Couldn't reach the server at ${API_BASE}. Make sure the app's backend is running and reachable from this device.`);
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : await res.text();

  // A 401 on the login attempt itself is just "wrong username/password" —
  // show that real reason, don't treat it as an expired session.
  if (res.status === 401 && path !== '/auth/login') {
    setAuthToken(null); setCurrentUser(null);
    if (window.showLogin) window.showLogin();
    throw new Error('Session expired — please log in again.');
  }

  if (!res.ok) throw new Error((body && body.error) || 'Request failed');
  return body;
}

const apiGet = (path) => api(path);
const apiPost = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
const apiPut = (path, data) => api(path, { method: 'PUT', body: JSON.stringify(data || {}) });
const apiDelete = (path) => api(path, { method: 'DELETE' });

function fmtMoney(n) {
  const v = Number(n || 0);
  return (v < 0 ? '-₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtLiters(n) { return `${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} L`; }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
// Returns "YYYY-MM-DD" using the browser's LOCAL calendar date, not UTC.
// toISOString() converts to UTC first, which silently shifts the date
// during early-morning hours for any timezone ahead of UTC — India
// (UTC+5:30) loses this between midnight and 5:30 AM, which is exactly
// when morning milk collection happens. That mismatch was making
// morning-logged collections file under "yesterday", invisible to
// same-day lookups elsewhere in the app (e.g. POS's Fresh Milk stock).
function localDateISO(date) {
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function todayISO() { return localDateISO(); }
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return localDateISO(d); }

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function pillClass(status) {
  const s = (status || '').toLowerCase();
  if (['active', 'resolved', 'done', 'paid', 'approved'].includes(s)) return 'green';
  if (['in progress', 'dry', 'pending', 'issued', 'unpaid', 'open leave'].includes(s)) return 'amber';
  if (['overdue', 'open', 'urgent', 'rejected', 'terminated', 'void'].includes(s)) return 'red';
  return 'gray';
}

// Escapes text before it is placed inside HTML (names, notes, etc.).
function escHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Dependency-free SVG line/area chart. points: [{label, value}]
function drawLineChart(container, points, { height = 240, valueFormatter = (v) => v } = {}) {
  const width = container.clientWidth || 600;
  const padL = 46, padR = 16, padT = 16, padB = 28;
  const w = Math.max(width, 260), h = height;
  const values = points.map(p => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const x = (i) => padL + stepX * i;
  const y = (v) => padT + plotH - ((v - min) / range) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const gridLines = 4;
  let gridSvg = '';
  for (let i = 0; i <= gridLines; i++) {
    const gy = padT + (plotH / gridLines) * i;
    const val = max - (range / gridLines) * i;
    gridSvg += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${w - padR}" y2="${gy.toFixed(1)}" stroke="#e7e3d8" stroke-width="1" />`;
    gridSvg += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" font-size="10" fill="#767a6f" text-anchor="end">${valueFormatter(val)}</text>`;
  }

  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#2d5233" />`).join('');
  const labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="10.5" fill="#767a6f" text-anchor="middle">${p.label}</text>`).join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="overflow:visible;">
      ${gridSvg}
      <path d="${areaPath}" fill="rgba(45,82,51,0.08)" stroke="none" />
      <path d="${linePath}" fill="none" stroke="#2d5233" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      ${dots}
      ${labels}
    </svg>`;
}

// ---------- Bill / receipt generation ----------
function buildReceiptHtml(sale) {
  const logoUrl = new URL('assets/logo.png', window.location.href).href;
  const itemsRows = (sale.items || []).map(i => `
    <tr><td>${i.product_name}</td><td style="text-align:center;">${i.qty}</td>
    <td style="text-align:right;">${fmtMoney(i.unit_price)}</td><td style="text-align:right;">${fmtMoney(i.subtotal)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt #${sale.id} — Ima Langnubi Dairy</title>
  <style>
    body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color: #23281f; max-width: 420px; margin: 0 auto; }
    .head { text-align: center; margin-bottom: 16px; }
    .head img { width: 70px; margin-bottom: 6px; }
    .head h1 { font-size: 17px; margin: 0; color: #178a3f; }
    .head p { font-size: 11px; color: #767a6f; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 14px 0; }
    th, td { padding: 6px 2px; border-bottom: 1px solid #e7e3d8; text-align: left; }
    .totals div { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
    .totals .grand { font-weight: 700; font-size: 16px; border-top: 1px solid #23281f; margin-top: 6px; padding-top: 8px; }
    .meta { font-size: 11.5px; color: #767a6f; margin-bottom: 6px; line-height: 1.5; }
    .no-print button { font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px solid #178a3f; background: #178a3f; color: #fff; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style></head><body>
    <div class="head">
      <img src="${logoUrl}" alt="Ima Langnubi Dairy" />
      <h1>Ima Langnubi Dairy</h1>
      <p>Thangmeiband Sinam Leikai, Imphal, Manipur</p>
      <p>${sale.sale_channel === 'B2B' ? 'B2B Invoice' : 'Sale Receipt'} #${sale.id}</p>
    </div>
    <div class="meta">
      Date: ${fmtDate(sale.date)}<br />
      ${sale.business_name ? `Business: <b>${escHtml(sale.business_name)}</b>${sale.gstin ? ' · GSTIN: ' + escHtml(sale.gstin) : ''}<br />` : ''}Customer: ${sale.customer_name || 'Walk-in'}${sale.customer_phone ? ' · ' + sale.customer_phone : ''}<br />
      Channel: ${sale.sale_channel} · Payment: ${sale.payment_method}
    </div>
    <table>
      <thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${fmtMoney(sale.subtotal)}</span></div>
      ${sale.delivery_charge ? `<div><span>Delivery</span><span>${fmtMoney(sale.delivery_charge)}</span></div>` : ''}
      <div class="grand"><span>Total</span><span>${fmtMoney(sale.total)}</span></div>
    </div>
    <p style="text-align:center; font-size:11px; color:#767a6f; margin-top:20px;">Thank you for your business!</p>
    <div class="no-print" style="text-align:center; margin-top:18px;"><button onclick="window.print()">Print / Save as PDF</button></div>
  </body></html>`;
}

function isTauriRuntime() {
  return !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

// Opens a URL properly regardless of environment: inside the Tauri app,
// window.open() for an external link is unreliable — WebView2 doesn't
// consistently hand it off to the system browser, and this can differ
// across WebView2 versions on different PCs (which is exactly why this
// worked on one machine and not another). Route it through the Rust
// `open_url` command instead, which uses the OS's own "open" mechanism.
// Falls back to window.open() when running as a plain web page (no Tauri).
function openExternalUrl(url) {
  if (isTauriRuntime() && window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    window.__TAURI__.core.invoke('open_url', { url }).catch((err) => {
      toast('Could not open link: ' + err, true);
    });
  } else {
    window.open(url, '_blank');
  }
}

// Prints a receipt WITHOUT relying on window.open() creating a real
// popup window — that's the other place popups are unreliable inside a
// Tauri webview (same root cause as the WhatsApp link issue). Instead
// this renders the receipt into a hidden iframe inside the current page
// and prints that iframe directly, which stays within the single Tauri
// window and works consistently.
function printHtmlContent(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '480px';
  iframe.style.height = '720px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (err) {
      toast("Couldn't open the print dialog: " + err.message, true);
    }
  };
  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  window.addEventListener('afterprint', cleanup, { once: true });
  // Fallback cleanup in case afterprint never fires (e.g. dialog cancelled
  // in a way that doesn't trigger it on some WebView2 versions).
  setTimeout(cleanup, 30000);

  iframe.srcdoc = html;
}

function openReceipt(sale) {
  printHtmlContent(buildReceiptHtml(sale));
}

function whatsappReceiptText(sale) {
  const lines = [
    `*Ima Langnubi Dairy* — Receipt #${sale.id}`,
    `Thangmeiband Sinam Leikai, Imphal, Manipur`,
    `Date: ${fmtDate(sale.date)}`,
    sale.customer_name ? `Customer: ${sale.customer_name}` : '',
    '',
    ...(sale.items || []).map(i => `${i.product_name} x${i.qty} — ${fmtMoney(i.subtotal)}`),
    '',
    sale.delivery_charge ? `Delivery: ${fmtMoney(sale.delivery_charge)}` : '',
    `*Total: ${fmtMoney(sale.total)}*`,
    '',
    'Thank you for your business!'
  ].filter(Boolean);
  return lines.join('\n');
}

function sendReceiptOnWhatsApp(sale) {
  let phone = (sale.customer_phone || '').replace(/[^0-9]/g, '');
  if (!phone) {
    const entered = prompt('No phone number on this sale — enter one to send the bill via WhatsApp (with country code):');
    if (!entered) return;
    phone = entered.replace(/[^0-9]/g, '');
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(whatsappReceiptText(sale))}`;
  openExternalUrl(url);
}

// ---------- Loan repayment receipt ----------
function buildLoanReceiptHtml(loan, repayment) {
  const typeLabel = { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[loan.borrower_type] || loan.borrower_type;
  const termLabel = loan.kind === 'long' ? 'Long term' : 'Short term';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Repayment Receipt — Ima Langnubi Dairy</title>
  <style>
    body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color: #23281f; max-width: 420px; margin: 0 auto; }
    .head { text-align: center; margin-bottom: 16px; }
    .head h1 { font-size: 17px; margin: 0; color: #178a3f; }
    .head p { font-size: 11px; color: #767a6f; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 14px 0; }
    td { padding: 5px 2px; border-bottom: 1px solid #e7e3d8; }
    .totals .grand { font-weight: 700; font-size: 15px; border-top: 1px solid #23281f; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; }
    .no-print button { font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px solid #178a3f; background: #178a3f; color: #fff; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style></head><body>
    <div class="head">
      <h1>Ima Langnubi Dairy</h1>
      <p>Thangmeiband Sinam Leikai, Imphal, Manipur</p>
      <p>Loan Repayment Receipt</p>
    </div>
    <table>
      <tr><td>Date</td><td style="text-align:right;">${fmtDate(repayment.date)}</td></tr>
      <tr><td>Borrower</td><td style="text-align:right;">${loan.borrower_name} (${typeLabel})</td></tr>
      <tr><td>Loan #${loan.id}</td><td style="text-align:right;">${termLabel}</td></tr>
      <tr><td>Interest Accrued</td><td style="text-align:right;">${fmtMoney(repayment.interest_accrued || 0)}</td></tr>
      <tr><td>Source</td><td style="text-align:right;">${repayment.source === 'invoice' ? 'Auto (milk invoice)' : 'Manual'}</td></tr>
    </table>
    <div class="totals">
      <div class="grand"><span>Amount Paid</span><span>${fmtMoney(repayment.amount_paid)}</span></div>
      <div style="margin-top:8px; font-size:12px; color:#767a6f; display:flex; justify-content:space-between;"><span>Remaining Balance</span><span>${fmtMoney(loan.balance)}</span></div>
    </div>
    <p style="text-align:center; font-size:11px; color:#767a6f; margin-top:20px;">Thank you!</p>
    <div class="no-print" style="text-align:center; margin-top:18px;"><button onclick="window.print()">Print / Save as PDF</button></div>
  </body></html>`;
}

function openLoanReceipt(loan, repayment) {
  printHtmlContent(buildLoanReceiptHtml(loan, repayment));
}

function loanReceiptWhatsAppText(loan, repayment) {
  const typeLabel = { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[loan.borrower_type] || loan.borrower_type;
  const lines = [
    `*Ima Langnubi Dairy* — Loan Repayment Receipt`,
    `Thangmeiband Sinam Leikai, Imphal, Manipur`,
    `Date: ${fmtDate(repayment.date)}`,
    `Borrower: ${loan.borrower_name} (${typeLabel})`,
    `Loan #${loan.id} — ${loan.kind === 'long' ? 'Long term' : 'Short term'}`,
    '',
    ...(Number(repayment.interest_accrued) > 0 ? [`Interest charged: ${fmtMoney(repayment.interest_accrued)}`] : []),
    `*Amount Paid: ${fmtMoney(repayment.amount_paid)}*`,
    `Remaining Balance: ${fmtMoney(loan.balance)}`,
    '',
    'Thank you!'
  ];
  return lines.join('\n');
}

function sendLoanReceiptOnWhatsApp(loan, repayment, phoneHint) {
  let phone = (phoneHint || '').replace(/[^0-9]/g, '');
  if (!phone) {
    const entered = prompt('Enter a phone number to send this receipt via WhatsApp (with country code):');
    if (!entered) return;
    phone = entered.replace(/[^0-9]/g, '');
  }
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(loanReceiptWhatsAppText(loan, repayment))}`;
  openExternalUrl(url);
}

function openModal({ title, fields, submitLabel = 'Save', onSubmit, extraHtml = '' }) {
  const overlay = el(`<div class="modal-overlay"></div>`);
  const modal = el(`<div class="modal"><h2>${title}</h2><form id="modalForm"></form></div>`);
  const form = modal.querySelector('#modalForm');
  fields.forEach(f => {
    let inputHtml = '';
    if (f.type === 'select') {
      inputHtml = `<select name="${f.name}" ${f.required ? 'required' : ''}>` +
        f.options.map(o => `<option value="${o.value}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${o.label}</option>`).join('') +
        `</select>`;
    } else if (f.type === 'textarea') {
      inputHtml = `<textarea name="${f.name}" rows="3">${f.value || ''}</textarea>`;
    } else {
      inputHtml = `<input type="${f.type || 'text'}" name="${f.name}" value="${f.value ?? ''}" ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''} />`;
    }
    form.appendChild(el(`<div class="form-row"><label>${f.label}</label>${inputHtml}</div>`));
  });
  if (extraHtml) form.appendChild(el(`<div>${extraHtml}</div>`));
  const actions = el(`<div class="modal-actions">
    <button type="button" class="cancel">Cancel</button>
    <button type="submit" class="primary">${submitLabel}</button>
  </div>`);
  form.appendChild(actions);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  modal.querySelector('.cancel').addEventListener('click', () => overlay.remove());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await onSubmit(data, overlay);
    } catch (err) {
      toast(err.message, true);
    }
  });
  return overlay;
}

// Downloads a file via fetch+blob rather than window.open(). Same reason
// as openExternalUrl/openReceipt above: a Tauri webview's handling of
// window.open() for a fetch/download isn't reliably consistent, so this
// avoids that whole class of problem for any authenticated download
// (reports, backups, statements).
async function downloadWithAuth(url, filename, successMessage) {
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
    if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || 'Download failed'); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(successMessage || 'Downloaded');
  } catch (err) {
    toast(err.message, true);
  }
}
