#!/usr/bin/env node
// dm-followup.mjs — Follow up on cold DMs that got no response
// Usage: node dm-followup.mjs                    # check all, show who needs follow-up
//        node dm-followup.mjs --send              # actually send follow-ups
//        node dm-followup.mjs --send --delay 20   # seconds between sends (default: 15)
//        node dm-followup.mjs --hours 12           # follow up after 12h instead of 24h
//
// Reads dm-log.jsonl, finds DMs sent > threshold ago with no follow-up yet.
// Navigates to each DM thread to check if they replied.
// For non-responders, sends a short, different follow-up.
//
// Requires: Chrome on port 9222 with Twitter auth + DMs unlocked.

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const LOG_FILE = join(HOME, '.claudia/schedule/initiatives/grow-twitter/dm-log.jsonl');
const CDP_URL = 'http://localhost:9222';

// Follow-up templates — short, different angle, no feature list
const FOLLOWUPS = [
  `hey just checking in - would a quick 2-min demo be easier than explaining over DM? happy to screen record one for you`,
  `following up - no pressure, just curious if the Telegram inbox problem resonated or if you've got it handled another way`,
  `hey - figured I'd follow up once. if managing Telegram contacts isn't a pain point for you, totally fine. but if it is, happy to show you what we built`,
];

function pickFollowup(handle) {
  // Deterministic pick based on handle so same person always gets same follow-up
  const hash = [...handle].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return FOLLOWUPS[hash % FOLLOWUPS.length];
}

// Parse args
const args = process.argv.slice(2);
const sendMode = args.includes('--send');
const hoursIdx = args.indexOf('--hours');
const thresholdHours = hoursIdx >= 0 ? parseInt(args[hoursIdx + 1]) || 24 : 24;
const delayIdx = args.indexOf('--delay');
const delaySec = delayIdx >= 0 ? parseInt(args[delayIdx + 1]) || 15 : 15;

// Read DM log
if (!existsSync(LOG_FILE)) {
  console.error('No dm-log.jsonl found. No DMs to follow up on.');
  process.exit(0);
}

const entries = readFileSync(LOG_FILE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

// Find initial DMs (not follow-ups) that were sent successfully
const sentDMs = entries.filter(e => e.result === 'sent' && e.type !== 'followup');
const followupsSent = new Set(
  entries.filter(e => e.type === 'followup').map(e => e.username.replace(/^@/, '').toLowerCase())
);

const now = Date.now();
const thresholdMs = thresholdHours * 60 * 60 * 1000;

// Filter for DMs old enough and not yet followed up
const candidates = sentDMs.filter(dm => {
  const age = now - new Date(dm.ts).getTime();
  const handle = dm.username.replace(/^@/, '').toLowerCase();
  return age >= thresholdMs && !followupsSent.has(handle);
});

if (candidates.length === 0) {
  console.log('No DMs need follow-up yet.');
  const pending = sentDMs.filter(dm => {
    const age = now - new Date(dm.ts).getTime();
    const handle = dm.username.replace(/^@/, '').toLowerCase();
    return age < thresholdMs && !followupsSent.has(handle);
  });
  if (pending.length) {
    console.log(`${pending.length} DMs still within ${thresholdHours}h window:`);
    pending.forEach(dm => {
      const hoursAgo = ((now - new Date(dm.ts).getTime()) / 3600000).toFixed(1);
      console.log(`  ${dm.username} — sent ${hoursAgo}h ago`);
    });
  }
  process.exit(0);
}

console.log(`\n${candidates.length} DMs ready for follow-up (sent >${thresholdHours}h ago, no follow-up yet):\n`);

// Show candidates
candidates.forEach(dm => {
  const hoursAgo = ((now - new Date(dm.ts).getTime()) / 3600000).toFixed(1);
  const handle = dm.username.replace(/^@/, '');
  const followup = pickFollowup(handle);
  console.log(`  ${dm.username} — sent ${hoursAgo}h ago`);
  console.log(`    Follow-up: "${followup.substring(0, 80)}..."`);
  console.log();
});

if (!sendMode) {
  console.log('Dry run. Use --send to actually send follow-ups.');
  process.exit(0);
}

// Send follow-ups
console.log('Connecting to Chrome...\n');

const browser = await chromium.connectOverCDP(CDP_URL);
const pages = browser.contexts()[0].pages();
let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
if (!page) page = pages[0];

let sent = 0;
let skipped = 0;
let responded = 0;

// Phase 1: Check inbox for responses (fast, no compose dialog needed)
console.log('Phase 1: Checking inbox for responses...\n');
await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

const inboxText = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="dm-inbox-panel"]') || document.querySelector('main');
  return panel ? panel.innerText : '';
});

