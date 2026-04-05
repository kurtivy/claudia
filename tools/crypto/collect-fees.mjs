#!/usr/bin/env node
// collect-fees.mjs — Check and collect creator fees from pump.fun token pages
//
// Uses CDP via Playwright to connect to Kurt's running Chrome (port 9222).
// Chrome must have Phantom wallet extension installed and unlocked.
//
// Usage:
//   node collect-fees.mjs --address <token_address>   # Check/collect fees for one token
//   node collect-fees.mjs --all                        # Check all launched tokens
//   node collect-fees.mjs --check-only                 # Just check fees, don't collect
//   node collect-fees.mjs --help                       # Show this help
//
// First-time setup:
//   1. Chrome running with --remote-debugging-port=9222
//   2. Phantom wallet extension installed and unlocked
//   3. Wallet connected to pump.fun (visit pump.fun and connect manually first)
//   4. Run with --check-only on a known token to map selectors (see SELECTORS below)

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

// Playwright is installed in the browser tools dir, not here
const require = createRequire(resolve(homedir(), '.claudia/tools/browser/package.json'));
const { chromium } = require('playwright');

// ============================================================================
// SELECTORS — NEEDS_MAPPING
// These must be filled in during the first interactive debugging session.
// To find them:
//   1. Navigate to a pump.fun coin page in Chrome
//   2. Open DevTools (F12) and inspect the fee display area
//   3. Find the element showing unclaimed creator fees
//   4. Find the "Claim" or "Collect" button
//   5. Update selectors below with actual CSS selectors or XPath
//
// Tips for mapping:
//   - pump.fun uses React; look for data-* attributes or stable class names
//   - The fee section is usually near the token info / creator section
//   - Phantom approval popup opens as a separate browser window/tab
//   - Use page.locator() or page.waitForSelector() patterns
// ============================================================================
const SELECTORS = {
  // Element displaying unclaimed fee amount (e.g. "0.05 SOL unclaimed")
  feeDisplay: 'NEEDS_MAPPING',

  // Button to initiate fee collection (e.g. "Claim Fees" or "Collect")
  claimButton: 'NEEDS_MAPPING',

  // Text element containing the SOL amount (may be same as feeDisplay)
  feeAmount: 'NEEDS_MAPPING',

  // Phantom wallet popup approve/confirm button
  // This appears in a NEW window — requires finding it in browser.contexts()
  phantomApprove: 'NEEDS_MAPPING',

  // Optional: element indicating no fees available
  noFeesIndicator: 'NEEDS_MAPPING',

  // Optional: success confirmation after claiming
  successIndicator: 'NEEDS_MAPPING',
};

// How long to wait for page elements (ms)
const TIMEOUTS = {
  pageLoad: 15000,
  feeDisplay: 10000,
  phantomPopup: 15000,
  txConfirm: 30000,
};

// ============================================================================
// Paths
// ============================================================================
const HOME = homedir();
const DATA_DIR = resolve(HOME, '.claudia/data');
const LAUNCHES_PATH = resolve(DATA_DIR, 'token-launches.jsonl');
const FEES_LOG_PATH = resolve(DATA_DIR, 'fee-collections.jsonl');
const CDP_URL = 'http://localhost:9222';

// ============================================================================
// CLI
// ============================================================================
const USAGE = `
Usage: node collect-fees.mjs [options]

  --address <addr>   Check/collect fees for a specific token address
  --all              Check all tokens from token-launches.jsonl
  --check-only       Only check fee amounts, don't collect
  --help             Show this help

Examples:
  node collect-fees.mjs --address 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
  node collect-fees.mjs --all --check-only
  node collect-fees.mjs --all

Prerequisites:
  - Chrome running with --remote-debugging-port=9222
  - Phantom wallet extension installed and unlocked
  - Wallet connected to pump.fun

Note: SELECTORS in this script are marked NEEDS_MAPPING and must be filled
in during the first interactive debugging session with a live pump.fun page.
`.trim();

const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(USAGE);
  process.exit(0);
}

const checkOnly = args.includes('--check-only');
const doAll = args.includes('--all');
const addrIdx = args.indexOf('--address');
const singleAddress = addrIdx !== -1 ? args[addrIdx + 1] : null;

if (!doAll && !singleAddress) {
  console.error('Error: Provide --address <addr> or --all');
  console.log(USAGE);
  process.exit(1);
}

// ============================================================================
// Helpers
// ============================================================================
function readJsonl(path) {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return [];
  return text.split('\n').map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

function logFeeCollection(entry) {
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(FEES_LOG_PATH, JSON.stringify(entry) + '\n');
}

function hasUnmappedSelectors() {
  const critical = ['feeDisplay', 'claimButton', 'feeAmount'];
  return critical.some(k => SELECTORS[k] === 'NEEDS_MAPPING');
}

// ============================================================================
// CDP Connection
// ============================================================================
async function connectBrowser() {
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    console.error('Failed to connect to Chrome CDP on port 9222.');
    console.error('Make sure Chrome is running with --remote-debugging-port=9222');
    console.error(`Details: ${err.message}`);
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts found. Is Chrome open?');
    process.exit(1);
  }

  return browser;
}

