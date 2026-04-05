#!/usr/bin/env node
// cdp-qrt.mjs — Post a Quote Retweet using Kurt's Chrome via CDP
// Usage: node cdp-qrt.mjs <tweet-url> "line 1\n\nline 2\n\nline 3"
// Usage: node cdp-qrt.mjs <tweet-url> --file qrt.txt
//
// Uses \n\n for paragraph breaks (double Enter).
// Uses \n for single line breaks (single Enter).
// Also likes the original tweet.

import { chromium } from '../browser/node_modules/playwright/index.mjs';

const CDP_URL = 'http://localhost:9222';
const CHAR_LIMIT = 280;

const args = process.argv.slice(2);
const tweetUrl = args[0];
let text = args.slice(1).join(' ');

if (args[1] === '--file') {
  const { readFileSync } = await import('fs');
  text = readFileSync(args[2], 'utf8').trim();
}

if (!tweetUrl || !text) {
  console.error('Usage: node cdp-qrt.mjs <tweet-url> "text with \\n\\n for breaks"');
  process.exit(2);
}

// Sanitize Unicode that breaks Twitter React state
text = text
  .replace(/\u2014/g, '-').replace(/\u2013/g, '-')
  .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
  .replace(/\u201C/g, '"').replace(/\u201D/g, '"');

// Split into lines (preserve \n\n as paragraph breaks)
const paragraphs = text.split('\\n\\n');

// Count chars (excluding newlines for Twitter's count)
const plainText = paragraphs.join('').replace(/\\n/g, '');
const charCount = [...plainText].length;
if (charCount > CHAR_LIMIT) {
  console.error(`QRT is ${charCount} chars (limit: ${CHAR_LIMIT}). Over by ${charCount - CHAR_LIMIT}.`);
  process.exit(1);
}
console.error(`QRT: ~${charCount}/${CHAR_LIMIT} chars, ${paragraphs.length} paragraphs`);
console.error(`Target: ${tweetUrl}`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('x.com'));
  if (!page) { console.error('No x.com page'); process.exit(1); }

  // Navigate to tweet
  console.error('navigating...');
  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Like the tweet
  try {
    const likeBtn = page.locator('[data-testid="like"]').first();
    if (await likeBtn.count() > 0) {
      await likeBtn.click({ timeout: 3000 });
      console.error('liked');
      await page.waitForTimeout(500);
    }
  } catch { /* already liked */ }

  // Click retweet button
  await page.locator('[data-testid="retweet"]').first().click({ timeout: 5000 });
  await page.waitForTimeout(1500);

  // Click "Quote" in menu
  const menuItems = await page.locator('[role="menuitem"]').all();
  let quoted = false;
  for (const item of menuItems) {
    const itemText = await item.textContent();
    if (itemText.includes('Quote')) {
      await item.click();
      quoted = true;
      break;
    }
  }
  if (!quoted) {
    console.error('Could not find Quote option in menu');
    process.exit(1);
  }
  await page.waitForTimeout(2000);

  // Focus the editor
  const editor = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
  await editor.click();
  await page.waitForTimeout(500);

  // Type with line breaks
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    // Handle single line breaks within paragraphs
    const lines = para.split('\\n');
    for (let j = 0; j < lines.length; j++) {
      await page.keyboard.type(lines[j], { delay: 8 });
      if (j < lines.length - 1) {
        await page.keyboard.press('Enter');
      }
    }
    // Paragraph break (double Enter)
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }
  }
  await page.waitForTimeout(1000);

  // Post
  console.error('posting...');
  await page.locator('[data-testid="tweetButton"]').click({ timeout: 5000 });
  await page.waitForTimeout(3000);

  console.log(`QRT posted on ${tweetUrl}`);
  console.log(`Text: ${plainText.substring(0, 100)}...`);

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
