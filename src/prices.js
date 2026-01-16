// Price fetcher for BTC, MSTR, STRD from public APIs
import axios from 'axios';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Fetch BTC price from CoinGecko
export async function fetchBtcPrice() {
  try {
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: 'bitcoin',
        vs_currencies: 'usd'
      }
    });
    return response.data.bitcoin.usd;
  } catch (err) {
    console.error('Error fetching BTC price:', err.message);
    return null;
  }
}

// Fetch stock price from Yahoo Finance
async function fetchStockPrice(symbol) {
  try {
    const response = await axios.get(`${YAHOO_FINANCE_API}/${symbol}`, {
      params: {
        interval: '1d',
        range: '1d'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const result = response.data.chart.result[0];
    const quote = result.meta.regularMarketPrice;
    return quote;
  } catch (err) {
    console.error(`Error fetching ${symbol} price:`, err.message);
    return null;
  }
}

export async function fetchMstrPrice() {
  return fetchStockPrice('MSTR');
}

export async function fetchStrdPrice() {
  return fetchStockPrice('STRD');
}

// Fetch all prices at once
export async function fetchAllPrices() {
  const [btc, mstr, strd] = await Promise.all([
    fetchBtcPrice(),
    fetchMstrPrice(),
    fetchStrdPrice()
  ]);

  return {
    BTC: btc,
    MSTR: mstr,
    STRD: strd,
    timestamp: new Date().toISOString()
  };
}

// Calculate MSTR market cap
export function calcMstrMarketCap(price, sharesOutstanding) {
  return price * sharesOutstanding;
}

// Calculate BTC holdings value
export function calcBtcHoldingsValue(btcPrice, btcHoldings) {
  return btcPrice * btcHoldings;
}
