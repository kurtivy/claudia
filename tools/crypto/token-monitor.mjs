#!/usr/bin/env node
// token-monitor.mjs — Monitor token price/volume changes, alert on significant moves
// Usage: node token-monitor.mjs [--address=<addr>] [--symbol=CLAUDIA] [--chain=solana]
//        [--price-threshold=10] [--volume-threshold=500] [--telegram] [--chat-id=ID]
//        [--baseline=<path>]
//
// Compares current data against a saved baseline. Alerts if:
// - Price changed more than --price-threshold % (default 10%)
// - 24h volume exceeds --volume-threshold USD (default $500)
// - Buy/sell ratio shifts significantly
// Saves current state as new baseline after each run.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const DATA_DIR = join(HOME, '.claudia', 'tools', 'crypto', 'data');

import { loadBotToken } from '../lib/telegram-token.mjs';
const BOT_TOKEN = loadBotToken();
const DEFAULT_CHAT = '1578553327';

const args = process.argv.slice(2);
const addressArg = args.find(a => a.startsWith('--address='));
const symbolArg = args.find(a => a.startsWith('--symbol='));
const chainArg = args.find(a => a.startsWith('--chain='));
const priceThreshArg = args.find(a => a.startsWith('--price-threshold='));
const volThreshArg = args.find(a => a.startsWith('--volume-threshold='));
const baselineArg = args.find(a => a.startsWith('--baseline='));
const sendTelegram = args.includes('--telegram');
const chatArg = args.find(a => a.startsWith('--chat-id='));

// Accept positional arg as address if it looks like a token address (32+ chars, no --)
const positionalAddr = args.find(a => !a.startsWith('--') && a.length >= 32);
const address = addressArg?.split('=')[1] || positionalAddr || undefined;
const symbol = symbolArg?.split('=')[1] || 'CLAUDIA';
const chain = chainArg?.split('=')[1] || 'solana';
const priceThreshold = Number(priceThreshArg?.split('=')[1] || 10);
const volumeThreshold = Number(volThreshArg?.split('=')[1] || 500);
const chatId = chatArg?.split('=')[1] || DEFAULT_CHAT;

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const baselinePath = baselineArg?.split('=')[1] || join(DATA_DIR, `${symbol.toLowerCase()}-baseline.json`);

function fmt(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

async function sendTG(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function fetchToken() {
  let pairs;
  if (address) {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${address}`);
    pairs = await res.json();
    if (!Array.isArray(pairs)) pairs = pairs.pairs || [];
  } else {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    pairs = (data.pairs || []).filter(p =>
      p.chainId === chain && p.baseToken?.symbol?.toLowerCase() === symbol.toLowerCase()
    );
  }
  // Fallback to pump.fun for bonding curve tokens
  if (!pairs.length && address && chain === 'solana') {
    try {
      const pfRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${address}`);
      if (pfRes.ok) {
        const pf = await pfRes.json();
        if (pf.mint) {
          return {
            symbol: pf.symbol,
            name: pf.name,
            address: pf.mint,
            price: pf.usd_market_cap || 0, // for pump.fun, use MC as the price metric
            fdv: pf.usd_market_cap || 0,
            liquidity: Number(pf.virtual_sol_reserves || 0) / 1e9 * 82, // approx SOL->USD
            volume24h: 0,
            buys24h: 0,
            sells24h: 0,
            priceChange24h: 0,
            bondingProgress: (() => {
              const init = 1073000000000000;
              const fin = 206900000000000;
              const cur = Number(pf.virtual_token_reserves || 0);
              return cur <= init ? ((init - cur) / (init - fin) * 100) : 0;
            })(),
            source: 'pumpfun',
            timestamp: new Date().toISOString(),
          };
        }
      }
    } catch {}
  }

  if (!pairs.length) return null;

  pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const top = pairs[0];

  return {
    symbol: top.baseToken?.symbol,
    name: top.baseToken?.name,
    address: top.baseToken?.address,
    price: Number(top.priceUsd || 0),
    fdv: top.fdv || 0,
    liquidity: top.liquidity?.usd || 0,
    volume24h: pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0),
    buys24h: pairs.reduce((s, p) => s + (p.txns?.h24?.buys || 0), 0),
    sells24h: pairs.reduce((s, p) => s + (p.txns?.h24?.sells || 0), 0),
    priceChange24h: top.priceChange?.h24 || 0,
    source: 'dexscreener',
    timestamp: new Date().toISOString(),
  };
}

