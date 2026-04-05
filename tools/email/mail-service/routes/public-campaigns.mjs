// Claudia Mail — Public Campaign Routes
// Handles client-facing campaign submission, Stripe webhook, and admin approval/rejection

import { Router } from 'express';
import { createClientCampaign, getClientCampaign, updateClientCampaign, getClientCampaignByStripeSession } from '../db.mjs';
import { createCheckoutSession, constructWebhookEvent, refundPayment } from '../lib/stripe.mjs';
import { notifyCampaignPaid, notifyCampaignStatus } from '../lib/telegram-notify.mjs';
import { executeClientCampaign } from '../lib/campaign-bridge.mjs';
import { config } from '../config.mjs';

const router = Router();

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== config.authToken) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Parse CSV header row to extract column names
function parseCsvHeaders(csvData) {
  const firstLine = csvData.split('\n')[0] || '';
  return firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
}

// Count non-empty data rows (skip header)
function countCsvRows(csvData) {
  const lines = csvData.split('\n');
  // Skip header, count non-empty lines
  return lines.slice(1).filter(l => l.trim().length > 0).length;
}

// POST /api/public/submit-campaign — no auth
router.post('/api/public/submit-campaign', async (req, res) => {
  try {
    const {
      company_name,
      contact_email,
      campaign_name,
      campaign_description,
      subject_line,
      email_body_html,
      email_body_text,
      csv_data,
      send_date,
      tos_accepted,
    } = req.body;

    // Required field validation
    const missing = [];
    if (!company_name) missing.push('company_name');
    if (!contact_email) missing.push('contact_email');
    if (!campaign_name) missing.push('campaign_name');
    if (!subject_line) missing.push('subject_line');
    if (!csv_data) missing.push('csv_data');
    if (!tos_accepted) missing.push('tos_accepted');

    if (missing.length > 0) {
      return res.status(400).json({ error: 'Missing required fields', missing });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
      return res.status(400).json({ error: 'Invalid contact_email format' });
    }

    // Must have at least one of html or text body
    if (!email_body_html && !email_body_text) {
      return res.status(400).json({ error: 'Must provide email_body_html or email_body_text' });
    }

    // Validate CSV has email column
    const headers = parseCsvHeaders(csv_data);
    if (!headers.includes('email')) {
      return res.status(400).json({ error: 'CSV must contain an "email" column header' });
    }

    // Count recipients
    const recipientCount = countCsvRows(csv_data);
    if (recipientCount < config.minimumRecipients) {
      return res.status(400).json({
        error: `Minimum ${config.minimumRecipients.toLocaleString()} recipients required`,
        recipient_count: recipientCount,
        minimum: config.minimumRecipients,
      });
    }

    // Calculate cost
    const costCents = Math.ceil(recipientCount / 1000) * config.pricePerThousandCents;

    // Create campaign record
    const campaignId = createClientCampaign({
      company_name,
      contact_email,
      campaign_name,
      campaign_description,
      subject_line,
      email_body_html,
      email_body_text,
      csv_data,
      recipient_count: recipientCount,
      cost_cents: costCents,
      send_date,
      tos_accepted,
    });

    // Create Stripe Checkout session
    const { sessionId, checkoutUrl } = await createCheckoutSession({
      campaignId,
      recipientCount,
      contactEmail: contact_email,
    });

    // Store session ID on campaign
    updateClientCampaign(campaignId, { stripe_checkout_session_id: sessionId });

    return res.status(201).json({
      campaign_id: campaignId,
      recipient_count: recipientCount,
      cost_cents: costCents,
      cost_dollars: (costCents / 100).toFixed(2),
      checkout_url: checkoutUrl,
    });
  } catch (err) {
    console.error('[public-campaigns] submit-campaign error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// POST /api/webhooks/stripe — no auth, raw body captured by server.mjs middleware
router.post('/api/webhooks/stripe', async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = constructWebhookEvent(req.rawBody, signature);
  } catch (err) {
    console.error('[public-campaigns] Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const campaign = getClientCampaignByStripeSession(session.id);
      if (!campaign) {
        console.error('[public-campaigns] No campaign found for stripe session:', session.id);
        return res.status(200).json({ received: true }); // Acknowledge to Stripe anyway
      }

      updateClientCampaign(campaign.id, {
        status: 'paid',
        stripe_payment_intent_id: session.payment_intent || null,
      });

      const updatedCampaign = getClientCampaign(campaign.id);
      await notifyCampaignPaid(updatedCampaign);

      console.log(`[public-campaigns] Campaign ${campaign.id} marked paid via Stripe session ${session.id}`);
    } catch (err) {
      console.error('[public-campaigns] Error processing checkout.session.completed:', err.message);
      // Still return 200 so Stripe doesn't retry
    }
  }

  return res.status(200).json({ received: true });
});

// GET /api/public/campaign/:id — no auth, returns client-safe status
router.get('/api/public/campaign/:id', (req, res) => {
  try {
    const campaign = getClientCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Return only client-safe fields (no CSV data, no internal IDs)
    return res.json({
      id: campaign.id,
      company_name: campaign.company_name,
      campaign_name: campaign.campaign_name,
      subject_line: campaign.subject_line,
      recipient_count: campaign.recipient_count,
      cost_cents: campaign.cost_cents,
      cost_dollars: (campaign.cost_cents / 100).toFixed(2),
      send_date: campaign.send_date,
      status: campaign.status,
      created_at: campaign.created_at,
      approved_at: campaign.approved_at,
      completed_at: campaign.completed_at,
    });
  } catch (err) {
    console.error('[public-campaigns] get campaign error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// POST /api/campaigns/client/:id/approve — authed
router.post('/api/campaigns/client/:id/approve', requireAuth, async (req, res) => {
  try {
    const campaign = getClientCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'paid') {
      return res.status(400).json({
        error: `Cannot approve campaign with status "${campaign.status}"; must be "paid"`,
      });
    }

    updateClientCampaign(campaign.id, {
      status: 'approved',
      approved_at: new Date().toISOString(),
    });

    console.log(`[public-campaigns] Campaign ${campaign.id} approved — triggering execution bridge`);

    // Fire and forget: bridge imports CSV, creates internal campaign, starts sending
    // Errors are caught inside executeClientCampaign and reverted to 'approved' for retry
    executeClientCampaign(campaign.id).catch(err => {
      console.error(`[public-campaigns] Campaign bridge failed for ${campaign.id}:`, err.message);
    });

    return res.json({ success: true, status: 'approved' });
  } catch (err) {
    console.error('[public-campaigns] approve error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// POST /api/campaigns/client/:id/reject — authed
router.post('/api/campaigns/client/:id/reject', requireAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const campaign = getClientCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const refundableStatuses = ['paid', 'approved'];
    if (!refundableStatuses.includes(campaign.status)) {
      return res.status(400).json({
        error: `Cannot reject campaign with status "${campaign.status}"`,
      });
    }

    // Issue Stripe refund if payment intent exists
    if (campaign.stripe_payment_intent_id) {
      try {
        await refundPayment(campaign.stripe_payment_intent_id);
        console.log(`[public-campaigns] Refunded payment intent ${campaign.stripe_payment_intent_id} for campaign ${campaign.id}`);
      } catch (stripeErr) {
        console.error('[public-campaigns] Stripe refund failed:', stripeErr.message);
        // Don't block rejection — log and continue
      }
    }

    updateClientCampaign(campaign.id, {
      status: 'rejected',
      rejection_reason: reason || null,
    });

    const updated = getClientCampaign(campaign.id);
    await notifyCampaignStatus(updated, 'rejected', reason ? `Reason: ${reason}` : '');

    console.log(`[public-campaigns] Campaign ${campaign.id} rejected`);
    return res.json({ success: true, status: 'rejected' });
  } catch (err) {
    console.error('[public-campaigns] reject error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

export default router;
