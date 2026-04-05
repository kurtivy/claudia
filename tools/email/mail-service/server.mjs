#!/usr/bin/env node
// Claudia Mail — Email Platform Server
// Express.js REST API on port 18791

import express from 'express';
import config from './config.mjs';
import { getDb } from './db.mjs';
import { runMigrations } from './lib/migration.mjs';
import statusRoutes from './routes/status.mjs';
import contactsRoutes from './routes/contacts.mjs';
import campaignsRoutes from './routes/campaigns.mjs';
import templatesRoutes from './routes/templates.mjs';
import trackingRoutes from './routes/tracking.mjs';
import webhooksRoutes from './routes/webhooks.mjs';
import subscribeRoutes from './routes/subscribe.mjs';
import { startImapPoller } from './lib/imap-poller.mjs';
import publicCampaignRoutes from './routes/public-campaigns.mjs';
import publicPages from './routes/public-pages.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Middleware ──

// Raw body capture for Stripe webhook — must be before express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  req.body = JSON.parse(req.body);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS for public campaign endpoints
app.use('/api/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://web3advisory.co');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (!req.path.includes('/api/t/')) { // Skip tracking pixel noise
      console.log(`[mail] ${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// Auth middleware (skip for public endpoints)
const publicPaths = ['/api/subscribe', '/api/verify', '/api/unsubscribe', '/api/t/', '/api/c/', '/api/webhooks/', '/api/status', '/api/public/', '/campaign/', '/campaigns'];

function authMiddleware(req, res, next) {
  // Public paths skip auth
  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || token !== config.authToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(authMiddleware);

// ── Routes ──

app.use('/api', statusRoutes);
app.use('/api', contactsRoutes);
app.use('/api', campaignsRoutes);
app.use('/api', templatesRoutes);
app.use('/api', trackingRoutes);
app.use('/api', webhooksRoutes);
app.use('/api', subscribeRoutes);
app.use(publicCampaignRoutes);
app.use(publicPages);

// Serve campaign submission form at /campaigns/
app.use('/campaigns', express.static(join(__dirname, '..', 'campaign-form'), { maxAge: 0, etag: false }));

// Catch-all for unimplemented routes
app.use('/api', (req, res, next) => {
  // Catch unimplemented routes
  if (!res.headersSent) {
    res.status(404).json({ error: 'Not found', path: req.path });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[mail] Error: ${err.message}`);
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Startup ──

async function start() {
  console.log('[mail] Claudia Mail starting...');

  // Initialize database
  console.log('[mail] Initializing database...');
  getDb();

  // Run migrations (accounts.json + optouts.csv → DB)
  const migration = runMigrations();
  console.log('[mail] Migration result:', JSON.stringify(migration));

  // Start HTTP server
  app.listen(config.port, config.bind, () => {
    console.log(`[mail] Claudia Mail listening on ${config.bind}:${config.port}`);
    console.log(`[mail] Auth token: ${config.authToken ? '***' + config.authToken.slice(-8) : 'NONE (WARNING)'}`);
    console.log(`[mail] Resend API: ${config.resendApiKey ? 'configured' : 'not configured'}`);
    console.log(`[mail] Public URL: ${config.publicUrl || 'not configured (tracking disabled)'}`);

    // Start IMAP poller for Bluehost bounce/unsubscribe detection
    startImapPoller();
  });
}

start().catch(err => {
  console.error('[mail] Fatal startup error:', err);
  process.exit(1);
});

export default app;
