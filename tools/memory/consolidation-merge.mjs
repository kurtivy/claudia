#!/usr/bin/env node
// consolidation-merge.mjs — Smart knowledge file generator from memory entry clusters.
// Unlike consolidation-draft.mjs (raw concatenation), this tool:
//   1. Extracts discrete facts from each entry
//   2. Deduplicates overlapping facts (Jaccard similarity)
//   3. Groups facts by topic (keyword clustering)
//   4. Produces a clean, structured knowledge draft
//
// Usage:
//   node consolidation-merge.mjs <keyword>[,keyword2] [--output=path] [--dry-run] [--threshold=0.55]
//
// Examples:
//   node consolidation-merge.mjs saas,pricing              # Merge SaaS/pricing entries
//   node consolidation-merge.mjs pumpfun --dry-run          # Preview what would be merged
//   node consolidation-merge.mjs agent-commerce --output=knowledge/crypto/agent-commerce.md

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const ENTRIES_DIR = join(HOME, '.claudia', 'memories', 'entries');
const KNOWLEDGE_DIR = join(HOME, '.claudia', 'knowledge');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const outputArg = args.find(a => a.startsWith('--output='));
const outputPath = outputArg?.split('=')[1];
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const SIMILARITY_THRESHOLD = Number(thresholdArg?.split('=')[1] || 0.55);
const keywords = args.filter(a => !a.startsWith('--'))[0]?.split(',').map(k => k.trim().toLowerCase());

if (!keywords?.length) {
  console.error('Usage: node consolidation-merge.mjs <keyword>[,keyword2] [--output=path] [--dry-run] [--threshold=N]');
  console.error('');
  console.error('Smart merger: extracts facts, deduplicates, groups by topic.');
  console.error('Tip: run consolidation-check.mjs first to see clusters.');
  process.exit(1);
}

// --- Frontmatter parsing ---
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fm: {}, body: content };
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let val = rest.join(':').trim();
      if (val.startsWith('[') && val.endsWith(']'))
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      fm[key.trim()] = val;
    }
  }
  return { fm, body: content.slice(match[0].length).trim() };
}

function extractKeywords(fm) {
  const kw = new Set();
  const tags = fm.keywords || fm.tags || [];
  if (Array.isArray(tags)) tags.forEach(t => kw.add(t.toLowerCase()));
  else if (typeof tags === 'string') tags.split(',').forEach(t => kw.add(t.trim().toLowerCase()));
  if (fm.domain) kw.add(fm.domain.toLowerCase());
  if (fm.subtype) kw.add(fm.subtype.toLowerCase());
  return [...kw];
}

