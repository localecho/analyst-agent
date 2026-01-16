// Portfolio value calculator with position tracking and drift detection
import { fetchAllPrices } from './prices.js';
import { loadConfig, getHoldings, getThresholds } from './config.js';

export async function calculatePortfolio() {
  const config = loadConfig();
  const holdings = getHoldings(config);
  const thresholds = getThresholds(config);
  const prices = await fetchAllPrices();

  if (!prices.BTC || !prices.MSTR) {
    return { error: 'Failed to fetch prices' };
  }

  // Calculate each position's value
  const positions = holdings.map(h => {
    const price = prices[h.symbol];
    const quantity = h.quantity || h.shares || 0;
    const value = price ? price * quantity : 0;

    return {
      symbol: h.symbol,
      quantity,
      price: price || 0,
      value,
      targetAllocation: h.targetAllocation
    };
  });

  // Total portfolio value
  const totalValue = positions.reduce((sum, p) => sum + p.value, 0);

  // Calculate actual allocations and drift
  const positionsWithDrift = positions.map(p => {
    const actualAllocation = totalValue > 0 ? p.value / totalValue : 0;
    const drift = actualAllocation - p.targetAllocation;
    const driftPercent = (drift * 100).toFixed(2);
    const needsRebalance = Math.abs(drift) > thresholds.rebalanceTrigger;

    return {
      ...p,
      actualAllocation,
      drift,
      driftPercent,
      needsRebalance
    };
  });

  return {
    totalValue,
    positions: positionsWithDrift,
    prices,
    thresholds,
    timestamp: new Date().toISOString()
  };
}

export function formatPortfolioReport(result) {
  if (result.error) {
    return `Error: ${result.error}`;
  }

  const lines = [
    '╔═════════════════════════════════════════════════════════════════╗',
    '║                    Portfolio Summary                            ║',
    '╠═════════════════════════════════════════════════════════════════╣',
    `║ Total Value:        $${formatMoney(result.totalValue).padStart(42)} ║`,
    '╠═════════════════════════════════════════════════════════════════╣',
    '║  Symbol    Qty        Price         Value    Target  Actual Drift║',
    '╠═════════════════════════════════════════════════════════════════╣'
  ];

  for (const p of result.positions) {
    const qty = p.quantity.toString().padStart(8);
    const price = formatMoney(p.price).padStart(12);
    const value = formatMoney(p.value).padStart(12);
    const target = (p.targetAllocation * 100).toFixed(0).padStart(5) + '%';
    const actual = (p.actualAllocation * 100).toFixed(0).padStart(5) + '%';
    const drift = p.driftPercent.padStart(5) + '%';
    const flag = p.needsRebalance ? ' ⚠' : '  ';

    lines.push(`║  ${p.symbol.padEnd(6)} ${qty}  $${price}  $${value}  ${target}  ${actual} ${drift}${flag}║`);
  }

  lines.push('╚═════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

function formatMoney(num) {
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}
