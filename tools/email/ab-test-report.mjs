#!/usr/bin/env node
// ab-test-report.mjs — Compare A/B campaign variants with subject lines, click rates, significance
// Usage: node ab-test-report.mjs [--date YYYY-MM-DD] [--all] [--telegram] [--chat-id=ID]
// --all: aggregate all A/B days instead of a single date

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDIA_DIR = join(HOME, '.claudia');

let gatewayToken = '';
try {
  const cfg = JSON.parse(readFileSync(join(CLAUDIA_DIR, 'claudia.json'), 'utf8'));
  gatewayToken = cfg.gateway?.auth?.token || '';
} catch {}

const API_BASE = 'http://localhost:18791/api';
const BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';
const DEFAULT_CHAT_ID = '1578553327';

const args = process.argv.slice(2);
let checkDate = new Date().toLocaleDateString('en-CA');
const sendTelegram = args.includes('--telegram');
const showAll = args.includes('--all');
let chatId = DEFAULT_CHAT_ID;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--date' && args[i + 1]) checkDate = args[++i];
  if (args[i].startsWith('--chat-id=')) chatId = args[i].split('=')[1];
}

function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) : '0.0'; }

function getVariant(name) {
  if (!name) return '?';
  if (/\bA[-\s]/.test(name) || name.includes(' A ')) return 'A';
  if (/\bB[-\s]/.test(name) || name.includes(' B ')) return 'B';
  return '?';
}

// Simple z-test for two proportions
function zTest(p1, n1, p2, n2) {
  if (n1 < 10 || n2 < 10) return { z: 0, pValue: 1, significant: false, minSample: 'Need 10+ per variant' };
  const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
  if (pPool === 0 || pPool === 1) return { z: 0, pValue: 1, significant: false, minSample: 'No variance' };
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p1 - p2) / se : 0;
  // Two-tailed p-value approximation
  const absZ = Math.abs(z);
  const pValue = absZ > 3.29 ? 0.001 : absZ > 2.58 ? 0.01 : absZ > 1.96 ? 0.05 : absZ > 1.65 ? 0.10 : 1;
  return { z, pValue, significant: pValue <= 0.05 };
}

