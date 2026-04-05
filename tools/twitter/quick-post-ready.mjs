#!/usr/bin/env node
// quick-post-ready.mjs — Posts all URL-targeted drafts with a delay between each
// Usage: node quick-post-ready.mjs [--dry-run] [--delay <seconds>]
//
// Posts only drafts that have URLs (category: targeted). Skips contextual/promo.
// Logs each result to reply-log.jsonl.

import { execSync } from 'child_process';
import { readFileSync, appendFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN = process.env.HOME?.replace(/\\/g, '/') || 'C:/Users/kurtw';
const DRAFTS_DIR = join(BRAIN, '.claudia/schedule/initiatives/grow-twitter');
const LOG_FILE = join(DRAFTS_DIR, 'reply-log.jsonl');
const CDP_REPLY = join(__dirname, 'cdp-reply.mjs');

// Reuse parsing from reply-session.mjs
function parseDrafts() {
  const files = readdirSync(DRAFTS_DIR).filter(f => f.startsWith('drafts-') && f.endsWith('.md'));
  const drafts = [];

  for (const file of files) {
    const content = readFileSync(join(DRAFTS_DIR, file), 'utf8');
    const lines = content.split('\n');
    let currentUrl = null;
    let currentLabel = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const urlMatch = line.match(/https:\/\/x\.com\/\S+/);
      if (urlMatch) { currentUrl = urlMatch[0]; continue; }
      if (line.startsWith('### ') || line.startsWith('## ')) {
        currentLabel = line.replace(/^#+\s*/, '').trim();
        continue;
      }
      if (line.startsWith('>') && currentUrl) {
        let text = line.slice(2).trim();
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('>')) {
          text += ' ' + lines[j].slice(2).trim();
          j++;
        }
        text = text.replace(/\s*\[\d+ chars\]\s*$/, '').trim();
        const chars = [...text].length;
        if (chars > 0 && chars <= 280) {
          drafts.push({ url: currentUrl, text, chars, file, label: currentLabel || 'unlabeled' });
        } else if (chars > 280) {
          console.error(`SKIP: ${currentUrl} — ${chars}c (over limit by ${chars - 280})`);
        }
        currentUrl = null;
        i = j - 1;
      }
    }
  }
  return drafts;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const delayIdx = args.indexOf('--delay');
  const delaySec = delayIdx !== -1 ? parseInt(args[delayIdx + 1]) || 30 : 30;

  const drafts = parseDrafts();
  console.log(`Found ${drafts.length} ready drafts (with URLs, under 280c)\n`);

  if (drafts.length === 0) {
    console.log('No ready drafts. Create drafts with x.com URLs in drafts-*.md files.');
    process.exit(0);
  }

  // Check CDP first
  if (!dryRun) {
    try {
      execSync('curl -s http://localhost:9222/json/version', { timeout: 5000 });
    } catch {
      console.error('ERROR: Chrome not available on port 9222. Start Chrome with --remote-debugging-port=9222');
      process.exit(1);
    }
  }

  let posted = 0;
  let failed = 0;

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    console.log(`--- ${i + 1}/${drafts.length} ---`);
    console.log(`URL: ${d.url}`);
    console.log(`Text (${d.chars}c): ${d.text.substring(0, 100)}...`);
    console.log(`Source: ${d.file} / ${d.label}`);

    if (dryRun) {
      console.log('DRY RUN — skipped\n');
      continue;
    }

    try {
      const result = execSync(
        `node "${CDP_REPLY}" "${d.url}" "${d.text.replace(/"/g, '\\"')}"`,
        { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      console.log('POSTED:', result.trim());
      const entry = { timestamp: new Date().toISOString(), url: d.url, text: d.text, chars: d.chars, source: d.file, label: d.label, result: 'posted' };
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
      posted++;
    } catch (e) {
      console.error('FAILED:', (e.stderr || e.message).substring(0, 200));
      const entry = { timestamp: new Date().toISOString(), url: d.url, text: d.text, chars: d.chars, source: d.file, label: d.label, result: 'failed' };
      appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
      failed++;
    }

    if (i < drafts.length - 1) {
      console.log(`Waiting ${delaySec}s before next reply...\n`);
      await sleep(delaySec * 1000);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Posted: ${posted} | Failed: ${failed} | Total: ${drafts.length}`);
}

main();
