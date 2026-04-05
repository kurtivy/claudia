#!/usr/bin/env node
// notification-check.mjs — Check Twitter notifications via CDP (raw, no Playwright)
// Usage: node notification-check.mjs [--json] [--limit N]
// Returns: likes, replies, follows, mentions from notification tab
// Uses cdp-eval.mjs approach — connects directly to Chrome CDP WebSocket

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CDP_EVAL = join(__dirname, '../browser/cdp-eval.mjs');

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 15 : 15;

// First ensure we're on notifications page
try {
  const currentUrl = execSync(`node "${CDP_EVAL}" "window.location.href"`, { timeout: 10000, encoding: 'utf8' }).trim();
  if (!currentUrl.includes('/notifications')) {
    execSync(`node "${CDP_EVAL}" "window.location.href = 'https://x.com/notifications'; 'navigating';"`, { timeout: 10000, encoding: 'utf8' });
    // Wait for page load
    execSync('sleep 4', { timeout: 8000 });
  }
} catch (e) {
  console.error(`Navigation error: ${e.message}`);
  process.exit(1);
}

// Extract notifications
const extractScript = `
(function() {
  const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
  const items = [];
  const maxItems = ${limit};

  for (let i = 0; i < Math.min(cells.length, maxItems); i++) {
    const cell = cells[i];
    const text = cell.innerText.replace(/\\n/g, ' | ').trim();
    if (!text || text.length < 10) continue;

    let type = 'unknown';
    if (text.includes('liked')) type = 'like';
    else if (text.includes('followed you')) type = 'follow';
    else if (text.includes('Replying to')) type = 'reply';
    else if (text.includes('reposted')) type = 'repost';
    else if (text.includes('quoted')) type = 'quote';
    else if (text.includes('checkmark')) type = 'system';

    const links = cell.querySelectorAll('a[href^="/"]');
    const users = new Set();
    links.forEach(l => {
      const href = l.getAttribute('href');
      if (href && href.match(/^\\/[a-zA-Z0-9_]+$/) && !href.includes('/status/')) {
        users.add(href.slice(1));
      }
    });

    const timeEl = cell.querySelector('time');
    const time = timeEl ? timeEl.getAttribute('datetime') : null;
    const timeText = timeEl ? timeEl.innerText : '';

    items.push({
      type,
      text: text.substring(0, 200),
      users: [...users].filter(u => u !== 'claudiaonchain'),
      time,
      timeText
    });
  }
  return JSON.stringify(items);
})()
`;

try {
  const raw = execSync(`node "${CDP_EVAL}" "${extractScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    timeout: 15000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  }).trim();

  const notifications = JSON.parse(raw);

  if (jsonMode) {
    console.log(JSON.stringify(notifications, null, 2));
  } else {
    if (!notifications.length) {
      console.log('No notifications found.');
      process.exit(0);
    }

    const grouped = {};
    notifications.forEach(n => {
      if (!grouped[n.type]) grouped[n.type] = [];
      grouped[n.type].push(n);
    });

    console.log(`=== Notifications (${notifications.length}) ===\n`);

    const order = ['follow', 'reply', 'like', 'repost', 'quote', 'system', 'unknown'];
    for (const type of order) {
      const items = grouped[type];
      if (!items) continue;
      const sym = { like: '♥', follow: '+', reply: '↩', repost: '⟳', quote: '"', system: '⚙', unknown: '?' }[type] || '?';
      console.log(`${sym} ${type.toUpperCase()} (${items.length})`);
      items.forEach(item => {
        const who = item.users.length ? `@${item.users[0]}` : '?';
        const when = item.timeText || '';
        console.log(`  ${who} ${when}`);
      });
      console.log('');
    }
  }
} catch (e) {
  console.error(`Extract error: ${e.message}`);
  process.exit(1);
}
