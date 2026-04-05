#!/usr/bin/env node
// pf-create.mjs — Launch a token on pump.fun via Chrome CDP (zero SOL needed)
// This is the real launch path. Market maker API requires SOL for tx fees.
//
// Usage:
//   node pf-create.mjs --name "Name" --symbol "TKN" --description "..." --image /path/to/image.png
//   node pf-create.mjs --name "Name" --symbol "TKN" --description "..." --generate-image
//
// Requires: Chrome running with --remote-debugging-port=9222, Phantom connected to pump.fun

import { chromium } from 'playwright';
import { parseArgs } from 'node:util';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const DATA_DIR = resolve(homedir(), '.claudia/data');
const LOG_PATH = resolve(DATA_DIR, 'token-launches.jsonl');
const CDP_URL = 'http://localhost:9222';

const USAGE = `
Usage: node pf-create.mjs [options]

Required:
  --name <string>         Token name
  --symbol <string>       Token symbol (3-5 chars)
  --description <string>  What this token represents

Image (one required):
  --image <path>          Path to local image (1000x1000 recommended)
  --generate-image        Auto-generate a square image with Pillow

Optional:
  --link <url>            Source link (tweet/article backing the thesis)
  --tokenized-agent       Enable automated buybacks (default: on)
  --no-tokenized-agent    Disable automated buybacks
  --help                  Show this help
`.trim();

