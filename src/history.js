// Historical data storage and trend analysis
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const HISTORY_PATH = join(DATA_DIR, 'history.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadHistory() {
  ensureDataDir();
  if (!existsSync(HISTORY_PATH)) {
    return { snapshots: [] };
  }
  try {
    return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return { snapshots: [] };
  }
}

export function saveSnapshot(data) {
  const history = loadHistory();
  const snapshot = {
    date: new Date().toISOString().split('T')[0],
    timestamp: new Date().toISOString(),
    ...data
  };

  // Only keep one snapshot per day (update if exists)
  const existingIndex = history.snapshots.findIndex(s => s.date === snapshot.date);
  if (existingIndex >= 0) {
    history.snapshots[existingIndex] = snapshot;
  } else {
    history.snapshots.push(snapshot);
  }

  // Keep last 365 days
  history.snapshots = history.snapshots.slice(-365);

  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  return snapshot;
}

export function getSnapshots(days = 30) {
  const history = loadHistory();
  return history.snapshots.slice(-days);
}

export function getTrend(field, days = 7) {
  const snapshots = getSnapshots(days);
  if (snapshots.length < 2) {
    return { trend: 'insufficient_data', change: 0, changePercent: 0 };
  }

  const first = snapshots[0][field];
  const last = snapshots[snapshots.length - 1][field];

  if (first === undefined || last === undefined) {
    return { trend: 'no_data', change: 0, changePercent: 0 };
  }

  const change = last - first;
  const changePercent = first !== 0 ? ((change / first) * 100).toFixed(2) : 0;
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return {
    trend,
    first,
    last,
    change: change.toFixed(2),
    changePercent,
    days: snapshots.length
  };
}

export function formatHistoryReport(days = 30) {
  const snapshots = getSnapshots(days);

  if (snapshots.length === 0) {
    return 'No historical data. Run daemon to collect snapshots.';
  }

  const mnavTrend = getTrend('mnav', 7);
  const valueTrend = getTrend('portfolioValue', 7);

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║                    HISTORICAL TRENDS                          ║',
    '╠═══════════════════════════════════════════════════════════════╣',
    `║  Data points: ${snapshots.length} (last ${days} days)                         ║`,
    '╠═══════════════════════════════════════════════════════════════╣',
    '║  7-Day Trends:                                                ║',
  ];

  const mnavIcon = mnavTrend.trend === 'up' ? '📈' : mnavTrend.trend === 'down' ? '📉' : '➡️';
  const valueIcon = valueTrend.trend === 'up' ? '📈' : valueTrend.trend === 'down' ? '📉' : '➡️';

  lines.push(`║    mNAV: ${mnavIcon} ${mnavTrend.changePercent}% (${mnavTrend.first} → ${mnavTrend.last})              ║`);
  lines.push(`║    Value: ${valueIcon} ${valueTrend.changePercent}% ($${valueTrend.first?.toLocaleString()} → $${valueTrend.last?.toLocaleString()}) ║`);

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║  Recent Snapshots:                                            ║');

  for (const snap of snapshots.slice(-5).reverse()) {
    lines.push(`║    ${snap.date}  mNAV: ${snap.mnav}  Value: $${snap.portfolioValue?.toLocaleString()} ║`);
  }

  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}
