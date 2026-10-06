const express = require('express');
const router = express.Router();
const db = require('../db/db');

// "Loan" (long term) and "Borrow" (short term) both live in the `loans`
// table, across three borrower categories (confirmed with the owner,
// 2026-09):
//   - member:   backed by share deposit / milk bill balance
//   - staff:    backed by salary
//   - landlord: backed by rent amount owed to them
// Short term = recoverable within about a month, no guarantor needed.
// Long term = up to ~10 months, needs 1-2 guarantors (society members),
// and is flagged a Defaulter if the balance is still unpaid past 10
// months from date_issued. Both terms charge interest on the balance —
// applied when an invoice touches a member loan (see invoices.js), or
// via manual repayment entries for staff/landlord loans and any member
// loan paid outside the milk-invoice cycle.

const MONTHS_TO_DEFAULT = 10;

function borrowerName(loan) {
  return loan.farm_name || loan.employee_name || loan.landlord_name || 'Unknown';
}

function isDefaulter(loan) {
  if (loan.kind !== 'long' || loan.status !== 'Active') return false;
  const issued = new Date(loan.date_issued);
  const cutoff = new Date(issued);
  cutoff.setMonth(cutoff.getMonth() + MONTHS_TO_DEFAULT);
  return new Date() > cutoff;
}

const LOAN_SELECT = `SELECT l.*, f.name AS farm_name, f.contact_phone AS farm_phone,
    e.name AS employee_name, e.phone AS employee_phone,
    ld.name AS landlord_name, ld.contact_phone AS landlord_phone,
    g1.name AS guarantor1_name, g2.name AS guarantor2_name
  FROM loans l
  LEFT JOIN farms f ON f.id = l.farm_id
  LEFT JOIN employees e ON e.id = l.employee_id
  LEFT JOIN landlords ld ON ld.id = l.landlord_id
  LEFT JOIN farms g1 ON g1.id = l.guarantor1_farm_id
  LEFT JOIN farms g2 ON g2.id = l.guarantor2_farm_id`;

function borrowerPhone(loan) {
  return loan.farm_phone || loan.employee_phone || loan.landlord_phone || '';
}

router.get('/', (req, res) => {
  const { farm_id, status, borrower_type } = req.query;
  let q = LOAN_SELECT + ' WHERE 1=1';
  const params = [];
  if (farm_id) { q += ' AND l.farm_id = ?'; params.push(farm_id); }
  if (status) { q += ' AND l.status = ?'; params.push(status); }
  if (borrower_type) { q += ' AND l.borrower_type = ?'; params.push(borrower_type); }
  q += ' ORDER BY l.date_issued DESC';
  const loans = db.prepare(q).all(...params).map((l) => ({
    ...l, borrower_name: borrowerName(l), borrower_phone: borrowerPhone(l), is_defaulter: isDefaulter(l),
  }));
  res.json(loans);
});

// --- Landlords: a lightweight registry, just enough to back a Landlord
// loan. Registered BEFORE '/:id' so "landlords" doesn't get parsed as an id. ---
router.get('/landlords/list', (req, res) => {
  res.json(db.prepare('SELECT * FROM landlords ORDER BY name').all());
});
router.post('/landlords/list', (req, res) => {
  const { name, contact_phone, rent_amount, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const info = db.prepare('INSERT INTO landlords (name, contact_phone, rent_amount, notes) VALUES (?, ?, ?, ?)')
    .run(name, contact_phone || null, Number(rent_amount || 0), notes || null);
  res.status(201).json(db.prepare('SELECT * FROM landlords WHERE id = ?').get(info.lastInsertRowid));
});

router.get('/:id', (req, res) => {
  const loan = db.prepare(LOAN_SELECT + ' WHERE l.id = ?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const repayments = db.prepare('SELECT * FROM loan_repayments WHERE loan_id = ? ORDER BY date DESC, id DESC').all(req.params.id);
  res.json({ ...loan, borrower_name: borrowerName(loan), borrower_phone: borrowerPhone(loan), is_defaulter: isDefaulter(loan), repayments });
});

router.post('/', (req, res) => {
  const {
    borrower_type, farm_id, employee_id, landlord_id,
    kind, principal, interest_rate, installment_amount,
    guarantor1_farm_id, guarantor2_farm_id, date_issued, notes,
  } = req.body;

  const bType = ['member', 'staff', 'landlord'].includes(borrower_type) ? borrower_type : 'member';
  if (bType === 'member' && !farm_id) return res.status(400).json({ error: 'A member loan requires farm_id' });
  if (bType === 'staff' && !employee_id) return res.status(400).json({ error: 'A staff loan requires employee_id' });
  if (bType === 'landlord' && !landlord_id) return res.status(400).json({ error: 'A landlord loan requires landlord_id' });
  if (!principal || !date_issued) return res.status(400).json({ error: 'principal and date_issued are required' });

  // A not-yet-approved member cannot receive a Loan OR a Borrow (both
  // terms) — they can still make a Feed/Medicine deposit and buy on
  // that basis, but formal lending only opens up once approved.
  if (bType === 'member') {
    const farm = db.prepare('SELECT membership_status FROM farms WHERE id = ?').get(farm_id);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    if (farm.membership_status !== 'Approved') {
      return res.status(400).json({ error: 'This member is not yet approved — approve them first (Milk Network -> Partner Farm Register) before issuing a Loan or Borrow.' });
    }
  }

  const k = kind === 'long' ? 'long' : 'short';
  if (k === 'long' && !guarantor1_farm_id) {
    return res.status(400).json({ error: 'A long-term loan requires at least one guarantor' });
  }
  if (k === 'long' && !installment_amount) {
    return res.status(400).json({ error: 'A long-term loan requires a monthly installment amount' });
  }

  const info = db.prepare(`INSERT INTO loans
    (borrower_type, farm_id, employee_id, landlord_id, kind, principal, interest_rate, installment_amount,
     guarantor1_farm_id, guarantor2_farm_id, date_issued, balance, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      bType,
      bType === 'member' ? farm_id : null,
      bType === 'staff' ? employee_id : null,
      bType === 'landlord' ? landlord_id : null,
      k, Number(principal), Number(interest_rate ?? 2),
      k === 'long' ? Number(installment_amount) : null,
      guarantor1_farm_id || null, guarantor2_farm_id || null,
      date_issued, Number(principal), notes || null
    );
  const loan = db.prepare(LOAN_SELECT + ' WHERE l.id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...loan, borrower_name: borrowerName(loan), borrower_phone: borrowerPhone(loan), is_defaulter: isDefaulter(loan) });
});

// Manual repayment (cash/bank) — the ONLY repayment path for staff and
// landlord loans (no invoice cycle to auto-deduct from), and a fallback
// for member loans paid outside their milk-invoice cycle.
router.post('/:id/repayments', (req, res) => {
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const { date, amount, notes } = req.body;
  if (!date || !amount) return res.status(400).json({ error: 'date and amount are required' });
  const amt = Math.round(Math.min(Number(amount), loan.balance) * 100) / 100;
  const newBalance = Math.round((loan.balance - amt) * 100) / 100;
  db.prepare('UPDATE loans SET balance = ?, status = ? WHERE id = ?')
    .run(newBalance, newBalance <= 0 ? 'Closed' : 'Active', loan.id);
  db.prepare(`INSERT INTO loan_repayments (loan_id, date, amount_paid, source, notes) VALUES (?, ?, ?, 'manual', ?)`)
    .run(loan.id, date, amt, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM loans WHERE id = ?').get(loan.id));
});

router.put('/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE loans SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json(db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id));
});

module.exports = router;
