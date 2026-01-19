#!/usr/bin/env node
// Analyst Daemon - Continuous portfolio monitoring with alerts
import { calculateMnav } from './mnav.js';
import { calculatePortfolio } from './portfolio.js';
import { loadConfig, getThresholds } from './config.js';
import { saveSnapshot } from './history.js';

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const config = loadConfig();
const thresholds = getThresholds(config);

console.log('');
console.log(' Analyst Daemon Starting...');
console.log('');
console.log(`  Check interval: ${CHECK_INTERVAL / 60000} minutes`);
console.log(`  mNAV High threshold: ${thresholds.mnavHigh}`);
console.log(`  mNAV Low threshold: ${thresholds.mnavLow}`);
console.log(`  Drift trigger: ${thresholds.driftTrigger * 100}%`);
console.log(`  Rebalance trigger: ${thresholds.rebalanceTrigger * 100}%`);
console.log('');
console.log('Daemon running. Press Ctrl+C to stop.');
console.log('');

async function runCheck() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running portfolio check...`);

  try {
    // Check mNAV
    const mnavResult = await calculateMnav();
    if (mnavResult.error) {
      console.error(`  Error: ${mnavResult.error}`);
      return;
    }

    const mnav = parseFloat(mnavResult.mnav);
    console.log(`  mNAV: ${mnav} (${mnavResult.status})`);

    if (mnav > thresholds.mnavHigh) {
      console.log(`  ⚠️ ALERT: mNAV above ${thresholds.mnavHigh}x - MSTR overvalued`);
      await sendAlert(`mNAV Alert: ${mnav}x (above ${thresholds.mnavHigh}x threshold) - MSTR overvalued`);
    } else if (mnav < thresholds.mnavLow) {
      console.log(`  ⚠️ ALERT: mNAV below ${thresholds.mnavLow}x - MSTR undervalued`);
      await sendAlert(`mNAV Alert: ${mnav}x (below ${thresholds.mnavLow}x threshold) - MSTR undervalued`);
    }

    // Check portfolio drift
    const portfolioResult = await calculatePortfolio();
    if (portfolioResult.error) {
      console.error(`  Error: ${portfolioResult.error}`);
      return;
    }

    const driftedPositions = portfolioResult.positions.filter(p => p.needsRebalance);
    if (driftedPositions.length > 0) {
      console.log(`  ⚠️ DRIFT ALERT: ${driftedPositions.length} position(s) need rebalancing`);
      for (const p of driftedPositions) {
        console.log(`    - ${p.symbol}: ${p.driftPercent}% drift`);
      }
      await sendAlert(`Drift Alert: ${driftedPositions.map(p => `${p.symbol} ${p.driftPercent}%`).join(', ')}`);
    } else {
      console.log(`  ✓ All positions within drift tolerance`);
    }

    console.log(`  Portfolio value: $${portfolioResult.totalValue.toLocaleString()}`);

    // Save historical snapshot
    const snapshot = saveSnapshot({
      mnav: mnav,
      portfolioValue: portfolioResult.totalValue,
      positions: portfolioResult.positions.map(p => ({
        symbol: p.symbol,
        value: p.value,
        allocation: p.actualAllocation,
        drift: p.driftPercent
      })),
      btcPrice: mnavResult.btcPrice,
      mstrPrice: mnavResult.mstrPrice
    });
    console.log(`  [Snapshot saved: ${snapshot.date}]`);
    console.log('');

  } catch (err) {
    console.error(`  Error during check: ${err.message}`);
  }
}

async function sendAlert(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log(`  [Alert not sent - no SLACK_WEBHOOK_URL configured]`);
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `📊 Analyst Agent: ${message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📊 Analyst Agent Alert*\n${message}`
            }
          }
        ]
      })
    });
    if (response.ok) {
      console.log(`  [Slack alert sent]`);
    }
  } catch (err) {
    console.error(`  [Failed to send Slack alert: ${err.message}]`);
  }
}

// Run immediately
runCheck();

// Schedule periodic checks
setInterval(runCheck, CHECK_INTERVAL);
