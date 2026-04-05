#!/usr/bin/env node
// brain-audit.mjs — 5-cycle brain health audit
// Runs at cycle-end (tidy step). Evaluates continuity artifacts.
// Self-destructs after 5 cycles by clearing the counter and reporting done.
//
// Usage: node brain-audit.mjs
// Outputs: evaluation prompt for the agent (or nothing if audit is complete)

import fs from 'fs';
import path from 'path';

const CLAUDIA_HOME = process.env.HOME
  ? path.join(process.env.HOME, '.claudia')
  : 'C:/Users/kurtw/.claudia';

const COUNTER_FILE = path.join(CLAUDIA_HOME, '.brain-audit-cycle');
const REPORT_FILE = path.join(CLAUDIA_HOME, 'schedule', 'brain-audit-report.md');
const CYCLES_DIR = path.join(CLAUDIA_HOME, 'schedule', 'cycles');
const MEMORIES_DIR = path.join(CLAUDIA_HOME, 'memories', 'entries');
const HANDOFF_FILE = path.join(CLAUDIA_HOME, 'schedule', 'handoff.md');
const WORKING_SET = path.join(CLAUDIA_HOME, 'brain', 'working-set.json');
const KEYWORD_GRAPH = path.join(CLAUDIA_HOME, 'brain', 'keyword-graph.json');
const WORKSHOP = path.join(CLAUDIA_HOME, 'tools', 'workshop', 'opportunities.md');

// --- Counter ---
let cycle = 1;
if (fs.existsSync(COUNTER_FILE)) {
  cycle = parseInt(fs.readFileSync(COUNTER_FILE, 'utf8').trim(), 10) + 1;
}

if (cycle > 5) {
  // Audit complete — output nothing, stay silent
  process.exit(0);
}

// --- Gather metrics ---
const today = new Date().toISOString().slice(0, 10);
const now = new Date().toLocaleTimeString('en-US', { hour12: true, timeZone: 'America/Denver' });

// Find today's cycle file(s)
const cycleFiles = fs.existsSync(CYCLES_DIR)
  ? fs.readdirSync(CYCLES_DIR).filter(f => f.startsWith(today) && f.endsWith('.md') && !f.startsWith('_'))
  : [];

// Count today's memory entries
const todayMemories = fs.existsSync(MEMORIES_DIR)
  ? fs.readdirSync(MEMORIES_DIR).filter(f => f.startsWith(today)).length
  : 0;

// Check handoff exists and has JSON block
let handoffExists = fs.existsSync(HANDOFF_FILE);
let handoffHasJson = false;
let handoffLines = 0;
let handoffHasNextActions = false;
if (handoffExists) {
  const content = fs.readFileSync(HANDOFF_FILE, 'utf8');
  handoffHasJson = content.includes('---json');
  handoffLines = content.split('\n').length;
  handoffHasNextActions = content.includes('next_actions');
}

// Check brain files
let workingSetItems = 0;
let workingSetHot = 0;
if (fs.existsSync(WORKING_SET)) {
  try {
    const ws = JSON.parse(fs.readFileSync(WORKING_SET, 'utf8'));
    workingSetHot = ws.hot?.length || 0;
    workingSetItems = workingSetHot + (ws.warm?.length || 0) + (ws.cold?.length || 0);
  } catch {}
}

let keywordGraphEntries = 0;
if (fs.existsSync(KEYWORD_GRAPH)) {
  try {
    const kg = JSON.parse(fs.readFileSync(KEYWORD_GRAPH, 'utf8'));
    keywordGraphEntries = Array.isArray(kg) ? kg.length : 0;
  } catch {}
}

// Check cycle file completeness
let cycleFileComplete = false;
let cycleHasObjectives = false;
let cycleHasActions = false;
let cycleHasReview = false;
let cycleHasFriction = false;
if (cycleFiles.length > 0) {
  const latest = fs.readFileSync(path.join(CYCLES_DIR, cycleFiles[cycleFiles.length - 1]), 'utf8');
  cycleHasObjectives = /\[x\]/.test(latest) || /\[~\]/.test(latest);
  cycleHasActions = latest.includes('## Actions Taken') && latest.split('## Actions Taken')[1]?.trim().length > 10;
  cycleHasReview = latest.includes('## Objectives Review');
  cycleHasFriction = latest.includes('## Friction Logged');
  cycleFileComplete = cycleHasObjectives && cycleHasActions;
}

