async function renderSettings(view) {
  const health = await apiGet('/health').catch(() => ({ farm: 'Ima Langnubi Dairy', address: 'Thangmeiband Sinam Leikai, Imphal, Manipur' }));
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
      <h2>License</h2>
      <p class="desc">This software is licensed to ${health.farm} by Xeoscape.</p>
      <button id="viewLicenseBtn2">View License Agreement</button>
    </div>
  `;

  document.getElementById('viewLicenseBtn2').addEventListener('click', () => openLicenseModal());

  document.getElementById('downloadBackupBtn').addEventListener('click', () => {
    downloadWithAuth(`${API_BASE}/backup/download`, 'ima-langnubi-dairy-backup.db');
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
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

async function downloadWithAuth(url, filename) {
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
    toast('Backup downloaded');
  } catch (err) {
    toast(err.message, true);
  }
}
