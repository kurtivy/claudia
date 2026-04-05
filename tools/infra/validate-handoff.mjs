#!/usr/bin/env node
/**
 * validate-handoff.mjs — Validates typed handoff format (JSON+markdown hybrid)
 *
 * Usage: node validate-handoff.mjs [path-to-handoff.md]
 * Default: ~/.claudia/schedule/handoff.md
 *
 * Exit codes: 0 = valid, 1 = errors found, 2 = no JSON block found
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const handoffPath = process.argv[2] || resolve(homedir(), '.claudia/schedule/handoff.md');

if (!existsSync(handoffPath)) {
  console.error(`File not found: ${handoffPath}`);
  process.exit(1);
}

const content = readFileSync(handoffPath, 'utf-8');

// Extract JSON block from ---json / --- fences
const jsonMatch = content.match(/^---json\s*\n([\s\S]*?)\n---/m);
if (!jsonMatch) {
  console.log('No ---json block found in handoff. This is a legacy-format handoff.');
  console.log('To migrate: run the Cycle End procedure with typed handoff enabled.');
  process.exit(2);
}

let data;
try {
  data = JSON.parse(jsonMatch[1]);
} catch (e) {
  console.error(`JSON parse error: ${e.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// Schema version check — support both v1 and v2
const schema = data.$schema;
if (!schema) {
  errors.push('Missing required field: $schema');
} else if (!['handoff-v1', 'handoff-v2'].includes(schema)) {
  warnings.push(`Unknown schema version: ${schema}`);
}

if (!data.timestamp) errors.push('Missing required field: timestamp');

if (schema === 'handoff-v2') {
  // v2: tiered goals — persistent[], tasks[], tier_0_contact
  if (!Array.isArray(data.persistent)) {
    errors.push('Missing required field: persistent (array of persistent goals)');
  } else {
    for (const p of data.persistent) {
      if (!p.id) errors.push(`Persistent goal missing 'id': ${JSON.stringify(p).substring(0, 60)}`);
      if (!p.goal) errors.push(`Persistent goal '${p.id || '?'}' missing 'goal'`);
    }
  }

  if (!Array.isArray(data.tasks)) {
    errors.push('Missing required field: tasks (array)');
  } else {
    for (const t of data.tasks) {
      if (!t.action) errors.push('Task missing \'action\' text');
    }
  }

  if (!data.tier_0_contact) {
    warnings.push('No tier_0_contact defined — agent has no fallback when idle');
  }
} else {
  // v1: flat structure — blocked[], initiatives{}, next_actions[]
  const requiredV1 = ['blocked', 'initiatives', 'next_actions'];
  for (const field of requiredV1) {
    if (!(field in data)) errors.push(`Missing required field: ${field}`);
  }

  if (Array.isArray(data.blocked)) {
    for (const item of data.blocked) {
      if (!item.id) errors.push(`Blocked item missing 'id': ${JSON.stringify(item)}`);
      if (!item.since) errors.push(`Blocked item '${item.id || '?'}' missing 'since'`);
      if (typeof item.consecutive_misses !== 'number') {
        errors.push(`Blocked item '${item.id || '?'}' missing 'consecutive_misses'`);
      }
    }
  }

  const validStates = ['active', 'autonomous', 'paused', 'blocked', 'completed'];
  if (data.initiatives && typeof data.initiatives === 'object') {
    for (const [name, init] of Object.entries(data.initiatives)) {
      if (!init.state) errors.push(`Initiative '${name}' missing 'state'`);
      else if (!validStates.includes(init.state)) {
        warnings.push(`Initiative '${name}' has unknown state: '${init.state}'`);
      }
    }
  }

  if (Array.isArray(data.next_actions)) {
    for (const action of data.next_actions) {
      if (typeof action.priority !== 'number') {
        errors.push(`Next action missing 'priority': ${action.action || '?'}`);
      }
      if (!action.action) errors.push(`Next action missing 'action' text`);
    }
  }
}

// Validate kurt_blockers (both versions)
if (data.kurt_blockers && !Array.isArray(data.kurt_blockers)) {
  errors.push('kurt_blockers must be an array');
}

// Output results
if (errors.length === 0 && warnings.length === 0) {
  console.log(`Handoff valid (${schema}).`);

  if (schema === 'handoff-v2') {
    console.log(`  Persistent goals: ${data.persistent?.length || 0}`);
    console.log(`  Tasks: ${data.tasks?.length || 0}`);
    console.log(`  Kurt blockers: ${data.kurt_blockers?.length || 0}`);
  } else {
    const blocked2 = (data.blocked || []).filter(b => b.consecutive_misses >= 2);
    if (blocked2.length > 0) {
      console.log(`\nCircuit breaker: ${blocked2.length} item(s) blocked 2+ cycles:`);
      for (const b of blocked2) {
        console.log(`  - ${b.id}: ${b.reason} (since ${b.since}, ${b.consecutive_misses} misses)`);
      }
    }
  }
  process.exit(0);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error(`  ERROR: ${e}`);
}
if (warnings.length > 0) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  WARN: ${w}`);
}

process.exit(errors.length > 0 ? 1 : 0);
