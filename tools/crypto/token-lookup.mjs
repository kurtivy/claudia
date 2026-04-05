#!/usr/bin/env node
// token-lookup.mjs V2 — Multi-source token data
// Sources: DexScreener, DexPaprika, pump.fun, Solana RPC (top holders)
// Usage: node token-lookup.mjs <symbol-or-address> [--chain=solana] [--telegram] [--chat-id=ID]

import { loadBotToken } from '../lib/telegram-token.mjs';
const BOT_TOKEN = loadBotToken();
const DEFAULT_CHAT = '1578553327';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--'));
const chainArg = args.find(a => a.startsWith('--chain='));
const chain = chainArg ? chainArg.split('=')[1] : 'solana';
const sendTelegram = args.includes('--telegram');
const chatArg = args.find(a => a.startsWith('--chat-id='));
const chatId = chatArg ? chatArg.split('=')[1] : DEFAULT_CHAT;

if (!query) {
  console.error('Usage: node token-lookup.mjs <symbol-or-address> [--chain=solana] [--telegram] [--chat-id=ID]');
  process.exit(1);
}

function fmt(n, decimals = 2) {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function pctFmt(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${Number(n).toFixed(1)}%`;
}

async function sendTG(text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function fetchJSON(url, options = {}) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), ...options });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function getLiveSOLPrice() {
  const data = await fetchJSON('https://api.dexscreener.com/latest/dex/search?q=SOL%20USDC');
  if (data?.pairs?.[0]?.priceUsd) return Number(data.pairs[0].priceUsd);
  return 80; // fallback
}

async function getDexPaprika(address) {
  return await fetchJSON(`https://api.dexpaprika.com/networks/${chain}/tokens/${address}`);
}

async function getTopHolders(address) {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'getTokenLargestAccounts',
    params: [address],
  });
  const data = await fetchJSON(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return data?.result?.value || [];
}

async function getTokenSupply(address) {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1,
    method: 'getTokenSupply',
    params: [address],
  });
  const data = await fetchJSON(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return data?.result?.value || null;
}

