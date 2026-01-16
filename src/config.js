// Config loader for portfolio settings
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_PATH = join(process.cwd(), 'config.json');

const DEFAULT_CONFIG = {
  portfolio: {
    holdings: []
  },
  mstrData: {
    btcHoldings: 450000,
    sharesOutstanding: 180000000
  },
  thresholds: {
    mnavHigh: 2.5,
    mnavLow: 0.85,
    driftTrigger: 0.05,
    rebalanceTrigger: 0.10
  },
  alerts: {
    enabled: false,
    webhook: null,
    email: null
  },
  burnRate: {
    monthlyExpenses: 0,
    emergencyFund: 0
  }
};

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.warn('config.json not found, using defaults');
    return DEFAULT_CONFIG;
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (err) {
    console.error('Error loading config:', err.message);
    return DEFAULT_CONFIG;
  }
}

export function getHoldings(config) {
  return config.portfolio?.holdings || [];
}

export function getThresholds(config) {
  return config.thresholds || DEFAULT_CONFIG.thresholds;
}

export function getMstrData(config) {
  return config.mstrData || DEFAULT_CONFIG.mstrData;
}

export function getAlertSettings(config) {
  return config.alerts || DEFAULT_CONFIG.alerts;
}

export function getBurnRate(config) {
  return config.burnRate || DEFAULT_CONFIG.burnRate;
}
