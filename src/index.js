#!/usr/bin/env node
// Analyst Agent - Portfolio Monitoring Tool
import { loadConfig } from './config.js';
import { fetchAllPrices } from './prices.js';
import { calculateMnav, formatMnavReport } from './mnav.js';
import { calculatePortfolio, formatPortfolioReport } from './portfolio.js';
import { checkDriftAlerts, getActiveAlerts, formatAlerts, getDriftTrend, getRebalanceRecommendation, formatRebalanceReport } from './drift-alerts.js';
import { runMonteCarlo, formatMonteCarloReport, runQuickSimulation } from './montecarlo.js';
import { calculateBurnRate, formatBurnReport, addExpense, updateCashBalance, seedSampleData } from './burnrate.js';
import { generateHarvestAlerts, formatHarvestReport, seedTaxLotData, getLots } from './taxharvest.js';
import { formatHistoryReport, getSnapshots } from './history.js';

const command = process.argv[2] || 'analyze';

async function main() {
  console.log('');
  console.log('Analyst Agent - Portfolio Monitor');
  console.log('==================================');
  console.log('');

  switch (command) {
    case 'analyze':
      await runAnalysis();
      break;
    case 'portfolio':
      await showPortfolio();
      break;
    case 'monitor':
      await runMonitor();
      break;
    case 'prices':
      await showPrices();
      break;
    case 'rebalance':
      await showRebalance();
      break;
    case 'alerts':
      await showAlerts();
      break;
    case 'drift-check':
      await runDriftCheck();
      break;
    case 'montecarlo':
      await showMonteCarlo();
      break;
    case 'burnrate':
      showBurnRate();
      break;
    case 'burn-seed':
      seedSampleData();
      console.log('Sample burn rate data seeded.');
      break;
    case 'taxharvest':
      await showTaxHarvest();
      break;
    case 'taxlots':
      showTaxLots();
      break;
    case 'tax-seed':
      seedTaxLotData();
      console.log('Sample tax lot data seeded.');
      break;
    case 'history':
      showHistory();
      break;
    default:
      showHelp();
  }
}

async function runAnalysis() {
  console.log('Fetching current prices...');
  console.log('');

  // mNAV Analysis
  const mnavResult = await calculateMnav();
  console.log(formatMnavReport(mnavResult));
  console.log('');

  // Portfolio with drift
  const portfolioResult = await calculatePortfolio();
  console.log(formatPortfolioReport(portfolioResult));

  // Drift warnings
  if (portfolioResult.positions) {
    const drifted = portfolioResult.positions.filter(p => p.needsRebalance);
    if (drifted.length > 0) {
      console.log('');
      console.log('⚠ DRIFT ALERT: Positions exceeding rebalance threshold:');
      drifted.forEach(p => {
        console.log(`  - ${p.symbol}: ${p.driftPercent}% drift (target: ${(p.targetAllocation*100).toFixed(0)}%, actual: ${(p.actualAllocation*100).toFixed(0)}%)`);
      });
    }
  }
}

async function showPortfolio() {
  console.log('Fetching portfolio data...');
  console.log('');

  const result = await calculatePortfolio();
  console.log(formatPortfolioReport(result));
}

