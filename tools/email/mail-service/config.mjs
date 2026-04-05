// Claudia Mail — Configuration
// Loads settings from environment, claudia.json, and mail-specific config

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDIA_DIR = join(
  process.env.HOME || process.env.USERPROFILE || '/home/node',
  '.claudia'
);

function loadJsonFile(path) {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`[config] Failed to load ${path}: ${e.message}`);
  }
  return null;
}

// Load gateway token from claudia.json for API auth
const claudiaConfig = loadJsonFile(join(CLAUDIA_DIR, 'claudia.json'));
const gatewayToken = claudiaConfig?.gateway?.auth?.token
  || claudiaConfig?.gateway?.token
  || process.env.CLAUDIA_GATEWAY_TOKEN
  || '';

export const config = {
  // Paths
  claudiaDir: CLAUDIA_DIR,
  emailDir: join(CLAUDIA_DIR, 'email'),
  dbPath: join(CLAUDIA_DIR, 'email', 'mail.db'),
  accountsPath: join(CLAUDIA_DIR, 'email', 'accounts.json'),
  optoutsPath: join(CLAUDIA_DIR, 'email', 'optouts.csv'),
  sendEmailScript: join(CLAUDIA_DIR, 'tools', 'email', 'send-email.mjs'),
  templatesDir: join(CLAUDIA_DIR, 'email', 'templates'),

  // Server
  port: parseInt(process.env.MAIL_PORT || '18791', 10),
  bind: process.env.MAIL_BIND || '0.0.0.0',

  // Auth
  authToken: process.env.MAIL_AUTH_TOKEN || gatewayToken,

  // Resend (multiple accounts — keys stored per sender_account row in DB)
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendApiKey2: process.env.RESEND_API_KEY_2 || '',
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',

  // Tracking (public URL for pixels/links in emails)
  publicUrl: process.env.MAIL_PUBLIC_URL || claudiaConfig?.mail?.publicUrl || '',

  // Campaign defaults
  batchSize: 50,
  interBatchDelayMs: 30_000,
  interEmailDelayMs: { min: 2000, max: 3000 },
  maxPerAccountPerHour: 100,
  maxPerAccountPerDay: 500,
  consecutiveFailureThreshold: 5,

  // IMAP poller
  imapHost: 'mail.web3advisory.co',
  imapPort: 993,
  imapPollIntervalMs: 10 * 60 * 1000, // 10 minutes

  // Stripe (paid campaign billing)
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || claudiaConfig?.stripe?.secretKey || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || claudiaConfig?.stripe?.webhookSecret || '',
  pricePerThousandCents: 3000, // $30 per 1K emails
  minimumRecipients: 1000,

  // Telegram notifications
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || claudiaConfig?.telegram?.botToken || '',
  telegramKurtChatId: '1578553327',
};

export default config;
