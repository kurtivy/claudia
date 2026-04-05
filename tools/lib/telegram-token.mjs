#!/usr/bin/env node
// telegram-token.mjs — Resolve Telegram bot token from config sources
// Import: import { loadBotToken } from '../lib/telegram-token.mjs';

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;

export function loadBotToken() {
  // 1. env var
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  // 2. claudia.json
  const cfgPath = join(HOME, '.claudia', 'claudia.json');
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      if (cfg?.telegram?.botToken) return cfg.telegram.botToken;
    } catch { /* malformed — fall through */ }
  }

  // 3. channels .env (legacy)
  const envPath = join(HOME, '.claude', 'channels', 'telegram', '.env');
  if (existsSync(envPath)) {
    try {
      const match = readFileSync(envPath, 'utf8').match(/TELEGRAM_BOT_TOKEN=(.+)/);
      if (match) return match[1].trim();
    } catch {}
  }

  throw new Error(
    'No Telegram bot token found. Set TELEGRAM_BOT_TOKEN env var or add telegram.botToken to ~/.claudia/claudia.json'
  );
}
