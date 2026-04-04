# Email Campaign Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a paid email campaign service where clients submit campaigns via web form, pay via Stripe, Kurt approves via Telegram, and existing mail infrastructure handles sending + tracking.

**Architecture:** Static HTML form on Bluehost (web3advisory.co) POSTs to the existing mail service via the Cloudflare tunnel (track.web3advisory.co). New public endpoints on the mail service handle campaign submission, Stripe webhooks, Telegram approval, and client-facing status pages. Sending uses the existing campaign engine with 10 rotating Bluehost SMTP accounts.

**Tech Stack:** Node.js/Express (existing mail service), Stripe Checkout + webhooks, Telegram Bot API, static HTML/CSS/JS form, SQLite (existing db)

---

## File Structure

All new code lives inside the existing mail service at `~/.openclaw/tools/email/mail-service/`.

| File | Responsibility |
|------|---------------|
| `routes/public-campaigns.mjs` (CREATE) | Public endpoints: submit campaign, Stripe webhook, campaign status JSON |
| `routes/public-pages.mjs` (CREATE) | Serves HTML status page for clients |
| `lib/stripe.mjs` (CREATE) | Stripe Checkout session creation, webhook verification, refunds |
| `lib/telegram-notify.mjs` (CREATE) | Send campaign notifications to Kurt, handle approve/reject callbacks |
| `db.mjs` (MODIFY) | Add `client_campaigns` table, migrate on startup |
| `server.mjs` (MODIFY) | Mount new routes, add JSON body size limit for CSV uploads |
| `config.mjs` (MODIFY) | Add Stripe and Telegram config entries |
| `public/status.html` (CREATE) | Client-facing campaign status page (static HTML + JS that fetches from API) |
| Bluehost: `campaign-form/index.html` (CREATE) | Campaign submission form hosted on web3advisory.co |
| Bluehost: `campaign-form/style.css` (CREATE) | Form styles |
| Bluehost: `campaign-form/form.js` (CREATE) | Form validation, CSV parsing, cost calc, Stripe redirect |

---

## Task 1: Database Schema for Client Campaigns

Add a `client_campaigns` table to the existing SQLite database. This stores campaigns submitted by paying clients, separate from internal campaigns.

**Files:**
- Modify: `~/.openclaw/tools/email/mail-service/db.mjs`

- [ ] **Step 1: Write the migration SQL**

Add to the `migrate()` function in `db.mjs`, after the existing table creation statements:

```javascript
db.exec(`
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
  )
`);
```

Valid statuses: `pending_payment`, `paid`, `approved`, `rejected`, `sending`, `completed`, `refunded`

- [ ] **Step 2: Add helper functions to db.mjs**

Add these exports at the bottom of `db.mjs`:

```javascript
export function createClientCampaign(data) {
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
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
  return db.prepare('SELECT * FROM client_campaigns WHERE id = ?').get(id);
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
  db.prepare(`UPDATE client_campaigns SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

export function getClientCampaignByStripeSession(sessionId) {
  return db.prepare('SELECT * FROM client_campaigns WHERE stripe_checkout_session_id = ?').get(sessionId);
}
```

- [ ] **Step 3: Add `import crypto from 'node:crypto'`** at top of `db.mjs` if not already present.

- [ ] **Step 4: Test the migration**

Restart the mail service and verify the table was created:

```bash
cd ~/.openclaw/tools/email/mail-service && node -e "
  import('./db.mjs').then(db => {
    const info = db.default?.prepare?.('SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"client_campaigns\"')?.get?.();
    console.log('Table exists:', !!info);
  });
"
```

Expected: `Table exists: true`

- [ ] **Step 5: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add db.mjs
git commit -m "feat: add client_campaigns table for paid campaign service"
```

---

## Task 2: Stripe Integration Module

Create a module that handles Stripe Checkout session creation, webhook signature verification, and refunds.

**Files:**
- Create: `~/.openclaw/tools/email/mail-service/lib/stripe.mjs`
- Modify: `~/.openclaw/tools/email/mail-service/config.mjs`

- [ ] **Step 1: Install Stripe SDK**

```bash
cd ~/.openclaw/tools/email/mail-service
npm install stripe
```

- [ ] **Step 2: Add Stripe config entries**

In `config.mjs`, add to the exported config object:

```javascript
stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
pricePerThousandCents: 3000, // $30 per 1K emails
minimumRecipients: 1000,
```

- [ ] **Step 3: Create `lib/stripe.mjs`**

```javascript
import Stripe from 'stripe';
import { config } from '../config.mjs';

let stripe;
function getStripe() {
  if (!stripe) stripe = new Stripe(config.stripeSecretKey);
  return stripe;
}

export async function createCheckoutSession({ campaignId, recipientCount, contactEmail }) {
  const costCents = Math.ceil(recipientCount / 1000) * config.pricePerThousandCents;
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer_email: contactEmail,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: costCents,
        product_data: {
          name: `Email Campaign — ${recipientCount.toLocaleString()} recipients`,
          description: 'Web3Advisory email campaign delivery with tracking',
        },
      },
      quantity: 1,
    }],
    metadata: { campaign_id: campaignId },
    success_url: `${config.publicUrl}/campaign/${campaignId}?status=paid`,
    cancel_url: `${config.publicUrl}/campaign/${campaignId}?status=cancelled`,
  });
  return { sessionId: session.id, checkoutUrl: session.url, costCents };
}

export function constructWebhookEvent(rawBody, signature) {
  return getStripe().webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}

export async function refundPayment(paymentIntentId) {
  return getStripe().refunds.create({ payment_intent: paymentIntentId });
}
```

