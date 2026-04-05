# PumpFun Launch Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Claudia the ability to autonomously launch tokens on PumpFun via the existing market maker, tweet about them, collect creator fees, and reinvest.

**Architecture:** Node.js client wrapper calls the market maker's FastAPI on localhost:5001. Two-step launch: upload metadata (image + description to IPFS), then launch token (PumpPortal + Jito bundle). Trend detection and thesis generation happen within Claudia's normal operating loop. Fee collection via Chrome CDP browser automation on pump.fun. All state logged to JSONL files.

**Tech Stack:** Node.js (client wrapper), Python/FastAPI (market maker, already built), Chrome CDP via cdp-eval.mjs (fee collection), httpx (image fetching for Gemini), existing tools (token-monitor.mjs, tweet-post.mjs)

**Market Maker Location:** `~/Desktop/market_maker_rebuild/`
**Claudia Tools Location:** `~/.openclaw/tools/`
**Spec:** `docs/superpowers/specs/2026-04-01-tokencommand-pumpfun-launch-pipeline.md`

---

## Phase 1: Get the Pipe Working

### Task 1: Verify Market Maker Starts and Responds

**Files:**
- Read: `~/Desktop/market_maker_rebuild/.env`
- Read: `~/Desktop/market_maker_rebuild/.env.example`

This task validates that the market maker is runnable on this machine. No code changes expected -- just diagnosis and fixes if needed.

- [ ] **Step 1: Check if Python venv exists and has dependencies**

```bash
cd ~/Desktop/market_maker_rebuild
ls venv/Scripts/python.exe 2>/dev/null && echo "venv exists" || echo "no venv"
```

If no venv:
```bash
python -m venv venv
./venv/Scripts/pip install -e .
```

- [ ] **Step 2: Verify .env has required values**

```bash
cd ~/Desktop/market_maker_rebuild
grep -E "^(MASTER_PASSWORD|JWT_SECRET|SOLANA_RPC_URL)" .env
```

Required: `MASTER_PASSWORD` (non-empty), `JWT_SECRET` (non-empty), `SOLANA_RPC_URL` (valid endpoint). If missing, check `.env.example` and fill values. The `MASTER_PASSWORD` must match whatever was used to encrypt the existing wallet pool.

- [ ] **Step 3: Start the market maker**

```bash
cd ~/Desktop/market_maker_rebuild
./venv/Scripts/python -m uvicorn market_maker.app:create_app --host 0.0.0.0 --port 5001 --factory &
```

Wait 5 seconds, then:
```bash
curl -s http://localhost:5001/health | python -m json.tool
```

Expected: `{"status": "ok"}` or similar health response.

- [ ] **Step 4: Test authentication**

The market maker uses JWT auth. Create or use an existing admin account:

```bash
# Check if admin exists by trying login
curl -s -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"<check .env or existing setup>"}'
```

If no admin exists, use the admin setup endpoint:
```bash
curl -s -X POST http://localhost:5001/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"email":"claudia@local","password":"<generate>","master_password":"<from .env>"}'
```

Save the JWT token for subsequent requests.

- [ ] **Step 5: List existing wallets**

```bash
curl -s http://localhost:5001/api/wallets \
  -H "Authorization: Bearer <JWT>" | python -m json.tool | head -50
```

Verify wallets exist in the pool. Note the count and a few addresses for later use.

- [ ] **Step 6: Test the validate endpoint**

```bash
curl -s -X POST http://localhost:5001/api/tokens/launch/validate \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "solana",
    "platform": "pumpfun",
    "config": {
      "name": "Test Token",
      "symbol": "TEST",
      "creator_pubkey": "<wallet_address_from_step_5>",
      "metadata_uri": "https://example.com/fake",
      "dev_buy_sol": 0.0001
    }
  }' | python -m json.tool
```

Expected: `{"valid": true, ...}` or clear error messages about what's wrong. Fix any issues before proceeding.

- [ ] **Step 7: Document any bugs found and fixes applied**

Append to cycle file's Actions Taken section.

---

### Task 2: Build the Node.js Market Maker Client

