// Claudia Mail — Campaign Execution Bridge
// Imports client CSV into the contact system, creates an internal campaign,
// and kicks off sending when Kurt approves a client campaign.

import { getClientCampaign, updateClientCampaign } from '../db.mjs';
import { notifyCampaignStatus } from './telegram-notify.mjs';
import { config } from '../config.mjs';

const API = `http://localhost:${config.port}`;

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
    // The contacts/import route reads the list from body.list (not body.list_slug)
    const listSlug = `client-${campaignId.slice(0, 8)}`;
    const importResult = await apiCall('/api/contacts/import', 'POST', {
      csv: campaign.csv_data,
      list: listSlug,
      source: `client-campaign:${campaign.company_name}`,
    });

    console.log(`[campaign-bridge] Import result for ${campaignId}:`, JSON.stringify(importResult));

    if (importResult.error) {
      throw new Error(`CSV import failed: ${importResult.error}`);
    }

    // 2. Create internal campaign (starts in 'draft' status)
    const internalCampaign = await apiCall('/api/campaigns', 'POST', {
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

    console.log(`[campaign-bridge] Created internal campaign ${internalCampaign.id} for client campaign ${campaignId}`);

    // 3. Link internal campaign ID before approving (so we have a record even if send fails)
    updateClientCampaign(campaignId, {
      internal_campaign_id: internalCampaign.id,
      status: 'sending',
    });

    // 4. Approve the draft campaign (required before send)
    const approveResult = await apiCall(`/api/campaigns/${internalCampaign.id}/approve`, 'POST');
    if (!approveResult.success) {
      throw new Error('Failed to approve internal campaign: ' + JSON.stringify(approveResult));
    }

    // 5. Start sending
    const sendResult = await apiCall(`/api/campaigns/${internalCampaign.id}/send`, 'POST');
    console.log(`[campaign-bridge] Send initiated for internal campaign ${internalCampaign.id}:`, JSON.stringify(sendResult));

    await notifyCampaignStatus(campaign, 'SENDING', `Internal campaign ${internalCampaign.id} started. ${importResult.imported || 0} contacts imported to list "${listSlug}".`);

    return { internalCampaignId: internalCampaign.id };
  } catch (err) {
    console.error('[campaign-bridge] Campaign execution failed:', err);
    // Revert to approved so it can be retried
    updateClientCampaign(campaignId, { status: 'approved' });
    await notifyCampaignStatus(campaign, 'ERROR', err.message);
    throw err;
  }
}
