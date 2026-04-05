#!/usr/bin/env node
/**
 * write-handoff.mjs — Generates typed JSON handoff file (v2)
 *
 * Usage: node write-handoff.mjs --cycle-file=<path> [--dry-run]
 *
 * Reads the current handoff.md to carry forward persistent goals.
 * Accepts tiered goal data via stdin (JSON).
 *
 * stdin JSON schema (v2):
 * {
 *   "persistent": [ { "id": "...", "goal": "...", "strategy": "...", "tools": "...", "context": {} } ],
 *   "tasks": [ { "action": "...", "priority": 1, "initiative": "..." } ],
 *   "tier_0_contact": { "method": "telegram", "chat_id": "...", "name": "..." },
 *   "kurt_blockers": [ { "text": "...", "stale_cycles": 0 } ],
 *   "notes": "..."
 * }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const HOME = homedir();
const CLAUDIA_HOME = resolve(HOME, '.claudia');
const HANDOFF_PATH = resolve(CLAUDIA_HOME, 'schedule/handoff.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
let cycleFile = '';
for (const a of args) {
  if (a.startsWith('--cycle-file=')) cycleFile = a.split('=').slice(1).join('=');
}

// Read stdin
let input = '';
try {
  input = readFileSync(0, 'utf-8');
} catch {}

let data;
try {
  data = JSON.parse(input);
} catch {
  console.error('Expected JSON on stdin. Pipe the handoff data.');
  console.error('Example: echo \'{"what_happened":"...","initiatives":{},"next_actions":[]}\' | node write-handoff.mjs');
  process.exit(1);
}

// Load previous handoff to carry forward persistent goals and blocker counts
let prevPersistent = [];
let prevTier0 = null;
let prevBlockers = [];
if (existsSync(HANDOFF_PATH)) {
  const prev = readFileSync(HANDOFF_PATH, 'utf-8');
  const jsonMatch = prev.match(/^---json\s*\n([\s\S]*?)\n---/m);
  if (jsonMatch) {
    try {
      const prevData = JSON.parse(jsonMatch[1]);
      prevPersistent = prevData.persistent || [];
      prevTier0 = prevData.tier_0_contact || null;
      prevBlockers = prevData.kurt_blockers || [];
    } catch {}
  }
}

// Merge persistent goals: input overrides previous by id, previous carried forward if not in input
const inputPersistent = data.persistent || [];
const inputIds = new Set(inputPersistent.map(p => p.id));
const persistent = [
  ...inputPersistent,
  ...prevPersistent.filter(p => !inputIds.has(p.id))
];

// Merge blockers: increment stale_cycles for carried-forward items, auto-delete at 4
function mergeBlockers(inputBlockers, prevBlockers) {
  // Normalize: input can be strings or objects
  const normalize = (b) => typeof b === 'string' ? { text: b, stale_cycles: 0 } : b;
  const input = inputBlockers.map(normalize);
  const prev = prevBlockers.map(normalize);

  // Build lookup of previous blockers by text
  const prevMap = new Map(prev.map(b => [b.text, b]));

  const merged = [];
  for (const b of input) {
    const existing = prevMap.get(b.text);
    if (existing) {
      // Carried forward — increment counter
      const cycles = (existing.stale_cycles || 0) + 1;
      if (cycles < 4) {
        merged.push({ text: b.text, stale_cycles: cycles });
      }
      // cycles >= 4: auto-deleted, don't include
    } else {
      // New blocker
      merged.push({ text: b.text, stale_cycles: 0 });
    }
  }
  return merged;
}

// Build the JSON block
const now = new Date();
const timestamp = now.toISOString();

const handoffJson = {
  $schema: 'handoff-v2',
  timestamp,
  cycle_file: cycleFile || null,
  persistent,
  tasks: (data.tasks || []).map((t, i) => ({
    action: t.action,
    priority: t.priority || i + 1,
    initiative: t.initiative || null,
    resume_context: t.resume_context || null
  })),
  tier_0_contact: data.tier_0_contact || prevTier0 || {
    method: 'telegram',
    chat_id: '1578553327',
    name: 'Kurt'
  },
  kurt_blockers: mergeBlockers(data.kurt_blockers || [], prevBlockers),
  notes: data.notes || null
};

const output = `---json\n${JSON.stringify(handoffJson, null, 2)}\n---\n`;

if (dryRun) {
  console.log(output);
  console.log('\n--- Validation ---');
  // Validate inline
  const errors = [];
  if (!handoffJson.timestamp) errors.push('Missing timestamp');
  if (!Array.isArray(handoffJson.kurt_blockers)) errors.push('kurt_blockers must be array');
  for (const b of (handoffJson.kurt_blockers || [])) {
    if (!b.text) errors.push('Blocker missing text');
    if (typeof b.stale_cycles !== 'number') errors.push(`Blocker "${b.text}" missing stale_cycles`);
  }
  if (!Array.isArray(handoffJson.tasks)) errors.push('tasks must be array');
  if (!Array.isArray(handoffJson.persistent)) errors.push('persistent must be array');
  console.log(errors.length === 0 ? 'Valid.' : errors.join('\n'));
} else {
  writeFileSync(HANDOFF_PATH, output);
  console.log(`Handoff written to ${HANDOFF_PATH}`);

  // Run validator
  const validatorPath = resolve(CLAUDIA_HOME, 'tools/infra/validate-handoff.mjs');
  if (existsSync(validatorPath)) {
    try {
      const result = execSync(`node "${validatorPath}"`, { encoding: 'utf8', timeout: 5000 });
      console.log(result);
    } catch (e) {
      console.error('Validation issues:', e.stdout || e.message);
    }
  }
}
