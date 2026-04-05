#!/usr/bin/env node
/**
 * superteam-monitor.mjs — Check Superteam Earn for new bounties
 *
 * Usage: node superteam-monitor.mjs [--notify] [--json]
 *
 * Checks superteam.fun API for open bounties.
 * Filters for agent-eligible work (content, research, docs, data).
 * With --notify, sends Telegram alert for new bounties.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import https from 'https';
import http from 'http';

const HOME = homedir();
const SECRETS = resolve(HOME, '.claudia/secrets/superteam.json');
const STATE_FILE = resolve(HOME, '.claudia/tools/earning/superteam-state.json');
const BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';
const KURT_CHAT = 1578553327;

const args = process.argv.slice(2);
const notify = args.includes('--notify');
const jsonOut = args.includes('--json');

// Agent access is a first-class API field now
// AGENT_ALLOWED = agents can submit, HUMAN_ONLY = agents excluded

function fetch(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'claudia-agent/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        const redirectUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        return fetch(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
      }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch { resolve(d); }
      });
    }).on('error', reject);
  });
}

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ chat_id: KURT_CHAT, text, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function isAgentEligible(bounty) {
  return bounty.agentAccess === 'AGENT_ALLOWED';
}

async function main() {
  // Try the Superteam Earn API
  let bounties = [];
  try {
    // Public listings endpoint
    const data = await fetch('https://superteam.fun/api/listings?filter=open&type=bounty&take=50');
    if (Array.isArray(data)) {
      bounties = data;
    } else if (data?.bounties) {
      bounties = data.bounties;
    } else if (data?.listings) {
      bounties = data.listings;
    } else {
      console.error('Unexpected API response format:', typeof data === 'string' ? data.substring(0, 200) : Object.keys(data));
      // Try alternate endpoint
      const data2 = await fetch('https://superteam.fun/api/listings');
      if (Array.isArray(data2)) bounties = data2;
      else console.error('Alternate also failed:', typeof data2 === 'string' ? data2.substring(0, 200) : Object.keys(data2 || {}));
    }
  } catch (e) {
    console.error('API error:', e.message);
    process.exit(1);
  }

  console.error(`API returned ${bounties.length} listings`);
  if (bounties.length > 0) {
    console.error(`Sample status: ${bounties[0].status}, agentAccess: ${bounties[0].agentAccess}`);
  }

  if (bounties.length === 0) {
    console.log('No bounties found (API may have changed).');
    process.exit(0);
  }

  // Filter for open, unexpired
  const now = new Date();
  const open = bounties.filter(b => {
    if (b.deadline && new Date(b.deadline) < now) return false;
    if (b.status && b.status.toUpperCase() !== 'OPEN') return false;
    return true;
  });

  // Check agent eligibility
  const eligible = open.filter(isAgentEligible);

  // Load previous state
  let prevIds = [];
  if (existsSync(STATE_FILE)) {
    try { prevIds = JSON.parse(readFileSync(STATE_FILE, 'utf-8')); } catch {}
  }

  const newBounties = eligible.filter(b => !prevIds.includes(b.id || b.slug));

  if (jsonOut) {
    console.log(JSON.stringify({ total: open.length, eligible: eligible.length, new: newBounties.length, bounties: eligible }, null, 2));
  } else {
    console.log(`Open bounties: ${open.length}`);
    console.log(`Agent-eligible: ${eligible.length}`);
    console.log(`New since last check: ${newBounties.length}`);
    console.log('');
    for (const b of eligible) {
      const isNew = newBounties.some(n => (n.id || n.slug) === (b.id || b.slug));
      const prize = b.rewardAmount || b.usdValue || b.compensationAmount || '?';
      const deadline = b.deadline ? new Date(b.deadline).toLocaleDateString() : 'no deadline';
      console.log(`${isNew ? '[NEW] ' : ''}${b.title || b.slug}`);
      console.log(`  Prize: $${prize} | Deadline: ${deadline}`);
      console.log(`  URL: https://superteam.fun/listings/${b.type || 'bounty'}/${b.slug}/`);
      console.log('');
    }
  }

  // Notify on new bounties
  if (notify && newBounties.length > 0) {
    const lines = newBounties.map(b => {
      const prize = b.rewardAmount || b.usdValue || b.compensationAmount || '?';
      return `- ${b.title}: $${prize}`;
    });
    await sendTelegram(`new superteam bounties (${newBounties.length}):\n${lines.join('\n')}`);
  }

  // Save state
  const allIds = eligible.map(b => b.id || b.slug);
  writeFileSync(STATE_FILE, JSON.stringify(allIds, null, 2));
}

main().catch(e => { console.error(e.message); process.exit(1); });
