const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ageFromDob } = require('../utils/helpers');

router.get('/', (req, res) => {
  const { search, status, breed, farm_id } = req.query;
  let q = 'SELECT * FROM cows WHERE 1=1';
  const params = [];
  if (search) { q += ' AND (tag LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'All Statuses') { q += ' AND status = ?'; params.push(status); }
  if (breed && breed !== 'All Breeds') { q += ' AND breed = ?'; params.push(breed); }
  if (farm_id) { q += ' AND farm_id = ?'; params.push(farm_id); }
  q += ' ORDER BY tag ASC';
  const cows = db.prepare(q).all(...params).map(c => ({ ...c, age: ageFromDob(c.date_of_birth) }));
  res.json(cows);
});

router.get('/:id', (req, res) => {
  const cow = db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id);
  if (!cow) return res.status(404).json({ error: 'Cow not found' });
  const milk_history = db.prepare('SELECT * FROM milk_records WHERE cow_id = ? ORDER BY date DESC LIMIT 60').all(req.params.id);
  const health_events = db.prepare('SELECT * FROM health_events WHERE cow_id = ? ORDER BY date DESC').all(req.params.id);
  res.json({ ...cow, age: ageFromDob(cow.date_of_birth), milk_history, health_events });
});

router.post('/', (req, res) => {
  const { farm_id, tag, name, breed, date_of_birth, status } = req.body;
  if (!farm_id || !tag) return res.status(400).json({ error: 'farm_id and tag are required' });
  const stmt = db.prepare(`INSERT INTO cows (farm_id, tag, name, breed, date_of_birth, status)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(farm_id, tag, name || null, breed || 'Crossbreed', date_of_birth || null, status || 'Active');
  res.status(201).json(db.prepare('SELECT * FROM cows WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cow not found' });
  const c = { ...existing, ...req.body };
  db.prepare(`UPDATE cows SET farm_id=?, tag=?, name=?, breed=?, date_of_birth=?, status=? WHERE id=?`)
    .run(c.farm_id, c.tag, c.name, c.breed, c.date_of_birth, c.status, req.params.id);
  res.json(db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cows WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
