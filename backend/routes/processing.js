const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireRole } = require('../middleware/auth');
const { localDateISO } = require('../utils/helpers');

const canManage = requireRole('admin', 'manager');
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const BANDS = ['good', 'warning', 'low'];

function fail(status, message, extra = {}) { const e = new Error(message); e.status = status; e.extra = extra; return e; }
function handle(fn) {
  return (req, res) => {
    try { fn(req, res); }
    catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message, ...err.extra });
      console.error('[processing]', err); res.status(500).json({ error: err.message });
    }
  };
}

// ---------- Quality of the day ----------
// Same thresholds the Milk Quality Tests page uses (editable in Settings).
function getThresholds() {
  const d = { low_max: 31, warning_max: 32, low_label: 'Low Quality', warning_label: 'Warning', good_label: 'Good' };
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'quality_thresholds'").get();
  if (!row) return d;
  try { return { ...d, ...JSON.parse(row.value) }; } catch (e) { return d; }
}
function bandForScore(score) {
  const t = getThresholds();
  return score < t.low_max ? 'low' : score < t.warning_max ? 'warning' : 'good';
}
// Average score of that day's tests (all farms, both sessions). Milk that failed the
// adulteration check is left out.
function dayQuality(date) {
  const row = db.prepare(`SELECT AVG(quality_score) AS avg, COUNT(*) AS n FROM milk_quality_tests
    WHERE date = ? AND quality_score IS NOT NULL AND adulteration_result != 'Fail'`).get(date);
  if (!row || !row.n) return null;
  return { score: r2(row.avg), tests: row.n, band: bandForScore(row.avg) };
}

// ---------- Rules ----------
// Starting values used until a rule is saved for a product. They are typical figures only —
// set the farm's real numbers in the Rules tab.
function defaultRule(name) {
  const n = (name || '').toLowerCase();
  if (/paneer|cottage/.test(n)) return { lpu_good: 5.5, lpu_warning: 6, lpu_low: 6.5, bonus_min_qty: 4, bonus_amount: 50 };
  return { lpu_good: 1, lpu_warning: 1, lpu_low: 1, bonus_min_qty: 0, bonus_amount: 0 };
}
function getRule(product) {
  const saved = db.prepare('SELECT * FROM production_rules WHERE product_id = ?').get(product.id);
  if (saved) return { ...saved, is_default: false };
  return { product_id: product.id, ...defaultRule(product.name), is_default: true };
}

router.get('/rules', (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE category = 'Dairy Product' AND status = 'Active' ORDER BY name").all();
  res.json({
    thresholds: getThresholds(),
    rules: products.map(p => ({ product_id: p.id, name: p.name, unit: p.unit, ...getRule(p) })),
  });
});

router.put('/rules/:productId', canManage, handle((req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) throw fail(404, 'Product not found');
  const b = req.body;
  const vals = ['lpu_good', 'lpu_warning', 'lpu_low'].map(k => Number(b[k]));
  if (vals.some(v => !(v > 0))) throw fail(400, 'Liters per kg must be greater than 0 for all three quality levels');
  const minQty = Number(b.bonus_min_qty || 0), amount = Number(b.bonus_amount || 0);
  if (minQty < 0 || amount < 0) throw fail(400, 'Bonus values cannot be negative');
  db.prepare(`INSERT INTO production_rules (product_id, lpu_good, lpu_warning, lpu_low, bonus_min_qty, bonus_amount)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET lpu_good = excluded.lpu_good,
    lpu_warning = excluded.lpu_warning, lpu_low = excluded.lpu_low, bonus_min_qty = excluded.bonus_min_qty,
    bonus_amount = excluded.bonus_amount`).run(product.id, ...vals, minQty, amount);
  res.json({ name: product.name, ...getRule(product) });
}));

// ---------- Planning (used by preview + issuing) ----------
function plan({ date, product_id, milk_liters, quality_band }) {
  if (!isDate(date)) throw fail(400, 'A valid date is required');
  const milk = Number(milk_liters);
  if (!(milk > 0)) throw fail(400, 'Milk quantity (liters) must be greater than 0');
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) throw fail(400, 'Choose the product to be made');

  let quality, source;
  if (quality_band && quality_band !== 'auto') {
    if (!BANDS.includes(quality_band)) throw fail(400, 'Quality must be good, warning or low');
    quality = { score: null, tests: 0, band: quality_band }; source = 'manual';
  } else {
    quality = dayQuality(date); source = 'auto';
    if (!quality) throw fail(409, `No milk quality test is recorded for ${date}. Add a test, or choose the quality level yourself.`, { needs_quality: true });
  }
  const rule = getRule(product);
  const lpu = rule[`lpu_${quality.band}`];
  return { product, rule, quality, source, milk, lpu, expected: r2(milk / lpu) };
}

