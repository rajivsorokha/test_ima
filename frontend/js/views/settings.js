async function renderSettings(view) {
  const health = await apiGet('/health').catch(() => ({ farm: 'Ima Langnubi Dairy', address: 'Thangmeiband Sinam Leikai, Imphal, Manipur' }));
  const rules = await apiGet('/farms/delivery-rules').catch(() => null);
  let info = null;
  try { info = await apiGet('/backup/info'); } catch (e) { /* ignore */ }

  view.innerHTML = `
    <div class="page-header">
      <div><h1>Settings</h1><p class="subtitle">Company details, licensing, and data backup.</p></div>
    </div>

    <div class="card settings-section">
      <h2>Company Info</h2>
      <p class="desc">Shown on receipts, reports, and the login screen.</p>
      <table>
        <tbody>
          <tr><td style="width:140px; color:var(--muted);">Name</td><td><b>${health.farm}</b></td></tr>
          <tr><td style="color:var(--muted);">Address</td><td>${health.address}</td></tr>
        </tbody>
      </table>
      <p class="desc" style="margin-top:10px;">To change these, edit <code>FARM_NAME</code> / <code>FARM_ADDRESS</code> in <code>backend/.env</code> and restart the app.</p>

    ${rules ? `</div>
    <div class="card settings-section">
      <h2>Delivery Rate Table</h2>
      <p class="desc">Applied automatically in Milk Network → Milk Collection based on each farm's distance band, delivery time, season, and quantity. The late deduction is baked into the rate itself and shown on each farm's invoice. Edit any number below and press Save — no code changes or rebuild needed.</p>
      <table>
        <thead><tr><th>Distance</th><th>Quantity</th><th>Normal</th><th>1st Late</th><th>2nd Late</th><th>3rd Late</th></tr></thead>
        <tbody>
          <tr><td>Within 10 km</td><td>Under 20L</td>${rules.rate_table.within_10km.under20.map((r, i) => `<td><input type="number" step="0.5" class="rateInput" data-band="within_10km" data-qty="under20" data-i="${i}" value="${r}"></td>`).join('')}</tr>
          <tr><td>Within 10 km</td><td>20L &amp; above</td>${rules.rate_table.within_10km.over20.map((r, i) => `<td><input type="number" step="0.5" class="rateInput" data-band="within_10km" data-qty="over20" data-i="${i}" value="${r}"></td>`).join('')}</tr>
          <tr><td>10 km &amp; above</td><td>Under 20L</td>${rules.rate_table['10km_plus'].under20.map((r, i) => `<td><input type="number" step="0.5" class="rateInput" data-band="10km_plus" data-qty="under20" data-i="${i}" value="${r}"></td>`).join('')}</tr>
          <tr><td>10 km &amp; above</td><td>20L &amp; above</td>${rules.rate_table['10km_plus'].over20.map((r, i) => `<td><input type="number" step="0.5" class="rateInput" data-band="10km_plus" data-qty="over20" data-i="${i}" value="${r}"></td>`).join('')}</tr>
        </tbody>
      </table>
      <table style="margin-top:10px;">
        <thead><tr><th>Season</th><th>Shift</th><th>Normal until</th><th>1st Late until</th><th>2nd Late until</th></tr></thead>
        <tbody>
          <tr><td>Winter (Oct–Mar)</td><td>Morning</td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="AM" data-field="normal" value="${rules.seasons.winter.cutoffs.AM.normal}"></td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="AM" data-field="late1" value="${rules.seasons.winter.cutoffs.AM.late1}"></td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="AM" data-field="late2" value="${rules.seasons.winter.cutoffs.AM.late2}"></td></tr>
          <tr><td>Winter (Oct–Mar)</td><td>Evening</td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="PM" data-field="normal" value="${rules.seasons.winter.cutoffs.PM.normal}"></td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="PM" data-field="late1" value="${rules.seasons.winter.cutoffs.PM.late1}"></td>
            <td><input type="time" class="timeInput" data-season="winter" data-shift="PM" data-field="late2" value="${rules.seasons.winter.cutoffs.PM.late2}"></td></tr>
          <tr><td>Summer (Apr–Sep)</td><td>Morning</td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="AM" data-field="normal" value="${rules.seasons.summer.cutoffs.AM.normal}"></td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="AM" data-field="late1" value="${rules.seasons.summer.cutoffs.AM.late1}"></td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="AM" data-field="late2" value="${rules.seasons.summer.cutoffs.AM.late2}"></td></tr>
          <tr><td>Summer (Apr–Sep)</td><td>Evening</td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="PM" data-field="normal" value="${rules.seasons.summer.cutoffs.PM.normal}"></td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="PM" data-field="late1" value="${rules.seasons.summer.cutoffs.PM.late1}"></td>
            <td><input type="time" class="timeInput" data-season="summer" data-shift="PM" data-field="late2" value="${rules.seasons.summer.cutoffs.PM.late2}"></td></tr>
        </tbody>
      </table>
      <button class="primary" id="saveRatesBtn" style="margin-top:12px;">Save Rate Table</button>` : ''}
    </div>

    <div class="card settings-section" id="qualityThresholdsCard">
      <h2>Milk Quality Thresholds</h2>
      <p class="desc">Quality Score = Lactometer + (Thermometer − 20) / 1.5. Edit the cutoffs or labels below.</p>
      <div id="qualityThresholdsBody">Loading...</div>
    </div>

    <div class="card settings-section" id="networkSetupCard">
      <h2>Network Setup — Share Data Across Computers</h2>
      <p class="desc">
        Let 2–3 computers on the same WiFi/network share one set of data, instead of each having its own separate
        database. Pick <b>one</b> computer to be the Server (it holds the real data) — every other computer connects
        to it as a Client.
      </p>
      <div id="networkSetupBody">Loading...</div>
    </div>

    <div class="card settings-section">
      <h2>Database Backup</h2>
      <p class="desc">Download a full snapshot of your data (cows, milk records, sales, finances, everything) as a single file, or restore from a previous backup.</p>
      <div style="display:flex; gap:20px; margin-bottom:16px; font-size:12.5px; color:var(--muted);">
        <div>Database size: <b id="dbSize">${info ? formatBytes(info.size_bytes) : '—'}</b></div>
        <div>Last modified: <b id="dbModified">${info ? fmtDate(info.last_modified) : '—'}</b></div>
      </div>
      <button class="primary" id="downloadBackupBtn">⬇ Download Backup</button>

      <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:18px;">
        <h2 style="font-size:15px; margin-bottom:8px;">Restore from Backup</h2>
        <div class="backup-warning">
          ⚠ Restoring replaces <b>all current data</b> with the contents of the backup file, and the app must be
          restarted afterward for the restored data to load. This can't be undone — download a fresh backup first if unsure.
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="file" id="restoreFile" accept=".db" />
          <button class="danger" id="restoreBtn">Restore</button>
        </div>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Automatic Daily CSV Backup</h2>
      <p class="desc">Every table (farms, collections, sales, finances, loans, etc.) is exported as its own CSV file into a dated folder, automatically, once a day at the time set below.</p>
      <div class="form-row" style="max-width:220px;"><label>Backup Time</label><input type="time" id="csvBackupTime"></div>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin:10px 0;">
        <input type="checkbox" id="csvBackupEnabled" style="width:auto;"> Enabled
      </label>
      <div style="display:flex; gap:10px; align-items:center; margin-top:8px;">
        <button class="primary" id="saveCsvScheduleBtn">Save Schedule</button>
        <button id="runCsvNowBtn">Run Backup Now</button>
      </div>
      <p class="desc" id="csvLastRun" style="margin-top:10px;"></p>
      <div style="margin-top:16px;">
        <h2 style="font-size:14px; margin-bottom:8px;">Recent Backups</h2>
        <div id="csvHistoryList"></div>
      </div>
    </div>

    <div class="card settings-section">
      <h2>Email Backup</h2>
      <p class="desc">Emails a compressed copy of the whole database (a safe off-site copy if this computer is lost or damaged) every day at the same time as the daily backup above. For Gmail, use an <b>App Password</b> (Google Account &rarr; Security &rarr; 2-Step Verification &rarr; App passwords) &mdash; not your normal password.</p>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin:10px 0;">
        <input type="checkbox" id="emailBackupEnabled" style="width:auto;"> Send a backup email every day
      </label>
      <div class="form-row"><label>Send backups to (separate several with commas)</label><input type="text" id="emailTo" placeholder="owner@example.com"></div>
      <div class="form-grid">
        <div class="form-row"><label>Sender email account</label><input type="email" id="emailUser" placeholder="yourdairy@gmail.com" autocomplete="off"></div>
        <div class="form-row"><label>Password / App Password</label><input type="password" id="emailPass" placeholder="" autocomplete="new-password"></div>
      </div>
      <div class="form-grid">
        <div class="form-row"><label>SMTP Server</label><input type="text" id="emailHost" placeholder="smtp.gmail.com"></div>
        <div class="form-row"><label>Port</label><input type="number" id="emailPort" placeholder="465"></div>
      </div>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin:6px 0;">
        <input type="checkbox" id="emailSecure" style="width:auto;"> Use SSL/TLS (tick for port 465; untick for port 587)
      </label>
      <div style="display:flex; gap:10px; align-items:center; margin-top:10px; flex-wrap:wrap;">
        <button class="primary" id="saveEmailBtn">Save</button>
        <button id="testEmailBtn">Send Test Email</button>
        <button id="sendEmailNowBtn">Email Backup Now</button>
      </div>
      <p class="desc" id="emailStatus" style="margin-top:10px;"></p>
    </div>

    <div class="card settings-section">
      <h2>License</h2>
      <p class="desc">This software is licensed to ${health.farm} by Xeoscape.</p>
      <button id="viewLicenseBtn2">View License Agreement</button>
    </div>
  `;

  document.getElementById('viewLicenseBtn2').addEventListener('click', () => openLicenseModal());

  document.getElementById('downloadBackupBtn').addEventListener('click', () => {
    downloadWithAuth(`${API_BASE}/backup/download`, 'ima-langnubi-dairy-backup.db', 'Backup downloaded');
  });

  document.getElementById('restoreBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    if (!file) return toast('Choose a .db backup file first', true);
    if (!confirm('This will overwrite ALL current data with this backup and require an app restart. Continue?')) return;
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Authorization': `Bearer ${getAuthToken()}` },
        body: buf,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Restore failed');
      toast(body.message || 'Database restored — please restart the app.');
    } catch (err) {
      toast(err.message, true);
    }
  });

  async function loadCsvSchedule() {
    const sched = await apiGet('/backup/csv-schedule');
    document.getElementById('csvBackupTime').value = sched.time;
    document.getElementById('csvBackupEnabled').checked = sched.enabled;
    document.getElementById('csvLastRun').textContent = sched.last_run_at
      ? `Last ran: ${fmtDate(sched.last_run_date)} (${new Date(sched.last_run_at).toLocaleTimeString()})`
      : 'Hasn\'t run yet.';
  }

  async function loadCsvHistory() {
    const history = await apiGet('/backup/csv-history');
    const list = document.getElementById('csvHistoryList');
    list.innerHTML = history.length ? history.slice(0, 10).map(h => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>${fmtDate(h.date)} — ${h.files.length} file${h.files.length === 1 ? '' : 's'}</span>
        <span>${h.files.map(f => `<a href="#" class="link csvDownloadLink" data-date="${h.date}" data-file="${f}" style="margin-left:8px;">${f.replace('.csv', '')}</a>`).join('')}</span>
      </div>`).join('') : `<div class="empty-state">No backups yet.</div>`;
    list.querySelectorAll('.csvDownloadLink').forEach(a => a.addEventListener('click', (e) => {
      e.preventDefault();
      downloadWithAuth(`${API_BASE}/backup/csv-download/${a.dataset.date}/${a.dataset.file}`, `${a.dataset.date}-${a.dataset.file}`);
    }));
  }

  document.getElementById('saveCsvScheduleBtn').addEventListener('click', async () => {
    try {
      await apiPut('/backup/csv-schedule', {
        time: document.getElementById('csvBackupTime').value,
        enabled: document.getElementById('csvBackupEnabled').checked,
      });
      toast('Backup schedule saved');
      loadCsvSchedule();
    } catch (err) { toast(err.message, true); }
  });

  document.getElementById('runCsvNowBtn').addEventListener('click', async () => {
    try {
      await apiPost('/backup/csv-run-now', {});
      toast('CSV backup completed');
      loadCsvSchedule(); loadCsvHistory();
    } catch (err) { toast(err.message, true); }
  });

  // ---------- Email backup ----------
  async function loadEmailSettings() {
    try {
      const c = await apiGet('/backup/email-settings');
      document.getElementById('emailBackupEnabled').checked = c.enabled;
      document.getElementById('emailTo').value = c.to || '';
      document.getElementById('emailUser').value = c.user || '';
      document.getElementById('emailPass').value = '';
      document.getElementById('emailPass').placeholder = c.has_password ? '•••••••• (saved — leave blank to keep)' : '';
      document.getElementById('emailHost').value = c.host || '';
      document.getElementById('emailPort').value = c.port || '';
      document.getElementById('emailSecure').checked = c.secure;
      document.getElementById('emailStatus').textContent = c.last_sent_at
        ? `Last attempt: ${new Date(c.last_sent_at).toLocaleString()} — ${c.last_status || ''}`
        : 'No backup email has been sent yet.';
    } catch (err) { /* settings page still works without it */ }
  }
  async function saveEmailSettings() {
    await apiPut('/backup/email-settings', {
      enabled: document.getElementById('emailBackupEnabled').checked,
      to: document.getElementById('emailTo').value,
      user: document.getElementById('emailUser').value,
      pass: document.getElementById('emailPass').value,
      host: document.getElementById('emailHost').value,
      port: document.getElementById('emailPort').value,
      secure: document.getElementById('emailSecure').checked,
    });
  }
  async function withBusy(btn, label, fn) {
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = original; loadEmailSettings(); }
  }
  document.getElementById('saveEmailBtn').addEventListener('click', (e) => withBusy(e.target, 'Saving...', async () => {
    await saveEmailSettings(); toast('Email backup settings saved');
  }));
  document.getElementById('testEmailBtn').addEventListener('click', (e) => withBusy(e.target, 'Sending...', async () => {
    await saveEmailSettings(); await apiPost('/backup/email-test', {}); toast('Test email sent — check the inbox');
  }));
  document.getElementById('sendEmailNowBtn').addEventListener('click', (e) => withBusy(e.target, 'Sending backup...', async () => {
    await saveEmailSettings(); const r = await apiPost('/backup/email-send-now', {});
    toast(`Backup emailed to ${r.sent_to}`);
  }));
  loadEmailSettings();

  if (rules) {
    document.getElementById('saveRatesBtn').addEventListener('click', async () => {
      const rateTable = { within_10km: { under20: [0, 0, 0, 0], over20: [0, 0, 0, 0] }, '10km_plus': { under20: [0, 0, 0, 0], over20: [0, 0, 0, 0] } };
      document.querySelectorAll('.rateInput').forEach((input) => {
        rateTable[input.dataset.band][input.dataset.qty][Number(input.dataset.i)] = Number(input.value);
      });
      const seasons = { winter: { cutoffs: { AM: {}, PM: {} } }, summer: { cutoffs: { AM: {}, PM: {} } } };
      document.querySelectorAll('.timeInput').forEach((input) => {
        seasons[input.dataset.season].cutoffs[input.dataset.shift][input.dataset.field] = input.value;
      });
      try {
        await apiPut('/farms/delivery-rules', { rate_table: rateTable, seasons });
        toast('Delivery rate table saved');
      } catch (err) { toast(err.message, true); }
    });
  }

  async function loadNetworkSetup() {
    const body = document.getElementById('networkSetupBody');
    if (!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke)) {
      body.innerHTML = `<p class="desc">Only available in the installed desktop app.</p>`;
      return;
    }
    const config = await window.__TAURI__.core.invoke('get_network_config');
    const health = await apiGet('/health').catch(() => null);

    body.innerHTML = `
      <div class="form-row">
        <label style="display:flex; align-items:center; gap:8px;"><input type="radio" name="netMode" value="server" ${config.mode !== 'client' ? 'checked' : ''} style="width:auto;"> This is the main computer (Server) — holds the real data</label>
      </div>
      <div class="form-row">
        <label style="display:flex; align-items:center; gap:8px;"><input type="radio" name="netMode" value="client" ${config.mode === 'client' ? 'checked' : ''} style="width:auto;"> Connect to another computer (Client)</label>
      </div>
      <div id="netModeDetail"></div>
      <button class="primary" id="saveNetworkBtn" style="margin-top:10px;">Save Network Setting</button>
      <p class="desc" id="netSaveNote" style="margin-top:8px;"></p>
    `;

    function renderDetail(mode) {
      const detail = document.getElementById('netModeDetail');
      if (mode === 'server') {
        const detected = health && health.local_ips ? health.local_ips : [];
        const current = config.preferred_ip || detected[0] || '';
        detail.innerHTML = `
          <div class="form-row" style="max-width:280px;"><label>Address to give Client computers</label>
            <input type="text" id="preferredIpInput" placeholder="e.g. 192.168.1.42" value="${current}"></div>
          <p class="desc" style="margin-top:2px;">
            ${detected.length
              ? `Auto-detected on this computer: ${detected.map(ip => `<a href="#" class="link useDetectedIp" data-ip="${ip}">${ip}</a>`).join(', ')}. Click one to use it, or type your own if you know a different address is correct (e.g. when this computer has more than one network adapter — WiFi and Ethernet both active — or a fixed/static address set on your router).`
              : `No address auto-detected yet — make sure this app is fully open, or type the address manually if you already know it (check with "ipconfig" in Command Prompt on Windows).`}
          </p>
          <p class="desc">Windows Firewall may ask permission the first time another computer connects — choose Allow (at least for Private networks). This works the same whether computers are on WiFi or connected by Ethernet cable through a switch/hub — what matters is that they're all on the same local network.</p>`;
        detail.querySelectorAll('.useDetectedIp').forEach(a => a.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('preferredIpInput').value = a.dataset.ip;
        }));
      } else {
        detail.innerHTML = `
          <div class="form-row" style="max-width:280px;"><label>Server's Address</label><input type="text" id="serverIpInput" placeholder="e.g. 192.168.1.42" value="${config.server_ip || ''}"></div>
          <button type="button" id="testConnBtn" class="small">Test Connection</button>
          <span id="testConnResult" style="margin-left:8px; font-size:12.5px;"></span>
        `;
        document.getElementById('testConnBtn').addEventListener('click', async () => {
          const ip = document.getElementById('serverIpInput').value.trim();
          const resultEl = document.getElementById('testConnResult');
          if (!ip) { resultEl.textContent = 'Enter an address first.'; resultEl.style.color = '#c0392b'; return; }
          resultEl.textContent = 'Testing...'; resultEl.style.color = 'var(--muted)';
          try {
            const res = await fetch(`http://${ip}:4000/api/health`, { cache: 'no-store' });
            if (!res.ok) throw new Error('bad response');
            const data = await res.json();
            resultEl.textContent = `Connected — reached "${data.farm}"`; resultEl.style.color = '#178a3f';
          } catch (err) {
            resultEl.textContent = 'Could not reach that address. Check the IP, that both computers are on the same network, and that the Server app is open.';
            resultEl.style.color = '#c0392b';
          }
        });
      }
    }
    renderDetail(config.mode === 'client' ? 'client' : 'server');
    document.querySelectorAll('input[name="netMode"]').forEach(r => r.addEventListener('change', (e) => renderDetail(e.target.value)));

    document.getElementById('saveNetworkBtn').addEventListener('click', async () => {
      const mode = document.querySelector('input[name="netMode"]:checked').value;
      const ipInput = document.getElementById('serverIpInput');
      const preferredInput = document.getElementById('preferredIpInput');
      const serverIp = mode === 'client' ? (ipInput ? ipInput.value.trim() : '') : '';
      const preferredIp = mode === 'server' ? (preferredInput ? preferredInput.value.trim() : '') : (config.preferred_ip || '');
      if (mode === 'client' && !serverIp) { toast('Enter the Server\'s address first', true); return; }
      try {
        await window.__TAURI__.core.invoke('save_network_config', { mode, serverIp, preferredIp });
        document.getElementById('netSaveNote').innerHTML = '<b>Saved.</b> Please fully close and reopen the app for this to take effect.';
        toast('Network setting saved — restart the app to apply it');
      } catch (err) { toast('Could not save: ' + err, true); }
    });
  }
  loadNetworkSetup();

  async function loadQualityThresholds() {
    const t = await apiGet('/quality-tests/thresholds').catch(() => null);
    const body = document.getElementById('qualityThresholdsBody');
    if (!t) { body.innerHTML = '<p class="desc">Could not load thresholds.</p>'; return; }
    body.innerHTML = `
      <table>
        <thead><tr><th>Grade</th><th>Label</th><th>Applies when score is...</th></tr></thead>
        <tbody>
          <tr><td>Low</td><td><input type="text" id="qLowLabel" value="${t.low_label}"></td><td>below <input type="number" step="0.1" id="qLowMax" value="${t.low_max}" style="width:70px;"></td></tr>
          <tr><td>Warning</td><td><input type="text" id="qWarnLabel" value="${t.warning_label}"></td><td><span id="qLowMaxEcho">${t.low_max}</span> up to below <input type="number" step="0.1" id="qWarnMax" value="${t.warning_max}" style="width:70px;"></td></tr>
          <tr><td>Good</td><td><input type="text" id="qGoodLabel" value="${t.good_label}"></td><td><span id="qWarnMaxEcho">${t.warning_max}</span> and above</td></tr>
        </tbody>
      </table>
      <button class="primary" id="saveQualityThresholdsBtn" style="margin-top:12px;">Save Thresholds</button>
    `;
    document.getElementById('qLowMax').addEventListener('input', (e) => { document.getElementById('qLowMaxEcho').textContent = e.target.value; });
    document.getElementById('qWarnMax').addEventListener('input', (e) => { document.getElementById('qWarnMaxEcho').textContent = e.target.value; });
    document.getElementById('saveQualityThresholdsBtn').addEventListener('click', async () => {
      try {
        await apiPut('/quality-tests/thresholds', {
          low_max: Number(document.getElementById('qLowMax').value),
          warning_max: Number(document.getElementById('qWarnMax').value),
          low_label: document.getElementById('qLowLabel').value,
          warning_label: document.getElementById('qWarnLabel').value,
          good_label: document.getElementById('qGoodLabel').value,
        });
        toast('Quality thresholds saved');
      } catch (err) { toast(err.message, true); }
    });
  }
  loadQualityThresholds();

  loadCsvSchedule();
  loadCsvHistory();
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}



