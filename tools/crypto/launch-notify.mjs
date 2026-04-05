#!/usr/bin/env node
// launch-notify.mjs — Send Telegram notification after a token launch
// CLI:
//   node launch-notify.mjs --name "Token" --symbol "TKN" --address "abc123" [--thesis "..."] [--link "..."]
//   echo '{"name":"Token","symbol":"TKN","address":"abc123"}' | node launch-notify.mjs --stdin

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const KURT_CHAT_ID = '1578553327';

// ---------------------------------------------------------------------------
// Bot token resolution
// ---------------------------------------------------------------------------
function loadBotToken() {
  // 1. env var
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  // 2. config file
  try {
    const cfgPath = join(homedir(), '.claudia', 'config', 'telegram-bot.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    if (cfg.token) return cfg.token;
  } catch { /* file missing or malformed — fall through */ }

  // 3. give up
  console.error(
    'Error: No Telegram bot token found.\n' +
    'Set TELEGRAM_BOT_TOKEN env var or create ~/.claudia/config/telegram-bot.json with {"token":"..."}.'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build the message
// ---------------------------------------------------------------------------
function buildMessage({ name, symbol, address, thesis, link }) {
  const lines = [
    `Token launched: <b>${escapeHtml(name)}</b> ($${escapeHtml(symbol)})`,
    `https://pump.fun/coin/${address}`,
  ];
  if (thesis) lines.push('', `Thesis: ${escapeHtml(thesis)}`);
  if (link) lines.push(`Source: ${link}`);
  return lines.join('\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Send via Bot API
// ---------------------------------------------------------------------------
async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description || JSON.stringify(data)}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export async function sendLaunchNotification({ name, symbol, address, thesis, link, chatId } = {}) {
  if (!name || !symbol || !address) {
    throw new Error('name, symbol, and address are required');
  }
  const token = loadBotToken();
  const text = buildMessage({ name, symbol, address, thesis, link });
  return sendTelegram(token, chatId || KURT_CHAT_ID, text);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(
      'Usage:\n' +
      '  node launch-notify.mjs --name "Token" --symbol "TKN" --address "abc123" [--thesis "..."] [--link "..."]\n' +
      '  echo \'{"name":"Token","symbol":"TKN","address":"abc123"}\' | node launch-notify.mjs --stdin'
    );
    process.exit(args.length === 0 ? 1 : 0);
  }

  let opts;

  if (args.includes('--stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    opts = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } else {
    opts = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--name')   { opts.name   = args[++i]; continue; }
      if (arg === '--symbol') { opts.symbol  = args[++i]; continue; }
      if (arg === '--address'){ opts.address = args[++i]; continue; }
      if (arg === '--thesis') { opts.thesis  = args[++i]; continue; }
      if (arg === '--link')   { opts.link    = args[++i]; continue; }
    }
  }

  if (!opts.name || !opts.symbol || !opts.address) {
    console.error('Error: --name, --symbol, and --address are required.');
    process.exit(1);
  }

  const result = await sendLaunchNotification(opts);
  console.log(`Notification sent (message_id: ${result.result.message_id})`);
}

// Run CLI only when executed directly (not imported)
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
