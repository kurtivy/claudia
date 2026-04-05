#!/usr/bin/env node
// dm-batch.mjs — Batch DM pipeline: check DMs open → pick template → send → log
// Usage: node dm-batch.mjs handle1 handle2 handle3
//        node dm-batch.mjs --file prospects.txt         # one handle per line
//        node dm-batch.mjs handle1 handle2 --dry-run    # check DMs, show drafts, don't send
//        node dm-batch.mjs handle1 --delay 30           # seconds between DMs (default: 15)
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

// CMB DM templates — aligned with actual product features
// Real features: auto-sort chats into keyword-filtered folders, targeted folder messaging
// (with {firstname}/{username} vars), scheduled broadcasts (one-time or recurring),
// folder-specific auto-replies, message templates, bulk group management.
// Positioning: contact management at scale (groups + DMs), not community tool. Sell the outcome.
// V2 templates — short, question-first, no feature dump.
// Research says: 50-125 words, one clear CTA, invite a response.
// First DM should be a conversation starter, not a pitch.
const TEMPLATES = {
  community_manager: () => `hey quick question - how do you keep your Telegram contacts organized across all your groups? we built a bot that auto-sorts everything into folders. curious if that's a pain point for you or if you've solved it another way`,

  crypto_community: () => `hey - how many Telegram groups are you juggling right now? we built a bot that auto-sorts contacts into folders and lets you message each segment separately. curious if inbox chaos is something you deal with`,

  small_business: () => `hey - saw you use Telegram for work. how do you keep track of who's in which group? we built something that auto-organizes your contacts. curious if that's a problem you've run into`,

  generic: () => `hey - do you manage a lot of Telegram contacts? curious how you keep them organized. we built a bot that auto-sorts everything into smart folders. wondering if that solves a real problem or if most people have it handled`
};

function pickTemplate(bio) {
  const text = (bio || '').toLowerCase();
  if (/community.*manag|cm\b|mod\b|moderator|admin/i.test(text)) return 'community_manager';
  if (/crypto|web3|defi|nft|token|blockchain/i.test(text)) return 'crypto_community';
  if (/business|founder|ceo|startup|entrepreneur/i.test(text)) return 'small_business';
  return 'generic';
}

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const delayIdx = args.indexOf('--delay');
const delaySec = delayIdx >= 0 ? parseInt(args[delayIdx + 1]) || 15 : 15;
const fileIdx = args.indexOf('--file');

let handles;
if (fileIdx >= 0 && args[fileIdx + 1]) {
  handles = readFileSync(args[fileIdx + 1], 'utf8')
    .split('\n')
    .map(l => l.trim().replace(/^@/, ''))
    .filter(Boolean);
} else {
  handles = args
    .filter(a => !a.startsWith('--') && !(delayIdx >= 0 && args[delayIdx + 1] === a))
    .map(h => h.replace(/^@/, ''));
}

if (handles.length === 0) {
  console.error('Usage: node dm-batch.mjs handle1 handle2 [--dry-run] [--delay 15]');
  console.error('       node dm-batch.mjs --file prospects.txt [--dry-run]');
  process.exit(2);
}

console.error(`\nDM Batch Pipeline — ${handles.length} handles, delay: ${delaySec}s, dry-run: ${dryRun}\n`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }
  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  if (!page) { console.error('No pages'); process.exit(1); }

  const results = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i];
    console.error(`\n[${i + 1}/${handles.length}] @${handle}`);

    // Navigate to profile
    await page.goto(`https://x.com/${handle}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Get bio and check Message button
    const profileData = await page.evaluate(() => {
      const msgBtn = document.querySelector('[aria-label="Message"]');
      const bioEl = document.querySelector('[data-testid="UserDescription"]');
      return {
        hasMessageBtn: !!msgBtn,
        bio: bioEl ? bioEl.textContent.substring(0, 200) : ''
      };
    });

    if (!profileData.hasMessageBtn) {
      console.error(`  DMs CLOSED — skipping`);
      results.push({ handle, status: 'dms_closed', bio: profileData.bio });
      continue;
    }

    // Pick template
    const templateName = pickTemplate(profileData.bio);
    const message = TEMPLATES[templateName]();
    console.error(`  DMs OPEN | template: ${templateName}`);
    console.error(`  Bio: ${profileData.bio.substring(0, 80)}...`);
    console.error(`  Message (${message.length}c): ${message.substring(0, 80)}...`);

    if (dryRun) {
      console.log(`[DRY RUN] @${handle} — ${templateName}: ${message.substring(0, 100)}...`);
      results.push({ handle, status: 'dry_run', template: templateName, bio: profileData.bio });
      continue;
    }

    // Click Message button
    await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Message"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(5000);

    // Wait for DM textarea with compose dialog fallback
    let foundTextarea = false;
    for (let j = 0; j < 10; j++) {
      foundTextarea = await page.evaluate(() => {
        const ta = document.querySelector('[data-testid="dm-composer-textarea"]');
        return !!ta;
      });
      if (foundTextarea) break;
      if (j === 4) {
        // Fallback: try compose dialog route
        console.error(`  Textarea not found after 5s, trying compose dialog...`);
        await page.goto(`https://x.com/messages/compose`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        const searchInput = await page.locator('[data-testid="searchPeople"]').first();
        if (await searchInput.count() > 0) {
          await searchInput.click();
          await page.keyboard.type(handle, { delay: 20 });
          await page.waitForTimeout(2000);
          await page.evaluate((uname) => {
            const items = document.querySelectorAll('[data-testid="TypeaheadUser"]');
            for (const item of items) {
              if (item.textContent.toLowerCase().includes(uname.toLowerCase())) {
                item.click(); return true;
              }
            }
            if (items.length) { items[0].click(); return true; }
            return false;
          }, handle);
          await page.waitForTimeout(1000);
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
      console.error(`  Textarea failed to render (both methods) — skipping`);
      results.push({ handle, status: 'textarea_failed', bio: profileData.bio });
      continue;
    }

    // Focus, type, send
    await page.evaluate(() => document.querySelector('[data-testid="dm-composer-textarea"]').focus());
    await page.waitForTimeout(300);
    await page.keyboard.type(message, { delay: 10 });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="dm-composer-send-button"]') || document.querySelector('[aria-label="Send"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    // Verify
    const remaining = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="dm-composer-textarea"]');
      return box?.value || '';
    });

    const sent = remaining.length < 5;
    const result = sent ? 'sent' : 'failed';
    console.error(`  Result: ${result}`);

    results.push({ handle, status: result, template: templateName, bio: profileData.bio });

    // Log
    try {
      appendFileSync(LOG_FILE, JSON.stringify({
        ts: new Date().toISOString(),
        username: `@${handle}`,
        message,
        chars: message.length,
        template: templateName,
        result
      }) + '\n');
    } catch {}

    // Delay between DMs
    if (i < handles.length - 1) {
      console.error(`  Waiting ${delaySec}s...`);
      await page.waitForTimeout(delaySec * 1000);
    }
  }

  // Summary
  console.error('\n--- Summary ---');
  const sent = results.filter(r => r.status === 'sent').length;
  const closed = results.filter(r => r.status === 'dms_closed').length;
  const failed = results.filter(r => r.status === 'textarea_failed' || r.status === 'failed').length;
  const dryRunCount = results.filter(r => r.status === 'dry_run').length;
  console.error(`Sent: ${sent} | DMs closed: ${closed} | Failed: ${failed} | Dry run: ${dryRunCount}`);

  console.log(JSON.stringify(results, null, 2));

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