async function fetchApi(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${gatewayToken}` },
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
}

async function main() {
  const raw = await fetchApi('/campaigns');
  const campaigns = raw.campaigns || (Array.isArray(raw) ? raw : []);

  const completed = campaigns.filter(c => c.status === 'completed' && c.total_contacts > 1);

  let target;
  if (showAll) {
    target = completed.filter(c => getVariant(c.name) !== '?');
  } else {
    target = completed.filter(c => c.created_at?.startsWith(checkDate));
  }

  if (target.length === 0) {
    console.log(showAll ? 'No A/B campaigns found.' : `No completed campaigns for ${checkDate}.`);
    return;
  }

  // Extract subject lines from first campaign of each variant
  const subjects = {};
  for (const c of target) {
    const v = getVariant(c.name);
    if (v !== '?' && !subjects[v] && c.subject_template) {
      subjects[v] = c.subject_template;
    }
  }
  // If subject_template not on list response, fetch one campaign per variant
  for (const v of ['A', 'B']) {
    if (!subjects[v]) {
      const sample = target.find(c => getVariant(c.name) === v);
      if (sample) {
        try {
          const detail = await fetchApi(`/campaigns/${sample.id}`);
          subjects[v] = detail.subject_template || detail.subject || '(unknown)';
        } catch { subjects[v] = '(unknown)'; }
      }
    }
  }

  // Aggregate by variant
  const variants = {};
  for (const c of target) {
    const v = getVariant(c.name);
    if (!variants[v]) variants[v] = { sent: 0, opened: 0, clicked: 0, failed: 0, unsub: 0, byProvider: {}, days: new Set() };
    const vd = variants[v];
    vd.sent += c.sent || 0;
    vd.opened += c.opened || 0;
    vd.clicked += c.clicked || 0;
    vd.failed += c.failed || 0;
    vd.unsub += c.unsubscribed || 0;
    if (c.created_at) vd.days.add(c.created_at.slice(0, 10));

    const provider = c.provider || 'unknown';
    if (!vd.byProvider[provider]) vd.byProvider[provider] = { sent: 0, opened: 0, clicked: 0 };
    vd.byProvider[provider].sent += c.sent || 0;
    vd.byProvider[provider].opened += c.opened || 0;
    vd.byProvider[provider].clicked += c.clicked || 0;
  }

  const header = showAll ? 'A/B Test Report -- All Days' : `A/B Test Report -- ${checkDate}`;
  const lines = [header, ''];

  // Subject lines
  if (subjects.A || subjects.B) {
    lines.push('Subject Lines:');
    if (subjects.A) lines.push(`  A: "${subjects.A}"`);
    if (subjects.B) lines.push(`  B: "${subjects.B}"`);
    lines.push('');
  }

  for (const key of ['A', 'B', '?'].filter(k => variants[k])) {
    const v = variants[key];
    const label = key === '?' ? 'Other' : `Variant ${key}`;
    const dayCount = v.days.size;
    const dayNote = showAll && dayCount > 1 ? ` (${dayCount} days)` : '';
    lines.push(`${label}${dayNote}:`);
    lines.push(`  Sent: ${v.sent}  Opens: ${v.opened} (${pct(v.opened, v.sent)}%)  Clicks: ${v.clicked} (${pct(v.clicked, v.sent)}%)  Unsubs: ${v.unsub}`);

    for (const [prov, pv] of Object.entries(v.byProvider)) {
      lines.push(`  ${prov}: ${pv.sent} sent, ${pct(pv.opened, pv.sent)}% opens, ${pct(pv.clicked, pv.sent)}% clicks`);
    }
    lines.push('');
  }

  // Winner call with significance
  if (variants.A && variants.B) {
    const a = variants.A, b = variants.B;
    const aOpenRate = a.sent > 0 ? a.opened / a.sent : 0;
    const bOpenRate = b.sent > 0 ? b.opened / b.sent : 0;
    const aClickRate = a.sent > 0 ? a.clicked / a.sent : 0;
    const bClickRate = b.sent > 0 ? b.clicked / b.sent : 0;

    const openTest = zTest(aOpenRate, a.sent, bOpenRate, b.sent);
    const clickTest = zTest(aClickRate, a.sent, bClickRate, b.sent);

    const openDiff = Math.abs(aOpenRate - bOpenRate) * 100;
    const clickDiff = Math.abs(aClickRate - bClickRate) * 100;

    lines.push('--- Results ---');

    // Opens
    const openWinner = openDiff < 1 ? 'tie' : aOpenRate > bOpenRate ? 'A' : 'B';
    const openSig = openTest.significant ? 'significant (p<0.05)' : `not significant (n=${a.sent + b.sent}, need more data)`;
    if (openWinner === 'tie') {
      lines.push(`Opens: Tied at ~${pct(aOpenRate * 100, 100)}% -- ${openSig}`);
    } else {
      lines.push(`Opens: ${openWinner} leads (${pct(variants[openWinner].opened, variants[openWinner].sent)}% vs ${pct(variants[openWinner === 'A' ? 'B' : 'A'].opened, variants[openWinner === 'A' ? 'B' : 'A'].sent)}%, +${openDiff.toFixed(1)}pp) -- ${openSig}`);
    }

    // Clicks
    if (a.clicked + b.clicked > 0) {
      const clickWinner = clickDiff < 0.5 ? 'tie' : aClickRate > bClickRate ? 'A' : 'B';
      const clickSig = clickTest.significant ? 'significant' : 'not significant';
      if (clickWinner === 'tie') {
        lines.push(`Clicks: Tied at ~${pct(aClickRate * 100, 100)}% -- ${clickSig}`);
      } else {
        lines.push(`Clicks: ${clickWinner} leads (${pct(variants[clickWinner].clicked, variants[clickWinner].sent)}% vs ${pct(variants[clickWinner === 'A' ? 'B' : 'A'].clicked, variants[clickWinner === 'A' ? 'B' : 'A'].sent)}%) -- ${clickSig}`);
      }
    }

    // Recommendation
    lines.push('');
    const totalSent = a.sent + b.sent;
    if (totalSent < 200) {
      lines.push(`Verdict: Too early (${totalSent} total sends). Run until 200+ per variant for reliable signal.`);
    } else if (openTest.significant) {
      const winner = aOpenRate > bOpenRate ? 'A' : 'B';
      lines.push(`Verdict: ${winner} is the winner on opens. Consider switching all sends to ${winner}.`);
    } else {
      lines.push(`Verdict: No clear winner yet. Keep running both variants.`);
    }
  }

  const output = lines.join('\n');
  console.log(output);

  if (sendTelegram) {
    await sendToTelegram(`<pre>${output}</pre>`);
    console.log('\nSent to Telegram.');
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
