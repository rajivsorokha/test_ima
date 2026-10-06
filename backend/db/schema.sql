-- Ima Langnubi Dairy — full schema

-- =========================== AUTH ===========================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'salesman', -- admin (Owner/Admin), manager, accountant, salesman
  status TEXT NOT NULL DEFAULT 'Active', -- Active, Inactive
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Generic admin-configurable key/value settings (e.g. daily CSV backup
-- time). Deliberately generic so future settings don't each need a new
-- column/table.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- =========================== FARMS & HERD ===========================
CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  notes TEXT,
  is_home INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  distance_band TEXT NOT NULL DEFAULT 'within_10km', -- 'within_10km' or '10km_plus' — used for the delivery rate table
  share_deposit REAL NOT NULL DEFAULT 0, -- member's cooperative share capital, used as loan backing (only meaningful once Approved)
  membership_status TEXT NOT NULL DEFAULT 'Pending', -- 'Pending' or 'Approved' — a Pending member cannot receive a Loan/Borrow
  approved_at TEXT, -- set when moved to Approved
  approved_by TEXT, -- name of the admin who approved them
  feed_medicine_deposit REAL NOT NULL DEFAULT 0, -- amount deposited to enable feed/medicine purchases; tracked only, not auto-enforced
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  name TEXT,
  breed TEXT NOT NULL DEFAULT 'Crossbreed',
  date_of_birth TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  no_of_calving INTEGER NOT NULL DEFAULT 0, -- parity — how many times she's calved
  optimum_yield REAL, -- target/expected yield for her (liters/day), for comparison against actual present production
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milk_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  cow_id INTEGER REFERENCES cows(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT 'AM',
  liters REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_tanks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  capacity_liters REAL NOT NULL DEFAULT 0,
  current_liters REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active', -- Active, Maintenance, Idle
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tank_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tank_id INTEGER NOT NULL REFERENCES inventory_tanks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  change_liters REAL NOT NULL, -- positive = filled/added, negative = drawn off/sold
  reason TEXT, -- Collection, Sale, Transfer, Spoilage, Adjustment
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily collection totals per partner farm (network collection)
CREATE TABLE IF NOT EXISTS milk_collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT 'AM', -- AM (morning) or PM (evening) delivery
  delivered_at TEXT, -- time of day, "HH:MM", used for earliest/late bonus-penalty calc
  liters REAL NOT NULL,
  rate_per_liter REAL NOT NULL DEFAULT 0,
  bonus_amount REAL NOT NULL DEFAULT 0, -- awarded to the earliest delivery per date+session
  penalty_amount REAL NOT NULL DEFAULT 0, -- charged for deliveries after the shift cutoff
  bonus_note TEXT,
  tank_id INTEGER REFERENCES inventory_tanks(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Milk quality tests done at collection (or on home-farm milk)
CREATE TABLE IF NOT EXISTS milk_quality_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  collection_id INTEGER REFERENCES milk_collections(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  session TEXT NOT NULL DEFAULT 'AM', -- AM or PM, matches Milk Collection shifts
  lactometer_reading REAL,
  thermometer_reading REAL,
  quality_score REAL, -- computed: lactometer + (thermometer - 20) / 1.5
  quality_label TEXT, -- 'Low Quality' (<31), 'Warning' (31-32), 'Good' (32+) — editable in Settings
  -- fat_percent/snf_percent/density kept for any pre-existing records from
  -- before the lactometer/thermometer format; no longer shown for new tests.
  fat_percent REAL,
  snf_percent REAL,
  density REAL,
  temperature_c REAL,
  adulteration_result TEXT NOT NULL DEFAULT 'Pass', -- Pass, Fail
  remarks TEXT,
  tested_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================== FINANCE ===========================
CREATE TABLE IF NOT EXISTS financial_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================== HEALTH ===========================
CREATE TABLE IF NOT EXISTS health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cow_id INTEGER NOT NULL REFERENCES cows(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  vet_name TEXT,
  cost REAL DEFAULT 0,
  follow_up_date TEXT,
  status TEXT NOT NULL DEFAULT 'Open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================== PEOPLE ===========================
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  start_date TEXT,
  salary REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'Annual',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium',
  due_date TEXT,
  assigned_to INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================== UNIFIED POINT OF SALE ===========================
-- Every product Ima Langnubi Dairy sells lives in ONE catalog: fresh milk,
-- milk tokens, dairy products (paneer, milk cake, curd...), feed, and medicine.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Dairy Product', -- Milk, Milk Token, Dairy Product, Feed, Medicine, Other
  unit TEXT NOT NULL DEFAULT 'piece',
  price REAL NOT NULL DEFAULT 0,
  stock_qty REAL NOT NULL DEFAULT 0,
  track_stock INTEGER NOT NULL DEFAULT 1, -- 0 for Milk / Milk Token (unlimited SKU)
  token_liters REAL, -- only for category = Milk Token
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One sale = one cart = one checkout, whatever mix of products it contains.
CREATE TABLE IF NOT EXISTS pos_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- defaults server-side to today unless explicitly backdated
  customer_name TEXT,
  customer_phone TEXT,
  sale_channel TEXT NOT NULL DEFAULT 'Counter', -- Counter, Delivery, Bulk
  delivery_charge REAL NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Cash', -- Cash, M-Pesa, Bank Transfer, Credit
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  served_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pos_sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  category TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

-- Prepaid milk tokens. Buying one is a normal cart line item (money changes
-- hands then). Redeeming one later — handing over milk against the token —
-- is NOT a new charge, just a status change, tracked here.
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  product_id INTEGER REFERENCES products(id),
  pos_sale_id INTEGER REFERENCES pos_sales(id) ON DELETE SET NULL,
  size TEXT NOT NULL, -- Quarter, Half, One Litre
  liters REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Issued', -- Issued, Redeemed, Void
  issued_to TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at TEXT
);

-- "Loan" and "Borrow" both live here, distinguished by `kind`:
--  - 'borrow': a quick advance small enough to be recovered from the
--    member's milk bill within the same month — no guarantor needed.
--  - 'loan': bigger than one month's milk earnings can cover — backed by
--    the member's share deposit PLUS 1-2 guarantors (other members),
--    repaid via a fixed installment auto-deducted each invoice cycle.
-- Both charge interest, applied to the outstanding balance each time an
-- invoice touches this loan (see invoices.js).
-- "Loan" (long term) and "Borrow" (short term) both live here — matches
-- the society's actual loan policy across three borrower categories:
--   - Member: backed by share deposit / milk bill balance
--   - Staff:  backed by salary
--   - Landlord: backed by rent amount owed to them
-- Short term = recoverable within about a month, no guarantor needed.
-- Long term = up to ~10 months, needs 1-2 guarantors (society members),
-- and is flagged a Defaulter if still unpaid past 10 months.
-- Both terms charge interest (default 2%/month) on the outstanding balance.
CREATE TABLE IF NOT EXISTS landlords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_phone TEXT,
  rent_amount REAL NOT NULL DEFAULT 0, -- monthly rent owed to them, used as loan eligibility backing
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrower_type TEXT NOT NULL DEFAULT 'member', -- 'member', 'staff', or 'landlord'
  farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE, -- set when borrower_type = 'member'
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, -- set when borrower_type = 'staff'
  landlord_id INTEGER REFERENCES landlords(id) ON DELETE CASCADE, -- set when borrower_type = 'landlord'
  kind TEXT NOT NULL DEFAULT 'short', -- 'short' (short term) or 'long' (long term)
  principal REAL NOT NULL,
  interest_rate REAL NOT NULL DEFAULT 2, -- percent per month, applied to outstanding balance
  installment_amount REAL, -- 'long': fixed per-cycle deduction target. 'short': null = clear in full next cycle.
  guarantor1_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  guarantor2_farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,
  date_issued TEXT NOT NULL,
  balance REAL NOT NULL, -- outstanding principal + accrued interest
  status TEXT NOT NULL DEFAULT 'Active', -- Active, Closed
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  interest_accrued REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'invoice', -- 'invoice' (auto-deducted) or 'manual' (cash/bank)
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_liters REAL NOT NULL,
  rate_per_liter REAL NOT NULL,
  total_bonus REAL NOT NULL DEFAULT 0,
  total_penalty REAL NOT NULL DEFAULT 0,
  total_loan_deduction REAL NOT NULL DEFAULT 0, -- withheld this cycle for active Loans/Borrows
  net_payout REAL NOT NULL DEFAULT 0, -- total_amount - total_loan_deduction; what's actually paid out
  total_amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Unpaid',
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cows_farm ON cows(farm_id);
CREATE INDEX IF NOT EXISTS idx_milk_farm_date ON milk_records(farm_id, date);
CREATE INDEX IF NOT EXISTS idx_collections_farm_date ON milk_collections(farm_id, date);
CREATE INDEX IF NOT EXISTS idx_quality_farm_date ON milk_quality_tests(farm_id, date);
CREATE INDEX IF NOT EXISTS idx_health_cow ON health_events(cow_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON financial_transactions(date);
CREATE INDEX IF NOT EXISTS idx_pos_date ON pos_sales(date);
CREATE INDEX IF NOT EXISTS idx_tank_logs_tank ON tank_logs(tank_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
