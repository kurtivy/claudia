#!/usr/bin/env node
// reply-session.mjs — Parse draft files and post replies via CDP
// Usage: node reply-session.mjs --list                    # Show URL-targeted drafts
//        node reply-session.mjs --list-all                # Show all drafts (incl contextual)
//        node reply-session.mjs --post <index>            # Post draft N (1-based)
//        node reply-session.mjs --post-url <url> "text"   # Post reply to arbitrary URL
//        node reply-session.mjs --dry-run <index>         # Preview without posting
//        node reply-session.mjs --contextual <index>      # Search for thread + post contextual draft
//        node reply-session.mjs --contextual-dry <index>  # Preview contextual search without posting
//
// Reads from: schedule/initiatives/grow-twitter/drafts-*.md
// Logs to:    schedule/initiatives/grow-twitter/reply-log.jsonl

import { readFileSync, appendFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRAIN = process.env.HOME?.replace(/\\/g, '/') || 'C:/Users/kurtw';
const DRAFTS_DIR = join(BRAIN, '.claudia/schedule/initiatives/grow-twitter');
const LOG_FILE = join(DRAFTS_DIR, 'reply-log.jsonl');
const CDP_REPLY = join(__dirname, 'cdp-reply.mjs');

function parseDrafts(includeContextual = false) {
  const files = readdirSync(DRAFTS_DIR).filter(f => f.startsWith('drafts-') && f.endsWith('.md'));
  const drafts = [];

  for (const file of files) {
    const content = readFileSync(join(DRAFTS_DIR, file), 'utf8');
    const lines = content.split('\n');
    let currentUrl = null;
    let currentContext = null;
    let currentLabel = null;
    let currentFile = file;
    let isPromo = file.includes('promo');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match URLs (https://x.com/... patterns)
      const urlMatch = line.match(/https:\/\/x\.com\/\S+/);
      if (urlMatch) {
        currentUrl = urlMatch[0];
        continue;
      }

      // Match section headers for labeling and context
      if (line.startsWith('### ') || line.startsWith('## ')) {
        currentLabel = line.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim();
        const forMatch = currentLabel.match(/^For threads about (.+)/i);
        if (forMatch) currentContext = forMatch[1];
        if (/promo|signal|contact manager|@signalgamefun|@tgautomationbot/i.test(currentLabel)) isPromo = true;
        continue;
      }

      // Match blockquote lines (the actual reply text)
      if (line.startsWith('>')) {
        // Collect multi-line blockquotes
        let text = line.slice(2).trim();
        let j = i + 1;
        while (j < lines.length && lines[j].startsWith('>')) {
          text += ' ' + lines[j].slice(2).trim();
          j++;
        }

        // Strip char count annotations like [252 chars]
        text = text.replace(/\s*\[\d+ chars\]\s*$/, '').trim();

        const hasUrl = !!currentUrl;
        if (text.length > 0 && (hasUrl || includeContextual)) {
          drafts.push({
            index: drafts.length + 1,
            url: currentUrl || null,
            text,
            chars: [...text].length,
            file: currentFile,
            label: currentLabel || 'unlabeled',
            context: currentContext || null,
            category: isPromo ? 'promo' : hasUrl ? 'targeted' : 'contextual'
          });
          currentUrl = null;
        }
        i = j - 1;
        continue;
      }
    }
  }

  return drafts;
}

function listDrafts(drafts, showAll = false) {
  if (drafts.length === 0) {
    console.log('No drafts found in', DRAFTS_DIR);
    return;
  }

  const targeted = drafts.filter(d => d.category === 'targeted');
  const contextual = drafts.filter(d => d.category === 'contextual');
  const promo = drafts.filter(d => d.category === 'promo');

  console.log(`Found ${drafts.length} drafts: ${targeted.length} targeted (READY), ${contextual.length} contextual, ${promo.length} promo\n`);

  for (const d of drafts) {
    const status = d.chars > 280 ? ' OVER' : '';
    const tag = d.category === 'promo' ? 'PROMO' : d.url ? 'READY' : 'NEED URL';
    console.log(`  ${d.index}. [${d.chars}c${status}] [${tag}] ${d.url || d.context || d.label}`);
    console.log(`     ${d.text.substring(0, 80)}${d.text.length > 80 ? '...' : ''}`);
    console.log(`     Source: ${d.file}`);
    console.log();
  }

  if (!showAll && contextual.length > 0) {
    console.log(`Tip: Use --post-url <url> "text" for contextual drafts. Copy text from above.`);
  }
}

function logReply(draft, result) {
  const entry = {
    timestamp: new Date().toISOString(),
    url: draft.url,
    text: draft.text,
    chars: draft.chars,
    source: draft.file,
    label: draft.label,
    result
  };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

async function postReply(url, text) {
  console.error(`\nPosting reply to: ${url}`);
  console.error(`Text (${[...text].length}c): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\n`);

  try {
    const result = execSync(
      `node "${CDP_REPLY}" "${url}" "${text.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(result);
    return 'posted';
  } catch (e) {
    console.error('Post failed:', e.stderr || e.message);
    return 'failed: ' + (e.stderr || e.message).substring(0, 200);
  }
}

// Contextual posting: search for thread via Firecrawl, then post
async function searchAndPost(draft, dryRun = false) {
  const topic = draft.context || draft.label;
  console.log(`\nSearching for threads about: ${topic}`);

  const searchDir = join(BRAIN, '.claudia/.firecrawl/reply-session');
  mkdirSync(searchDir, { recursive: true });
  const searchFile = join(searchDir, `search-${Date.now()}.json`);

  try {
    const query = `site:x.com ${topic}`;
    execSync(
      `firecrawl search "${query}" --tbs qdr:d --limit 5 -o "${searchFile}" --json`,
      { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
  } catch (e) {
    console.error('Firecrawl search failed:', e.message?.substring(0, 200));
    return 'failed: firecrawl search error';
  }

  let tweets;
  try {
    const data = JSON.parse(readFileSync(searchFile, 'utf8'));
    const results = data?.data?.web || data?.data || [];
    tweets = (Array.isArray(results) ? results : []).filter(r =>
      r.url?.includes('/status/') && !r.url?.includes('/communities/')
    );
  } catch {
    console.error('Could not parse search results');
    return 'failed: parse error';
  }

  if (tweets.length === 0) {
    console.error('No matching tweets found. Try a different topic.');
    return 'failed: no matching tweets';
  }

  console.log(`\nFound ${tweets.length} matching tweet(s):`);
  tweets.forEach((t, i) => {
    const handle = t.url.split('/')[3] || '?';
    console.log(`  ${i + 1}. @${handle} — ${t.title?.substring(0, 70) || ''}`);
    console.log(`     ${t.url}`);
  });

  const target = tweets[0];
  const handle = target.url.split('/')[3] || '?';
  console.log(`\nSelected: @${handle} — ${target.url}`);

  if (dryRun) {
    console.log(`[DRY RUN] Would post to: ${target.url}`);
    console.log(`Text (${draft.chars}c): ${draft.text}`);
    return 'dry-run';
  }

  const result = await postReply(target.url, draft.text);
  return result;
}

// Main
const args = process.argv.slice(2);
const showAll = args[0] === '--list-all' || args[0] === '--contextual' || args[0] === '--contextual-dry';
const drafts = parseDrafts(showAll);

if (args[0] === '--list' || args[0] === '--list-all' || args.length === 0) {
  listDrafts(drafts, showAll);
} else if (args[0] === '--dry-run') {
  const idx = parseInt(args[1]) - 1;
  if (idx < 0 || idx >= drafts.length) {
    console.error(`Invalid index. Use 1-${drafts.length}`);
    process.exit(1);
  }
  const d = drafts[idx];
  console.log(`DRY RUN — would post to: ${d.url}`);
  console.log(`Text (${d.chars}c):\n${d.text}`);
  console.log(`\nSource: ${d.file} / ${d.label}`);
  if (d.chars > 280) console.error(`\nWARNING: Over limit by ${d.chars - 280} chars!`);
} else if (args[0] === '--contextual' || args[0] === '--contextual-dry') {
  const isDry = args[0] === '--contextual-dry';
  const idx = parseInt(args[1]) - 1;
  if (isNaN(idx) || idx < 0 || idx >= drafts.length) {
    console.error(`Invalid index. Use 1-${drafts.length}. Run --list-all to see contextual drafts.`);
    process.exit(1);
  }
  const d = drafts[idx];
  if (d.chars > 280) {
    console.error(`Reply is ${d.chars} chars (limit 280). Over by ${d.chars - 280}. Aborting.`);
    process.exit(1);
  }
  if (d.url && !isDry) {
    console.log(`Draft ${idx + 1} already has a URL. Using --post instead.`);
    const result = await postReply(d.url, d.text);
    logReply(d, result);
    console.log(`\nResult: ${result}`);
  } else {
    const result = await searchAndPost(d, isDry);
    logReply(d, result);
    console.log(`\nResult: ${result}`);
  }
  console.log(`Logged to: ${LOG_FILE}`);
} else if (args[0] === '--post') {
  const idx = parseInt(args[1]) - 1;
  if (idx < 0 || idx >= drafts.length) {
    console.error(`Invalid index. Use 1-${drafts.length}`);
    process.exit(1);
  }
  const d = drafts[idx];
  if (d.chars > 280) {
    console.error(`Reply is ${d.chars} chars (limit 280). Over by ${d.chars - 280}. Aborting.`);
    process.exit(1);
  }
  const result = await postReply(d.url, d.text);
  logReply(d, result);
  console.log(`\nResult: ${result}`);
  console.log(`Logged to: ${LOG_FILE}`);
} else if (args[0] === '--post-url') {
  const url = args[1];
  const text = args.slice(2).join(' ');
  if (!url || !text) {
    console.error('Usage: --post-url <url> "reply text"');
    process.exit(1);
  }
  const chars = [...text].length;
  if (chars > 280) {
    console.error(`Reply is ${chars} chars (limit 280). Over by ${chars - 280}. Aborting.`);
    process.exit(1);
  }
  const result = await postReply(url, text);
  logReply({ url, text, chars, file: 'manual', label: 'manual' }, result);
  console.log(`\nResult: ${result}`);
} else {
  console.error('Usage: node reply-session.mjs [--list|--list-all|--post N|--dry-run N|--contextual N|--contextual-dry N|--post-url URL TEXT]');
  process.exit(1);
}