**Files:**
- Create: `~/.openclaw/tools/crypto/market-maker-client.mjs`
- Test: manual curl-equivalent tests via the script itself

This client wraps the market maker's REST API for use by Claudia's Node.js tools.

- [ ] **Step 1: Write the client module**

```javascript
// ~/.openclaw/tools/crypto/market-maker-client.mjs
// Market maker REST client for Claudia's autonomous token launches.
//
// Usage:
//   import { MarketMakerClient } from './market-maker-client.mjs';
//   const mm = new MarketMakerClient();
//   await mm.login('claudia@local', 'password');
//   const wallets = await mm.listWallets();

const BASE_URL = process.env.MM_BASE_URL || 'http://localhost:5001';

export class MarketMakerClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  async _fetch(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const resp = await fetch(url, { ...options, headers });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MM API ${resp.status} ${path}: ${text.slice(0, 300)}`);
    }

    return resp.json();
  }

  async health() {
    return this._fetch('/health');
  }

  async login(email, password) {
    const data = await this._fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.token = data.token || data.access_token;
    return data;
  }

  async listWallets(chain = 'solana') {
    return this._fetch(`/api/wallets?chain=${chain}`);
  }

  async uploadMetadata({ name, symbol, description, imageUrl, twitter, telegram, website }) {
    return this._fetch('/api/tokens/launch/upload-metadata', {
      method: 'POST',
      body: JSON.stringify({
        name,
        symbol,
        description: description || `${name} token`,
        image_url: imageUrl || '',
        twitter: twitter || '',
        telegram: telegram || '',
        website: website || '',
      }),
    });
  }

  async validateLaunch(config) {
    return this._fetch('/api/tokens/launch/validate', {
      method: 'POST',
      body: JSON.stringify({
        chain: 'solana',
        platform: 'pumpfun',
        config,
      }),
    });
  }

  async launchToken(config, postLaunch = null) {
    const body = {
      chain: 'solana',
      platform: 'pumpfun',
      config,
    };
    if (postLaunch) body.post_launch = postLaunch;
    return this._fetch('/api/tokens/launch', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listTokens() {
    return this._fetch('/api/tokens');
  }

  async getToken(address) {
    return this._fetch(`/api/tokens/${address}`);
  }

  async executeTrade({ tokenAddress, direction, amountUsd, walletAddress, slippageBps }) {
    return this._fetch('/api/trade', {
      method: 'POST',
      body: JSON.stringify({
        token_address: tokenAddress,
        direction,
        amount_usd: amountUsd,
        wallet_address: walletAddress || '',
        slippage_bps: slippageBps || 500,
      }),
    });
  }

  async startBot(config) {
    return this._fetch('/api/bots', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async stopBot(botId) {
    return this._fetch(`/api/bots/${botId}/stop`, { method: 'POST' });
  }

  async listBots() {
    return this._fetch('/api/bots');
  }
}

// CLI test mode
if (process.argv[1]?.endsWith('market-maker-client.mjs')) {
  const client = new MarketMakerClient();
  try {
    const health = await client.health();
    console.log('Health:', JSON.stringify(health));
    console.log('Market maker is reachable.');
  } catch (e) {
    console.error('Market maker not reachable:', e.message);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Test the client can reach the market maker**

```bash
node ~/.openclaw/tools/crypto/market-maker-client.mjs
```

Expected: "Health: {...}" and "Market maker is reachable."

- [ ] **Step 3: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/market-maker-client.mjs
git commit -m "feat: add market maker REST client for autonomous launches"
```

---

### Task 3: Build the Token Launch Orchestrator

**Files:**
- Create: `~/.openclaw/tools/crypto/launch-token.mjs`
- Modify: (none -- new file)

This is the main script Claudia calls to launch a token. It handles the full flow: pick wallet, upload metadata, validate, launch, log result.

- [ ] **Step 1: Write the launch orchestrator**

```javascript
// ~/.openclaw/tools/crypto/launch-token.mjs
// Autonomous token launch on PumpFun via market maker.
//
// Usage:
//   node launch-token.mjs \
//     --name "Token Name" \
//     --symbol "TKN" \
//     --description "Why this token exists" \
//     --image-url "https://..." \
//     --link "https://x.com/..." \
//     [--dev-buy 0.0001] \
//     [--dry-run]
//
// Requires: market maker running on localhost:5001
// Credentials: MM_EMAIL, MM_PASSWORD env vars (or reads from ~/.openclaw/config/mm-credentials.json)

import { MarketMakerClient } from './market-maker-client.mjs';
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.openclaw', 'data');
const LAUNCH_LOG = join(DATA_DIR, 'token-launches.jsonl');
const CREDS_FILE = join(homedir(), '.openclaw', 'config', 'mm-credentials.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') opts.name = args[++i];
    else if (args[i] === '--symbol') opts.symbol = args[++i];
    else if (args[i] === '--description') opts.description = args[++i];
    else if (args[i] === '--image-url') opts.imageUrl = args[++i];
    else if (args[i] === '--link') opts.link = args[++i];
    else if (args[i] === '--dev-buy') opts.devBuy = parseFloat(args[++i]);
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--creator') opts.creator = args[++i];
  }
  return opts;
}

function loadCredentials() {
  const email = process.env.MM_EMAIL;
  const password = process.env.MM_PASSWORD;
  if (email && password) return { email, password };

  if (existsSync(CREDS_FILE)) {
    const creds = JSON.parse(readFileSync(CREDS_FILE, 'utf-8'));
    return { email: creds.email, password: creds.password };
  }

  throw new Error('No MM credentials. Set MM_EMAIL/MM_PASSWORD or create ' + CREDS_FILE);
}

function logLaunch(entry) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(LAUNCH_LOG, JSON.stringify(entry) + '\n');
}

async function main() {
  const opts = parseArgs();
  if (!opts.name || !opts.symbol) {
    console.error('Required: --name and --symbol');
    process.exit(1);
  }

  const creds = loadCredentials();
  const mm = new MarketMakerClient();

  // 1. Login
  console.log('Logging in to market maker...');
  await mm.login(creds.email, creds.password);

  // 2. Pick a creator wallet (first available Solana wallet, or use --creator)
  const wallets = await mm.listWallets('solana');
  if (!wallets.length) {
    console.error('No Solana wallets in pool');
    process.exit(1);
  }

  let creatorWallet;
  if (opts.creator) {
    creatorWallet = wallets.find(w => w.address === opts.creator);
    if (!creatorWallet) {
      console.error(`Creator wallet ${opts.creator} not found in pool`);
      process.exit(1);
    }
  } else {
    // Round-robin: pick based on current time mod wallet count
    const idx = Date.now() % wallets.length;
    creatorWallet = wallets[idx];
  }
  console.log(`Creator wallet: ${creatorWallet.address}`);

  // 3. Upload metadata to IPFS
  console.log('Uploading metadata to pump.fun IPFS...');
  const metaResult = await mm.uploadMetadata({
    name: opts.name,
    symbol: opts.symbol,
    description: opts.description || `${opts.name} - launched by Claudia`,
    imageUrl: opts.imageUrl || '',
  });
  console.log(`Metadata URI: ${metaResult.metadata_uri}`);

  // 4. Build launch config
  const launchConfig = {
    name: opts.name,
    symbol: opts.symbol,
    decimals: 9,
    metadata_uri: metaResult.metadata_uri,
    creator_pubkey: creatorWallet.address,
    dev_buy_sol: opts.devBuy || 0.0,
    slippage_bps: 500,
    priority_fee_sol: 0.0001,
    buy_wallets: [],
  };

  // 5. Validate first
  console.log('Validating launch config...');
  const validation = await mm.validateLaunch(launchConfig);
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors);
    process.exit(1);
  }
  console.log('Validation passed.');

  if (opts.dryRun) {
    console.log('DRY RUN -- would launch with config:');
    console.log(JSON.stringify(launchConfig, null, 2));
    return;
  }

  // 6. Launch
  console.log('Launching token...');
  const result = await mm.launchToken(launchConfig);
  console.log(`Token launched: ${result.address}`);
  console.log(`pump.fun: https://pump.fun/coin/${result.address}`);

  // 7. Log
  const logEntry = {
    timestamp: new Date().toISOString(),
    name: opts.name,
    symbol: opts.symbol,
    address: result.address,
    creator: creatorWallet.address,
    metadata_uri: metaResult.metadata_uri,
    dev_buy_sol: launchConfig.dev_buy_sol,
    link: opts.link || '',
    pump_url: `https://pump.fun/coin/${result.address}`,
  };
  logLaunch(logEntry);
  console.log('Launch logged to', LAUNCH_LOG);

  // Output JSON for piping
  console.log(JSON.stringify(logEntry));
}

