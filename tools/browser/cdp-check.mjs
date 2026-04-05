// Quick CDP page content extractor — no Playwright dependency
// Usage: node cdp-check.mjs [url]  — navigates then extracts tweet list
//        node cdp-check.mjs        — extracts current page
//        node cdp-check.mjs --json [url] — JSON output with urls/views/text
// Env:   SCROLLS=N  — number of scroll passes (default: 1)

import http from 'http';

const jsonMode = process.argv.includes('--json');
const targetUrl = process.argv.filter(a => a !== '--json')[2];

function cdpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:9222${path}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function cdpWs(wsUrl, commands) {
  return new Promise((resolve, reject) => {
    // Use dynamic import for ws if available, otherwise fall back to global WebSocket
    let id = 1;
    const results = [];
    const pending = [...commands];

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      const cmd = pending.shift();
      ws.send(JSON.stringify({ id: id++, method: cmd.method, params: cmd.params }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      results.push(msg);
      if (pending.length > 0) {
        const cmd = pending.shift();
        if (cmd.delay) {
          setTimeout(() => {
            ws.send(JSON.stringify({ id: id++, method: cmd.method, params: cmd.params }));
          }, cmd.delay);
        } else {
          ws.send(JSON.stringify({ id: id++, method: cmd.method, params: cmd.params }));
        }
      } else {
        setTimeout(() => { ws.close(); resolve(results); }, 100);
      }
    };
    ws.onerror = (e) => reject(e);
    setTimeout(() => { ws.close(); resolve(results); }, 20000);
  });
}

async function main() {
  const tabs = await cdpGet('/json');
  const xTab = tabs.find(t => t.url.includes('x.com') && t.type === 'page') || tabs.find(t => t.type === 'page');

  if (!xTab) { console.error('No page tab found'); process.exit(1); }

  console.error(`Tab: ${xTab.url}`);
  const wsUrl = xTab.webSocketDebuggerUrl;

  const commands = [];

  if (targetUrl) {
    commands.push({ method: 'Page.navigate', params: { url: targetUrl } });
    commands.push({ method: 'Runtime.evaluate', params: { expression: 'true', returnByValue: true }, delay: 4000 });
  }

  // Scroll down to load tweets
  const scrollCount = parseInt(process.env.SCROLLS || '1');
  for (let i = 0; i < scrollCount; i++) {
    commands.push({ method: 'Runtime.evaluate', params: { expression: 'window.scrollBy(0, 3000); true', returnByValue: true }, delay: i === 0 && targetUrl ? 1000 : 2000 });
  }

  // Wait and extract
  commands.push({
    method: 'Runtime.evaluate',
    params: {
      expression: `
        (function() {
          var arts = document.querySelectorAll('article');
          var out = [];
          for (var i = 0; i < arts.length; i++) {
            var a = arts[i];
            var txtEl = a.querySelector('[data-testid="tweetText"]');
            var tmEl = a.querySelector('time');
            var txt = txtEl ? txtEl.textContent.substring(0, 100) : 'no-text';
            var tm = tmEl ? tmEl.getAttribute('datetime') : 'no-time';
            var viewEl = a.querySelector('a[href*="/analytics"]');
            var views = viewEl ? viewEl.textContent.trim() : '';
            var statusLink = a.querySelector('a[href*="/status/"]');
            var url = statusLink ? statusLink.href : '';
            var handle = '';
            var userLinks = a.querySelectorAll('a[role="link"]');
            for (var j = 0; j < userLinks.length; j++) {
              var h = userLinks[j].getAttribute('href');
              if (h && h.match(/^\\/[a-zA-Z0-9_]+$/) && h !== '/compose') { handle = h.slice(1); break; }
            }
            out.push(JSON.stringify({time: tm, handle: handle, views: views, url: url, text: txt}));
          }
          return '[' + out.join(',') + ']';
        })()
      `,
      returnByValue: true
    },
    delay: 3000
  });

  const results = await cdpWs(wsUrl, commands);
  const last = results[results.length - 1];
  if (last?.result?.result?.value) {
    const raw = last.result.result.value;
    try {
      const tweets = JSON.parse(raw);
      if (jsonMode) {
        console.log(JSON.stringify(tweets, null, 2));
      } else {
        for (const t of tweets) {
          console.log(`${t.time} | ${t.views} | ${t.text}`);
        }
      }
    } catch {
      console.log(raw);
    }
  } else {
    console.error('No value:', JSON.stringify(last?.result || last, null, 2));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
