const db = require('./db');
const dayjs = require('dayjs');
const bcrypt = require('bcryptjs');

// --- Users: one for each of the four roles ---
const insertUser = db.prepare(`INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)`);
insertUser.run('Owner Admin', 'admin', bcrypt.hashSync('admin123', 10), 'admin');
insertUser.run('James Mwangi', 'manager', bcrypt.hashSync('manager123', 10), 'manager');
insertUser.run('Ruth Achieng', 'accountant', bcrypt.hashSync('acc123', 10), 'accountant');
insertUser.run('Peter Otieno', 'salesman', bcrypt.hashSync('sales123', 10), 'salesman');
console.log('Users created:');
console.log('  admin      / admin123    (Owner/Admin)');
console.log('  manager    / manager123  (Manager)');
console.log('  accountant / acc123      (Accountant)');
console.log('  salesman   / sales123    (Salesman)');

// --- Farms ---
const homeFarm = db.prepare(`INSERT INTO farms (name, location, contact_name, contact_phone, is_home, status)
  VALUES (?, ?, ?, ?, 1, 'Active')`).run('Ima Langnubi Dairy (Home Farm)', 'Kiambu', 'James Mwangi', '+254712345678');
const homeFarmId = homeFarm.lastInsertRowid;

const partnerFarms = [
  ['Acacia Milk Group', 'Machakos', 'Daniel Mutua', '+254700999000'],
  ['Green Valley Dairy', 'Kiambu', 'Peter Kamau', '+254700111222'],
  ['Highland Herds', 'Nyeri', 'Joseph Mwangi', '+254700555666'],
  ['Riverside Farmers', "Murang'a", 'Jane Njeri', '+254700777888'],
  ['Sunrise Cooperative', 'Nakuru', 'Mary Wanjiru', '+254700333444'],
];
const insertFarm = db.prepare(`INSERT INTO farms (name, location, contact_name, contact_phone, is_home, status)
  VALUES (?, ?, ?, ?, 0, 'Active')`);
const partnerIds = partnerFarms.map(f => insertFarm.run(...f).lastInsertRowid);

// --- Cows ---
const breeds = ['Friesian', 'Ayrshire', 'Jersey', 'Holstein', 'Guernsey', 'Crossbreed'];
const insertCow = db.prepare(`INSERT INTO cows (farm_id, tag, name, breed, date_of_birth, status) VALUES (?, ?, ?, ?, ?, ?)`);
const cowNames = ['Daisy', 'Bella', 'Rosie', 'Molly', 'Lola', 'Star', 'Nia', 'Zawadi', 'Amani', 'Furaha'];
let cowCounter = 1;
const allCowIds = [];
[homeFarmId, ...partnerIds].forEach((farmId) => {
  const count = farmId === homeFarmId ? 6 : 2;
  for (let i = 0; i < count; i++) {
    const tag = `KE${String(cowCounter).padStart(3, '0')}`;
    const dob = dayjs().subtract(5 + Math.floor(Math.random() * 4), 'year').format('YYYY-MM-DD');
    const info = insertCow.run(farmId, tag, cowNames[cowCounter % cowNames.length], breeds[cowCounter % breeds.length], dob, 'Active');
    allCowIds.push({ id: info.lastInsertRowid, farmId, tag });
    cowCounter++;
  }
});

// --- Inventory tanks ---
const insertTank = db.prepare(`INSERT INTO inventory_tanks (name, location, capacity_liters, current_liters, status) VALUES (?, ?, ?, ?, ?)`);
const tankA = insertTank.run('Cooling Tank A', 'Main collection center - Kiambu', 5000, 1800, 'Active');
const tankB = insertTank.run('Cooling Tank B', 'Main collection center - Kiambu', 3000, 900, 'Active');
insertTank.run('Mobile Chiller 1', 'Machakos route', 1000, 200, 'Active');
const tankIds = [tankA.lastInsertRowid, tankB.lastInsertRowid];

