#!/usr/bin/env node
// thread-search.mjs — Search Twitter for threads matching keywords via CDP
// Usage: node thread-search.mjs "AI agent payments"
//        node thread-search.mjs "agentic commerce" --min-views 1000
//        node thread-search.mjs "vertical AI" --json
//
// Connects to Chrome on port 9222 via Playwright CDP connector.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('../browser/node_modules/playwright');

const CDP_URL = 'http://localhost:9222';
const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--'));
const minViews = parseInt(args[args.indexOf('--min-views') + 1]) || 0;
const jsonOutput = args.includes('--json');

if (!query) {
  console.error('Usage: node thread-search.mjs "search query" [--min-views N] [--json]');
  process.exit(1);
}

function parseCount(s) {
  if (!s) return 0;
  s = s.replace(/,/g, '').trim();
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000000;
  return parseInt(s) || 0;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) { console.error('No browser contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  if (!page) { console.error('No pages found'); process.exit(1); }

  const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=top`;
  console.error(`Searching: ${query}`);

  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);

  const tweets = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('article')).map(article => {
      try {
        const timeLink = article.querySelector('a[href*="/status/"]');
        if (!timeLink) return null;
        const url = timeLink.href;
        const userLink = article.querySelector('a[role="link"][href^="/"]');
        const author = userLink?.href?.split('/').pop() || 'unknown';
        const textEl = article.querySelector('[data-testid="tweetText"]');
        const text = textEl?.innerText?.substring(0, 200) || '';
        const viewEl = article.querySelector('a[href*="/analytics"]');
        const views = viewEl?.innerText || '0';
        const metricsGroup = article.querySelector('[role="group"]');
        const spans = metricsGroup ? Array.from(metricsGroup.querySelectorAll('[data-testid="app-text-transition-container"]')) : [];
        const metricVals = spans.map(s => s.innerText || '0');
        return { url, author, text, views, replies: metricVals[0] || '0', retweets: metricVals[1] || '0', likes: metricVals[2] || '0' };
      } catch { return null; }
    }).filter(Boolean);
  });

  const filtered = tweets.filter(t => parseCount(t.views) >= minViews);

  if (jsonOutput) {
    console.log(JSON.stringify(filtered, null, 2));
  } else {
    console.log(`\nFound ${filtered.length} tweets${minViews ? ` with ${minViews}+ views` : ''}:\n`);
    for (const t of filtered) {
      console.log(`@${t.author} — ${t.views || '?'} views, ${t.likes || '0'} likes, ${t.replies || '0'} replies`);
      console.log(`  ${t.url}`);
      console.log(`  ${t.text.substring(0, 120)}${t.text.length > 120 ? '...' : ''}`);
      console.log();
    }
  }

  try { await browser.close(); } catch { /* borrowed connection */ }
}

main().catch(e => { console.error(e.message); process.exit(1); });
