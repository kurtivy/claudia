#!/usr/bin/env node
// portfolio.mjs — Track launched tokens, fees, positions, prices
// Usage:
//   node portfolio.mjs                    # Show portfolio summary
//   node portfolio.mjs --token <address>  # Show single token details
//   node portfolio.mjs --update           # Refresh prices from DexScreener
//   node portfolio.mjs --json             # Output as JSON instead of formatted text
//   node portfolio.mjs --sell --token <address>  # Show sell instructions for a token
//   node portfolio.mjs --help             # Show help

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const DATA_DIR = resolve(HOME, '.claudia/data');
const LAUNCHES_PATH = resolve(DATA_DIR, 'token-launches.jsonl');
const FEES_PATH = resolve(DATA_DIR, 'fee-collections.jsonl');
const PORTFOLIO_PATH = resolve(DATA_DIR, 'portfolio.json');

// --- CLI ---
const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const doUpdate = args.includes('--update');
const doSell = args.includes('--sell');
const showHelp = args.includes('--help');
const tokenIdx = args.indexOf('--token');
const singleToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;

// --- helpers ---
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return [];
  return text.split('\n').map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

function readPortfolio() {
  if (!existsSync(PORTFOLIO_PATH)) return makeEmpty();
  try {
    const data = JSON.parse(readFileSync(PORTFOLIO_PATH, 'utf-8'));
    if (!data.tokens) data.tokens = {};
    return data;
  } catch {
    return makeEmpty();
  }
}

function makeEmpty() {
  return {
    tokens: {},
    total_fees_sol: 0,
    total_invested_sol: 0,
    total_realized_sol: 0,
    updated_at: new Date().toISOString(),
  };
}

function savePortfolio(p) {
  mkdirSync(DATA_DIR, { recursive: true });
  p.updated_at = new Date().toISOString();
  writeFileSync(PORTFOLIO_PATH, JSON.stringify(p, null, 2) + '\n');
}

function fmt(n, decimals = 2) {
  if (n == null) return '--';
  const num = Number(n);
  if (isNaN(num)) return '--';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function shortAddr(addr) {
  if (!addr) return '???';
  return addr.length > 10 ? addr.slice(0, 6) + '...' : addr;
}

// --- sync launches + fees into portfolio state ---
function syncFromFiles(portfolio) {
  const launches = readJsonl(LAUNCHES_PATH);
  const fees = readJsonl(FEES_PATH);

  for (const l of launches) {
    if (!l.address) continue;
    if (!portfolio.tokens[l.address]) {
      portfolio.tokens[l.address] = {
        name: l.name || '',
        symbol: l.symbol || '',
        address: l.address,
        launched_at: l.timestamp || '',
        creator: l.creator || '',
        dev_buy_sol: Number(l.dev_buy_sol) || 0,
        fees_collected_sol: 0,
        invested_sol: Number(l.dev_buy_sol) || 0,
        realized_sol: 0,
        last_price: null,
        last_updated: null,
        status: 'active',
      };
    } else {
      // update fields that may have changed
      const t = portfolio.tokens[l.address];
      t.name = l.name || t.name;
      t.symbol = l.symbol || t.symbol;
      t.creator = l.creator || t.creator;
      t.dev_buy_sol = Number(l.dev_buy_sol) || t.dev_buy_sol;
      t.invested_sol = Math.max(t.invested_sol, t.dev_buy_sol);
    }
  }

  // aggregate fees per token
  const feeMap = {};
  for (const f of fees) {
    if (!f.address) continue;
    feeMap[f.address] = (feeMap[f.address] || 0) + (Number(f.amount_sol) || 0);
  }
  for (const [addr, total] of Object.entries(feeMap)) {
    if (portfolio.tokens[addr]) {
      portfolio.tokens[addr].fees_collected_sol = total;
    }
  }

  // recompute totals
  let totalFees = 0, totalInvested = 0, totalRealized = 0;
  for (const t of Object.values(portfolio.tokens)) {
    totalFees += t.fees_collected_sol;
    totalInvested += t.invested_sol;
    totalRealized += t.realized_sol;
  }
  portfolio.total_fees_sol = totalFees;
  portfolio.total_invested_sol = totalInvested;
  portfolio.total_realized_sol = totalRealized;

  return portfolio;
}

// --- price fetching ---
async function fetchDexScreener(address) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pair = data.pairs?.[0];
    if (!pair) return null;
    return {
      priceUsd: Number(pair.priceUsd) || 0,
      volume24h: Number(pair.volume?.h24) || 0,
      marketCap: Number(pair.marketCap) || 0,
      liquidity: Number(pair.liquidity?.usd) || 0,
      source: 'dexscreener',
    };
  } catch {
    return null;
  }
}

