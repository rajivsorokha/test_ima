const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');

const FARM_NAME = process.env.FARM_NAME || 'Ima Langnubi Dairy';
const FARM_ADDRESS = process.env.FARM_ADDRESS || 'Thangmeiband Sinam Leikai, Imphal, Manipur';

function getMilkRows(start, end) {
  return db.prepare(`SELECT m.date, m.session, COALESCE(c.tag, 'General Herd') as cow, m.liters, f.name as farm
    FROM milk_records m LEFT JOIN cows c ON c.id = m.cow_id JOIN farms f ON f.id = m.farm_id
    WHERE m.date BETWEEN ? AND ? ORDER BY m.date ASC`).all(start, end);
}
function getFinanceRows(start, end) {
  const rows = db.prepare(`SELECT * FROM financial_transactions WHERE date BETWEEN ? AND ? ORDER BY date ASC`).all(start, end);
  let balance = 0;
  return rows.map(r => { balance += r.type === 'Income' ? r.amount : -r.amount; return { ...r, balance }; });
}
function getHealthRows(start, end) {
  return db.prepare(`SELECT h.date, c.tag as cow, h.type, h.description, h.vet_name, h.cost, h.status
    FROM health_events h JOIN cows c ON c.id = h.cow_id
    WHERE h.date BETWEEN ? AND ? ORDER BY h.date ASC`).all(start, end);
}

const LOAN_REPORT_SELECT = `SELECT l.id, l.date_issued, l.borrower_type,
    COALESCE(f.name, e.name, ld.name, 'Unknown') as borrower,
    l.kind, l.principal, l.interest_rate, l.installment_amount, l.balance, l.status,
    g1.name as guarantor1, g2.name as guarantor2
  FROM loans l
  LEFT JOIN farms f ON f.id = l.farm_id
  LEFT JOIN employees e ON e.id = l.employee_id
  LEFT JOIN landlords ld ON ld.id = l.landlord_id
  LEFT JOIN farms g1 ON g1.id = l.guarantor1_farm_id
  LEFT JOIN farms g2 ON g2.id = l.guarantor2_farm_id`;

function isLoanDefaulter(row) {
  if (row.kind !== 'long' || row.status !== 'Active') return false;
  const cutoff = new Date(row.date_issued);
  cutoff.setMonth(cutoff.getMonth() + 10);
  return new Date() > cutoff;
}

// Loans ISSUED within the period (by date_issued). Term/status/balance
// reflect their CURRENT state, not a point-in-time snapshot from when
// this report is run — same convention as the other reports here.
function getLoanRows(start, end) {
  const rows = db.prepare(`${LOAN_REPORT_SELECT} WHERE l.date_issued BETWEEN ? AND ? ORDER BY l.date_issued ASC`).all(start, end);
  return rows.map((r) => ({
    ...r,
    borrower_type: { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[r.borrower_type] || r.borrower_type,
    term: r.kind === 'long' ? 'Long term' : 'Short term',
    guarantors: [r.guarantor1, r.guarantor2].filter(Boolean).join(' & ') || '-',
    defaulter: isLoanDefaulter(r) ? 'Yes' : 'No',
  }));
}

// Repayment activity (both auto-deducted from invoices and manual) within
// the period, regardless of when the underlying loan was issued.
function getLoanRepaymentRows(start, end) {
  return db.prepare(`SELECT r.date, COALESCE(f.name, e.name, ld.name, 'Unknown') as borrower,
      l.borrower_type, l.kind, r.amount_paid, r.interest_accrued, r.source
    FROM loan_repayments r
    JOIN loans l ON l.id = r.loan_id
    LEFT JOIN farms f ON f.id = l.farm_id
    LEFT JOIN employees e ON e.id = l.employee_id
    LEFT JOIN landlords ld ON ld.id = l.landlord_id
    WHERE r.date BETWEEN ? AND ? ORDER BY r.date ASC`).all(start, end)
    .map((r) => ({
      ...r,
      borrower_type: { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[r.borrower_type] || r.borrower_type,
      term: r.kind === 'long' ? 'Long term' : 'Short term',
      source: r.source === 'invoice' ? 'Auto (invoice)' : 'Manual',
    }));
}

router.get('/milk/csv', (req, res) => {
  const { start, end } = req.query;
  const rows = getMilkRows(start, end);
  const csv = new Parser({ fields: ['date', 'session', 'farm', 'cow', 'liters'] }).parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`milk-production-${start}-to-${end}.csv`);
  res.send(csv);
});

router.get('/finance/csv', (req, res) => {
  const { start, end } = req.query;
  const rows = getFinanceRows(start, end);
  const csv = new Parser({ fields: ['date', 'type', 'category', 'description', 'amount', 'balance'] }).parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`financial-ledger-${start}-to-${end}.csv`);
  res.send(csv);
});

