#!/usr/bin/env node
// engagement-check-raw.mjs — Tweet engagement via raw CDP (no Playwright)
// Usage: node engagement-check-raw.mjs <url> [url...]
// Usage: node engagement-check-raw.mjs --json <url>
// Usage: node engagement-check-raw.mjs --from-log [--since=YYYY-MM-DD]
//
// Opens ONE tab via /json/new, reuses it for all URLs via Page.navigate.
// Never recycles tabs. Never touches other Chrome tabs.

import http from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const fromLog = args.includes('--from-log');
let urls = args.filter(a => a.startsWith('http'));

// --from-log: read reply URLs from reply-log.jsonl
if (fromLog) {
  const HOME = process.env.HOME || process.env.USERPROFILE;
  const logPath = resolve(HOME, '.claudia', 'tools', 'twitter', 'reply-log.jsonl');
  const sinceArg = args.find(a => a.startsWith('--since='));
  const since = sinceArg ? sinceArg.split('=')[1] : new Date().toISOString().slice(0, 10);
  try {
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (entry.ts >= since && entry.replyUrl) {
        urls.push(entry.replyUrl);
      }
    }
  } catch (e) {
    console.error(`Failed to read reply log: ${e.message}`);
  }
}

if (urls.length === 0) {
  console.error('Usage: node engagement-check-raw.mjs [--json] <url> [url...]');
  console.error('       node engagement-check-raw.mjs --from-log [--since=YYYY-MM-DD]');
  process.exit(2);
}

function httpReq(method, path) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port: 9222, path, method };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } });
    });
    req.on('error', reject);
    req.end();
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
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 120000);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseMetrics(ariaLabel) {
  const result = { views: 0, likes: 0, replies: 0, reposts: 0, bookmarks: 0 };
  const patterns = [
    [/(\d[\d,]*)\s+views?/i, 'views'],
    [/(\d[\d,]*)\s+likes?/i, 'likes'],
    [/(\d[\d,]*)\s+repl(?:y|ies)/i, 'replies'],
    [/(\d[\d,]*)\s+reposts?/i, 'reposts'],
    [/(\d[\d,]*)\s+bookmarks?/i, 'bookmarks'],
  ];
  for (const [regex, key] of patterns) {
    const m = ariaLabel.match(regex);
    if (m) result[key] = parseInt(m[1].replace(/,/g, ''));
  }
  return result;
}

async function waitForArticles(cdp, maxWait = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: 'document.querySelectorAll("article").length',
      returnByValue: true
    });
    if (result.value > 0) return true;
    await sleep(800);
  }
  return false;
}

async function extractMetrics(cdp, targetUrl) {
  const { result: data } = await cdp.send('Runtime.evaluate', {
    expression: `
      (function() {
        var main = document.querySelector('main');
        if (!main) return JSON.stringify({ error: 'no main' });
        var articles = main.querySelectorAll('article');
        if (articles.length === 0) return JSON.stringify({ error: 'no articles' });

        var urlMatch = window.location.pathname.match(/\\/status\\/(\\d+)/);
        var targetStatusId = urlMatch ? urlMatch[1] : null;
        var bestArticle = null;

        if (targetStatusId) {
          for (var i = 0; i < articles.length; i++) {
            var links = articles[i].querySelectorAll('a[href*="/status/' + targetStatusId + '"]');
            if (links.length > 0) { bestArticle = articles[i]; break; }
          }
        }

        if (!bestArticle) {
          var bestScore = -1;
          for (var i = 0; i < articles.length; i++) {
            var group = articles[i].querySelector('[role="group"]');
            if (!group) continue;
            var label = group.getAttribute('aria-label') || '';
            var score = (label.match(/\\d/g) || []).length;
            if (score > bestScore) { bestScore = score; bestArticle = articles[i]; }
          }
        }

        if (!bestArticle) return JSON.stringify({ error: 'no metrics found' });
        var group = bestArticle.querySelector('[role="group"]');
        var textEl = bestArticle.querySelector('[data-testid="tweetText"]');
        var userEl = bestArticle.querySelector('[data-testid="User-Name"]');

        return JSON.stringify({
          ariaLabel: group ? group.getAttribute('aria-label') : '',
          text: textEl ? textEl.innerText.substring(0, 280) : '',
          user: userEl ? userEl.innerText.split('\\n')[0] : ''
        });
      })()
    `,
    returnByValue: true
  });

  const parsed = JSON.parse(data.value);
  if (parsed.error) return { url: targetUrl, error: parsed.error };
  const metrics = parseMetrics(parsed.ariaLabel);
  return { url: targetUrl, user: parsed.user, text: parsed.text, ...metrics };
}

async function main() {
  // Open a single new tab — never touch existing tabs
  const newTab = await httpReq('PUT', `/json/new?about:blank`);
  if (!newTab || !newTab.webSocketDebuggerUrl) {
    console.error('Failed to open new tab. Is Chrome running with --remote-debugging-port=9222?');
    process.exit(1);
  }

  await sleep(1000);
  const cdp = await cdpSession(newTab.webSocketDebuggerUrl);
  const tabId = newTab.id;
  const results = [];

  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.error(`  [${i + 1}/${urls.length}] ${url.split('/status/')[1] || url}`);

      await cdp.send('Page.navigate', { url });
      const found = await waitForArticles(cdp);

      if (!found) {
        results.push({ url, error: 'no articles loaded' });
      } else {
        results.push(await extractMetrics(cdp, url));
      }

      if (i < urls.length - 1) await sleep(1200);
    }
  } finally {
    cdp.close();
    // Close our tab when done
    await httpReq('PUT', `/json/close/${tabId}`).catch(() => {});
  }

  if (jsonMode) {
    console.log(JSON.stringify(urls.length === 1 ? results[0] : results, null, 2));
  } else {
    console.log('\n--- Engagement Report ---');
    for (const r of results) {
      if (r.error) {
        console.log(`  ERROR: ${r.url} — ${r.error}`);
        continue;
      }
      const preview = r.text ? r.text.substring(0, 60).replace(/\n/g, ' ') : '(no text)';
      console.log(`  ${r.views.toLocaleString()} views | ${r.likes} likes | ${r.replies} replies | ${r.reposts} reposts`);
      console.log(`    ${r.user}: ${preview}`);
      console.log();
    }
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
