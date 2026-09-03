const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/db');
const { requireAuth, requireAdmin, ROLES } = require('../middleware/auth');
const { genSessionToken } = require('../utils/helpers');

function normalizeRole(role) {
  return ROLES.includes(role) ? role : 'salesman';
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
  if (!user || user.status !== 'Active') return res.status(401).json({ error: 'Invalid username or password' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  const token = genSessionToken();
  db.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').run(user.id, token);
  res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role } });
});

router.post('/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

// --- Admin: user management ---
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, username, role, status, created_at FROM users ORDER BY name ASC').all());
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'name, username and password are required' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(`INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)`)
      .run(name, username.trim().toLowerCase(), hash, normalizeRole(role));
    res.status(201).json(db.prepare('SELECT id, name, username, role, status FROM users WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message.includes('UNIQUE') ? 'That username is already taken' : e.message });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'User not found' });
  const { name, role, status, password } = req.body;
  const u = { ...existing, name: name ?? existing.name, role: role ? normalizeRole(role) : existing.role, status: status ?? existing.status };
  db.prepare('UPDATE users SET name=?, role=?, status=? WHERE id=?').run(u.name, u.role, u.status, req.params.id);
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  }
  res.json(db.prepare('SELECT id, name, username, role, status FROM users WHERE id = ?').get(req.params.id));
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "You can't delete your own account" });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
