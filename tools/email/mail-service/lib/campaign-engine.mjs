// Claudia Mail — Campaign Engine
// Batch queue processor with rate limiting, rotation, and progress tracking

import { randomUUID } from 'node:crypto';
import config from '../config.mjs';
import { run, get, all } from '../db.mjs';
import { sendEmail, getNextAccount } from './sender.mjs';
import { renderTemplate } from '../routes/templates.mjs';

// ── Active campaigns tracker ──

const activeCampaigns = new Map(); // campaignId → { running, paused, abortController }

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Get campaign contacts to send to ──

function getCampaignContacts(campaignId) {
  const campaign = get('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!campaign) return [];

  // Get all contacts in the campaign's list that:
  // 1. Are subscribed to the list
  // 2. Haven't been sent to already in this campaign
  // 3. Haven't globally opted out
  // 4. Haven't hard-bounced (3+ bounces)
  const contacts = all(`
    SELECT c.id, c.email, c.name, c.company, c.role, c.tags
    FROM contacts c
    JOIN list_members lm ON lm.contact_id = c.id AND lm.list_id = ? AND lm.subscribed = 1
    WHERE c.global_optout = 0
      AND c.bounce_count < 3
      AND c.id NOT IN (
        SELECT contact_id FROM sends WHERE campaign_id = ? AND status IN ('sent', 'queued', 'failed')
      )
    ORDER BY c.id
  `, campaign.list_id, campaignId);

  return contacts;
}

// ── Send a single campaign email ──

async function sendCampaignEmail(campaign, contact) {
  const trackingId = randomUUID();

  // Get list name for project-level unsub text
  const list = campaign.list_id ? get('SELECT name FROM lists WHERE id = ?', campaign.list_id) : null;
  const projectName = list?.name || campaign.name || 'this project';

  // Build template variables from contact data
  const vars = {
    name: contact.name || '',
    first_name: (contact.name || '').split(' ')[0] || '',
    last_name: (contact.name || '').split(' ').slice(1).join(' ') || '',
    email: contact.email,
    company: contact.company || '',
    role: contact.role || '',
    tracking_id: trackingId,
    project_name: projectName,
    // Dual unsub links
    unsubscribe_url: config.publicUrl
      ? `${config.publicUrl}/api/unsubscribe/${trackingId}`
      : '#unsubscribe',
    unsubscribe_project_url: config.publicUrl
      ? `${config.publicUrl}/api/unsubscribe/${trackingId}`
      : '#unsubscribe',
    unsubscribe_all_url: config.publicUrl
      ? `${config.publicUrl}/api/unsubscribe?email=${encodeURIComponent(contact.email)}&scope=all`
      : '#unsubscribe-all',
  };

  // Add tracking pixel and click rewriting for Bluehost campaigns with public URL
  let htmlBody = renderTemplate(campaign.html_template, vars);
  let textBody = renderTemplate(campaign.text_template, vars);
  const subject = renderTemplate(campaign.subject_template, vars);

  // Rewrite links for click tracking (before pixel injection)
  if (config.publicUrl && htmlBody) {
    htmlBody = htmlBody.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match, url) => {
        // Don't rewrite unsubscribe links (already tracked) or tracking URLs
        if (url.includes('/api/unsubscribe') || url.includes(config.publicUrl)) {
          return match;
        }
        const encoded = Buffer.from(url).toString('base64url');
        return `href="${config.publicUrl}/api/c/${trackingId}/${encoded}"`;
      }
    );
  }

  // Inject tracking pixel for all campaigns with a public URL
  if (config.publicUrl && htmlBody) {
    const pixelUrl = `${config.publicUrl}/api/t/${trackingId}.png`;
    htmlBody += `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  }

  // Create send record first (as queued)
  run(
    `INSERT INTO sends (campaign_id, contact_id, tracking_id, status)
     VALUES (?, ?, ?, 'queued')`,
    campaign.id, contact.id, trackingId
  );

  const sendRow = get('SELECT id FROM sends WHERE tracking_id = ?', trackingId);

  try {
    const result = await sendEmail(campaign.provider || 'bluehost', {
      to: contact.email,
      subject,
      textBody,
      htmlBody,
      replyTo: campaign.reply_to || undefined,
      fromName: campaign.from_name || undefined,
      trackingId,
      listUnsubscribeUrl: vars.unsubscribe_url,
      senderAccountId: campaign.sender_account_id || undefined,
    });

    if (result.success) {
      run(
        `UPDATE sends SET status = 'sent', message_id = ?, sender_account_id = ?, sent_at = datetime('now')
         WHERE id = ?`,
        result.messageId || null, result.accountId, sendRow.id
      );
      run('UPDATE campaigns SET sent = sent + 1 WHERE id = ?', campaign.id);
      return { success: true, trackingId };
    } else {
      run(
        `UPDATE sends SET status = 'failed', error = ?, sender_account_id = ?
         WHERE id = ?`,
        result.error, result.accountId, sendRow.id
      );
      run('UPDATE campaigns SET failed = failed + 1 WHERE id = ?', campaign.id);
      return { success: false, error: result.error, trackingId };
    }
  } catch (err) {
    run(
      `UPDATE sends SET status = 'failed', error = ? WHERE id = ?`,
      err.message, sendRow.id
    );
    run('UPDATE campaigns SET failed = failed + 1 WHERE id = ?', campaign.id);
    return { success: false, error: err.message, trackingId };
  }
}

// ── Campaign batch processor ──

export async function startCampaign(campaignId) {
  const campaign = get('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!campaign) throw new Error('Campaign not found');

  if (campaign.status !== 'approved' && campaign.status !== 'paused') {
    throw new Error(`Campaign must be approved or paused to send. Current status: ${campaign.status}`);
  }

  // Check if already running
  if (activeCampaigns.has(campaignId) && activeCampaigns.get(campaignId).running) {
    throw new Error('Campaign is already running');
  }

  // Mark as sending
  run(`UPDATE campaigns SET status = 'sending', started_at = COALESCE(started_at, datetime('now'))
       WHERE id = ?`, campaignId);

  const state = { running: true, paused: false };
  activeCampaigns.set(campaignId, state);

  // Run in background
  processCampaign(campaignId, state).catch(err => {
    console.error(`[campaign-engine] Campaign ${campaignId} error:`, err.message);
    run(`UPDATE campaigns SET status = 'paused' WHERE id = ?`, campaignId);
    state.running = false;
  });

  return { started: true, campaignId };
}

async function processCampaign(campaignId, state) {
  let consecutiveFailures = 0;
  const batchSize = config.batchSize;

  console.log(`[campaign-engine] Starting campaign ${campaignId}`);

  while (state.running && !state.paused) {
    // Refresh campaign from DB
    const campaign = get('SELECT * FROM campaigns WHERE id = ?', campaignId);
    if (!campaign || campaign.status === 'cancelled' || campaign.status === 'completed') {
      break;
    }

    // Get next batch of contacts
    const contacts = getCampaignContacts(campaignId);

    if (contacts.length === 0) {
      // All done
      run(`UPDATE campaigns SET status = 'completed', completed_at = datetime('now') WHERE id = ?`, campaignId);
      console.log(`[campaign-engine] Campaign ${campaignId} completed`);
      break;
    }

    // Update total count
    const totalRemaining = contacts.length;
    const totalSent = (campaign.sent || 0) + (campaign.failed || 0);
    run('UPDATE campaigns SET total_contacts = ? WHERE id = ?', totalSent + totalRemaining, campaignId);

    // Process batch
    const batch = contacts.slice(0, batchSize);
    console.log(`[campaign-engine] Campaign ${campaignId}: sending batch of ${batch.length} (${totalSent} sent so far, ${totalRemaining} remaining)`);

    for (const contact of batch) {
      if (!state.running || state.paused) break;

      // Check if a sender account is available
      const account = getNextAccount(campaign.provider || 'bluehost');
      if (!account) {
        console.log(`[campaign-engine] All accounts at rate limit, waiting 60s...`);
        await sleep(60_000);
        continue;
      }

      const result = await sendCampaignEmail(campaign, contact);

      if (result.success) {
        consecutiveFailures = 0;
        console.log(`[campaign-engine] Sent to ${contact.email} (${result.trackingId})`);
      } else {
        consecutiveFailures++;
        console.error(`[campaign-engine] Failed sending to ${contact.email}: ${result.error}`);

        if (consecutiveFailures >= config.consecutiveFailureThreshold) {
          console.error(`[campaign-engine] ${consecutiveFailures} consecutive failures, pausing campaign`);
          run(`UPDATE campaigns SET status = 'paused' WHERE id = ?`, campaignId);
          state.paused = true;
          break;
        }
      }

      // Inter-email delay (randomized to look more human)
      const delay = randomDelay(config.interEmailDelayMs.min, config.interEmailDelayMs.max);
      await sleep(delay);
    }

    // Inter-batch delay
    if (state.running && !state.paused && contacts.length > batchSize) {
      console.log(`[campaign-engine] Batch complete, waiting ${config.interBatchDelayMs / 1000}s before next batch`);
      await sleep(config.interBatchDelayMs);
    }
  }

  state.running = false;
  activeCampaigns.delete(campaignId);
}

// ── Campaign control ──

export function pauseCampaign(campaignId) {
  const state = activeCampaigns.get(campaignId);
  if (state) {
    state.paused = true;
    state.running = false;
  }
  run(`UPDATE campaigns SET status = 'paused' WHERE id = ? AND status = 'sending'`, campaignId);
  return { paused: true };
}

export function resumeCampaign(campaignId) {
  const campaign = get('SELECT * FROM campaigns WHERE id = ? AND status = ?', campaignId, 'paused');
  if (!campaign) throw new Error('Campaign not found or not paused');

  // Re-mark as approved so startCampaign will accept it
  run(`UPDATE campaigns SET status = 'approved' WHERE id = ?`, campaignId);
  return startCampaign(campaignId);
}

export function getCampaignProgress(campaignId) {
  const campaign = get('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!campaign) return null;

  const state = activeCampaigns.get(campaignId);
  const remaining = getCampaignContacts(campaignId).length;

  return {
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    running: state?.running || false,
    paused: state?.paused || false,
    total_contacts: campaign.total_contacts,
    sent: campaign.sent,
    failed: campaign.failed,
    opened: campaign.opened,
    clicked: campaign.clicked,
    bounced: campaign.bounced,
    unsubscribed: campaign.unsubscribed,
    remaining,
    progress: campaign.total_contacts > 0
      ? Math.round(((campaign.sent + campaign.failed) / campaign.total_contacts) * 100)
      : 0,
    started_at: campaign.started_at,
    completed_at: campaign.completed_at,
  };
}

// ── Generate sample emails ──

export function generateSamples(campaignId, count = 3) {
  const campaign = get('SELECT * FROM campaigns WHERE id = ?', campaignId);
  if (!campaign) throw new Error('Campaign not found');

  // Get a few contacts from the campaign's list
  const contacts = all(`
    SELECT c.id, c.email, c.name, c.company, c.role
    FROM contacts c
    JOIN list_members lm ON lm.contact_id = c.id AND lm.list_id = ?
    WHERE c.global_optout = 0 AND lm.subscribed = 1
    ORDER BY RANDOM()
    LIMIT ?
  `, campaign.list_id, count);

  // Get list name for project-level unsub text
  const list = campaign.list_id ? get('SELECT name FROM lists WHERE id = ?', campaign.list_id) : null;
  const projectName = list?.name || campaign.name || 'this project';

  const samples = contacts.map(contact => {
    const sampleTrackingId = 'SAMPLE-' + randomUUID().slice(0, 8);
    const vars = {
      name: contact.name || '',
      first_name: (contact.name || '').split(' ')[0] || '',
      last_name: (contact.name || '').split(' ').slice(1).join(' ') || '',
      email: contact.email,
      company: contact.company || '',
      role: contact.role || '',
      tracking_id: sampleTrackingId,
      project_name: projectName,
      unsubscribe_url: '#unsubscribe-sample',
      unsubscribe_project_url: '#unsubscribe-sample',
      unsubscribe_all_url: '#unsubscribe-all-sample',
    };

    return {
      to: contact.email,
      contact_name: contact.name,
      subject: renderTemplate(campaign.subject_template, vars),
      text_body: renderTemplate(campaign.text_template, vars),
      html_body: renderTemplate(campaign.html_template, vars),
    };
  });

  return samples;
}

export default { startCampaign, pauseCampaign, resumeCampaign, getCampaignProgress, generateSamples };
