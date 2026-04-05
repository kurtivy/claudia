#!/usr/bin/env node
// dm-prospect.mjs — Search Twitter for DM prospects and generate personalized outreach
//
// Usage:
//   node dm-prospect.mjs --search "telegram community manager crypto"
//   node dm-prospect.mjs --search "managing telegram group" --min-followers 500
//   node dm-prospect.mjs --list                    # Show saved prospects
//   node dm-prospect.mjs --draft <handle>          # Generate DM draft for prospect
//   node dm-prospect.mjs --send <handle>           # Send DM to prospect (via cdp-dm.mjs)
//
// Saves prospects to dm-prospects.jsonl for tracking.
// Requires: Chrome on port 9222 with Twitter auth.

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const PROSPECTS_FILE = join(HOME, '.claudia/schedule/initiatives/grow-twitter/dm-prospects.jsonl');
const CDP_URL = 'http://localhost:9222';

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

// CMB DM templates — personalized based on context
// CMB = contact management at scale. Not a community tool — it manages contacts (groups + DMs).
// Real features: auto-sort chats into keyword-filtered folders, targeted folder messaging
// (with {firstname}/{username} vars), scheduled broadcasts (one-time or recurring),
// folder-specific auto-replies, message templates, bulk group management.
// Does NOT: track member activity, CRM analytics, engagement scoring, churn detection.
// Positioning: sell the outcome ("your Telegram inbox runs itself"), not the features.
const DM_TEMPLATES = {
  crypto_community: (handle) => `hey — quick question: how many Telegram chats are you managing right now? groups, DMs, partners, leads, all in one inbox? we built a bot that makes your Telegram inbox run itself. auto-sorts contacts into smart folders by keyword, then lets you message each folder separately with scheduled broadcasts. $15/mo. curious if that's a pain point`,

  community_manager: (handle) => `hey — noticed you manage a lot of Telegram contacts. do you ever feel like your inbox is unmanageable? we built Contact Manager Bot — it auto-sorts your groups and DMs into folders by keyword, then you can blast or auto-reply per folder. your Telegram contacts stay organized without you touching anything. would love your take on whether that solves a real problem`,

  small_business: (handle) => `hey — saw you use Telegram for work. question: how do you keep your contacts organized? we built a bot that auto-sorts your Telegram groups and DMs into smart folders, lets you schedule broadcasts to each folder, and sets up auto-replies. basically makes your Telegram inbox manage itself. curious if that'd be useful`,

  generic: (handle) => `hey — do you manage a lot of Telegram contacts? groups, DMs, channels? we built Contact Manager Bot — auto-sorts everything into keyword-filtered folders, scheduled broadcasts per folder, auto-replies, message templates. your inbox runs itself. $15/mo. would love feedback from someone who actually lives in Telegram`
};

