#!/usr/bin/env node
// morning-orchestrator.mjs — One-command morning reply session.
// Phases: plan → verify Chrome → post targeted → post contextual → check engagement
// Usage:
//   node morning-orchestrator.mjs                    # Full run (all phases)
//   node morning-orchestrator.mjs --plan-only        # Just show the plan
//   node morning-orchestrator.mjs --dry-run          # Preview all posts without posting
//   node morning-orchestrator.mjs --phase 1          # Run specific phase (1-4)
//   node morning-orchestrator.mjs --count 10         # Max replies to post (default 12)
//   node morning-orchestrator.mjs --delay 45         # Seconds between posts (default 40)
//   node morning-orchestrator.mjs --engagement-after 30  # Minutes to wait before engagement check (default 30)
//   node morning-orchestrator.mjs --skip-engagement  # Skip the engagement check phase

import { execSync, spawn } from 'child_process';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOLS = __dirname;
const BOOT_CHECK = join(__dirname, '..', 'diagnostics', 'boot-check.mjs');
const REPLY_LOG = join(__dirname, '..', '..', 'schedule', 'initiatives', 'grow-twitter', 'reply-log.jsonl');

// Parse args
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const val = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const planOnly = flag('plan-only');
const dryRun = flag('dry-run');
const skipEngagement = flag('skip-engagement');
const phaseOnly = val('phase', null);
const maxCount = parseInt(val('count', '12'));
const delaySeconds = parseInt(val('delay', '40'));
const engagementWait = parseInt(val('engagement-after', '30'));

