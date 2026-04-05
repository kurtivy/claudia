#!/usr/bin/env node
// keyword-match.mjs — Match a prompt against keyword-graph.json
// Usage: node keyword-match.mjs "prompt text"
// Outputs: [priming: context -> pointer] lines, max 3

import { readFileSync } from 'fs';
import { join } from 'path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const GRAPH_PATH = join(HOME, '.claudia', 'brain', 'keyword-graph.json');

const prompt = (process.argv[2] || '').toLowerCase();
if (!prompt) process.exit(0);

let graph;
try {
  graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
} catch {
  process.exit(0);
}

const matches = [];
for (const entry of graph) {
  if (matches.length >= 3) break;
  for (const trigger of entry.triggers) {
    if (prompt.includes(trigger.toLowerCase())) {
      matches.push(`[priming: ${entry.context} -> ${entry.pointer}]`);
      break;
    }
  }
}

if (matches.length) process.stdout.write(matches.join('\n') + '\n');