// Find or create a tab for pump.fun navigation
async function getPumpFunPage(browser) {
  const contexts = browser.contexts();
  const pages = contexts[0].pages();

  // Reuse an existing pump.fun tab if one exists
  let page = pages.find(p => p.url().includes('pump.fun'));
  if (page) {
    console.error(`Reusing existing pump.fun tab: ${page.url()}`);
    return page;
  }

  // Otherwise use the first non-extension page, or create new
  page = pages.find(p => !p.url().startsWith('chrome-extension://'));
  if (!page) page = pages[0];

  console.error(`Using tab: ${page.url()}`);
  return page;
}

// ============================================================================
// Fee Checking / Collection
// ============================================================================

async function navigateToToken(page, address) {
  const url = `https://pump.fun/coin/${address}`;
  console.error(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUTS.pageLoad });
  // Extra wait for JS-rendered content
  await page.waitForTimeout(3000);
}

async function checkFees(page, address) {
  // -----------------------------------------------------------------------
  // INTERACTIVE DEBUGGING NEEDED:
  // 1. Navigate to a token page where you are the creator
  // 2. Inspect the page to find the fee display element
  // 3. Update SELECTORS.feeDisplay and SELECTORS.feeAmount
  // 4. The fee amount text needs to be parsed to extract the SOL value
  //
  // Possible approaches to try during debugging:
  //   - page.locator('text=creator fee').first()
  //   - page.locator('[class*="fee"]').first()
  //   - page.evaluate(() => document.body.innerText) then regex for SOL amounts
  //   - page.locator('text=unclaimed').first()
  // -----------------------------------------------------------------------

  if (hasUnmappedSelectors()) {
    // Fallback: dump page text so we can search for fee-related content
    console.error('[SELECTORS UNMAPPED] Dumping page text to help identify fee elements...');
    const pageText = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText;
    });

    // Look for common fee-related keywords
    const lines = pageText.split('\n');
    const feeLines = lines.filter(l =>
      /fee|claim|unclaimed|creator|earn/i.test(l)
    );

    if (feeLines.length > 0) {
      console.error('Fee-related text found on page:');
      feeLines.forEach(l => console.error(`  > ${l.trim()}`));
    } else {
      console.error('No fee-related text found. This may not be a creator page,');
      console.error('or the selectors need manual inspection via DevTools.');
    }

    // Try to extract any SOL amount from the page
    const solMatch = pageText.match(/([\d.]+)\s*SOL/i);
    if (solMatch) {
      console.error(`Possible SOL amount found: ${solMatch[1]} SOL`);
    }

    return { address, fees: null, raw: feeLines, needsMapping: true };
  }

  // --- Normal path (selectors mapped) ---
  try {
    await page.waitForSelector(SELECTORS.feeDisplay, { timeout: TIMEOUTS.feeDisplay });
  } catch {
    console.error(`No fee display found for ${address}`);
    return { address, fees: 0, raw: null, needsMapping: false };
  }

  const amountText = await page.locator(SELECTORS.feeAmount).textContent();
  const match = amountText?.match(/([\d.]+)/);
  const amount = match ? parseFloat(match[1]) : 0;

  console.log(`Token ${address}: ${amount} SOL unclaimed`);
  return { address, fees: amount, raw: amountText, needsMapping: false };
}