- [ ] **Step 4: Verify module loads**

```bash
cd ~/.openclaw/tools/email/mail-service
node -e "import('./lib/stripe.mjs').then(() => console.log('stripe module loaded ok'))"
```

Expected: `stripe module loaded ok` (will warn about missing key, that's fine)

- [ ] **Step 5: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add lib/stripe.mjs config.mjs package.json package-lock.json
git commit -m "feat: add Stripe checkout, webhook verification, and refund module"
```

---

## Task 3: Telegram Notification Module

Create a module that sends campaign details to Kurt via Telegram Bot API and listens for approve/reject replies.

**Files:**
- Create: `~/.openclaw/tools/email/mail-service/lib/telegram-notify.mjs`
- Modify: `~/.openclaw/tools/email/mail-service/config.mjs`

- [ ] **Step 1: Add Telegram config**

In `config.mjs`, add:

```javascript
telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
telegramKurtChatId: '1578553327',
```

- [ ] **Step 2: Create `lib/telegram-notify.mjs`**

```javascript
import { config } from '../config.mjs';

const API = `https://api.telegram.org/bot${config.telegramBotToken}`;

async function sendMessage(chatId, text, opts = {}) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...opts,
    }),
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram send failed:', data);
  return data;
}

export async function notifyCampaignPaid(campaign) {
  const bodyPreview = (campaign.email_body_text || campaign.email_body_html || '').slice(0, 300);
  const costDollars = (campaign.cost_cents / 100).toFixed(2);

  const text = [
    `<b>NEW PAID CAMPAIGN</b>`,
    ``,
    `<b>Client:</b> ${campaign.company_name}`,
    `<b>Email:</b> ${campaign.contact_email}`,
    `<b>Campaign:</b> ${campaign.campaign_name}`,
    `<b>Recipients:</b> ${campaign.recipient_count.toLocaleString()}`,
    `<b>Cost:</b> $${costDollars}`,
    `<b>Subject:</b> ${campaign.subject_line}`,
    ``,
    `<b>Body preview:</b>`,
    `<pre>${escapeHtml(bodyPreview)}${bodyPreview.length >= 300 ? '...' : ''}</pre>`,
    ``,
    `Reply with:`,
    `<code>/approve ${campaign.id}</code>`,
    `<code>/reject ${campaign.id} [reason]</code>`,
  ].join('\n');

  return sendMessage(config.telegramKurtChatId, text);
}

