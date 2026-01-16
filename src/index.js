#!/usr/bin/env node
// Analyst Agent - Portfolio Monitoring Tool
import { loadConfig } from './config.js';
import { fetchAllPrices } from './prices.js';
import { calculateMnav, formatMnavReport } from './mnav.js';
import { calculatePortfolio, formatPortfolioReport } from './portfolio.js';

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
      console.log('Rebalancing recommendations - coming soon');
      break;
    case 'montecarlo':
      console.log('Monte Carlo simulation - coming soon');
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
  console.log('Dashboard - coming soon');
  console.log('');
  await showPrices();
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

function showHelp() {
  console.log('Available commands:');
  console.log('  analyze    - Run full analysis (mNAV + portfolio drift)');
  console.log('  portfolio  - Show portfolio breakdown');
  console.log('  prices     - Show current prices');
  console.log('  monitor    - Display dashboard');
  console.log('  rebalance  - Generate rebalancing recommendations');
  console.log('  montecarlo - Run Monte Carlo simulations');
}

main().catch(console.error);
