#!/usr/bin/env node
// cdp-dm.mjs — Send a Twitter DM using Kurt's Chrome via CDP
// Usage: node cdp-dm.mjs <username> "message text"
// Usage: node cdp-dm.mjs <username> --file message.txt
// Usage: node cdp-dm.mjs <username> "message" --dry-run
// Usage: node cdp-dm.mjs --check handle1 handle2 handle3  (check DM availability)
//
// Navigates to DM compose, finds/creates conversation, types and sends.
// Requires: playwright in ../browser/node_modules/, Chrome on port 9222 with DMs unlocked

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const LOG_FILE = join(HOME, '.claudia/schedule/initiatives/grow-twitter/dm-log.jsonl');
const CDP_URL = 'http://localhost:9222';

const args = process.argv.slice(2);
const checkMode = args[0] === '--check';

if (checkMode) {
  // Check DM availability for multiple handles
  const handles = args.slice(1).map(h => h.replace(/^@/, ''));
  if (!handles.length) { console.error('Usage: node cdp-dm.mjs --check handle1 handle2 ...'); process.exit(2); }

  (async () => {
    const browser = await chromium.connectOverCDP(CDP_URL);
    const pages = browser.contexts()[0].pages();
    let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
    if (!page) page = pages[0];

    const results = [];
    for (const handle of handles) {
      await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      const hasDM = await page.evaluate(() => !!document.querySelector('[aria-label="Message"]'));
      const status = hasDM ? 'OPEN' : 'CLOSED';
      results.push({ handle, status });
      console.log(`@${handle}: ${status}`);
    }

    const open = results.filter(r => r.status === 'OPEN').map(r => `@${r.handle}`);
    console.log(`\n${open.length}/${results.length} have open DMs${open.length ? ': ' + open.join(', ') : ''}`);
    try { await browser.close(); } catch {}
  })().catch(e => { console.error(e.message); process.exit(1); });

  // Skip rest of script
} else {

const username = args[0]?.replace(/^@/, '');
const dryRun = args.includes('--dry-run');
let message;

if (args[1] === '--file') {
  message = readFileSync(args[2], 'utf8').trim();
} else {
  message = args.filter(a => a !== '--dry-run').slice(1).join(' ');
}

if (!username || !message) {
  console.error('Usage: node cdp-dm.mjs <username> "message text"');
  console.error('       node cdp-dm.mjs <username> --file message.txt');
  console.error('       node cdp-dm.mjs --check handle1 handle2 ...');
  console.error('Flags: --dry-run');
  process.exit(2);
}

// Sanitize problematic Unicode chars that break Twitter's React state via CDP typing
message = message
  .replace(/\u2014/g, '-')   // em dash → hyphen
  .replace(/\u2013/g, '-')   // en dash → hyphen
  .replace(/\u2018/g, "'")   // left single quote → apostrophe
  .replace(/\u2019/g, "'")   // right single quote → apostrophe
  .replace(/\u201C/g, '"')   // left double quote → straight quote
  .replace(/\u201D/g, '"');  // right double quote → straight quote

console.error(`DM to: @${username}`);
console.error(`Message (${message.length}c): ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

if (dryRun) {
  console.log(`[DRY RUN] Would send DM to @${username}:`);
  console.log(message);
  process.exit(0);
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  if (!page) { console.error('No pages'); process.exit(1); }

  // Navigate to user's profile and click Message button (more reliable than compose dialog)
  console.error(`Opening @${username}'s profile...`);
  await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Check for Message button on profile
  const hasMsgBtn = await page.evaluate(() => {
    const btn = document.querySelector('[aria-label="Message"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!hasMsgBtn) {
    console.error(`@${username} does not accept DMs (no Message button on profile).`);
    process.exit(1);
  }
  console.error('Message button clicked, waiting for DM UI...');
  await page.waitForTimeout(5000);

  // Wait for DM textarea with retries (Twitter sometimes lazy-loads it)
  let foundTextarea = false;
  for (let i = 0; i < 10; i++) {
    foundTextarea = await page.evaluate(() => {
      const ta = document.querySelector('[data-testid="dm-composer-textarea"]');
      return ta ? true : false;
    });
    if (foundTextarea) break;
    if (i === 4) {
      // Fallback: try navigating directly to DM compose URL
      console.error('Textarea not found after 5s, trying direct DM URL...');
      await page.goto(`https://x.com/messages/compose`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      // Search for user in compose dialog
      const searchInput = await page.locator('[data-testid="searchPeople"]').first();
      if (await searchInput.count() > 0) {
        await searchInput.click();
        await page.keyboard.type(username, { delay: 20 });
        await page.waitForTimeout(2000);
        // Click the first result
        await page.evaluate((uname) => {
          const items = document.querySelectorAll('[data-testid="TypeaheadUser"]');
          for (const item of items) {
            if (item.textContent.toLowerCase().includes(uname.toLowerCase())) {
              item.click();
              return true;
            }
          }
          if (items.length) { items[0].click(); return true; }
          return false;
        }, username);
        await page.waitForTimeout(1000);
        // Click Next button to open conversation
        await page.evaluate(() => {
          const btn = document.querySelector('[data-testid="nextButton"]');
          if (btn) btn.click();
        });
        await page.waitForTimeout(3000);
      }
    }
    await page.waitForTimeout(1000);
  }

  if (!foundTextarea) {
    console.error('DM textarea did not appear after 10 retries (both profile and compose methods).');
    process.exit(1);
  }

  // Focus textarea via JS evaluate (avoids DOM detachment issues)
  await page.evaluate(() => document.querySelector('[data-testid="dm-composer-textarea"]').focus());
  await page.waitForTimeout(300);

  // Type the message
  console.error('Typing message...');
  await page.keyboard.type(message, { delay: 10 });
  await page.waitForTimeout(500);

  // Send — click send button via evaluate (avoids DOM detachment)
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="dm-composer-send-button"]') || document.querySelector('[aria-label="Send"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);

  // Verify — check if textarea is empty (means message was sent)
  const remaining = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="dm-composer-textarea"]');
    return box?.value || '';
  });

  const logEntry = {
    ts: new Date().toISOString(),
    username: `@${username}`,
    message,
    chars: message.length,
    result: remaining.length < 5 ? 'sent' : 'uncertain'
  };

  if (remaining.length < 5) {
    console.log(`DM sent to @${username}`);
  } else {
    console.error(`DM may not have sent — input still has content: ${remaining.substring(0, 50)}`);
    logEntry.result = 'failed';
  }

  try { appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n'); } catch {}
  console.log(`Logged to: ${LOG_FILE}`);

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

} // end else (not --check mode)
