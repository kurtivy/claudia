#!/usr/bin/env node
// dm-inbox-check.mjs — Check DM inbox for responses to our outreach
// Usage: node dm-inbox-check.mjs                  # show all recent DM conversations
//        node dm-inbox-check.mjs --responses-only  # only show conversations where they replied
//
// Reads the DM inbox via CDP and checks which conversations have responses
// (messages NOT starting with "You:"). Cross-references with dm-log.jsonl.
//
// Requires: Chrome on port 9222 with Twitter auth + DMs unlocked.

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const LOG_FILE = join(HOME, '.claudia/schedule/initiatives/grow-twitter/dm-log.jsonl');
const CDP_URL = 'http://localhost:9222';

const responsesOnly = process.argv.includes('--responses-only');

// Load DM log to know who we messaged
const sentHandles = new Set();
if (existsSync(LOG_FILE)) {
  readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (entry.result === 'sent') {
        sentHandles.add(entry.username.replace(/^@/, '').toLowerCase());
      }
    } catch {}
  });
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  // Navigate to DM inbox
  if (!page.url().includes('/messages') && !page.url().includes('/i/chat')) {
    await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  }

  // Get inbox text
  const inboxText = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="dm-inbox-panel"]') || document.querySelector('main');
    return container ? container.innerText : document.body.innerText;
  });

  // Parse conversations from inbox text
  // Format: "Name\nTime\nYou: message preview" or "Name\nTime\nmessage preview"
  const lines = inboxText.split('\n').filter(l => l.trim());
  const conversations = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip non-conversation lines
    if (['Chat', 'All', 'Search', 'Messages'].includes(line)) continue;

    // Time indicators
    const isTime = /^\d+[hms]$|^\d+[wd]$|^\d+mo?$|^just now$/i.test(line);

    if (isTime && i > 0) {
      // Previous line was the name
      const name = lines[i - 1]?.trim();
      // Next line is the preview
      const preview = lines[i + 1]?.trim() || '';

      if (name && !['Chat', 'All', 'Search', 'Messages'].includes(name)) {
        conversations.push({
          name,
          time: line,
          preview,
          isOurMessage: preview.startsWith('You:'),
          theyReplied: !preview.startsWith('You:') && preview.length > 0,
        });
      }
    }
  }

  // Display results
  const tracked = conversations.filter(c => {
    // Try to match by name to our sent handles
    const nameLower = c.name.toLowerCase();
    return [...sentHandles].some(h => nameLower.includes(h) || h.includes(nameLower.replace(/[^a-z0-9]/g, '')));
  });

  const untracked = conversations.filter(c => !tracked.includes(c));

  if (responsesOnly) {
    const responses = conversations.filter(c => c.theyReplied);
    if (responses.length === 0) {
      console.log('No responses found in visible DM inbox.');
    } else {
      console.log(`${responses.length} conversation(s) with responses:\n`);
      responses.forEach(c => {
        console.log(`  ${c.name} (${c.time}): ${c.preview.substring(0, 80)}`);
      });
    }
  } else {
    console.log(`DM Inbox — ${conversations.length} conversations visible\n`);

    if (tracked.length) {
      console.log('--- Outreach conversations ---');
      tracked.forEach(c => {
        const status = c.theyReplied ? 'REPLIED' : 'waiting';
        console.log(`  [${status}] ${c.name} (${c.time}): ${c.preview.substring(0, 70)}`);
      });
      console.log();
    }

    if (untracked.length) {
      console.log('--- Other conversations ---');
      untracked.forEach(c => {
        const status = c.theyReplied ? 'REPLIED' : 'sent';
        console.log(`  [${status}] ${c.name} (${c.time}): ${c.preview.substring(0, 70)}`);
      });
    }
  }

  console.log(`\nSent handles tracked: ${sentHandles.size}`);
  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