async function main() {
  const isAddress = query.length > 20;

  // Fetch all sources in parallel
  const [solPrice, dexPaprika] = await Promise.all([
    getLiveSOLPrice(),
    isAddress ? getDexPaprika(query) : Promise.resolve(null),
  ]);

  // DexScreener lookup
  let pairs;
  if (isAddress) {
    const res = await fetchJSON(`https://api.dexscreener.com/tokens/v1/${chain}/${query}`);
    pairs = Array.isArray(res) ? res : res?.pairs || [];
  } else {
    const data = await fetchJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
    pairs = (data?.pairs || []).filter(p => {
      const sym = p.baseToken?.symbol?.toLowerCase();
      return p.chainId === chain && sym === query.toLowerCase();
    });
  }

  // Pump.fun fallback for bonding curve tokens
  if (!pairs.length && isAddress && chain === 'solana') {
    const pf = await fetchJSON(`https://frontend-api-v3.pump.fun/coins/${query}`);
    if (pf?.mint) {
      const vSol = Number(pf.virtual_sol_reserves || 0) / 1e9;
      const vTokens = Number(pf.virtual_token_reserves || 0) / 1e6;
      const tokenPriceUsd = vTokens > 0 ? (vSol / vTokens * solPrice) : 0;

      const initialReserves = 1073000000000000;
      const finalReserves = 206900000000000;
      const currentReserves = Number(pf.virtual_token_reserves || 0);
      const bondingProgress = currentReserves <= initialReserves
        ? (((initialReserves - currentReserves) / (initialReserves - finalReserves)) * 100).toFixed(1)
        : '0.0';

      // Fetch top holders in parallel with output build
      const [holders, supply] = await Promise.all([
        getTopHolders(query),
        getTokenSupply(query),
      ]);

      const totalSupply = supply ? Number(supply.uiAmountString) : Number(pf.total_supply) / 1e6;

      const lines = [
        `${pf.symbol} (${pf.name}) [pump.fun]`,
        `Chain: solana | Bonding curve | SOL: $${solPrice.toFixed(2)}`,
        '',
        `Market Cap: ${fmt(pf.usd_market_cap)}`,
        `Price: $${tokenPriceUsd.toFixed(10)}`,
        `Bonding Progress: ${bondingProgress}%`,
        `Virtual SOL Reserves: ${vSol.toFixed(2)} SOL`,
        `Total Supply: ${totalSupply.toLocaleString()}`,
        `Complete: ${pf.complete ? 'Yes (graduated)' : 'No (on curve)'}`,
      ];

      if (pf.tokenized_agent) lines.push(`Tokenized Agent: Yes (buyback enabled)`);
      if (pf.ath_market_cap) lines.push(`ATH Market Cap: ${fmt(pf.ath_market_cap)}`);
      if (pf.king_of_the_hill_timestamp) {
        lines.push(`King of the Hill: ${new Date(pf.king_of_the_hill_timestamp).toISOString().slice(0, 16)}`);
      }

      if (dexPaprika?.description) {
        lines.push('', `Description: ${dexPaprika.description.substring(0, 120)}`);
      }

      // Top holders
      if (holders.length > 0) {
        lines.push('', `Top Holders (${holders.length}):`);
        let top10Pct = 0;
        for (const h of holders.slice(0, 5)) {
          const amt = Number(h.uiAmountString || 0);
          const pct = totalSupply > 0 ? (amt / totalSupply * 100).toFixed(1) : '?';
          lines.push(`  ${h.address.slice(0, 8)}... ${amt.toLocaleString()} (${pct}%)`);
        }
        const top10Amt = holders.slice(0, 10).reduce((s, h) => s + Number(h.uiAmountString || 0), 0);
        if (totalSupply > 0) {
          lines.push(`  Top 10 hold: ${(top10Amt / totalSupply * 100).toFixed(1)}%`);
        }
      }

      lines.push('', `Mint: ${pf.mint}`, `Created: ${new Date(pf.created_timestamp).toISOString().slice(0, 10)}`, `pump.fun: https://pump.fun/coin/${pf.mint}`);

      const output = lines.join('\n');
      console.log(output);
      if (sendTelegram) { await sendTG(`<pre>${output}</pre>`); console.log('\nSent to Telegram.'); }
      return;
    }
  }

  if (!pairs.length) {
    console.log(`No pairs found for "${query}" on ${chain}.`);
    return;
  }

  // Sort by liquidity, take top pair
  pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const top = pairs[0];
  const token = top.baseToken;
  const tokenAddr = token.address;

  const totalVolume24h = pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0);
  const totalTxns24h = pairs.reduce((s, p) => s + (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0), 0);
  const totalLiquidity = pairs.reduce((s, p) => s + (p.liquidity?.usd || 0), 0);
  const totalBuys = pairs.reduce((s, p) => s + (p.txns?.h24?.buys || 0), 0);
  const totalSells = pairs.reduce((s, p) => s + (p.txns?.h24?.sells || 0), 0);
  const pc = top.priceChange || {};

  // Fetch enrichment data in parallel
  const [holders, supply, dpData] = await Promise.all([
    chain === 'solana' ? getTopHolders(tokenAddr) : Promise.resolve([]),
    chain === 'solana' ? getTokenSupply(tokenAddr) : Promise.resolve(null),
    !dexPaprika ? getDexPaprika(tokenAddr) : Promise.resolve(dexPaprika),
  ]);

  const totalSupply = supply ? Number(supply.uiAmountString) : 0;

  const lines = [
    `${token.symbol} (${token.name})`,
    `Chain: ${top.chainId} | ${pairs.length} pair${pairs.length > 1 ? 's' : ''} | SOL: $${solPrice.toFixed(2)}`,
    '',
    `Price: $${top.priceUsd || '—'}`,
    `FDV: ${fmt(top.fdv)}`,
    `Market Cap: ${fmt(top.marketCap)}`,
    `Liquidity: ${fmt(totalLiquidity)} (across all pairs)`,
    `Volume 24h: ${fmt(totalVolume24h)}`,
    `Txns 24h: ${totalTxns24h} (${totalBuys} buys / ${totalSells} sells)`,
    '',
    `Price Change:`,
    `  5m: ${pctFmt(pc.m5)}  1h: ${pctFmt(pc.h1)}  6h: ${pctFmt(pc.h6)}  24h: ${pctFmt(pc.h24)}`,
  ];

  // DexPaprika enrichment
  if (dpData) {
    const ps = dpData.price_stats;
    if (ps) {
      lines.push('');
      if (ps.high_24h != null && ps.low_24h != null) {
        lines.push(`24h Range: $${Number(ps.low_24h).toPrecision(4)} - $${Number(ps.high_24h).toPrecision(4)}`);
      }
      if (ps.ath != null) {
        lines.push(`ATH: $${Number(ps.ath).toPrecision(4)}${ps.ath_date ? ` (${ps.ath_date.slice(0, 10)})` : ''}`);
      }
    }
    if (dpData.description) {
      lines.push(`Info: ${dpData.description.substring(0, 120)}`);
    }
  }

  // Buy/sell pressure
  if (totalBuys + totalSells > 0) {
    const buyPct = (totalBuys / (totalBuys + totalSells) * 100).toFixed(0);
    lines.push('', `Buy pressure: ${buyPct}%`);
  }

  // Top holders
  if (holders.length > 0) {
    lines.push('', `Top Holders:`);
    for (const h of holders.slice(0, 5)) {
      const amt = Number(h.uiAmountString || 0);
      const pct = totalSupply > 0 ? (amt / totalSupply * 100).toFixed(1) : '?';
      lines.push(`  ${h.address.slice(0, 8)}... ${amt.toLocaleString()} (${pct}%)`);
    }
    if (totalSupply > 0) {
      const top10Amt = holders.slice(0, 10).reduce((s, h) => s + Number(h.uiAmountString || 0), 0);
      lines.push(`  Top 10 hold: ${(top10Amt / totalSupply * 100).toFixed(1)}%`);
    }
  }

  lines.push('', `Address: ${tokenAddr}`, `Top DEX: ${top.dexId}`, `DexScreener: ${top.url || '—'}`);

  const output = lines.join('\n');
  console.log(output);

  if (sendTelegram) {
    await sendTG(`<pre>${output}</pre>`);
    console.log('\nSent to Telegram.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