let parsed;
try {
  parsed = parseArgs({
    options: {
      name: { type: 'string' },
      symbol: { type: 'string' },
      description: { type: 'string' },
      image: { type: 'string' },
      'generate-image': { type: 'boolean', default: false },
      link: { type: 'string' },
      'tokenized-agent': { type: 'boolean', default: true },
      'no-tokenized-agent': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}

const opts = parsed.values;
if (opts.help || process.argv.length <= 2) { console.log(USAGE); process.exit(0); }
if (!opts.name) { console.error('Error: --name required'); process.exit(1); }
if (!opts.symbol) { console.error('Error: --symbol required'); process.exit(1); }
if (!opts.description) { console.error('Error: --description required'); process.exit(1); }

// Resolve image path
let imagePath = opts.image;
if (opts['generate-image'] || !imagePath) {
  // Generate square image with Pillow
  console.error('Generating token image...');
  const tmpImg = resolve(homedir(), 'AppData/Local/Temp', `token-${opts.symbol.toLowerCase()}.png`);
  const pyCode = `
import sys
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (1000, 1000), (15, 15, 20))
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("arial.ttf", 64)
    font_sm = ImageFont.truetype("arial.ttf", 32)
except:
    font = ImageFont.load_default()
    font_sm = font
draw.text((500, 400), "${opts.name.replace(/"/g, '\\"')}", fill=(255, 255, 255), anchor="mm", font=font)
draw.text((500, 480), "$${opts.symbol.replace(/"/g, '\\"')}", fill=(100, 200, 100), anchor="mm", font=font_sm)
img.save(sys.argv[1], 'PNG')
print('Generated: ' + sys.argv[1])
`;
  execSync(`python -c "${pyCode.replace(/\n/g, ';').replace(/"/g, '\\"')}" "${tmpImg}"`, { stdio: 'pipe' });
  imagePath = tmpImg;
  console.error('Image:', imagePath);
}

if (!existsSync(imagePath)) {
  console.error('Image not found:', imagePath);
  process.exit(1);
}

// Main launch flow
async function launch() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  let page = pages.find(p => p.url().includes('pump.fun')) || pages[0];

  // Navigate to create
  console.error('Navigating to pump.fun/create...');
  await page.goto('https://pump.fun/create', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Fill form
  console.error('Filling form...');
  await page.locator('input').first().fill(opts.name);
  await page.waitForTimeout(200);
  await page.locator('input').nth(1).fill(opts.symbol);
  await page.waitForTimeout(200);
  await page.locator('textarea').first().fill(opts.description);
  await page.waitForTimeout(200);

  // Upload image
  console.error('Uploading image...');
  await page.locator('input[type="file"]').first().setInputFiles(imagePath);
  await page.waitForTimeout(2000);

  // Enable tokenized agent (unless --no-tokenized-agent)
  if (!opts['no-tokenized-agent']) {
    console.error('Enabling Tokenized agent...');
    await page.getByText('Tokenized agent').click();
    await page.waitForTimeout(500);
  }

  // Click Create coin
  console.error('Clicking Create coin...');
  await page.getByRole('button', { name: 'Create coin' }).first().click();
  await page.waitForTimeout(5000);

  // Dev buy modal — click Create coin again (0 SOL)
  console.error('Confirming 0 SOL buy...');
  const modalBtn = page.getByRole('button', { name: 'Create coin' });
  if (await modalBtn.count() > 0) {
    await page.waitForTimeout(5000); // wait for button to become clickable
    await modalBtn.last().click();
  }

  // Wait for redirect to the new token page or toast with token link
  console.error('Waiting for confirmation...');
  await page.waitForTimeout(8000);

  // Method 1: Check if page redirected to /coin/<address>
  let tokenAddress = '';
  const currentUrl = page.url();
  const coinMatch = currentUrl.match(/\/coin\/([A-Za-z0-9]+)/);
  if (coinMatch) {
    tokenAddress = coinMatch[1];
    console.error('Found token from redirect URL');
  }

  // Method 2: Look for toast/notification with coin link
  if (!tokenAddress) {
    const toastLinks = await page.locator('a[href*="/coin/"]').all();
    for (const link of toastLinks) {
      const text = await link.textContent().catch(() => '');
      if (text.toLowerCase().includes(opts.name.toLowerCase()) || text.toLowerCase().includes(opts.symbol.toLowerCase())) {
        const href = await link.getAttribute('href');
        tokenAddress = href.replace('/coin/', '');
        console.error('Found token from page link matching name/symbol');
        break;
      }
    }
  }

  // Method 3: Navigate to profile and find the token by name
  if (!tokenAddress) {
    console.error('Checking profile for new token...');
    await page.goto(
      'https://pump.fun/profile/9NgW9F4iBenMzXrxpfMYaxUd9UdiEwiwNszroayjt2TK?tab=coins',
      { waitUntil: 'domcontentloaded', timeout: 15000 }
    );
    await page.waitForTimeout(3000);

    // Search for a link containing the token name or symbol
    const coinLinks = await page.locator('a[href*="/coin/"]').all();
    for (const link of coinLinks) {
      const text = await link.textContent().catch(() => '');
      if (text.includes(opts.name) || text.includes(opts.symbol)) {
        const href = await link.getAttribute('href');
        tokenAddress = href.replace('/coin/', '');
        console.error('Found token on profile by name match');
        break;
      }
    }

    // Fallback: grab the first coin link (may be wrong if name didn't match)
    if (!tokenAddress && coinLinks.length > 0) {
      const href = await coinLinks[0].getAttribute('href');
      tokenAddress = href.replace('/coin/', '');
      console.error('WARNING: Using first profile link as fallback (may be wrong)');
    }
  }

  if (!tokenAddress) {
    console.error('Could not find token address. Check profile manually.');
    try { await browser.close(); } catch {}
    process.exit(1);
  }

  const pumpUrl = `https://pump.fun/coin/${tokenAddress}`;
  console.error(`Token created: ${pumpUrl}`);

  // Log
  mkdirSync(DATA_DIR, { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    name: opts.name,
    symbol: opts.symbol,
    address: tokenAddress,
    creator: '9NgW9F4iBenMzXrxpfMYaxUd9UdiEwiwNszroayjt2TK',
    dev_buy_sol: 0,
    link: opts.link || '',
    pump_url: pumpUrl,
    method: 'pf-website',
  };
  appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');

  // Output result
  console.log(JSON.stringify(entry, null, 2));

  try { await browser.close(); } catch {}
}

launch().catch(e => {
  console.error('Launch failed:', e.message);
  process.exit(1);
});
