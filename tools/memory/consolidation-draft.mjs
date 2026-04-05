#!/usr/bin/env node
// consolidation-draft.mjs — Generate a draft knowledge file from a cluster of memory entries.
// Usage: node consolidation-draft.mjs <keyword> [--output=path] [--dry-run]
//
// Examples:
//   node consolidation-draft.mjs agent-payments          # Draft from entries matching "agent-payments"
//   node consolidation-draft.mjs agent-payments,x402     # Multiple keywords (OR match)
//   node consolidation-draft.mjs agent-payments --dry-run # Show what would be included
//
// Output: Prints a draft knowledge file to stdout (or writes to --output path).
// The draft includes frontmatter, section headers from entry titles, and all content.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const ENTRIES_DIR = join(HOME, '.claudia', 'memories', 'entries');
const KNOWLEDGE_DIR = join(HOME, '.claudia', 'knowledge');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const outputArg = args.find(a => a.startsWith('--output='));
const outputPath = outputArg?.split('=')[1];
const keywords = args.filter(a => !a.startsWith('--'))[0]?.split(',').map(k => k.trim().toLowerCase());

if (!keywords || keywords.length === 0) {
  console.error('Usage: node consolidation-draft.mjs <keyword>[,keyword2] [--output=path] [--dry-run]');
  console.error('');
  console.error('Tip: run consolidation-check.mjs first to see available clusters.');
  process.exit(1);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fm: {}, body: content };
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let val = rest.join(':').trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      fm[key.trim()] = val;
    }
  }
  const body = content.slice(match[0].length).trim();
  return { fm, body };
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

// Check what's already consolidated
function getConsolidatedSlugs() {
  const slugs = new Set();
  function scan(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        scan(join(dir, item.name));
      } else if (item.name.endsWith('.md') && !item.name.startsWith('_')) {
        const content = readFileSync(join(dir, item.name), 'utf8');
        const { fm } = parseFrontmatter(content);
        const cf = fm.consolidated_from;
        if (Array.isArray(cf)) cf.forEach(s => slugs.add(s.trim()));
        else {
          const match = content.match(/consolidated_from:\s*\n((?:\s+-\s+.+\n)*)/);
          if (match) {
            match[1].split('\n').filter(l => l.trim()).forEach(l => slugs.add(l.replace(/^\s+-\s+/, '').trim()));
          }
        }
      }
    }
  }
  scan(KNOWLEDGE_DIR);
  return slugs;
}

const alreadyConsolidated = getConsolidatedSlugs();

// Find matching entries
const matches = [];
for (const file of readdirSync(ENTRIES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const content = readFileSync(join(ENTRIES_DIR, file), 'utf8');
  const { fm, body } = parseFrontmatter(content);
  const entryKw = extractKeywords(fm);
  const slug = file.replace('.md', '');

  // Match if any search keyword appears in entry keywords
  const matched = keywords.some(k => entryKw.some(ek => ek.includes(k) || k.includes(ek)));
  if (!matched) continue;

  const consolidated = alreadyConsolidated.has(slug);
  matches.push({ file, slug, fm, body, keywords: entryKw, consolidated });
}

// Sort by date (filename prefix)
matches.sort((a, b) => a.file.localeCompare(b.file));

if (matches.length === 0) {
  console.error(`No entries found matching keywords: ${keywords.join(', ')}`);
  console.error('Try: node consolidation-check.mjs --verbose to see available keywords.');
  process.exit(1);
}

if (dryRun) {
  console.log(`Entries matching [${keywords.join(', ')}]: ${matches.length}\n`);
  for (const m of matches) {
    const status = m.consolidated ? ' [ALREADY CONSOLIDATED]' : '';
    console.log(`  ${m.file}${status}`);
    console.log(`    keywords: ${m.keywords.join(', ')}`);
    console.log(`    body: ${m.body.slice(0, 120).replace(/\n/g, ' ')}...`);
    console.log();
  }
  const uncovered = matches.filter(m => !m.consolidated);
  console.log(`Unconsolidated: ${uncovered.length} / ${matches.length}`);
  process.exit(0);
}

// Generate draft knowledge file
const uncovered = matches.filter(m => !m.consolidated);
if (uncovered.length === 0) {
  console.log('All matching entries are already consolidated into knowledge files.');
  process.exit(0);
}

const allKeywords = [...new Set(uncovered.flatMap(m => m.keywords))];
const slugs = uncovered.map(m => m.slug);
const title = keywords.join('-') + '-landscape';
const today = new Date().toLocaleDateString('en-CA');

let draft = `---
title: ${title.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
type: knowledge
domain: ${uncovered[0].fm.domain || keywords[0]}
consolidated_from: [${slugs.join(', ')}]
last_updated: ${today}
---

# ${title.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}

`;

// Group entries by their primary heading or title
for (const entry of uncovered) {
  // Extract the first H1 or H2 from body
  const titleMatch = entry.body.match(/^#+ (.+)/m);
  const sectionTitle = titleMatch ? titleMatch[1] : entry.slug;

  draft += `## ${sectionTitle}\n\n`;

  // Strip redundant title from body if it starts with one
  let body = entry.body;
  if (titleMatch && body.startsWith(titleMatch[0])) {
    body = body.slice(titleMatch[0].length).trim();
  }

  draft += body + '\n\n';
}

draft += `---

_Consolidated ${today} from ${uncovered.length} memory entries. Source entries preserved in memories/entries/._
`;

if (outputPath) {
  writeFileSync(outputPath, draft);
  console.log(`Draft written to ${outputPath}`);
  console.log(`Entries included: ${uncovered.length}`);
  console.log(`Slugs: ${slugs.join(', ')}`);
} else {
  console.log(draft);
}