router.get('/health/csv', (req, res) => {
  const { start, end } = req.query;
  const rows = getHealthRows(start, end);
  const csv = new Parser({ fields: ['date', 'cow', 'type', 'description', 'vet_name', 'cost', 'status'] }).parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`health-events-${start}-to-${end}.csv`);
  res.send(csv);
});

router.get('/loans/csv', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRows(start, end);
  const csv = new Parser({ fields: ['date_issued', 'borrower_type', 'borrower', 'term', 'principal', 'interest_rate', 'installment_amount', 'balance', 'status', 'defaulter', 'guarantors'] }).parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`loans-issued-${start}-to-${end}.csv`);
  res.send(csv);
});

router.get('/loan-repayments/csv', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRepaymentRows(start, end);
  const csv = new Parser({ fields: ['date', 'borrower_type', 'borrower', 'term', 'amount_paid', 'interest_accrued', 'source'] }).parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`loan-repayments-${start}-to-${end}.csv`);
  res.send(csv);
});

function pdfHeader(doc, title, start, end) {
  doc.fontSize(18).text(FARM_NAME, { align: 'left' });
  doc.fontSize(9).fillColor('#888').text(FARM_ADDRESS, { align: 'left' });
  doc.fillColor('#000');
  doc.fontSize(12).fillColor('#555').text(title, { align: 'left' });
  doc.text(`Period: ${start} to ${end}`, { align: 'left' });
  doc.moveDown();
  doc.fillColor('#000');
}

router.get('/milk/pdf', (req, res) => {
  const { start, end } = req.query;
  const rows = getMilkRows(start, end);
  const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`milk-production-${start}-to-${end}.pdf`);
  doc.pipe(res);
  pdfHeader(doc, 'Milk Production Report', start, end);
  doc.fontSize(11).text(`Total Yield: ${totalLiters.toFixed(1)} L`);
  doc.moveDown();
  rows.forEach(r => {
    doc.fontSize(9).text(`${r.date}  |  ${r.session}  |  ${r.farm}  |  ${r.cow}  |  ${r.liters} L`);
  });
  doc.end();
});

router.get('/finance/pdf', (req, res) => {
  const { start, end } = req.query;
  const rows = getFinanceRows(start, end);
  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`finance-report-${start}-to-${end}.pdf`);
  doc.pipe(res);
  pdfHeader(doc, 'Financial Ledger Report', start, end);
  rows.forEach(r => {
    doc.fontSize(9).text(`${r.date}  |  ${r.type}  |  ${r.category}  |  ${r.description || ''}  |  ₹${r.amount}  |  Bal: ₹${r.balance.toFixed(2)}`);
  });
  doc.end();
});

router.get('/health/pdf', (req, res) => {
  const { start, end } = req.query;
  const rows = getHealthRows(start, end);
  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`health-events-${start}-to-${end}.pdf`);
  doc.pipe(res);
  pdfHeader(doc, 'Health Events Summary', start, end);
  rows.forEach(r => {
    doc.fontSize(9).text(`${r.date}  |  ${r.cow}  |  ${r.type}  |  ${r.description || ''}  |  Vet: ${r.vet_name || '-'}  |  Cost: ₹${r.cost}  |  ${r.status}`);
  });
  doc.end();
});

router.get('/loans/pdf', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRows(start, end);
  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`loans-issued-${start}-to-${end}.pdf`);
  doc.pipe(res);
  pdfHeader(doc, 'Loans & Advances Issued', start, end);
  const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0);
  const totalOutstanding = rows.reduce((s, r) => s + r.balance, 0);
  doc.fontSize(11).text(`Total Issued: ₹${totalPrincipal.toFixed(2)}   |   Currently Outstanding: ₹${totalOutstanding.toFixed(2)}`);
  doc.moveDown();
  rows.forEach(r => {
    doc.fontSize(9).text(`${r.date_issued}  |  ${r.borrower_type}: ${r.borrower}  |  ${r.term}  |  Principal: ₹${r.principal}  |  Balance: ₹${r.balance.toFixed(2)}  |  ${r.status}${r.defaulter === 'Yes' ? '  |  DEFAULTER' : ''}`);
  });
  doc.end();
});

