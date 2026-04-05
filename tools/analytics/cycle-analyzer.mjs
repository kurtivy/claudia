#!/usr/bin/env node
/**
 * cycle-analyzer.mjs — Analyze cycle history for patterns
 *
 * Usage: node cycle-analyzer.mjs [--days N] [--json]
 *
 * Reads all cycle files, extracts objectives (hit/miss), friction entries,
 * and tools built. Reports hit rate, common blockers, and trends.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CYCLES_DIR = join(homedir(), '.claudia/schedule/cycles');
const args = process.argv.slice(2);
const daysBack = parseInt(args.find(a => a.startsWith('--days'))?.split('=')[1] || args[args.indexOf('--days') + 1] || '7');
const jsonOut = args.includes('--json');

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - daysBack);

// Read all cycle files
const files = readdirSync(CYCLES_DIR)
  .filter(f => f.endsWith('.md') && !f.startsWith('_'))
  .sort();

const cycles = [];

for (const file of files) {
  // Extract date from filename (YYYY-MM-DD)
  const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch) continue;
  const fileDate = new Date(dateMatch[1] + 'T00:00:00');
  if (fileDate < cutoff) continue;

  const content = readFileSync(join(CYCLES_DIR, file), 'utf-8');
  const lines = content.split('\n');

  const cycle = {
    file,
    date: dateMatch[1],
    objectives: { hit: [], miss: [] },
    toolsBuilt: [],
    friction: [],
    patterns: []
  };

  let section = '';
  for (const line of lines) {
    // Track sections
    if (line.startsWith('## ')) {
      section = line.replace('## ', '').trim().toLowerCase();
      continue;
    }

    // Parse objectives
    if (section === 'objectives' || section === 'objectives review') {
      const hitMatch = line.match(/^- \[x\]\s+(.+)/i);
      const missMatch = line.match(/^- \[ \]\s+(.+)/i);
      if (hitMatch) cycle.objectives.hit.push(hitMatch[1].split(' -- ')[0].split(' — ')[0].trim());
      if (missMatch) cycle.objectives.miss.push(missMatch[1].split(' -- ')[0].split(' — ')[0].trim());
    }

    // Parse actions for tools built
    if (section === 'actions taken' && /\bBUILT\b/i.test(line)) {
      cycle.toolsBuilt.push(line.replace(/^- /, '').trim());
    }

    // Parse friction
    if (section === 'friction logged' && line.startsWith('- ')) {
      cycle.friction.push(line.replace(/^- /, '').trim());
    }

    // Parse patterns
    if (section === 'patterns' && line.startsWith('- ')) {
      cycle.patterns.push(line.replace(/^- /, '').trim());
    }
  }

  cycles.push(cycle);
}

// Aggregate stats
const totalHits = cycles.reduce((s, c) => s + c.objectives.hit.length, 0);
const totalMisses = cycles.reduce((s, c) => s + c.objectives.miss.length, 0);
const totalObjectives = totalHits + totalMisses;
const hitRate = totalObjectives > 0 ? (totalHits / totalObjectives * 100).toFixed(1) : 0;

const totalTools = cycles.reduce((s, c) => s + c.toolsBuilt.length, 0);
const totalFriction = cycles.reduce((s, c) => s + c.friction.length, 0);

// Categorize misses
const missReasons = {};
for (const c of cycles) {
  for (const m of c.objectives.miss) {
    const lower = m.toLowerCase();
    let reason = 'other';
    if (/blocked|mcp|paid|install/i.test(lower)) reason = 'blocked-dependency';
    else if (/cancel|skip|paused/i.test(lower)) reason = 'cancelled';
    else if (/time|ran out|context/i.test(lower)) reason = 'ran-out-of-time';
    else if (/chrome|cdp|browser/i.test(lower)) reason = 'browser-issue';
    missReasons[reason] = (missReasons[reason] || 0) + 1;
  }
}

// Daily breakdown
const dailyStats = {};
for (const c of cycles) {
  if (!dailyStats[c.date]) dailyStats[c.date] = { cycles: 0, hits: 0, misses: 0, tools: 0 };
  dailyStats[c.date].cycles++;
  dailyStats[c.date].hits += c.objectives.hit.length;
  dailyStats[c.date].misses += c.objectives.miss.length;
  dailyStats[c.date].tools += c.toolsBuilt.length;
}

if (jsonOut) {
  console.log(JSON.stringify({
    period: `${daysBack} days`,
    cycles: cycles.length,
    objectives: { total: totalObjectives, hits: totalHits, misses: totalMisses, hitRate: parseFloat(hitRate) },
    missReasons,
    toolsBuilt: totalTools,
    frictionEntries: totalFriction,
    dailyStats,
    recentMisses: cycles.slice(-5).flatMap(c => c.objectives.miss).slice(-10)
  }, null, 2));
} else {
  console.log(`Cycle Analysis (last ${daysBack} days)`);
  console.log('='.repeat(50));
  console.log(`Cycles: ${cycles.length}`);
  console.log(`Objectives: ${totalObjectives} (${totalHits} hit, ${totalMisses} missed)`);
  console.log(`Hit rate: ${hitRate}%`);
  console.log(`Tools built: ${totalTools}`);
  console.log(`Friction entries: ${totalFriction}`);
  console.log('');

  if (Object.keys(missReasons).length > 0) {
    console.log('Miss reasons:');
    for (const [reason, count] of Object.entries(missReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
    console.log('');
  }

  console.log('Daily breakdown:');
  for (const [date, s] of Object.entries(dailyStats).sort()) {
    const dr = s.hits + s.misses > 0 ? (s.hits / (s.hits + s.misses) * 100).toFixed(0) : '-';
    console.log(`  ${date}: ${s.cycles} cycles, ${s.hits}/${s.hits + s.misses} objectives (${dr}%), ${s.tools} tools`);
  }

  const recentMisses = cycles.slice(-5).flatMap(c => c.objectives.miss);
  if (recentMisses.length > 0) {
    console.log('');
    console.log('Recent misses:');
    for (const m of recentMisses.slice(-5)) {
      console.log(`  - ${m.substring(0, 100)}`);
    }
  }
}
