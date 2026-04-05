#!/usr/bin/env node
// send-fallback.mjs — Send Telegram messages via Bot API when MCP tools are disconnected
//
// Usage:
//   node send-fallback.mjs --chat 1578553327 "message text"
//   node send-fallback.mjs --chat -5283337801 "message for group"
//   node send-fallback.mjs --kurt "quick message to Kurt"
//   node send-fallback.mjs --masha "message to Masha group"
//
// Reads bot token from ~/.claude/channels/telegram/.env

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const ENV_PATH = join(homedir(), '.claude', 'channels', 'telegram', '.env');
const KURT_CHAT = '1578553327';
const MASHA_CHAT = '-5283337801';

// Load token
let token;
try {
  const env = readFileSync(ENV_PATH, 'utf8');
  const match = env.match(/TELEGRAM_BOT_TOKEN=(.+)/);
  if (!match) throw new Error('TELEGRAM_BOT_TOKEN not found in .env');
  token = match[1].trim();
} catch (e) {
  console.error(`Could not load bot token from ${ENV_PATH}: ${e.message}`);
  process.exit(1);
}

// Parse args
const args = process.argv.slice(2);
let chatId, text;

if (args[0] === '--kurt') {
  chatId = KURT_CHAT;
  text = args.slice(1).join(' ');
} else if (args[0] === '--masha') {
  chatId = MASHA_CHAT;
  text = args.slice(1).join(' ');
} else if (args[0] === '--chat') {
  chatId = args[1];
  text = args.slice(2).join(' ');
} else {
  console.error('Usage: node send-fallback.mjs --kurt "message"');
  console.error('       node send-fallback.mjs --masha "message"');
  console.error('       node send-fallback.mjs --chat <chat_id> "message"');
  process.exit(2);
}

if (!chatId || !text) {
  console.error('Missing chat_id or message text');
  process.exit(2);
}

// Send via Bot API
const url = `https://api.telegram.org/bot${token}/sendMessage`;
const body = JSON.stringify({ chat_id: parseInt(chatId) || chatId, text });

try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  const data = await response.json();
  if (data.ok) {
    console.log(`sent (id: ${data.result.message_id})`);
  } else {
    console.error(`Telegram API error: ${data.description}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`Network error: ${e.message}`);
  process.exit(1);
}
