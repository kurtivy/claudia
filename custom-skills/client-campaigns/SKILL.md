---
name: client-campaigns
description: Manage paid client email campaigns — approve, reject, check status
triggers:
  - /approve
  - /reject
  - client campaign
  - campaign status
---

# Client Campaign Management

## Context

Paid email campaigns submitted via https://web3advisory.co/campaigns/.
Campaigns arrive as Telegram notifications after Stripe payment.

## Commands

### Approve a campaign

When Kurt sends `/approve {campaign_id}`:

1. Call `POST http://localhost:18791/api/campaigns/client/{id}/approve`
   with header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. This triggers the campaign bridge which:
   - Imports the client's CSV contacts
   - Creates an internal campaign
   - Starts sending
3. Confirm to Kurt via Telegram

### Reject a campaign

When Kurt sends `/reject {campaign_id} {reason}`:

1. Call `POST http://localhost:18791/api/campaigns/client/{id}/reject`
   with body `{"reason": "{reason}"}`
   and header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. This refunds via Stripe and notifies the client
3. Confirm to Kurt via Telegram

### Check campaign status

When Kurt asks about campaign status:

1. Call `GET http://localhost:18791/api/campaigns/client/{id}`
   with header `Authorization: Bearer {OPENCLAW_GATEWAY_TOKEN}`
2. Report: status, recipient count, cost, tracking stats if sending/completed
3. If internal_campaign_id exists, also check `GET http://localhost:18791/api/campaigns/{internal_id}` for detailed send progress

## Safety

- Always confirm the campaign ID before approving
- Never auto-approve campaigns
- On reject, always include a reason
