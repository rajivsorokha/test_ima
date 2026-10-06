const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const { localDateISO } = require('../utils/helpers');

// ---------------------------------------------------------------------
// Delivery timing & rate rules — admin-editable via Settings (no code
// edit / rebuild required). Stored in app_settings as JSON, seeded with
// these defaults (confirmed against the farm's "Time" rate sheet,
// 2026-09) the first time they're read on a fresh install.
// ---------------------------------------------------------------------

const TIER_LABELS = ['Normal', '1st Late', '2nd Late', '3rd Late'];

const DEFAULT_SEASONS = {
  winter: { // Oct 1 - Mar 31
    cutoffs: {
      AM: { normal: '05:15', late1: '05:30', late2: '05:45' },
      PM: { normal: '15:30', late1: '15:45', late2: '16:00' },
    },
  },
  summer: { // Apr 1 - Sep 30
    cutoffs: {
      AM: { normal: '05:00', late1: '05:15', late2: '05:30' },
      PM: { normal: '16:00', late1: '16:15', late2: '16:30' },
    },
  },
};

// distance band -> quantity band -> [Normal, 1st Late, 2nd Late, 3rd Late]
const DEFAULT_RATE_TABLE = {
  within_10km: { under20: [58, 57, 56, 55], over20: [59, 58, 57, 56] },
  '10km_plus': { under20: [59, 58, 57, 56], over20: [60, 59, 58, 57] },
};

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch (e) { return fallback; }
}
function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

function getSeasons() { return getSetting('delivery_seasons', DEFAULT_SEASONS); }
function getRateTable() { return getSetting('delivery_rate_table', DEFAULT_RATE_TABLE); }

function seasonFor(dateStr) {
  const month = Number(dateStr.slice(5, 7));
  return (month >= 4 && month <= 9) ? 'summer' : 'winter';
}

// Returns 0 (Normal), 1, 2, or 3 based on delivered_at ("HH:MM") vs the
// season+shift's cutoff times. No delivered_at recorded -> treated as
// Normal (can't penalize a time nobody wrote down).
function tierFor(season, session, deliveredAt) {
  if (!deliveredAt) return 0;
  const seasons = getSeasons();
  const c = seasons[season].cutoffs[session === 'PM' ? 'PM' : 'AM'];
  if (deliveredAt <= c.normal) return 0;
  if (deliveredAt <= c.late1) return 1;
  if (deliveredAt <= c.late2) return 2;
  return 3;
}

function rateFor(distanceBand, liters, tier) {
  const rateTable = getRateTable();
  const band = rateTable[distanceBand] || rateTable.within_10km;
  const qtyBand = Number(liters) >= 20 ? 'over20' : 'under20';
  return band[qtyBand][tier];
}

router.get('/delivery-rules', (req, res) => {
  res.json({ seasons: getSeasons(), tier_labels: TIER_LABELS, rate_table: getRateTable() });
});

