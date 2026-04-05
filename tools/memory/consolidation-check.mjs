#!/usr/bin/env node
// consolidation-check.mjs — Analyze memory entries for consolidation opportunities.
// Reads all entries, clusters by shared keywords, shows which entries overlap.
// Usage: node consolidation-check.mjs [--verbose] [--min-overlap=2] [--json] [--prune-candidates] [--prune-days=30]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const ENTRIES_DIR = join(HOME, '.claudia', 'memories', 'entries');
const KNOWLEDGE_DIR = join(HOME, '.claudia', 'knowledge');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const jsonOut = args.includes('--json');
const pruneCheck = args.includes('--prune-candidates');
const minOverlapArg = args.find(a => a.startsWith('--min-overlap='));
const minOverlap = Number(minOverlapArg?.split('=')[1] || 2);
const pruneDaysArg = args.find(a => a.startsWith('--prune-days='));
const pruneDays = Number(pruneDaysArg?.split('=')[1] || 30);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      let val = rest.join(':').trim();
      // Parse arrays like [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      fm[key.trim()] = val;
    }
  }
  return fm;
}

function extractKeywords(fm, content) {
  const kw = new Set();
  // From frontmatter keywords/tags
  const tags = fm.keywords || fm.tags || [];
  if (Array.isArray(tags)) tags.forEach(t => kw.add(t.toLowerCase()));
  else if (typeof tags === 'string') tags.split(',').forEach(t => kw.add(t.trim().toLowerCase()));
  // From domain
  if (fm.domain) kw.add(fm.domain.toLowerCase());
  return [...kw];
}

// Read all entries
const entries = [];
for (const file of readdirSync(ENTRIES_DIR).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
  const content = readFileSync(join(ENTRIES_DIR, file), 'utf8');
  const fm = parseFrontmatter(content);
  const keywords = extractKeywords(fm, content);
  entries.push({ file, ...fm, keywords });
}

// Read knowledge files to know what's already consolidated (recursive)
const knowledge = [];
function scanKnowledge(dir, prefix = '') {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      scanKnowledge(join(dir, item.name), `${prefix}${item.name}/`);
    } else if (item.name.endsWith('.md') && !item.name.startsWith('_')) {
      const content = readFileSync(join(dir, item.name), 'utf8');
      const fm = parseFrontmatter(content);
      const keywords = extractKeywords(fm, content);
      // Check for consolidated_from — supports both YAML array and newline list
      let consolidatedFrom = [];
      const fmConsolidated = fm.consolidated_from;
      if (Array.isArray(fmConsolidated)) {
        consolidatedFrom = fmConsolidated;
      } else {
        const consolidatedMatch = content.match(/consolidated_from:\s*\n((?:\s+-\s+.+\n)*)/);
        if (consolidatedMatch) {
          consolidatedFrom = consolidatedMatch[1].split('\n').filter(l => l.trim()).map(l => l.replace(/^\s+-\s+/, '').trim());
        }
      }
      knowledge.push({ file: `${prefix}${item.name}`, keywords, consolidatedFrom });
    }
  }
}
scanKnowledge(KNOWLEDGE_DIR);

// Find keyword clusters
const keywordIndex = {};
for (const entry of entries) {
  for (const kw of entry.keywords) {
    if (!keywordIndex[kw]) keywordIndex[kw] = [];
    keywordIndex[kw].push(entry.file);
  }
}

// Find entry pairs with shared keywords
const pairScores = {};
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const shared = entries[i].keywords.filter(k => entries[j].keywords.includes(k));
    if (shared.length >= minOverlap) {
      const key = `${entries[i].file}|||${entries[j].file}`;
      pairScores[key] = shared;
    }
  }
}

// Check which entries are already covered by knowledge files
const coveredSlugs = new Set();
for (const kf of knowledge) {
  for (const src of kf.consolidatedFrom) {
    coveredSlugs.add(src.trim());
  }
}
// Match entry filenames against covered slugs (handles date-prefix mismatch)
function isCovered(filename) {
  const slug = filename.replace('.md', '');
  if (coveredSlugs.has(slug)) return true;
  // Strip date prefix: 2026-03-27_foo → foo
  const stripped = slug.replace(/^\d{4}-\d{2}-\d{2}_/, '');
  return coveredSlugs.has(stripped);
}

// Build clusters using union-find
const parent = {};
function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
function union(a, b) { parent[find(a)] = find(b); }

for (const entry of entries) parent[entry.file] = entry.file;
for (const key of Object.keys(pairScores)) {
  const [a, b] = key.split('|||');
  union(a, b);
}

const clusters = {};
for (const entry of entries) {
  const root = find(entry.file);
  if (!clusters[root]) clusters[root] = [];
  clusters[root].push(entry);
}