// Workshop: check for blocked_touches
let workshopBlockedCount = 0;
if (fs.existsSync(WORKSHOP)) {
  const wContent = fs.readFileSync(WORKSHOP, 'utf8');
  workshopBlockedCount = (wContent.match(/blocked_touches/g) || []).length;
}

// --- Build metrics object ---
const metrics = {
  cycle_number: cycle,
  timestamp: `${today} ${now}`,
  cycle_files_today: cycleFiles.length,
  cycle_file_has_checked_objectives: cycleHasObjectives,
  cycle_file_has_actions_logged: cycleHasActions,
  memories_written_today: todayMemories,
  handoff_exists: handoffExists,
  handoff_typed_json: handoffHasJson,
  handoff_has_next_actions: handoffHasNextActions,
  handoff_lines: handoffLines,
  working_set_items: workingSetItems,
  keyword_graph_entries: keywordGraphEntries,
  workshop_blocked_tracked: workshopBlockedCount,
};

// --- Append to report ---
const separator = cycle === 1 ? `# Brain Audit Report\n_5-cycle evaluation of continuity health_\n\n` : '';
const entry = `## Cycle ${cycle}/5 — ${metrics.timestamp}

| Metric | Value |
|--------|-------|
| Cycle files today | ${metrics.cycle_files_today} |
| Objectives checked off | ${metrics.cycle_file_has_checked_objectives ? 'yes' : 'NO'} |
| Actions logged in cycle file | ${metrics.cycle_file_has_actions_logged ? 'yes' : 'NO'} |
| Memories written today | ${metrics.memories_written_today} |
| Handoff exists | ${metrics.handoff_exists ? 'yes' : 'NO'} |
| Handoff typed JSON | ${metrics.handoff_typed_json ? 'yes' : 'NO'} |
| Handoff has next_actions | ${metrics.handoff_has_next_actions ? 'yes' : 'NO'} |
| Handoff line count | ${metrics.handoff_lines} |
| Working-set lines | ${metrics.working_set_lines} |
| Keyword-graph entries | ${metrics.keyword_graph_entries} |
| Workshop blocked items tracked | ${metrics.workshop_blocked_tracked} |

### Agent Evaluation
_Fill this in during tidy step — score each dimension 1-5:_

- **Adherence to procedure**: _/5 — did the cycle follow boot→work→tidy? were crons set and fired?_
- **Track-laying**: _/5 — are memories scoped? do they capture non-obvious learnings? are there enough?_
- **Continuity injection**: _/5 — will the next agent pick up cleanly? is the handoff specific enough? do next_actions have resume_context?_
- **Token efficiency**: _/5 — was work done or were tokens spent on overhead? ratio of productive actions to maintenance?_
- **Notes**: _anything unusual this cycle_

`;

fs.appendFileSync(REPORT_FILE, separator + entry);

// --- Update counter ---
fs.writeFileSync(COUNTER_FILE, String(cycle));

// --- Output prompt for agent ---
if (cycle < 5) {
  console.log(`--- BRAIN AUDIT (cycle ${cycle}/5) ---`);
  console.log(`Metrics collected and appended to schedule/brain-audit-report.md.`);
  console.log(`Open that file and fill in the "Agent Evaluation" section for cycle ${cycle}.`);
  console.log(`Score each dimension 1-5 with a brief justification. Be honest — this data is for Kurt.`);
  console.log(`Do NOT read previous cycles' evaluations. Evaluate this cycle in isolation.`);
  console.log(`---`);
} else {
  console.log(`--- BRAIN AUDIT (cycle 5/5 — FINAL) ---`);
  console.log(`This is the last audit cycle. Do all of the following:`);
  console.log(`1. Fill in cycle 5 evaluation in schedule/brain-audit-report.md`);
  console.log(`2. Read ALL 5 evaluations in the report`);
  console.log(`3. Write a summary section at the bottom: trends, what improved, what degraded, recommendations`);
  console.log(`4. Send the summary to Kurt on Telegram (chat_id: 1578553327)`);
  console.log(`5. Delete ${COUNTER_FILE} and remove the brain-audit step from infra/procedures/cycle-end.md`);
  console.log(`---`);
}