async function collectFees(page, browser, address) {
  // -----------------------------------------------------------------------
  // INTERACTIVE DEBUGGING NEEDED:
  // 1. Click the claim button
  // 2. Phantom popup appears as a new window/tab
  // 3. Find the Phantom popup in browser contexts/pages
  // 4. Click approve in the popup
  // 5. Wait for transaction confirmation back on the main page
  //
  // Phantom popup detection:
  //   const allPages = browser.contexts().flatMap(c => c.pages());
  //   const phantom = allPages.find(p => p.url().includes('chrome-extension://'));
  //   // or listen for 'page' event on the context
  // -----------------------------------------------------------------------

  if (hasUnmappedSelectors()) {
    console.error('[SELECTORS UNMAPPED] Cannot collect fees until selectors are mapped.');
    console.error('Run with --check-only first, then update SELECTORS in collect-fees.mjs');
    return { success: false, reason: 'selectors_unmapped' };
  }

  // Click claim button
  console.error(`Clicking claim button for ${address}...`);
  const claimBtn = page.locator(SELECTORS.claimButton);
  await claimBtn.click();

  // Wait for Phantom popup
  console.error('Waiting for Phantom approval popup...');
  let phantomPage = null;
  try {
    // Listen for new page (popup) in the context
    phantomPage = await Promise.race([
      new Promise(res => {
        for (const ctx of browser.contexts()) {
          ctx.once('page', p => res(p));
        }
      }),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Phantom popup timeout')), TIMEOUTS.phantomPopup)
      ),
    ]);

    console.error(`Phantom popup detected: ${phantomPage.url()}`);
    await phantomPage.waitForLoadState('domcontentloaded');
    await phantomPage.waitForTimeout(1500);

    if (SELECTORS.phantomApprove !== 'NEEDS_MAPPING') {
      await phantomPage.locator(SELECTORS.phantomApprove).click();
      console.error('Clicked Phantom approve button');
    } else {
      // Fallback: try common Phantom button patterns
      console.error('[PHANTOM SELECTOR UNMAPPED] Trying common approve patterns...');
      const tried = await phantomPage.evaluate(() => {
        // Phantom typically has a primary button for approval
        const btns = Array.from(document.querySelectorAll('button'));
        const approve = btns.find(b =>
          /confirm|approve|sign/i.test(b.textContent)
        );
        if (approve) { approve.click(); return approve.textContent; }
        return null;
      });
      if (tried) {
        console.error(`Clicked button with text: "${tried}"`);
      } else {
        console.error('Could not find approve button in Phantom popup.');
        console.error('Manual approval needed, or update SELECTORS.phantomApprove');
        return { success: false, reason: 'phantom_button_not_found' };
      }
    }
  } catch (err) {
    console.error(`Phantom popup handling failed: ${err.message}`);
    return { success: false, reason: 'phantom_popup_failed', error: err.message };
  }

  // Wait for transaction confirmation on main page
  console.error('Waiting for transaction confirmation...');
  await page.waitForTimeout(5000);

  // Check for success indicator if mapped
  if (SELECTORS.successIndicator !== 'NEEDS_MAPPING') {
    try {
      await page.waitForSelector(SELECTORS.successIndicator, { timeout: TIMEOUTS.txConfirm });
      console.error('Transaction confirmed on page');
    } catch {
      console.error('Did not see success indicator; tx may still be pending');
    }
  }

  return { success: true, reason: 'collected' };
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  // Determine which tokens to check
  let addresses = [];

  if (singleAddress) {
    addresses = [singleAddress];
  } else if (doAll) {
    const launches = readJsonl(LAUNCHES_PATH);
    if (launches.length === 0) {
      console.error(`No token launches found in ${LAUNCHES_PATH}`);
      console.error('Launch a token first, or use --address with a known address.');
      process.exit(1);
    }
    // Extract addresses from launch records
    addresses = launches
      .map(l => l.address || l.mint || l.token_address)
      .filter(Boolean);
    console.error(`Found ${addresses.length} launched tokens`);
  }

  if (addresses.length === 0) {
    console.error('No token addresses to check.');
    process.exit(1);
  }

  // Connect to Chrome
  const browser = await connectBrowser();
  const page = await getPumpFunPage(browser);
  const results = [];

  for (const addr of addresses) {
    console.error(`\n--- Checking ${addr} ---`);

    try {
      await navigateToToken(page, addr);
      const feeResult = await checkFees(page, addr);
      results.push(feeResult);

      if (feeResult.needsMapping) {
        console.error('Selectors need mapping. Skipping collection.');
        continue;
      }

      if (feeResult.fees === 0 || feeResult.fees === null) {
        console.error('No fees to collect.');
        continue;
      }

      if (checkOnly) {
        console.log(`[CHECK] ${addr}: ${feeResult.fees} SOL available`);
        continue;
      }

      // Attempt collection
      const collectResult = await collectFees(page, browser, addr);

      const logEntry = {
        timestamp: new Date().toISOString(),
        address: addr,
        amount_sol: feeResult.fees,
        tx_hash: '',  // Would need to extract from page after confirmation
        status: collectResult.success ? 'collected' : 'failed',
        reason: collectResult.reason || '',
      };

      logFeeCollection(logEntry);
      console.log(`[${logEntry.status.toUpperCase()}] ${addr}: ${feeResult.fees} SOL`);

    } catch (err) {
      console.error(`Error processing ${addr}: ${err.message}`);
      const logEntry = {
        timestamp: new Date().toISOString(),
        address: addr,
        amount_sol: 0,
        tx_hash: '',
        status: 'error',
        reason: err.message,
      };
      logFeeCollection(logEntry);
      results.push({ address: addr, fees: null, error: err.message });
    }
  }

  // Summary
  console.error('\n=== Summary ===');
  for (const r of results) {
    if (r.needsMapping) {
      console.error(`  ${r.address}: NEEDS_MAPPING (run interactive debug)`);
    } else if (r.error) {
      console.error(`  ${r.address}: ERROR - ${r.error}`);
    } else {
      console.error(`  ${r.address}: ${r.fees ?? 'unknown'} SOL`);
    }
  }

  try { await browser.close(); } catch { /* borrowed connection, don't actually close */ }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
