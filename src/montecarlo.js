/**
 * Monte Carlo Portfolio Simulation Module
 * Simulates future portfolio performance based on historical volatility
 */

import fs from 'fs';
import path from 'path';
import { calculatePortfolio } from './portfolio.js';
import { loadDriftHistory } from './drift-alerts.js';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Default simulation parameters
 */
const DEFAULT_PARAMS = {
  simulations: 1000,     // Number of Monte Carlo runs
  years: 10,             // Projection period
  confidence: [0.05, 0.25, 0.50, 0.75, 0.95], // Percentile bands
};

/**
 * Historical return assumptions (annual)
 * In a real implementation, these would be calculated from actual historical data
 */
const ASSET_PARAMS = {
  BTC: { meanReturn: 0.40, volatility: 0.80, minReturn: -0.80 },
  MSTR: { meanReturn: 0.50, volatility: 1.00, minReturn: -0.90 },
  STRD: { meanReturn: 0.20, volatility: 0.50, minReturn: -0.50 },
  default: { meanReturn: 0.08, volatility: 0.20, minReturn: -0.40 }
};

/**
 * Generate random normal number using Box-Muller transform
 */
function randomNormal() {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Run a single simulation path
 */
function runSimulationPath(positions, years) {
  const monthly = years * 12;
  const path = [{ month: 0, value: positions.reduce((sum, p) => sum + p.value, 0) }];

  // Track each position separately
  const positionValues = positions.map(p => ({
    symbol: p.symbol,
    value: p.value,
    params: ASSET_PARAMS[p.symbol] || ASSET_PARAMS.default
  }));

  for (let month = 1; month <= monthly; month++) {
    let totalValue = 0;

    for (const pos of positionValues) {
      // Monthly return = annual return / 12, volatility = annual vol / sqrt(12)
      const monthlyMean = pos.params.meanReturn / 12;
      const monthlyVol = pos.params.volatility / Math.sqrt(12);

      // Generate random return
      const randomReturn = monthlyMean + monthlyVol * randomNormal();

      // Apply return with floor
      const effectiveReturn = Math.max(randomReturn, pos.params.minReturn / 12);
      pos.value = pos.value * (1 + effectiveReturn);

      totalValue += pos.value;
    }

    path.push({ month, value: totalValue });
  }

  return path;
}

/**
 * Run full Monte Carlo simulation
 */
export async function runMonteCarlo(options = {}) {
  const params = { ...DEFAULT_PARAMS, ...options };

  // Get current portfolio
  const portfolio = await calculatePortfolio();
  if (portfolio.error) {
    return { error: portfolio.error };
  }

  const positions = portfolio.positions;
  const initialValue = portfolio.totalValue;

  console.log(`Running ${params.simulations} simulations over ${params.years} years...`);

  // Run all simulations
  const allPaths = [];
  for (let i = 0; i < params.simulations; i++) {
    allPaths.push(runSimulationPath(positions, params.years));
  }

  // Calculate statistics at each time point
  const monthly = params.years * 12;
  const statistics = [];

  for (let month = 0; month <= monthly; month++) {
    const values = allPaths.map(p => p[month].value).sort((a, b) => a - b);

    const percentiles = {};
    for (const pct of params.confidence) {
      const idx = Math.floor(pct * values.length);
      percentiles[`p${Math.round(pct * 100)}`] = values[idx];
    }

    statistics.push({
      month,
      year: month / 12,
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: values[Math.floor(values.length / 2)],
      min: values[0],
      max: values[values.length - 1],
      ...percentiles
    });
  }

  // Final statistics
  const finalValues = allPaths.map(p => p[p.length - 1].value);
  const finalStats = {
    mean: finalValues.reduce((a, b) => a + b, 0) / finalValues.length,
    median: finalValues.sort((a, b) => a - b)[Math.floor(finalValues.length / 2)],
    min: Math.min(...finalValues),
    max: Math.max(...finalValues),
    probLoss: finalValues.filter(v => v < initialValue).length / finalValues.length,
    probDouble: finalValues.filter(v => v >= initialValue * 2).length / finalValues.length,
    prob5x: finalValues.filter(v => v >= initialValue * 5).length / finalValues.length,
  };

  // Calculate CAGR distribution
  const cagrs = finalValues.map(v => Math.pow(v / initialValue, 1 / params.years) - 1);
  const cagrStats = {
    mean: cagrs.reduce((a, b) => a + b, 0) / cagrs.length,
    median: cagrs.sort((a, b) => a - b)[Math.floor(cagrs.length / 2)],
    min: Math.min(...cagrs),
    max: Math.max(...cagrs),
  };

  return {
    initialValue,
    years: params.years,
    simulations: params.simulations,
    statistics,
    finalStats,
    cagrStats,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format Monte Carlo results
 */
export function formatMonteCarloReport(result) {
  if (result.error) {
    return `Error: ${result.error}`;
  }

  const lines = [
    '╔═══════════════════════════════════════════════════════════════╗',
    '║              MONTE CARLO SIMULATION RESULTS                   ║',
    '╠═══════════════════════════════════════════════════════════════╣',
    `║ Initial Value: $${formatMoney(result.initialValue).padEnd(44)}║`,
    `║ Simulations: ${result.simulations.toString().padEnd(48)}║`,
    `║ Time Horizon: ${result.years} years`.padEnd(64) + '║',
    '╠═══════════════════════════════════════════════════════════════╣',
    '║                    FINAL VALUE PROJECTIONS                    ║',
    '╠═══════════════════════════════════════════════════════════════╣',
  ];

  // Yearly snapshots
  const yearsToShow = [1, 3, 5, 10].filter(y => y <= result.years);
  for (const year of yearsToShow) {
    const monthIdx = year * 12;
    if (monthIdx < result.statistics.length) {
      const stats = result.statistics[monthIdx];
      lines.push(`║ Year ${year}:  5th: $${formatMoney(stats.p5)}  50th: $${formatMoney(stats.p50)}  95th: $${formatMoney(stats.p95)}`.padEnd(64) + '║');
    }
  }

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                    END OF PERIOD STATS                        ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Mean Final Value:    $${formatMoney(result.finalStats.mean).padEnd(40)}║`);
  lines.push(`║ Median Final Value:  $${formatMoney(result.finalStats.median).padEnd(40)}║`);
  lines.push(`║ Best Case:           $${formatMoney(result.finalStats.max).padEnd(40)}║`);
  lines.push(`║ Worst Case:          $${formatMoney(result.finalStats.min).padEnd(40)}║`);

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                    PROBABILITY METRICS                        ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Probability of Loss:     ${(result.finalStats.probLoss * 100).toFixed(1)}%`.padEnd(64) + '║');
  lines.push(`║ Probability of 2x:       ${(result.finalStats.probDouble * 100).toFixed(1)}%`.padEnd(64) + '║');
  lines.push(`║ Probability of 5x:       ${(result.finalStats.prob5x * 100).toFixed(1)}%`.padEnd(64) + '║');

  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push('║                    CAGR DISTRIBUTION                          ║');
  lines.push('╠═══════════════════════════════════════════════════════════════╣');
  lines.push(`║ Mean CAGR:    ${(result.cagrStats.mean * 100).toFixed(1)}%`.padEnd(64) + '║');
  lines.push(`║ Median CAGR:  ${(result.cagrStats.median * 100).toFixed(1)}%`.padEnd(64) + '║');
  lines.push(`║ Min CAGR:     ${(result.cagrStats.min * 100).toFixed(1)}%`.padEnd(64) + '║');
  lines.push(`║ Max CAGR:     ${(result.cagrStats.max * 100).toFixed(1)}%`.padEnd(64) + '║');

  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  lines.push('');
  lines.push('Note: Based on historical volatility assumptions. Past performance');
  lines.push('does not guarantee future results.');

  return lines.join('\n');
}

function formatMoney(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

/**
 * Run a quick simulation with fewer iterations for testing
 */
export async function runQuickSimulation() {
  return runMonteCarlo({ simulations: 100, years: 5 });
}
