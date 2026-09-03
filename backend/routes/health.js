const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const { status, type, cow_id, farm_id } = req.query;
  let q = `SELECT h.*, c.tag as cow_tag, c.name as cow_name, c.farm_id as cow_farm_id
           FROM health_events h JOIN cows c ON c.id = h.cow_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'All') { q += ' AND h.status = ?'; params.push(status); }
  if (type) { q += ' AND h.type = ?'; params.push(type); }
  if (cow_id) { q += ' AND h.cow_id = ?'; params.push(cow_id); }
  if (farm_id) { q += ' AND c.farm_id = ?'; params.push(farm_id); }
  q += ' ORDER BY h.date DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', (req, res) => {
  const { cow_id, date, type, description, vet_name, cost, follow_up_date, status } = req.body;
  if (!cow_id || !date || !type) return res.status(400).json({ error: 'cow_id, date and type are required' });
  const stmt = db.prepare(`INSERT INTO health_events (cow_id, date, type, description, vet_name, cost, follow_up_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(cow_id, date, type, description || null, vet_name || null, cost || 0, follow_up_date || null, status || 'Open');
  res.status(201).json(db.prepare('SELECT * FROM health_events WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE health_events SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM health_events WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM health_events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
