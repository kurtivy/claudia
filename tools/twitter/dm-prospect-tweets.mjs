#!/usr/bin/env node
// dm-prospect-tweets.mjs — Find DM prospects from tweet search results
// Searches for tweets where people mention Telegram community problems, then extracts authors.
//
// Usage:
//   node dm-prospect-tweets.mjs "managing telegram community"
//   node dm-prospect-tweets.mjs "telegram group too many chats"
//   node dm-prospect-tweets.mjs "telegram CRM" --json

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { appendFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const PROSPECTS_FILE = join(HOME, '.claudia/schedule/initiatives/grow-twitter/dm-prospects.jsonl');
const CDP_URL = 'http://localhost:9222';

const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--'));
const jsonOutput = args.includes('--json');

if (!query) {
  console.error('Usage: node dm-prospect-tweets.mjs "search query" [--json]');
  process.exit(1);
}

const browser = await chromium.connectOverCDP(CDP_URL);
const contexts = browser.contexts();
if (!contexts.length) { console.error('No contexts'); process.exit(1); }

const pages = contexts[0].pages();
let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
if (!page) page = pages[0];

// Search Latest tweets (not Top) for recency
const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
console.error(`Searching tweets: ${query}`);
await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(3000);

// Extract tweets with author info
const tweets = await page.evaluate(() => {
  const results = [];
  const articles = document.querySelectorAll('article[data-testid="tweet"]');

  for (const article of articles) {
    try {
      const timeLink = article.querySelector('a[href*="/status/"]');
      if (!timeLink) continue;
      const url = timeLink.href;
      const handle = url.split('/')[3] || '';

      // Get display name
      const userLinks = article.querySelectorAll('a[role="link"]');
      let name = '';
      for (const link of userLinks) {
        const href = link.getAttribute('href') || '';
        if (href === `/${handle}`) {
          name = link.textContent?.trim() || '';
          break;
        }
      }

      // Get tweet text
      const textEl = article.querySelector('[data-testid="tweetText"]');
      const text = textEl?.innerText || '';

      // Get metrics
      const metricsGroup = article.querySelector('[role="group"]');
      const allText = metricsGroup?.textContent || '';

      results.push({ handle, name, text: text.substring(0, 300), url });
    } catch (e) { /* skip */ }
  }
  return results;
});

// Dedupe by handle, keep first (most relevant) tweet
const seen = new Set();
const unique = tweets.filter(t => {
  if (seen.has(t.handle)) return false;
  seen.add(t.handle);
  return true;
});

// Load existing prospects for cross-reference
const existing = new Set();
if (existsSync(PROSPECTS_FILE)) {
  readFileSync(PROSPECTS_FILE, 'utf8').split('\n').filter(l => l.trim()).forEach(l => {
    try { existing.add(JSON.parse(l).handle); } catch {}
  });
}

if (jsonOutput) {
  console.log(JSON.stringify(unique, null, 2));
} else {
  console.log(`\n${unique.length} unique authors found:\n`);
  for (const t of unique) {
    const tag = existing.has(t.handle) ? ' [SAVED]' : '';
    console.log(`@${t.handle}${tag} — ${t.name}`);
    console.log(`  ${t.text.substring(0, 150)}${t.text.length > 150 ? '...' : ''}`);
    console.log(`  ${t.url}`);
    console.log();
  }
}

// Save new prospects
let newCount = 0;
for (const t of unique) {
  if (!existing.has(t.handle)) {
    appendFileSync(PROSPECTS_FILE, JSON.stringify({
      handle: t.handle,
      name: t.name,
      bio: '',
      context: t.text.substring(0, 200),
      tweetUrl: t.url,
      query,
      found: new Date().toISOString(),
      status: 'new',
      dmSent: null
    }) + '\n');
    newCount++;
  }
}

if (newCount > 0) console.log(`${newCount} new prospects saved.`);

try { await browser.close(); } catch {}
