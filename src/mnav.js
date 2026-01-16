// mNAV Calculator (MSTR market cap / BTC holdings value)
import { fetchBtcPrice, fetchMstrPrice, calcMstrMarketCap, calcBtcHoldingsValue } from './prices.js';
import { loadConfig, getMstrData, getThresholds } from './config.js';

export async function calculateMnav() {
  const config = loadConfig();
  const mstrData = getMstrData(config);
  const thresholds = getThresholds(config);

  // Fetch current prices
  const [btcPrice, mstrPrice] = await Promise.all([
    fetchBtcPrice(),
    fetchMstrPrice()
  ]);

  if (!btcPrice || !mstrPrice) {
    return { error: 'Failed to fetch prices' };
  }

  // Calculate values
  const mstrMarketCap = calcMstrMarketCap(mstrPrice, mstrData.sharesOutstanding);
  const btcHoldingsValue = calcBtcHoldingsValue(btcPrice, mstrData.btcHoldings);
  const mnav = mstrMarketCap / btcHoldingsValue;

  // Check thresholds
  const isHigh = mnav > thresholds.mnavHigh;
  const isLow = mnav < thresholds.mnavLow;
  const status = isHigh ? 'OVERVALUED' : isLow ? 'UNDERVALUED' : 'NORMAL';

  return {
    mnav: mnav.toFixed(2),
    mstrMarketCap,
    btcHoldingsValue,
    btcPrice,
    mstrPrice,
    btcHoldings: mstrData.btcHoldings,
    sharesOutstanding: mstrData.sharesOutstanding,
    status,
    thresholds: {
      high: thresholds.mnavHigh,
      low: thresholds.mnavLow
    },
    timestamp: new Date().toISOString()
  };
}

export function formatMnavReport(result) {
  if (result.error) {
    return `Error: ${result.error}`;
  }

  const lines = [
    '╔════════════════════════════════════════╗',
    '║         mNAV Analysis Report           ║',
    '╠════════════════════════════════════════╣',
    `║ mNAV Ratio:        ${result.mnav.padStart(18)} ║`,
    `║ Status:            ${result.status.padStart(18)} ║`,
    '╠════════════════════════════════════════╣',
    `║ MSTR Price:        $${result.mstrPrice.toFixed(2).padStart(16)} ║`,
    `║ MSTR Market Cap:   $${formatLargeNumber(result.mstrMarketCap).padStart(16)} ║`,
    '╠════════════════════════════════════════╣',
    `║ BTC Price:         $${result.btcPrice.toFixed(2).padStart(16)} ║`,
    `║ BTC Holdings:      ${formatLargeNumber(result.btcHoldings).padStart(17)} ║`,
    `║ BTC Value:         $${formatLargeNumber(result.btcHoldingsValue).padStart(16)} ║`,
    '╠════════════════════════════════════════╣',
    `║ Threshold High:    ${result.thresholds.high.toFixed(2).padStart(18)} ║`,
    `║ Threshold Low:     ${result.thresholds.low.toFixed(2).padStart(18)} ║`,
    '╚════════════════════════════════════════╝'
  ];

  return lines.join('\n');
}

function formatLargeNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}
