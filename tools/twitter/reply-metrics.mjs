#!/usr/bin/env node
// reply-metrics.mjs — Check engagement on replies posted to other accounts' threads
// Usage: node reply-metrics.mjs <status-url-or-id> [status-url-or-id ...]
// Usage: node reply-metrics.mjs --from-log <jsonl-file>  (reads URLs from reply log)
// Usage: node reply-metrics.mjs --recent [hours]         (checks replies from last N hours, default 24)
//
// Connects to Kurt's Chrome via CDP port 9222, visits each reply URL,
// extracts views/likes/replies/reposts, and outputs a summary.
// Requires: npm install playwright (in ~/.claudia/tools/browser/)

import { chromium } from '../browser/node_modules/playwright/index.mjs';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPLY_LOG = join(__dirname, 'reply-engagement.jsonl');
const CDP_URL = 'http://localhost:9222';

async function getReplyMetrics(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for tweet content to render
    await page.waitForSelector('[role="group"]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const metrics = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;

      // On a reply page, there are multiple articles:
      // - Parent tweet(s) with their own metrics
      // - The focused tweet (our reply) which is the last article with @claudiaonchain
      // Strategy: find the article containing @claudiaonchain text, get its group metrics
      const articles = main.querySelectorAll('article');
      let focusedGroup = null;
      let focusedText = '';

      // Find the article with an analytics link pointing to claudiaonchain
      for (const article of articles) {
        const analyticsLink = article.querySelector('a[href*="claudiaonchain"][href*="/analytics"]');
        if (analyticsLink) {
          focusedGroup = article.querySelector('[role="group"]');
          const textEl = article.querySelector('[data-testid="tweetText"]');
          focusedText = textEl ? textEl.innerText : '';
          break;
        }
      }

      // Fallback: find last article by @claudiaonchain
      if (!focusedGroup) {
        for (const article of articles) {
          const userLink = article.querySelector('a[href="/claudiaonchain"]');
          if (userLink) {
            focusedGroup = article.querySelector('[role="group"]');
            const textEl = article.querySelector('[data-testid="tweetText"]');
            focusedText = textEl ? textEl.innerText : '';
            // Don't break — keep the last match (which is our reply, not a parent retweet)
          }
        }
      }

      if (!focusedGroup) return null;

      const ariaLabel = focusedGroup.getAttribute('aria-label') || '';
      const result = { views: 0, likes: 0, replies: 0, reposts: 0, bookmarks: 0 };

      const viewsMatch = ariaLabel.match(/(\d[\d,]*)\s+views?/i);
      const likesMatch = ariaLabel.match(/(\d[\d,]*)\s+likes?/i);
      const repliesMatch = ariaLabel.match(/(\d[\d,]*)\s+repl(?:y|ies)/i);
      const repostsMatch = ariaLabel.match(/(\d[\d,]*)\s+reposts?/i);
      const bookmarksMatch = ariaLabel.match(/(\d[\d,]*)\s+bookmarks?/i);

      if (viewsMatch) result.views = parseInt(viewsMatch[1].replace(/,/g, ''));
      if (likesMatch) result.likes = parseInt(likesMatch[1].replace(/,/g, ''));
      if (repliesMatch) result.replies = parseInt(repliesMatch[1].replace(/,/g, ''));
      if (repostsMatch) result.reposts = parseInt(repostsMatch[1].replace(/,/g, ''));
      if (bookmarksMatch) result.bookmarks = parseInt(bookmarksMatch[1].replace(/,/g, ''));

      return { tweetText: focusedText.substring(0, 200), ...result };
    });

    return metrics;
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let urls = [];

  if (args[0] === '--from-log' && args[1]) {
    const logContent = readFileSync(args[1], 'utf8').trim().split('\n');
    for (const line of logContent) {
      try {
        const entry = JSON.parse(line);
        if (entry.url) urls.push(entry.url);
      } catch {}
    }
  } else if (args[0] === '--recent') {
    const hours = parseInt(args[1] || '24');
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    if (existsSync(REPLY_LOG)) {
      const lines = readFileSync(REPLY_LOG, 'utf8').trim().split('\n');
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (new Date(entry.timestamp).getTime() > cutoff && entry.url) {
            urls.push(entry.url);
          }
        } catch {}
      }
    }
    if (urls.length === 0) {
      console.log('No recent replies found in log.');
      process.exit(0);
    }
  } else {
    // Direct URLs or status IDs
    for (const arg of args) {
      if (arg.startsWith('http')) {
        urls.push(arg);
      } else if (/^\d+$/.test(arg)) {
        urls.push(`https://x.com/claudiaonchain/status/${arg}`);
      }
    }
  }

  if (urls.length === 0) {
    console.error('Usage: node reply-metrics.mjs <url> [url...] | --from-log <file> | --recent [hours]');
    process.exit(2);
  }

  console.error(`Checking ${urls.length} replies...`);

  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('No browser contexts');
    process.exit(1);
  }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  const results = [];

  for (const url of urls) {
    console.error(`  ${url}`);
    const metrics = await getReplyMetrics(page, url);
    const entry = {
      timestamp: new Date().toISOString(),
      url,
      ...metrics,
    };
    results.push(entry);

    // Log to JSONL
    appendFileSync(REPLY_LOG, JSON.stringify(entry) + '\n');

    // Brief pause between navigations
    await page.waitForTimeout(1000);
  }

  // Summary output
  console.log('\n--- Reply Engagement Summary ---');
  let totalViews = 0, totalLikes = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`  ERROR: ${r.url} — ${r.error}`);
      continue;
    }
    totalViews += r.views;
    totalLikes += r.likes;
    const preview = r.tweetText ? r.tweetText.substring(0, 60) : '(no text)';
    console.log(`  ${r.views} views, ${r.likes} likes, ${r.replies} replies — ${preview}`);
  }
  console.log(`\nTotal: ${totalViews} views, ${totalLikes} likes across ${results.length} replies`);
  console.log(`Avg: ${(totalViews / results.length).toFixed(1)} views/reply`);

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
