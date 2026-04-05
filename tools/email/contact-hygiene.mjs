#!/usr/bin/env node
// Contact Hygiene — Identify and quarantine chronic email failures
// Reads mail.db directly. Does NOT modify data unless --fix flag is passed.
//
// Usage:
//   node contact-hygiene.mjs              # Report only
//   node contact-hygiene.mjs --fix        # Opt out contacts that failed 3+ times
//   node contact-hygiene.mjs --threshold 5 # Custom failure threshold (default: 3)

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE;
const DB_PATH = resolve(HOME, '.claudia/email/mail.db');

if (!existsSync(DB_PATH)) {
  console.error(`[hygiene] Database not found: ${DB_PATH}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const thresholdIdx = args.indexOf('--threshold');
const threshold = thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1]) : 3;

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// Find contacts with N+ failed sends
const chronic = db.prepare(`
  SELECT
    c.id,
    c.email,
    c.name,
    c.global_optout,
    COUNT(CASE WHEN s.status = 'failed' THEN 1 END) as fail_count,
    COUNT(CASE WHEN s.status = 'sent' THEN 1 END) as sent_count,
    COUNT(CASE WHEN s.status = 'sent' AND s.opened_at IS NOT NULL THEN 1 END) as open_count,
    GROUP_CONCAT(DISTINCT s.error) as errors
  FROM contacts c
  JOIN sends s ON s.contact_id = c.id
  WHERE c.global_optout = 0
  GROUP BY c.id
  HAVING fail_count >= ?
  ORDER BY fail_count DESC
`).all(threshold);

if (chronic.length === 0) {
  console.log(`[hygiene] No contacts with ${threshold}+ failures. List is clean.`);
  process.exit(0);
}

// Summary
const totalFails = chronic.reduce((sum, c) => sum + c.fail_count, 0);
const totalSent = chronic.reduce((sum, c) => sum + c.sent_count, 0);
const neverDelivered = chronic.filter(c => c.sent_count === 0).length;

console.log(`\nContact Hygiene Report`);
console.log(`${'='.repeat(60)}`);
console.log(`Threshold: ${threshold}+ failures`);
console.log(`Contacts flagged: ${chronic.length}`);
console.log(`Total wasted sends: ${totalFails}`);
console.log(`Never delivered to: ${neverDelivered} contacts`);
console.log(`${'='.repeat(60)}\n`);

// Top offenders
console.log(`Top ${Math.min(20, chronic.length)} chronic failures:\n`);
console.log(`${'Email'.padEnd(40)} ${'Fails'.padEnd(7)} ${'Sent'.padEnd(7)} ${'Opens'.padEnd(7)} Error`);
console.log(`${'-'.repeat(40)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(7)} ${'-'.repeat(30)}`);

for (const c of chronic.slice(0, 20)) {
  const err = (c.errors || '').split(',')[0].substring(0, 30);
  console.log(
    `${c.email.padEnd(40)} ${String(c.fail_count).padEnd(7)} ${String(c.sent_count).padEnd(7)} ${String(c.open_count).padEnd(7)} ${err}`
  );
}

if (chronic.length > 20) {
  console.log(`\n... and ${chronic.length - 20} more\n`);
}

// Error breakdown
const errorMap = {};
for (const c of chronic) {
  for (const err of (c.errors || 'unknown').split(',')) {
    const key = err.trim().substring(0, 60) || 'unknown';
    errorMap[key] = (errorMap[key] || 0) + 1;
  }
}
console.log(`\nError breakdown:`);
for (const [err, count] of Object.entries(errorMap).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${count}x ${err}`);
}

if (fix) {
  console.log(`\n[hygiene] Opting out ${chronic.length} contacts...`);
  const stmt = db.prepare(
    `UPDATE contacts SET global_optout = 1, optout_date = datetime('now'), source = 'hygiene-auto'
     WHERE id = ? AND global_optout = 0`
  );
  let fixed = 0;
  for (const c of chronic) {
    const result = stmt.run(c.id);
    if (result.changes > 0) fixed++;
  }
  console.log(`[hygiene] Opted out ${fixed} contacts. They won't receive future campaigns.`);
} else {
  console.log(`\nRun with --fix to opt out these contacts.`);
  console.log(`Run with --threshold N to change the failure cutoff (default: 3).`);
}

db.close();
