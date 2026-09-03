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
  liters REAL NOT NULL,
  rate_per_liter REAL NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_liters REAL NOT NULL,
  rate_per_liter REAL NOT NULL,
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
