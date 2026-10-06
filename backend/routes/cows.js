const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { ageFromDob, localDateISO } = require('../utils/helpers');

const AI_GESTATION_DAYS = 283; // average cattle gestation, used to estimate E.D.C. from the last A.I. date

// Adds the "Status Report of Dairy Cattle" columns that come from OTHER
// records rather than being stored directly on the cow — so there's a
// single source of truth (Health Events for calving/A.I., Milk Recording
// for present production) instead of a second, easily-outdated copy of
// the same facts living on the cow itself.
function withDerivedFields(cow) {
  const lastCalving = db.prepare(`SELECT date FROM health_events WHERE cow_id = ? AND type = 'Calving' ORDER BY date DESC LIMIT 1`).get(cow.id);
  const lastAi = db.prepare(`SELECT date FROM health_events WHERE cow_id = ? AND type = 'Insemination' ORDER BY date DESC LIMIT 1`).get(cow.id);

  let edc = null;
  // Only estimate an E.D.C. if the last A.I. is more recent than the last
  // calving (i.e. she's presumed still pregnant from that A.I., not
  // already delivered).
  if (lastAi && (!lastCalving || lastAi.date > lastCalving.date)) {
    const d = new Date(lastAi.date);
    d.setDate(d.getDate() + AI_GESTATION_DAYS);
    edc = localDateISO(d);
  }

  // "Present Production" — average daily yield (AM+PM combined) over the
  // last 7 days of Milk Recording entries for this cow, so it reflects
  // her current output rather than a single day's fluctuation.
  const recent = db.prepare(`SELECT date, SUM(liters) AS total FROM milk_records WHERE cow_id = ? AND date >= date('now', '-7 days') GROUP BY date`).all(cow.id);
  const presentProduction = recent.length ? Math.round((recent.reduce((s, r) => s + r.total, 0) / recent.length) * 10) / 10 : null;

  return {
    ...cow,
    age: ageFromDob(cow.date_of_birth),
    last_calving_date: lastCalving ? lastCalving.date : null,
    last_ai_date: lastAi ? lastAi.date : null,
    edc,
    present_production: presentProduction,
  };
}

router.get('/', (req, res) => {
  const { search, status, breed, farm_id } = req.query;
  let q = 'SELECT * FROM cows WHERE 1=1';
  const params = [];
  if (search) { q += ' AND (tag LIKE ? OR name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (status && status !== 'All Statuses') { q += ' AND status = ?'; params.push(status); }
  if (breed && breed !== 'All Breeds') { q += ' AND breed = ?'; params.push(breed); }
  if (farm_id) { q += ' AND farm_id = ?'; params.push(farm_id); }
  q += ' ORDER BY tag ASC';
  const cows = db.prepare(q).all(...params).map(withDerivedFields);
  res.json(cows);
});

router.get('/:id', (req, res) => {
  const cow = db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id);
  if (!cow) return res.status(404).json({ error: 'Cow not found' });
  const milk_history = db.prepare('SELECT * FROM milk_records WHERE cow_id = ? ORDER BY date DESC LIMIT 60').all(req.params.id);
  const health_events = db.prepare('SELECT * FROM health_events WHERE cow_id = ? ORDER BY date DESC').all(req.params.id);
  res.json({ ...withDerivedFields(cow), milk_history, health_events });
});

router.post('/', (req, res) => {
  const { farm_id, tag, name, breed, date_of_birth, status, no_of_calving, optimum_yield } = req.body;
  if (!farm_id || !tag) return res.status(400).json({ error: 'farm_id and tag are required' });
  const stmt = db.prepare(`INSERT INTO cows (farm_id, tag, name, breed, date_of_birth, status, no_of_calving, optimum_yield)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(farm_id, tag, name || null, breed || 'Crossbreed', date_of_birth || null, status || 'Active',
    Number(no_of_calving || 0), optimum_yield ? Number(optimum_yield) : null);
  res.status(201).json(withDerivedFields(db.prepare('SELECT * FROM cows WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cow not found' });
  const c = { ...existing, ...req.body };
  db.prepare(`UPDATE cows SET farm_id=?, tag=?, name=?, breed=?, date_of_birth=?, status=?, no_of_calving=?, optimum_yield=? WHERE id=?`)
    .run(c.farm_id, c.tag, c.name, c.breed, c.date_of_birth, c.status, Number(c.no_of_calving || 0),
      c.optimum_yield ? Number(c.optimum_yield) : null, req.params.id);
  res.json(withDerivedFields(db.prepare('SELECT * FROM cows WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM cows WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
