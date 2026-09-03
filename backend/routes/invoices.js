const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const { farm_id, status } = req.query;
  let q = `SELECT i.*, f.name as farm_name, f.location as farm_location
           FROM invoices i JOIN farms f ON f.id = i.farm_id WHERE 1=1`;
  const params = [];
  if (farm_id) { q += ' AND i.farm_id = ?'; params.push(farm_id); }
  if (status && status !== 'All') { q += ' AND i.status = ?'; params.push(status); }
  q += ' ORDER BY i.generated_at DESC';
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req, res) => {
  const inv = db.prepare(`SELECT i.*, f.name as farm_name, f.location as farm_location, f.contact_name, f.contact_phone
    FROM invoices i JOIN farms f ON f.id = i.farm_id WHERE i.id = ?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const collections = db.prepare('SELECT * FROM milk_collections WHERE farm_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC')
    .all(inv.farm_id, inv.period_start, inv.period_end);
  res.json({ ...inv, collections });
});

// Generate an invoice for a farm covering a date range, based on logged collections.
// If rate_per_liter isn't given, uses the weighted average of the collection rates.
router.post('/generate', (req, res) => {
  const { farm_id, period_start, period_end, rate_per_liter } = req.body;
  if (!farm_id || !period_start || !period_end) {
    return res.status(400).json({ error: 'farm_id, period_start, period_end are required' });
  }
  const collections = db.prepare('SELECT * FROM milk_collections WHERE farm_id = ? AND date BETWEEN ? AND ?')
    .all(farm_id, period_start, period_end);
  if (collections.length === 0) return res.status(400).json({ error: 'No collections found for this farm in this period' });

  const totalLiters = collections.reduce((s, c) => s + c.liters, 0);
  let rate = rate_per_liter;
  if (!rate) {
    const totalValue = collections.reduce((s, c) => s + c.liters * c.rate_per_liter, 0);
    rate = totalLiters > 0 ? totalValue / totalLiters : 0;
  }
  const totalAmount = totalLiters * rate;

  const info = db.prepare(`INSERT INTO invoices (farm_id, period_start, period_end, total_liters, rate_per_liter, total_amount)
    VALUES (?, ?, ?, ?, ?, ?)`).run(farm_id, period_start, period_end, totalLiters, rate, totalAmount);
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
