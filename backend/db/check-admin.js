const path = require('path');
const bcrypt = require('bcryptjs');

console.log('DB_PATH env var:', process.env.DB_PATH || '(not set — using default)');

const db = require('./db'); // uses DB_PATH internally, same as the real app
console.log('Actual DB file in use:', db.DB_PATH);

const row = db.prepare('SELECT id, name, username, role, status, password_hash FROM users WHERE username = ?').get('admin');

if (!row) {
  console.log('\nNo user with username "admin" found in this database file.');
} else {
  console.log('\nFound admin row:');
  console.log('  id:', row.id);
  console.log('  name:', row.name);
  console.log('  username:', JSON.stringify(row.username));
  console.log('  role:', row.role);
  console.log('  status:', JSON.stringify(row.status));
  console.log('  password_hash:', row.password_hash);
  const matches = bcrypt.compareSync('admin123', row.password_hash);
  console.log('\nDoes "admin123" match this hash?', matches ? 'YES ✅' : 'NO ❌');
}

console.log('\nAll usernames in this database:');
console.log(db.prepare('SELECT username, status FROM users').all());