async function runMonitor() {
  // Full dashboard
  const mnavResult = await calculateMnav();
  const portfolioResult = await calculatePortfolio();
  const burnResult = calculateBurnRate(3);

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    PORTFOLIO DASHBOARD                        ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');

  // mNAV section
  const mnavStatus = mnavResult.status === 'UNDERVALUED' ? '🔵' : mnavResult.status === 'OVERVALUED' ? '🔴' : '🟢';
  console.log(`║  mNAV: ${mnavResult.mnav}x ${mnavStatus} ${mnavResult.status.padEnd(30)}    ║`);
  console.log(`║  BTC: $${mnavResult.btcPrice?.toLocaleString().padEnd(15)} MSTR: $${mnavResult.mstrPrice?.toFixed(2).padEnd(10)}  ║`);
  console.log('╠═══════════════════════════════════════════════════════════════╣');

  // Portfolio section
  console.log(`║  Portfolio Value: $${portfolioResult.totalValue?.toLocaleString().padEnd(40)}  ║`);
  for (const p of portfolioResult.positions || []) {
    const driftIcon = p.needsRebalance ? '⚠️' : '✓';
    console.log(`║    ${p.symbol.padEnd(6)} $${p.value?.toLocaleString().padEnd(12)} ${(p.actualAllocation*100).toFixed(0)}% (${p.driftPercent}% drift) ${driftIcon}  ║`);
  }
  console.log('╠═══════════════════════════════════════════════════════════════╣');

  // Burn rate section
  if (burnResult.monthlyBurn > 0) {
    console.log(`║  Monthly Burn: $${burnResult.monthlyBurn?.toLocaleString().padEnd(10)} Runway: ${burnResult.runwayMonths?.toFixed(1)} months  ║`);
  } else {
    console.log('║  Burn Rate: Not configured (run burn-seed for demo)          ║');
  }

  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Last updated: ${new Date().toISOString()}`);
}

async function showPrices() {
  console.log('Current Prices:');
  console.log('---------------');

  const prices = await fetchAllPrices();

  if (prices.BTC) console.log(`BTC:  $${prices.BTC.toLocaleString()}`);
  else console.log('BTC:  Failed to fetch');

  if (prices.MSTR) console.log(`MSTR: $${prices.MSTR.toFixed(2)}`);
  else console.log('MSTR: Failed to fetch');

  if (prices.STRD) console.log(`STRD: $${prices.STRD?.toFixed(2) || 'N/A'}`);
  else console.log('STRD: Failed to fetch');

  console.log('');
  console.log(`Last updated: ${prices.timestamp}`);
}

async function showAlerts() {
  console.log('Checking for drift alerts...');
  console.log('');

  const active = getActiveAlerts();
  console.log(formatAlerts(active));

  if (active.length > 0) {
    console.log('');
    console.log('Drift trends (7 day):');
    for (const alert of active) {
      const trend = getDriftTrend(alert.symbol, 7);
      const icon = trend.trend === 'increasing' ? '📈' : trend.trend === 'decreasing' ? '📉' : '➡️';
      console.log(`  ${alert.symbol}: ${icon} ${trend.trend} (${trend.firstDrift}% → ${trend.lastDrift}%)`);
    }
  }
}

async function runDriftCheck() {
  console.log('Running drift check...');
  console.log('');

  const result = await checkDriftAlerts();

  if (result.error) {
    console.error(`Error: ${result.error}`);
    return;
  }

  if (result.alerts.length === 0) {
    console.log('✓ No new drift alerts');
  } else {
    console.log(`⚠ ${result.alerts.length} new drift alert(s):`);
    console.log('');
    console.log(formatAlerts(result.alerts));
  }
}

async function showRebalance() {
  console.log('Generating rebalancing recommendations...');
  console.log('');

  const result = await getRebalanceRecommendation();
  console.log(formatRebalanceReport(result));
}

async function showMonteCarlo() {
  console.log('Running Monte Carlo simulation...');
  console.log('(1000 simulations, 10 year projection)');
  console.log('');

  const years = parseInt(process.argv[3]) || 10;
  const sims = parseInt(process.argv[4]) || 1000;

  const result = await runMonteCarlo({ years, simulations: sims });
  console.log(formatMonteCarloReport(result));
}

function showBurnRate() {
  console.log('Calculating burn rate...');
  console.log('');

  const months = parseInt(process.argv[3]) || 3;
  const result = calculateBurnRate(months);
  console.log(formatBurnReport(result));
}

async function showTaxHarvest() {
  console.log('Analyzing tax loss harvesting opportunities...');
  console.log('');

  const prices = await fetchAllPrices();
  const alerts = generateHarvestAlerts(prices);
  console.log(formatHarvestReport(alerts));
}

function showTaxLots() {
  console.log('Tax Lots:');
  console.log('');

  const lots = getLots();
  if (lots.length === 0) {
    console.log('No tax lots recorded. Use tax-seed to create sample data.');
    return;
  }

  for (const lot of lots) {
    console.log(`${lot.symbol} - ${lot.shares} shares @ $${lot.costBasis} (${lot.purchaseDate})`);
  }
}

function showHistory() {
  const days = parseInt(process.argv[3]) || 30;
  console.log(`Historical trends (${days} days):`);
  console.log('');
  console.log(formatHistoryReport(days));
}

function showHelp() {
  console.log('Available commands:');
  console.log('  analyze     - Run full analysis (mNAV + portfolio drift)');
  console.log('  portfolio   - Show portfolio breakdown');
  console.log('  prices      - Show current prices');
  console.log('  monitor     - Display dashboard');
  console.log('  alerts      - Show active drift alerts');
  console.log('  drift-check - Check for new drift alerts');
  console.log('  rebalance   - Generate rebalancing recommendations');
  console.log('  montecarlo  - Run Monte Carlo simulations [years] [sims]');
  console.log('  burnrate    - Calculate burn rate and runway [months]');
  console.log('  burn-seed   - Seed sample burn rate data');
  console.log('  taxharvest  - Show tax loss harvesting opportunities');
  console.log('  taxlots     - List all tax lots');
  console.log('  tax-seed    - Seed sample tax lot data');
  console.log('  history     - Show historical trends [days]');
}

main().catch(console.error);