export async function notifyCampaignStatus(campaign, status, detail = '') {
  const text = `Campaign <b>${campaign.campaign_name}</b>: ${status}${detail ? `\n${detail}` : ''}`;
  return sendMessage(config.telegramKurtChatId, text);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

- [ ] **Step 3: Verify module loads**

```bash
cd ~/.openclaw/tools/email/mail-service
node -e "import('./lib/telegram-notify.mjs').then(() => console.log('telegram module loaded ok'))"
```

Expected: `telegram module loaded ok`

- [ ] **Step 4: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add lib/telegram-notify.mjs config.mjs
git commit -m "feat: add Telegram notification module for campaign approval flow"
```

---

## Task 4: Public Campaign API Routes

Create the public-facing endpoints: campaign submission, Stripe webhook, campaign status, and approve/reject.

**Files:**
- Create: `~/.openclaw/tools/email/mail-service/routes/public-campaigns.mjs`
- Modify: `~/.openclaw/tools/email/mail-service/server.mjs`

- [ ] **Step 1: Create `routes/public-campaigns.mjs`**

```javascript
import { Router } from 'express';
import {
  createClientCampaign, getClientCampaign, updateClientCampaign,
  getClientCampaignByStripeSession
} from '../db.mjs';
import { createCheckoutSession, constructWebhookEvent, refundPayment } from '../lib/stripe.mjs';
import { notifyCampaignPaid, notifyCampaignStatus } from '../lib/telegram-notify.mjs';
import { config } from '../config.mjs';

const router = Router();

// --- Campaign submission (public, no auth) ---
router.post('/api/public/submit-campaign', async (req, res) => {
  try {
    const { company_name, contact_email, campaign_name, campaign_description,
      subject_line, email_body_html, email_body_text, csv_data, send_date, tos_accepted } = req.body;

    // Validate required fields
    if (!company_name || !contact_email || !campaign_name || !subject_line || !csv_data || !tos_accepted) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Count recipients from CSV
    const lines = csv_data.trim().split('\n');
    const recipientCount = lines.length - 1; // subtract header row
    if (recipientCount < config.minimumRecipients) {
      return res.status(400).json({
        error: `Minimum ${config.minimumRecipients} recipients required. You submitted ${recipientCount}.`
      });
    }

    // Validate CSV has email column
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    if (!headers.includes('email')) {
      return res.status(400).json({ error: 'CSV must have an "email" column' });
    }

    const costCents = Math.ceil(recipientCount / 1000) * config.pricePerThousandCents;

    // Store campaign
    const campaignId = createClientCampaign({
      company_name, contact_email, campaign_name, campaign_description,
      subject_line, email_body_html, email_body_text, csv_data,
      recipient_count: recipientCount, cost_cents: costCents, send_date, tos_accepted
    });

    // Create Stripe Checkout
    const { sessionId, checkoutUrl } = await createCheckoutSession({
      campaignId, recipientCount, contactEmail: contact_email
    });

    updateClientCampaign(campaignId, { stripe_checkout_session_id: sessionId });

    res.json({ campaign_id: campaignId, checkout_url: checkoutUrl, cost_cents: costCents, recipient_count: recipientCount });
  } catch (err) {
    console.error('Campaign submission error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// --- Stripe webhook (public, no auth, raw body) ---
router.post('/api/webhooks/stripe', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const event = constructWebhookEvent(req.rawBody, sig);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const campaign = getClientCampaignByStripeSession(session.id);
      if (campaign) {
        updateClientCampaign(campaign.id, {
          status: 'paid',
          stripe_payment_intent_id: session.payment_intent,
        });
        const updated = getClientCampaign(campaign.id);
        await notifyCampaignPaid(updated);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    res.status(400).json({ error: 'Webhook verification failed' });
  }
});

// --- Campaign status (public, no auth — campaign ID is the secret) ---
router.get('/api/public/campaign/:id', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  // Return only client-safe fields
  res.json({
    id: campaign.id,
    campaign_name: campaign.campaign_name,
    status: campaign.status,
    recipient_count: campaign.recipient_count,
    cost_dollars: (campaign.cost_cents / 100).toFixed(2),
    created_at: campaign.created_at,
    approved_at: campaign.approved_at,
    completed_at: campaign.completed_at,
    rejection_reason: campaign.rejection_reason,
    internal_campaign_id: campaign.internal_campaign_id,
  });
});

// --- Approve/Reject (authed, Kurt only) ---
router.post('/api/campaigns/client/:id/approve', requireAuth, async (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'paid') return res.status(400).json({ error: `Cannot approve campaign in status: ${campaign.status}` });

  updateClientCampaign(campaign.id, { status: 'approved', approved_at: new Date().toISOString() });
  await notifyCampaignStatus(campaign, 'APPROVED', 'Starting send process...');
  res.json({ status: 'approved' });
});

router.post('/api/campaigns/client/:id/reject', requireAuth, async (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'paid') return res.status(400).json({ error: `Cannot reject campaign in status: ${campaign.status}` });

  const reason = req.body.reason || 'Campaign did not meet our acceptable use policy.';

  // Refund via Stripe
  if (campaign.stripe_payment_intent_id) {
    try {
      await refundPayment(campaign.stripe_payment_intent_id);
      updateClientCampaign(campaign.id, { status: 'refunded', rejection_reason: reason });
    } catch (err) {
      console.error('Refund failed:', err);
      updateClientCampaign(campaign.id, { status: 'rejected', rejection_reason: reason });
    }
  } else {
    updateClientCampaign(campaign.id, { status: 'rejected', rejection_reason: reason });
  }

  await notifyCampaignStatus(campaign, 'REJECTED', reason);
  res.json({ status: 'rejected', reason });
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== config.authToken) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

export default router;
```

- [ ] **Step 2: Modify `server.mjs` to mount routes and capture raw body for Stripe**

Find the existing Express app setup in `server.mjs`. Add these changes:

1. Import the new routes:
```javascript
import publicCampaignRoutes from './routes/public-campaigns.mjs';
```

2. Before the existing `express.json()` middleware, add raw body capture for the Stripe webhook:
```javascript
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  req.body = JSON.parse(req.body);
  next();
});
```

3. After existing route mounts, add:
```javascript
app.use(publicCampaignRoutes);
```

4. Increase JSON body limit for CSV uploads (the default 100kb won't handle large CSVs):
```javascript
// Change existing express.json() to:
app.use(express.json({ limit: '50mb' }));
```

- [ ] **Step 3: Add CORS header for Bluehost form**

In `server.mjs`, add before route mounts:

```javascript
app.use('/api/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://web3advisory.co');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
```

- [ ] **Step 4: Test route mounting**

Restart the mail service and hit the status endpoint with a fake ID:

```bash
curl http://localhost:18791/api/public/campaign/nonexistent
```

Expected: `{"error":"Campaign not found"}` (404)

- [ ] **Step 5: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add routes/public-campaigns.mjs server.mjs
git commit -m "feat: add public campaign submission, Stripe webhook, and status endpoints"
```

---

## Task 5: Client Status Page

Create a simple HTML page served by the mail service that shows campaign progress.

**Files:**
- Create: `~/.openclaw/tools/email/mail-service/public/campaign-status.html`
- Create: `~/.openclaw/tools/email/mail-service/routes/public-pages.mjs`
- Modify: `~/.openclaw/tools/email/mail-service/server.mjs`

