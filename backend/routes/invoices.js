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
  const { farm_id, period_start, period_end, rate_per_liter, apply_loan_deduction } = req.body;
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
  // Late-delivery deductions already baked into each collection's rate
  // (see farms.js) get rolled up here for visibility on the invoice.
  const totalBonus = collections.reduce((s, c) => s + (c.bonus_amount || 0), 0);
  const totalPenalty = collections.reduce((s, c) => s + (c.penalty_amount || 0), 0);
  const totalAmount = totalLiters * rate + totalBonus - totalPenalty;

  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO invoices
      (farm_id, period_start, period_end, total_liters, rate_per_liter, total_bonus, total_penalty, total_amount, total_loan_deduction, net_payout)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(farm_id, period_start, period_end, totalLiters, rate, totalBonus, totalPenalty, totalAmount, totalAmount);
    const invoiceId = info.lastInsertRowid;

    // Auto-deduct this farm's active Loans/Borrows, oldest first. Each
    // active loan accrues interest on its outstanding balance this
    // cycle, then has its installment (Loan) or full remaining balance
    // (Borrow) deducted — capped by however much of this invoice is
    // still available to withhold, so a farm never gets a negative
    // payout because of debt.
    let remaining = totalAmount;
    let totalDeduction = 0;
    // Only 'member' loans/borrows are tied to a farm's invoice — staff
    // and landlord loans have no invoice to deduct from in this app, and
    // rely on manual repayment recording instead (see loans.js).
    // apply_loan_deduction lets whoever is generating the invoice
    // explicitly decline the automatic deduction for this one cycle
    // (e.g. the farm asked to skip it this time) — defaults to true,
    // matching the previous always-on behavior.
    const shouldDeduct = apply_loan_deduction !== false;
    const activeLoans = shouldDeduct
      ? db.prepare(`SELECT * FROM loans WHERE farm_id = ? AND borrower_type = 'member' AND status = 'Active' ORDER BY date_issued ASC`).all(farm_id)
      : [];
    for (const loan of activeLoans) {
      if (remaining <= 0) break;
      const interest = Math.round(loan.balance * (loan.interest_rate / 100) * 100) / 100;
      const owedThisCycle = Math.round((loan.balance + interest) * 100) / 100;
      const target = (loan.kind === 'long' && loan.installment_amount)
        ? Math.min(loan.installment_amount, owedThisCycle)
        : owedThisCycle; // 'short' (or a long-term loan with no installment set) clears in full when funds allow
      const actualPay = Math.round(Math.min(target, remaining) * 100) / 100;
      const newBalance = Math.round((owedThisCycle - actualPay) * 100) / 100;

      db.prepare('UPDATE loans SET balance = ?, status = ?, last_interest_date = ? WHERE id = ?')
        .run(newBalance, newBalance <= 0 ? 'Closed' : 'Active', period_end, loan.id);
      db.prepare(`INSERT INTO loan_repayments (loan_id, date, interest_accrued, amount_paid, source, invoice_id)
        VALUES (?, ?, ?, ?, 'invoice', ?)`).run(loan.id, period_end, interest, actualPay, invoiceId);

      remaining = Math.round((remaining - actualPay) * 100) / 100;
      totalDeduction = Math.round((totalDeduction + actualPay) * 100) / 100;
    }
    const netPayout = Math.round((totalAmount - totalDeduction) * 100) / 100;
    db.prepare('UPDATE invoices SET total_loan_deduction = ?, net_payout = ? WHERE id = ?').run(totalDeduction, netPayout, invoiceId);
    return invoiceId;
  });

  const id = txn();
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(id));
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
