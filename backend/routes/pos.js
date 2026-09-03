const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { genTokenCode } = require('../utils/helpers');

function today() { return new Date().toISOString().slice(0, 10); }

router.get('/sales', (req, res) => {
  const { start, end, channel } = req.query;
  let q = 'SELECT * FROM pos_sales WHERE 1=1';
  const params = [];
  if (start && end) { q += ' AND date BETWEEN ? AND ?'; params.push(start, end); }
  if (channel && channel !== 'All') { q += ' AND sale_channel = ?'; params.push(channel); }
  q += ' ORDER BY date DESC, id DESC LIMIT 200';
  const sales = db.prepare(q).all(...params);
  const withItems = sales.map(s => ({
    ...s,
    items: db.prepare('SELECT * FROM pos_sale_items WHERE pos_sale_id = ?').all(s.id)
  }));
  res.json(withItems);
});

router.get('/summary', (req, res) => {
  const t = today();
  const monthStart = t.slice(0, 8) + '01';
  const todayRevenue = db.prepare('SELECT COALESCE(SUM(total),0) t FROM pos_sales WHERE date = ?').get(t).t;
  const todayCount = db.prepare('SELECT COUNT(*) c FROM pos_sales WHERE date = ?').get(t).c;
  const monthRevenue = db.prepare('SELECT COALESCE(SUM(total),0) t FROM pos_sales WHERE date BETWEEN ? AND ?').get(monthStart, t).t;
  const todayMilkLiters = db.prepare(`SELECT COALESCE(SUM(i.qty),0) l FROM pos_sale_items i
    JOIN pos_sales s ON s.id = i.pos_sale_id WHERE s.date = ? AND i.category = 'Milk'`).get(t).l;
  res.json({ today_revenue: todayRevenue, today_transactions: todayCount, month_revenue: monthRevenue, today_milk_liters: todayMilkLiters });
});

// Unified checkout. body:
// { date? (defaults to today), customer_name, customer_phone, sale_channel, delivery_charge,
//   payment_method, items: [{ product_id, qty, unit_price? }] }
router.post('/sales', (req, res) => {
  const { date, customer_name, customer_phone, sale_channel, delivery_charge, payment_method, items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }
  const saleDate = date || today();
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const insertSale = db.prepare(`INSERT INTO pos_sales
    (date, customer_name, customer_phone, sale_channel, delivery_charge, payment_method, subtotal, total)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0)`);
  const insertItem = db.prepare(`INSERT INTO pos_sale_items (pos_sale_id, product_id, product_name, category, qty, unit_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const decrementStock = db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?');
  const insertToken = db.prepare(`INSERT INTO tokens (code, product_id, pos_sale_id, size, liters, issued_to) VALUES (?, ?, ?, ?, ?, ?)`);
  const finalizeSale = db.prepare('UPDATE pos_sales SET subtotal=?, total=? WHERE id=?');

  const txn = db.transaction(() => {
    const dCharge = sale_channel === 'Delivery' ? Number(delivery_charge || 0) : 0;
    const saleInfo = insertSale.run(saleDate, customer_name || null, customer_phone || null,
      sale_channel || 'Counter', dCharge, payment_method || 'Cash');
    const saleId = saleInfo.lastInsertRowid;

    let subtotal = 0;
    for (const item of items) {
      const product = getProduct.get(item.product_id);
      if (!product) throw new Error(`Product ${item.product_id} not found`);
      const qty = Number(item.qty);
      if (!qty || qty <= 0) throw new Error(`Invalid quantity for ${product.name}`);
      const unitPrice = item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== ''
        ? Number(item.unit_price) : product.price;
      const lineSubtotal = unitPrice * qty;
      subtotal += lineSubtotal;
      insertItem.run(saleId, product.id, product.name, product.category, qty, unitPrice, lineSubtotal);

      if (product.track_stock) {
        decrementStock.run(qty, product.id);
      }
      if (product.category === 'Milk Token') {
        const liters = product.token_liters || 0;
        const size = liters === 0.25 ? 'Quarter' : liters === 0.5 ? 'Half' : liters === 1 ? 'One Litre' : `${liters}L`;
        for (let i = 0; i < qty; i++) {
          insertToken.run(genTokenCode(size), product.id, saleId, size, liters, customer_name || null);
        }
      }
    }

    const total = subtotal + dCharge;
    finalizeSale.run(subtotal, total, saleId);
    return saleId;
  });

  try {
    const saleId = txn();
    const sale = db.prepare('SELECT * FROM pos_sales WHERE id = ?').get(saleId);
    const saleItems = db.prepare('SELECT * FROM pos_sale_items WHERE pos_sale_id = ?').all(saleId);
    const issuedTokens = db.prepare('SELECT * FROM tokens WHERE pos_sale_id = ?').all(saleId);
    res.status(201).json({ ...sale, items: saleItems, tokens_issued: issuedTokens });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Issue a token without a sale — e.g. replacing a lost token or a promo giveaway. No charge recorded.
router.post('/tokens/issue-free', (req, res) => {
  const { product_id, issued_to } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product || product.category !== 'Milk Token') {
    return res.status(400).json({ error: 'product_id must reference a Milk Token product' });
  }
  const liters = product.token_liters || 0;
  const size = liters === 0.25 ? 'Quarter' : liters === 0.5 ? 'Half' : liters === 1 ? 'One Litre' : `${liters}L`;
  const code = genTokenCode(size);
  db.prepare(`INSERT INTO tokens (code, product_id, size, liters, issued_to) VALUES (?, ?, ?, ?, ?)`)
    .run(code, product.id, size, liters, issued_to || null);
  res.status(201).json(db.prepare('SELECT * FROM tokens WHERE code = ?').get(code));
});

// --- Tokens ---
router.get('/tokens', (req, res) => {
  const { status } = req.query;
  let q = 'SELECT * FROM tokens WHERE 1=1';
  const params = [];
  if (status && status !== 'All') { q += ' AND status = ?'; params.push(status); }
  q += ' ORDER BY issued_at DESC LIMIT 200';
  res.json(db.prepare(q).all(...params));
});

// Redeem: handing over milk for an already-paid token. No money involved here.
router.post('/tokens/redeem', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });
  const tok = db.prepare("SELECT * FROM tokens WHERE code = ?").get(code.trim().toUpperCase());
  if (!tok) return res.status(404).json({ error: 'Token not found' });
  if (tok.status !== 'Issued') return res.status(400).json({ error: `Token is already ${tok.status.toLowerCase()}` });
  db.prepare("UPDATE tokens SET status='Redeemed', redeemed_at = datetime('now') WHERE id = ?").run(tok.id);
  res.json(db.prepare('SELECT * FROM tokens WHERE id = ?').get(tok.id));
});

router.put('/tokens/:id/void', (req, res) => {
  db.prepare("UPDATE tokens SET status = 'Void' WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM tokens WHERE id = ?').get(req.params.id));
});

module.exports = router;
