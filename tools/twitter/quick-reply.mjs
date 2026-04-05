#!/usr/bin/env node
// quick-reply.mjs — Navigate, like, reply via modal dialog — all in one Playwright session
// Usage: node quick-reply.mjs <tweet-url> "reply text"

import { chromium } from '../browser/node_modules/playwright/index.mjs';

const CDP_URL = 'http://localhost:9222';
const tweetUrl = process.argv[2];
let replyText = process.argv.slice(3).join(' ');

if (!tweetUrl || !replyText) {
  console.error('Usage: node quick-reply.mjs <tweet-url> "reply text"');
  process.exit(2);
}

// Sanitize
replyText = replyText
  .replace(/\r\n/g, ' ').replace(/[\r\n]/g, ' ')
  .replace(/\u2014/g, '-').replace(/\u2013/g, '-')
  .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
  .replace(/\u201C/g, '"').replace(/\u201D/g, '"');

const charCount = [...replyText].length;
if (charCount > 280) {
  console.error(`Over limit: ${charCount}/280`);
  process.exit(1);
}

console.error(`Reply: ${charCount}/280 | ${tweetUrl}`);

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  if (!contexts.length) { console.error('No contexts'); process.exit(1); }

  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  // Dismiss any dialogs automatically
  page.on('dialog', async d => { try { await d.dismiss(); } catch {} });

  // Navigate using evaluate to avoid ERR_ABORTED
  await page.evaluate((url) => { window.location.href = url; }, tweetUrl);
  await page.waitForTimeout(5000);

  // Verify we're on the right page
  const currentUrl = await page.evaluate(() => window.location.href);
  if (!currentUrl.includes(tweetUrl.split('/status/')[1])) {
    console.error(`Page was hijacked: ${currentUrl}`);
    // Try one more time
    await page.evaluate((url) => { window.location.href = url; }, tweetUrl);
    await page.waitForTimeout(5000);
  }

  // Remove overlays
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="twc-cc-mask"]').forEach(e => e.remove());
  });

  // Like
  const likeBtn = await page.$('[data-testid="like"]');
  if (likeBtn) {
    try { await likeBtn.click({ timeout: 3000 }); console.error('Liked'); } catch { console.error('Like click failed'); }
    await page.waitForTimeout(500);
  } else {
    console.error('Already liked or like button not found');
  }

  // Click the reply icon on the FIRST article (the main tweet) to open modal
  console.error('Opening reply modal...');
  const replyIcon = await page.$('article [data-testid="reply"]');
  if (!replyIcon) {
    console.error('No reply icon found');
    process.exit(1);
  }

  // Click reply icon via JS to bypass overlays
  await page.evaluate(() => {
    const btn = document.querySelector('article [data-testid="reply"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);

  // The modal should now be open with a new reply textbox
  // In modal context, the textbox is in #layers
  const modalBox = await page.$('#layers [data-testid="tweetTextarea_0"]');
  if (!modalBox) {
    console.error('Modal reply box not found, trying inline...');
    // Fall back to inline
    const inlineBox = await page.$('[data-testid="tweetTextarea_0"]');
    if (!inlineBox) {
      console.error('No reply box at all');
      process.exit(1);
    }
    await inlineBox.click();
  } else {
    await modalBox.click();
  }

  await page.waitForTimeout(300);

  // Clear any existing text
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);

  // Type using keyboard.type
  console.error('Typing reply...');
  await page.keyboard.type(replyText, { delay: 8 });
  await page.waitForTimeout(1000);

  // Look for the modal's tweet button (tweetButton, not tweetButtonInline)
  // In modal it's data-testid="tweetButton"
  let submitSelector = '#layers [data-testid="tweetButton"]';
  let submitBtn = await page.$(submitSelector);

  if (!submitBtn) {
    // Try inline button
    submitSelector = '[data-testid="tweetButtonInline"]';
    submitBtn = await page.$(submitSelector);
  }

  if (!submitBtn) {
    console.error('No submit button found');
    process.exit(1);
  }

  const disabled = await submitBtn.isDisabled();
  console.error(`Submit button: ${disabled ? 'disabled' : 'enabled'}`);

  // Click via JS to bypass overlays
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (btn) btn.click();
  }, submitSelector);

  console.error('Submitted');
  await page.waitForTimeout(4000);

  // Verify - check if modal is gone or textbox is empty
  const modalGone = await page.$('#layers [data-testid="tweetTextarea_0"]') === null;
  const inlineEmpty = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="tweetTextarea_0"]');
    return box ? box.textContent.length < 5 : true;
  });

  if (modalGone || inlineEmpty) {
    console.log(`POSTED: ${replyText}`);
  } else {
    const remaining = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                  document.querySelector('#layers [data-testid="tweetTextarea_0"]');
      return box?.textContent?.substring(0, 80) || 'unknown';
    });
    console.error(`May not have posted. Box: ${remaining}`);
  }

  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
