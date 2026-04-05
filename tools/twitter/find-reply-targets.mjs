#!/usr/bin/env node
// find-reply-targets.mjs — Find high-engagement tweets to reply to
// Usage: node find-reply-targets.mjs [--topic "pump.fun agents"] [--output targets.json]
//
// Parses Twitter search results from Chrome DevTools snapshots
// to identify threads worth engaging with. Designed to be called
// from the twitter-autopilot skill or standalone.
//
// Input: Chrome DevTools snapshot of Twitter search results (stdin or file)
// Output: Ranked list of reply targets with context

import { readFileSync, writeFileSync } from 'fs';

const TOPICS = [
  'pump.fun agent',
  'Solana AI agent',
  'tokenized agent',
  'on-chain agent identity',
  'agent payments crypto',
  'MCP AI agent',
  'ElizaOS',
  'x402 payments',
  // Promo targets
  'Telegram community management',
  'Telegram too many chats',
  'crypto signals accountability',
  'Telegram CRM',
  'crypto community engagement',
  'signal quality tracking',
];

// Engagement signals that indicate a thread worth joining
const HIGH_VALUE_SIGNALS = {
  minLikes: 5,         // Thread has some traction
  minReplies: 3,       // Conversation happening
  hasQuestion: true,    // Open-ended discussion
  isRecent: true,       // Within 24h
};

function parseSearchTopic() {
  const topicArg = process.argv.indexOf('--topic');
  if (topicArg !== -1 && process.argv[topicArg + 1]) {
    return process.argv[topicArg + 1];
  }
  // Rotate through topics based on hour of day
  const hour = new Date().getHours();
  return TOPICS[hour % TOPICS.length];
}

function generateSearchQueries(topic) {
  return [
    `"${topic}" min_faves:5`,
    `"${topic}" min_replies:3`,
    `"${topic}" filter:has_engagement`,
  ];
}

function formatInstructions(topic, queries) {
  return {
    topic,
    searchQueries: queries,
    chromeSteps: [
      `Navigate to x.com/search (or use sidebar search)`,
      `Search: ${queries[0]}`,
      `Switch to "Latest" tab for recency`,
      `Take snapshot — parse for reply targets`,
      `Look for: question tweets, debate threads, data claims to challenge`,
    ],
    replyGuidelines: [
      'Add data or a specific claim — not "interesting point"',
      'Reference something specific from their tweet',
      'Keep under 200 chars (leave room for engagement)',
      'Weave in agent/tokenized identity angle where natural',
      'If they made a data claim, verify or counter it',
      'Ask a follow-up question to extend the thread',
    ],
    avoid: [
      'Generic agreement ("great thread!", "this is so true")',
      'Self-promotion without adding value first',
      'Replying to accounts with < 100 followers (low visibility)',
      'Threads older than 48 hours (dead engagement)',
    ],
    engagementTiers: {
      tier1: 'Accounts with 10K+ followers in AI/crypto — prioritize these',
      tier2: 'Accounts with 1K-10K followers with active threads',
      tier3: 'Any thread with 10+ replies (conversation in progress)',
    },
  };
}

function main() {
  const topic = parseSearchTopic();
  const queries = generateSearchQueries(topic);
  const instructions = formatInstructions(topic, queries);

  const outputArg = process.argv.indexOf('--output');
  if (outputArg !== -1 && process.argv[outputArg + 1]) {
    writeFileSync(process.argv[outputArg + 1], JSON.stringify(instructions, null, 2));
    console.log(`Written to ${process.argv[outputArg + 1]}`);
  } else {
    console.log(JSON.stringify(instructions, null, 2));
  }

  // Also print human-readable summary
  console.log(`\n=== Reply Target Finder ===`);
  console.log(`Topic: ${topic}`);
  console.log(`\nSearch queries to try:`);
  queries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  console.log(`\nPriority: Tier 1 accounts (10K+) > active threads (10+ replies) > recent data claims`);
  console.log(`Remember: add value first, identity second.`);
}

main();
