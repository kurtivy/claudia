// Claudia Mail — Webhook Routes (Public, no auth)
// Receives events from Resend (delivered, opened, clicked, bounced, complained)

import express from 'express';
import { run, get } from '../db.mjs';
import config from '../config.mjs';

const router = express.Router();

// POST /api/webhooks/resend — Resend event webhook
router.post('/webhooks/resend', (req, res) => {
  try {
    const event = req.body;

    if (!event || !event.type) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Optional: verify webhook signature
    // Resend sends a `svix-signature` header for verification
    // For now, we accept all valid-looking payloads

    const eventType = event.type;
    const data = event.data || {};
    const emailId = data.email_id || data.id;

    console.log(`[webhook] Resend event: ${eventType} for ${emailId || 'unknown'}`);

    // Find the send record by message_id
    let send = null;
    if (emailId) {
      send = get('SELECT id, campaign_id, contact_id FROM sends WHERE message_id = ?', emailId);
    }

    // Also try to find by the 'to' email if no match by message_id
    if (!send && data.to && data.to.length > 0) {
      const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;
      // Find the most recent send to this email
      const contact = get('SELECT id FROM contacts WHERE email = ?', toEmail);
      if (contact) {
        send = get(
          `SELECT id, campaign_id, contact_id FROM sends
           WHERE contact_id = ? AND status IN ('sent', 'queued')
           ORDER BY id DESC LIMIT 1`,
          contact.id
        );
      }
    }

    switch (eventType) {
      case 'email.delivered':
        if (send) {
          run(`UPDATE sends SET status = 'sent' WHERE id = ? AND status = 'queued'`, send.id);
        }
        break;

      case 'email.opened':
        if (send) {
          // Only count first open
          const existing = get('SELECT opened_at FROM sends WHERE id = ?', send.id);
          if (existing && !existing.opened_at) {
            run(`UPDATE sends SET opened_at = datetime('now') WHERE id = ?`, send.id);
            if (send.campaign_id) {
              run('UPDATE campaigns SET opened = opened + 1 WHERE id = ?', send.campaign_id);
            }
          }
        }
        break;

      case 'email.clicked':
        if (send) {
          const existing = get('SELECT clicked_at FROM sends WHERE id = ?', send.id);
          if (existing && !existing.clicked_at) {
            run(`UPDATE sends SET clicked_at = datetime('now') WHERE id = ?`, send.id);
            if (send.campaign_id) {
              run('UPDATE campaigns SET clicked = clicked + 1 WHERE id = ?', send.campaign_id);
            }
          }
        }
        break;

      case 'email.bounced':
      case 'email.delivery_delayed':
        if (send) {
          const bounceType = eventType === 'email.bounced' ? 'bounced' : 'delayed';
          run(`UPDATE sends SET status = 'bounced', error = ? WHERE id = ?`,
            `${bounceType}: ${data.bounce_type || data.reason || 'unknown'}`, send.id);

          if (send.campaign_id) {
            run('UPDATE campaigns SET bounced = bounced + 1 WHERE id = ?', send.campaign_id);
          }

          // Increment contact bounce count
          if (send.contact_id) {
            run(
              `UPDATE contacts SET bounce_count = bounce_count + 1, last_bounce_at = datetime('now')
               WHERE id = ?`,
              send.contact_id
            );

            // Auto-optout on hard bounce (3+ bounces)
            const contact = get('SELECT bounce_count FROM contacts WHERE id = ?', send.contact_id);
            if (contact && contact.bounce_count >= 3) {
              run(
                `UPDATE contacts SET global_optout = 1, optout_date = datetime('now')
                 WHERE id = ? AND global_optout = 0`,
                send.contact_id
              );
              console.log(`[webhook] Contact ${send.contact_id} auto-opted out after ${contact.bounce_count} bounces`);
            }
          }
        }
        break;

      case 'email.complained':
        // Spam complaint — immediately opt out
        if (send && send.contact_id) {
          run(
            `UPDATE contacts SET global_optout = 1, optout_date = datetime('now')
             WHERE id = ? AND global_optout = 0`,
            send.contact_id
          );

          if (send.campaign_id) {
            run('UPDATE campaigns SET unsubscribed = unsubscribed + 1 WHERE id = ?', send.campaign_id);
          }

          console.log(`[webhook] Spam complaint — contact ${send.contact_id} opted out`);
        }
        break;

      default:
        console.log(`[webhook] Unhandled Resend event type: ${eventType}`);
    }

    res.json({ received: true, type: eventType });
  } catch (err) {
    console.error(`[webhook] Error processing Resend webhook: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export default router;
