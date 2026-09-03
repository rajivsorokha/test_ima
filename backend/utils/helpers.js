function ageFromDob(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth)) return null;
  const diff = Date.now() - birth.getTime();
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(years * 10) / 10;
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

module.exports = { ageFromDob, asyncHandler, tokenLiters, genTokenCode, genSessionToken };
