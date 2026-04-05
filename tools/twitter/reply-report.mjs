#!/usr/bin/env node
// reply-report.mjs — Analyze reply engagement data and compare time periods
// Usage: node reply-report.mjs                         # Full report
//        node reply-report.mjs --compare               # Overnight vs daytime comparison
//        node reply-report.mjs --since 24              # Only last N hours
//        node reply-report.mjs --json                  # JSON output
//
// Reads from: tools/twitter/reply-engagement.jsonl
// Also reads: schedule/initiatives/grow-twitter/reply-log.jsonl (if exists)

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGAGEMENT_LOG = join(__dirname, 'reply-engagement.jsonl');
const REPLY_LOG = join(__dirname, '..', '..', 'schedule', 'initiatives', 'grow-twitter', 'reply-log.jsonl');

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function classifyTime(ts) {
  const d = new Date(ts);
  const hour = d.getHours();
  // MDT offset: UTC-6. If timestamp is UTC, adjust
  const localHour = d.getTimezoneOffset() === 0 ? (hour - 6 + 24) % 24 : hour;

  if (localHour >= 7 && localHour < 12) return 'morning-peak';    // 7 AM - 12 PM
  if (localHour >= 12 && localHour < 17) return 'afternoon';       // 12 PM - 5 PM
  if (localHour >= 17 && localHour < 21) return 'evening';         // 5 PM - 9 PM
  return 'overnight';                                               // 9 PM - 7 AM
}

function stats(entries) {
  if (entries.length === 0) return { count: 0, avgViews: 0, avgLikes: 0, avgReplies: 0, totalViews: 0, maxViews: 0 };
  const views = entries.map(e => e.views || 0);
  const likes = entries.map(e => e.likes || 0);
  const replies = entries.map(e => e.replies || 0);
  return {
    count: entries.length,
    avgViews: +(views.reduce((a, b) => a + b, 0) / entries.length).toFixed(1),
    avgLikes: +(likes.reduce((a, b) => a + b, 0) / entries.length).toFixed(1),
    avgReplies: +(replies.reduce((a, b) => a + b, 0) / entries.length).toFixed(1),
    totalViews: views.reduce((a, b) => a + b, 0),
    maxViews: Math.max(...views),
    medianViews: views.sort((a, b) => a - b)[Math.floor(views.length / 2)]
  };
}

function generateReport(entries, compareMode = false, sinceHours = null) {
  let filtered = entries;
  if (sinceHours) {
    const cutoff = Date.now() - sinceHours * 3600000;
    filtered = entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
  }

  if (filtered.length === 0) {
    return { summary: 'No engagement data found.', periods: {}, entries: [] };
  }

  // Group by time period
  const groups = {};
  for (const entry of filtered) {
    const period = classifyTime(entry.timestamp);
    if (!groups[period]) groups[period] = [];
    groups[period].push(entry);
  }

  const periodStats = {};
  for (const [period, entries] of Object.entries(groups)) {
    periodStats[period] = stats(entries);
  }

  // Overall stats
  const overall = stats(filtered);

  // Top performers
  const top = [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);

  return {
    overall,
    periods: periodStats,
    top,
    dateRange: {
      from: filtered[0].timestamp,
      to: filtered[filtered.length - 1].timestamp
    }
  };
}

function printReport(report, compareMode) {
  console.log(`\n=== Reply Engagement Report ===`);
  console.log(`Data: ${report.overall.count} replies`);
  if (report.dateRange) {
    console.log(`Range: ${new Date(report.dateRange.from).toLocaleString()} → ${new Date(report.dateRange.to).toLocaleString()}`);
  }

  console.log(`\n--- Overall ---`);
  console.log(`  Avg views: ${report.overall.avgViews} | Median: ${report.overall.medianViews} | Max: ${report.overall.maxViews}`);
  console.log(`  Avg likes: ${report.overall.avgLikes} | Avg replies: ${report.overall.avgReplies}`);
  console.log(`  Total views: ${report.overall.totalViews}`);

  if (Object.keys(report.periods).length > 1 || compareMode) {
    console.log(`\n--- By Time Period ---`);
    const order = ['morning-peak', 'afternoon', 'evening', 'overnight'];
    for (const period of order) {
      const s = report.periods[period];
      if (!s) continue;
      const bar = '█'.repeat(Math.min(20, Math.round(s.avgViews)));
      console.log(`  ${period.padEnd(14)} | ${s.count} replies | avg ${s.avgViews} views ${bar} | ${s.avgLikes} likes`);
    }

    // Comparison insight
    const morning = report.periods['morning-peak'];
    const overnight = report.periods['overnight'];
    if (morning && overnight) {
      const ratio = morning.avgViews / Math.max(overnight.avgViews, 0.1);
      console.log(`\n  Daytime vs Overnight: ${ratio.toFixed(1)}x more views in morning-peak`);
      if (ratio > 2) console.log(`  → Daytime strategy VALIDATED. Morning posts get significantly more reach.`);
      else if (ratio > 1.2) console.log(`  → Slight daytime advantage. More data needed.`);
      else console.log(`  → No significant difference yet. Need more data points.`);
    }
  }

  if (report.top.length > 0) {
    console.log(`\n--- Top 5 Replies ---`);
    for (const t of report.top) {
      const text = (t.tweetText || '').substring(0, 70);
      console.log(`  ${t.views} views | ${t.likes} likes | ${text}...`);
      console.log(`  ${t.url}`);
    }
  }
}

// Main
const args = process.argv.slice(2);
const compareMode = args.includes('--compare');
const jsonMode = args.includes('--json');
const sinceIdx = args.indexOf('--since');
const sinceHours = sinceIdx !== -1 ? parseInt(args[sinceIdx + 1]) || 24 : null;

const entries = loadJsonl(ENGAGEMENT_LOG);
const report = generateReport(entries, compareMode, sinceHours);

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report, compareMode);
}