// Admin-only (checked here directly, not just at the router-mount level,
// since GET is available to manager/accountant too but editing the rate
// table itself should be admin-only) — lets the rate table and season
// cutoffs be edited from Settings instead of requiring a code change and
// rebuild. Accepts a full or partial replacement of either.
router.put('/delivery-rules', requireAdmin, (req, res) => {
  const { seasons, rate_table } = req.body;
  try {
    if (seasons) setSetting('delivery_seasons', seasons);
    if (rate_table) setSetting('delivery_rate_table', rate_table);
    res.json({ seasons: getSeasons(), tier_labels: TIER_LABELS, rate_table: getRateTable() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET all farms with cow counts and today's collected liters
router.get('/', (req, res) => {
  const today = localDateISO();
  const farms = db.prepare('SELECT * FROM farms ORDER BY is_home DESC, name ASC').all();
  const withStats = farms.map(f => {
    const cows = db.prepare('SELECT COUNT(*) c FROM cows WHERE farm_id = ?').get(f.id).c;
    const activeCows = db.prepare("SELECT COUNT(*) c FROM cows WHERE farm_id = ? AND status = 'Active'").get(f.id).c;
    const litersToday = f.is_home
      ? (db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE farm_id = ? AND date = ?').get(f.id, today).l)
      : (db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_collections WHERE farm_id = ? AND date = ?').get(f.id, today).l);
    return { ...f, cows, active_cows: activeCows, liters_today: litersToday };
  });
  res.json(withStats);
});

router.get('/:id', (req, res) => {
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!farm) return res.status(404).json({ error: 'Farm not found' });
  res.json(farm);
});

router.post('/', (req, res) => {
  const { name, location, contact_name, contact_phone, notes, is_home, distance_band, share_deposit, feed_medicine_deposit } = req.body;
  if (!name || !location) return res.status(400).json({ error: 'name and location are required' });
  const stmt = db.prepare(`INSERT INTO farms (name, location, contact_name, contact_phone, notes, is_home, distance_band, share_deposit, feed_medicine_deposit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name, location, contact_name || null, contact_phone || null, notes || null, is_home ? 1 : 0, distance_band || 'within_10km', Number(share_deposit || 0), Number(feed_medicine_deposit || 0));
  res.status(201).json(db.prepare('SELECT * FROM farms WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Farm not found' });
  // membership_status/approved_at/approved_by are deliberately NOT
  // editable here — they only change through the dedicated
  // approve/revoke-approval endpoints below, so there's always a clear
  // record of when and by whom a member was approved.
  const f = { ...existing, ...req.body };
  db.prepare(`UPDATE farms SET name=?, location=?, contact_name=?, contact_phone=?, notes=?, is_home=?, status=?, distance_band=?, share_deposit=?, feed_medicine_deposit=? WHERE id=?`)
    .run(f.name, f.location, f.contact_name, f.contact_phone, f.notes, f.is_home ? 1 : 0, f.status, f.distance_band || 'within_10km', Number(f.share_deposit || 0), Number(f.feed_medicine_deposit || 0), req.params.id);
  res.json(db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id));
});

// Membership approval — deliberately its own step (not part of the
// general edit form) so there's a clear record of when and by whom a
// member was approved. A Pending member cannot receive a Loan/Borrow
// (see loans.js) until approved.
router.post('/:id/approve', requireAdmin, (req, res) => {
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!farm) return res.status(404).json({ error: 'Farm not found' });
  db.prepare(`UPDATE farms SET membership_status = 'Approved', approved_at = datetime('now'), approved_by = ? WHERE id = ?`)
    .run(req.user.name, req.params.id);
  res.json(db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id));
});

router.post('/:id/revoke-approval', requireAdmin, (req, res) => {
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!farm) return res.status(404).json({ error: 'Farm not found' });
  db.prepare(`UPDATE farms SET membership_status = 'Pending', approved_at = NULL, approved_by = NULL WHERE id = ?`)
    .run(req.params.id);
  res.json(db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM farms WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Collections logged against a partner farm (network milk intake)
router.get('/:id/collections', (req, res) => {
  const { start, end } = req.query;
  let q = 'SELECT * FROM milk_collections WHERE farm_id = ?';
  const params = [req.params.id];
  if (start && end) { q += ' AND date BETWEEN ? AND ?'; params.push(start, end); }
  q += ' ORDER BY date DESC';
  res.json(db.prepare(q).all(...params));
});

router.post('/:id/collections', (req, res) => {
  const { date, session, delivered_at, liters, tank_id, notes } = req.body;
  if (!date || liters === undefined) return res.status(400).json({ error: 'date and liters are required' });
  const farm = db.prepare('SELECT * FROM farms WHERE id = ?').get(req.params.id);
  if (!farm) return res.status(404).json({ error: 'Farm not found' });

  const sess = session === 'PM' ? 'PM' : 'AM';
  // The rate is computed here, server-side, from the farm's distance
  // band + season + delivery time + quantity — NOT taken from whatever
  // the client submits — so it can't be tampered with and always stays
  // consistent with the official rate table.
  const season = seasonFor(date);
  const tier = tierFor(season, sess, delivered_at || null);
  const normalRate = rateFor(farm.distance_band, liters, 0);
  const rate = rateFor(farm.distance_band, liters, tier);
  // Informational only — the late deduction is already baked into
  // `rate`, this just makes it visible on the collection/invoice as
  // "how much was lost to lateness" rather than a separate charge.
  const penaltyAmount = Math.round((normalRate - rate) * liters * 100) / 100;
  const bonusNote = `${TIER_LABELS[tier]} delivery${tier > 0 ? ` (₹${rate}/L, normally ₹${normalRate}/L)` : ` (₹${rate}/L)`}`;

  const txn = db.transaction(() => {
    const info = db.prepare(`INSERT INTO milk_collections
      (farm_id, date, session, delivered_at, liters, rate_per_liter, bonus_amount, penalty_amount, bonus_note, tank_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.params.id, date, sess, delivered_at || null, liters, rate, 0, penaltyAmount, bonusNote, tank_id || null, notes || null);
    if (tank_id) {
      const tank = db.prepare('SELECT * FROM inventory_tanks WHERE id = ?').get(tank_id);
      if (tank) {
        db.prepare('UPDATE inventory_tanks SET current_liters = current_liters + ? WHERE id = ?').run(liters, tank_id);
        db.prepare(`INSERT INTO tank_logs (tank_id, date, change_liters, reason, notes) VALUES (?, ?, ?, 'Collection', ?)`)
          .run(tank_id, date, liters, `Collection from farm #${req.params.id}`);
      }
    }
    return info.lastInsertRowid;
  });
  const id = txn();
  res.status(201).json(db.prepare('SELECT * FROM milk_collections WHERE id = ?').get(id));
});

module.exports = router;
