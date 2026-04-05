#!/usr/bin/env node
// send-email.mjs — SMTP email sender for KurtClaw email skills
// Zero external dependencies — uses curl for SMTP transport
//
// Usage: node send-email.mjs @/tmp/payload.json
//        node send-email.mjs '{"to":"x@y.com",...}'
//
// Returns JSON: {"success":true,"messageId":"<generated-id>"} or {"success":false,"error":"message"}

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Read input from argv (@filepath or inline JSON) or stdin
let input = process.argv[2];
if (input && input.startsWith('@')) {
  try {
    input = readFileSync(input.slice(1), 'utf8');
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: `Cannot read file ${input.slice(1)}: ${e.message}` }));
    process.exit(1);
  }
} else if (!input) {
  try {
    input = readFileSync('/dev/stdin', 'utf8');
  } catch {
    console.log(JSON.stringify({ success: false, error: 'No input. Pass JSON as argument, @filepath, or pipe via stdin.' }));
    process.exit(1);
  }
}

let payload;
try {
  payload = JSON.parse(input);
} catch (e) {
  console.log(JSON.stringify({ success: false, error: `Invalid JSON: ${e.message}` }));
  process.exit(1);
}

const { to, from, fromName, subject, textBody, htmlBody, replyTo, smtp, listUnsubscribeUrl } = payload;

if (!to || !from || !subject || (!textBody && !htmlBody) || !smtp) {
  console.log(JSON.stringify({ success: false, error: 'Missing required fields: to, from, subject, textBody/htmlBody, smtp' }));
  process.exit(1);
}

// Generate a message ID
const messageId = `<${randomUUID()}@${from.split('@')[1]}>`;
const boundary = `----=_Part_${randomUUID().replace(/-/g, '')}`;
const date = new Date().toUTCString();

// Base64 encode helper (wraps at 76 chars per line as required by RFC 2045)
function encodeBase64(str) {
  const buf = Buffer.from(str, 'utf8');
  const b64 = buf.toString('base64');
  // Wrap at 76 characters per line
  const lines = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join('\r\n');
}

// Build MIME headers
const fromHeader = fromName ? `"${fromName.replace(/"/g, '\\"')}" <${from}>` : from;
const headers = [
  `From: ${fromHeader}`,
  `To: ${to}`,
  `Subject: ${subject}`,
  `Date: ${date}`,
  `Message-ID: ${messageId}`,
  `MIME-Version: 1.0`,
];

if (replyTo) headers.push(`Reply-To: ${replyTo}`);

// List-Unsubscribe headers (required by Gmail for bulk senders since Feb 2024)
if (listUnsubscribeUrl) {
  headers.push(`List-Unsubscribe: <${listUnsubscribeUrl}>`);
  headers.push(`List-Unsubscribe-Post: List-Unsubscribe=One-Click`);
}

// Build MIME body — use base64 encoding to avoid quoted-printable line-length corruption
let body;
if (htmlBody && textBody) {
  // Multipart alternative: text + html
  body = [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64(textBody),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64(htmlBody),
    '',
    `--${boundary}--`,
  ].join('\r\n');
} else if (htmlBody) {
  body = [
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64(htmlBody),
  ].join('\r\n');
} else {
  body = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBase64(textBody),
  ].join('\r\n');
}

const emailContent = headers.join('\r\n') + '\r\n' + body;

// Write to temp file
const tmpFile = join(tmpdir(), `email-${randomUUID()}.eml`);
writeFileSync(tmpFile, emailContent);

try {
  // Build curl command for SMTP
  const protocol = smtp.secure !== false ? 'smtps' : 'smtp';
  const port = smtp.port || (smtp.secure !== false ? 465 : 587);
  const url = `${protocol}://${smtp.host}:${port}`;

  const curlArgs = [
    'curl', '--silent', '--show-error',
    '--url', url,
    '--mail-from', from,
    '--mail-rcpt', to,
    '--user', `${smtp.user}:${smtp.pass}`,
    '--upload-file', tmpFile,
    '--connect-timeout', '15',
    '--max-time', '30',
  ];

  // If smtp.resolve is provided, pin hostname to specific IP (for Cloudflare DNS bypass)
  if (smtp.resolve) {
    curlArgs.push('--resolve', `${smtp.host}:${port}:${smtp.resolve}`);
  }

  // For port 587 with STARTTLS
  if (!smtp.secure || port === 587) {
    curlArgs.push('--ssl-reqd');
  }

  // Shell-escape each argument (use bash on Windows for POSIX quoting)
  const escaped = curlArgs.map(a => "'" + a.replace(/'/g, "'\\''") + "'").join(' ');
  execSync(escaped, {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 45000,
    shell: process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh',
  });

  console.log(JSON.stringify({ success: true, messageId }));
} catch (err) {
  const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
  console.log(JSON.stringify({ success: false, error: stderr }));
  process.exit(1);
} finally {
  try { unlinkSync(tmpFile); } catch {}
}