// Show clusters with >1 entry
const multiClusters = Object.values(clusters).filter(c => c.length > 1);
multiClusters.sort((a, b) => b.length - a.length);

// Singletons for prune check (needed before JSON output)
const singletons = Object.values(clusters).filter(c => c.length === 1).map(c => c[0]);

// Output
if (!jsonOut) {
console.log(`Memory Consolidation Check`);
console.log(`${'='.repeat(60)}`);
console.log(`Entries: ${entries.length} | Knowledge files: ${knowledge.length} | Already consolidated: ${coveredSlugs.size}`);
console.log();
}

// Identify clusters needing consolidation
const needsConsolidation = multiClusters.filter(c => {
  const clusterFiles = c.map(e => e.file.replace('.md', ''));
  return !knowledge.some(kf => kf.consolidatedFrom.some(src => clusterFiles.some(cf => cf.includes(src))));
});

// Prune candidates: singletons older than N days, not consolidated, no cluster membership
function getEntryDate(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? new Date(match[1]) : null;
}

const now = new Date();
const cutoff = new Date(now - pruneDays * 86400000);
const pruneCandidates = singletons.filter(entry => {
  const date = getEntryDate(entry.file);
  if (!date || date > cutoff) return false;
  const slug = entry.file.replace('.md', '');
  return !isCovered(entry.file);
});

// JSON output mode
if (jsonOut) {
  const output = {
    summary: {
      entries: entries.length,
      knowledgeFiles: knowledge.length,
      consolidated: coveredSlugs.size,
      clustersNeedingConsolidation: needsConsolidation.length,
      pruneCandidates: pruneCandidates.length
    },
    clusters: needsConsolidation.map(c => ({
      size: c.length,
      keywords: [...new Set(c.flatMap(e => e.keywords))],
      entries: c.map(e => e.file)
    })),
    pruneCandidates: pruneCandidates.map(e => ({
      file: e.file,
      keywords: e.keywords,
      date: getEntryDate(e.file)?.toISOString().slice(0, 10)
    }))
  };
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

// Human-readable cluster output
if (multiClusters.length === 0) {
  console.log('No consolidation clusters found (no entries share enough keywords).');
} else {
  console.log(`Found ${multiClusters.length} cluster(s) with shared keywords:\n`);
  for (const cluster of multiClusters) {
    const allKw = cluster.map(e => new Set(e.keywords));
    const commonKw = [...allKw[0]].filter(k => allKw.every(s => s.has(k)));
    const allUnionKw = [...new Set(cluster.flatMap(e => e.keywords))];
    const clusterFiles = cluster.map(e => e.file.replace('.md', ''));
    const coveringKnowledge = knowledge.filter(kf =>
      kf.consolidatedFrom.some(src => clusterFiles.some(cf => cf.includes(src)))
    );
    const status = coveringKnowledge.length > 0
      ? `COVERED by ${coveringKnowledge.map(k => k.file).join(', ')}`
      : 'NEEDS CONSOLIDATION';
    console.log(`--- Cluster (${cluster.length} entries) [${status}]`);
    console.log(`  Keywords: ${allUnionKw.join(', ')}`);
    if (commonKw.length) console.log(`  Common: ${commonKw.join(', ')}`);
    for (const entry of cluster) {
      const covered = isCovered(entry.file) ? ' [consolidated]' : '';
      console.log(`  - ${entry.file}${covered}`);
    }
    console.log();
  }
}

if (verbose && singletons.length) {
  console.log(`\nUnclustered entries (${singletons.length}):`);
  for (const entry of singletons) {
    console.log(`  - ${entry.file} [${entry.keywords.join(', ')}]`);
  }
}

// Summary recommendation
console.log(`\nRecommendations:`);
if (needsConsolidation.length) {
  console.log(`  ${needsConsolidation.length} cluster(s) need consolidation into knowledge/ files.`);
} else {
  console.log(`  All multi-entry clusters are covered by knowledge files.`);
}
if (singletons.length > 10) {
  console.log(`  ${singletons.length} singleton entries — consider pruning entries older than 30 days with no lasting value.`);
}

// Show prune candidates if requested
if (pruneCheck && pruneCandidates.length > 0) {
  console.log(`\nPrune candidates (${pruneCandidates.length} entries older than ${pruneDays} days, no cluster, not consolidated):`);
  for (const entry of pruneCandidates) {
    const date = getEntryDate(entry.file)?.toISOString().slice(0, 10);
    console.log(`  - ${entry.file} (${date}) [${entry.keywords.join(', ')}]`);
  }
} else if (pruneCheck) {
  console.log(`\nNo prune candidates (all entries are <${pruneDays} days old, clustered, or consolidated).`);
}
