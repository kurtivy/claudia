// Extract tweet URLs from current page
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const pages = browser.contexts()[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  const urls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/status/"]'))
      .map(a => a.href)
      .filter(h => !h.includes('/analytics') && !h.includes('/photo') && !h.includes('/likes') && !h.includes('/retweets'))
      .filter((v, i, a) => a.indexOf(v) === i);
  });

  for (const u of urls) console.log(u);
  try { await browser.close(); } catch {}
}

main().catch(e => { console.error(e.message); process.exit(1); });
