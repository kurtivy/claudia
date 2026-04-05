#!/usr/bin/env node
// cdp-reply.mjs — Post a reply to a tweet using Kurt's Chrome via CDP
// Usage: node cdp-reply.mjs <tweet-url> "reply text"
// Usage: node cdp-reply.mjs <tweet-url> --file reply.txt
//
// Connects to Chrome via CDP port 9222, navigates to the tweet,
// types the reply, and submits it. Validates character count first.
//
// Requires: playwright installed in ../browser/node_modules/

import { chromium } from '../browser/node_modules/playwright/index.mjs';

const CDP_URL = 'http://localhost:9222';
const CHAR_LIMIT = 280;

const args = process.argv.slice(2);
const tweetUrl = args[0];
let replyText = args.slice(1).join(' ');

if (args[1] === '--file') {
  const { readFileSync } = await import('fs');
  replyText = readFileSync(args[2], 'utf8').trim();
}

if (!tweetUrl || !replyText) {
  console.error('Usage: node cdp-reply.mjs <tweet-url> "reply text"');
  console.error('       node cdp-reply.mjs <tweet-url> --file reply.txt');
  process.exit(2);
}

// Sanitize problematic Unicode chars that break Twitter's React state via CDP typing
// Em dash (—) prevents submit button from working when typed via CDP
replyText = replyText
  .replace(/\r\n/g, ' ')     // CRLF → space (newlines break CDP typing)
  .replace(/[\r\n]/g, ' ')   // remaining CR/LF → space
  .replace(/\u2014/g, '-')   // em dash → hyphen
  .replace(/\u2013/g, '-')   // en dash → hyphen
  .replace(/\u2018/g, "'")   // left single quote → apostrophe
  .replace(/\u2019/g, "'")   // right single quote → apostrophe
  .replace(/\u201C/g, '"')   // left double quote → straight quote
  .replace(/\u201D/g, '"');  // right double quote → straight quote

// Validate char count
const charCount = [...replyText].length;
if (charCount > CHAR_LIMIT) {
  console.error(`Reply is ${charCount} chars (limit: ${CHAR_LIMIT}). Over by ${charCount - CHAR_LIMIT}.`);
  console.error(`Text: ${replyText.substring(0, 100)}...`);
  process.exit(1);
}

console.error(`Reply: ${charCount}/${CHAR_LIMIT} chars`);
console.error(`Target: ${tweetUrl}`);
console.error(`Text: ${replyText.substring(0, 80)}${replyText.length > 80 ? '...' : ''}`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  if (!page) { console.error('No pages'); process.exit(1); }

  // Navigate to tweet
  console.error('Navigating to tweet...');
  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);

  // Find the reply textbox — it's typically a div with role="textbox" and data-testid="tweetTextarea_0"
  const replyBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 }).catch(() => null);

  if (!replyBox) {
    console.error('Could not find reply textbox. Page might not be loaded or replies may be restricted.');
    process.exit(1);
  }

  // Click to focus
  await replyBox.click();
  await page.waitForTimeout(500);

  // Type the reply using keyboard simulation (not fill, which doesn't trigger React state)
  console.error('Typing reply...');
  await page.keyboard.type(replyText, { delay: 10 });
  await page.waitForTimeout(1000);

  // Find and click the Reply/Post button
  // The submit button has data-testid="tweetButtonInline" for inline replies
  const replyButton = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 5000 }).catch(() => null);

  if (!replyButton) {
    console.error('Could not find reply button. Text may have been typed but not submitted.');
    process.exit(1);
  }

  // Check if the button is enabled (might be disabled if reply is empty or restricted)
  const isDisabled = await replyButton.isDisabled();
  if (isDisabled) {
    console.error('Reply button is disabled. Replies may be restricted on this tweet.');
    process.exit(1);
  }

  console.error('Submitting reply...');
  await replyButton.click();
  await page.waitForTimeout(3000);

  // Verify the reply was posted by checking if the textbox is now empty
  const textboxContent = await page.evaluate(() => {
    const tb = document.querySelector('[data-testid="tweetTextarea_0"]');
    return tb?.textContent || '';
  });

  if (textboxContent.length < 5) {
    // Try to capture our reply URL from the thread
    let replyUrl = '';
    try {
      await page.waitForTimeout(2000); // let the reply render
      replyUrl = await page.evaluate(() => {
        // Find all tweet articles, look for the one by @claudiaonchain
        const articles = document.querySelectorAll('article');
        for (const a of articles) {
          const handle = a.querySelector('a[href="/claudiaonchain"]');
          if (!handle) continue;
          // Find the timestamp link which contains the status URL
          const timeLink = a.querySelector('a[href*="/claudiaonchain/status/"]');
          if (timeLink) return timeLink.href;
        }
        // Fallback: check current URL if Twitter redirected to the reply
        if (window.location.href.includes('/status/') && window.location.href !== arguments[0]) {
          return window.location.href;
        }
        return '';
      });
    } catch {}

    console.log(`Reply posted successfully to ${tweetUrl}`);
    if (replyUrl) console.log(`Reply URL: ${replyUrl}`);
    console.log(`Text: ${replyText}`);

    // Output JSON for programmatic consumption
    const result = { parent: tweetUrl, text: replyText, chars: charCount, posted: true };
    if (replyUrl) result.replyUrl = replyUrl;
    console.log(JSON.stringify(result));
  } else {
    console.error('Reply may not have been posted — textbox still has content.');
    console.error(`Textbox: ${textboxContent.substring(0, 100)}`);
  }

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
