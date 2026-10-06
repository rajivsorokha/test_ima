const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const csvBackup = require('../lib/csvBackup');

// Starts the once-a-minute schedule check as soon as the server boots.
csvBackup.startScheduler();

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'ascii');

router.get('/csv-schedule', (req, res) => {
  res.json({
    enabled: csvBackup.isBackupEnabled(),
    time: csvBackup.getBackupTime(),
    ...csvBackup.getLastRun(),
  });
});

router.put('/csv-schedule', (req, res) => {
  const { enabled, time } = req.body;
  try {
    if (typeof enabled === 'boolean') csvBackup.setBackupEnabled(enabled);
    if (time) csvBackup.setBackupTime(time);
    res.json({ enabled: csvBackup.isBackupEnabled(), time: csvBackup.getBackupTime() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/csv-run-now', (req, res) => {
  try {
    const result = csvBackup.runCsvBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/csv-history', (req, res) => {
  res.json(csvBackup.listBackups());
});

// Streams a single CSV file back for download. Scoped strictly to the
// backup root directory and validated as a plain "YYYY-MM-DD/table.csv"
// shape so a crafted request can't be used to read arbitrary files off
// disk (path traversal).
router.get('/csv-download/:date/:file', (req, res) => {
  const { date, file } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[a-z_]+\.csv$/.test(file)) {
    return res.status(400).json({ error: 'Invalid backup file reference' });
  }
  const fullPath = path.join(csvBackup.getBackupRootDir(), date, file);
  if (!fullPath.startsWith(csvBackup.getBackupRootDir()) || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }
  res.download(fullPath, `${date}-${file}`);
});

router.get('/info', (req, res) => {
  try {
    const stat = fs.statSync(db.DB_PATH);
    res.json({ path: db.DB_PATH, size_bytes: stat.size, last_modified: stat.mtime });
  } catch (e) {
    res.status(500).json({ error: 'Could not read database file info' });
  }
});

// Uses better-sqlite3's built-in .backup() so WAL-mode data still in flight
// is properly checkpointed into the snapshot — a plain file copy could miss
// recent writes still sitting in the -wal file.
router.get('/download', async (req, res) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpPath = path.join(path.dirname(db.DB_PATH), `backup-tmp-${stamp}.db`);
  try {
    await db.backup(tmpPath);
    res.download(tmpPath, `ima-langnubi-dairy-backup-${stamp}.db`, (err) => {
      fs.unlink(tmpPath, () => {}); // best-effort cleanup regardless of outcome
      if (err && !res.headersSent) res.status(500).json({ error: 'Backup download failed: ' + err.message });
    });
  } catch (e) {
    fs.unlink(tmpPath, () => {});
    res.status(500).json({ error: e.message || 'Backup failed' });
  }
});

// Restores from an uploaded .db file. This closes the live database
// connection immediately, so the running server needs a restart afterward
// for the restored data to actually be used — that limitation is surfaced
// to the person doing the restore, both here and in the UI.
router.post('/restore', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < 16) {
    return res.status(400).json({ error: 'No file received' });
  }
  if (!buf.subarray(0, 16).equals(SQLITE_MAGIC)) {
    return res.status(400).json({ error: 'That file does not look like a valid SQLite database' });
  }

  try { db.close(); } catch (e) { /* already closed / best effort */ }

  const walPath = db.DB_PATH + '-wal';
  const shmPath = db.DB_PATH + '-shm';
  [walPath, shmPath].forEach(p => { try { fs.unlinkSync(p); } catch (e) { /* may not exist */ } });

  try {
    fs.writeFileSync(db.DB_PATH, buf);
  } catch (e) {
    return res.status(500).json({ error: `Failed to write restored database: ${e.message}` });
  }

  res.json({
    success: true,
    message: 'Database restored. The app must be restarted now for the restored data to load.'
  });
});

module.exports = router;
