#!/usr/bin/env node
// campaign-health-check.mjs — Verify daily campaign ran, alert via Telegram if not
// Run after scheduled campaign time (e.g., 9am for 8am campaign)
// Usage: node campaign-health-check.mjs [--date YYYY-MM-DD] [--min-sent 100] [--telegram] [--chat-id=ID]

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDIA_DIR = join(HOME, '.claudia');

// Load config
let gatewayToken = '';
try {
  const cfg = JSON.parse(readFileSync(join(CLAUDIA_DIR, 'claudia.json'), 'utf8'));
  gatewayToken = cfg.gateway?.auth?.token || cfg.gateway?.token || '';
} catch {}

const API_BASE = 'http://localhost:18791/api';
const AUTH_HEADER = `Bearer ${gatewayToken}`;
import { loadBotToken } from '../lib/telegram-token.mjs';
const BOT_TOKEN = loadBotToken();
const DEFAULT_CHAT_ID = '1578553327'; // Kurt

// Parse args
const args = process.argv.slice(2);
// Use local date, not UTC — avoids wrong-day check when running in evening MDT
let checkDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
let minSent = 100;
const sendTelegram = args.includes('--telegram');
let chatId = DEFAULT_CHAT_ID;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) checkDate = args[++i];
  if (args[i] === '--min-sent' && args[i + 1]) minSent = parseInt(args[++i], 10);
  if (args[i].startsWith('--chat-id=')) chatId = args[i].split('=')[1];
}

async function fetchApi(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': AUTH_HEADER },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendToTelegram(text) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram: ${JSON.stringify(data)}`);
  return data.result.message_id;
}

async function main() {
  // Check if mail service is running
  let serviceUp = true;
  let campaigns = [];

  try {
    const data = await fetchApi('/campaigns');
    campaigns = data.campaigns || data;
  } catch (err) {
    serviceUp = false;
  }

  // Filter to check date's campaigns
  const todayCampaigns = campaigns.filter(c =>
    c.created_at && c.created_at.startsWith(checkDate)
  );

  const totalSent = todayCampaigns.reduce((s, c) => s + (c.sent || 0), 0);
  const totalFailed = todayCampaigns.reduce((s, c) => s + (c.failed || 0), 0);
  const totalOpened = todayCampaigns.reduce((s, c) => s + (c.opened || 0), 0);
  const totalAttempted = totalSent + totalFailed;
  const failRate = totalAttempted > 0
    ? ((totalFailed / totalAttempted) * 100).toFixed(1)
    : '0';
  const openRate = totalSent > 0
    ? ((totalOpened / totalSent) * 100).toFixed(1)
    : '0';

  // Determine health issues
  const issues = [];
  if (!serviceUp) issues.push('Mail service is down');
  if (serviceUp && todayCampaigns.length === 0) issues.push('No campaigns created today');
  if (totalSent === 0 && todayCampaigns.length > 0) issues.push('Campaigns exist but 0 emails sent');
  if (totalSent > 0 && totalSent < minSent) issues.push(`Only ${totalSent} sent (expected ${minSent}+)`);
  if (totalFailed > totalSent * 0.3) issues.push(`High failure rate: ${failRate}%`);

  // Check for stuck campaigns
  const stuck = todayCampaigns.filter(c => c.status === 'sending' || c.status === 'approved');
  if (stuck.length > 0) issues.push(`${stuck.length} campaigns stuck in ${stuck.map(c => c.status).join('/')}`);

  const healthy = issues.length === 0;

  // Build report
  const report = {
    date: checkDate,
    campaigns: todayCampaigns.length,
    sent: totalSent,
    failed: totalFailed,
    opened: totalOpened,
    failRate: failRate + '%',
    openRate: openRate + '%',
    healthy,
    issues,
  };

  // Console output
  console.log(JSON.stringify(report, null, 2));

  // Telegram alert if unhealthy
  if (!healthy && sendTelegram) {
    const icon = '⚠️';
    const lines = [
      `${icon} <b>Campaign Health Alert</b> — ${checkDate}`,
      '',
      ...issues.map(i => `• ${i}`),
      '',
      `Campaigns: ${todayCampaigns.length} | Sent: ${totalSent} | Failed: ${totalFailed} | Opens: ${totalOpened}`,
    ];
    const msgId = await sendToTelegram(lines.join('\n'));
    console.log(`\nTelegram alert sent (msg ${msgId})`);
  } else if (healthy && sendTelegram) {
    const lines = [
      `✅ <b>Campaign OK</b> — ${checkDate}`,
      `Sent: ${totalSent} | Failed: ${totalFailed} (${failRate}%) | Opens: ${totalOpened} (${openRate}%)`,
    ];
    const msgId = await sendToTelegram(lines.join('\n'));
    console.log(`\nTelegram OK sent (msg ${msgId})`);
  }

  if (!healthy) process.exit(1);
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message, healthy: false }));
  if (sendTelegram) {
    sendToTelegram(`⚠️ Campaign health-check failed: ${err.message}`).catch(() => {});
  }
  process.exit(2);
});
