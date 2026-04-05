---
name: email-send
description: "Send a single email from a web3advisory.co account via Claudia Mail API. Compose, preview for Kurt, send on approval."
metadata: |
  { "openclaw": { "emoji": "✉️" } }
---

# Email Send Skill

Send a single email from a web3advisory.co account. Used for one-off emails, follow-ups, or individual outreach.

## Prerequisites

- Claudia Mail service must be running on port 18791 (runs in Docker)

## API Setup

```
BASE_URL=http://localhost:18791/api
AUTH="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```

## Workflow

### 1. Compose

Kurt says: "Email john@example.com about [topic]" or provides context.

Compose the email:
- Professional tone matching the project/product being promoted
- Clear subject line
- Concise body (under 150 words for cold outreach, longer OK for follow-ups)
- **Sign as the project, NOT Web3 Advisory** (e.g., "Kurt / contactmanagerbot.com")
- Opt-out footer for cold outreach
- Use HTML entities for special chars (`&mdash;` not UTF-8 em dash)

### 2. Preview

Show Kurt the full email via Telegram:
```
TO: john@example.com
FROM: Kurt Ivy <kurt@web3advisory.co>
SUBJECT: [subject]

[body]

---
[signature]
```

Wait for approval.

### 3. Check Opt-Out & Send

First check if the recipient is opted out:

```bash
curl -s "$BASE_URL/contacts?search=john@example.com" -H "$AUTH"
```

If contact exists and has `global_optout: 1`, inform Kurt and do not send.

On approval, import the contact and send via the campaign engine (single-email campaign):

**Option A — Quick single send** (if send-email.mjs is available):
```bash
# The mail service handles this via sender accounts
curl -s -X POST "$BASE_URL/contacts/import" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"contacts": [{"email": "john@example.com", "name": "John Doe"}]}'
```

Then use the campaign flow for tracked sending, OR use `send-email.mjs` directly for quick untracked sends.

**Option B — Tracked via campaign API:**
```bash
# 1. Ensure contact exists
curl -s -X POST "$BASE_URL/contacts" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "name": "John Doe", "source": "manual"}'

# 2. Create a one-off campaign
curl -s -X POST "$BASE_URL/campaigns" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "One-off: john@example.com",
    "list_slug": "one-off",
    "subject_template": "[subject]",
    "text_template": "[body]",
    "from_name": "Kurt Ivy | Web3 Advisory"
  }'

# 3. Approve and send
curl -s -X POST "$BASE_URL/campaigns/{id}/approve" -H "$AUTH"
curl -s -X POST "$BASE_URL/campaigns/{id}/send" -H "$AUTH"
```

### 4. Confirm

Check campaign status for delivery:
```bash
curl -s "$BASE_URL/campaigns/{id}" -H "$AUTH"
```

Report delivery status:
```
EMAIL SENT ✓
To: john@example.com
From: kurt@web3advisory.co
Subject: [subject]
Status: delivered
```

Or on failure:
```
EMAIL FAILED ✗
To: john@example.com
Error: [error message]
```

## Safety Rules

- **NEVER send without Kurt's approval** on the preview
- Check contact's opt-out status before sending
- Log via the API (automatic with campaign flow)
