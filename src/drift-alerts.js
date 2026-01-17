/**
 * Portfolio Drift Alerts Module
 * Monitors portfolio drift and generates alerts
 */

import fs from 'fs';
import path from 'path';
import { calculatePortfolio } from './portfolio.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const ALERTS_FILE = path.join(DATA_DIR, 'drift-alerts.json');
const HISTORY_FILE = path.join(DATA_DIR, 'drift-history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Alert severity levels
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

/**
 * Load drift alert configuration
 */
export function loadAlertConfig() {
  const defaultConfig = {
    thresholds: {
      warning: 0.05,    // 5% drift triggers warning
      critical: 0.10,   // 10% drift triggers critical
    },
    checkInterval: 60,   // minutes between checks
    notifications: {
      email: false,
      slack: false,
      console: true
    },
    cooldown: 240,       // minutes before re-alerting same issue
  };

  try {
    const configPath = path.join(DATA_DIR, 'alert-config.json');
    if (fs.existsSync(configPath)) {
      return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    }
  } catch (e) {
    // Use defaults
  }

  return defaultConfig;
}

/**
 * Load alert history
 */
function loadAlerts() {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      return JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf-8'));
    }
  } catch (e) {
    // Return empty
  }
  return [];
}

/**
 * Save alerts
 */
function saveAlerts(alerts) {
  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
}

/**
 * Load drift history for analysis
 */
export function loadDriftHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch (e) {
    // Return empty
  }
  return [];
}

/**
 * Save drift snapshot to history
 */
function saveDriftSnapshot(positions) {
  const history = loadDriftHistory();

  const snapshot = {
    timestamp: new Date().toISOString(),
    positions: positions.map(p => ({
      symbol: p.symbol,
      actualAllocation: p.actualAllocation,
      targetAllocation: p.targetAllocation,
      drift: p.drift,
      value: p.value
    }))
  };

  history.push(snapshot);

  // Keep last 30 days (assuming hourly checks = 720 records)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const filtered = history.filter(h => new Date(h.timestamp) > cutoff);

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2));
}

/**
 * Check for drift alerts
 */
export async function checkDriftAlerts() {
  const config = loadAlertConfig();
  const portfolio = await calculatePortfolio();

  if (portfolio.error) {
    return { error: portfolio.error, alerts: [] };
  }

  const alerts = [];
  const existingAlerts = loadAlerts();
  const now = new Date();

  // Save snapshot for history
  saveDriftSnapshot(portfolio.positions);

  for (const position of portfolio.positions) {
    const absDrift = Math.abs(position.drift);
    let severity = null;

    if (absDrift >= config.thresholds.critical) {
      severity = AlertSeverity.CRITICAL;
    } else if (absDrift >= config.thresholds.warning) {
      severity = AlertSeverity.WARNING;
    }

    if (severity) {
      // Check cooldown
      const lastAlert = existingAlerts.find(a =>
        a.symbol === position.symbol &&
        a.severity === severity &&
        (now - new Date(a.timestamp)) < config.cooldown * 60 * 1000
      );

      if (!lastAlert) {
        const alert = {
          id: `${position.symbol}-${Date.now()}`,
          symbol: position.symbol,
          severity,
          drift: position.drift,
          driftPercent: position.driftPercent,
          actualAllocation: position.actualAllocation,
          targetAllocation: position.targetAllocation,
          value: position.value,
          timestamp: now.toISOString(),
          acknowledged: false
        };

        alerts.push(alert);
      }
    }
  }

  // Save new alerts
  if (alerts.length > 0) {
    const updatedAlerts = [...existingAlerts, ...alerts];
    // Keep last 100 alerts
    saveAlerts(updatedAlerts.slice(-100));
  }

  return {
    alerts,
    positions: portfolio.positions,
    totalValue: portfolio.totalValue,
    timestamp: portfolio.timestamp
  };
}

/**
 * Get active (unacknowledged) alerts
 */
export function getActiveAlerts() {
  const alerts = loadAlerts();
  return alerts.filter(a => !a.acknowledged);
}

/**
 * Acknowledge an alert
 */
export function acknowledgeAlert(alertId) {
  const alerts = loadAlerts();
  const alert = alerts.find(a => a.id === alertId);

  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    saveAlerts(alerts);
    return alert;
  }

  return null;
}

