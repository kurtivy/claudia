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