- [ ] **Step 1: Create `public/campaign-status.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Campaign Status — Web3Advisory</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #fff; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #fff; }
    .stat-label { font-size: 0.8rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; }
    .status-pending_payment { background: #332800; color: #ffaa00; }
    .status-paid { background: #1a2e1a; color: #4caf50; }
    .status-approved { background: #1a2e1a; color: #4caf50; }
    .status-sending { background: #0a1a3a; color: #42a5f5; }
    .status-completed { background: #1a2e1a; color: #66bb6a; }
    .status-rejected, .status-refunded { background: #3a1a1a; color: #ef5350; }
    .rejection-reason { background: #2a1a1a; border: 1px solid #442222; border-radius: 4px; padding: 1rem; margin-top: 1rem; color: #ef9a9a; }
    .tracking-stats { margin-top: 1rem; }
    .loading { text-align: center; padding: 3rem; color: #888; }
    .error { text-align: center; padding: 3rem; color: #ef5350; }
    .refresh-note { text-align: center; color: #666; font-size: 0.8rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Web3Advisory</h1>
    <p class="subtitle">Email Campaign Status</p>
    <div id="content"><div class="loading">Loading campaign...</div></div>
    <p class="refresh-note" id="refresh-note" style="display:none">Auto-refreshes every 30 seconds while sending</p>
  </div>
  <script>
    const campaignId = window.location.pathname.split('/').pop();
    let refreshInterval = null;

    async function load() {
      try {
        const res = await fetch(`/api/public/campaign/${campaignId}`);
        if (!res.ok) throw new Error('Campaign not found');
        const c = await res.json();
        render(c);
        if (c.status === 'sending' && !refreshInterval) {
          refreshInterval = setInterval(load, 30000);
          document.getElementById('refresh-note').style.display = 'block';
        }
        if (c.status !== 'sending' && refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
          document.getElementById('refresh-note').style.display = 'none';
        }
        // If sending, also fetch internal campaign stats
        if (c.internal_campaign_id && ['sending', 'completed'].includes(c.status)) {
          loadStats(c.internal_campaign_id);
        }
      } catch (e) {
        document.getElementById('content').innerHTML = '<div class="error">Campaign not found</div>';
      }
    }

    async function loadStats(internalId) {
      try {
        const res = await fetch(`/api/public/campaign/${campaignId}/stats`);
        if (!res.ok) return;
        const stats = await res.json();
        const el = document.getElementById('tracking-stats');
        if (el) {
          el.innerHTML = `
            <div class="stat-grid">
              <div class="stat"><div class="stat-value">${stats.sent || 0}</div><div class="stat-label">Sent</div></div>
              <div class="stat"><div class="stat-value">${stats.opened || 0}</div><div class="stat-label">Opened</div></div>
              <div class="stat"><div class="stat-value">${stats.clicked || 0}</div><div class="stat-label">Clicked</div></div>
              <div class="stat"><div class="stat-value">${stats.bounced || 0}</div><div class="stat-label">Bounced</div></div>
            </div>
          `;
        }
      } catch (e) { /* silent */ }
    }

    function render(c) {
      const costStr = '$' + c.cost_dollars;
      let statusExtra = '';
      if (c.rejection_reason) {
        statusExtra = `<div class="rejection-reason"><strong>Reason:</strong> ${esc(c.rejection_reason)}</div>`;
      }
      document.getElementById('content').innerHTML = `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <strong>${esc(c.campaign_name)}</strong>
            <span class="status-badge status-${c.status}">${c.status.replace('_', ' ')}</span>
          </div>
          <div class="stat-grid">
            <div class="stat"><div class="stat-value">${c.recipient_count.toLocaleString()}</div><div class="stat-label">Recipients</div></div>
            <div class="stat"><div class="stat-value">${costStr}</div><div class="stat-label">Cost</div></div>
          </div>
          ${statusExtra}
        </div>
        <div class="card tracking-stats" id="tracking-stats" style="${['sending','completed'].includes(c.status) ? '' : 'display:none'}">
          <div class="loading">Loading stats...</div>
        </div>
      `;
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    load();
  </script>
</body>
</html>
```

- [ ] **Step 2: Create `routes/public-pages.mjs`**

```javascript
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getClientCampaign } from '../db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const statusHtml = readFileSync(join(__dirname, '..', 'public', 'campaign-status.html'), 'utf8');

const router = Router();

// Serve status page
router.get('/campaign/:id', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Campaign not found');
  res.type('html').send(statusHtml);
});

// Stats endpoint for the status page JS to fetch
router.get('/api/public/campaign/:id/stats', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  if (!campaign.internal_campaign_id) return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });

  // Query the internal campaigns table for stats
  const { default: db } = await import('../db.mjs');
  // This needs to use the existing campaign stats query pattern
  // The internal campaigns table tracks sent/opened/clicked/bounced counts
  const internal = db.prepare?.('SELECT sent, opened, clicked, bounced FROM campaigns WHERE id = ?')?.get(campaign.internal_campaign_id);
  if (!internal) return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
  res.json({ sent: internal.sent, opened: internal.opened, clicked: internal.clicked, bounced: internal.bounced });
});

export default router;
```

**Wait** — that stats endpoint uses top-level `await` inside a non-async handler and a dynamic import that's wrong. Let me fix it:

- [ ] **Step 2 (corrected): Create `routes/public-pages.mjs`**

