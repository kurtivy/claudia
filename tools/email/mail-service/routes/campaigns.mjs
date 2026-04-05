// Claudia Mail — Campaign Routes
// Campaign CRUD, approval workflow, send control

import express from 'express';
import { run, get, all } from '../db.mjs';
import {
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignProgress,
  generateSamples,
} from '../lib/campaign-engine.mjs';

const router = express.Router();

// ── Campaign CRUD ──

// Create campaign
router.post('/campaigns', (req, res) => {
  try {
    const {
      slug, name, list_slug, provider, from_name, reply_to,
      subject_template, text_template, html_template, brief,
      template_slug, // optional: load from a saved template
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    // Generate slug from name if not provided
    const campaignSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const existing = get('SELECT id FROM campaigns WHERE slug = ?', campaignSlug);
    if (existing) {
      return res.status(409).json({ error: 'Campaign slug already exists', id: existing.id });
    }

    // Resolve list
    let listId = null;
    if (list_slug) {
      const list = get('SELECT id FROM lists WHERE slug = ?', list_slug);
      if (!list) {
        return res.status(400).json({ error: `List "${list_slug}" not found` });
      }
      listId = list.id;
    }

    // Optionally load subject/text/html from a saved template
    let subj = subject_template || null;
    let text = text_template || null;
    let html = html_template || null;

    if (template_slug) {
      const tpl = get('SELECT * FROM templates WHERE slug = ?', template_slug);
      if (tpl) {
        if (!subj) subj = tpl.subject;
        if (!text) text = tpl.text_body;
        if (!html) html = tpl.html_body;
      }
    }

    // Count contacts in the list
    let totalContacts = 0;
    if (listId) {
      const count = get(
        `SELECT COUNT(*) as count FROM contacts c
         JOIN list_members lm ON lm.contact_id = c.id AND lm.list_id = ? AND lm.subscribed = 1
         WHERE c.global_optout = 0 AND c.bounce_count < 3`,
        listId
      );
      totalContacts = count?.count || 0;
    }

    run(
      `INSERT INTO campaigns (slug, name, list_id, provider, from_name, reply_to,
                              subject_template, text_template, html_template, brief, total_contacts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      campaignSlug,
      name,
      listId,
      provider || 'bluehost',
      from_name || null,
      reply_to || null,
      subj,
      text,
      html,
      brief || null,
      totalContacts
    );

    const created = get('SELECT * FROM campaigns WHERE slug = ?', campaignSlug);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List campaigns
router.get('/campaigns', (req, res) => {
  try {
    const { status } = req.query;
    let campaigns;

    if (status) {
      campaigns = all(
        `SELECT id, slug, name, status, provider, total_contacts, sent, failed, opened,
                clicked, bounced, unsubscribed, started_at, completed_at, created_at
         FROM campaigns WHERE status = ? ORDER BY created_at DESC`,
        status
      );
    } else {
      campaigns = all(
        `SELECT id, slug, name, status, provider, total_contacts, sent, failed, opened,
                clicked, bounced, unsubscribed, started_at, completed_at, created_at
         FROM campaigns ORDER BY created_at DESC`
      );
    }

    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get campaign detail
router.get('/campaigns/:id', (req, res) => {
  try {
    const campaign = get(
      'SELECT * FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get list info
    let list = null;
    if (campaign.list_id) {
      list = get('SELECT slug, name FROM lists WHERE id = ?', campaign.list_id);
    }

    // Get progress
    const progress = getCampaignProgress(campaign.id);

    // Recent sends
    const recentSends = all(
      `SELECT s.id, s.status, s.sent_at, s.opened_at, s.clicked_at, s.error,
              c.email, c.name as contact_name,
              sa.email as sender_email
       FROM sends s
       JOIN contacts c ON c.id = s.contact_id
       LEFT JOIN sender_accounts sa ON sa.id = s.sender_account_id
       WHERE s.campaign_id = ?
       ORDER BY s.id DESC
       LIMIT 50`,
      campaign.id
    );

    res.json({
      ...campaign,
      list,
      progress,
      recent_sends: recentSends,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update campaign (only if draft or paused)
router.put('/campaigns/:id', (req, res) => {
  try {
    const campaign = get(
      'SELECT * FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!['draft', 'paused'].includes(campaign.status)) {
      return res.status(400).json({ error: `Cannot update campaign in "${campaign.status}" status` });
    }

    const {
      name, list_slug, provider, from_name, reply_to,
      subject_template, text_template, html_template, brief
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (provider !== undefined) { updates.push('provider = ?'); params.push(provider); }
    if (from_name !== undefined) { updates.push('from_name = ?'); params.push(from_name); }
    if (reply_to !== undefined) { updates.push('reply_to = ?'); params.push(reply_to); }
    if (subject_template !== undefined) { updates.push('subject_template = ?'); params.push(subject_template); }
    if (text_template !== undefined) { updates.push('text_template = ?'); params.push(text_template); }
    if (html_template !== undefined) { updates.push('html_template = ?'); params.push(html_template); }
    if (brief !== undefined) { updates.push('brief = ?'); params.push(brief); }

    if (list_slug !== undefined) {
      const list = get('SELECT id FROM lists WHERE slug = ?', list_slug);
      if (!list) {
        return res.status(400).json({ error: `List "${list_slug}" not found` });
      }
      updates.push('list_id = ?');
      params.push(list.id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(campaign.id);
    run(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = get('SELECT * FROM campaigns WHERE id = ?', campaign.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Campaign Workflow ──

// Generate sample emails
router.post('/campaigns/:id/samples', (req, res) => {
  try {
    const campaign = get(
      'SELECT id, status FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const count = parseInt(req.body?.count) || 3;
    const samples = generateSamples(campaign.id, count);

    // Mark as sampling
    if (campaign.status === 'draft') {
      run(`UPDATE campaigns SET status = 'sampling' WHERE id = ?`, campaign.id);
    }

    res.json({ campaign_id: campaign.id, samples });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve campaign (unlocks sending)
router.post('/campaigns/:id/approve', (req, res) => {
  try {
    const campaign = get(
      'SELECT id, status FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!['draft', 'sampling'].includes(campaign.status)) {
      return res.status(400).json({ error: `Campaign already in "${campaign.status}" status` });
    }

    const approver = req.body?.approved_by || 'api';

    run(
      `UPDATE campaigns SET status = 'approved', approved_by = ?, approved_at = datetime('now')
       WHERE id = ?`,
      approver, campaign.id
    );

    res.json({ success: true, status: 'approved', approved_by: approver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start sending
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const campaign = get(
      'SELECT id, status FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const result = await startCampaign(campaign.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pause sending
router.post('/campaigns/:id/pause', (req, res) => {
  try {
    const campaign = get(
      'SELECT id FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const result = pauseCampaign(campaign.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Resume sending
router.post('/campaigns/:id/resume', async (req, res) => {
  try {
    const campaign = get(
      'SELECT id FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const result = await resumeCampaign(campaign.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel campaign
router.delete('/campaigns/:id', (req, res) => {
  try {
    const campaign = get(
      'SELECT id, status FROM campaigns WHERE id = ? OR slug = ?',
      parseInt(req.params.id) || 0, req.params.id
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Pause if running
    pauseCampaign(campaign.id);

    run(`UPDATE campaigns SET status = 'cancelled' WHERE id = ?`, campaign.id);
    res.json({ success: true, cancelled: campaign.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
