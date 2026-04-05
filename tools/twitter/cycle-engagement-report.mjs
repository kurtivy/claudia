#!/usr/bin/env node
// cycle-engagement-report.mjs — Check engagement on all replies from today's cycle
// Usage: node cycle-engagement-report.mjs [cycle-file-path]
// Default: reads the most recent cycle file from schedule/cycles/
//
// Extracts reply URLs from cycle file, checks each via CDP, outputs sorted report.

import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import http from 'http';

const CLAUDIA_HOME = resolve(process.env.HOME || process.env.USERPROFILE, '.claudia');
const CYCLES_DIR = join(CLAUDIA_HOME, 'schedule', 'cycles');

// Find the most recent cycle file (or use provided path)
function findCycleFile() {
  const arg = process.argv[2];
  if (arg) return resolve(arg);

  const files = readdirSync(CYCLES_DIR)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}/) && f.endsWith('.md') && !f.startsWith('_'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No cycle files found');
    process.exit(1);
  }
  return join(CYCLES_DIR, files[0]);
}

// Extract reply URLs from cycle file
function extractReplyUrls(content) {
  const urlRegex = /https:\/\/x\.com\/claudiaonchain\/status\/\d+/g;
  const matches = content.match(urlRegex) || [];
  return [...new Set(matches)]; // deduplicate
}

// CDP helpers
function cdpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9222${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

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
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 300000);
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

async function checkTweet(cdp, url) {
  try {
    await cdp.send('Page.navigate', { url });
    await sleep(3000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const { result: check } = await cdp.send('Runtime.evaluate', {
        expression: 'document.querySelectorAll("article").length',
        returnByValue: true
      });
      if (check.value > 0) break;
      await sleep(1000);
    }

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
          return JSON.stringify({
            ariaLabel: group ? group.getAttribute('aria-label') : '',
            text: textEl ? textEl.innerText.substring(0, 120) : ''
          });
        })()
      `,
      returnByValue: true
    });

    const parsed = JSON.parse(data.value);
    if (parsed.error) return { url, error: parsed.error };
    const metrics = parseMetrics(parsed.ariaLabel);
    return { url, text: parsed.text, ...metrics };
  } catch (e) {
    return { url, error: e.message };
  }
}

async function main() {
  const cycleFile = findCycleFile();
  console.error(`Cycle file: ${cycleFile}`);

  const content = readFileSync(cycleFile, 'utf-8');
  const urls = extractReplyUrls(content);

  if (urls.length === 0) {
    console.error('No reply URLs found in cycle file');
    process.exit(0);
  }

  console.error(`Found ${urls.length} reply URLs to check\n`);

  // Get or create an X tab
  const tabs = await cdpGet('/json');
  let xTab = tabs.find(t => t.url.includes('x.com') && t.type === 'page');
  if (xTab) {
    console.error(`Recycling tab: ${xTab.url.substring(0, 60)}`);
    await cdpPut(`/json/close/${xTab.id}`);
    await sleep(1000);
  }

  const newTab = await cdpPut(`/json/new?${urls[0]}`);
  if (!newTab || !newTab.webSocketDebuggerUrl) {
    console.error('Failed to open new tab');
    process.exit(1);
  }
  await sleep(4000);

  const cdp = await cdpSession(newTab.webSocketDebuggerUrl);
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const statusId = url.match(/status\/(\d+)/)?.[1] || '?';
    console.error(`  [${i + 1}/${urls.length}] ${statusId}`);
    const result = await checkTweet(cdp, url);
    results.push(result);
    if (i < urls.length - 1) await sleep(1500);
  }

  cdp.close();

  // Sort by views descending
  const successful = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);
  successful.sort((a, b) => b.views - a.views);

  // Output report
  const totalViews = successful.reduce((s, r) => s + r.views, 0);
  const totalLikes = successful.reduce((s, r) => s + r.likes, 0);
  const totalReplies = successful.reduce((s, r) => s + r.replies, 0);

  console.log(`\n=== Cycle Engagement Report ===`);
  console.log(`Replies checked: ${successful.length} (${errors.length} errors)`);
  console.log(`Total: ${totalViews.toLocaleString()} views, ${totalLikes} likes, ${totalReplies} replies\n`);

  console.log('Top performers:');
  for (const r of successful.slice(0, 10)) {
    const preview = (r.text || '').substring(0, 70).replace(/\n/g, ' ');
    console.log(`  ${String(r.views).padStart(6)} views | ${r.likes}L ${r.replies}R ${r.reposts}RT | ${preview}`);
  }

  if (successful.length > 10) {
    console.log(`\n  ... and ${successful.length - 10} more`);
  }

  if (errors.length > 0) {
    console.log(`\nErrors:`);
    for (const r of errors) {
      console.log(`  ${r.url} -- ${r.error}`);
    }
  }

  // JSON output to stdout for programmatic use
  const jsonOut = {
    cycleFile,
    checkedAt: new Date().toISOString(),
    totalViews,
    totalLikes,
    totalReplies,
    results: successful,
    errors
  };
  // Write JSON to stderr so console report goes to stdout
  console.error(`\nJSON: ${JSON.stringify(jsonOut)}`);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
