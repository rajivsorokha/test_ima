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

router.get('/milk/data', (req, res) => {
  const { start, end } = req.query;
  const rows = getMilkRows(start, end);
  const totalLiters = rows.reduce((s, r) => s + r.liters, 0);
  const days = Math.max(1, (new Date(end) - new Date(start)) / 86400000 + 1);
  res.json({ total_liters: totalLiters, daily_average: totalLiters / days, rows });
});

module.exports = router;
