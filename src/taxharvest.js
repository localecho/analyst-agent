/**
 * Tax Loss Harvesting Alerts Module
 * Identifies opportunities to harvest tax losses
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const LOTS_FILE = path.join(DATA_DIR, 'tax-lots.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Tax rates (2026 estimates)
 */
const TAX_RATES = {
  shortTermCapitalGains: 0.37,  // Ordinary income rate (max)
  longTermCapitalGains: 0.20,   // Long-term rate
  netInvestmentIncome: 0.038,   // NIIT
};

/**
 * Load tax lots
 */
function loadLots() {
  try {
    if (fs.existsSync(LOTS_FILE)) {
      return JSON.parse(fs.readFileSync(LOTS_FILE, 'utf-8'));
    }
  } catch (e) {
    // Return default
  }
  return [];
}

/**
 * Save tax lots
 */
function saveLots(lots) {
  fs.writeFileSync(LOTS_FILE, JSON.stringify(lots, null, 2));
}

/**
 * Add a tax lot (purchase)
 */
export function addLot(lot) {
  const lots = loadLots();

  const newLot = {
    id: Date.now().toString(36),
    symbol: lot.symbol.toUpperCase(),
    shares: lot.shares,
    costBasis: lot.costBasis,
    purchaseDate: lot.purchaseDate || new Date().toISOString().split('T')[0],
    account: lot.account || 'default',
    notes: lot.notes || ''
  };

  lots.push(newLot);
  saveLots(lots);
  return newLot;
}

/**
 * Calculate holding period
 */
function getHoldingPeriod(purchaseDate) {
  const purchase = new Date(purchaseDate);
  const now = new Date();
  const days = Math.floor((now - purchase) / (1000 * 60 * 60 * 24));
  const isLongTerm = days > 365;

  return {
    days,
    isLongTerm,
    type: isLongTerm ? 'long-term' : 'short-term'
  };
}

/**
 * Analyze tax lots for harvesting opportunities
 */
export function analyzeHarvestingOpportunities(currentPrices) {
  const lots = loadLots();
  const opportunities = [];

  for (const lot of lots) {
    const currentPrice = currentPrices[lot.symbol];
    if (!currentPrice) continue;

    const currentValue = currentPrice * lot.shares;
    const costBasisTotal = lot.costBasis * lot.shares;
    const gainLoss = currentValue - costBasisTotal;
    const gainLossPercent = (gainLoss / costBasisTotal) * 100;

    const holding = getHoldingPeriod(lot.purchaseDate);

    // Only consider positions with losses
    if (gainLoss < 0) {
      const taxRate = holding.isLongTerm
        ? TAX_RATES.longTermCapitalGains
        : TAX_RATES.shortTermCapitalGains;

      const potentialTaxSavings = Math.abs(gainLoss) * taxRate;

      opportunities.push({
        lot,
        currentPrice,
        currentValue,
        costBasisTotal,
        gainLoss,
        gainLossPercent,
        holding,
        potentialTaxSavings,
        priority: calculatePriority(gainLoss, holding, gainLossPercent)
      });
    }
  }

  // Sort by priority (higher = better opportunity)
  opportunities.sort((a, b) => b.priority - a.priority);

  return opportunities;
}

/**
 * Calculate harvesting priority
 */
function calculatePriority(gainLoss, holding, gainLossPercent) {
  let priority = 0;

  // Larger losses are higher priority
  priority += Math.min(Math.abs(gainLoss) / 1000, 50);

  // Short-term losses are more valuable (higher tax rate)
  if (!holding.isLongTerm) {
    priority += 20;
  }

  // Significant percentage losses
  if (gainLossPercent < -20) {
    priority += 15;
  } else if (gainLossPercent < -10) {
    priority += 10;
  }

  // Positions approaching 1-year mark (about to become long-term)
  if (!holding.isLongTerm && holding.days > 300) {
    priority += 25; // Urgent to harvest before becoming long-term
  }

  return priority;
}

