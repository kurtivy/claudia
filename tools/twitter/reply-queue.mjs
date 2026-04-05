#!/usr/bin/env node
// reply-queue.mjs — Parse drafts file and display reply queue
// Usage: node reply-queue.mjs [drafts-file]
//
// Reads a drafts markdown file, extracts reply targets and text.
// Outputs a numbered queue with target URLs, char counts, and readiness.
// Does NOT post — use with Chrome DevTools MCP to post manually.
//
// Default drafts file: ~/.claudia/schedule/initiatives/grow-twitter/drafts-2026-03-28.md

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const LIMIT = 280;
const DEFAULT_DRAFTS = resolve(homedir(), '.claudia/schedule/initiatives/grow-twitter/drafts-2026-03-28.md');

function parseDrafts(content) {
  const drafts = [];
  const sections = content.split(/^## /m).slice(1); // split on ## headers

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0].trim();

    // Extract draft number and title
    const draftMatch = header.match(/^Draft\s+(\d+)\s*[—–-]\s*(.+)/i);
    if (!draftMatch) continue;

    const num = parseInt(draftMatch[1]);
    const title = draftMatch[2].trim();

    // Extract target URL
    let target = null;
    const targetLine = lines.find(l => /^Target:/i.test(l.trim()));
    if (targetLine) {
      const urlMatch = targetLine.match(/(https:\/\/x\.com\/\S+)/);
      if (urlMatch) target = urlMatch[1];
    }

    // Extract char count from parenthetical
    let charCount = null;
    const charLine = lines.find(l => /^\(\d+\s+chars/.test(l.trim()));
    if (charLine) {
      const countMatch = charLine.match(/\((\d+)\s+chars/);
      if (countMatch) charCount = parseInt(countMatch[1]);
    }

    // Extract tweet text (everything between target/header and char count line)
    const textLines = [];
    let collecting = false;
    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (/^Target:/i.test(trimmed)) { collecting = true; continue; }
      if (/^\(\d+\s+chars/.test(trimmed)) break;
      if (collecting || (!targetLine && !trimmed.startsWith('Target'))) {
        if (trimmed) textLines.push(trimmed);
        collecting = true;
      }
    }
    const text = textLines.join(' ');
    const actualChars = [...text].length;

    drafts.push({
      num,
      title,
      target,
      text,
      chars: actualChars,
      withinLimit: actualChars <= LIMIT,
      charCount: charCount || actualChars
    });
  }

  return drafts;
}

// Auto-trim text to fit within a char budget.
// Strategy: remove trailing sentence if over, then trim words from end.
function autoTrim(text, budget) {
  if ([...text].length <= budget) return text;

  // Try removing the last sentence first
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) {
    const shorter = sentences.slice(0, -1).join(' ');
    if ([...shorter].length <= budget) return shorter;
  }

  // Word-by-word trim from end
  const words = text.split(/\s+/);
  while (words.length > 1 && [...words.join(' ')].length > budget) {
    words.pop();
  }
  return words.join(' ');
}

function showQueue(drafts) {
  console.log(`Reply Queue — ${drafts.length} drafts`);
  console.log('='.repeat(80));

  for (const d of drafts) {
    const status = d.withinLimit ? 'READY' : 'OVER';
    const hasTarget = d.target ? 'HAS TARGET' : 'NO TARGET';
    console.log(`\n#${d.num} [${status}] [${hasTarget}] ${d.title}`);
    console.log(`   Chars: ${d.chars}/${LIMIT}`);
    if (d.target) console.log(`   Target: ${d.target}`);
    console.log(`   Text: ${d.text.slice(0, 120)}${d.text.length > 120 ? '...' : ''}`);
  }

  const ready = drafts.filter(d => d.withinLimit && d.target);
  const noTarget = drafts.filter(d => d.withinLimit && !d.target);
  const overLimit = drafts.filter(d => !d.withinLimit);

  console.log('\n' + '='.repeat(80));
  console.log(`Ready to post (has target + within limit): ${ready.length}`);
  console.log(`Needs target URL: ${noTarget.length}`);
  console.log(`Over character limit: ${overLimit.length}`);

  if (ready.length > 0) {
    console.log(`\nPriority order for daytime posting:`);
    for (const d of ready) {
      console.log(`  → Draft #${d.num}: ${d.title}`);
    }
  }
}

// --prep N: output a single draft ready for Chrome DevTools posting
// Validates chars, auto-trims to 275 (5-char safety buffer), outputs exact text + URL.
function prepDraft(drafts, num) {
  const SAFE_LIMIT = 275; // 5-char buffer for Twitter counting quirks
  const draft = drafts.find(d => d.num === num);

  if (!draft) {
    console.error(`Draft #${num} not found. Available: ${drafts.map(d => d.num).join(', ')}`);
    process.exit(1);
  }

  if (!draft.target) {
    console.error(`Draft #${num} has no target URL. Add a "Target: https://x.com/..." line.`);
    process.exit(1);
  }

  let text = draft.text;
  const originalChars = [...text].length;
  let trimmed = false;

  if (originalChars > SAFE_LIMIT) {
    text = autoTrim(text, SAFE_LIMIT);
    trimmed = true;
  }

  const finalChars = [...text].length;

  const result = {
    draft: num,
    title: draft.title,
    target: draft.target,
    text,
    chars: finalChars,
    limit: LIMIT,
    buffer: LIMIT - finalChars,
    trimmed,
    originalChars: trimmed ? originalChars : undefined,
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`PREP — Draft #${num}: ${draft.title}`);
    console.log('='.repeat(80));
    console.log(`Target URL: ${draft.target}`);
    console.log(`Characters: ${finalChars}/${LIMIT} (${LIMIT - finalChars} buffer)`);
    if (trimmed) console.log(`⚠ Auto-trimmed from ${originalChars} to ${finalChars} chars`);
    console.log('\n--- POST THIS TEXT ---');
    console.log(text);
    console.log('--- END ---');
    console.log('\nSteps:');
    console.log(`  1. navigate_page → ${draft.target}`);
    console.log(`  2. take_snapshot → find reply box`);
    console.log(`  3. click reply box`);
    console.log(`  4. type_text → paste the text above (single paragraph, no newlines)`);
    console.log(`  5. take_snapshot → verify char count`);
    console.log(`  6. click "Reply" button`);
  }
}

function main() {
  // Parse flags
  const rawArgs = process.argv.slice(2);

  // Check for --prep N (consume both the flag and its value)
  const prepIdx = rawArgs.findIndex(a => a === '--prep');
  const prepNum = prepIdx !== -1 ? parseInt(rawArgs[prepIdx + 1]) : null;

  // Remove known flags and --prep N from args to find the file path
  const skipIdxs = new Set();
  if (prepIdx !== -1) { skipIdxs.add(prepIdx); skipIdxs.add(prepIdx + 1); }
  const knownFlags = new Set(['--stdin', '--reply', '--force', '--json']);
  const nonFlagArgs = rawArgs.filter((a, i) => !skipIdxs.has(i) && !knownFlags.has(a));

  const file = nonFlagArgs[0] || DEFAULT_DRAFTS;

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`Cannot read: ${file}`);
    process.exit(1);
  }

  const drafts = parseDrafts(content);

  if (drafts.length === 0) {
    console.log('No drafts found.');
    process.exit(0);
  }

  if (prepNum !== null) {
    prepDraft(drafts, prepNum);
  } else {
    showQueue(drafts);
    if (process.argv.includes('--json')) {
      console.log('\n' + JSON.stringify(drafts, null, 2));
    }
  }
}

main();
