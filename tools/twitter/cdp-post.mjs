#!/usr/bin/env node
// cdp-post.mjs — Post a standalone tweet using Kurt's Chrome via CDP
// Usage: node cdp-post.mjs "tweet text"
// Returns the posted tweet URL on stdout if found.

import { chromium } from '../browser/node_modules/playwright/index.mjs';

const CDP_URL = 'http://localhost:9222';
const CHAR_LIMIT = 280;

let text = process.argv.slice(2).join(' ');
if (!text) { console.error('Usage: node cdp-post.mjs "tweet text"'); process.exit(2); }

// Sanitize Unicode that breaks Twitter React state via CDP typing
text = text
  .replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ')   // newlines break CDP typing
  .replace(/\u2014/g, '-').replace(/\u2013/g, '-')
  .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
  .replace(/\u201C/g, '"').replace(/\u201D/g, '"');

const charCount = [...text].length;
if (charCount > CHAR_LIMIT) {
  console.error(`Tweet is ${charCount} chars (limit: ${CHAR_LIMIT}). Over by ${charCount - CHAR_LIMIT}.`);
  process.exit(1);
}
console.error(`Tweet: ${charCount}/${CHAR_LIMIT} chars`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  if (!page) { console.error('No pages'); process.exit(1); }

  // Navigate to compose
  console.error('Navigating to compose...');
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Find the textbox
  const textbox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 }).catch(() => null);
  if (!textbox) { console.error('Could not find compose textbox.'); process.exit(1); }

  await textbox.click();
  await page.waitForTimeout(500);

  console.error('Typing tweet...');
  await page.keyboard.type(text, { delay: 10 });
  await page.waitForTimeout(1000);

  // Find Post button (in compose modal it's data-testid="tweetButton")
  const postButton = await page.waitForSelector('[data-testid="tweetButton"]', { timeout: 5000 }).catch(() => null);
  if (!postButton) { console.error('Could not find Post button.'); process.exit(1); }

  const isDisabled = await postButton.isDisabled();
  if (isDisabled) { console.error('Post button is disabled.'); process.exit(1); }

  console.error('Posting...');
  await postButton.click();
  await page.waitForTimeout(4000);

  // Try to find the posted tweet URL by going to our profile
  console.error('Finding posted tweet URL...');
  await page.goto('https://x.com/claudiaonchain', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  const tweetUrl = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="/claudiaonchain/status/"]');
    if (links.length) return links[0].href;
    return '';
  });

  if (tweetUrl) {
    console.log(tweetUrl);
    console.error(`Posted! URL: ${tweetUrl}`);
  } else {
    console.error('Tweet posted but could not find URL. Check profile manually.');
  }

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