async function main() {
  const current = await fetchToken();
  if (!current) {
    console.log(`No data found for ${symbol} on ${chain}.`);
    return;
  }

  // Load baseline
  let baseline = null;
  if (existsSync(baselinePath)) {
    try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch {}
  }

  const alerts = [];

  if (baseline) {
    // Source mismatch guard — don't compare pump.fun MC to DexScreener price
    if (baseline.source !== current.source) {
      alerts.push(`Source changed: ${baseline.source} -> ${current.source} (baseline reset)`);
    } else {
      // Price change since last check (only compare same-source data)
      if (baseline.price > 0) {
        const priceDelta = ((current.price - baseline.price) / baseline.price) * 100;
        if (Math.abs(priceDelta) >= priceThreshold) {
          const dir = priceDelta > 0 ? 'UP' : 'DOWN';
          alerts.push(`Price ${dir} ${Math.abs(priceDelta).toFixed(1)}% (${fmt(baseline.price)} -> ${fmt(current.price)})`);
        }
      }

      // Volume spike
      if (current.volume24h >= volumeThreshold && (baseline.volume24h || 0) < volumeThreshold) {
        alerts.push(`Volume spike: ${fmt(current.volume24h)} (was ${fmt(baseline.volume24h)})`);
      }

      // Liquidity change > 20%
      if (baseline.liquidity > 0) {
        const liqDelta = ((current.liquidity - baseline.liquidity) / baseline.liquidity) * 100;
        if (Math.abs(liqDelta) >= 20) {
          const dir = liqDelta > 0 ? 'added' : 'removed';
          alerts.push(`Liquidity ${dir}: ${Math.abs(liqDelta).toFixed(0)}% (${fmt(baseline.liquidity)} -> ${fmt(current.liquidity)})`);
        }
      }

      // Bonding progress change (pump.fun tokens)
      if (current.bondingProgress != null && baseline.bondingProgress != null) {
        const bpDelta = current.bondingProgress - baseline.bondingProgress;
        if (Math.abs(bpDelta) >= 1) {
          const dir = bpDelta > 0 ? 'UP' : 'DOWN';
          alerts.push(`Bonding progress ${dir}: ${baseline.bondingProgress.toFixed(1)}% -> ${current.bondingProgress.toFixed(1)}%`);
        }
      }

      // Buy pressure shift
      const prevBuyPct = baseline.buys24h + baseline.sells24h > 0
        ? baseline.buys24h / (baseline.buys24h + baseline.sells24h) * 100 : 50;
      const currBuyPct = current.buys24h + current.sells24h > 0
        ? current.buys24h / (current.buys24h + current.sells24h) * 100 : 50;
      if (Math.abs(currBuyPct - prevBuyPct) >= 20) {
        alerts.push(`Buy pressure shifted: ${prevBuyPct.toFixed(0)}% -> ${currBuyPct.toFixed(0)}%`);
      }
    }
  }

  // Save new baseline
  writeFileSync(baselinePath, JSON.stringify(current, null, 2));

  // Output
  const src = current.source === 'pumpfun' ? ' [pump.fun]' : '';
  const lines = [
    `${current.symbol} Monitor${src} — ${new Date().toLocaleDateString('en-CA')} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    current.source === 'pumpfun'
      ? `MC: ${fmt(current.price)} | Liq: ${fmt(current.liquidity)}`
      : `Price: ${fmt(current.price)} | FDV: ${fmt(current.fdv)} | Liq: ${fmt(current.liquidity)}`,
  ];
  if (current.bondingProgress != null) {
    lines.push(`Bonding: ${current.bondingProgress.toFixed(1)}%`);
  }
  lines.push(`Vol 24h: ${fmt(current.volume24h)} | Txns: ${current.buys24h + current.sells24h} (${current.buys24h}B/${current.sells24h}S)`);

  if (baseline) {
    const age = Math.round((Date.now() - new Date(baseline.timestamp).getTime()) / 60000);
    lines.push(`Baseline: ${age}min ago`);
  } else {
    lines.push('Baseline: first run (saved)');
  }

  if (alerts.length) {
    lines.push('', 'ALERTS:');
    alerts.forEach(a => lines.push(`  ! ${a}`));
  } else {
    lines.push('', 'No significant changes.');
  }

  const output = lines.join('\n');
  console.log(output);

  if (sendTelegram && alerts.length) {
    await sendTG(`<pre>${output}</pre>`);
    console.log('\nAlert sent to Telegram.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
