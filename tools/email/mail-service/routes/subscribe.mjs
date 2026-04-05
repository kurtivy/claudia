// Claudia Mail — Subscribe/Unsubscribe Routes (Public, no auth)
// Double opt-in subscribe, email verification, one-click unsubscribe

import { randomUUID } from 'node:crypto';
import express from 'express';
import { run, get, all } from '../db.mjs';
import { sendEmail } from '../lib/sender.mjs';
import config from '../config.mjs';

const router = express.Router();

// POST /api/subscribe — Subscribe to a list (sends verification email)
router.post('/subscribe', (req, res) => {
  try {
    const { email, name, list_slug } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (!list_slug) {
      return res.status(400).json({ error: 'list_slug required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Get or create list
    let list = get('SELECT id FROM lists WHERE slug = ?', list_slug);
    if (!list) {
      return res.status(400).json({ error: `List "${list_slug}" not found` });
    }

    // Check if already subscribed and verified
    let contact = get('SELECT id, verified, global_optout FROM contacts WHERE email = ?', normalizedEmail);

    if (contact && contact.global_optout) {
      // Respect global opt-out
      return res.json({ message: 'Subscription request received' }); // Don't reveal opt-out status
    }

    if (!contact) {
      // Create contact
      const verifyToken = randomUUID();
      run(
        `INSERT INTO contacts (email, name, source, verify_token) VALUES (?, ?, 'subscribe-api', ?)`,
        normalizedEmail, name || null, verifyToken
      );
      contact = get('SELECT id, verified, verify_token FROM contacts WHERE email = ?', normalizedEmail);
    }

    // Add to list (unverified)
    const membership = get(
      'SELECT contact_id, subscribed FROM list_members WHERE contact_id = ? AND list_id = ?',
      contact.id, list.id
    );

    if (membership && membership.subscribed) {
      // Already subscribed
      return res.json({ message: 'Already subscribed' });
    }

    if (membership) {
      // Re-subscribe
      run(
        `UPDATE list_members SET subscribed = 1, subscribed_at = datetime('now'), unsubscribed_at = NULL
         WHERE contact_id = ? AND list_id = ?`,
        contact.id, list.id
      );
    } else {
      run('INSERT INTO list_members (contact_id, list_id) VALUES (?, ?)', contact.id, list.id);
    }

    // If not verified, send verification email
    if (!contact.verified) {
      let verifyToken = contact.verify_token;
      if (!verifyToken) {
        verifyToken = randomUUID();
        run('UPDATE contacts SET verify_token = ? WHERE id = ?', verifyToken, contact.id);
      }

      // Send verification email (async, don't block response)
      if (config.publicUrl) {
        const verifyUrl = `${config.publicUrl}/api/verify/${verifyToken}`;
        sendEmail('bluehost', {
          to: normalizedEmail,
          subject: 'Confirm your subscription',
          textBody: `Please confirm your subscription by clicking this link:\n\n${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
          htmlBody: `<p>Please confirm your subscription by clicking the link below:</p><p><a href="${verifyUrl}">Confirm Subscription</a></p><p>If you didn't request this, you can ignore this email.</p>`,
          fromName: 'Web3 Advisory',
        }).catch(err => {
          console.error(`[subscribe] Failed to send verification to ${normalizedEmail}: ${err.message}`);
        });
      }
    }

    res.json({ message: 'Subscription request received. Please check your email to confirm.' });
  } catch (err) {
    console.error(`[subscribe] Error: ${err.message}`);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

// GET /api/verify/:token — Confirm double opt-in
router.get('/verify/:token', (req, res) => {
  try {
    const { token } = req.params;

    const contact = get('SELECT id, email FROM contacts WHERE verify_token = ?', token);
    if (!contact) {
      return res.status(400).send(
        '<html><body><h2>Invalid or expired verification link.</h2></body></html>'
      );
    }

    // Mark as verified
    run(
      `UPDATE contacts SET verified = 1, verify_token = NULL, updated_at = datetime('now')
       WHERE id = ?`,
      contact.id
    );

    res.send(
      `<html><body><h2>Subscription confirmed!</h2><p>${contact.email} has been verified.</p></body></html>`
    );
  } catch (err) {
    console.error(`[subscribe] Verify error: ${err.message}`);
    res.status(500).send('<html><body><h2>Verification failed.</h2></body></html>');
  }
});

// GET /api/unsubscribe/:trackingId — One-click unsubscribe (from email link)
router.get('/unsubscribe/:trackingId', (req, res) => {
  try {
    const { trackingId } = req.params;

    // Find the send record
    const send = get(
      `SELECT s.contact_id, s.campaign_id, c.list_id
       FROM sends s
       JOIN campaigns c ON c.id = s.campaign_id
       WHERE s.tracking_id = ?`,
      trackingId
    );

    if (!send) {
      return res.send(
        '<html><body><h2>Unsubscribe</h2><p>We could not find your subscription. You may have already been unsubscribed.</p></body></html>'
      );
    }

    // Unsubscribe from the campaign's list
    if (send.list_id) {
      run(
        `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
         WHERE contact_id = ? AND list_id = ?`,
        send.contact_id, send.list_id
      );
    }

    // Update campaign unsubscribe count
    if (send.campaign_id) {
      run('UPDATE campaigns SET unsubscribed = unsubscribed + 1 WHERE id = ?', send.campaign_id);
    }

    // Get contact email for display
    const contact = get('SELECT email FROM contacts WHERE id = ?', send.contact_id);

    res.send(
      `<html><body><h2>Unsubscribed</h2><p>${contact?.email || 'You'} have been unsubscribed from this mailing list.</p><p>To unsubscribe from all emails, <a href="/api/unsubscribe?email=${encodeURIComponent(contact?.email || '')}&scope=all">click here</a>.</p></body></html>`
    );
  } catch (err) {
    console.error(`[subscribe] Unsubscribe error: ${err.message}`);
    res.status(500).send('<html><body><h2>Unsubscribe failed.</h2></body></html>');
  }
});

// POST /api/unsubscribe — Unsubscribe by email (global or list-specific)
// Also handles GET with query params for the "unsubscribe from all" link
router.all('/unsubscribe', (req, res) => {
  try {
    const email = (req.body?.email || req.query?.email || '').trim().toLowerCase();
    const scope = req.body?.scope || req.query?.scope || 'all';

    if (!email) {
      return res.status(400).json({ error: 'email required' });
    }

    const contact = get('SELECT id FROM contacts WHERE email = ?', email);
    if (!contact) {
      // Don't reveal whether the email exists
      if (req.headers.accept?.includes('html') || req.method === 'GET') {
        return res.send('<html><body><h2>Unsubscribed</h2><p>You have been unsubscribed.</p></body></html>');
      }
      return res.json({ message: 'Unsubscribed' });
    }

    if (scope === 'all' || scope === 'global') {
      // Global opt-out
      run(
        `UPDATE contacts SET global_optout = 1, optout_date = datetime('now') WHERE id = ?`,
        contact.id
      );
      // Unsubscribe from all lists
      run(
        `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
         WHERE contact_id = ?`,
        contact.id
      );
    } else {
      // List-specific unsubscribe
      const list = get('SELECT id FROM lists WHERE slug = ?', scope);
      if (list) {
        run(
          `UPDATE list_members SET subscribed = 0, unsubscribed_at = datetime('now')
           WHERE contact_id = ? AND list_id = ?`,
          contact.id, list.id
        );
      }
    }

    if (req.headers.accept?.includes('html') || req.method === 'GET') {
      return res.send('<html><body><h2>Unsubscribed</h2><p>You have been unsubscribed from all future emails.</p></body></html>');
    }
    res.json({ message: 'Unsubscribed', scope });
  } catch (err) {
    console.error(`[subscribe] Unsubscribe error: ${err.message}`);
    res.status(500).json({ error: 'Unsubscribe failed' });
  }
});

export default router;