// --- Milk records (home farm, last 7 days) ---
const insertMilk = db.prepare(`INSERT INTO milk_records (farm_id, cow_id, date, session, liters) VALUES (?, ?, ?, ?, ?)`);
const homeCows = allCowIds.filter(c => c.farmId === homeFarmId);
for (let d = 6; d >= 1; d--) {
  const date = dayjs().subtract(d, 'day').format('YYYY-MM-DD');
  homeCows.forEach(c => {
    insertMilk.run(homeFarmId, c.id, date, 'AM', Math.round((8 + Math.random() * 8) * 10) / 10);
    insertMilk.run(homeFarmId, c.id, date, 'PM', Math.round((6 + Math.random() * 7) * 10) / 10);
  });
}

// --- Network collections (last 30 days), into tanks ---
const insertCollection = db.prepare(`INSERT INTO milk_collections (farm_id, date, liters, rate_per_liter, tank_id) VALUES (?, ?, ?, ?, ?)`);
partnerIds.forEach((farmId, i) => {
  for (let d = 29; d >= 0; d--) {
    const date = dayjs().subtract(d, 'day').format('YYYY-MM-DD');
    insertCollection.run(farmId, date, Math.round((400 + Math.random() * 400)), 60, tankIds[i % tankIds.length]);
  }
});

