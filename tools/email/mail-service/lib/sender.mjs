// Claudia Mail — Unified Email Sender
// Abstracts Bluehost SMTP (via send-email.mjs) and Resend API
// Handles account rotation and rate limiting

import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import config from '../config.mjs';
import { get, all, run } from '../db.mjs';

// ── Rate limit helpers ──

function resetRatesIfNeeded(account) {
  const now = new Date().toISOString();
  const currentHour = now.slice(0, 13); // YYYY-MM-DDTHH
  const currentDay = now.slice(0, 10);  // YYYY-MM-DD

  if (!account.hour_reset_at || account.hour_reset_at.slice(0, 13) !== currentHour) {
    run('UPDATE sender_accounts SET sends_this_hour = 0, hour_reset_at = ? WHERE id = ?',
      now, account.id);
    account.sends_this_hour = 0;
  }
  if (!account.day_reset_at || account.day_reset_at.slice(0, 10) !== currentDay) {
    run('UPDATE sender_accounts SET sends_today = 0, day_reset_at = ? WHERE id = ?',
      now, account.id);
    account.sends_today = 0;
  }
}

function canSend(account) {
  resetRatesIfNeeded(account);
  return account.enabled
    && account.sends_this_hour < (account.hourly_limit || config.maxPerAccountPerHour)
    && account.sends_today < (account.daily_limit || config.maxPerAccountPerDay);
}

function recordSend(accountId) {
  run(`UPDATE sender_accounts
       SET sends_this_hour = sends_this_hour + 1,
           sends_today = sends_today + 1
       WHERE id = ?`, accountId);
}

// ── Account selection ──

let rotationIndex = 0;

export function getNextAccount(provider = 'bluehost') {
  const accounts = all(
    'SELECT * FROM sender_accounts WHERE provider = ? AND enabled = 1',
    provider
  );

  if (accounts.length === 0) return null;

  // Round-robin with rate limit check
  for (let i = 0; i < accounts.length; i++) {
    const idx = (rotationIndex + i) % accounts.length;
    const account = accounts[idx];
    if (canSend(account)) {
      rotationIndex = (idx + 1) % accounts.length;
      return account;
    }
  }

  return null; // All accounts at rate limit
}

// ── Send via Bluehost SMTP ──

function sendBluehost(account, { to, subject, textBody, htmlBody, replyTo, fromName, listUnsubscribeUrl }) {
  const payload = {
    to,
    from: account.email,
    fromName: fromName || account.name,
    subject,
    textBody,
    htmlBody,
    replyTo: replyTo || account.email,
    listUnsubscribeUrl: listUnsubscribeUrl || undefined,
    smtp: {
      host: account.smtp_host,
      port: account.smtp_port,
      secure: !!account.smtp_secure,
      user: account.smtp_user,
      pass: account.smtp_pass,
      resolve: account.smtp_resolve || undefined, // IP override for Cloudflare DNS bypass
    },
  };

  // Write payload to temp file to avoid shell argument length limits (large HTML bodies)
  const payloadJson = JSON.stringify(payload);
  const tmpFile = join(tmpdir(), `mail-${randomUUID()}.json`);
  writeFileSync(tmpFile, payloadJson);

  // Use spawnSync instead of execSync — execSync on Windows drops stdout on non-zero exit
  const proc = spawnSync('node', [config.sendEmailScript, `@${tmpFile}`], {
    encoding: 'utf8',
    timeout: 60_000,
  });

  try { unlinkSync(tmpFile); } catch {}

  const stdout = (proc.stdout || '').trim();
  if (stdout) {
    try { return JSON.parse(stdout); } catch {}
  }

  // If no parseable stdout, build error from stderr or exit code
  const stderr = (proc.stderr || '').trim();
  if (proc.status !== 0) {
    return { success: false, error: stderr || `send-email.mjs exited with code ${proc.status}` };
  }

  return { success: false, error: 'No output from send-email.mjs' };
}

// ── Send via Resend API ──

async function sendResend(account, { to, subject, textBody, htmlBody, replyTo, fromName }) {
  const apiKey = account.api_key || config.resendApiKey;
  if (!apiKey) throw new Error('No Resend API key configured');

  const from = fromName ? `${fromName} <${account.email}>` : account.email;

  const body = {
    from,
    to: [to],
    subject,
    reply_to: replyTo || account.email,
  };

  if (htmlBody) body.html = htmlBody;
  if (textBody) body.text = textBody;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    return { success: false, error: data.message || JSON.stringify(data) };
  }

  return { success: true, messageId: data.id };
}

// ── Unified send ──

export async function sendEmail(provider, emailData) {
  // Allow specifying a specific sender account by ID (for campaigns locked to a domain)
  let account;
  if (emailData.senderAccountId) {
    account = get('SELECT * FROM sender_accounts WHERE id = ? AND enabled = 1', emailData.senderAccountId);
    if (account && !canSend(account)) account = null; // Rate-limited
  } else {
    account = getNextAccount(provider);
  }

  if (!account) {
    return {
      success: false,
      error: `No available ${provider} sender accounts (all at rate limit or disabled)`,
      accountId: null,
    };
  }

  const trackingId = emailData.trackingId || randomUUID();

  try {
    let result;

    if (provider === 'resend') {
      result = await sendResend(account, emailData);
    } else {
      result = sendBluehost(account, emailData);
    }

    if (result.success) {
      recordSend(account.id);
    }

    return {
      ...result,
      accountId: account.id,
      accountEmail: account.email,
      trackingId,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      accountId: account.id,
      accountEmail: account.email,
      trackingId,
    };
  }
}

// ── Account stats ──

export function getAccountStats() {
  const accounts = all('SELECT id, provider, email, name, enabled, sends_today, sends_this_hour, daily_limit, hourly_limit FROM sender_accounts');
  accounts.forEach(resetRatesIfNeeded);
  return accounts;
}

export default { sendEmail, getNextAccount, getAccountStats };