async function fetchPumpFun(address) {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${address}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      priceUsd: 0,
      volume24h: 0,
      marketCap: Number(data.usd_market_cap) || Number(data.market_cap) || 0,
      liquidity: 0,
      source: 'pumpfun',
    };
  } catch {
    return null;
  }
}

async function updatePrices(portfolio) {
  const addresses = Object.keys(portfolio.tokens);
  if (addresses.length === 0) return portfolio;

  console.error(`Updating prices for ${addresses.length} token(s)...`);

  for (const addr of addresses) {
    const t = portfolio.tokens[addr];
    let price = await fetchDexScreener(addr);
    if (!price) {
      price = await fetchPumpFun(addr);
    }
    if (price) {
      t.last_price = price;
      t.last_updated = new Date().toISOString();
      const src = price.source === 'pumpfun' ? 'pump.fun' : 'DexScreener';
      console.error(`  ${t.symbol}: ${src} - MCap ${fmt(price.marketCap)}`);
    } else {
      console.error(`  ${t.symbol}: no data`);
    }
    // be polite to APIs
    if (addresses.length > 1) await new Promise(r => setTimeout(r, 300));
  }

  return portfolio;
}

// --- display ---
function displaySummary(portfolio, filterAddr) {
  const tokens = Object.values(portfolio.tokens);
  const show = filterAddr
    ? tokens.filter(t => t.address === filterAddr)
    : tokens;

  if (filterAddr && show.length === 0) {
    console.log(`Token ${filterAddr} not found in portfolio.`);
    return;
  }

  if (!filterAddr) {
    console.log(`Portfolio: ${tokens.length} token${tokens.length !== 1 ? 's' : ''} launched`);
    console.log(`Total fees: ${portfolio.total_fees_sol.toFixed(4)} SOL | Invested: ${portfolio.total_invested_sol.toFixed(4)} SOL | Realized: ${portfolio.total_realized_sol.toFixed(4)} SOL`);
    console.log('');
  }

  for (const t of show) {
    let priceStr;
    if (!t.last_price) {
      priceStr = 'no data';
    } else if (t.last_price.source === 'pumpfun') {
      priceStr = `bonding curve | MCap ${fmt(t.last_price.marketCap)}`;
    } else {
      priceStr = `$${t.last_price.priceUsd} | MCap ${fmt(t.last_price.marketCap)} | Vol ${fmt(t.last_price.volume24h)}`;
    }
    const feesStr = `fees: ${t.fees_collected_sol.toFixed(4)} SOL`;
    console.log(`  ${t.symbol} (${shortAddr(t.address)}) -- ${priceStr} -- ${feesStr}`);
  }

  if (filterAddr && show.length === 1) {
    const t = show[0];
    console.log('');
    console.log(`  Name:       ${t.name}`);
    console.log(`  Address:    ${t.address}`);
    console.log(`  Launched:   ${t.launched_at || 'unknown'}`);
    console.log(`  Creator:    ${t.creator || 'unknown'}`);
    console.log(`  Dev buy:    ${t.dev_buy_sol} SOL`);
    console.log(`  Invested:   ${t.invested_sol} SOL`);
    console.log(`  Realized:   ${t.realized_sol} SOL`);
    console.log(`  Status:     ${t.status}`);
    if (t.last_updated) console.log(`  Updated:    ${t.last_updated}`);
  }
}

const HELP_TEXT = `
Usage: node portfolio.mjs [options]

Options:
  --token <address>  Show details for a specific token
  --update           Refresh prices from DexScreener / pump.fun
  --json             Output as JSON instead of formatted text
  --sell --token <address>  Show sell instructions for a token
  --help             Show this help
`.trim();

function showSellInstructions(portfolio, addr) {
  if (!addr) {
    console.error('Error: --sell requires --token <address>');
    process.exit(1);
  }
  const t = portfolio.tokens[addr];
  const symbol = t ? t.symbol : 'UNKNOWN';
  console.log(`To sell position in ${symbol}:`);
  console.log(`  Manual: POST /api/trade with token_address=${addr}, direction=sell`);
  console.log(`  Bot: Configure countertrade bot in market maker dashboard`);
  console.log(`  CLI: node ~/.claudia/tools/crypto/market-maker-client.mjs (then use executeTrade)`);
}

// --- main ---
async function main() {
  if (showHelp) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  let portfolio = readPortfolio();
  portfolio = syncFromFiles(portfolio);

  if (doSell) {
    showSellInstructions(portfolio, singleToken);
    return;
  }

  if (doUpdate) {
    portfolio = await updatePrices(portfolio);
  }

  savePortfolio(portfolio);

  if (jsonOut) {
    if (singleToken) {
      const t = portfolio.tokens[singleToken] || null;
      console.log(JSON.stringify(t, null, 2));
    } else {
      console.log(JSON.stringify(portfolio, null, 2));
    }
  } else {
    displaySummary(portfolio, singleToken);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
