#!/usr/bin/env node
// campaign-trends.mjs — Multi-day campaign trend analysis
// Shows open/click rates per day, provider comparison, A/B trends
// Usage: node campaign-trends.mjs [--days=N] [--telegram] [--chat-id=ID]

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDIA_HOME = join(HOME, '.claudia');

function loadToken() {
  const p = join(CLAUDIA_HOME, 'claudia.json');
  if (existsSync(p)) {
    try {
      const cfg = JSON.parse(readFileSync(p, 'utf8'));
      return cfg?.gateway?.auth?.token || '';
    } catch {}
  }
  return '';
}

const TOKEN = loadToken();
const BASE = 'http://localhost:18791/api';
const BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';
const DEFAULT_CHAT = '1578553327';

const args = process.argv.slice(2);
const sendTelegram = args.includes('--telegram');
const chatArg = args.find(a => a.startsWith('--chat-id='));
const chatId = chatArg ? chatArg.split('=')[1] : DEFAULT_CHAT;
const daysArg = args.find(a => a.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1]) : 7;

function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) : '0.0'; }

function getVariant(name) {
  if (!name) return '?';
  // Match patterns like "A-bh0", " A ", " A-", "-A-"
  if (/\bA[-\s]/.test(name) || name.includes(' A ')) return 'A';
  if (/\bB[-\s]/.test(name) || name.includes(' B ')) return 'B';
  return '?';
}

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function sendTG(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
}

async function run() {
  const { campaigns } = await api('/campaigns');
  if (!campaigns?.length) { console.log('No campaigns found.'); return; }

  // Filter to non-cancelled, non-test campaigns
  const real = campaigns.filter(c =>
    c.status !== 'cancelled' &&
    c.total_contacts > 1 &&
    c.created_at
  );

  // Group by date
  const byDate = {};
  for (const c of real) {
    const date = c.created_at.slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(c);
  }

  // Get last N days with data
  const dates = Object.keys(byDate).sort().slice(-days);

  const lines = [];
  lines.push(`<b>Campaign Trends (${dates.length} days)</b>`);
  lines.push('');

  // Per-day summary
  lines.push('<b>Daily Performance:</b>');
  for (const date of dates) {
    const dc = byDate[date];
    const sent = dc.reduce((s, c) => s + (c.sent || 0), 0);
    const opened = dc.reduce((s, c) => s + (c.opened || 0), 0);
    const clicked = dc.reduce((s, c) => s + (c.clicked || 0), 0);
    const failed = dc.reduce((s, c) => s + (c.failed || 0), 0);
    const delivery = pct(sent, sent + failed);
    lines.push(`  ${date}: ${sent} sent, ${pct(opened, sent)}% opens, ${pct(clicked, sent)}% clicks (${delivery}% delivered)`);
  }
  lines.push('');

  // A/B trend (only for days with both variants)
  const abDays = dates.filter(d => {
    const v = new Set(byDate[d].map(c => getVariant(c.name)));
    return v.has('A') && v.has('B');
  });

  if (abDays.length > 0) {
    lines.push('<b>A/B Trend:</b>');
    let aWins = 0, bWins = 0;
    for (const date of abDays) {
      const dc = byDate[date];
      const a = dc.filter(c => getVariant(c.name) === 'A');
      const b = dc.filter(c => getVariant(c.name) === 'B');
      const aSent = a.reduce((s, c) => s + (c.sent || 0), 0);
      const aOpened = a.reduce((s, c) => s + (c.opened || 0), 0);
      const bSent = b.reduce((s, c) => s + (c.sent || 0), 0);
      const bOpened = b.reduce((s, c) => s + (c.opened || 0), 0);
      const aRate = aSent > 0 ? aOpened / aSent * 100 : 0;
      const bRate = bSent > 0 ? bOpened / bSent * 100 : 0;
      const winner = Math.abs(aRate - bRate) < 2 ? 'tie' : aRate > bRate ? 'A' : 'B';
      if (winner === 'A') aWins++;
      if (winner === 'B') bWins++;
      lines.push(`  ${date}: A=${aRate.toFixed(1)}% B=${bRate.toFixed(1)}% -> ${winner}`);
    }
    lines.push(`  Score: A=${aWins} B=${bWins}${aWins === bWins ? ' (tied)' : aWins > bWins ? ' (A leads)' : ' (B leads)'}`);
    lines.push('');
  }

  // Provider comparison
  lines.push('<b>Provider Comparison:</b>');
  const providers = {};
  for (const c of real) {
    const p = c.provider || 'unknown';
    if (!providers[p]) providers[p] = { sent: 0, opened: 0, clicked: 0, failed: 0 };
    providers[p].sent += c.sent || 0;
    providers[p].opened += c.opened || 0;
    providers[p].clicked += c.clicked || 0;
    providers[p].failed += c.failed || 0;
  }
  for (const [p, v] of Object.entries(providers)) {
    lines.push(`  ${p}: ${v.sent} sent, ${pct(v.opened, v.sent)}% opens, ${pct(v.clicked, v.sent)}% clicks, ${v.failed} failed`);
  }

  // Overall totals
  const totalSent = real.reduce((s, c) => s + (c.sent || 0), 0);
  const totalOpened = real.reduce((s, c) => s + (c.opened || 0), 0);
  const totalClicked = real.reduce((s, c) => s + (c.clicked || 0), 0);
  const totalUnsub = real.reduce((s, c) => s + (c.unsubscribed || 0), 0);
  lines.push('');
  lines.push(`<b>Totals:</b> ${totalSent} sent, ${pct(totalOpened, totalSent)}% opens, ${pct(totalClicked, totalSent)}% clicks, ${totalUnsub} unsubs`);

  const report = lines.join('\n');
  console.log(report.replace(/<\/?b>/g, ''));

  if (sendTelegram) {
    await sendTG(report);
    console.log('\nSent to Telegram.');
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
