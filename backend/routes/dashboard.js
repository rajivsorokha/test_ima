const express = require('express');
const router = express.Router();
const db = require('../db/db');

router.get('/', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const activeCows = db.prepare("SELECT COUNT(*) c FROM cows WHERE status = 'Active'").get().c;
  const todaysYield = db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ?').get(today).l;
  const todaysCollected = db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_collections WHERE date = ?').get(today).l;

  const totalIncome = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM financial_transactions WHERE type='Income'").get().t;
  const totalExpense = db.prepare("SELECT COALESCE(SUM(amount),0) t FROM financial_transactions WHERE type='Expense'").get().t;
  const runningBalance = totalIncome - totalExpense;

  const overdueTasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE status != 'Done' AND due_date < ?").get(today).c;

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const own = db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date = ?').get(iso).l;
    const network = db.prepare('SELECT COALESCE(SUM(liters),0) l FROM milk_collections WHERE date = ?').get(iso).l;
    trend.push({ date: iso, liters: own + network });
  }

  const tasks = db.prepare("SELECT * FROM tasks WHERE status != 'Done' ORDER BY due_date ASC LIMIT 6").all();
  const recentTransactions = db.prepare('SELECT * FROM financial_transactions ORDER BY date DESC, id DESC LIMIT 6').all();
  const recentHealthEvents = db.prepare(`SELECT h.*, c.tag as cow_tag FROM health_events h
    JOIN cows c ON c.id = h.cow_id ORDER BY h.date DESC LIMIT 6`).all();

  const networkFarms = db.prepare("SELECT COUNT(*) c FROM farms WHERE is_home = 0 AND status='Active'").get().c;
  const networkCows = db.prepare('SELECT COUNT(*) c FROM cows').get().c;
  const dailyTarget = Number(process.env.DAILY_TARGET_LITERS || 7000);
  const periodCollected = db.prepare("SELECT COALESCE(SUM(liters),0) l FROM milk_collections WHERE date >= date('now','-29 day')").get().l
    + db.prepare("SELECT COALESCE(SUM(liters),0) l FROM milk_records WHERE date >= date('now','-29 day')").get().l;

  res.json({
    active_cows: activeCows,
    todays_yield: todaysYield,
    todays_collected_network: todaysCollected,
    running_balance: runningBalance,
    overdue_tasks: overdueTasks,
    trend,
    tasks,
    recent_transactions: recentTransactions,
    recent_health_events: recentHealthEvents,
    network: {
      partner_farms: networkFarms,
      cows_across_network: networkCows,
      collected_in_period: periodCollected,
      daily_target: dailyTarget
    }
  });
});

module.exports = router;
