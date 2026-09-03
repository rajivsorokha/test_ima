const db = require('../db/db');

// Four roles: admin (Owner/Admin — full access), manager (day-to-day
// operations + finance/payroll visibility, no user management), accountant
// (finance/payroll/reports/invoices only), salesman (Point of Sale only).
const ROLES = ['admin', 'manager', 'accountant', 'salesman'];

function getUserFromToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return null;
  }
  return db.prepare('SELECT id, name, username, role, status FROM users WHERE id = ?').get(session.user_id);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = getUserFromToken(token);
  if (!user || user.status !== 'Active') {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin/Owner access required' });
  }
  next();
}

// requireRole('admin', 'manager') -> only those roles may proceed
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `This requires one of these roles: ${roles.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireRole, getUserFromToken, ROLES };
