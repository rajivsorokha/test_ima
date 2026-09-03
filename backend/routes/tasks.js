const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const { status, farm_id } = req.query;
  let q = `SELECT t.*, e.name as assignee_name FROM tasks t LEFT JOIN employees e ON e.id = t.assigned_to WHERE 1=1`;
  const params = [];
  if (status && status !== 'All') { q += ' AND t.status = ?'; params.push(status); }
  if (farm_id) { q += ' AND t.farm_id = ?'; params.push(farm_id); }
  q += ' ORDER BY t.due_date ASC';
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(q).all(...params).map(t => ({
    ...t,
    overdue: t.status !== 'Done' && t.due_date && t.due_date < today
  }));
  res.json(rows);
});

router.post('/', (req, res) => {
  const { title, description, priority, due_date, assigned_to, farm_id } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const stmt = db.prepare(`INSERT INTO tasks (title, description, priority, due_date, assigned_to, farm_id)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(title, description || null, priority || 'Medium', due_date || null, assigned_to || null, farm_id || null);
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
