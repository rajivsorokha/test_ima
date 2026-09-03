const express = require('express');
const router = express.Router();
const db = require('../db/db');

// GET all farms with cow counts and today's collected liters
router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const farms = db.prepare('SELECT * FROM farms ORDER BY is_home DESC, name ASC').all();
  const withStats = farms.map(f => {
    const cows = db.prepare('SELECT COUNT(*) c FROM cows WHERE farm_id = ?').get(f.id).c;
    const activeCows = db.prepare("SELECT COUNT(*) c FROM cows WHERE farm_id = ? AND status = 'Active'").get(f.id).c;
    const litersToday = f.is_home
      ? (db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE farm_id = ? AND date = ?').get(f.id, today).l)
      : (db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_collections WHERE farm_id = ? AND date = ?').get(f.id, today).l);
    return { ...f, cows, active_cows: activeCows, liters_today: litersToday };
  });
  res.json(withStats);
});

router.get('/:id', (req, res) => {
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!farm) return res.status(404).json({ error: 'Farm not found' });
  res.json(farm);
});

router.post('/', (req, res) => {
  const { name, location, contact_name, contact_phone, notes, is_home } = req.body;
  if (!name || !location) return res.status(400).json({ error: 'name and location are required' });
  const stmt = db.prepare(`INSERT INTO farms (name, location, contact_name, contact_phone, notes, is_home)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name, location, contact_name || null, contact_phone || null, notes || null, is_home ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM farms WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Farm not found' });
  const f = { ...existing, ...req.body };
  db.prepare(`UPDATE farms SET name=?, location=?, contact_name=?, contact_phone=?, notes=?, is_home=?, status=? WHERE id=?`)
    .run(f.name, f.location, f.contact_name, f.contact_phone, f.notes, f.is_home ? 1 : 0, f.status, req.params.id);
  res.json(db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM farms WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Collections logged against a partner farm (network milk intake)
router.get('/:id/collections', (req, res) => {
  const { start, end } = req.query;
  let q = 'SELECT * FROM milk_collections WHERE farm_id = ?';
  const params = [req.params.id];
  if (start && end) { q += ' AND date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY date DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/:id/collections', (req, res) => {
  const { date, liters, rate_per_liter, tank_id, notes } = req.body;
  if (!date || liters === undefined) return res.status(400).json({ error: 'date and liters are required' });
  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO milk_collections (farm_id, date, liters, rate_per_liter, tank_id, notes)
      VALUES (?, ?, ?, ?, ?, ?)`).run(req.params.id, date, liters, rate_per_liter || 0, tank_id || null, notes || null);
    if (tank_id) {
      const tank = db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(tank_id);
      if (tank) {
        db.prepare('UPDATE inventory_tanks SET current_liters = current_liters + ? WHERE id = ?').run(liters, tank_id);
        db.prepare(`INSERT INTO tank_logs (tank_id, date, change_liters, reason, notes) VALUES (?, ?, ?, 'Collection', ?)`)
          .run(tank_id, date, liters, `Collection from farm #${req.params.id}`);
      }
    }
    return info.lastInsertRowid;
  });
  const id = txn();
  res.status(201).json(db.prepare('SELECT * FROM milk_collections WHERE id = ?').get(id));
});

module.exports = router;
