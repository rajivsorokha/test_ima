const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory_tanks ORDER BY name ASC').all());
});

router.get('/:id/logs', (req, res) => {
  res.json(db.prepare('SELECT * FROM tank_logs WHERE tank_id = ? ORDER BY date DESC, id DESC LIMIT 100').all(req.params.id));
});

router.post('/', (req, res) => {
  const { name, location, capacity_liters, current_liters, status, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare(`INSERT INTO inventory_tanks (name, location, capacity_liters, current_liters, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)`).run(name, location || null, capacity_liters || 0, current_liters || 0, status || 'Active', notes || null);
  res.status(201).json(db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tank not found' });
  const t = { ...existing, ...req.body };
  db.prepare(`UPDATE inventory_tanks SET name=?, location=?, capacity_liters=?, current_liters=?, status=?, notes=? WHERE id=?`)
    .run(t.name, t.location, t.capacity_liters, t.current_liters, t.status, t.notes, req.params.id);
  res.json(db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(req.params.id));
});

// Log a fill/draw-off/adjustment against a tank; keeps current_liters in sync.
router.post('/:id/adjust', (req, res) => {
  const tank = db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(req.params.id);
  if (!tank) return res.status(404).json({ error: 'Tank not found' });
  const { date, change_liters, reason, notes } = req.body;
  if (change_liters === undefined) return res.status(400).json({ error: 'change_liters is required' });
  const newLevel = tank.current_liters + Number(change_liters);
  if (newLevel < 0) return res.status(400).json({ error: 'This would take the tank below 0 litres' });
  if (tank.capacity_liters && newLevel > tank.capacity_liters) {
    return res.status(400).json({ error: `This would exceed tank capacity (${tank.capacity_liters} L)` });
  }
  const txn = db.transaction(() => {
    db.prepare('UPDATE inventory_tanks SET current_liters = ? WHERE id = ?').run(newLevel, req.params.id);
    db.prepare(`INSERT INTO tank_logs (tank_id, date, change_liters, reason, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(req.params.id, date || new Date().toISOString().slice(0, 10), change_liters, reason || 'Adjustment', notes || null);
  });
  txn();
  res.json(db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM inventory_tanks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
