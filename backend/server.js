require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { requireAuth, requireAdmin, requireRole } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({
  ok: true,
  farm: process.env.FARM_NAME || 'Ima Langnubi Dairy',
  address: process.env.FARM_ADDRESS || 'Thangmeiband Sinam Leikai, Imphal, Manipur',
}));

// Login is open; everything else under /api requires a valid session.
app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth);

// Permission matrix:
//   admin (Owner/Admin) — everything
//   manager             — day-to-day operations + finance/payroll visibility
//   accountant          — finance, payroll, invoices, reports only
//   salesman            — Point of Sale + dashboard only
const opsRoles = requireRole('admin', 'manager');                    // herd/quality/tanks/health/tasks
const financeRoles = requireRole('admin', 'manager', 'accountant');  // money-related
const allRoles = requireRole('admin', 'manager', 'accountant', 'salesman');

app.use('/api/dashboard', require('./routes/dashboard')); // everyone signed in
app.use('/api/pos', require('./routes/pos'));              // everyone signed in (salesman's main tool)
app.use('/api/products', require('./routes/products'));    // read open to all; writes gated inside the route

app.use('/api/cows', opsRoles, require('./routes/cows'));
app.use('/api/milk', opsRoles, require('./routes/milk'));
app.use('/api/quality-tests', opsRoles, require('./routes/qualityTests'));
app.use('/api/tanks', opsRoles, require('./routes/tanks'));
app.use('/api/health-events', opsRoles, require('./routes/health'));
app.use('/api/tasks', opsRoles, require('./routes/tasks'));

app.use('/api/farms', financeRoles, require('./routes/farms'));
app.use('/api/invoices', financeRoles, require('./routes/invoices'));
app.use('/api/reports', financeRoles, require('./routes/reports'));
app.use('/api/finance', financeRoles, require('./routes/finance'));
app.use('/api/employees', financeRoles, require('./routes/employees'));
app.use('/api/backup', requireAdmin, require('./routes/backup'));

// Admin/Owner-only account management lives inside routes/auth.js itself
// (POST/PUT/DELETE /api/auth/users are gated there with requireAdmin).

// Serve the built frontend (for Tauri / standalone use)
const frontendDist = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ima Langnubi Dairy API running at http://localhost:${PORT}`);
});
