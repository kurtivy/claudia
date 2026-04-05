// Claudia Mail — Database Layer
// SQLite via node:sqlite (Node 22 built-in, experimental)

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import config from './config.mjs';

let _db = null;

export function getDb() {
  if (!_db) {
    _db = new DatabaseSync(config.dbPath);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT,
      company TEXT,
      role TEXT,
      tags TEXT,
      source TEXT,
      verified INTEGER DEFAULT 0,
      verify_token TEXT,
      global_optout INTEGER DEFAULT 0,
      optout_date TEXT,
      bounce_count INTEGER DEFAULT 0,
      last_bounce_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS list_members (
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
      subscribed INTEGER DEFAULT 1,
      subscribed_at TEXT DEFAULT (datetime('now')),
      unsubscribed_at TEXT,
      PRIMARY KEY (contact_id, list_id)
    );

    CREATE TABLE IF NOT EXISTS sender_accounts (
      id INTEGER PRIMARY KEY,
      provider TEXT DEFAULT 'bluehost',
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 465,
      smtp_secure INTEGER DEFAULT 1,
      smtp_user TEXT,
      smtp_pass TEXT,
      api_key TEXT,
      daily_limit INTEGER DEFAULT 500,
      hourly_limit INTEGER DEFAULT 100,
      sends_today INTEGER DEFAULT 0,
      sends_this_hour INTEGER DEFAULT 0,
      hour_reset_at TEXT,
      day_reset_at TEXT,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      list_id INTEGER REFERENCES lists(id),
      provider TEXT DEFAULT 'bluehost',
      status TEXT DEFAULT 'draft',
      from_name TEXT,
      reply_to TEXT,
      subject_template TEXT,
      text_template TEXT,
      html_template TEXT,
      brief TEXT,
      sender_account_id INTEGER REFERENCES sender_accounts(id),
      total_contacts INTEGER DEFAULT 0,
      sent INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      opened INTEGER DEFAULT 0,
      clicked INTEGER DEFAULT 0,
      bounced INTEGER DEFAULT 0,
      unsubscribed INTEGER DEFAULT 0,
      approved_by TEXT,
      approved_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sends (
      id INTEGER PRIMARY KEY,
      campaign_id INTEGER REFERENCES campaigns(id),
      contact_id INTEGER REFERENCES contacts(id),
      sender_account_id INTEGER REFERENCES sender_accounts(id),
      message_id TEXT,
      status TEXT DEFAULT 'queued',
      error TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      sent_at TEXT,
      tracking_id TEXT UNIQUE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      subject TEXT,
      text_body TEXT,
      html_body TEXT,
      variables TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_campaigns (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      campaign_name TEXT NOT NULL,
      campaign_description TEXT,
      subject_line TEXT NOT NULL,
      email_body_html TEXT,
      email_body_text TEXT,
      csv_data TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL,
      send_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      stripe_checkout_session_id TEXT,
      stripe_payment_intent_id TEXT,
      internal_campaign_id TEXT,
      rejection_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      approved_at TEXT,
      completed_at TEXT,
      tos_accepted INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_sends_campaign ON sends(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_sends_tracking ON sends(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_sends_message_id ON sends(message_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_client_campaigns_status ON client_campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_client_campaigns_stripe_session ON client_campaigns(stripe_checkout_session_id);
  `);
}

// Helpers — node:sqlite uses positional ? params with arrays
export function run(sql, ...params) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}

export function get(sql, ...params) {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params);
}

export function all(sql, ...params) {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params);
}

export function createClientCampaign(data) {
  const id = crypto.randomUUID();
  const stmt = getDb().prepare(`
    INSERT INTO client_campaigns (id, company_name, contact_email, campaign_name, campaign_description,
      subject_line, email_body_html, email_body_text, csv_data, recipient_count, cost_cents, send_date, tos_accepted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.company_name, data.contact_email, data.campaign_name,
    data.campaign_description || null, data.subject_line, data.email_body_html || null,
    data.email_body_text || null, data.csv_data, data.recipient_count, data.cost_cents,
    data.send_date || null, data.tos_accepted ? 1 : 0);
  return id;
}

export function getClientCampaign(id) {
  return getDb().prepare('SELECT * FROM client_campaigns WHERE id = ?').get(id);
}

export function updateClientCampaign(id, fields) {
  const allowed = ['status', 'stripe_checkout_session_id', 'stripe_payment_intent_id',
    'internal_campaign_id', 'rejection_reason', 'approved_at', 'completed_at'];
  const updates = [];
  const values = [];
  for (const [key, val] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (updates.length === 0) return;
  values.push(id);
  getDb().prepare(`UPDATE client_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function getClientCampaignByStripeSession(sessionId) {
  return getDb().prepare('SELECT * FROM client_campaigns WHERE stripe_checkout_session_id = ?').get(sessionId);
}

export default { getDb, run, get, all };
