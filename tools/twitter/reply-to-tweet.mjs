// reply-to-tweet.mjs — One-command Twitter reply
// Usage: node reply-to-tweet.mjs <tweet-url> "<reply text>" [--like]
// Navigates to tweet, opens reply dialog, types text, posts, optionally likes

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const tweetUrl = args.find(a => a.startsWith('https://'));
const likeFlag = args.includes('--like');
const text = args.find(a => !a.startsWith('https://') && !a.startsWith('--'));

if (!tweetUrl || !text) {
  console.error('Usage: node reply-to-tweet.mjs <tweet-url> "<reply text>" [--like]');
  process.exit(1);
}

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('x.com'));

if (!page) {
  console.error('No x.com page found');
  process.exit(1);
}

try {
  // Navigate to tweet
  await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  console.log('navigated to:', page.url());

  // Dismiss any overlays (cookie consent, twc-cc-mask, etc.)
  try {
    const mask = page.locator('[data-testid="twc-cc-mask"]');
    if (await mask.count() > 0) {
      // Try clicking accept/dismiss buttons first
      const acceptBtn = page.locator('[data-testid="twc-cc-mask"] ~ div button, [data-testid="twc-cc-mask"] + div button').first();
      if (await acceptBtn.count() > 0) {
        await acceptBtn.click({ timeout: 3000 });
      } else {
        // Force remove the overlay via JS
        await page.evaluate(() => {
          document.querySelectorAll('[data-testid="twc-cc-mask"]').forEach(e => e.remove());
        });
      }
      await page.waitForTimeout(500);
      console.log('dismissed overlay');
    }
  } catch { /* no overlay */ }

  // Like if requested
  if (likeFlag) {
    try {
      const likeBtn = page.locator('[data-testid="like"]').first();
      if (await likeBtn.count() > 0) {
        await likeBtn.click({ timeout: 3000 });
        console.log('liked');
        await page.waitForTimeout(500);
      }
    } catch { /* already liked or not found */ }
  }

  // Click reply button on the first tweet (force bypasses overlay interception)
  await page.locator('[data-testid="reply"]').first().click({ timeout: 5000, force: true });
  await page.waitForTimeout(2000);

  // Dismiss overlay again if it reappeared
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="twc-cc-mask"]').forEach(e => e.remove());
  });
  await page.waitForTimeout(300);

  // Type reply text — click into the modal's editor, then type
  // The modal editor is inside #layers, use that to disambiguate
  const modalEditor = page.locator('#layers [data-testid="tweetTextarea_0"]');
  const inlineEditor = page.locator('[data-testid="tweetTextarea_0"]').last();

  let editor;
  if (await modalEditor.count() > 0) {
    editor = modalEditor.first();
    console.log('using modal editor');
  } else {
    editor = inlineEditor;
    console.log('using inline editor');
  }

  // Force focus via JS to bypass overlay issues
  await editor.evaluate(el => el.focus());
  await page.waitForTimeout(300);

  // Type using keyboard
  await page.keyboard.type(text, { delay: 12 });
  await page.waitForTimeout(800);

  // Click post button — prefer the one in the modal/layers
  const modalPostBtn = page.locator('#layers [data-testid="tweetButton"]');
  const postBtn = (await modalPostBtn.count() > 0) ? modalPostBtn : page.locator('[data-testid="tweetButton"]');

  await postBtn.click({ timeout: 5000, force: true });
  await page.waitForTimeout(3000);

  console.log('reply posted');
  console.log('url:', page.url());
} catch (err) {
  console.error('error:', err.message);
}

await browser.close();
