/**
 * Burn Rate Tracking Module
 * Tracks expenses and calculates runway for startups/projects
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');
const REVENUE_FILE = path.join(DATA_DIR, 'revenue.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Load expenses data
 */
function loadExpenses() {
  try {
    if (fs.existsSync(EXPENSES_FILE)) {
      return JSON.parse(fs.readFileSync(EXPENSES_FILE, 'utf-8'));
    }
  } catch (e) {
    // Return default
  }
  return {
    categories: [],
    entries: [],
    monthlyBudget: 0
  };
}

/**
 * Save expenses data
 */
function saveExpenses(data) {
  fs.writeFileSync(EXPENSES_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load revenue data
 */
function loadRevenue() {
  try {
    if (fs.existsSync(REVENUE_FILE)) {
      return JSON.parse(fs.readFileSync(REVENUE_FILE, 'utf-8'));
    }
  } catch (e) {
    // Return default
  }
  return {
    entries: [],
    mrr: 0,
    cashBalance: 0
  };
}

/**
 * Save revenue data
 */
function saveRevenue(data) {
  fs.writeFileSync(REVENUE_FILE, JSON.stringify(data, null, 2));
}

/**
 * Add an expense entry
 */
export function addExpense(entry) {
  const data = loadExpenses();

  const expense = {
    id: Date.now().toString(36),
    date: entry.date || new Date().toISOString().split('T')[0],
    amount: entry.amount,
    category: entry.category || 'other',
    description: entry.description || '',
    recurring: entry.recurring || false,
    frequency: entry.frequency || 'one-time'
  };

  data.entries.push(expense);

  // Add category if new
  if (!data.categories.includes(expense.category)) {
    data.categories.push(expense.category);
  }

  saveExpenses(data);
  return expense;
}

/**
 * Add revenue entry
 */
export function addRevenue(entry) {
  const data = loadRevenue();

  const revenue = {
    id: Date.now().toString(36),
    date: entry.date || new Date().toISOString().split('T')[0],
    amount: entry.amount,
    source: entry.source || 'sales',
    description: entry.description || '',
    recurring: entry.recurring || false
  };

  data.entries.push(revenue);
  saveRevenue(data);
  return revenue;
}

/**
 * Update cash balance
 */
export function updateCashBalance(balance) {
  const data = loadRevenue();
  data.cashBalance = balance;
  data.balanceUpdated = new Date().toISOString();
  saveRevenue(data);
  return data;
}

/**
 * Update MRR
 */
export function updateMRR(mrr) {
  const data = loadRevenue();
  data.mrr = mrr;
  data.mrrUpdated = new Date().toISOString();
  saveRevenue(data);
  return data;
}

/**
 * Calculate monthly burn rate
 */
export function calculateBurnRate(months = 3) {
  const expenses = loadExpenses();
  const revenue = loadRevenue();

  const now = new Date();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  // Filter recent expenses
  const recentExpenses = expenses.entries.filter(e =>
    new Date(e.date) >= cutoff
  );

  // Filter recent revenue
  const recentRevenue = revenue.entries.filter(r =>
    new Date(r.date) >= cutoff
  );

  // Calculate totals
  const totalExpenses = recentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalRevenue = recentRevenue.reduce((sum, r) => sum + r.amount, 0);

  // Calculate recurring monthly costs
  const recurringMonthly = expenses.entries
    .filter(e => e.recurring && e.frequency === 'monthly')
    .reduce((sum, e) => sum + e.amount, 0);

  const recurringAnnual = expenses.entries
    .filter(e => e.recurring && e.frequency === 'annual')
    .reduce((sum, e) => sum + e.amount / 12, 0);

  // Average monthly expense
  const avgMonthlyExpense = months > 0 ? totalExpenses / months : 0;

  // Gross burn = total expenses
  const grossBurn = avgMonthlyExpense;

  // Net burn = expenses - revenue
  const avgMonthlyRevenue = months > 0 ? totalRevenue / months : 0;
  const netBurn = grossBurn - avgMonthlyRevenue;

  // Calculate runway
  const cashBalance = revenue.cashBalance || 0;
  const runwayMonths = netBurn > 0 ? cashBalance / netBurn : Infinity;

  // Expenses by category
  const byCategory = {};
  for (const expense of recentExpenses) {
    if (!byCategory[expense.category]) {
      byCategory[expense.category] = 0;
    }
    byCategory[expense.category] += expense.amount;
  }

  return {
    period: {
      months,
      from: cutoff.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0]
    },
    expenses: {
      total: totalExpenses,
      avgMonthly: avgMonthlyExpense,
      recurringMonthly: recurringMonthly + recurringAnnual,
      byCategory
    },
    revenue: {
      total: totalRevenue,
      avgMonthly: avgMonthlyRevenue,
      mrr: revenue.mrr || 0
    },
    burnRate: {
      gross: grossBurn,
      net: netBurn
    },
    runway: {
      cashBalance,
      months: runwayMonths,
      runwayDate: runwayMonths !== Infinity
        ? new Date(now.getTime() + runwayMonths * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        : 'N/A'
    },
    timestamp: now.toISOString()
  };
}

/**
 * Format burn rate report
 */
export function formatBurnReport(result) {
  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║                    BURN RATE ANALYSIS                         ║',
    '╠═══════════════════════════════════════════════════════════════╣',
    `║ Period: ${result.period.from} to ${result.period.to} (${result.period.months} months)`.padEnd(64) + '║',
    '╠═══════════════════════════════════════════════════════════════╣',
    '║                        EXPENSES                               ║',
    '╠═══════════════════════════════════════════════════════════════╣',
    `║ Total Expenses:        $${formatMoney(result.expenses.total).padEnd(37)}║`,
    `║ Avg Monthly:           $${formatMoney(result.expenses.avgMonthly).padEnd(37)}║`,
    `║ Recurring Monthly:     $${formatMoney(result.expenses.recurringMonthly).padEnd(37)}║`,
  ];

  // Expenses by category
  const categories = Object.entries(result.expenses.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (categories.length > 0) {
    lines.push('╠───────────────────────────────────────────────────────────────╣');
    lines.push('║ By Category:'.padEnd(64) + '║');
    for (const [cat, amount] of categories) {
      const pct = (amount / result.expenses.total * 100).toFixed(0);
      lines.push(`║   ${cat.padEnd(18)} $${formatMoney(amount).padEnd(12)} (${pct}%)`.padEnd(64) + '║');
    }
  }

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                        REVENUE                                ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Total Revenue:         $${formatMoney(result.revenue.total).padEnd(37)}║`);
  lines.push(`║ Avg Monthly:           $${formatMoney(result.revenue.avgMonthly).padEnd(37)}║`);
  lines.push(`║ Current MRR:           $${formatMoney(result.revenue.mrr).padEnd(37)}║`);

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                      BURN RATE                                ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Gross Burn:            $${formatMoney(result.burnRate.gross).padEnd(37)}║`);
  lines.push(`║ Net Burn:              $${formatMoney(result.burnRate.net).padEnd(37)}║`);

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                       RUNWAY                                  ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Cash Balance:          $${formatMoney(result.runway.cashBalance).padEnd(37)}║`);

  if (result.runway.months === Infinity) {
    lines.push('║ Runway:                ∞ (revenue covers expenses)'.padEnd(64) + '║');
  } else {
    const runwayStr = result.runway.months.toFixed(1);
    const severity = result.runway.months < 6 ? '🔴' : result.runway.months < 12 ? '🟡' : '🟢';
    lines.push(`║ Runway:                ${severity} ${runwayStr} months (until ${result.runway.runwayDate})`.padEnd(63) + '║');
  }

  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

function formatMoney(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Seed sample data for testing
 */
export function seedSampleData() {
  const expenses = {
    categories: ['payroll', 'infrastructure', 'software', 'marketing', 'office'],
    entries: [
      { id: '1', date: '2026-01-01', amount: 15000, category: 'payroll', recurring: true, frequency: 'monthly' },
      { id: '2', date: '2026-01-01', amount: 2500, category: 'infrastructure', recurring: true, frequency: 'monthly' },
      { id: '3', date: '2026-01-01', amount: 500, category: 'software', recurring: true, frequency: 'monthly' },
      { id: '4', date: '2026-01-05', amount: 3000, category: 'marketing', recurring: false },
      { id: '5', date: '2025-12-15', amount: 12000, category: 'payroll', recurring: true, frequency: 'monthly' },
      { id: '6', date: '2025-12-01', amount: 2500, category: 'infrastructure', recurring: true, frequency: 'monthly' },
    ],
    monthlyBudget: 25000
  };

  const revenue = {
    entries: [
      { id: '1', date: '2026-01-01', amount: 5000, source: 'subscriptions', recurring: true },
      { id: '2', date: '2025-12-01', amount: 4500, source: 'subscriptions', recurring: true },
    ],
    mrr: 5000,
    cashBalance: 150000
  };

  saveExpenses(expenses);
  saveRevenue(revenue);

  return { expenses, revenue };
}