router.get('/loan-repayments/pdf', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRepaymentRows(start, end);
  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`loan-repayments-${start}-to-${end}.pdf`);
  doc.pipe(res);
  pdfHeader(doc, 'Loan Repayments', start, end);
  const totalPaid = rows.reduce((s, r) => s + r.amount_paid, 0);
  doc.fontSize(11).text(`Total Repaid: ₹${totalPaid.toFixed(2)}`);
  doc.moveDown();
  rows.forEach(r => {
    doc.fontSize(9).text(`${r.date}  |  ${r.borrower_type}: ${r.borrower}  |  ${r.term}  |  Paid: ₹${r.amount_paid.toFixed(2)}  |  Interest: ₹${r.interest_accrued.toFixed(2)}  |  ${r.source}`);
  });
  doc.end();
});

// --- Individual Loan Statement: full detail for ONE loan, printable ---
router.get('/loans/:id/statement/pdf', (req, res) => {
  const loan = db.prepare(`${LOAN_REPORT_SELECT} WHERE l.id = ?`).get(req.params.id);
  if (!loan) return res.status(404).json({ error: 'Loan not found' });
  const repayments = db.prepare('SELECT * FROM loan_repayments WHERE loan_id = ? ORDER BY date ASC').all(req.params.id);
  const totalPaid = repayments.reduce((s, r) => s + r.amount_paid, 0);
  const totalInterest = repayments.reduce((s, r) => s + r.interest_accrued, 0);
  const typeLabel = { member: 'Member', staff: 'Staff', landlord: 'Landlord' }[loan.borrower_type] || loan.borrower_type;
  const termLabel = loan.kind === 'long' ? 'Long term' : 'Short term';
  const defaulter = isLoanDefaulter(loan);

  const doc = new PDFDocument({ margin: 40 });
  res.header('Content-Type', 'application/pdf');
  res.attachment(`loan-statement-${loan.id}-${loan.borrower.replace(/\s+/g, '-')}.pdf`);
  doc.pipe(res);
  doc.fontSize(18).text(FARM_NAME, { align: 'left' });
  doc.fontSize(9).fillColor('#888').text(FARM_ADDRESS, { align: 'left' });
  doc.fillColor('#000');
  doc.fontSize(14).fillColor('#178a3f').text('Loan Statement', { align: 'left' });
  doc.fillColor('#000');
  doc.moveDown();
  doc.fontSize(11).text(`Loan #${loan.id}  —  ${typeLabel}: ${loan.borrower}`);
  doc.fontSize(10).text(`Term: ${termLabel}   |   Date Issued: ${loan.date_issued}   |   Status: ${loan.status}${defaulter ? '  (DEFAULTER)' : ''}`);
  doc.moveDown(0.5);
  doc.text(`Principal: ₹${loan.principal.toFixed(2)}`);
  doc.text(`Interest Rate: ${loan.interest_rate}% / month`);
  if (loan.installment_amount) doc.text(`Monthly Installment: ₹${loan.installment_amount.toFixed(2)}`);
  if (loan.guarantor1 || loan.guarantor2) doc.text(`Guarantor(s): ${[loan.guarantor1, loan.guarantor2].filter(Boolean).join(' & ')}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text(`Total Repaid: ₹${totalPaid.toFixed(2)}   |   Total Interest Accrued: ₹${totalInterest.toFixed(2)}   |   Current Balance: ₹${loan.balance.toFixed(2)}`);
  doc.moveDown();
  doc.fontSize(10).fillColor('#555').text('Repayment History', { underline: true });
  doc.fillColor('#000');
  doc.moveDown(0.3);
  if (repayments.length === 0) {
    doc.fontSize(9).text('No repayments recorded yet.');
  } else {
    repayments.forEach(r => {
      doc.fontSize(9).text(`${r.date}  |  Paid: ₹${r.amount_paid.toFixed(2)}  |  Interest: ₹${r.interest_accrued.toFixed(2)}  |  ${r.source === 'invoice' ? 'Auto (milk invoice)' : 'Manual'}`);
    });
  }
  doc.end();
});

router.get('/loans/data', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRows(start, end);
  res.json({
    total_issued: rows.reduce((s, r) => s + r.principal, 0),
    total_outstanding: rows.reduce((s, r) => s + r.balance, 0),
    defaulter_count: rows.filter(r => r.defaulter === 'Yes').length,
    rows,
  });
});

router.get('/loan-repayments/data', (req, res) => {
  const { start, end } = req.query;
  const rows = getLoanRepaymentRows(start, end);
  res.json({ total_paid: rows.reduce((s, r) => s + r.amount_paid, 0), rows });
});

router.get('/milk/data', (req, res) => {
  const { start, end } = req.query;
  const rows = getMilkRows(start, end);
  const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
  const days = Math.max(1, (new Date(end) - new Date(start)) / 86400000 + 1);
  res.json({ total_liters: totalLiters, daily_average: totalLiters / days, rows });
});

module.exports = router;
