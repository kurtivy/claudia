#!/usr/bin/env node
// cdp-reply-raw.mjs — Post a reply using raw CDP (no Playwright dependency)
// Usage: node cdp-reply-raw.mjs <tweet-url> "reply text"
//
// Uses Chrome DevTools Protocol directly via WebSocket.
// Fallback for when Playwright connectOverCDP hangs.

import http from 'http';

const CHAR_LIMIT = 280;
const args = process.argv.slice(2);
const tweetUrl = args[0];
let replyText = args.slice(1).join(' ');

if (!tweetUrl || !replyText) {
  console.error('Usage: node cdp-reply-raw.mjs <tweet-url> "reply text"');
  process.exit(2);
}

// Sanitize problematic Unicode chars that break Twitter's React state via CDP typing
replyText = replyText
  .replace(/\u2014/g, '-')   // em dash → hyphen
  .replace(/\u2013/g, '-')   // en dash → hyphen
  .replace(/\u2018/g, "'")   // left single quote → apostrophe
  .replace(/\u2019/g, "'")   // right single quote → apostrophe
  .replace(/\u201C/g, '"')   // left double quote → straight quote
  .replace(/\u201D/g, '"');  // right double quote → straight quote

const charCount = [...replyText].length;
if (charCount > CHAR_LIMIT) {
  console.error(`Reply is ${charCount} chars (limit: ${CHAR_LIMIT}). Over by ${charCount - CHAR_LIMIT}.`);
  process.exit(1);
}

console.error(`Reply: ${charCount}/${CHAR_LIMIT} chars`);
console.error(`Target: ${tweetUrl}`);
console.error(`Text: ${replyText.substring(0, 80)}${replyText.length > 80 ? '...' : ''}`);

function cdpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9222${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const msgId = id++;
          pending.set(msgId, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ id: msgId, method, params }));
        });
      },
      close() { ws.close(); }
    });

    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    };

    ws.onerror = (e) => reject(e);
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 60000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cdpPut(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:9222${path}`, { method: 'PUT' }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const tabs = await cdpGet('/json');
  let xTab = tabs.find(t => t.url.includes('x.com') && t.type === 'page');

  // Pre-flight: navigate existing tab or open fresh one
  // IMPORTANT: Don't close the only tab — Chrome may exit entirely
  const allPages = tabs.filter(t => t.type === 'page');
  if (xTab && allPages.length > 1) {
    console.error(`Recycling stale tab: ${xTab.url}`);
    await cdpPut(`/json/close/${xTab.id}`);
    await sleep(1000);
  } else if (xTab) {
    // Only 1 tab — navigate it instead of close+reopen
    console.error(`Navigating existing tab to target (only ${allPages.length} tab, skipping recycle)`);
    try {
      const cdpNav = await cdpSession(xTab.webSocketDebuggerUrl);
      await cdpNav.send('Page.navigate', { url: tweetUrl });
      cdpNav.close();
    } catch (e) {
      console.error(`Navigation failed: ${e.message}, opening new tab`);
    }
    await sleep(3000);
  }
  const newTab = xTab && allPages.length <= 1
    ? { ...xTab, webSocketDebuggerUrl: xTab.webSocketDebuggerUrl }
    : await cdpPut(`/json/new?${tweetUrl}`);
  if (!newTab || !newTab.webSocketDebuggerUrl) {
    console.error('Failed to open new tab');
    process.exit(1);
  }
  console.error(`Fresh tab: ${newTab.id}`);
  await sleep(3000); // Initial page load

  const cdp = await cdpSession(newTab.webSocketDebuggerUrl);

  // Verify page loaded
  const { result: urlCheck } = await cdp.send('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true
  });
  console.error(`Page: ${urlCheck.value}`);

  // Poll for reply textbox (Twitter SPA needs variable load time)
  console.error('Finding reply box...');
  let found = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { result: clickResult } = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var box = document.querySelector('[data-testid="tweetTextarea_0"]');
          if (!box) return 'NOT_FOUND';
          box.focus();
          box.click();
          return 'FOUND';
        })()
      `,
      returnByValue: true
    });
    if (clickResult.value === 'FOUND') { found = true; break; }
    console.error(`  attempt ${attempt + 1}/8: not ready, waiting...`);
    await sleep(1500);
  }

  if (!found) {
    console.error('Reply textbox not found after 8 attempts. Page may not be loaded or replies restricted.');
    cdp.close();
    process.exit(1);
  }

  await sleep(500);

  // Type using Input.insertText (works with React state)
  console.error('Typing reply...');
  await cdp.send('Input.insertText', { text: replyText });
  await sleep(1000);

  // Verify text was entered
  const { result: textCheck } = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        var box = document.querySelector('[data-testid="tweetTextarea_0"]');
        return box ? box.textContent.length : 0;
      })()
    `,
    returnByValue: true
  });

  if (textCheck.value < 5) {
    console.error('Text entry failed. Trying dispatchKeyEvent fallback...');
    // Fallback: type char by char
    for (const ch of replyText) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch });
    }
    await sleep(1000);
  }

  // Click the reply button
  console.error('Submitting...');
  const { result: submitResult } = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        var btn = document.querySelector('[data-testid="tweetButtonInline"]');
        if (!btn) return 'NO_BUTTON';
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return 'DISABLED';
        btn.click();
        return 'CLICKED';
      })()
    `,
    returnByValue: true
  });

  if (submitResult.value !== 'CLICKED') {
    console.error('Submit failed:', submitResult.value);
    cdp.close();
    process.exit(1);
  }

  await sleep(3000);

  // Try to capture our reply URL
  const { result: replyUrlResult } = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        var articles = document.querySelectorAll('article');
        for (var i = 0; i < articles.length; i++) {
          var handle = articles[i].querySelector('a[href="/claudiaonchain"]');
          if (!handle) continue;
          var timeLink = articles[i].querySelector('a[href*="/claudiaonchain/status/"]');
          if (timeLink) return timeLink.href;
        }
        return '';
      })()
    `,
    returnByValue: true
  });

  const replyUrl = replyUrlResult.value || '';

  // Verify textbox is empty (reply was submitted)
  const { result: emptyCheck } = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        var box = document.querySelector('[data-testid="tweetTextarea_0"]');
        return box ? box.textContent.length : -1;
      })()
    `,
    returnByValue: true
  });

  if (emptyCheck.value < 5) {
    console.log(`Reply posted successfully to ${tweetUrl}`);
    if (replyUrl) console.log(`Reply URL: ${replyUrl}`);
    console.log(`Text: ${replyText}`);

    // Log reply to JSONL for engagement tracking
    try {
      const { appendFileSync } = await import('fs');
      const { resolve } = await import('path');
      const HOME = process.env.HOME || process.env.USERPROFILE;
      const logPath = resolve(HOME, '.claudia', 'tools', 'twitter', 'reply-log.jsonl');
      const entry = JSON.stringify({
        ts: new Date().toISOString(),
        parent: tweetUrl,
        replyUrl: replyUrl || null,
        text: replyText.substring(0, 280)
      });
      appendFileSync(logPath, entry + '\n');
    } catch (e) {
      console.error('Reply log write failed:', e.message);
    }

    // Auto-like the parent tweet (if not already liked)
    const { result: likeResult } = await cdp.send('Runtime.evaluate', {
      expression: `
        (function() {
          var articles = document.querySelectorAll('article');
          if (articles.length === 0) return 'NO_ARTICLES';
          var parent = articles[0]; // first article is the parent tweet
          var likeBtn = parent.querySelector('[data-testid="like"]');
          if (!likeBtn) return 'ALREADY_LIKED'; // unlike button means already liked
          likeBtn.click();
          return 'LIKED';
        })()
      `,
      returnByValue: true
    });
    const liked = likeResult.value === 'LIKED';
    if (liked) console.error('Auto-liked parent tweet');

    const result = { parent: tweetUrl, text: replyText, chars: charCount, posted: true, liked };
    if (replyUrl) result.replyUrl = replyUrl;
    console.log(JSON.stringify(result));
  } else {
    console.error('Reply may not have been posted — textbox still has content.');
  }

  cdp.close();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
