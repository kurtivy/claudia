#!/usr/bin/env node
// render-status.mjs — Renders agent state as plain English
// Reads: handoff.md (JSON), working-set.json, latest cycle file, brain/keyword-graph.json
// Usage: node render-status.mjs [--json]

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const BASE = join(HOME, '.claudia');
const jsonOutput = process.argv.includes('--json');

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch { return null; }
}

function readHandoff() {
  try {
    const raw = readFileSync(join(BASE, 'schedule', 'handoff.md'), 'utf8');
    const match = raw.match(/---json\s*\n([\s\S]*?)\n---/);
    if (!match) return null;
    return JSON.parse(match[1]);
  } catch { return null; }
}

function getLatestCycleFile() {
  const dir = join(BASE, 'schedule', 'cycles');
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .sort()
      .reverse();
    if (!files.length) return null;
    return { name: files[0], content: readFileSync(join(dir, files[0]), 'utf8') };
  } catch { return null; }
}

function parseObjectives(cycleContent) {
  const objectives = [];
  const lines = cycleContent.split('\n');
  for (const line of lines) {
    const match = line.match(/^- \[([ x])\] (.+)/);
    if (match) {
      objectives.push({ done: match[1] === 'x', text: match[2] });
    }
  }
  return objectives;
}

// Gather data
const handoff = readHandoff();
const workingSet = readJSON(join(BASE, 'brain', 'working-set.json'));
const cycle = getLatestCycleFile();
const keywordGraph = readJSON(join(BASE, 'brain', 'keyword-graph.json'));

if (jsonOutput) {
  console.log(JSON.stringify({
    handoff,
    workingSet,
    cycle: cycle ? { name: cycle.name, objectives: parseObjectives(cycle.content) } : null,
    keywordGraphEntries: keywordGraph?.length || 0,
  }, null, 2));
  process.exit(0);
}

// Plain English output
console.log('=== Claudia Status ===\n');

// Handoff
if (handoff) {
  const ts = new Date(handoff.timestamp);
  console.log(`Last handoff: ${ts.toLocaleString()}`);
  console.log(`Schema: ${handoff.$schema || 'unknown'}\n`);

  if (handoff.tasks?.length) {
    console.log('Current tasks:');
    for (const t of handoff.tasks) {
      console.log(`  ${t.priority || '-'}. ${t.action} [${t.initiative || 'general'}]`);
    }
    console.log();
  } else {
    console.log('No specific tasks queued.\n');
  }

  if (handoff.persistent?.length) {
    console.log('Persistent goals:');
    for (const p of handoff.persistent) {
      console.log(`  - ${p.goal}`);
      if (p.context?.account) console.log(`    Account: ${p.context.account}`);
      if (p.strategy) {
        const short = p.strategy.length > 120 ? p.strategy.slice(0, 117) + '...' : p.strategy;
        console.log(`    Strategy: ${short}`);
      }
    }
    console.log();
  }

  if (handoff.kurt_blockers?.length) {
    console.log('Blockers (need Kurt):');
    for (const b of handoff.kurt_blockers) {
      console.log(`  - ${b}`);
    }
    console.log();
  }
} else {
  console.log('No handoff found.\n');
}

// Cycle
if (cycle) {
  console.log(`Current cycle: ${cycle.name}`);
  const objectives = parseObjectives(cycle.content);
  const done = objectives.filter(o => o.done).length;
  console.log(`Objectives: ${done}/${objectives.length} complete`);
  for (const o of objectives) {
    console.log(`  ${o.done ? '[x]' : '[ ]'} ${o.text.slice(0, 100)}`);
  }
  console.log();
} else {
  console.log('No cycle file found.\n');
}

// Working set
if (workingSet) {
  const sections = ['hot', 'warm', 'cold'];
  for (const section of sections) {
    const items = workingSet[section] || [];
    if (items.length) {
      console.log(`${section.toUpperCase()} (${items.length}):`);
      for (const item of items) {
        console.log(`  - ${item.id}: ${item.summary}`);
      }
      console.log();
    }
  }
} else {
  console.log('No working set found.\n');
}

// Keyword graph summary
if (keywordGraph) {
  console.log(`Keyword graph: ${keywordGraph.length} routing rules`);
}
