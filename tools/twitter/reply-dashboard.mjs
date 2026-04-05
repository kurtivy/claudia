#!/usr/bin/env node
// reply-dashboard.mjs — Show all posted replies with engagement data
// Usage: node reply-dashboard.mjs              # show all today's replies
//        node reply-dashboard.mjs --all        # show all replies ever
//        node reply-dashboard.mjs --check      # refresh engagement via CDP then show
//        node reply-dashboard.mjs --json       # output as JSON
//
// Reads reply-log.jsonl + reply-engagement.jsonl, cross-references,
// shows a table of replies sorted by views (best performing first).

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';
import http from 'http';

const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const GROW = join(HOME, '.claudia/schedule/initiatives/grow-twitter');
const TOOLS = join(HOME, '.claudia/tools/twitter');
const REPLY_LOG = join(GROW, 'reply-log.jsonl');
const ENGAGE_LOG = join(TOOLS, 'reply-engagement.jsonl');

const args = process.argv.slice(2);
const showAll = args.includes('--all');
const doCheck = args.includes('--check');
const jsonMode = args.includes('--json');

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
}

// CDP helpers for --check mode
function cdpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9222${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
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
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, 120000);
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

async function checkEngagement(urls) {
  const results = [];
  const tabs = await cdpGet('/json');
  let xTab = tabs.find(t => t.url.includes('x.com') && t.type === 'page');

  if (xTab) {
    await cdpPut(`/json/close/${xTab.id}`);
    await sleep(1000);
  }

  for (const url of urls) {
    try {
      const newTab = await cdpPut(`/json/new?${url}`);
      if (!newTab?.webSocketDebuggerUrl) { results.push({ url, error: 'no tab' }); continue; }
      await sleep(4000);

      const cdp = await cdpSession(newTab.webSocketDebuggerUrl);

      // Wait for articles to load
      for (let attempt = 0; attempt < 5; attempt++) {
        const { result: check } = await cdp.send('Runtime.evaluate', {
          expression: 'document.querySelectorAll("article").length',
          returnByValue: true
        });
        if (check.value > 0) break;
        await sleep(1000);
      }

      const { result } = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
          var urlMatch = window.location.pathname.match(/\\/status\\/(\\d+)/);
          var targetId = urlMatch ? urlMatch[1] : null;
          var articles = document.querySelectorAll('article');
          var target = null;

          // Find article matching our status ID
          if (targetId) {
            for (var i = 0; i < articles.length; i++) {
              var links = articles[i].querySelectorAll('a[href*="/status/' + targetId + '"]');
              if (links.length > 0) { target = articles[i]; break; }
            }
          }

          if (!target) return JSON.stringify({ error: 'no matching article' });

          var group = target.querySelector('[role="group"]');
          var label = group ? (group.getAttribute('aria-label') || '') : '';
          var textEl = target.querySelector('[data-testid="tweetText"]');
          var text = textEl ? textEl.textContent.slice(0, 60) : '';

          // Parse metrics from aria-label
          var views = 0, likes = 0, replies = 0, reposts = 0;
          var m;
          if (m = label.match(/(\\d[\\d,]*)\\s+views?/i)) views = parseInt(m[1].replace(/,/g, ''));
          if (m = label.match(/(\\d[\\d,]*)\\s+likes?/i)) likes = parseInt(m[1].replace(/,/g, ''));
          if (m = label.match(/(\\d[\\d,]*)\\s+repl(?:y|ies)/i)) replies = parseInt(m[1].replace(/,/g, ''));
          if (m = label.match(/(\\d[\\d,]*)\\s+reposts?/i)) reposts = parseInt(m[1].replace(/,/g, ''));

          return JSON.stringify({ views, likes, replies, reposts, text });
        })()`,
        returnByValue: true
      });

      const data = JSON.parse(result.value || '{}');
      const views = data.error ? '0' : String(data.views || 0);
      results.push({ url, views, raw: data });

      // Log to engagement file
      appendFileSync(ENGAGE_LOG, JSON.stringify({
        url, views, checkedAt: new Date().toISOString()
      }) + '\n');

      cdp.close();
      await cdpPut(`/json/close/${newTab.id}`);
      await sleep(500);
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }
  return results;
}

async function main() {
  const replies = readJsonl(REPLY_LOG);
  const engagements = readJsonl(ENGAGE_LOG);

  // Build engagement map: url -> latest engagement
  const engageMap = new Map();
  for (const e of engagements) {
    const url = e.url || e.statusUrl;
    if (!url) continue;
    const existing = engageMap.get(url);
    const ts = e.checkedAt || e.timestamp || '';
    if (!existing || ts > (existing.checkedAt || '')) {
      engageMap.set(url, e);
    }
  }

  // Filter replies
  const today = todayStr();
  let filtered = replies;
  if (!showAll) {
    filtered = replies.filter(r => {
      const ts = r.ts || '';
      return ts.startsWith(today);
    });
  }

  // Only replies with URLs
  const withUrls = filtered.filter(r => r.replyUrl);

  // If --check, refresh engagement for all reply URLs
  if (doCheck && withUrls.length > 0) {
    console.error(`Checking engagement for ${withUrls.length} replies...`);
    const urls = withUrls.map(r => r.replyUrl.replace('/analytics', ''));
    const freshData = await checkEngagement(urls);
    // Update engageMap with fresh data
    for (const d of freshData) {
      if (!d.error) engageMap.set(d.url, d);
    }
  }

  // Build display data
  const rows = withUrls.map(r => {
    const replyUrl = r.replyUrl.replace('/analytics', '');
    const parentUrl = r.url || r.parent || '';
    const parentAuthor = parentUrl.match(/x\.com\/([^/]+)/)?.[1] || '?';
    const text = (r.text || '').slice(0, 70);
    const engage = engageMap.get(replyUrl);
    const views = engage?.views || engage?.impressions || '?';
    const age = r.ts ? getAge(r.ts) : '?';
    const topic = classifyTopic(parentAuthor, text);

    return { replyUrl, parentAuthor, text, views, age, topic, parentUrl };
  });

  // Sort by views (descending), treat '?' as 0
  rows.sort((a, b) => {
    const va = parseViews(a.views);
    const vb = parseViews(b.views);
    return vb - va;
  });

  if (jsonMode) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  // Display table
  console.log(`\n=== Reply Dashboard${showAll ? ' (all time)' : ` (${today})`} ===`);
  console.log(`Total replies: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log('No replies with captured URLs found.');
    return;
  }

  // Stats
  const viewNums = rows.map(r => parseViews(r.views)).filter(v => v > 0);
  if (viewNums.length > 0) {
    const avg = (viewNums.reduce((a, b) => a + b, 0) / viewNums.length).toFixed(1);
    const max = Math.max(...viewNums);
    const min = Math.min(...viewNums);
    console.log(`Views: avg=${avg} | best=${max} | worst=${min} | tracked=${viewNums.length}/${rows.length}`);
  }

  // Topic breakdown
  const topicCounts = {};
  rows.forEach(r => { topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1; });
  const topicViews = {};
  rows.forEach(r => {
    if (!topicViews[r.topic]) topicViews[r.topic] = [];
    const v = parseViews(r.views);
    if (v > 0) topicViews[r.topic].push(v);
  });
  console.log('\nBy topic:');
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    const vArr = topicViews[topic] || [];
    const avg = vArr.length > 0 ? (vArr.reduce((a, b) => a + b, 0) / vArr.length).toFixed(1) : '?';
    console.log(`  ${topic}: ${count} replies, avg ${avg} views`);
  }

  console.log('\n--- Replies (sorted by views) ---');
  for (const r of rows) {
    console.log(`  ${String(r.views).padStart(4)} views | ${r.age.padEnd(5)} | @${r.parentAuthor.padEnd(18)} | [${r.topic}] ${r.text}`);
  }
  console.log('');
}

function parseViews(v) {
  if (typeof v === 'number') return v;
  if (!v || v === '?') return 0;
  const s = String(v).replace(/,/g, '');
  if (s.endsWith('K')) return parseFloat(s) * 1000;
  if (s.endsWith('M')) return parseFloat(s) * 1000000;
  return parseInt(s) || 0;
}

function getAge(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function classifyTopic(author, text) {
  const combined = (author + ' ' + text).toLowerCase();
  if (/hook|claude code|mcp|skill|agent sdk|lifecycle|sub-agent|vibe cod/i.test(combined)) return 'dev';
  if (/wallet|token|solana|defi|x402|buyback|onchain|on-chain|crypto|pumpfun/i.test(combined)) return 'crypto';
  if (/saas|enterprise|governance|compliance|security|breach/i.test(combined)) return 'enterprise';
  if (/agent|autonomous|identity|nhi/i.test(combined)) return 'agent';
  return 'other';
}

main().catch(e => { console.error(e.message); process.exit(1); });
