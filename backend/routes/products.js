const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireRole } = require('../middleware/auth');

// Reading the catalog is open to every signed-in role (salesman needs it at the till).
// Managing the catalog (add/edit/discontinue) is admin/manager only.
const canManageCatalog = requireRole('admin', 'manager');

router.get('/', (req, res) => {
  const { category, status } = req.query;
  let q = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (category && category !== 'All') { q += ' AND category = ?'; params.push(category); }
  if (status === 'All') { /* no status filter — show everything, including discontinued */ }
  else if (status) { q += ' AND status = ?'; params.push(status); }
  else { q += " AND status = 'Active'"; }
  q += ' ORDER BY category ASC, name ASC';
  res.json(db.prepare(q).all(...params));
});

router.get('/categories', (req, res) => {
  res.json(['Milk', 'Milk Token', 'Dairy Product', 'Feed', 'Medicine', 'Other']);
});

router.post('/', canManageCatalog, (req, res) => {
  const { name, category, unit, price, stock_qty, track_stock, token_liters } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const noStock = category === 'Milk' || category === 'Milk Token';
  const info = db.prepare(`INSERT INTO products (name, category, unit, price, stock_qty, track_stock, token_liters)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, category || 'Dairy Product', unit || 'piece', price || 0,
      noStock ? 0 : (stock_qty || 0), noStock ? 0 : (track_stock === false || track_stock === 0 ? 0 : 1),
      category === 'Milk Token' ? (token_liters || null) : null);
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', canManageCatalog, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const p = { ...existing, ...req.body };
  db.prepare(`UPDATE products SET name=?, category=?, unit=?, price=?, stock_qty=?, track_stock=?, token_liters=?, status=? WHERE id=?`)
    .run(p.name, p.category, p.unit, p.price, p.stock_qty, p.track_stock ? 1 : 0, p.token_liters || null, p.status, req.params.id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', canManageCatalog, (req, res) => {
  // Soft-delete: keep historic sales referencing this product intact
  db.prepare("UPDATE products SET status = 'Discontinued' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
