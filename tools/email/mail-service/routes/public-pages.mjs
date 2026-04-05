// Claudia Mail — Public Status Pages
// Serves campaign status HTML and public stats API

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getClientCampaign, get } from '../db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const statusHtml = readFileSync(join(__dirname, '..', 'public', 'campaign-status.html'), 'utf8');

const router = Router();

// GET /campaign/:id — serve status page HTML
router.get('/campaign/:id', (req, res) => {
  const campaign = getClientCampaign(req.params.id);
  if (!campaign) return res.status(404).send('Campaign not found');
  res.type('html').send(statusHtml);
});

// GET /api/public/campaign/:id/stats — delivery stats for the status page JS
// NOTE: /api/public/campaign/:id (without /stats) is already handled by public-campaigns.mjs
router.get('/api/public/campaign/:id/stats', (req, res) => {
  try {
    const campaign = getClientCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Not found' });

    if (!campaign.internal_campaign_id) {
      return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
    }

    // internal_campaign_id is the slug of the internal campaigns table row
    const internal = get(
      'SELECT sent, opened, clicked, bounced, failed, total_contacts FROM campaigns WHERE slug = ?',
      campaign.internal_campaign_id
    );

    if (!internal) {
      return res.json({ sent: 0, opened: 0, clicked: 0, bounced: 0 });
    }

    return res.json({
      sent: internal.sent || 0,
      opened: internal.opened || 0,
      clicked: internal.clicked || 0,
      bounced: internal.bounced || 0,
    });
  } catch (err) {
    console.error('[public-pages] stats error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