// --- Fact extraction ---
// Splits entry body into discrete facts (bullets, table rows, paragraphs, headings)
function extractFacts(body, sourceFile) {
  const facts = [];
  const lines = body.split('\n');
  let currentHeading = '';
  let pendingParagraph = [];

  function flushParagraph() {
    if (pendingParagraph.length) {
      const text = pendingParagraph.join(' ').trim();
      if (text.length > 15) {
        facts.push({ text, heading: currentHeading, source: sourceFile, type: 'paragraph' });
      }
      pendingParagraph = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Heading
    if (/^#{1,4}\s+/.test(trimmed)) {
      flushParagraph();
      currentHeading = trimmed.replace(/^#+\s+/, '');
      continue;
    }

    // Empty line = paragraph break
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Bullet point
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const text = trimmed.replace(/^[-*]\s+/, '').trim();
      if (text.length > 15) {
        facts.push({ text, heading: currentHeading, source: sourceFile, type: 'bullet' });
      }
      continue;
    }

    // Table row (skip header separators)
    if (/^\|/.test(trimmed) && !/^\|[-\s|]+\|$/.test(trimmed)) {
      flushParagraph();
      facts.push({ text: trimmed, heading: currentHeading, source: sourceFile, type: 'table-row' });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const text = trimmed.replace(/^\d+\.\s+/, '').trim();
      if (text.length > 15) {
        facts.push({ text, heading: currentHeading, source: sourceFile, type: 'numbered' });
      }
      continue;
    }

    // Regular text = accumulate paragraph
    pendingParagraph.push(trimmed);
  }
  flushParagraph();
  return facts;
}

// --- Similarity ---
function tokenize(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// Normalize text for comparison: strip markdown formatting, bold markers, etc.
function normalizeForComparison(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // strip bold
    .replace(/\*([^*]+)\*/g, '$1')       // strip italic
    .replace(/`([^`]+)`/g, '$1')         // strip code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if one fact is a substring/superset of another
function isSubsumed(shorter, longer) {
  const normS = normalizeForComparison(shorter);
  const normL = normalizeForComparison(longer);
  if (normL.includes(normS)) return true;
  // Check if all key words from shorter appear in longer
  const wordsS = new Set(normS.split(' ').filter(w => w.length > 3));
  const wordsL = new Set(normL.split(' ').filter(w => w.length > 3));
  if (wordsS.size < 3) return false;
  let hits = 0;
  for (const w of wordsS) if (wordsL.has(w)) hits++;
  return hits / wordsS.size >= 0.85;
}

// Dedup facts: Jaccard similarity + substring containment. Keep the more detailed version.
function deduplicateFacts(facts) {
  const tokenized = facts.map(f => ({
    ...f,
    tokens: tokenize(f.text),
    normalized: normalizeForComparison(f.text)
  }));
  const removed = new Set();

  for (let i = 0; i < tokenized.length; i++) {
    if (removed.has(i)) continue;
    for (let j = i + 1; j < tokenized.length; j++) {
      if (removed.has(j)) continue;

      const sim = jaccard(tokenized[i].tokens, tokenized[j].tokens);
      const isDuplicate = sim >= SIMILARITY_THRESHOLD;

      // Also check substring containment for shorter facts
      const shorter = tokenized[i].text.length <= tokenized[j].text.length ? i : j;
      const longer = shorter === i ? j : i;
      const isContained = !isDuplicate && tokenized[shorter].text.length > 20 &&
        isSubsumed(tokenized[shorter].text, tokenized[longer].text);

      if (isDuplicate || isContained) {
        // Keep the longer/more detailed fact
        const removeIdx = tokenized[i].text.length >= tokenized[j].text.length ? j : i;
        removed.add(removeIdx);
        if (removeIdx === i) break;
      }
    }
  }

  return facts.filter((_, idx) => !removed.has(idx));
}

// --- Topic grouping ---
// Group facts by their heading, falling back to keyword extraction
function groupByTopic(facts) {
  const groups = new Map();

  for (const fact of facts) {
    const key = fact.heading || 'Overview';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }

  // Merge groups with similar headings
  const keys = [...groups.keys()];
  const mergedGroups = new Map();
  const merged = new Set();

  for (let i = 0; i < keys.length; i++) {
    if (merged.has(keys[i])) continue;
    let bestKey = keys[i];
    const combined = [...groups.get(keys[i])];

    for (let j = i + 1; j < keys.length; j++) {
      if (merged.has(keys[j])) continue;
      const sim = jaccard(tokenize(keys[i]), tokenize(keys[j]));
      if (sim >= 0.4) {
        combined.push(...groups.get(keys[j]));
        merged.add(keys[j]);
        // Keep the longer heading as the label
        if (keys[j].length > bestKey.length) bestKey = keys[j];
      }
    }
    mergedGroups.set(bestKey, combined);
  }

  return mergedGroups;
}

// --- Table merging ---
// Detect and merge table rows into proper tables
function renderFacts(facts) {
  const lines = [];
  const tableRows = facts.filter(f => f.type === 'table-row');
  const nonTable = facts.filter(f => f.type !== 'table-row');

  // Render table if we have rows
  if (tableRows.length > 1) {
    // Deduplicate table rows
    const seen = new Set();
    const uniqueRows = [];
    for (const row of tableRows) {
      const normalized = row.text.replace(/\s+/g, ' ').trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueRows.push(row.text);
      }
    }

    // Find the header row (first row with the most columns, or the first row)
    const headerRow = uniqueRows[0];
    const colCount = (headerRow.match(/\|/g)?.length || 2) - 1;
    const separator = '|' + Array(colCount).fill('---').join('|') + '|';

    lines.push(headerRow);
    lines.push(separator);
    for (let i = 1; i < uniqueRows.length; i++) {
      lines.push(uniqueRows[i]);
    }
    lines.push('');
  }

  // Render non-table facts
  for (const fact of nonTable) {
    if (fact.type === 'bullet' || fact.type === 'numbered') {
      lines.push(`- ${fact.text}`);
    } else {
      lines.push(fact.text);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
}

// --- Main ---
// Find matching entries
const matches = [];
for (const file of readdirSync(ENTRIES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const content = readFileSync(join(ENTRIES_DIR, file), 'utf8');
  const { fm, body } = parseFrontmatter(content);
  const entryKw = extractKeywords(fm);
  const matched = keywords.some(k => entryKw.some(ek => ek.includes(k) || k.includes(ek)));
  if (!matched) continue;
  matches.push({ file, slug: file.replace('.md', ''), fm, body, keywords: entryKw });
}

matches.sort((a, b) => a.file.localeCompare(b.file));

if (!matches.length) {
  console.error(`No entries matching: ${keywords.join(', ')}`);
  process.exit(1);
}

// Extract all facts
let allFacts = [];
for (const entry of matches) {
  const facts = extractFacts(entry.body, entry.file);
  allFacts.push(...facts);
}

const totalBefore = allFacts.length;
allFacts = deduplicateFacts(allFacts);
const totalAfter = allFacts.length;
const deduped = totalBefore - totalAfter;

// Group by topic
const groups = groupByTopic(allFacts);

if (dryRun) {
  console.log(`Entries: ${matches.length} | Facts extracted: ${totalBefore} | After dedup: ${totalAfter} (removed ${deduped})`);
  console.log(`Topics: ${groups.size}\n`);
  for (const [heading, facts] of groups) {
    console.log(`  ## ${heading} (${facts.length} facts)`);
    for (const f of facts.slice(0, 3)) {
      console.log(`    - ${f.text.slice(0, 100)}${f.text.length > 100 ? '...' : ''}`);
    }
    if (facts.length > 3) console.log(`    ... and ${facts.length - 3} more`);
    console.log();
  }
  console.log(`Sources: ${matches.map(m => m.file).join(', ')}`);
  process.exit(0);
}

// Generate knowledge file
const slugs = matches.map(m => m.slug);
const title = keywords.join('-');
const titleCase = title.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ');
const today = new Date().toLocaleDateString('en-CA');
const allKw = [...new Set(matches.flatMap(m => m.keywords))];

let output = `---
title: ${titleCase}
type: knowledge
domain: ${matches[0].fm.domain || keywords[0]}
consolidated_from: [${slugs.join(', ')}]
last_updated: ${today}
---

# ${titleCase}

_Consolidated ${today} from ${matches.length} memory entries. ${deduped} duplicate facts removed._

`;

for (const [heading, facts] of groups) {
  output += `## ${heading}\n\n`;
  output += renderFacts(facts);
  output += '\n\n';
}

if (outputPath) {
  writeFileSync(outputPath, output);
  console.log(`Written to ${outputPath}`);
  console.log(`Entries: ${matches.length} | Facts: ${totalBefore} → ${totalAfter} (${deduped} deduped) | Topics: ${groups.size}`);
} else {
  console.log(output);
  console.error(`\n--- Stats: ${matches.length} entries, ${totalBefore}→${totalAfter} facts (${deduped} deduped), ${groups.size} topics ---`);
}
