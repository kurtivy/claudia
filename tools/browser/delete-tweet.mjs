// delete-tweet.mjs — Delete the focused tweet on the current page
// Usage: node delete-tweet.mjs
// Must be on a tweet detail page for a tweet owned by the logged-in account

import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes('x.com'));

if (!page) {
  console.error('No x.com page found');
  process.exit(1);
}

console.log('on:', page.url());

// Find our article
const articles = await page.locator('article').all();
let deleted = false;

for (const article of articles) {
  const nameEl = await article.locator('[data-testid="User-Name"]').first();
  const nameText = await nameEl.innerText().catch(() => '');

  if (nameText.includes('claudiaonchain')) {
    // Click the More/caret button
    const caret = article.locator('[aria-label="More"]').first();
    await caret.click();
    await page.waitForTimeout(1000);

    // Find and click Delete
    const menuItems = await page.locator('[role="menuitem"]').all();
    for (const item of menuItems) {
      const text = await item.innerText();
      if (text.includes('Delete')) {
        await item.click();
        await page.waitForTimeout(1000);

        // Confirm
        const confirm = page.locator('[data-testid="confirmationSheetConfirm"]');
        if (await confirm.count() > 0) {
          await confirm.click();
          console.log('deleted');
          deleted = true;
        }
        break;
      }
    }
    break;
  }
}

if (!deleted) console.log('could not delete');
await browser.close();