// --- Milk quality tests (recent, per partner farm) ---
const insertQuality = db.prepare(`INSERT INTO milk_quality_tests
  (farm_id, date, fat_percent, snf_percent, density, temperature_c, adulteration_result, tested_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
partnerIds.forEach((farmId, i) => {
  for (let d = 4; d >= 0; d--) {
    const date = dayjs().subtract(d, 'day').format('YYYY-MM-DD');
    const fat = Math.round((3.4 + Math.random() * 1.2) * 10) / 10;
    const snf = Math.round((8.2 + Math.random() * 0.8) * 10) / 10;
    const fail = i === 3 && d === 1; // one deliberate failed test for demo purposes
    insertQuality.run(farmId, date, fat, snf, 1.028 + Math.random() * 0.004, 4 + Math.random() * 2,
      fail ? 'Fail' : 'Pass', 'Grace Njeri');
  }
});

// --- Financial transactions ---
const insertTxn = db.prepare(`INSERT INTO financial_transactions (date, type, category, description, amount) VALUES (?, ?, ?, ?, ?)`);
insertTxn.run(dayjs().subtract(7, 'day').format('YYYY-MM-DD'), 'Income', 'Milk Sales', 'Weekly milk sales to KCC', 12500);
insertTxn.run(dayjs().subtract(6, 'day').format('YYYY-MM-DD'), 'Expense', 'Feed', 'Dairy meal purchase - 5 bags', 8500);
insertTxn.run(dayjs().subtract(4, 'day').format('YYYY-MM-DD'), 'Income', 'Milk Sales', 'Milk sales - retail customers', 13200);
insertTxn.run(dayjs().subtract(2, 'day').format('YYYY-MM-DD'), 'Expense', 'Veterinary', 'Annual vaccination program', 3500);
insertTxn.run(dayjs().format('YYYY-MM-DD'), 'Income', 'Milk Sales', 'Today milk sales', 8500);

// --- Health events ---
const insertHealth = db.prepare(`INSERT INTO health_events (cow_id, date, type, description, vet_name, cost, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
insertHealth.run(homeCows[0].id, dayjs().subtract(10, 'day').format('YYYY-MM-DD'), 'Vaccination', 'Annual FMD vaccination', 'Dr. Kimani', 1200, 'Resolved');
insertHealth.run(homeCows[1].id, dayjs().subtract(3, 'day').format('YYYY-MM-DD'), 'Treatment', 'Mastitis treatment - left quarter', 'Dr. Kimani', 2500, 'Resolved');
insertHealth.run(homeCows[3].id, dayjs().format('YYYY-MM-DD'), 'Calving', 'Expected to calve soon, monitoring', 'Grace Njeri', 0, 'In Progress');

// --- Employees ---
const insertEmp = db.prepare(`INSERT INTO employees (name, role, phone, email, farm_id, start_date, salary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
insertEmp.run('James Mwangi', 'Farm Manager', '+254712345678', 'james@farm.com', homeFarmId, '2020-01-14', 45000, 'Active');
insertEmp.run('Wanjiru Kamau', 'Milker', '+254723456789', null, homeFarmId, '2021-02-28', 25000, 'Active');
insertEmp.run('David Ochieng', 'Milker', '+254734567890', null, homeFarmId, '2021-06-09', 25000, 'Active');
insertEmp.run('Grace Njeri', 'Vet Assistant', '+254745678901', 'grace@farm.com', homeFarmId, '2022-02-13', 30000, 'Active');
insertEmp.run('Samuel Kipchoge', 'Driver', '+254756789012', null, homeFarmId, '2020-07-31', 28000, 'Active');

// --- Unified product catalog: milk, tokens, dairy products, feed, medicine ---
const insertProduct = db.prepare(`INSERT INTO products (name, category, unit, price, stock_qty, track_stock, token_liters)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
// Milk itself — price can be overridden per line at checkout (retail vs bulk-discount vs delivery)
insertProduct.run('Fresh Milk', 'Milk', 'litre', 70, 0, 0, null);
// Prepaid tokens
insertProduct.run('Milk Token - Quarter Litre', 'Milk Token', 'token', 20, 0, 0, 0.25);
insertProduct.run('Milk Token - Half Litre', 'Milk Token', 'token', 38, 0, 0, 0.5);
insertProduct.run('Milk Token - One Litre', 'Milk Token', 'token', 70, 0, 0, 1);
// Ima Langnubi's own dairy products
insertProduct.run('Paneer', 'Dairy Product', 'kg', 600, 20, 1, null);
insertProduct.run('Milk Cake', 'Dairy Product', 'piece', 150, 30, 1, null);
insertProduct.run('Curd / Yogurt', 'Dairy Product', 'kg', 250, 25, 1, null);
insertProduct.run('Ghee', 'Dairy Product', 'litre', 1200, 10, 1, null);
// Feed
insertProduct.run('Dairy Meal (70kg bag)', 'Feed', 'bag', 3200, 40, 1, null);
insertProduct.run('Mineral Lick Block', 'Feed', 'piece', 450, 25, 1, null);
insertProduct.run('Hay Bale', 'Feed', 'piece', 500, 60, 1, null);
// Medicine
insertProduct.run('Dewormer (Albendazole)', 'Medicine', 'bottle', 850, 15, 1, null);
insertProduct.run('Mastitis Treatment Tubes', 'Medicine', 'dose', 320, 30, 1, null);
insertProduct.run('Vitamin B-Complex Injection', 'Medicine', 'bottle', 600, 12, 1, null);

// --- Tasks ---
const insertTask = db.prepare(`INSERT INTO tasks (title, description, priority, due_date, assigned_to, status) VALUES (?, ?, ?, ?, ?, ?)`);
insertTask.run('Morning milking', 'Complete AM milking session for all active cows', 'Urgent', dayjs().format('YYYY-MM-DD'), 2, 'Pending');
insertTask.run('Feed distribution', 'Distribute dairy meal to all cows', 'High', dayjs().format('YYYY-MM-DD'), 3, 'Pending');
insertTask.run('Milk delivery to KCC', 'Load and deliver morning milk to KCC collection point', 'High', dayjs().format('YYYY-MM-DD'), 5, 'Pending');
insertTask.run('Barn cleaning', 'Deep clean of milking parlour', 'Medium', dayjs().add(1, 'day').format('YYYY-MM-DD'), 3, 'Pending');
insertTask.run('Monthly stock count', 'Count feed inventory and order restocking', 'Medium', dayjs().subtract(1, 'day').format('YYYY-MM-DD'), 1, 'Pending');

console.log('Seed complete.');
console.log(`Home farm id: ${homeFarmId}`);
console.log(`Partner farm ids: ${partnerIds.join(', ')}`);
