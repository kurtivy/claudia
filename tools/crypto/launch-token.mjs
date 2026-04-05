#!/usr/bin/env node
// launch-token.mjs — Token launch orchestrator for PumpFun via market maker
// Usage: node launch-token.mjs --name "Name" --symbol "TKN" --description "..." --image-url "https://..." [options]

import { MarketMakerClient } from './market-maker-client.mjs';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';

// --- paths ---
const HOME = homedir();
const CREDS_PATH = resolve(HOME, '.claudia/config/mm-credentials.json');
const DATA_DIR = resolve(HOME, '.claudia/data');
const LOG_PATH = resolve(DATA_DIR, 'token-launches.jsonl');

// --- CLI parsing ---
const USAGE = `
Usage: node launch-token.mjs [options]

Required:
  --name <string>         Token name
  --symbol <string>       Token symbol (ticker)
  --description <string>  Why this token exists
  --image-url <url>       Image URL for token metadata

Optional:
  --link <url>            Associated link (e.g. Twitter/X profile)
  --creator <address>     Specific creator wallet address
  --dev-buy <sol>         Dev buy amount in SOL (default: 0.0)
  --invest-sol <amount>   Buy a position after launch using this many SOL
  --dry-run               Print config and exit without launching
  --help                  Show this help
`.trim();

function fatal(msg) {
  console.error(`Error: ${msg}`);
  console.error('Run with --help for usage.');
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      name:        { type: 'string' },
      symbol:      { type: 'string' },
      description: { type: 'string' },
      'image-url': { type: 'string' },
      link:        { type: 'string' },
      creator:     { type: 'string' },
      'dev-buy':   { type: 'string' },
      'invest-sol': { type: 'string' },
      'dry-run':   { type: 'boolean', default: false },
      help:        { type: 'boolean', default: false },
    },
    strict: true,
  });
} catch (err) {
  fatal(err.message);
}

const opts = parsed.values;

if (opts.help || process.argv.length <= 2) {
  console.log(USAGE);
  process.exit(0);
}

// --- validate required args ---
if (!opts.name)          fatal('--name is required');
if (!opts.symbol)        fatal('--symbol is required');
if (!opts.description)   fatal('--description is required');
if (!opts['image-url'])  fatal('--image-url is required');

const devBuySol = opts['dev-buy'] ? parseFloat(opts['dev-buy']) : 0.0;
if (isNaN(devBuySol) || devBuySol < 0) fatal('--dev-buy must be a non-negative number');

const investSol = opts['invest-sol'] ? parseFloat(opts['invest-sol']) : 0.0;
if (isNaN(investSol) || investSol < 0) fatal('--invest-sol must be a non-negative number');

const SOL_USD_RATE = 150; // hardcoded conversion rate

// --- load credentials ---
function loadCredentials() {
  const envEmail = process.env.MM_EMAIL;
  const envPass  = process.env.MM_PASSWORD;
  if (envEmail && envPass) return { email: envEmail, password: envPass };

  try {
    const raw = readFileSync(CREDS_PATH, 'utf-8');
    const creds = JSON.parse(raw);
    if (creds.email && creds.password) return creds;
  } catch {}

  fatal(`No credentials found. Set MM_EMAIL/MM_PASSWORD env vars or create ${CREDS_PATH}`);
}

// --- main ---
async function main() {
  const creds = loadCredentials();
  const mm = new MarketMakerClient();

  // 1. Login
  console.error('Logging in to market maker...');
  await mm.login(creds.email, creds.password);

  // 2. Pick creator wallet
  let creatorAddress = opts.creator;
  if (!creatorAddress) {
    console.error('Fetching wallets...');
    const wallets = await mm.listWallets('solana');
    if (!wallets || wallets.length === 0) fatal('No Solana wallets available in market maker');
    const idx = Date.now() % wallets.length;
    creatorAddress = wallets[idx].address;
    console.error(`Selected wallet ${idx + 1}/${wallets.length}: ${creatorAddress}`);
  } else {
    console.error(`Using specified creator: ${creatorAddress}`);
  }

  // 3. Upload metadata
  console.error('Uploading metadata to pump.fun IPFS...');
  const metaResult = await mm.uploadMetadata({
    name: opts.name,
    symbol: opts.symbol,
    description: opts.description,
    imageUrl: opts['image-url'],
    website: opts.link || '',
  });
  const metadataUri = metaResult.metadata_uri;
  if (!metadataUri) fatal('Metadata upload failed: no metadata_uri returned');
  console.error(`Metadata URI: ${metadataUri}`);

  // 4. Build launch config
  const config = {
    name: opts.name,
    symbol: opts.symbol,
    decimals: 9,
    metadata_uri: metadataUri,
    creator_pubkey: creatorAddress,
    dev_buy_sol: devBuySol,
    slippage_bps: 500,
    priority_fee_sol: 0.0001,
    buy_wallets: [],
  };

  // 5. Validate
  console.error('Validating launch config...');
  const validation = await mm.validateLaunch(config);
  if (validation.valid === false) {
    console.error('Validation failed:');
    console.error(JSON.stringify(validation.errors || validation, null, 2));
    process.exit(1);
  }
  if (validation.summary) console.error(`Validation: ${validation.summary}`);

  // 6. Dry run check
  if (opts['dry-run']) {
    console.log(JSON.stringify({ dry_run: true, config, validation }, null, 2));
    process.exit(0);
  }

  // 7. Launch
  console.error('Launching token...');
  const result = await mm.launchToken(config);
  const tokenAddress = result.address || result.token_address || result.mint;
  if (!tokenAddress) {
    console.error('Launch response missing token address:');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // 8. Log to JSONL
  mkdirSync(DATA_DIR, { recursive: true });
  const logEntry = {
    timestamp: new Date().toISOString(),
    name: opts.name,
    symbol: opts.symbol,
    address: tokenAddress,
    creator: creatorAddress,
    metadata_uri: metadataUri,
    dev_buy_sol: devBuySol,
    invested_sol: 0,
    link: opts.link || '',
    pump_url: `https://pump.fun/coin/${tokenAddress}`,
  };

  // 9. Self-invest: buy a position if --invest-sol specified
  if (investSol > 0) {
    const amountUsd = investSol * SOL_USD_RATE;
    console.error(`Buying position: ${investSol} SOL (~$${amountUsd.toFixed(2)}) in ${opts.symbol}...`);
    try {
      const tradeResult = await mm.executeTrade({
        token_address: tokenAddress,
        direction: 'buy',
        amount_usd: amountUsd,
        slippage_bps: 1000,
      });
      logEntry.invested_sol = investSol;
      console.error(`Investment successful: ${investSol} SOL into ${opts.symbol}`);
      if (tradeResult) console.error(`Trade result: ${JSON.stringify(tradeResult)}`);
    } catch (buyErr) {
      console.error(`Investment failed (token is live, buy skipped): ${buyErr.message}`);
    }
  }

  appendFileSync(LOG_PATH, JSON.stringify(logEntry) + '\n');
  console.error(`Logged to ${LOG_PATH}`);

  // 10. Print result
  const output = { ...logEntry, raw_result: result };
  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
