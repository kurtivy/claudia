#!/usr/bin/env node
// Email Performance Report — standalone tool
// Pulls stats from Claudia Mail, compares A/B variants, sends Telegram report.
// Usage: node email-report.mjs [date] [--telegram] [--chat-id=ID]
// Default: today's date, stdout only. --telegram sends to Kurt's DM.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDIA_HOME = join(HOME, '.claudia');

// Load gateway token
function loadToken() {
  const configPath = join(CLAUDIA_HOME, 'claudia.json');
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      const t = cfg?.gateway?.auth?.token || cfg?.gateway?.token;
      if (t) return t;
    } catch {}
  }
  // Fallback to .env
  const envPath = join(HOME, 'Desktop', 'claudia', '.env');
  if (existsSync(envPath)) {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find(l => l.startsWith('CLAUDIA_GATEWAY_TOKEN='));
    if (line) return line.split('=').slice(1).join('=').trim();
  }
  return process.env.CLAUDIA_GATEWAY_TOKEN || '';
}

const TOKEN = loadToken();
const BASE = 'http://localhost:18791/api';
const BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';
const DEFAULT_CHAT = '1578553327';

// Parse args
const args = process.argv.slice(2);
const sendTelegram = args.includes('--telegram');
const chatArg = args.find(a => a.startsWith('--chat-id='));
const chatId = chatArg ? chatArg.split('=')[1] : DEFAULT_CHAT;
const dateArg = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const date = dateArg || new Date().toLocaleDateString('en-CA');

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
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
  return data.result.message_id;
}

function pct(n, d) {
  return d > 0 ? (n / d * 100).toFixed(1) + '%' : '0.0%';
}

async function run() {
  // Pull data
  const [stats, campaignData] = await Promise.all([
    api('/stats'),
    api('/campaigns'),
  ]);

  const campaigns = campaignData.campaigns || [];

  // Today's campaigns
  const today = campaigns.filter(c => (c.created_at || '').startsWith(date));

  // Group by variant
  const variants = {};
  for (const c of today) {
    const name = c.name || '';
    let variant;
    if (name.includes('-A') || name.includes(' A ') || name.includes(' A-'))
      variant = 'A';
    else if (name.includes('-B') || name.includes(' B ') || name.includes(' B-'))
      variant = 'B';
    else variant = '?';

    if (!variants[variant])
      variants[variant] = { sent: 0, opened: 0, clicked: 0, bounced: 0, failed: 0, count: 0 };
    const v = variants[variant];
    v.sent += c.sent || 0;
    v.opened += c.opened || 0;
    v.clicked += c.clicked || 0;
    v.bounced += c.bounced || 0;
    v.failed += c.failed || 0;
    v.count++;
  }

  // Build report
  const lines = [];
  lines.push(`<b>Email Report — ${date}</b>`);
  lines.push('');

  // Overall
  lines.push(`<b>All-time:</b> ${stats.sends.total} sent, ${pct(stats.sends.opened, stats.sends.sent)} opens, ${pct(stats.sends.clicked, stats.sends.sent)} clicks`);
  lines.push('');

  if (today.length === 0) {
    lines.push(`No campaigns for ${date}.`);
  } else {
    lines.push(`<b>Today:</b> ${today.length} campaigns`);
    lines.push('');

    for (const [key, v] of Object.entries(variants).sort()) {
      lines.push(`<b>Variant ${key}</b> (${v.count} campaigns)`);
      lines.push(`  Sent: ${v.sent} | Failed: ${v.failed}`);
      lines.push(`  Opens: ${v.opened} (${pct(v.opened, v.sent)})`);
      lines.push(`  Clicks: ${v.clicked} (${pct(v.clicked, v.sent)})`);
      lines.push('');
    }

    // A/B verdict
    if (variants.A && variants.B) {
      const aRate = variants.A.sent > 0 ? variants.A.opened / variants.A.sent * 100 : 0;
      const bRate = variants.B.sent > 0 ? variants.B.opened / variants.B.sent * 100 : 0;
      const diff = Math.abs(aRate - bRate);
      if (diff < 2) {
        lines.push(`<b>A/B:</b> Too close (${aRate.toFixed(1)}% vs ${bRate.toFixed(1)}%). Need more data.`);
      } else if (aRate > bRate) {
        lines.push(`<b>A/B:</b> Variant A leads (${aRate.toFixed(1)}% vs ${bRate.toFixed(1)}%, +${diff.toFixed(1)}pp)`);
      } else {
        lines.push(`<b>A/B:</b> Variant B leads (${bRate.toFixed(1)}% vs ${aRate.toFixed(1)}%, +${diff.toFixed(1)}pp)`);
      }
    }
  }

  // Provider breakdown (historical pattern)
  const bh = campaigns.filter(c => c.name?.toLowerCase().includes('bluehost'));
  const rs = campaigns.filter(c => c.name?.toLowerCase().includes('resend'));
  const bhSent = bh.reduce((s, c) => s + (c.sent || 0), 0);
  const bhOpened = bh.reduce((s, c) => s + (c.opened || 0), 0);
  const rsSent = rs.reduce((s, c) => s + (c.sent || 0), 0);
  const rsOpened = rs.reduce((s, c) => s + (c.opened || 0), 0);
  lines.push('');
  lines.push(`<b>Provider pattern:</b>`);
  lines.push(`  Bluehost: ${bhSent} sent, ${pct(bhOpened, bhSent)} opens`);
  lines.push(`  Resend: ${rsSent} sent, ${pct(rsOpened, rsSent)} opens`);

  const report = lines.join('\n');
  console.log(report.replace(/<\/?b>/g, ''));

  if (sendTelegram) {
    const msgId = await sendTG(report);
    console.log(`\nSent to Telegram (msg ${msgId})`);
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
