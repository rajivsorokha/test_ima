const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const db = require('../db/db');
const { localDateISO } = require('../utils/helpers');

// Tables to include in the daily CSV backup. `users` is included but with
// password_hash stripped out — a plain-text CSV sitting on disk is not
// somewhere a password hash should ever end up, even hashed.
const TABLES = [
  'farms', 'cows', 'milk_records', 'inventory_tanks', 'tank_logs',
  'milk_collections', 'milk_quality_tests', 'financial_transactions',
  'health_events', 'employees', 'leaves', 'tasks', 'products',
  'pos_sales', 'pos_sale_items', 'tokens', 'loans', 'loan_repayments',
  'invoices', 'users',
];
const REDACT_COLUMNS = { users: ['password_hash'] };

function getBackupRootDir() {
  return path.join(path.dirname(db.DB_PATH), 'csv-backups');
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

function getBackupTime() {
  return getSetting('csv_backup_time', '02:00'); // "HH:MM", 24h, local time
}
function setBackupTime(time) {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Time must be in HH:MM format');
  setSetting('csv_backup_time', time);
}
function isBackupEnabled() {
  return getSetting('csv_backup_enabled', '1') !== '0';
}
function setBackupEnabled(enabled) {
  setSetting('csv_backup_enabled', enabled ? '1' : '0');
}

// Runs the export right now, regardless of schedule — used both by the
// scheduler when it's time, and by the "Run Backup Now" button.
function runCsvBackup() {
  const dateStamp = localDateISO();
  const dir = path.join(getBackupRootDir(), dateStamp);
  fs.mkdirSync(dir, { recursive: true });

  const results = [];
  for (const table of TABLES) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      const redact = REDACT_COLUMNS[table] || [];
      const cleaned = rows.map((r) => {
        const copy = { ...r };
        redact.forEach((col) => delete copy[col]);
        return copy;
      });
      const csv = cleaned.length ? new Parser().parse(cleaned) : '';
      fs.writeFileSync(path.join(dir, `${table}.csv`), csv);
      results.push({ table, rows: cleaned.length, ok: true });
    } catch (err) {
      results.push({ table, ok: false, error: err.message });
    }
  }
  setSetting('csv_backup_last_run_date', dateStamp);
  setSetting('csv_backup_last_run_at', new Date().toISOString());
  return { date: dateStamp, dir, results };
}

function getLastRun() {
  return {
    last_run_date: getSetting('csv_backup_last_run_date', null),
    last_run_at: getSetting('csv_backup_last_run_at', null),
  };
}

function listBackups() {
  const root = getBackupRootDir();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => fs.statSync(path.join(root, name)).isDirectory())
    .sort()
    .reverse()
    .map((date) => {
      const files = fs.readdirSync(path.join(root, date)).filter((f) => f.endsWith('.csv'));
      return { date, files };
    });
}

// Checked once a minute. Fires the backup once, the first minute the
// clock matches the configured time, on any given day — the
// last-run-date guard stops it firing again for the rest of that same
// minute-window or on server restarts later the same day.
let schedulerHandle = null;
function startScheduler() {
  if (schedulerHandle) return; // already running
  schedulerHandle = setInterval(() => {
    try {
      if (!isBackupEnabled()) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = localDateISO(now);
      if (hhmm === getBackupTime() && getSetting('csv_backup_last_run_date', null) !== today) {
        console.log(`[csv-backup] Running scheduled backup for ${today}...`);
        runCsvBackup();
      }
    } catch (err) {
      console.error('[csv-backup] Scheduler tick failed:', err.message);
    }
  }, 30 * 1000);
}

module.exports = {
  getBackupRootDir, getBackupTime, setBackupTime, isBackupEnabled, setBackupEnabled,
  runCsvBackup, getLastRun, listBackups, startScheduler,
};
