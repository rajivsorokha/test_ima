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
