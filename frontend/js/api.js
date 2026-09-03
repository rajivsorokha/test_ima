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
const API_BASE = resolveApiBase() + '/api';

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
function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

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
      <p>Sale Receipt #${sale.id}</p>
    </div>
    <div class="meta">
      Date: ${fmtDate(sale.date)}<br />
      Customer: ${sale.customer_name || 'Walk-in'}${sale.customer_phone ? ' · ' + sale.customer_phone : ''}<br />
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

function openReceipt(sale) {
  const win = window.open('', '_blank', 'width=480,height=720');
  if (!win) { toast('Please allow pop-ups to view the printable bill', true); return; }
  win.document.write(buildReceiptHtml(sale));
  win.document.close();
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
  window.open(url, '_blank');
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
