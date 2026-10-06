const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ima_langnubi_dairy.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migration: add newer columns to tables that may already
// exist from an earlier install (CREATE TABLE IF NOT EXISTS above does
// nothing for a table that's already there, even if its shape is older).
// Safe to run every startup — it's a no-op once a column exists.
function ensureColumn(table, column, columnDdl) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!existing.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDdl}`);
  }
}
ensureColumn('milk_collections', 'session', "session TEXT NOT NULL DEFAULT 'AM'");
ensureColumn('milk_collections', 'delivered_at', 'delivered_at TEXT');
ensureColumn('milk_collections', 'bonus_amount', 'bonus_amount REAL NOT NULL DEFAULT 0');
ensureColumn('milk_collections', 'penalty_amount', 'penalty_amount REAL NOT NULL DEFAULT 0');
ensureColumn('milk_collections', 'bonus_note', 'bonus_note TEXT');
ensureColumn('invoices', 'total_bonus', 'total_bonus REAL NOT NULL DEFAULT 0');
ensureColumn('invoices', 'total_penalty', 'total_penalty REAL NOT NULL DEFAULT 0');
ensureColumn('invoices', 'total_loan_deduction', 'total_loan_deduction REAL NOT NULL DEFAULT 0');
ensureColumn('invoices', 'net_payout', 'net_payout REAL NOT NULL DEFAULT 0');
// Backfill: any invoice created before this migration will have
// net_payout=0 from the column default above, which would misleadingly
// show as "₹0 paid out" for old, already-settled invoices. Those never
// had loan deductions (the feature didn't exist yet), so their real net
// payout was simply the full total_amount.
db.exec(`UPDATE invoices SET net_payout = total_amount WHERE net_payout = 0 AND total_loan_deduction = 0 AND total_amount != 0`);
ensureColumn('milk_quality_tests', 'session', "session TEXT NOT NULL DEFAULT 'AM'");
ensureColumn('milk_quality_tests', 'lactometer_reading', 'lactometer_reading REAL');
ensureColumn('milk_quality_tests', 'thermometer_reading', 'thermometer_reading REAL');
ensureColumn('milk_quality_tests', 'quality_score', 'quality_score REAL');
ensureColumn('milk_quality_tests', 'quality_label', 'quality_label TEXT');
ensureColumn('cows', 'no_of_calving', 'no_of_calving INTEGER NOT NULL DEFAULT 0');
ensureColumn('cows', 'optimum_yield', 'optimum_yield REAL');
ensureColumn('farms', 'distance_band', "distance_band TEXT NOT NULL DEFAULT 'within_10km'");
ensureColumn('farms', 'share_deposit', 'share_deposit REAL NOT NULL DEFAULT 0');
{
  const farmCols = db.prepare(`PRAGMA table_info(farms)`).all().map((c) => c.name);
  if (!farmCols.includes('membership_status')) {
    db.exec("ALTER TABLE farms ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'Pending'");
    // Grandfather in farms that already existed before this feature was
    // added — they were already operating normally (including having
    // loans), so it would be wrong to suddenly lock them out. Only NEW
    // farms created from this point forward start as Pending.
    db.exec("UPDATE farms SET membership_status = 'Approved'");
  }
}
ensureColumn('farms', 'approved_at', 'approved_at TEXT');
ensureColumn('farms', 'approved_by', 'approved_by TEXT');
ensureColumn('farms', 'feed_medicine_deposit', 'feed_medicine_deposit REAL NOT NULL DEFAULT 0');
db.exec(`CREATE TABLE IF NOT EXISTS landlords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_phone TEXT,
  rent_amount REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// The `loans` table shape changed (added borrower_type/employee_id/
// landlord_id, relaxed farm_id to nullable, renamed kind values from
// 'loan'/'borrow' to 'long'/'short'). SQLite can't relax a NOT NULL
// constraint or rename table structure with a simple ALTER, so an
// existing old-shape table gets rebuilt in place, preserving all data.
db.exec(`CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrower_type TEXT NOT NULL DEFAULT 'member',
  farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  landlord_id INTEGER REFERENCES landlords(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'short',
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 2,
  installment_amount REAL,
  guarantor1_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  guarantor2_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  date_issued TEXT NOT NULL,
  balance REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
const loanCols = db.prepare(`PRAGMA table_info(loans)`).all().map((c) => c.name);
if (!loanCols.includes('borrower_type')) {
  db.exec('BEGIN');
  try {
    db.exec(`ALTER TABLE loans RENAME TO loans_old_shape`);
    db.exec(`CREATE TABLE loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrower_type TEXT NOT NULL DEFAULT 'member',
      farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
      landlord_id INTEGER REFERENCES landlords(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'short',
      principal REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 2,
      installment_amount REAL,
      guarantor1_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
      guarantor2_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
      date_issued TEXT NOT NULL,
      balance REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT INTO loans
      (id, borrower_type, farm_id, kind, principal, interest_rate, installment_amount,
       guarantor1_farm_id, guarantor2_farm_id, date_issued, balance, status, notes, created_at)
      SELECT id, 'member', farm_id,
        CASE kind WHEN 'loan' THEN 'long' WHEN 'borrow' THEN 'short' ELSE kind END,
        principal, interest_rate, installment_amount,
        guarantor1_farm_id, guarantor2_farm_id, date_issued, balance, status, notes, created_at
      FROM loans_old_shape`);
    db.exec(`DROP TABLE loans_old_shape`);
    db.exec('COMMIT');
    console.log('[migration] Rebuilt loans table with borrower_type support (member/staff/landlord).');
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[migration] Failed to migrate loans table:', err.message);
  }
}
db.exec(`CREATE TABLE IF NOT EXISTS loan_repayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  interest_accrued REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'invoice',
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

// First run on a fresh install: the database has tables but no users yet.
// Create a default admin login automatically so the app is usable right
// after installing, with no manual seed script / terminal step required
// on each machine it's installed on. (Deliberately does NOT insert the
// rest of the old demo data — farms/cows/etc — that's dev/test-only.)
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  db.prepare(`INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run('Owner Admin', 'admin', bcrypt.hashSync('admin123', 10), 'admin');
  console.log('First run: created default login admin / admin123 — please change this password after logging in.');
}

module.exports = db;
module.exports.DB_PATH = DB_PATH;