/**
 * Generate harvest alerts based on thresholds
 */
export function generateHarvestAlerts(currentPrices, options = {}) {
  const {
    minLoss = 500,           // Minimum loss to consider
    minLossPercent = 5,      // Minimum % loss
    urgentDaysToLongTerm = 30 // Alert if approaching long-term
  } = options;

  const opportunities = analyzeHarvestingOpportunities(currentPrices);

  const alerts = opportunities.filter(opp => {
    const meetsMinLoss = Math.abs(opp.gainLoss) >= minLoss;
    const meetsMinPercent = Math.abs(opp.gainLossPercent) >= minLossPercent;
    return meetsMinLoss && meetsMinPercent;
  });

  // Mark urgent alerts
  for (const alert of alerts) {
    const daysToLongTerm = 365 - alert.holding.days;
    alert.urgent = !alert.holding.isLongTerm && daysToLongTerm <= urgentDaysToLongTerm;
    alert.daysToLongTerm = daysToLongTerm;
  }

  return alerts;
}

/**
 * Format tax harvesting report
 */
export function formatHarvestReport(opportunities) {
  if (opportunities.length === 0) {
    return 'No tax loss harvesting opportunities found.';
  }

  const totalPotentialSavings = opportunities.reduce((sum, o) => sum + o.potentialTaxSavings, 0);

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║              TAX LOSS HARVESTING OPPORTUNITIES                ║',
    '╠═══════════════════════════════════════════════════════════════╣',
    `║ Total Opportunities: ${opportunities.length.toString().padEnd(41)}║`,
    `║ Potential Tax Savings: $${formatMoney(totalPotentialSavings).padEnd(37)}║`,
    '╠═══════════════════════════════════════════════════════════════╣',
  ];

  for (const opp of opportunities.slice(0, 10)) {
    const urgentIcon = opp.urgent ? '🔴 URGENT ' : '';
    const termType = opp.holding.isLongTerm ? 'LT' : 'ST';

    lines.push(`║ ${urgentIcon}${opp.lot.symbol.padEnd(6)} (${termType})`.padEnd(64) + '║');
    lines.push(`║   Loss: $${formatMoney(Math.abs(opp.gainLoss))} (${opp.gainLossPercent.toFixed(1)}%)`.padEnd(64) + '║');
    lines.push(`║   Tax Savings: ~$${formatMoney(opp.potentialTaxSavings)}`.padEnd(64) + '║');

    if (!opp.holding.isLongTerm) {
      lines.push(`║   Days to long-term: ${opp.daysToLongTerm}`.padEnd(64) + '║');
    }

    lines.push('╠───────────────────────────────────────────────────────────────╣');
  }

  lines.pop();
  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  lines.push('');
  lines.push('Note: Wash sale rules apply - cannot repurchase substantially');
  lines.push('identical securities within 30 days before or after sale.');

  return lines.join('\n');
}

function formatMoney(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Seed sample tax lot data
 */
export function seedTaxLotData() {
  const lots = [
    { id: '1', symbol: 'MSTR', shares: 10, costBasis: 450, purchaseDate: '2025-08-15', account: 'taxable' },
    { id: '2', symbol: 'MSTR', shares: 5, costBasis: 380, purchaseDate: '2025-11-01', account: 'taxable' },
    { id: '3', symbol: 'BTC', shares: 0.5, costBasis: 68000, purchaseDate: '2025-03-01', account: 'taxable' },
    { id: '4', symbol: 'BTC', shares: 0.25, costBasis: 72000, purchaseDate: '2025-12-01', account: 'taxable' },
    { id: '5', symbol: 'STRD', shares: 100, costBasis: 25, purchaseDate: '2025-06-15', account: 'taxable' },
  ];

  saveLots(lots);
  return lots;
}

/**
 * Get all lots
 */
export function getLots() {
  return loadLots();
}