```javascript
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getClientCampaign } from '../db.mjs';
import Database from 'better-sqlite3';
import { config } from '../config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const statusHtml = readFileSync(join(__dirname, '..', 'public', 'campaign-status.html'), 'utf8');

const router = Router();

// Serve status page
router.get('/campaign/:id', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Campaign not found');
  res.type('html').send(statusHtml);
});

// Stats endpoint — reads from internal campaigns table
router.get('/api/public/campaign/:id/stats', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  if (!campaign.internal_campaign_id) return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });

  // Use the existing db export to query internal campaign
  // The campaigns table has: sent, opened, clicked, bounced columns
  try {
    const db = new Database(config.dbPath, { readonly: true });
    const internal = db.prepare('SELECT sent, opened, clicked, bounced FROM campaigns WHERE id = ?').get(campaign.internal_campaign_id);
    db.close();
    if (!internal) return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
    res.json(internal);
  } catch (err) {
    console.error('Stats query error:', err);
    res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
  }
});

export default router;
```

- [ ] **Step 3: Mount in `server.mjs`**

Add import and mount:

```javascript
import publicPages from './routes/public-pages.mjs';
// Mount AFTER other routes but BEFORE 404 handler
app.use(publicPages);
```

- [ ] **Step 4: Create `public/` directory and verify**

```bash
mkdir -p ~/.openclaw/tools/email/mail-service/public
# Verify the HTML file is in place
ls -la ~/.openclaw/tools/email/mail-service/public/campaign-status.html
```

- [ ] **Step 5: Test status page**

Restart mail service. Open browser to `http://localhost:18791/campaign/test-id`.

