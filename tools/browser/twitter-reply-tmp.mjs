import { chromium } from 'playwright';

const cdpUrl = 'http://localhost:9222';

async function main() {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];
  
  console.error('Connected to:', page.url());
  
  // Try clicking with force option
  console.log('Attempt 1: force click');
  await page.click('[data-testid="tweetButtonInline"]', { force: true, timeout: 5000 });
  await page.waitForTimeout(3000);
  
  let text = await page.evaluate(() => document.querySelector('[data-testid="tweetTextarea_0"]')?.textContent?.trim() || '');
  if (!text) { console.log('REPLY POSTED SUCCESSFULLY'); try { await browser.close(); } catch {} return; }
  
  // Try Tab to focus on button then Enter
  console.log('Attempt 2: Tab then Enter');
  await page.click('[data-testid="tweetTextarea_0"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  
  text = await page.evaluate(() => document.querySelector('[data-testid="tweetTextarea_0"]')?.textContent?.trim() || '');
  if (!text) { console.log('REPLY POSTED SUCCESSFULLY'); try { await browser.close(); } catch {} return; }
  
  // Try using the compose modal approach instead
  console.log('Attempt 3: Use reply icon to open modal');
  // Click the reply icon on the main tweet to open compose modal
  const replyIcons = await page.evaluate(() => {
    const replies = document.querySelectorAll('[data-testid="reply"]');
    return Array.from(replies).map((r, i) => {
      const rect = r.getBoundingClientRect();
      return {i, x: rect.x, y: rect.y, visible: rect.width > 0};
    });
  });
  console.log('Reply icons:', JSON.stringify(replyIcons));
  
  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
