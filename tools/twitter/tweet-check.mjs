#!/usr/bin/env node
// tweet-check.mjs — Check engagement stats for a tweet URL via CDP
// Usage: node tweet-check.mjs <tweet-url>              # Single tweet
//        node tweet-check.mjs --file targets.txt       # One URL per line
//        node tweet-check.mjs --min-views 1000 <urls>  # Filter by min views
//        node tweet-check.mjs --json <urls>             # JSON output
//
// Returns: views, likes, replies, reposts, bookmarks for each tweet
// Requires: Chrome running with --remote-debugging-port=9222

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';

const CDP_URL = 'http://localhost:9222';

async function checkTweet(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // Extract engagement metrics from the tweet article
    const metrics = await page.evaluate(() => {
      const result = { views: 0, likes: 0, replies: 0, reposts: 0, bookmarks: 0 };

      // Find the main tweet article (first one on the page)
      const article = document.querySelector('article[data-testid="tweet"]');
      if (!article) return result;

      // Get the tweet text
      const tweetText = article.querySelector('[data-testid="tweetText"]');
      result.text = tweetText ? tweetText.textContent.substring(0, 100) : '';

      // Get author
      const userLinks = article.querySelectorAll('a[role="link"]');
      for (const link of userLinks) {
        const href = link.getAttribute('href');
        if (href && href.startsWith('/') && !href.includes('/status/') && href.length > 1) {
          result.author = href.slice(1);
          break;
        }
      }

      // Parse engagement numbers from aria-labels on the action buttons
      const groups = article.querySelectorAll('[role="group"] button');
      for (const btn of groups) {
        const label = btn.getAttribute('aria-label') || '';
        const match = label.match(/(\d[\d,]*)\s+(repl|like|repost|bookmark|view)/i);
        if (match) {
          const num = parseInt(match[1].replace(/,/g, ''));
          const type = match[2].toLowerCase();
          if (type.startsWith('repl')) result.replies = num;
          else if (type.startsWith('like')) result.likes = num;
          else if (type.startsWith('repost')) result.reposts = num;
          else if (type.startsWith('bookmark')) result.bookmarks = num;
          else if (type.startsWith('view')) result.views = num;
        }
      }

      // Try to get views from the analytics link
      const analyticsLink = document.querySelector('a[href*="/analytics"]');
      if (analyticsLink && result.views === 0) {
        const viewText = analyticsLink.textContent;
        const viewMatch = viewText.match(/([\d,.]+[KMB]?)\s*view/i);
        if (viewMatch) {
          let v = viewMatch[1].replace(/,/g, '');
          if (v.endsWith('K')) v = parseFloat(v) * 1000;
          else if (v.endsWith('M')) v = parseFloat(v) * 1000000;
          else if (v.endsWith('B')) v = parseFloat(v) * 1000000000;
          result.views = Math.round(parseFloat(v));
        }
      }

      return result;
    });

    return { url, ...metrics, error: null };
  } catch (e) {
    return { url, views: 0, likes: 0, replies: 0, reposts: 0, bookmarks: 0, error: e.message.substring(0, 100) };
  }
}

// Parse args
const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const minViewsIdx = args.indexOf('--min-views');
const minViews = minViewsIdx !== -1 ? parseInt(args[minViewsIdx + 1]) || 0 : 0;
const fileIdx = args.indexOf('--file');

let urls = [];
if (fileIdx !== -1) {
  urls = readFileSync(args[fileIdx + 1], 'utf8').split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
} else {
  urls = args.filter(a => a.startsWith('http'));
}

if (urls.length === 0) {
  console.error('Usage: node tweet-check.mjs <tweet-url> [<tweet-url2> ...]');
  console.error('       node tweet-check.mjs --file targets.txt');
  console.error('       node tweet-check.mjs --min-views 1000 --json <urls>');
  process.exit(1);
}

// Connect and check
let browser;
try {
  browser = await chromium.connectOverCDP(CDP_URL);
} catch (e) {
  console.error('Cannot connect to Chrome CDP on', CDP_URL);
  console.error('Start Chrome with: --remote-debugging-port=9222');
  process.exit(1);
}

const context = browser.contexts()[0];
const page = context?.pages()[0] || await context.newPage();
const results = [];

for (const url of urls) {
  const result = await checkTweet(page, url);
  results.push(result);

  if (!jsonMode) {
    const pass = result.views >= minViews;
    const tag = result.error ? 'ERROR' : pass ? 'PASS' : 'SKIP';
    console.log(`[${tag}] ${result.views.toLocaleString()} views | ${result.likes} likes | ${result.replies} replies | @${result.author || '?'}`);
    if (result.text) console.log(`  "${result.text}${result.text.length >= 100 ? '...' : ''}"`);
    console.log(`  ${url}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    console.log();
  }
}

if (jsonMode) {
  const filtered = minViews > 0 ? results.filter(r => r.views >= minViews) : results;
  console.log(JSON.stringify(filtered, null, 2));
}

// Summary
if (!jsonMode && urls.length > 1) {
  const passed = results.filter(r => r.views >= minViews && !r.error);
  console.log(`--- Summary: ${passed.length}/${urls.length} passed (>= ${minViews} views) ---`);
}

await browser.close();