Expected: HTML page loads, shows "Campaign not found" error state (since test-id doesn't exist).

- [ ] **Step 6: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add public/campaign-status.html routes/public-pages.mjs server.mjs
git commit -m "feat: add client-facing campaign status page with live tracking stats"
```

---

## Task 6: Campaign Execution Bridge

When Kurt approves a campaign (via the authed `/approve` endpoint), the system needs to:
1. Import the client's CSV into the contacts system
2. Create an internal campaign linked to the client campaign
3. Start sending

This bridges the client-facing `client_campaigns` table to the existing internal campaign engine.

**Files:**
- Create: `~/.openclaw/tools/email/mail-service/lib/campaign-bridge.mjs`
- Modify: `~/.openclaw/tools/email/mail-service/routes/public-campaigns.mjs` (update approve endpoint)

- [ ] **Step 1: Create `lib/campaign-bridge.mjs`**

```javascript
import { getClientCampaign, updateClientCampaign } from '../db.mjs';
import { notifyCampaignStatus } from './telegram-notify.mjs';
import { config } from '../config.mjs';

const API = `http://localhost:${config.port}/api`;

async function apiCall(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

export async function executeClientCampaign(campaignId) {
  const campaign = getClientCampaign(campaignId);
  if (!campaign || campaign.status !== 'approved') {
    throw new Error(`Campaign ${campaignId} not in approved state`);
  }

  try {
    // 1. Import CSV contacts into a dedicated list
    const listSlug = `client-${campaignId.slice(0, 8)}`;
    const importResult = await apiCall('/contacts/import', 'POST', {
      csv: campaign.csv_data,
      list_slug: listSlug,
      source: `client-campaign:${campaign.company_name}`,
    });

    // 2. Create internal campaign
    const internalCampaign = await apiCall('/campaigns', 'POST', {
      name: `[CLIENT] ${campaign.campaign_name}`,
      list_slug: listSlug,
      provider: 'bluehost',
      from_name: 'Kurt Ivy | Web3 Advisory',
      reply_to: 'kurt@web3advisory.co',
      subject_template: campaign.subject_line,
      text_template: campaign.email_body_text || '',
      html_template: campaign.email_body_html || '',
    });

    if (!internalCampaign.id) {
      throw new Error('Failed to create internal campaign: ' + JSON.stringify(internalCampaign));
    }

    // 3. Link internal campaign to client campaign
    updateClientCampaign(campaignId, {
      internal_campaign_id: internalCampaign.id,
      status: 'sending',
    });

    // 4. Approve and start sending
    await apiCall(`/campaigns/${internalCampaign.id}/approve`, 'POST');
    await apiCall(`/campaigns/${internalCampaign.id}/send`, 'POST');

    await notifyCampaignStatus(campaign, 'SENDING', `Internal campaign ${internalCampaign.id} started.`);

    return { internalCampaignId: internalCampaign.id };
  } catch (err) {
    console.error('Campaign execution failed:', err);
    updateClientCampaign(campaignId, { status: 'approved' }); // revert to approved so it can be retried
    await notifyCampaignStatus(campaign, 'ERROR', err.message);
    throw err;
  }
}
```

- [ ] **Step 2: Update the approve endpoint in `routes/public-campaigns.mjs`**

Replace the existing approve handler with:

```javascript
import { executeClientCampaign } from '../lib/campaign-bridge.mjs';

// In the approve handler, after updating status to 'approved':
router.post('/api/campaigns/client/:id/approve', requireAuth, async (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'paid') return res.status(400).json({ error: `Cannot approve campaign in status: ${campaign.status}` });

  updateClientCampaign(campaign.id, { status: 'approved', approved_at: new Date().toISOString() });

  // Start execution asynchronously
  executeClientCampaign(campaign.id).catch(err => {
    console.error('Async campaign execution failed:', err);
  });

  res.json({ status: 'approved', message: 'Campaign approved and sending started' });
});
```

Add the import at the top of `routes/public-campaigns.mjs`:
```javascript
import { executeClientCampaign } from '../lib/campaign-bridge.mjs';
```

- [ ] **Step 3: Commit**

```bash
cd ~/.openclaw/tools/email/mail-service
git add lib/campaign-bridge.mjs routes/public-campaigns.mjs
git commit -m "feat: add campaign bridge to link client campaigns to internal sending engine"
```

---

## Task 7: Campaign Submission Form (Bluehost)

Create the static HTML form that lives on the Web3Advisory site. This is pure client-side HTML/CSS/JS that POSTs to the mail service via the Cloudflare tunnel.

**Files:**
- Create: `~/.openclaw/tools/email/campaign-form/index.html`
- Create: `~/.openclaw/tools/email/campaign-form/form.js`
- Create: `~/.openclaw/tools/email/campaign-form/style.css`

These files will be uploaded to Bluehost manually.

- [ ] **Step 1: Create `campaign-form/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Campaign Service — Web3Advisory</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>Web3Advisory</h1>
      <p class="tagline">Email Campaign Infrastructure for Web3 Projects</p>
    </header>

    <section class="pitch">
      <h2>Send at scale without landing in spam.</h2>
      <p>You bring the list and the content. We provide warmed sender accounts, deliverability optimization, compliance enforcement, and real-time tracking.</p>
      <ul>
        <li>10 rotating warmed sender accounts</li>
        <li>Open and click tracking</li>
        <li>CAN-SPAM and GDPR compliant</li>
        <li>Bounce monitoring and auto-handling</li>
        <li>Template variables for personalization</li>
      </ul>
      <p class="pricing"><strong>$30 per 1,000 emails</strong> &mdash; minimum 1,000 recipients</p>
    </section>

    <form id="campaign-form">
      <h2>Submit a Campaign</h2>

      <div class="form-group">
        <label for="company_name">Company Name *</label>
        <input type="text" id="company_name" name="company_name" required>
      </div>

      <div class="form-group">
        <label for="contact_email">Your Email *</label>
        <input type="email" id="contact_email" name="contact_email" required>
      </div>

      <div class="form-group">
        <label for="campaign_name">Campaign Name *</label>
        <input type="text" id="campaign_name" name="campaign_name" required placeholder="e.g. Token Launch Announcement">
      </div>

      <div class="form-group">
        <label for="campaign_description">Description</label>
        <textarea id="campaign_description" name="campaign_description" rows="2" placeholder="Brief description of this campaign"></textarea>
      </div>

      <div class="form-group">
        <label for="subject_line">Email Subject Line *</label>
        <input type="text" id="subject_line" name="subject_line" required placeholder="Supports {{first_name}}, {{company}} variables">
      </div>

      <div class="form-group">
        <label for="email_body">Email Body (HTML or plain text) *</label>
        <textarea id="email_body" name="email_body" rows="10" required placeholder="Your email content. Use {{first_name}}, {{company}}, {{name}} for personalization. Unsubscribe link is added automatically."></textarea>
      </div>

      <div class="form-group">
        <label for="csv_file">Recipient List (CSV) *</label>
        <input type="file" id="csv_file" accept=".csv" required>
        <p class="hint">Must have an "email" column. Optional: first_name, name, company, role.</p>
      </div>

      <div class="form-group">
        <label for="send_date">Desired Send Date</label>
        <input type="date" id="send_date" name="send_date">
        <p class="hint">Leave blank for ASAP (after approval)</p>
      </div>

      <div id="cost-preview" class="cost-preview" style="display:none">
        <span id="recipient-count">0</span> recipients &mdash; <strong>$<span id="cost-amount">0</span></strong>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="tos_accepted" required>
          I confirm that my recipient list was legitimately sourced, all recipients have opted in to receive communications, and my content complies with applicable anti-spam laws.
        </label>
      </div>

      <button type="submit" id="submit-btn">Submit & Pay</button>
      <div id="error-msg" class="error-msg" style="display:none"></div>
    </form>
  </div>
  <script src="form.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `campaign-form/style.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; }
.container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
header { margin-bottom: 2rem; }
h1 { font-size: 2rem; color: #fff; }
.tagline { color: #888; font-size: 1rem; }
.pitch { margin-bottom: 2.5rem; }
.pitch h2 { color: #fff; font-size: 1.3rem; margin-bottom: 0.5rem; }
.pitch ul { margin: 1rem 0; padding-left: 1.5rem; }
.pitch li { margin-bottom: 0.3rem; color: #ccc; }
.pricing { font-size: 1.1rem; color: #4caf50; margin-top: 1rem; }
form { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 2rem; }
form h2 { color: #fff; margin-bottom: 1.5rem; font-size: 1.2rem; }
.form-group { margin-bottom: 1.25rem; }
label { display: block; margin-bottom: 0.3rem; color: #ccc; font-size: 0.9rem; }
input[type="text"], input[type="email"], input[type="date"], textarea { width: 100%; padding: 0.6rem 0.8rem; background: #111; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 0.95rem; font-family: inherit; }
input:focus, textarea:focus { outline: none; border-color: #4caf50; }
input[type="file"] { padding: 0.5rem 0; background: none; border: none; color: #ccc; }
.hint { font-size: 0.8rem; color: #666; margin-top: 0.25rem; }
.checkbox-label { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.85rem; color: #aaa; cursor: pointer; }
.checkbox-label input { margin-top: 0.2rem; }
.cost-preview { background: #0d1f0d; border: 1px solid #2e7d32; border-radius: 4px; padding: 0.8rem 1rem; margin-bottom: 1.25rem; text-align: center; font-size: 1rem; }
button[type="submit"] { width: 100%; padding: 0.8rem; background: #4caf50; color: #fff; border: none; border-radius: 4px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 1rem; }
button[type="submit"]:hover { background: #43a047; }
button[type="submit"]:disabled { background: #333; color: #666; cursor: not-allowed; }
.error-msg { color: #ef5350; margin-top: 0.75rem; font-size: 0.9rem; }
```

- [ ] **Step 3: Create `campaign-form/form.js`**

```javascript
const API_BASE = 'https://track.web3advisory.co';
const PRICE_PER_THOUSAND_CENTS = 3000;
const MINIMUM_RECIPIENTS = 1000;

let csvText = null;
let recipientCount = 0;

document.getElementById('csv_file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    csvText = ev.target.result;
    const lines = csvText.trim().split('\n');
    recipientCount = lines.length - 1;

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    if (!headers.includes('email')) {
      showError('CSV must have an "email" column.');
      csvText = null;
      recipientCount = 0;
      document.getElementById('cost-preview').style.display = 'none';
      return;
    }

    hideError();
    const costCents = Math.ceil(recipientCount / 1000) * PRICE_PER_THOUSAND_CENTS;
    document.getElementById('recipient-count').textContent = recipientCount.toLocaleString();
    document.getElementById('cost-amount').textContent = (costCents / 100).toFixed(2);
    document.getElementById('cost-preview').style.display = 'block';
  };
  reader.readAsText(file);
});

document.getElementById('campaign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  if (!csvText) { showError('Please upload a CSV file.'); return; }
  if (recipientCount < MINIMUM_RECIPIENTS) { showError(`Minimum ${MINIMUM_RECIPIENTS} recipients. You have ${recipientCount}.`); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const emailBody = document.getElementById('email_body').value;
  const isHtml = /<[a-z][\s\S]*>/i.test(emailBody);

  const payload = {
    company_name: document.getElementById('company_name').value.trim(),
    contact_email: document.getElementById('contact_email').value.trim(),
    campaign_name: document.getElementById('campaign_name').value.trim(),
    campaign_description: document.getElementById('campaign_description').value.trim(),
    subject_line: document.getElementById('subject_line').value.trim(),
    email_body_html: isHtml ? emailBody : null,
    email_body_text: isHtml ? null : emailBody,
    csv_data: csvText,
    send_date: document.getElementById('send_date').value || null,
    tos_accepted: document.getElementById('tos_accepted').checked,
  };

  try {
    const res = await fetch(`${API_BASE}/api/public/submit-campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) { showError(data.error || 'Submission failed'); btn.disabled = false; btn.textContent = 'Submit & Pay'; return; }

    // Redirect to Stripe Checkout
    window.location.href = data.checkout_url;
  } catch (err) {
    showError('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Submit & Pay';
  }
});

function showError(msg) { const el = document.getElementById('error-msg'); el.textContent = msg; el.style.display = 'block'; }
function hideError() { document.getElementById('error-msg').style.display = 'none'; }
```

- [ ] **Step 4: Commit**

```bash
cd ~/.openclaw/tools/email
git add campaign-form/
git commit -m "feat: add campaign submission form for Web3Advisory site (Bluehost)"
```

---

## Task 8: Environment Setup & Stripe Account Configuration

Set up the required environment variables and Stripe account.

**Files:**
- Modify: `~/.openclaw/tools/email/mail-service/.env` (or wherever env vars are managed)

- [ ] **Step 1: Create Stripe account and get keys**

1. Go to https://dashboard.stripe.com/ (or create account if needed)
2. Get the **Secret Key** from Developers > API Keys
3. Create a webhook endpoint:
   - URL: `https://track.web3advisory.co/api/webhooks/stripe`
   - Events: `checkout.session.completed`
4. Get the **Webhook Signing Secret**

- [ ] **Step 2: Set environment variables**

Add to the mail service startup environment (however it's currently launched — likely the Windows Task Scheduler or a PowerShell script):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The `TELEGRAM_BOT_TOKEN` should already be available since the bot is running.

- [ ] **Step 3: Verify Stripe webhook reachability**

Use the Stripe CLI to test:

```bash
stripe trigger checkout.session.completed --webhook-endpoint=https://track.web3advisory.co/api/webhooks/stripe
```

Or test with a real $30 Checkout by submitting a test campaign.

- [ ] **Step 4: Document env vars**

Add a note to the mail service config or a README:

```
Required env vars for client campaign service:
  STRIPE_SECRET_KEY — Stripe API secret key
  STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret
  TELEGRAM_BOT_TOKEN — Telegram Bot API token (existing)
  OPENCLAW_GATEWAY_TOKEN — Mail API auth token (existing)
```

- [ ] **Step 5: Commit any config changes**

```bash
cd ~/.openclaw/tools/email/mail-service
git add -A
git commit -m "docs: add env var requirements for client campaign service"
```

---

## Task 9: Upload Form to Bluehost & End-to-End Test

Upload the campaign form files to the Bluehost website and run a full end-to-end test.

- [ ] **Step 1: Upload form files to Bluehost**

Access Bluehost cPanel or SFTP. Upload the three files from `campaign-form/` to the web3advisory.co site. Suggested path: `public_html/campaigns/` so the form is at `https://web3advisory.co/campaigns/`.

Files to upload:
- `index.html`
- `style.css`
- `form.js`

- [ ] **Step 2: Verify form loads**

Navigate to `https://web3advisory.co/campaigns/` in a browser. The form should render with all fields, pricing info, and the "Submit & Pay" button.

- [ ] **Step 3: End-to-end test with a small campaign**

Create a test CSV with 1,000 rows (can be test emails to yourself). Use Stripe test mode keys first if preferred.

1. Fill out form with test data
2. Upload CSV
3. Verify cost preview shows "$30.00"
4. Click "Submit & Pay"
5. Verify redirect to Stripe Checkout
6. Complete payment
7. Verify Telegram notification arrives with campaign details
8. Approve via Mail API: `curl -X POST http://localhost:18791/api/campaigns/client/{id}/approve -H "Authorization: Bearer $TOKEN"`
9. Verify campaign starts sending
10. Check status page at `https://track.web3advisory.co/campaign/{id}`

- [ ] **Step 4: Test rejection flow**

Submit another test campaign. Reject it:

```bash
curl -X POST http://localhost:18791/api/campaigns/client/{id}/reject \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test rejection"}'
```

Verify:
- Stripe refund is issued
- Status page shows "refunded" with reason
- Telegram notification confirms rejection

- [ ] **Step 5: Commit any fixes from testing**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end testing"
```

---

## Task 10: Claudia Skill for Campaign Management

Create a custom skill so Claudia can approve/reject campaigns via Telegram commands and monitor active campaigns.

**Files:**
- Create: `~/kurtclaw/custom-skills/client-campaigns/SKILL.md`

- [ ] **Step 1: Create the skill**

```markdown
---
name: client-campaigns
description: Manage paid client email campaigns — approve, reject, check status
triggers:
  - /approve
  - /reject
  - client campaign
  - campaign status
---

# Client Campaign Management

## Context

Paid email campaigns submitted via https://web3advisory.co/campaigns/.
Campaigns arrive as Telegram notifications after Stripe payment.

## Commands

### Approve a campaign

When Kurt sends `/approve {campaign_id}`:

1. Call `POST http://localhost:18791/api/campaigns/client/{id}/approve`
   with header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. This triggers the campaign bridge which:
   - Imports the client's CSV contacts
   - Creates an internal campaign
   - Starts sending
3. Confirm to Kurt via Telegram

### Reject a campaign

When Kurt sends `/reject {campaign_id} {reason}`:

1. Call `POST http://localhost:18791/api/campaigns/client/{id}/reject`
   with body `{"reason": "{reason}"}`
   and header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. This refunds via Stripe and notifies the client
3. Confirm to Kurt via Telegram

### Check campaign status

When Kurt asks about campaign status:

1. Call `GET http://localhost:18791/api/campaigns/client/{id}`
   with header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. Report: status, recipient count, cost, tracking stats if sending/completed
3. If internal_campaign_id exists, also check `GET http://localhost:18791/api/campaigns/{internal_id}` for detailed send progress

## Safety

- Always confirm the campaign ID before approving
- Never auto-approve campaigns
- On reject, always include a reason
```

- [ ] **Step 2: Commit**

```bash
cd ~/kurtclaw
git add custom-skills/client-campaigns/
git commit -m "feat: add Claudia skill for managing paid client campaigns"
```

---

## Summary

| Task | What it does | Time estimate |
|------|-------------|---------------|
| 1 | Database schema for client campaigns | 15 min |
| 2 | Stripe Checkout + webhooks + refunds | 20 min |
| 3 | Telegram notification module | 10 min |
| 4 | Public API routes (submit, webhook, status, approve/reject) | 30 min |
| 5 | Client status page (HTML + auto-refresh) | 20 min |
| 6 | Campaign execution bridge (link client → internal engine) | 20 min |
| 7 | Web form (HTML/CSS/JS for Bluehost) | 25 min |
| 8 | Stripe account + env vars | 15 min |
| 9 | Upload to Bluehost + e2e test | 30 min |
| 10 | Claudia skill for Telegram management | 10 min |

**Total estimated: ~3 hours**

After this is live, the flow is:
1. Client visits web3advisory.co/campaigns/
2. Fills form, uploads CSV, pays via Stripe
3. Kurt gets Telegram notification
4. Kurt replies `/approve {id}` or `/reject {id} reason`
5. Campaign sends through existing infrastructure
6. Client tracks progress at track.web3advisory.co/campaign/{id}
