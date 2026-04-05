#!/usr/bin/env node
// engagement-check.mjs — Quick tweet engagement lookup via CDP
// Takes any tweet URL(s), returns views/likes/replies/reposts as JSON.
// Lightweight alternative to reply-metrics.mjs — works on ANY tweet, not just ours.
//
// Usage: node engagement-check.mjs <url> [url...]
// Usage: node engagement-check.mjs --json <url>        (machine-readable single output)
// Output: JSON array of { url, views, likes, replies, reposts, text }

import { chromium } from '../browser/node_modules/playwright/index.mjs';

const CDP_URL = 'http://localhost:9222';

function parseMetrics(ariaLabel) {
  const result = { views: 0, likes: 0, replies: 0, reposts: 0, bookmarks: 0 };
  const patterns = [
    [/(\d[\d,]*)\s+views?/i, 'views'],
    [/(\d[\d,]*)\s+likes?/i, 'likes'],
    [/(\d[\d,]*)\s+repl(?:y|ies)/i, 'replies'],
    [/(\d[\d,]*)\s+reposts?/i, 'reposts'],
    [/(\d[\d,]*)\s+bookmarks?/i, 'bookmarks'],
  ];
  for (const [regex, key] of patterns) {
    const m = ariaLabel.match(regex);
    if (m) result[key] = parseInt(m[1].replace(/,/g, ''));
  }
  return result;
}

async function checkTweet(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('[role="group"]', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;

      // The focused/primary tweet is the one inside the "focusedTweet" container
      // or the first article with a visible analytics link
      const articles = main.querySelectorAll('article');
      if (articles.length === 0) return null;

      // Strategy: find the article whose group has the most detail (focused tweet)
      // Focused tweets have view counts visible; reply tweets above don't always show views
      let bestArticle = null;
      let bestScore = -1;

      for (const article of articles) {
        const group = article.querySelector('[role="group"]');
        if (!group) continue;
        const label = group.getAttribute('aria-label') || '';
        // Score by how many metrics are present
        const score = (label.match(/\d/g) || []).length;
        if (score > bestScore) {
          bestScore = score;
          bestArticle = article;
        }
      }

      if (!bestArticle) return null;

      const group = bestArticle.querySelector('[role="group"]');
      const textEl = bestArticle.querySelector('[data-testid="tweetText"]');
      const userEl = bestArticle.querySelector('[data-testid="User-Name"]');

      return {
        ariaLabel: group ? group.getAttribute('aria-label') : '',
        text: textEl ? textEl.innerText.substring(0, 280) : '',
        user: userEl ? userEl.innerText.split('\n')[0] : '',
      };
    });

    if (!data) return { url, error: 'no tweet data found' };

    const metrics = parseMetrics(data.ariaLabel);
    return { url, user: data.user, text: data.text, ...metrics };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args[0] === '--json';
  const urls = args.filter(a => a.startsWith('http'));

  if (urls.length === 0) {
    console.error('Usage: node engagement-check.mjs [--json] <url> [url...]');
    process.exit(2);
  }

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
    console.error(`  checking: ${url}`);
    const result = await checkTweet(page, url);
    results.push(result);
    if (urls.length > 1) await page.waitForTimeout(800);
  }

  if (jsonMode || urls.length === 1) {
    console.log(JSON.stringify(urls.length === 1 ? results[0] : results, null, 2));
  } else {
    console.log('\n--- Engagement Check ---');
    for (const r of results) {
      if (r.error) {
        console.log(`  ERROR: ${r.url} -- ${r.error}`);
        continue;
      }
      const preview = r.text ? r.text.substring(0, 60).replace(/\n/g, ' ') : '(no text)';
      console.log(`  ${r.views.toLocaleString()} views | ${r.likes} likes | ${r.replies} replies | ${r.reposts} reposts`);
      console.log(`    ${r.user}: ${preview}`);
      console.log();
    }
  }

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
