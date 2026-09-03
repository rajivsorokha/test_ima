const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const { farm_id, result, start, end } = req.query;
  let q = `SELECT q.*, f.name as farm_name FROM milk_quality_tests q JOIN farms f ON f.id = q.farm_id WHERE 1=1`;
  const params = [];
  if (farm_id) { q += ' AND q.farm_id = ?'; params.push(farm_id); }
  if (result && result !== 'All') { q += ' AND q.adulteration_result = ?'; params.push(result); }
  if (start && end) { q += ' AND q.date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY q.date DESC, q.id DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', (req, res) => {
  const { farm_id, collection_id, date, fat_percent, snf_percent, density, temperature_c, adulteration_result, remarks, tested_by } = req.body;
  if (!farm_id || !date) return res.status(400).json({ error: 'farm_id and date are required' });
  const info = db.prepare(`INSERT INTO milk_quality_tests
    (farm_id, collection_id, date, fat_percent, snf_percent, density, temperature_c, adulteration_result, remarks, tested_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(farm_id, collection_id || null, date, fat_percent || null, snf_percent || null, density || null,
      temperature_c || null, adulteration_result || 'Pass', remarks || null, tested_by || null);
  res.status(201).json(db.prepare('SELECT * FROM milk_quality_tests WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM milk_quality_tests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
