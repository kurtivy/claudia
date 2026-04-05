#!/usr/bin/env node
// reply-patterns.mjs — Analyze reply engagement patterns from JSONL log
// Usage: node reply-patterns.mjs [--min-views=N] [--top=N]
//
// Reads engagement-log.jsonl, extracts reply characteristics, and reports
// which patterns correlate with higher views. Helps decide what to reply to
// and how to write replies.

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = join(__dirname, '..', '..', 'schedule', 'initiatives', 'grow-twitter', 'engagement-log.jsonl');

const args = process.argv.slice(2);
const minViewsArg = args.find(a => a.startsWith('--min-views='));
const topArg = args.find(a => a.startsWith('--top='));
const minViews = minViewsArg ? parseInt(minViewsArg.split('=')[1]) : 0;
const topN = topArg ? parseInt(topArg.split('=')[1]) : 10;

if (!existsSync(LOG_PATH)) {
  console.error(`No engagement log found at ${LOG_PATH}`);
  console.error('Run engagement-log.mjs first to build the dataset.');
  process.exit(1);
}

const lines = readFileSync(LOG_PATH, 'utf-8').trim().split('\n').filter(Boolean);
const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// Flatten all tweets across snapshots, dedup by text (keep highest views)
const tweetMap = new Map();
for (const entry of entries) {
  for (const tweet of (entry.tweets || [])) {
    const key = tweet.text?.slice(0, 80);
    if (!key) continue;
    const existing = tweetMap.get(key);
    if (!existing || (tweet.views || 0) > (existing.views || 0)) {
      tweetMap.set(key, { ...tweet, snapshot_ts: entry.timestamp });
    }
  }
}

const tweets = [...tweetMap.values()].filter(t => (t.views || 0) >= minViews);

if (tweets.length === 0) {
  console.log('No tweets found matching criteria.');
  process.exit(0);
}

// Classify each tweet
function classify(tweet) {
  const text = (tweet.text || '').toLowerCase();
  const len = text.length;
  return {
    is_reply: tweet.isReply || false,
    is_standalone: !tweet.isReply,
    char_length: len,
    is_short: len <= 100,
    is_medium: len > 100 && len <= 200,
    is_long: len > 200,
    has_question: text.includes('?'),
    has_humor: /lmao|lol|imagine|literally|genuinely|bruh|rip|dead/i.test(text),
    has_opinion: /honestly|actually|the real|the problem|interesting|wild/i.test(text),
    has_token: /\$[A-Z]{2,}/i.test(text),
    has_link: /https?:\/\//i.test(text),
    has_numbers: /\d{3,}/.test(text),
    views: tweet.views || 0,
    likes: tweet.likes || 0,
    replies: tweet.replies || 0,
    retweets: tweet.retweets || 0,
  };
}

const classified = tweets.map(t => ({ ...classify(t), text: t.text?.slice(0, 80) }));

// Pattern analysis
function analyzePattern(label, filterFn) {
  const matching = classified.filter(filterFn);
  if (matching.length === 0) return null;
  const avgViews = matching.reduce((s, t) => s + t.views, 0) / matching.length;
  const medViews = matching.sort((a, b) => a.views - b.views)[Math.floor(matching.length / 2)]?.views || 0;
  const avgLikes = matching.reduce((s, t) => s + t.likes, 0) / matching.length;
  return { label, count: matching.length, avgViews: Math.round(avgViews), medViews, avgLikes: Math.round(avgLikes * 10) / 10 };
}

const patterns = [
  analyzePattern('All tweets', () => true),
  analyzePattern('Replies only', t => t.is_reply),
  analyzePattern('Standalone', t => t.is_standalone),
  analyzePattern('Short (<=100 chars)', t => t.is_short),
  analyzePattern('Medium (101-200)', t => t.is_medium),
  analyzePattern('Long (201+)', t => t.is_long),
  analyzePattern('Has humor words', t => t.has_humor),
  analyzePattern('Has opinion words', t => t.has_opinion),
  analyzePattern('Has question', t => t.has_question),
  analyzePattern('Has $TOKEN', t => t.has_token),
  analyzePattern('Has numbers', t => t.has_numbers),
  analyzePattern('Has link', t => t.has_link),
].filter(Boolean);

console.log('\n=== Reply Pattern Analysis ===\n');
console.log('Pattern'.padEnd(25) + 'Count'.padStart(6) + 'Avg Views'.padStart(12) + 'Med Views'.padStart(12) + 'Avg Likes'.padStart(12));
console.log('-'.repeat(67));
for (const p of patterns) {
  console.log(
    p.label.padEnd(25) +
    String(p.count).padStart(6) +
    String(p.avgViews).padStart(12) +
    String(p.medViews).padStart(12) +
    String(p.avgLikes).padStart(12)
  );
}

// Top performers
console.log(`\n=== Top ${topN} by Views ===\n`);
const sorted = classified.sort((a, b) => b.views - a.views).slice(0, topN);
for (const t of sorted) {
  const flags = [
    t.is_reply ? 'reply' : 'standalone',
    t.is_short ? 'short' : t.is_medium ? 'med' : 'long',
    t.has_humor ? 'humor' : null,
    t.has_opinion ? 'opinion' : null,
    t.has_token ? 'token' : null,
  ].filter(Boolean).join(', ');
  console.log(`${String(t.views).padStart(6)} views | ${flags.padEnd(30)} | ${t.text}...`);
}

console.log('\n=== Insights ===\n');
const replyAvg = patterns.find(p => p.label === 'Replies only')?.avgViews || 0;
const standaloneAvg = patterns.find(p => p.label === 'Standalone')?.avgViews || 0;
if (replyAvg > standaloneAvg) console.log(`Replies avg ${replyAvg} views vs standalone ${standaloneAvg} — reply strategy confirmed.`);
else if (standaloneAvg > 0) console.log(`Standalone avg ${standaloneAvg} views vs replies ${replyAvg} — unusual.`);

const humorAvg = patterns.find(p => p.label === 'Has humor words')?.avgViews || 0;
const allAvg = patterns.find(p => p.label === 'All tweets')?.avgViews || 0;
if (humorAvg > allAvg * 1.2) console.log(`Humor replies avg ${humorAvg} views — ${Math.round((humorAvg / allAvg - 1) * 100)}% above average. Keep it funny.`);

const tokenAvg = patterns.find(p => p.label === 'Has $TOKEN')?.avgViews || 0;
if (tokenAvg < allAvg * 0.5 && tokenAvg > 0) console.log(`$TOKEN mentions avg ${tokenAvg} views — ${Math.round((1 - tokenAvg / allAvg) * 100)}% below average. Stop shilling in replies.`);