main().catch(e => {
  console.error('Launch failed:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Create credentials file**

```bash
mkdir -p ~/.openclaw/config
```

Write `~/.openclaw/config/mm-credentials.json`:
```json
{
  "email": "claudia@local",
  "password": "<from Task 1 Step 4>"
}
```

- [ ] **Step 3: Test with --dry-run**

```bash
node ~/.openclaw/tools/crypto/launch-token.mjs \
  --name "Test Token" \
  --symbol "TEST" \
  --description "Testing the launch pipeline" \
  --dry-run
```

Expected: Logs in, picks wallet, uploads metadata to IPFS (this IS a real call to pump.fun), validates config, prints "DRY RUN" with config. Fix any errors.

- [ ] **Step 4: Do a real test launch**

```bash
node ~/.openclaw/tools/crypto/launch-token.mjs \
  --name "Test Launch" \
  --symbol "TLAUNCH" \
  --description "First Claudia autonomous launch test"
```

Expected: Token appears on pump.fun. Log entry written to `~/.openclaw/data/token-launches.jsonl`. Fix any bugs in the PumpPortal/Jito submission path.

- [ ] **Step 5: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/launch-token.mjs config/mm-credentials.json
git commit -m "feat: token launch orchestrator for autonomous PumpFun launches"
```

---

### Task 4: Build the Launch Notification Module

**Files:**
- Create: `~/.openclaw/tools/crypto/launch-notify.mjs`

Sends a Telegram notification after each launch. Designed to be called by the launch orchestrator or separately.

- [ ] **Step 1: Write the notification script**

```javascript
// ~/.openclaw/tools/crypto/launch-notify.mjs
// Send Telegram notification about a token launch.
//
// Usage:
//   node launch-notify.mjs --name "Token" --symbol "TKN" --address "abc123" --link "https://..."
//   OR: echo '{"name":"Token","symbol":"TKN","address":"abc123"}' | node launch-notify.mjs --stdin

import { readFileSync } from 'fs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || (() => {
  try {
    const cfg = JSON.parse(readFileSync(
      new URL('../../config/telegram-bot.json', import.meta.url), 'utf-8'
    ));
    return cfg.token;
  } catch { return ''; }
})();

const CHAT_ID = '1578553327';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name') opts.name = args[++i];
    else if (args[i] === '--symbol') opts.symbol = args[++i];
    else if (args[i] === '--address') opts.address = args[++i];
    else if (args[i] === '--link') opts.link = args[++i];
    else if (args[i] === '--thesis') opts.thesis = args[++i];
    else if (args[i] === '--stdin') opts.stdin = true;
  }
  return opts;
}

