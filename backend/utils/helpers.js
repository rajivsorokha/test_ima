function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  const diff = Date.now() - birth.getTime();
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years * 10) / 10;
}

// Returns "YYYY-MM-DD" for a Date using its LOCAL calendar date, not UTC.
// `date.toISOString().slice(0,10)` (used to be scattered throughout this
// codebase) converts to UTC first, which silently shifts the date for
// any timezone ahead of UTC during early-morning hours. India is
// UTC+5:30, so between midnight and 5:30 AM IST, toISOString() still
// reports the PREVIOUS day — exactly the window morning milk collection
// happens in (per the delivery rate table's ~5 AM cutoffs). That mismatch
// caused collections logged in the early morning to be filed under
// yesterday's date, making them invisible to same-day lookups (e.g. POS's
// "Fresh Milk Remaining" showing 0 despite milk having been collected
// that morning). Always use this instead of toISOString() for date-only
// (no time-of-day) values.
function localDateISO(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function tokenLiters(size) {
  const map = { Quarter: 0.25, Half: 0.5, 'One Litre': 1 };
  return map[size] ?? null;
}

function genTokenCode(size) {
  const prefix = { Quarter: 'Q', Half: 'H', 'One Litre': 'L' }[size] || 'T';
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-4)}${rand}`;
}

function genSessionToken() {
  return [...Array(4)].map(() => Math.random().toString(36).slice(2, 10)).join('');
}

module.exports = { ageFromDob, localDateISO, asyncHandler, tokenLiters, genTokenCode, genSessionToken };
