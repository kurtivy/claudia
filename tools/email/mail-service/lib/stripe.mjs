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
