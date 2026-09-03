const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY name ASC').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, role, phone, email, farm_id, start_date, salary, status } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'name and role are required' });
  const stmt = db.prepare(`INSERT INTO employees (name, role, phone, email, farm_id, start_date, salary, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name, role, phone || null, email || null, farm_id || null, start_date || null, salary || 0, status || 'Active');
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  const e = { ...existing, ...req.body };
  db.prepare(`UPDATE employees SET name=?, role=?, phone=?, email=?, farm_id=?, start_date=?, salary=?, status=? WHERE id=?`)
    .run(e.name, e.role, e.phone, e.email, e.farm_id, e.start_date, e.salary, e.status, req.params.id);
  res.json(db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Leave management ---
router.get('/leaves/all', (req, res) => {
  const rows = db.prepare(`SELECT l.*, e.name as employee_name FROM leaves l
    JOIN employees e ON e.id = l.employee_id ORDER BY l.start_date DESC`).all();
  res.json(rows);
});

router.post('/leaves', (req, res) => {
  const { employee_id, type, start_date, end_date, notes } = req.body;
  if (!employee_id || !start_date || !end_date) return res.status(400).json({ error: 'employee_id, start_date, end_date are required' });
  const stmt = db.prepare(`INSERT INTO leaves (employee_id, type, start_date, end_date, notes)
    VALUES (?, ?, ?, ?, ?)`);
  const info = stmt.run(employee_id, type || 'Annual', start_date, end_date, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/leaves/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leaves SET status = ? WHERE id = ?').run(status, req.params.id);
  if (status === 'Approved') {
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id);
    const today = new Date().toISOString().slice(0, 10);
    if (leave && leave.start_date <= today && leave.end_date >= today) {
      db.prepare("UPDATE employees SET status = 'On Leave' WHERE id = ?").run(leave.employee_id);
    }
  }
  res.json(db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id));
});

router.delete('/leaves/:id', (req, res) => {
  db.prepare('DELETE FROM leaves WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