async function sendTelegram(text) {
  if (!BOT_TOKEN) throw new Error('No TELEGRAM_BOT_TOKEN');
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
  if (!resp.ok) throw new Error(`Telegram API ${resp.status}`);
  return resp.json();
}

async function main() {
  let opts = parseArgs();

  if (opts.stdin) {
    const input = readFileSync(0, 'utf-8');
    opts = { ...opts, ...JSON.parse(input) };
  }

  if (!opts.name || !opts.address) {
    console.error('Required: --name and --address');
    process.exit(1);
  }

  const pumpUrl = `https://pump.fun/coin/${opts.address}`;
  const lines = [
    `Token launched: <b>${opts.name}</b> ($${opts.symbol})`,
    pumpUrl,
  ];
  if (opts.thesis) lines.push(`\nThesis: ${opts.thesis}`);
  if (opts.link) lines.push(`Source: ${opts.link}`);

  const text = lines.join('\n');
  await sendTelegram(text);
  console.log('Notification sent.');
}

main().catch(e => {
  console.error('Notify failed:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Test notification**

```bash
node ~/.openclaw/tools/crypto/launch-notify.mjs \
  --name "Test" --symbol "TEST" --address "test123" --thesis "Testing notifications"
```

Expected: Telegram message arrives with token name and pump.fun link.

- [ ] **Step 3: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/launch-notify.mjs
git commit -m "feat: telegram notification for token launches"
```

---

## Phase 2: Autonomous Launch Loop

### Task 5: Build the Launch Skill for Claudia

**Files:**
- Create: `~/kurtclaw/custom-skills/pumpfun-agent/SKILL.md`

This skill defines how Claudia decides to launch a token. It's invoked when Claudia spots a trending narrative during normal operation.

- [ ] **Step 1: Write the skill definition**

```markdown
---
name: pumpfun-agent
description: Launch a narrative-driven token on PumpFun. Use when you spot a trending topic, meme, or narrative with momentum that could work as a token.
---

# PumpFun Token Launch

You are launching a token on PumpFun as a narrative play. The token IS the pitch deck -- if people trade it, there's demand. If it graduates, build it for real.

## Pre-Launch Checklist

1. **Narrative** -- What's trending? Why now? What's the angle?
2. **Name & Ticker** -- Memorable, fits the narrative. Ticker 3-5 chars.
3. **Description** -- 1-2 sentences. What this token represents. Include the source link.
4. **Image** -- Either:
   - Screenshot from the source article/tweet (save to temp file, get URL)
   - Generate via Gemini (free image generation)
5. **Source Link** -- Tweet URL or article URL backing the thesis

## Launch Steps

1. Verify market maker is running: `node ~/.openclaw/tools/crypto/market-maker-client.mjs`
2. Launch the token:
   ```bash
   node ~/.openclaw/tools/crypto/launch-token.mjs \
     --name "<name>" \
     --symbol "<TICKER>" \
     --description "<description with source link>" \
     --image-url "<image_url>" \
     --link "<source_url>"
   ```
3. Send Telegram notification:
   ```bash
   node ~/.openclaw/tools/crypto/launch-notify.mjs \
     --name "<name>" --symbol "<TICKER>" \
     --address "<from launch output>" \
     --thesis "<1 sentence why>" \
     --link "<source_url>"
   ```
4. Tweet about it. Casual tone. Include the pump.fun link. Not a shill -- more "this is interesting" than "buy this."
5. Log the launch in the cycle file under Actions Taken.

## Rules

- Never launch without a clear narrative. "Random token" is not a thesis.
- Casual tweet tone. No shilling. No financial advice language.
- Different aged wallet per launch (the script handles round-robin).
- dev_buy_sol defaults to 0 (zero capital). Only increase once fee revenue exists.
- Monitor the token via token-monitor.mjs after launch.
- If someone replies about the token on Twitter, engage naturally.
```

- [ ] **Step 2: Verify skill loads**

Test by asking Claudia to invoke the skill:
```
/pumpfun-agent
```

- [ ] **Step 3: Commit**

```bash
cd ~/kurtclaw
git add custom-skills/pumpfun-agent/SKILL.md
git commit -m "feat: PumpFun autonomous launch skill for Claudia"
```

---

### Task 6: Build the Portfolio Tracker

**Files:**
- Create: `~/.openclaw/tools/crypto/portfolio.mjs`

Tracks all launched tokens, their status, fees earned, and positions.

- [ ] **Step 1: Write the portfolio tracker**

```javascript
// ~/.openclaw/tools/crypto/portfolio.mjs
// Portfolio tracker for Claudia's token launches.
//
// Usage:
//   node portfolio.mjs                    # Show portfolio summary
//   node portfolio.mjs --token <address>  # Show single token details
//   node portfolio.mjs --update           # Refresh prices from DexScreener

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.openclaw', 'data');
const LAUNCH_LOG = join(DATA_DIR, 'token-launches.jsonl');
const FEE_LOG = join(DATA_DIR, 'fee-collections.jsonl');
const PORTFOLIO_FILE = join(DATA_DIR, 'portfolio.json');

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function loadPortfolio() {
  if (!existsSync(PORTFOLIO_FILE)) {
    return { tokens: {}, total_fees_sol: 0, total_invested_sol: 0, total_realized_sol: 0 };
  }
  return JSON.parse(readFileSync(PORTFOLIO_FILE, 'utf-8'));
}

function savePortfolio(p) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PORTFOLIO_FILE, JSON.stringify(p, null, 2));
}

async function fetchPrice(address) {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
    const data = await resp.json();
    const pair = data.pairs?.[0];
    if (!pair) return null;
    return {
      priceUsd: parseFloat(pair.priceUsd || 0),
      volume24h: parseFloat(pair.volume?.h24 || 0),
      marketCap: parseFloat(pair.marketCap || 0),
      liquidity: parseFloat(pair.liquidity?.usd || 0),
    };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const doUpdate = args.includes('--update');
  const tokenFilter = args.includes('--token') ? args[args.indexOf('--token') + 1] : null;

  const launches = loadJsonl(LAUNCH_LOG);
  const fees = loadJsonl(FEE_LOG);
  const portfolio = loadPortfolio();

  // Merge launches into portfolio
  for (const launch of launches) {
    if (!portfolio.tokens[launch.address]) {
      portfolio.tokens[launch.address] = {
        name: launch.name,
        symbol: launch.symbol,
        address: launch.address,
        launched_at: launch.timestamp,
        creator: launch.creator,
        dev_buy_sol: launch.dev_buy_sol || 0,
        fees_collected_sol: 0,
        invested_sol: 0,
        realized_sol: 0,
        last_price: null,
        status: 'active',
      };
    }
  }

  // Merge fee collections
  for (const fee of fees) {
    const token = portfolio.tokens[fee.address];
    if (token) {
      token.fees_collected_sol = fee.cumulative_sol || token.fees_collected_sol;
    }
  }

  // Update prices if requested
  if (doUpdate) {
    for (const [addr, token] of Object.entries(portfolio.tokens)) {
      if (tokenFilter && addr !== tokenFilter) continue;
      const price = await fetchPrice(addr);
      if (price) {
        token.last_price = price;
        token.last_updated = new Date().toISOString();
      }
    }
  }

  // Compute totals
  portfolio.total_fees_sol = Object.values(portfolio.tokens)
    .reduce((sum, t) => sum + (t.fees_collected_sol || 0), 0);
  portfolio.total_invested_sol = Object.values(portfolio.tokens)
    .reduce((sum, t) => sum + (t.invested_sol || 0), 0);
  portfolio.total_realized_sol = Object.values(portfolio.tokens)
    .reduce((sum, t) => sum + (t.realized_sol || 0), 0);

  savePortfolio(portfolio);

  // Display
  if (tokenFilter) {
    const t = portfolio.tokens[tokenFilter];
    if (!t) { console.log('Token not found in portfolio'); return; }
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  const tokenCount = Object.keys(portfolio.tokens).length;
  console.log(`Portfolio: ${tokenCount} tokens launched`);
  console.log(`Total fees collected: ${portfolio.total_fees_sol} SOL`);
  console.log(`Total invested: ${portfolio.total_invested_sol} SOL`);
  console.log(`Total realized: ${portfolio.total_realized_sol} SOL`);
  console.log('');

  for (const t of Object.values(portfolio.tokens)) {
    const price = t.last_price ? `$${t.last_price.priceUsd} | MCap $${t.last_price.marketCap}` : 'no price data';
    console.log(`  ${t.symbol} (${t.address.slice(0, 8)}...) — ${price} — fees: ${t.fees_collected_sol} SOL`);
  }
}

main().catch(e => {
  console.error('Portfolio error:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Test with empty state**

```bash
node ~/.openclaw/tools/crypto/portfolio.mjs
```

Expected: "Portfolio: 0 tokens launched" (or N tokens if Task 3 test launch was done).

- [ ] **Step 3: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/portfolio.mjs
git commit -m "feat: portfolio tracker for launched tokens"
```

---

## Phase 3: Revenue Collection

### Task 7: Build the Fee Collection Script (Chrome CDP)

**Files:**
- Create: `~/.openclaw/tools/crypto/collect-fees.mjs`

This script navigates to pump.fun via Chrome CDP, finds unclaimed creator fees, and triggers collection. Requires Phantom wallet connected in Chrome.

- [ ] **Step 1: Write the fee collection script**

```javascript
// ~/.openclaw/tools/crypto/collect-fees.mjs
// Collect unclaimed creator fees from pump.fun via Chrome CDP.
//
// Prerequisites:
//   - Kurt's Chrome running with --remote-debugging-port=9222
//   - Phantom wallet extension installed and unlocked
//   - Logged into pump.fun
//
// Usage:
//   node collect-fees.mjs --address <token_address>
//   node collect-fees.mjs --all   # Collect from all launched tokens

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const DATA_DIR = join(homedir(), '.openclaw', 'data');
const FEE_LOG = join(DATA_DIR, 'fee-collections.jsonl');
const LAUNCH_LOG = join(DATA_DIR, 'token-launches.jsonl');
const CDP_EVAL = join(homedir(), '.openclaw', 'tools', 'browser', 'cdp-eval.mjs');

function loadLaunches() {
  if (!existsSync(LAUNCH_LOG)) return [];
  return readFileSync(LAUNCH_LOG, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

function logFeeCollection(entry) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(FEE_LOG, JSON.stringify(entry) + '\n');
}

async function cdpEval(jsCode) {
  // Use the existing cdp-eval.mjs tool to run JS in Chrome
  const result = execSync(
    `node "${CDP_EVAL}" --eval "${jsCode.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8', timeout: 30000 }
  );
  return result.trim();
}

async function navigateTo(url) {
  return cdpEval(`window.location.href = '${url}'`);
}

async function collectForToken(address) {
  console.log(`Checking fees for ${address}...`);

  // Navigate to the token's page on pump.fun
  await navigateTo(`https://pump.fun/coin/${address}`);

  // Wait for page to load
  await new Promise(r => setTimeout(r, 5000));

  // This is where Chrome CDP interaction happens.
  // The exact selectors depend on pump.fun's current UI.
  // This will need to be adapted based on the actual page structure.
  //
  // General flow:
  // 1. Look for "Creator Fees" or "Claim" button on the token page
  // 2. Click to claim
  // 3. Approve Phantom transaction popup
  //
  // NOTE: This task will require interactive debugging the first time
  // to identify correct selectors. The script structure is here;
  // the selectors are filled in during Task 7 Step 3.

  console.log(`Navigate to https://pump.fun/coin/${address} -- check for claimable fees`);
  console.log('Fee collection requires interactive CDP debugging to identify selectors.');
  console.log('Run this script, then inspect the page in Chrome DevTools.');

  return { address, status: 'needs_selector_mapping' };
}

async function main() {
  const args = process.argv.slice(2);
  const collectAll = args.includes('--all');
  const tokenAddr = args.includes('--address') ? args[args.indexOf('--address') + 1] : null;

  if (!collectAll && !tokenAddr) {
    console.error('Usage: collect-fees.mjs --address <addr> | --all');
    process.exit(1);
  }

  let addresses = [];
  if (collectAll) {
    addresses = loadLaunches().map(l => l.address);
  } else {
    addresses = [tokenAddr];
  }

  if (!addresses.length) {
    console.log('No launched tokens found.');
    return;
  }

  for (const addr of addresses) {
    const result = await collectForToken(addr);
    if (result.amount_sol) {
      logFeeCollection({
        timestamp: new Date().toISOString(),
        address: addr,
        amount_sol: result.amount_sol,
        tx_hash: result.tx_hash || '',
      });
      console.log(`Collected ${result.amount_sol} SOL from ${addr}`);
    }
  }
}

main().catch(e => {
  console.error('Fee collection error:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Prerequisite check -- verify Phantom is accessible**

Navigate to pump.fun in Chrome manually and confirm:
1. Phantom wallet icon visible in extensions
2. Wallet is connected to pump.fun
3. You can see the creator fee section on a token page

If Phantom is not set up, this is a **Kurt blocker**. Send Telegram:
```
Need Phantom wallet installed in Chrome and connected to pump.fun for fee collection. One-time setup.
```

- [ ] **Step 3: Interactive debugging session**

Launch the script against a real token, then use Chrome DevTools to:
1. Identify the "Claim Fees" button selector
2. Identify the fee amount display element
3. Map the Phantom approval flow

Update the `collectForToken()` function with real selectors once identified.

- [ ] **Step 4: Test fee collection on a real token**

Run against the test token from Task 3 (if it has any trading volume/fees):
```bash
node ~/.openclaw/tools/crypto/collect-fees.mjs --address <test_token_address>
```

- [ ] **Step 5: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/collect-fees.mjs
git commit -m "feat: fee collection script for pump.fun creator fees via Chrome CDP"
```

---

## Phase 4: Self-Investment

### Task 8: Add Buy-Position Capability to Launch Orchestrator

**Files:**
- Modify: `~/.openclaw/tools/crypto/launch-token.mjs`
- Modify: `~/.openclaw/tools/crypto/portfolio.mjs`

Once fees exist, Claudia can buy into her own tokens. This extends the existing tools.

- [ ] **Step 1: Add --invest flag to launch-token.mjs**

Add to the `parseArgs()` function:
```javascript
else if (args[i] === '--invest-sol') opts.investSol = parseFloat(args[++i]);
```

Add after successful launch (before logging), in the `main()` function:
```javascript
// Buy a position if requested and we have funds
if (opts.investSol && opts.investSol > 0) {
  console.log(`Buying ${opts.investSol} SOL position...`);
  try {
    const tradeResult = await mm.executeTrade({
      tokenAddress: result.address,
      direction: 'buy',
      amountUsd: opts.investSol * 150, // rough SOL->USD conversion, market maker handles actual pricing
      slippageBps: 1000, // 10% slippage for new tokens
    });
    console.log('Position bought:', tradeResult.tx_hash || 'submitted');
    logEntry.invested_sol = opts.investSol;
  } catch (e) {
    console.error('Buy failed (token still launched):', e.message);
  }
}
```

- [ ] **Step 2: Add sell tracking to portfolio.mjs**

Add a `--sell` command:
```javascript
// In parseArgs:
else if (args[i] === '--sell') opts.sell = true;
else if (args[i] === '--amount-sol') opts.amountSol = parseFloat(args[++i]);
```

Add sell handler in main():
```javascript
if (args.includes('--sell') && tokenFilter) {
  const token = portfolio.tokens[tokenFilter];
  if (!token) { console.log('Token not found'); return; }
  console.log(`To sell position in ${token.symbol}:`);
  console.log(`Use market maker directly: POST /api/trade`);
  console.log(`  token_address: ${tokenFilter}`);
  console.log(`  direction: sell`);
  console.log(`Or configure countertrade bot for gradual exit.`);
  return;
}
```

- [ ] **Step 3: Test buy flow (only when fees exist)**

This step is conditional -- only run when there's SOL available from collected fees:
```bash
node ~/.openclaw/tools/crypto/launch-token.mjs \
  --name "Invested Token" \
  --symbol "INV" \
  --description "Testing self-investment" \
  --invest-sol 0.001
```

- [ ] **Step 4: Commit**

```bash
cd ~/.openclaw
git add tools/crypto/launch-token.mjs tools/crypto/portfolio.mjs
git commit -m "feat: self-investment capability for token launches"
```

---

## Summary

| Task | Phase | What it delivers |
|------|-------|-----------------|
| 1 | 1 | Market maker validated and running |
| 2 | 1 | Node.js client wrapper for MM API |
| 3 | 1 | Full launch orchestrator (metadata + launch + logging) |
| 4 | 1 | Telegram notifications for launches |
| 5 | 2 | Claudia skill for autonomous narrative-driven launches |
| 6 | 2 | Portfolio tracking across all launches |
| 7 | 3 | Fee collection via Chrome CDP on pump.fun |
| 8 | 4 | Self-investment into own tokens |

**Critical path:** Tasks 1-3 must be sequential. Task 4 is independent after Task 2. Tasks 5-6 can parallel after Task 3. Task 7 needs Kurt's Phantom setup. Task 8 needs Task 7 (fees to invest).
