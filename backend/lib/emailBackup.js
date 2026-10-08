const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const nodemailer = require('nodemailer');
const db = require('../db/db');
const { localDateISO } = require('../utils/helpers');

// Emails a compressed snapshot of the database to a chosen address — an
// off-site copy that survives the computer dying. SMTP details live in the
// app_settings table (set from Settings -> Email Backup). They are stored in
// the local database, so the SMTP password is only as private as this machine.

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // Gmail's limit is 25 MB; leave headroom for encoding

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value === null || value === undefined ? '' : String(value));
}

function getConfig() {
  return {
    enabled: getSetting('email_backup_enabled', '0') === '1',
    to: getSetting('email_backup_to', ''),
    host: getSetting('email_smtp_host', 'smtp.gmail.com'),
    port: Number(getSetting('email_smtp_port', '465')),
    secure: getSetting('email_smtp_secure', '1') === '1',
    user: getSetting('email_smtp_user', ''),
    pass: getSetting('email_smtp_pass', ''),
  };
}

// What the UI sees: everything except the password itself.
function getPublicConfig() {
  const { pass, ...rest } = getConfig();
  return {
    ...rest,
    has_password: !!pass,
    last_sent_at: getSetting('email_backup_last_at', null),
    last_status: getSetting('email_backup_last_status', null),
  };
}

function saveConfig(b) {
  if (typeof b.enabled === 'boolean') setSetting('email_backup_enabled', b.enabled ? '1' : '0');
  if (b.to !== undefined) {
    const to = String(b.to).trim();
    if (to && !to.split(',').every((a) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(a.trim()))) {
      throw new Error('Enter a valid email address (separate several with commas)');
    }
    setSetting('email_backup_to', to);
  }
  if (b.host !== undefined) setSetting('email_smtp_host', String(b.host).trim());
  if (b.port !== undefined && b.port !== '') setSetting('email_smtp_port', Number(b.port));
  if (typeof b.secure === 'boolean') setSetting('email_smtp_secure', b.secure ? '1' : '0');
  if (b.user !== undefined) setSetting('email_smtp_user', String(b.user).trim());
  // Blank password = keep the existing one, so re-saving the form doesn't wipe it.
  if (b.pass) setSetting('email_smtp_pass', b.pass);
}

function makeTransport(cfg) {
  if (!cfg.host || !cfg.user || !cfg.pass) throw new Error('Fill in the SMTP host, email account and password first');
  return nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  });
}

async function sendTest() {
  const cfg = getConfig();
  if (!cfg.to) throw new Error('Enter the email address to send backups to');
  await makeTransport(cfg).sendMail({
    from: cfg.user, to: cfg.to,
    subject: `${process.env.FARM_NAME || 'Ima Langnubi Dairy'} — backup email test`,
    text: 'This is a test message. If you can read this, emailed backups are set up correctly.',
  });
}

async function sendBackupEmail() {
  const cfg = getConfig();
  try {
    if (!cfg.to) throw new Error('No backup email address set');
    const transport = makeTransport(cfg);

    const stamp = localDateISO();
    const tmp = path.join(path.dirname(db.DB_PATH), `email-backup-tmp-${Date.now()}.db`);
    let gz;
    try {
      await db.backup(tmp); // consistent snapshot, includes recent WAL writes
      gz = zlib.gzipSync(fs.readFileSync(tmp));
    } finally {
      fs.unlink(tmp, () => {});
    }
    if (gz.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Backup is ${(gz.length / 1048576).toFixed(1)} MB compressed — too large to email (limit ~20 MB). Use Download Backup instead.`);
    }

    const farm = process.env.FARM_NAME || 'Ima Langnubi Dairy';
    await transport.sendMail({
      from: cfg.user, to: cfg.to,
      subject: `${farm} — database backup ${stamp}`,
      text: `Attached is the ${farm} database backup for ${stamp} (${(gz.length / 1024).toFixed(0)} KB, gzip-compressed).\n\n` +
            `To restore: unzip the .gz to get the .db file, then use Settings -> Restore from Backup.`,
      attachments: [{ filename: `ima-langnubi-dairy-backup-${stamp}.db.gz`, content: gz }],
    });
    setSetting('email_backup_last_at', new Date().toISOString());
    setSetting('email_backup_last_status', `Sent to ${cfg.to}`);
    return { ok: true, sent_to: cfg.to, size_bytes: gz.length };
  } catch (err) {
    setSetting('email_backup_last_at', new Date().toISOString());
    setSetting('email_backup_last_status', `Failed: ${err.message}`);
    throw err;
  }
}

function isEnabled() { return getConfig().enabled; }

module.exports = { getPublicConfig, saveConfig, sendTest, sendBackupEmail, isEnabled };
