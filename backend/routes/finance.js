const express = require('express');
const router = express.Router();
const db = require('../db/db');

const INCOME_CATEGORIES = ['Milk Sales', 'Animal Sales', 'Manure', 'Grants', 'Other'];
const EXPENSE_CATEGORIES = ['Feed', 'Veterinary', 'Labor', 'Equipment', 'Utilities', 'Transport', 'Breeding', 'Other'];

router.get('/categories', (req, res) => res.json({ income: INCOME_CATEGORIES, expense: EXPENSE_CATEGORIES }));

router.get('/', (req, res) => {
  const { type, category, start, end } = req.query;
  let q = 'SELECT * FROM financial_transactions WHERE 1=1';
  const params = [];
  if (type && type !== 'All Types') { q += ' AND type = ?'; params.push(type); }
  if (category && category !== 'All Categories') { q += ' AND category = ?'; params.push(category); }
  if (start && end) { q += ' AND date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY date ASC, id ASC';
  const rows = db.prepare(q).all(...params);
  let balance = 0;
  const withBalance = rows.map(r => {
    balance += r.type === 'Income' ? r.amount : -r.amount;
    return { ...r, balance };
  }).reverse();
  const totalIncome = rows.filter(r => r.type === 'Income').reduce((s, r) => s + r.amount, 0);
  const totalExpense = rows.filter(r => r.type === 'Expense').reduce((s, r) => s + r.amount, 0);
  res.json({ data: withBalance, running_balance: totalIncome - totalExpense, total_income: totalIncome, total_expense: totalExpense });
});

router.post('/', (req, res) => {
  const { date, type, category, description, amount, farm_id } = req.body;
  if (!date || !type || !category || amount === undefined) return res.status(400).json({ error: 'date, type, category, amount are required' });
  const stmt = db.prepare(`INSERT INTO financial_transactions (date, type, category, description, amount, farm_id)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(date, type, category, description || null, amount, farm_id || null);
  res.status(201).json(db.prepare('SELECT * FROM financial_transactions WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM financial_transactions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
