#!/usr/bin/env node
/**
 * memory-scope.mjs — Retrieve memories filtered by initiative scope
 *
 * Usage:
 *   node memory-scope.mjs grow-twitter          # entries scoped to grow-twitter + global
 *   node memory-scope.mjs grow-twitter --strict  # only entries explicitly scoped to grow-twitter
 *   node memory-scope.mjs --list-scopes          # show all scopes in use
 *   node memory-scope.mjs --unscoped             # show entries without a scope field
 *
 * Reads frontmatter from memories/entries/ and knowledge/ files.
 * Entries without a scope field are considered "global" (returned unless --strict).
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const ENTRIES_DIR = join(HOME, '.claudia/memories/entries');
const KNOWLEDGE_DIR = join(HOME, '.claudia/knowledge');

const args = process.argv.slice(2);
const listScopes = args.includes('--list-scopes');
const unscoped = args.includes('--unscoped');
const strict = args.includes('--strict');
const targetScope = args.find(a => !a.startsWith('--'));

if (!targetScope && !listScopes && !unscoped) {
  console.error('Usage: node memory-scope.mjs <initiative> [--strict]');
  console.error('       node memory-scope.mjs --list-scopes');
  console.error('       node memory-scope.mjs --unscoped');
  process.exit(2);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)/);
    if (kv) {
      let val = kv[2].trim();
      // Parse YAML arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

function scanDir(dir, prefix = '') {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('_')) {
        results.push(...scanDir(join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name));
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        const fullPath = join(dir, entry.name);
        const content = readFileSync(fullPath, 'utf-8');
        const fm = parseFrontmatter(content);
        results.push({
          file: prefix ? `${prefix}/${entry.name}` : entry.name,
          path: fullPath,
          scope: Array.isArray(fm.scope) ? fm.scope : (fm.scope ? [fm.scope] : null),
          domain: fm.domain || null,
          importance: fm.importance || null,
          type: fm.type || fm.subtype || null
        });
      }
    }
  } catch {}
  return results;
}

const allEntries = [
  ...scanDir(ENTRIES_DIR).map(e => ({ ...e, source: 'memory' })),
  ...scanDir(KNOWLEDGE_DIR).map(e => ({ ...e, source: 'knowledge' }))
];

if (listScopes) {
  const scopeMap = {};
  for (const e of allEntries) {
    if (e.scope) {
      for (const s of e.scope) {
        scopeMap[s] = (scopeMap[s] || 0) + 1;
      }
    }
  }
  const unscCount = allEntries.filter(e => !e.scope).length;
  console.log('Scopes in use:');
  for (const [scope, count] of Object.entries(scopeMap).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${scope}: ${count} entries`);
  }
  console.log(`\n  (unscoped/global): ${unscCount} entries`);
  console.log(`  Total: ${allEntries.length} entries`);
  process.exit(0);
}

if (unscoped) {
  const noScope = allEntries.filter(e => !e.scope);
  console.log(`Entries without scope field: ${noScope.length}`);
  for (const e of noScope) {
    console.log(`  [${e.source}] ${e.file}`);
  }
  process.exit(0);
}

// Filter by scope
const matched = allEntries.filter(e => {
  if (e.scope && e.scope.includes(targetScope)) return true;
  if (!strict && !e.scope) return true; // global entries included unless --strict
  return false;
});

const scopedCount = matched.filter(e => e.scope).length;
const globalCount = matched.filter(e => !e.scope).length;

console.log(`Scope: ${targetScope}${strict ? ' (strict)' : ''}`);
console.log(`Matched: ${matched.length} (${scopedCount} scoped + ${globalCount} global)`);
console.log('');

for (const e of matched) {
  const tag = e.scope ? `[${e.scope.join(',')}]` : '[global]';
  const imp = e.importance ? ` (${e.importance})` : '';
  console.log(`  ${tag} [${e.source}] ${e.file}${imp}`);
}