function loadProspects() {
  if (!existsSync(PROSPECTS_FILE)) return [];
  return readFileSync(PROSPECTS_FILE, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function saveProspect(prospect) {
  appendFileSync(PROSPECTS_FILE, JSON.stringify(prospect) + '\n');
}

async function searchProspects(query, minFollowers = 0) {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  // Search Twitter People tab
  const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=user`;
  console.error(`Searching: ${query}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Extract user cards
  const users = await page.evaluate(() => {
    const results = [];
    const cells = document.querySelectorAll('[data-testid="UserCell"]');

    for (const cell of cells) {
      try {
        // Get all links — first with display name, handle is the one with @
        const links = cell.querySelectorAll('a[role="link"]');
        let handle = '';
        let name = '';
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href.match(/^\/[a-zA-Z0-9_]+$/)) {
            handle = href.slice(1);
            // First such link usually has the display name
            if (!name) name = link.textContent?.trim() || '';
          }
        }

        // Bio: look for the description div (not buttons or links)
        // It's typically a div with dir="auto" that's not inside a link
        const dirAutoDivs = cell.querySelectorAll('div[dir="auto"]');
        let bio = '';
        for (const div of dirAutoDivs) {
          const text = div.textContent?.trim() || '';
          // Skip if it's just the name, handle, or button text
          if (text === name || text.startsWith('@') || text === 'Follow' || text === 'Following' || text.length < 10) continue;
          // Skip if parent is a link (display name)
          if (div.closest('a')) continue;
          if (text.length > bio.length) bio = text;
        }

        if (handle && handle !== 'i') {
          results.push({ name, handle, bio: bio.substring(0, 200) });
        }
      } catch (e) { /* skip */ }
    }
    return results;
  });

  console.log(`\nFound ${users.length} accounts:\n`);

  const existing = loadProspects().map(p => p.handle);

  for (const u of users) {
    const status = existing.includes(u.handle) ? ' [SAVED]' : '';
    console.log(`@${u.handle} (${u.followers} followers)${status}`);
    console.log(`  ${u.name}`);
    console.log(`  ${u.bio.substring(0, 120)}${u.bio.length > 120 ? '...' : ''}`);
    console.log();

    // Auto-save new prospects
    if (!existing.includes(u.handle)) {
      saveProspect({
        handle: u.handle,
        name: u.name,
        bio: u.bio,
        followers: u.followers,
        query,
        found: new Date().toISOString(),
        status: 'new',
        dmSent: null
      });
    }
  }

  console.log(`${users.length} prospects found. ${users.filter(u => !existing.includes(u.handle)).length} new.`);
  try { await browser.close(); } catch {}
}

// Commands
if (hasFlag('search')) {
  const query = getArg('search');
  const minFollowers = parseInt(getArg('min-followers') || '0');
  if (!query) { console.error('--search requires a query'); process.exit(1); }
  await searchProspects(query, minFollowers);

} else if (hasFlag('list')) {
  const prospects = loadProspects();
  if (prospects.length === 0) { console.log('No prospects saved yet. Use --search first.'); process.exit(0); }

  const byStatus = { new: [], drafted: [], sent: [], replied: [] };
  for (const p of prospects) { (byStatus[p.status] || []).push(p); }

  for (const [status, items] of Object.entries(byStatus)) {
    if (items.length === 0) continue;
    console.log(`\n${status.toUpperCase()} (${items.length}):`);
    for (const p of items) {
      console.log(`  @${p.handle} — ${p.name} (${p.followers} followers)`);
      if (p.dmSent) console.log(`    DM sent: ${p.dmSent}`);
    }
  }

} else if (hasFlag('draft')) {
  const handle = getArg('draft')?.replace(/^@/, '');
  if (!handle) { console.error('--draft requires a handle'); process.exit(1); }

  const prospects = loadProspects();
  const prospect = prospects.find(p => p.handle === handle);

  if (!prospect) {
    console.log(`@${handle} not in prospects. Using generic template.\n`);
    console.log(DM_TEMPLATES.generic(handle));
    process.exit(0);
  }

  // Pick template based on bio + context keywords
  const text = ((prospect.bio || '') + ' ' + (prospect.context || '')).toLowerCase();
  let template = 'generic';
  if (/community.*manag|cm\b|mod\b|moderator|admin/i.test(text)) template = 'community_manager';
  else if (/crypto|web3|defi|nft|token|blockchain/i.test(text)) template = 'crypto_community';
  else if (/business|founder|ceo|startup|entrepreneur/i.test(text)) template = 'small_business';

  console.log(`Template: ${template}`);
  console.log(`Bio: ${prospect.bio?.substring(0, 100)}\n`);
  console.log(DM_TEMPLATES[template](handle));

} else {
  console.error('Usage:');
  console.error('  node dm-prospect.mjs --search "query"         # Find prospects');
  console.error('  node dm-prospect.mjs --list                   # Show saved prospects');
  console.error('  node dm-prospect.mjs --draft <handle>         # Generate DM draft');
  process.exit(2);
}