// Parse inbox: lines that DON'T start with "You:" indicate they replied
const inboxLines = inboxText.split('\n').filter(l => l.trim());
const respondedHandles = new Set();

for (let i = 0; i < inboxLines.length; i++) {
  const line = inboxLines[i].trim();
  const isTime = /^\d+[hms]$|^\d+[wd]$|^\d+mo?$|^just now$/i.test(line);
  if (isTime && i > 0 && i + 1 < inboxLines.length) {
    const name = inboxLines[i - 1]?.trim();
    const preview = inboxLines[i + 1]?.trim() || '';
    if (name && !preview.startsWith('You:') && preview.length > 0) {
      // This conversation has a response from them
      respondedHandles.add(name.toLowerCase());
    }
  }
}

// Filter out candidates who responded
const toSend = [];
for (const dm of candidates) {
  const handle = dm.username.replace(/^@/, '');
  const nameLower = handle.toLowerCase();
  // Check if any inbox name matches this handle
  const hasResponse = [...respondedHandles].some(n =>
    n.includes(nameLower) || nameLower.includes(n.replace(/[^a-z0-9]/g, ''))
  );
  if (hasResponse) {
    console.log(`  @${handle} — RESPONDED! Skipping follow-up.`);
    responded++;
  } else {
    toSend.push(dm);
  }
}

if (toSend.length === 0) {
  console.log('\nAll candidates responded or were filtered. Nothing to send.');
  try { await browser.close(); } catch {}
  process.exit(0);
}

console.log(`\nPhase 2: Sending ${toSend.length} follow-ups...\n`);

// Phase 2: Send follow-ups via profile -> Message button (reliable path)
// The DM search/compose dialog approach fails — TypeaheadUser results don't render.
// Profile route: go to /@handle, click Message button, type in DM textarea, send.
for (const dm of toSend) {
  const handle = dm.username.replace(/^@/, '');
  const followupText = pickFollowup(handle);
  console.log(`Sending to @${handle}...`);

  // Navigate to profile
  await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Click Message button on profile
  const hasMessage = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="sendDMFromProfile"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (!hasMessage) {
    console.log(`  @${handle} does not accept DMs (no Message button). Skipping.`);
    skipped++;
    continue;
  }
  await page.waitForTimeout(3000);

  // Wait for DM textarea
  let foundTextarea = false;
  for (let i = 0; i < 6; i++) {
    foundTextarea = await page.evaluate(() =>
      !!document.querySelector('[data-testid="dmComposerTextInput"]') ||
      !!document.querySelector('[data-testid="dm-composer-textarea"]')
    );
    if (foundTextarea) break;
    await page.waitForTimeout(1500);
  }

  if (!foundTextarea) {
    console.log(`  Textarea didn't appear for @${handle}. Skipping.`);
    skipped++;
    continue;
  }

  // Focus and type
  await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="dmComposerTextInput"]') ||
               document.querySelector('[data-testid="dm-composer-textarea"]');
    if (ta) ta.focus();
  });
  await page.waitForTimeout(300);
  await page.keyboard.type(followupText, { delay: 10 });
  await page.waitForTimeout(500);

  // Send
  const sentOk = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="dmComposerSendButton"]') ||
                document.querySelector('[data-testid="dm-composer-send-button"]') ||
                document.querySelector('[aria-label="Send"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  if (sentOk) {
    await page.waitForTimeout(1500);
    console.log(`  Sent follow-up to @${handle}`);
    sent++;

    const logEntry = {
      ts: new Date().toISOString(),
      username: `@${handle}`,
      message: followupText,
      chars: followupText.length,
      result: 'sent',
      type: 'followup',
      originalTs: dm.ts,
    };
    appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  } else {
    console.log(`  No send button for @${handle}. Skipping.`);
    skipped++;
  }

  if (toSend.indexOf(dm) < toSend.length - 1) {
    console.log(`  Waiting ${delaySec}s...`);
    await page.waitForTimeout(delaySec * 1000);
  }
}

console.log(`\nDone. Sent: ${sent}, Responded: ${responded}, Skipped: ${skipped}`);
try { await browser.close(); } catch {}
