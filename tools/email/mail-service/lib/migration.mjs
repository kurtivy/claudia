// Claudia Mail — Migration
// Migrates existing accounts.json and optouts.csv into SQLite on first run

import { readFileSync, renameSync, existsSync } from 'node:fs';
import config from '../config.mjs';
import { run, get, all } from '../db.mjs';

export function migrateAccounts() {
  if (!existsSync(config.accountsPath)) return { migrated: 0, skipped: true };

  // Check if already migrated
  const existing = all('SELECT COUNT(*) as count FROM sender_accounts');
  if (existing[0]?.count > 0) return { migrated: 0, skipped: true, reason: 'accounts already in DB' };

  const accounts = JSON.parse(readFileSync(config.accountsPath, 'utf8'));
  let migrated = 0;

  for (const acct of accounts) {
    try {
      run(
        `INSERT INTO sender_accounts (provider, email, name, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        'bluehost',
        acct.email,
        acct.name || null,
        acct.smtp?.host || acct.host || 'mail.web3advisory.co',
        acct.smtp?.port || acct.port || 465,
        acct.smtp?.secure !== false ? 1 : 0,
        acct.user || acct.email,
        acct.pass
      );
      migrated++;
    } catch (err) {
      console.error(`[migration] Failed to migrate account ${acct.email}: ${err.message}`);
    }
  }

  // Rename original as backup
  try {
    renameSync(config.accountsPath, config.accountsPath + '.migrated');
  } catch {}

  console.log(`[migration] Migrated ${migrated} sender accounts from accounts.json`);
  return { migrated };
}

export function migrateOptouts() {
  if (!existsSync(config.optoutsPath)) return { migrated: 0, skipped: true };

  const content = readFileSync(config.optoutsPath, 'utf8').trim();
  const lines = content.split('\n').slice(1); // Skip header
  if (lines.length === 0) return { migrated: 0, skipped: true, reason: 'no optouts to migrate' };

  let migrated = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const [email, date, source, scope] = line.split(',').map(s => s.trim());
    if (!email) continue;

    try {
      const isGlobal = !scope || scope === 'global';
      run(
        `INSERT INTO contacts (email, global_optout, optout_date, source)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           global_optout = CASE WHEN excluded.global_optout = 1 THEN 1 ELSE global_optout END,
           optout_date = COALESCE(excluded.optout_date, optout_date)`,
        email,
        isGlobal ? 1 : 0,
        date || null,
        'optout-migration'
      );

      // If scope is a list slug (not 'global'), handle list-level unsubscribe
      if (!isGlobal) {
        const list = get('SELECT id FROM lists WHERE slug = ?', scope);
        if (list) {
          const contact = get('SELECT id FROM contacts WHERE email = ?', email);
          if (contact) {
            run(
              `INSERT INTO list_members (contact_id, list_id, subscribed, unsubscribed_at)
               VALUES (?, ?, 0, ?)
               ON CONFLICT(contact_id, list_id) DO UPDATE SET subscribed = 0, unsubscribed_at = ?`,
              contact.id, list.id, date || null, date || null
            );
          }
        }
      }

      migrated++;
    } catch (err) {
      console.error(`[migration] Failed to migrate optout ${email}: ${err.message}`);
    }
  }

  // Rename original as backup
  try {
    renameSync(config.optoutsPath, config.optoutsPath + '.migrated');
  } catch {}

  console.log(`[migration] Migrated ${migrated} optouts from optouts.csv`);
  return { migrated };
}

export function runMigrations() {
  console.log('[migration] Checking for data to migrate...');
  const accounts = migrateAccounts();
  const optouts = migrateOptouts();
  return { accounts, optouts };
}

export default { runMigrations };