function log(phase, msg) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${ts}] [Phase ${phase}] ${msg}`);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 60000, ...opts }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : e.message;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Phase 1: Plan — get draft inventory
function phase1Plan() {
  log(1, 'Generating posting plan...');
  const raw = run(`node "${join(TOOLS, 'draft-planner.mjs')}" --json --count ${maxCount}`);
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch {
    // Try to extract JSON from mixed output
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      try { plan = JSON.parse(raw.slice(jsonStart)); } catch { /* fall through */ }
    }
    if (!plan) {
      log(1, 'Could not parse plan output. Raw:');
      console.log(raw.slice(0, 500));
      return null;
    }
  }

  const targeted = (plan.plan || []).filter(d => d.url && d.type !== 'promo');
  const contextual = (plan.plan || []).filter(d => !d.url && d.type !== 'promo');
  const promo = (plan.plan || []).filter(d => d.type === 'promo');

  log(1, `Plan: ${targeted.length} targeted, ${contextual.length} contextual, ${promo.length} promo`);
  if (plan.stats) {
    log(1, `Total drafts available: ${plan.stats.total || '?'}`);
  }

  return { targeted, contextual, promo, all: plan.plan || [] };
}

// Phase 2: Verify Chrome + Twitter
function phase2Verify() {
  log(2, 'Checking Chrome CDP + Twitter auth...');
  const result = run(`node "${BOOT_CHECK}"`);
  const chromeOk = result.includes('[OK] Chrome CDP');
  const twitterOk = result.includes('Twitter: authenticated');

  if (!chromeOk || !twitterOk) {
    log(2, `BLOCKED: Chrome=${chromeOk ? 'OK' : 'DOWN'}, Twitter=${twitterOk ? 'OK' : 'NOT AUTH'}`);
    console.log(result);
    return false;
  }

  log(2, 'Chrome + Twitter ready.');
  return true;
}

// Phase 3: Post replies
async function phase3Post(plan) {
  const posted = [];
  const toPost = plan.all.slice(0, maxCount);

  log(3, `Posting ${toPost.length} replies (${dryRun ? 'DRY RUN' : 'LIVE'}, ${delaySeconds}s delay)...`);

  for (let i = 0; i < toPost.length; i++) {
    const draft = toPost[i];
    const label = `[${i + 1}/${toPost.length}]`;

    if (draft.url) {
      log(3, `${label} Targeted → ${draft.url.slice(0, 60)}...`);
      log(3, `  Text: ${(draft.text || '').slice(0, 80)}...`);

      if (dryRun) {
        log(3, `  [DRY RUN] Would post to ${draft.url}`);
        posted.push({ ...draft, status: 'dry-run' });
      } else {
        const text = (draft.text || '').replace(/'/g, "'\\''");
        const result = run(`node "${join(TOOLS, 'cdp-reply.mjs')}" "${draft.url}" '${text}'`);
        const success = result.toLowerCase().includes('success') || result.toLowerCase().includes('posted');
        log(3, `  ${success ? 'POSTED' : 'FAILED'}: ${result.slice(0, 100)}`);
        posted.push({ ...draft, status: success ? 'posted' : 'failed', result: result.slice(0, 200) });
      }
    } else if (!draft.url) {
      const topic = draft.searchHint || draft.topic || 'AI agents';
      const text = (draft.text || '').slice(0, 280);
      log(3, `${label} Contextual → topic: "${topic}"`);
      log(3, `  Text: ${text.slice(0, 80)}...`);

      if (dryRun) {
        log(3, `  [DRY RUN] Would search "${topic}" and post`);
        posted.push({ ...draft, status: 'dry-run' });
      } else {
        const safeText = text.replace(/'/g, "'\\''");
        const safeTopic = topic.replace(/'/g, "'\\''");
        const result = run(`node "${join(TOOLS, 'smart-reply.mjs')}" --topic '${safeTopic}' --text '${safeText}' --auto`);
        const success = result.toLowerCase().includes('posted') || result.toLowerCase().includes('success');
        log(3, `  ${success ? 'POSTED' : 'FAILED'}: ${result.slice(0, 100)}`);
        posted.push({ ...draft, status: success ? 'posted' : 'failed', result: result.slice(0, 200) });
      }
    } else {
      log(3, `${label} Skipping (type: ${draft.type})`);
      continue;
    }

    // Delay between posts
    if (i < toPost.length - 1 && !dryRun) {
      log(3, `  Waiting ${delaySeconds}s...`);
      await sleep(delaySeconds * 1000);
    }
  }

  const postedCount = posted.filter(p => p.status === 'posted').length;
  const failedCount = posted.filter(p => p.status === 'failed').length;
  log(3, `Done: ${postedCount} posted, ${failedCount} failed, ${posted.length - postedCount - failedCount} dry-run/skipped`);

  // Log to JSONL
  for (const p of posted) {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      phase: 'morning-orchestrator',
      type: p.type,
      url: p.url || null,
      topic: p.searchHint || p.topic || null,
      status: p.status,
      text: (p.text || '').slice(0, 100)
    });
    try { appendFileSync(REPLY_LOG, entry + '\n'); } catch { /* ignore */ }
  }

  return posted;
}

// Phase 4: Engagement check
async function phase4Engagement(posted) {
  const urls = posted
    .filter(p => p.status === 'posted' && p.url)
    .map(p => p.url)
    .slice(0, 8);

  if (urls.length === 0) {
    log(4, 'No posted URLs to check engagement for.');
    return;
  }

  log(4, `Waiting ${engagementWait} minutes before checking engagement on ${urls.length} replies...`);
  if (!dryRun) {
    await sleep(engagementWait * 60 * 1000);
  }

  log(4, 'Checking engagement...');
  const urlArgs = urls.map(u => `"${u}"`).join(' ');
  const result = run(`node "${join(TOOLS, 'engagement-check.mjs')}" --json ${urlArgs}`, { timeout: 120000 });

  try {
    const data = JSON.parse(result);
    const totalViews = data.reduce((s, d) => s + (d.views || 0), 0);
    const avgViews = data.length ? (totalViews / data.length).toFixed(1) : 0;
    log(4, `Results: ${data.length} checked, ${totalViews} total views, ${avgViews} avg views/reply`);

    for (const d of data) {
      console.log(`  ${d.url?.split('/').pop() || '?'}: ${d.views || 0} views, ${d.likes || 0} likes, ${d.replies || 0} replies`);
    }
  } catch {
    log(4, 'Could not parse engagement data:');
    console.log(result.slice(0, 300));
  }
}

// Main
async function main() {
  console.log('=== Morning Session Orchestrator ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'} | Max: ${maxCount} | Delay: ${delaySeconds}s`);
  console.log('');

  // Phase 1: Plan
  if (phaseOnly && phaseOnly !== '1') {
    log(1, 'Skipped (--phase)');
  }
  const plan = phase1Plan();
  if (!plan) {
    console.error('Failed to generate plan. Exiting.');
    process.exit(1);
  }
  if (planOnly) {
    console.log(JSON.stringify(plan, null, 2));
    process.exit(0);
  }

  // Phase 2: Verify
  if (phaseOnly && phaseOnly !== '2') {
    log(2, 'Skipped (--phase)');
  } else {
    const ready = phase2Verify();
    if (!ready && !dryRun) {
      console.error('Chrome/Twitter not ready. Use --dry-run to preview without browser.');
      process.exit(1);
    }
  }

  // Phase 3: Post
  if (phaseOnly && phaseOnly !== '3') {
    log(3, 'Skipped (--phase)');
    return;
  }
  const posted = await phase3Post(plan);

  // Phase 4: Engagement
  if (skipEngagement || (phaseOnly && phaseOnly !== '4')) {
    log(4, 'Skipped');
  } else {
    await phase4Engagement(posted);
  }

  console.log('\n=== Session Complete ===');
}

main().catch(e => {
  console.error('Orchestrator error:', e.message);
  process.exit(1);
});
