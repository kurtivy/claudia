#!/usr/bin/env node
// find-qrt-candidates.mjs — Search for quote-RT candidates about trader pain points
// Usage: node find-qrt-candidates.mjs [--telegram]
//
// Searches Twitter via authenticated Chrome DevTools MCP for high-engagement
// posts about trader losses, pain points, and market frustration.
// Outputs formatted candidates. With --telegram, sends to Kurt.
//
// Designed to be called by cron every ~2 hours during active sessions.
// Requires Chrome DevTools MCP connection to x.com (authenticated).

const SEARCH_QUERIES = [
  '"most traders lose" OR "traders lose money"',
  '"96% of traders" OR "liquidated in the past 24"',
  '"why traders fail" OR "retail traders lose"',
  '"trading is hard" crypto OR solana',
];

const TELEGRAM_CHAT_ID = '1578553327';
const TELEGRAM_BOT_TOKEN = '8307181118:AAEoJG0S20FOan9fkicl0IGDO2Ab0Tb4hq8';

const sendTelegram = process.argv.includes('--telegram');

// This script is a template/reference for the engagement workflow.
// Actual execution happens through Claude's MCP tools.
//
// Workflow:
// 1. Navigate to x.com/search?q=<query>&f=top
// 2. Take snapshot, parse articles for engagement metrics
// 3. Filter: >50 likes, <48h old, topic = trader losses/pain
// 4. Format top 2-3 as QRT suggestions
// 5. Send to Kurt via Telegram if --telegram
//
// Search rotation (cycle through one per call):
// - "most traders lose" OR "traders lose money"
// - "96% of traders" OR "liquidated in the past 24"
// - "why traders fail" OR "retail traders lose"
// - "trading is hard" crypto OR solana
//
// QRT angle for Kurt (@signalgamefun):
// "we want to make this better" — empathy + Signal Game positioning
// Bot handles entry, player handles exit. 30-min sessions.
// Only charge fee on profitable trades (5% on wins).

console.log('QRT Candidate Finder');
console.log('====================');
console.log('');
console.log('Search queries to rotate:');
for (const q of SEARCH_QUERIES) {
  const encoded = encodeURIComponent(q);
  console.log(`  https://x.com/search?q=${encoded}&f=top`);
}
console.log('');
console.log('Filter criteria:');
console.log('  - >50 likes');
console.log('  - Posted within 48 hours');
console.log('  - Topic: trader losses, liquidations, market pain');
console.log('  - Preference: Solana ecosystem, meme coins, crypto trading');
console.log('');
console.log('QRT angle: "we want to make this better"');
console.log('  - Empathize with the pain');
console.log('  - Position Signal Game as aligned-incentive alternative');
console.log('  - Bot handles entry, player handles exit');
console.log('  - Fee only on profitable trades (5%)');
console.log('');

if (sendTelegram) {
  console.log('Would send formatted candidates to Telegram.');
  console.log(`Chat ID: ${TELEGRAM_CHAT_ID}`);
} else {
  console.log('Run with --telegram to send results to Kurt.');
}