/**
 * Format alerts for display
 */
export function formatAlerts(alerts) {
  if (alerts.length === 0) {
    return 'No drift alerts';
  }

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║                    DRIFT ALERTS                               ║',
    '╠═══════════════════════════════════════════════════════════════╣'
  ];

  for (const alert of alerts) {
    const icon = alert.severity === AlertSeverity.CRITICAL ? '🔴' : '🟡';
    const direction = alert.drift > 0 ? 'OVER' : 'UNDER';

    lines.push(`║ ${icon} ${alert.symbol.padEnd(6)} ${alert.severity.toUpperCase().padEnd(10)} ${direction}weight by ${Math.abs(parseFloat(alert.driftPercent)).toFixed(1)}%`.padEnd(63) + '║');
    lines.push(`║    Target: ${(alert.targetAllocation * 100).toFixed(0)}%  Actual: ${(alert.actualAllocation * 100).toFixed(0)}%  Value: $${formatMoney(alert.value)}`.padEnd(63) + '║');
    lines.push('╠───────────────────────────────────────────────────────────────╣');
  }

  lines.pop(); // Remove last separator
  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

function formatMoney(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Get drift trend for a symbol
 */
export function getDriftTrend(symbol, days = 7) {
  const history = loadDriftHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const relevant = history
    .filter(h => new Date(h.timestamp) > cutoff)
    .map(h => {
      const pos = h.positions.find(p => p.symbol === symbol);
      return pos ? { timestamp: h.timestamp, drift: pos.drift } : null;
    })
    .filter(Boolean);

  if (relevant.length < 2) {
    return { trend: 'insufficient_data', points: relevant.length };
  }

  const first = relevant[0].drift;
  const last = relevant[relevant.length - 1].drift;
  const change = last - first;

  let trend;
  if (Math.abs(change) < 0.01) trend = 'stable';
  else if (change > 0) trend = 'increasing';
  else trend = 'decreasing';

  return {
    trend,
    change,
    changePercent: (change * 100).toFixed(2),
    dataPoints: relevant.length,
    firstDrift: (first * 100).toFixed(2),
    lastDrift: (last * 100).toFixed(2)
  };
}

/**
 * Generate rebalancing recommendation
 */
export async function getRebalanceRecommendation() {
  const portfolio = await calculatePortfolio();

  if (portfolio.error) {
    return { error: portfolio.error };
  }

  const recommendations = [];

  for (const position of portfolio.positions) {
    if (position.needsRebalance) {
      const targetValue = portfolio.totalValue * position.targetAllocation;
      const currentValue = position.value;
      const diff = targetValue - currentValue;

      recommendations.push({
        symbol: position.symbol,
        action: diff > 0 ? 'BUY' : 'SELL',
        currentValue,
        targetValue,
        difference: Math.abs(diff),
        shares: position.price > 0 ? Math.abs(diff / position.price) : 0,
        priority: Math.abs(position.drift) > 0.10 ? 'HIGH' : 'MEDIUM'
      });
    }
  }

  // Sort by priority and absolute difference
  recommendations.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'HIGH' ? -1 : 1;
    return b.difference - a.difference;
  });

  return {
    needsRebalance: recommendations.length > 0,
    recommendations,
    totalValue: portfolio.totalValue,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format rebalancing recommendations
 */
export function formatRebalanceReport(result) {
  if (result.error) {
    return `Error: ${result.error}`;
  }

  if (!result.needsRebalance) {
    return 'Portfolio is balanced - no rebalancing needed.';
  }

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║              REBALANCING RECOMMENDATIONS                      ║',
    '╠═══════════════════════════════════════════════════════════════╣'
  ];

  for (const rec of result.recommendations) {
    const icon = rec.action === 'BUY' ? '📈' : '📉';
    const priority = rec.priority === 'HIGH' ? '🔴' : '🟡';

    lines.push(`║ ${priority} ${rec.symbol.padEnd(6)} ${rec.action.padEnd(4)} ~${rec.shares.toFixed(2)} shares`.padEnd(63) + '║');
    lines.push(`║    Value: $${formatMoney(rec.difference)} to reach target`.padEnd(63) + '║');
    lines.push('╠───────────────────────────────────────────────────────────────╣');
  }

  lines.pop();
  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
