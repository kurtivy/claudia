import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  const pages = contexts[0].pages();
  
  let page = pages.find(p => p.url().includes('pump.fun'));
  if (!page) page = pages[0];
  
  console.log('Connected to:', page.url());
  
  if (!page.url().includes('/create')) {
    await page.goto('https://pump.fun/create', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  }
  
  // Fill coin name
  console.log('Filling name...');
  const nameInput = page.locator('input').first();
  await nameInput.click();
  await nameInput.fill('Claude Source Leak');
  await page.waitForTimeout(500);
  
  // Fill ticker
  console.log('Filling ticker...');
  const tickerInput = page.locator('input').nth(1);
  await tickerInput.click();
  await tickerInput.fill('LEAKED');
  await page.waitForTimeout(500);
  
  // Fill description
  console.log('Filling description...');
  const desc = page.locator('textarea').first();
  await desc.click();
  await desc.fill('Anthropic accidentally published Claude Code source - 512K lines of TypeScript. The most transparent look inside any frontier AI system.');
  await page.waitForTimeout(500);
  
  // Upload image
  console.log('Uploading image...');
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles('C:/Users/kurtw/AppData/Local/Temp/anthropic-logo.png');
  await page.waitForTimeout(2000);
  
  // Screenshot to verify
  await page.screenshot({ path: 'C:/Users/kurtw/AppData/Local/Temp/pf-filled.png' });
  console.log('Form filled. Screenshot saved.');
  
  try { await browser.close(); } catch {}
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
