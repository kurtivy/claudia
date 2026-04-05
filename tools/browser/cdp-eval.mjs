// CDP evaluation tool — connects to Kurt's Chrome via debug port 9222
// IMPORTANT: This connects to Kurt's RUNNING Chrome, not a new browser.
// Chrome must be started with --remote-debugging-port=9222
//
// Usage: node cdp-eval.mjs --navigate "url"
// Usage: node cdp-eval.mjs --click "selector" [timeout_ms]
// Usage: node cdp-eval.mjs --type "selector" "text"
// Usage: node cdp-eval.mjs --fill "selector" "text"  (clears first, then types)
// Usage: node cdp-eval.mjs --snapshot [maxChars] [selector]
// Usage: node cdp-eval.mjs --text [maxChars]
// Usage: node cdp-eval.mjs "javascript expression"

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const cdpUrl = 'http://localhost:9222';

async function main() {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    console.error('No browser contexts found');
    process.exit(1);
  }

  // Find the X/Twitter tab or use the first page
  const pages = contexts[0].pages();
  let page = pages.find(p => p.url().includes('x.com') && !p.url().includes('sw.js'));
  if (!page) page = pages[0];

  if (!page) {
    console.error('No pages found');
    process.exit(1);
  }

  console.error(`Connected to: ${page.url()}`);

  if (args[0] === '--navigate') {
    await page.goto(args[1], { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
    console.error(`Navigated to: ${page.url()}`);
    console.log(await page.title());
  } else if (args[0] === '--snapshot') {
    const maxLen = parseInt(args[1] || '10000');
    // Use accessibility tree via CDP protocol directly
    const snapshot = await page.evaluate(() => {
      const walk = (el, depth = 0) => {
        if (!el || depth > 6) return '';
        const tag = el.tagName?.toLowerCase() || '';
        const role = el.getAttribute?.('role') || '';
        const label = el.getAttribute?.('aria-label') || '';
        const testId = el.getAttribute?.('data-testid') || '';
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent?.trim().slice(0, 80) : '';
        let line = '';
        if (role || label || testId || (text && tag !== 'script' && tag !== 'style')) {
          const indent = '  '.repeat(depth);
          const parts = [tag];
          if (role) parts.push(`role=${role}`);
          if (testId) parts.push(`testid=${testId}`);
          if (label) parts.push(`"${label.slice(0, 60)}"`);
          if (text) parts.push(`:: ${text}`);
          line = indent + parts.join(' ') + '\n';
        }
        for (const child of el.children || []) {
          line += walk(child, depth + 1);
        }
        return line;
      };
      return walk(document.body);
    });
    console.log(snapshot.substring(0, maxLen));
  } else if (args[0] === '--text') {
    const text = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      return main.innerText;
    });
    console.log(text.substring(0, parseInt(args[1] || '5000')));
  } else if (args[0] === '--click') {
    const selector = args[1];
    const timeout = parseInt(args[2] || '5000');
    await page.click(selector, { timeout });
    console.log(`Clicked: ${selector}`);
  } else if (args[0] === '--type') {
    const selector = args[1];
    const text = args.slice(2).join(' ');
    await page.type(selector, text, { delay: 30 });
    console.log(`Typed ${text.length} chars into: ${selector}`);
  } else if (args[0] === '--fill') {
    const selector = args[1];
    const text = args.slice(2).join(' ');
    await page.fill(selector, text);
    console.log(`Filled: ${selector}`);
  } else if (args[0] === '--screenshot') {
    const path = args[1] || '/tmp/screenshot.png';
    await page.screenshot({ path, fullPage: false });
    console.log(`Screenshot saved to ${path}`);
  } else {
    // Evaluate expression
    const expr = args.join(' ');
    const result = await page.evaluate(expr);
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  }

  // connectOverCDP returns a Browser, disconnect via close(false) or just exit
  try { await browser.close(); } catch { /* borrowing, don't actually close */ }
}

main().catch(e => { console.error(e.message); process.exit(1); });