router.get('/preview', handle((req, res) => {
  const p = plan({ date: req.query.date || localDateISO(), product_id: req.query.product_id, milk_liters: req.query.milk_liters, quality_band: req.query.quality_band });
  res.json({
    quality: { score: p.quality.score, tests: p.quality.tests, band: p.quality.band, source: p.source },
    liters_per_unit: p.lpu, expected_qty: p.expected, unit: p.product.unit,
    bonus_min_qty: p.rule.bonus_min_qty, bonus_amount: p.rule.bonus_amount, rule_is_default: p.rule.is_default,
  });
}));

// ---------- Processors ----------
router.get('/processors', (req, res) => {
  res.json(db.prepare(`SELECT p.*,
    (SELECT COUNT(*) FROM production_batches b WHERE b.processor_id = p.id) AS batch_count,
    (SELECT COALESCE(SUM(milk_liters),0) FROM production_batches b WHERE b.processor_id = p.id AND b.status = 'Out') AS milk_with_them
    FROM processors p ORDER BY p.status ASC, p.name ASC`).all());
});
router.post('/processors', canManage, handle((req, res) => {
  const { name, phone, kind, address } = req.body;
  if (!name || !name.trim()) throw fail(400, 'Name is required');
  const info = db.prepare('INSERT INTO processors (name, phone, kind, address) VALUES (?, ?, ?, ?)')
    .run(name.trim(), phone || null, kind === 'Person' ? 'Person' : 'Agent', address || null);
  res.status(201).json(db.prepare('SELECT * FROM processors WHERE id = ?').get(info.lastInsertRowid));
}));
router.put('/processors/:id', canManage, handle((req, res) => {
  const cur = db.prepare('SELECT * FROM processors WHERE id = ?').get(req.params.id);
  if (!cur) throw fail(404, 'Not found');
  const b = { ...cur, ...req.body };
  if (!b.name || !String(b.name).trim()) throw fail(400, 'Name is required');
  db.prepare('UPDATE processors SET name = ?, phone = ?, kind = ?, address = ?, status = ? WHERE id = ?')
    .run(String(b.name).trim(), b.phone || null, b.kind === 'Person' ? 'Person' : 'Agent', b.address || null, b.status === 'Inactive' ? 'Inactive' : 'Active', cur.id);
  res.json(db.prepare('SELECT * FROM processors WHERE id = ?').get(cur.id));
}));
router.delete('/processors/:id', canManage, handle((req, res) => {
  const n = db.prepare('SELECT COUNT(*) c FROM production_batches WHERE processor_id = ?').get(req.params.id).c;
  if (n) throw fail(409, 'This person has production history, so it cannot be deleted. Mark them Inactive instead.');
  db.prepare('DELETE FROM processors WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- Batches ----------
const BATCH_SELECT = `SELECT b.*, pr.name AS processor_name, pr.phone AS processor_phone, p.name AS product_name, p.unit AS unit
  FROM production_batches b JOIN processors pr ON pr.id = b.processor_id JOIN products p ON p.id = b.product_id`;
const getBatch = (id) => db.prepare(`${BATCH_SELECT} WHERE b.id = ?`).get(id);

router.get('/batches', (req, res) => {
  const { processor_id, status, start, end } = req.query;
  let q = `${BATCH_SELECT} WHERE 1=1`; const params = [];
  if (processor_id) { q += ' AND b.processor_id = ?'; params.push(processor_id); }
  if (status && status !== 'All') { q += ' AND b.status = ?'; params.push(status); }
  if (start && end) { q += ' AND b.date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY b.date DESC, b.id DESC LIMIT 500';
  res.json(db.prepare(q).all(...params));
});

function ledgerAdd(batch, date, type, { liters = null, qty = null, amount = null, description }) {
  db.prepare(`INSERT INTO production_ledger (batch_id, processor_id, date, entry_type, liters, qty, amount, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(batch.id, batch.processor_id, date, type, liters, qty, amount, description);
}
const bandLabel = (b) => ({ good: 'Good', warning: 'Warning', low: 'Low' }[b]);

function writeIssuedEntry(batch, product, processor) {
  db.prepare("DELETE FROM production_ledger WHERE batch_id = ? AND entry_type = 'Milk Issued'").run(batch.id);
  ledgerAdd(batch, batch.date, 'Milk Issued', {
    liters: batch.milk_liters,
    description: `${r2(batch.milk_liters)} L milk to ${processor.name} for ${product.name} — ${bandLabel(batch.quality_band)} quality${batch.quality_score != null ? ` (score ${batch.quality_score})` : ' (set manually)'}, ${batch.liters_per_unit} L per ${product.unit} → expected ${batch.expected_qty} ${product.unit}`,
  });
}

router.post('/batches', canManage, handle((req, res) => {
  const processor = db.prepare('SELECT * FROM processors WHERE id = ?').get(req.body.processor_id);
  if (!processor) throw fail(400, 'Choose who the milk is given to');
  if (processor.status !== 'Active') throw fail(400, `${processor.name} is marked Inactive`);
  const date = req.body.date || localDateISO();
  const p = plan({ date, product_id: req.body.product_id, milk_liters: req.body.milk_liters, quality_band: req.body.quality_band });
  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO production_batches (date, processor_id, product_id, milk_liters, quality_score, quality_band,
      quality_source, liters_per_unit, expected_qty, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(date, processor.id, p.product.id, p.milk, p.quality.score, p.quality.band, p.source, p.lpu, p.expected, req.body.notes || null);
    const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(info.lastInsertRowid);
    writeIssuedEntry(batch, p.product, processor);
    return batch.id;
  })();
  res.status(201).json(getBatch(id));
}));

// Edit a batch that has not come back yet (wrong liters, wrong person, wrong date...).
router.put('/batches/:id', canManage, handle((req, res) => {
  const cur = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(req.params.id);
  if (!cur) throw fail(404, 'Batch not found');
  if (cur.status !== 'Out') throw fail(409, 'This batch has already been returned. Delete it and enter it again to change the milk details.');
  const processor = db.prepare('SELECT * FROM processors WHERE id = ?').get(req.body.processor_id ?? cur.processor_id);
  if (!processor) throw fail(400, 'Choose who the milk is given to');
  const date = req.body.date || cur.date;
  const p = plan({
    date, product_id: req.body.product_id ?? cur.product_id, milk_liters: req.body.milk_liters ?? cur.milk_liters,
    quality_band: req.body.quality_band ?? (cur.quality_source === 'manual' ? cur.quality_band : 'auto'),
  });
  db.transaction(() => {
    db.prepare(`UPDATE production_batches SET date = ?, processor_id = ?, product_id = ?, milk_liters = ?, quality_score = ?,
      quality_band = ?, quality_source = ?, liters_per_unit = ?, expected_qty = ?, notes = ? WHERE id = ?`)
      .run(date, processor.id, p.product.id, p.milk, p.quality.score, p.quality.band, p.source, p.lpu, p.expected, req.body.notes ?? cur.notes, cur.id);
    const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(cur.id);
    db.prepare('UPDATE production_ledger SET processor_id = ? WHERE batch_id = ?').run(processor.id, cur.id);
    writeIssuedEntry(batch, p.product, processor);
  })();
  res.json(getBatch(cur.id));
}));

// Record (or correct) what came back. Safe to call again on a returned batch: the earlier
// stock, bonus and ledger entries are reversed first, so nothing is counted twice.
router.post('/batches/:id/return', canManage, handle((req, res) => {
  const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(req.params.id);
  if (!batch) throw fail(404, 'Batch not found');
  const actual = Number(req.body.actual_qty);
  if (!(actual >= 0) || req.body.actual_qty === '' || req.body.actual_qty == null) throw fail(400, 'Enter the quantity that was returned');
  const returnedDate = req.body.returned_date || localDateISO();
  if (!isDate(returnedDate)) throw fail(400, 'A valid return date is required');
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(batch.product_id);
  const processor = db.prepare('SELECT * FROM processors WHERE id = ?').get(batch.processor_id);
  const rule = getRule(product);

  db.transaction(() => {
    // Reverse a previous return, if there was one.
    if (batch.status === 'Returned') {
      if (product.track_stock) db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(batch.actual_qty || 0, product.id);
      if (batch.finance_txn_id) db.prepare('DELETE FROM financial_transactions WHERE id = ?').run(batch.finance_txn_id);
      db.prepare("DELETE FROM production_ledger WHERE batch_id = ? AND entry_type != 'Milk Issued'").run(batch.id);
    }
    const qty = r2(actual);
    const variance = r2(qty - batch.expected_qty);
    const bonus = rule.bonus_min_qty > 0 && qty >= rule.bonus_min_qty ? r2(rule.bonus_amount) : 0;

    let txnId = null;
    if (bonus > 0) {
      txnId = db.prepare(`INSERT INTO financial_transactions (date, type, category, description, amount) VALUES (?, 'Expense', 'Production Bonus', ?, ?)`)
        .run(returnedDate, `Bonus — ${processor.name}, batch #${batch.id}: ${qty} ${product.unit} ${product.name}`, bonus).lastInsertRowid;
    }
    if (product.track_stock) db.prepare('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?').run(qty, product.id);

    db.prepare(`UPDATE production_batches SET status = 'Returned', returned_date = ?, actual_qty = ?, variance_qty = ?,
      bonus_amount = ?, finance_txn_id = ?, notes = ? WHERE id = ?`)
      .run(returnedDate, qty, variance, bonus, txnId, req.body.notes ?? batch.notes, batch.id);

    ledgerAdd(batch, returnedDate, 'Product Returned', { qty, description: `${processor.name} returned ${qty} ${product.unit} ${product.name} (expected ${batch.expected_qty})${product.track_stock ? ' — added to stock' : ''}` });
    ledgerAdd(batch, returnedDate, 'Yield Variance', { qty: variance, description: variance === 0 ? 'Exactly as expected' : variance > 0 ? `${variance} ${product.unit} more than expected` : `${Math.abs(variance)} ${product.unit} less than expected` });
    if (bonus > 0) ledgerAdd(batch, returnedDate, 'Bonus', { amount: bonus, description: `Bonus for producing ${qty} ${product.unit} (target ${rule.bonus_min_qty} ${product.unit}) — posted to Financial Ledger as an expense` });
  })();
  res.json(getBatch(batch.id));
}));

router.delete('/batches/:id', canManage, handle((req, res) => {
  const batch = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(req.params.id);
  if (!batch) throw fail(404, 'Batch not found');
  db.transaction(() => {
    if (batch.status === 'Returned') {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(batch.product_id);
      if (product && product.track_stock) db.prepare('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?').run(batch.actual_qty || 0, product.id);
    }
    if (batch.finance_txn_id) db.prepare('DELETE FROM financial_transactions WHERE id = ?').run(batch.finance_txn_id);
    db.prepare('DELETE FROM production_ledger WHERE batch_id = ?').run(batch.id);
    db.prepare('DELETE FROM production_batches WHERE id = ?').run(batch.id);
  })();
  res.json({ ok: true });
}));

// ---------- Ledger + summary ----------
router.get('/ledger', (req, res) => {
  const { processor_id, batch_id, start, end } = req.query;
  let q = `SELECT l.*, pr.name AS processor_name, p.name AS product_name, p.unit AS unit
    FROM production_ledger l JOIN processors pr ON pr.id = l.processor_id
    JOIN production_batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id WHERE 1=1`;
  const params = [];
  if (processor_id) { q += ' AND l.processor_id = ?'; params.push(processor_id); }
  if (batch_id) { q += ' AND l.batch_id = ?'; params.push(batch_id); }
  if (start && end) { q += ' AND l.date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY l.date DESC, l.id DESC LIMIT 1000';
  res.json(db.prepare(q).all(...params));
});

router.get('/summary', (req, res) => {
  const { start, end } = req.query;
  const range = start && end ? ' AND b.date BETWEEN ? AND ?' : '';
  const params = start && end ? [start, end] : [];
  const perProcessor = db.prepare(`SELECT pr.id, pr.name, COUNT(b.id) AS batches,
      COALESCE(SUM(b.milk_liters),0) AS milk_issued,
      COALESCE(SUM(CASE WHEN b.status = 'Out' THEN b.milk_liters END),0) AS milk_pending,
      COALESCE(SUM(CASE WHEN b.status = 'Returned' THEN b.expected_qty END),0) AS expected_qty,
      COALESCE(SUM(b.actual_qty),0) AS returned_qty,
      COALESCE(SUM(b.variance_qty),0) AS variance_qty,
      COALESCE(SUM(b.bonus_amount),0) AS bonus_total
    FROM processors pr JOIN production_batches b ON b.processor_id = pr.id WHERE 1=1 ${range}
    GROUP BY pr.id ORDER BY pr.name`).all(...params);
  const totals = db.prepare(`SELECT COALESCE(SUM(CASE WHEN b.status='Out' THEN b.milk_liters END),0) AS milk_out,
      COALESCE(SUM(b.milk_liters),0) AS milk_issued, COALESCE(SUM(b.actual_qty),0) AS returned_qty,
      COALESCE(SUM(b.bonus_amount),0) AS bonus_total FROM production_batches b WHERE 1=1 ${range}`).get(...params);
  res.json({ perProcessor, totals });
});

module.exports = router;
