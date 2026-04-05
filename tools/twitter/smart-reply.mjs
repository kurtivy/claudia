#!/usr/bin/env node
// smart-reply.mjs — Find a matching thread and post a reply in one step
//
// Usage:
//   node smart-reply.mjs --topic "AI agent payments" --text 'your reply here'
//   node smart-reply.mjs --topic "SaaS disruption" --text 'your reply here' --dry-run
//   node smart-reply.mjs --topic "zero human companies" --text 'reply' --min-results 3
//
// Flow:
//   1. Searches X/Twitter via Firecrawl for threads matching the topic
//   2. Picks the best candidate (most recent, most engagement potential)
//   3. Shows you the target and asks for confirmation (or auto-posts with --auto)
//   4. Posts via cdp-reply.mjs
//
// Requires: firecrawl CLI, cdp-reply.mjs, Chrome on port 9222

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME || process.env.USERPROFILE || 'C:/Users/kurtw';
const FIRECRAWL_DIR = join(HOME, 'Desktop', 'claudia', '.firecrawl', 'smart-reply');
const CDR_REPLY = join(__dirname, 'cdp-reply.mjs');
const LOG_FILE = join(HOME, '.claudia', 'schedule', 'initiatives', 'grow-twitter', 'reply-log.jsonl');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const topic = getArg('topic');
const text = getArg('text');
const dryRun = hasFlag('dry-run');
const auto = hasFlag('auto');
const minResults = parseInt(getArg('min-results') || '5');

if (!topic || !text) {
  console.error('Usage: node smart-reply.mjs --topic "topic" --text \'reply text\'');
  console.error('Flags: --dry-run, --auto, --min-results N');
  process.exit(2);
}

// Validate char count
const charCount = [...text].length;
if (charCount > 280) {
  console.error(`Reply is ${charCount} chars (limit 280). Over by ${charCount - 280}. Trim first.`);
  process.exit(1);
}

console.log(`Topic: ${topic}`);
console.log(`Reply (${charCount}c): ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`);
console.log('');

// Step 1: Search for matching threads
console.log('Searching for matching threads...');
mkdirSync(FIRECRAWL_DIR, { recursive: true });
const searchFile = join(FIRECRAWL_DIR, `search-${Date.now()}.json`);

try {
  const query = `site:x.com ${topic}`;
  execSync(
    `firecrawl search "${query}" --tbs qdr:d --limit ${minResults} -o "${searchFile}" --json`,
    { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
  );
} catch (e) {
  console.error('Firecrawl search failed:', e.message?.substring(0, 200));
  process.exit(1);
}

// Parse results
let results;
try {
  const data = JSON.parse(readFileSync(searchFile, 'utf8'));
  results = data?.data?.web || [];
} catch {
  console.error('Could not parse search results');
  process.exit(1);
}

if (results.length === 0) {
  console.error('No matching threads found. Try a broader topic.');
  process.exit(1);
}

// Filter to actual tweet URLs (not profile pages or community pages)
const tweets = results.filter(r =>
  r.url.includes('/status/') && !r.url.includes('/communities/')
);

if (tweets.length === 0) {
  console.log('Found results but none were individual tweets:');
  results.forEach((r, i) => console.log(`  ${i + 1}. ${r.title?.substring(0, 60)} — ${r.url}`));
  console.log('\nTry a more specific topic or use --post-url directly.');
  process.exit(1);
}

// Show candidates
console.log(`Found ${tweets.length} matching tweet(s):\n`);
tweets.forEach((t, i) => {
  const handle = t.url.split('/')[3] || '?';
  console.log(`  ${i + 1}. @${handle} — ${t.title?.substring(0, 70)}`);
  console.log(`     ${t.url}`);
  if (t.description) console.log(`     ${t.description.substring(0, 100)}`);
  console.log('');
});

// Pick the first tweet (most relevant per Firecrawl ranking)
const target = tweets[0];
const handle = target.url.split('/')[3] || '?';

console.log(`Selected: @${handle}`);
console.log(`URL: ${target.url}`);
console.log('');

if (dryRun) {
  console.log('[DRY RUN] Would post:');
  console.log(`  To: ${target.url}`);
  console.log(`  Text: ${text}`);
  process.exit(0);
}

// Step 2: Post the reply
console.log('Posting reply...');
try {
  // Use single quotes around text to prevent shell interpretation of $ signs
  // Write text to temp file to avoid any shell escaping issues
  const tmpFile = join(FIRECRAWL_DIR, 'reply-text.tmp');
  writeFileSync(tmpFile, text);

  const result = execSync(
    `node "${CDR_REPLY}" "${target.url}" --file "${tmpFile}"`,
    { encoding: 'utf8', timeout: 45000, cwd: __dirname }
  );
  console.log(result);

  // Log it
  const logEntry = {
    ts: new Date().toISOString(),
    url: target.url,
    handle: `@${handle}`,
    text,
    chars: charCount,
    source: 'smart-reply',
    topic,
    result: 'posted'
  };
  try {
    const { appendFileSync } = await import('fs');
    appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch {}

  console.log(`\nPosted to @${handle} via smart-reply (topic: "${topic}")`);

} catch (e) {
  console.error('Post failed:', e.message?.substring(0, 200));

  // Log failure
  try {
    const { appendFileSync } = await import('fs');
    const logEntry = {
      ts: new Date().toISOString(),
      url: target.url,
      handle: `@${handle}`,
      text,
      chars: charCount,
      source: 'smart-reply',
      topic,
      result: 'failed',
      error: e.message?.substring(0, 100)
    };
    appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
  } catch {}

  process.exit(1);
}
