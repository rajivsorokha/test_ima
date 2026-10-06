const express = require('express');
const router = express.Router();
const db = require('../db/db');

// ---------------------------------------------------------------------
// Quality score formula (confirmed against the farm's own Excel sheet,
// 2026-09): a temperature-corrected lactometer reading.
//   quality_score = lactometer_reading + (thermometer_reading - 20) / 1.5
// Classified into a label by threshold, editable via Settings (stored
// in app_settings) without needing a rebuild — same pattern as the
// delivery rate table.
// ---------------------------------------------------------------------
const DEFAULT_THRESHOLDS = {
  low_max: 31,   // score < 31        -> low label
  warning_max: 32, // 31 <= score < 32 -> warning label
  // score >= 32                      -> good label
  low_label: 'Low Quality',
  warning_label: 'Warning',
  good_label: 'Good',
};

function getThresholds() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'quality_thresholds'").get();
  if (!row) return DEFAULT_THRESHOLDS;
  try { return { ...DEFAULT_THRESHOLDS, ...JSON.parse(row.value) }; } catch (e) { return DEFAULT_THRESHOLDS; }
}

function computeQuality(lactometer, thermometer) {
  if (lactometer === null || lactometer === undefined || thermometer === null || thermometer === undefined) {
    return { score: null, label: null };
  }
  const score = Math.round((Number(lactometer) + (Number(thermometer) - 20) / 1.5) * 100) / 100;
  const t = getThresholds();
  const label = score < t.low_max ? t.low_label : score < t.warning_max ? t.warning_label : t.good_label;
  return { score, label };
}

router.get('/thresholds', (req, res) => res.json(getThresholds()));
router.put('/thresholds', (req, res) => {
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('quality_thresholds', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ ...getThresholds(), ...req.body }));
  res.json(getThresholds());
});

router.get('/', (req, res) => {
  const { farm_id, result, start, end } = req.query;
  let q = `SELECT q.*, f.name as farm_name FROM milk_quality_tests q JOIN farms f ON f.id = q.farm_id WHERE 1=1`;
  const params = [];
  if (farm_id) { q += ' AND q.farm_id = ?'; params.push(farm_id); }
  if (result && result !== 'All') { q += ' AND q.adulteration_result = ?'; params.push(result); }
  if (start && end) { q += ' AND q.date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY q.date DESC, q.session DESC, q.id DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/', (req, res) => {
  const { farm_id, collection_id, date, session, lactometer_reading, thermometer_reading, adulteration_result, remarks, tested_by } = req.body;
  if (!farm_id || !date) return res.status(400).json({ error: 'farm_id and date are required' });
  const { score, label } = computeQuality(lactometer_reading, thermometer_reading);
  const info = db.prepare(`INSERT INTO milk_quality_tests
    (farm_id, collection_id, date, session, lactometer_reading, thermometer_reading, quality_score, quality_label, adulteration_result, remarks, tested_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(farm_id, collection_id || null, date, session === 'PM' ? 'PM' : 'AM',
      lactometer_reading ?? null, thermometer_reading ?? null, score, label,
      adulteration_result || 'Pass', remarks || null, tested_by || null);
  res.status(201).json(db.prepare('SELECT * FROM milk_quality_tests WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM milk_quality_tests WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
