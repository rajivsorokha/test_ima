const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const { start, end, cow_id, farm_id, page = 1, limit = 50 } = req.query;
  let q = 'SELECT m.*, c.tag as cow_tag FROM milk_records m LEFT JOIN cows c ON c.id = m.cow_id WHERE 1=1';
  const params = [];
  if (start && end) { q += ' AND m.date BETWEEN ? AND ?'; params.push(start, end); }
  if (cow_id) { q += ' AND m.cow_id = ?'; params.push(cow_id); }
  if (farm_id) { q += ' AND m.farm_id = ?'; params.push(farm_id); }
  const countRow = db.prepare(q.replace('SELECT m.*, c.tag as cow_tag', 'SELECT COUNT(*) as c')).get(...params);
  q += ' ORDER BY m.date DESC, m.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), (Number(page) - 1) * Number(limit));
  const rows = db.prepare(q).all(...params);
  res.json({ data: rows, total: countRow.c, page: Number(page), limit: Number(limit) });
});

router.get('/today', (req, res) => {
  const { farm_id } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const base = farm_id ? ' AND farm_id = ?' : '';
  const p = farm_id ? [today, farm_id] : [today];
  const total = db.prepare(`SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ?${base}`).get(...p).l;
  const am = db.prepare(`SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ? AND session='AM'${base}`).get(...p).l;
  const pm = db.prepare(`SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ? AND session='PM'${base}`).get(...p).l;
  res.json({ total, am, pm });
});

router.get('/trend', (req, res) => {
  const { days = 7, farm_id } = req.query;
  const rows = [];
  for (let i = Number(days) - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const base = farm_id ? ' AND farm_id = ?' : '';
    const p = farm_id ? [iso, farm_id] : [iso];
    const liters = db.prepare(`SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ?${base}`).get(...p).l;
    rows.push({ date: iso, liters });
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { farm_id, cow_id, date, session, liters, notes } = req.body;
  if (!farm_id || !date || liters === undefined) return res.status(400).json({ error: 'farm_id, date and liters are required' });
  const stmt = db.prepare(`INSERT INTO milk_records (farm_id, cow_id, date, session, liters, notes)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(farm_id, cow_id || null, date, session || 'AM', liters, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM milk_records WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM milk_records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
