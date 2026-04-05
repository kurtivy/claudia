// post-reply.mjs — Navigate to tweet, type reply, and post
// Usage: node post-reply.mjs "reply text"                    (posts on current page)
//        node post-reply.mjs --url <tweet-url> "reply text"  (navigates first, then posts)
// Assumes: Chrome on 9222 with Twitter auth

import { chromium } from 'playwright';

const args = process.argv.slice(2);
let url = null;
let text = null;

if (args[0] === '--url') {
  url = args[1];
  text = args[2];
} else {
  text = args[0];
}

if (!text) { console.error('Usage: node post-reply.mjs [--url <tweet-url>] "reply text"'); process.exit(1); }

// Twitter char count (code points, URLs = 23)
const charCount = [...text.replace(/https?:\/\/\S+/g, () => 'x'.repeat(23))].length;
if (charCount > 280) { console.error(`Over limit: ${charCount}/280 (${charCount - 280} over)`); process.exit(1); }

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const pages = browser.contexts()[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) { console.error('No X page found'); process.exit(1); }

  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);
    console.error(`Navigated to: ${page.url()}`);
  } else {
    console.error(`Connected to: ${page.url()}`);
  }
  console.error(`Posting: ${charCount}/280 chars`);

  // Click the reply textbox
  const textbox = page.locator('[data-testid="tweetTextarea_0"]');
  await textbox.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  // Type using keyboard (triggers React state updates)
  await page.keyboard.type(text, { delay: 15 });
  await page.waitForTimeout(1000);

  // Click reply button
  const replyBtn = page.locator('[data-testid="tweetButtonInline"]');
  if (await replyBtn.count() === 0) {
    console.error('No inline reply button found');
    process.exit(1);
  }
  await replyBtn.click({ timeout: 5000 });
  await page.waitForTimeout(2000);

  console.log(`Reply posted (${charCount} chars)`);
  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
