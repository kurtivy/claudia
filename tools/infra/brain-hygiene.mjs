#!/usr/bin/env node
/**
 * brain-hygiene.mjs — Validate working-set and keyword-graph health
 *
 * Usage: node brain-hygiene.mjs [--fix] [--json]
 *
 * Checks:
 * 1. working-set.json item count and structure (warn if >20 items)
 * 2. keyword-graph.json entry count and dead pointers (warn if >30 entries)
 * 3. knowledge/ files without frontmatter
 * 4. memories/entries/ files older than 30 days with importance != high
 *
 * Run at cycle end before updating brain files.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const CLAUDIA_HOME = join(HOME, '.claudia');
const BRAIN = join(CLAUDIA_HOME, 'brain');
const KNOWLEDGE = join(CLAUDIA_HOME, 'knowledge');
const ENTRIES = join(CLAUDIA_HOME, 'memories/entries');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');

const issues = [];
const warnings = [];
const stats = {};

// Helper: get content lines (skip headers, blank lines, comments)
function contentLines(filepath) {
  if (!existsSync(filepath)) return [];
  const lines = readFileSync(filepath, 'utf-8').split('\n');
  return lines.filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('_'));
}

// Helper: check if a pointer resolves to a real file
function pointerExists(pointer) {
  if (!pointer) return true;
  // Pointers can be relative to CLAUDIA_HOME or absolute paths
  const candidates = [
    join(CLAUDIA_HOME, pointer),
    join(CLAUDIA_HOME, pointer + '.md'),
    join(CLAUDIA_HOME, 'memories/entries', pointer),
    join(CLAUDIA_HOME, 'memories/entries', pointer + '.md'),
    join(CLAUDIA_HOME, 'knowledge', pointer),
    join(CLAUDIA_HOME, 'knowledge', pointer + '.md'),
  ];
  return candidates.some(c => existsSync(c));
}

// 1. Check working-set.json
const wsPath = join(BRAIN, 'working-set.json');
if (existsSync(wsPath)) {
  let ws;
  try {
    ws = JSON.parse(readFileSync(wsPath, 'utf-8'));
  } catch (e) {
    issues.push(`working-set.json parse error: ${e.message}`);
    ws = null;
  }

  if (ws) {
    const totalItems = (ws.hot?.length || 0) + (ws.warm?.length || 0) + (ws.cold?.length || 0);
    stats.workingSetItems = totalItems;
    stats.hotItems = ws.hot?.length || 0;
    stats.warmItems = ws.warm?.length || 0;
    stats.coldItems = ws.cold?.length || 0;

    if (totalItems > 20) {
      warnings.push(`working-set.json has ${totalItems} items (max recommended: 20)`);
    }

    // Check each item has required fields
    for (const tier of ['hot', 'warm', 'cold']) {
      for (const item of (ws[tier] || [])) {
        if (!item.id) issues.push(`working-set.json ${tier} item missing 'id'`);
        if (!item.summary) issues.push(`working-set.json ${tier} item '${item.id || '?'}' missing 'summary'`);
      }
    }
  }
} else {
  issues.push('working-set.json not found');
}

// 2. Check keyword-graph.json
const kgPath = join(BRAIN, 'keyword-graph.json');
if (existsSync(kgPath)) {
  let kg;
  try {
    kg = JSON.parse(readFileSync(kgPath, 'utf-8'));
  } catch (e) {
    issues.push(`keyword-graph.json parse error: ${e.message}`);
    kg = null;
  }

  if (kg && Array.isArray(kg)) {
    stats.keywordGraphEntries = kg.length;

    if (kg.length > 30) {
      warnings.push(`keyword-graph.json has ${kg.length} entries (max recommended: 30)`);
    }

    // Check for dead pointers
    let deadPointers = 0;
    for (const entry of kg) {
      if (!entry.triggers || !Array.isArray(entry.triggers)) {
        issues.push(`keyword-graph.json entry missing 'triggers' array: ${JSON.stringify(entry).substring(0, 60)}`);
        continue;
      }
      if (entry.pointer && !pointerExists(entry.pointer)) {
        deadPointers++;
        warnings.push(`keyword-graph.json dead pointer: ${entry.pointer}`);
      }
    }
    stats.deadPointers = deadPointers;
  }
} else {
  issues.push('keyword-graph.json not found');
}

// 3. Check knowledge/ files without frontmatter
function scanKnowledge(dir) {
  let noFrontmatter = 0;
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        const sub = scanKnowledge(join(dir, entry.name));
        noFrontmatter += sub.noFrontmatter;
        total += sub.total;
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        total++;
        const content = readFileSync(join(dir, entry.name), 'utf-8');
        if (!content.startsWith('---')) {
          noFrontmatter++;
          warnings.push(`knowledge/ missing frontmatter: ${entry.name}`);
        }
      }
    }
  } catch {}
  return { noFrontmatter, total };
}

const knowledgeScan = scanKnowledge(KNOWLEDGE);
stats.knowledgeFiles = knowledgeScan.total;
stats.knowledgeNoFrontmatter = knowledgeScan.noFrontmatter;

// 4. Check old low-importance entries
const now = new Date();
const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
let oldLowImportance = 0;
let totalEntries = 0;

try {
  for (const file of readdirSync(ENTRIES)) {
    if (!file.endsWith('.md') || file.startsWith('_')) continue;
    totalEntries++;

    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;

    const fileDate = new Date(dateMatch[1] + 'T00:00:00');
    if (fileDate > thirtyDaysAgo) continue;

    const content = readFileSync(join(ENTRIES, file), 'utf-8');
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;

    const importance = fm[1].match(/importance:\s*(\w+)/);
    const consolidated = fm[1].includes('consolidated_into');

    if (importance && importance[1] !== 'high' && !consolidated) {
      oldLowImportance++;
    }
  }
} catch {}

stats.totalEntries = totalEntries;
stats.oldLowImportance = oldLowImportance;

if (oldLowImportance > 0) {
  warnings.push(`${oldLowImportance} entries older than 30 days with importance != high (candidates for pruning)`);
}

// Output
if (jsonOut) {
  console.log(JSON.stringify({ stats, issues, warnings }, null, 2));
} else {
  console.log('Brain Hygiene Check');
  console.log('='.repeat(40));
  console.log(`Working set: ${stats.workingSetItems || 0} items (Hot: ${stats.hotItems}, Warm: ${stats.warmItems}, Cold: ${stats.coldItems})`);
  console.log(`Keyword graph: ${stats.keywordGraphEntries || 0} entries (${stats.deadPointers || 0} dead pointers)`);
  console.log(`Knowledge files: ${stats.knowledgeFiles} (${stats.knowledgeNoFrontmatter} missing frontmatter)`);
  console.log(`Memory entries: ${stats.totalEntries} (${stats.oldLowImportance} pruning candidates)`);
  console.log('');

  if (issues.length > 0) {
    console.log('ISSUES (fix now):');
    for (const i of issues) console.log(`  ❌ ${i}`);
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('WARNINGS:');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log('');
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log('All clean.');
  }
}

process.exit(issues.length > 0 ? 1 : 0);
