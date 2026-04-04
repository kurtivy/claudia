---
name: email-campaign
description: "Run bulk personalized email campaigns via Claudia Mail API. Import CSV contacts, create campaigns with templates, send via rotating Bluehost SMTP or Resend API. Full opt-out compliance, bounce handling, open/click tracking."
metadata: |
  { "openclaw": { "emoji": "📧" } }
---

# Email Campaign Skill

Bulk personalized email campaigns via the **Claudia Mail API** (`localhost:18791`).

### Daily Automation (Already Scheduled)

A Windows Task Scheduler job ("CMB Daily Campaign") runs at 8:00 AM daily:
1. `cmb-daily-pick.py` picks 200 fresh random contacts from the vault (~96K total)
2. `cmb-sent-tracker.json` ensures zero overlap with any previous send
3. 100 go to Resend (tracked opens/clicks), 100 go to Bluehost (10 per sender for warmup)
4. Template: `cmb-outreach` (Contact Manager Bot pitch)

The daily task is fully automated — no intervention needed unless Kurt wants to change the template, volume, or product being promoted.

## Campaign Status Queries (You Can Do These)

```bash
# Check a campaign's progress
curl -s "$BASE_URL/campaigns/{id}" -H "$AUTH"

# List all campaigns
curl -s "$BASE_URL/campaigns" -H "$AUTH"

# Overall stats
curl -s "$BASE_URL/stats" -H "$AUTH"

# Pause a campaign
curl -s -X POST "$BASE_URL/campaigns/{id}/pause" -H "$AUTH"

# Resume a campaign
curl -s -X POST "$BASE_URL/campaigns/{id}/resume" -H "$AUTH"
```

Report format: "Campaign [name]: [sent]/[total] sent, [failed] failed, [open_rate]% opens, [click_rate]% clicks"

---

## Prerequisites

- Claudia Mail service must be running on port 18791 (runs in Docker)
- Auth token: use `$OPENCLAW_GATEWAY_TOKEN` for API auth (Bearer token)
- Spreadsheet file (CSV or XLSX) with contact data


## API Base

```
BASE_URL=http://localhost:18791/api
AUTH="Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN"
```

All API calls use `curl` with JSON. Auth required for all except public endpoints.

## Workflow

### 1. Import Contacts

Read the spreadsheet, then import via API:

```bash
curl -s -X POST "$BASE_URL/contacts/import" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "csv": "email,name,company\njohn@example.com,John Doe,Acme Corp\n...",
    "list": "campaign-slug"
  }'
```

The API:
- Deduplicates by email (case-insensitive)
- Auto-creates the list if it doesn't exist
- Skips contacts with global opt-out
- Returns: `{ imported, updated, skipped, total }`

Report: "Imported X contacts to list [slug], Y skipped, Z updated"

### 2. Create Template (Optional)

Save reusable email templates with `{{variable}}` placeholders:

```bash
curl -s -X POST "$BASE_URL/templates" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "slug": "cold-intro-v1",
    "name": "Cold Intro",
    "subject": "Quick question for {{first_name}} at {{company}}",
    "text_body": "Hi {{first_name}},\n\nI noticed {{company}}...",
    "html_body": "<p>Hi {{first_name}},</p>...",
    "variables": ["first_name", "company", "role"]
  }'
```

Available variables (auto-populated from contact data):
- `{{name}}`, `{{first_name}}`, `{{last_name}}`
- `{{email}}`, `{{company}}`, `{{role}}`
- `{{unsubscribe_url}}` — auto-generated per-recipient
- `{{tracking_id}}` — for custom tracking

### 3. Create Campaign

```bash
curl -s -X POST "$BASE_URL/campaigns" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "AI Agents Cold Outreach",
    "list_slug": "ai-agents-launch",
    "template_slug": "cold-intro-v1",
    "provider": "bluehost",
    "from_name": "Kurt Ivy | Web3 Advisory",
    "reply_to": "kurt@web3advisory.co",
    "brief": "Campaign brief for AI personalization"
  }'
```

Or inline the template directly:
```bash
curl -s -X POST "$BASE_URL/campaigns" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "name": "Campaign Name",
    "list_slug": "list-slug",
    "subject_template": "Quick question for {{first_name}}",
    "text_template": "Hi {{first_name}},...",
    "html_template": "<p>Hi {{first_name}},</p>...",
    "provider": "bluehost",
    "from_name": "Kurt Ivy | Web3 Advisory"
  }'
```

Provider options: `"bluehost"` (free, bulk, 10 rotating accounts) or `"resend"` (tracked, paid).

### 4. Generate Samples

```bash
curl -s -X POST "$BASE_URL/campaigns/{id}/samples" \
  -H "$AUTH" -H "Content-Type: application/json"
```

Returns 3 rendered sample emails with real contact data. Show all 3 to Kurt via Telegram for approval.

### 5. Wait for Approval

**NEVER send without Kurt's explicit approval** on sample emails.

If Kurt provides feedback, update the campaign template and regenerate samples:
```bash
curl -s -X PUT "$BASE_URL/campaigns/{id}" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{ "subject_template": "Updated subject..." }'
```

### 6. Approve & Send

```bash
# Approve
curl -s -X POST "$BASE_URL/campaigns/{id}/approve" \
  -H "$AUTH" -H "Content-Type: application/json" \
  -d '{ "approved_by": "kurt" }'

# Start sending (runs in background)
curl -s -X POST "$BASE_URL/campaigns/{id}/send" \
  -H "$AUTH"
```

The engine handles:
- Batch sending (50 per batch, 30s between batches)
- Random inter-email delays (2-3 seconds)
- Round-robin sender rotation across 10 Bluehost accounts
- Rate limit enforcement (100/hour/account, 500/day/account)
- Automatic pause on 5+ consecutive failures
- Skip opted-out contacts and bounced addresses (3+ bounces)

### 7. Monitor Progress

```bash
# Campaign detail with progress
curl -s "$BASE_URL/campaigns/{id}" -H "$AUTH"

# Overall stats
curl -s "$BASE_URL/stats" -H "$AUTH"
```

Report to Kurt's Telegram every 500 emails or on completion.

### 8. Pause/Resume/Cancel

```bash
# Pause
curl -s -X POST "$BASE_URL/campaigns/{id}/pause" -H "$AUTH"

# Resume
curl -s -X POST "$BASE_URL/campaigns/{id}/resume" -H "$AUTH"

# Cancel
curl -s -X DELETE "$BASE_URL/campaigns/{id}" -H "$AUTH"
```

Kurt can say:
- "Pause the campaign" → pause
- "Resume the campaign" → resume
- "Cancel the campaign" → cancel permanently
- "Campaign status" → get progress

### 9. Campaign Complete

When the engine finishes, campaign status becomes `completed`. Report to Kurt:

```
EMAIL CAMPAIGN COMPLETE
========================
Campaign: [name]
Total sent: [N]
Failed: [N]
Open rate: [X%]
Click rate: [X%]
Bounced: [N]
Unsubscribed: [N]
Duration: [time]
```

## Email Content Requirements

Each email MUST include:
- Personalized greeting (use `{{first_name}}` or `{{name}}`)
- Brief, compelling hook relevant to recipient's context
- Clear value proposition
- **Signature from the project, NOT Web3 Advisory** — sign as the project/product being promoted (e.g., "Kurt / contactmanagerbot.com" not "Web3 Advisory")
- **Opt-out link** — use `{{unsubscribe_project_url}}` for project-specific unsubscribe and `{{unsubscribe_all_url}}` for global unsubscribe
- Use HTML entities for special chars (e.g., `&mdash;` not UTF-8 em dash, `&rarr;` not →)

**Email length**: 75-125 words. Subject line under 50 characters.

**Opt-out footer** (include in html_template):
```html
<p style="font-size:12px;color:#9ca3af;text-align:center;">
  You're receiving this because we thought our work might be relevant to you.
</p>
<p style="font-size:11px;color:#9ca3af;text-align:center;">
  <a href="{{unsubscribe_project_url}}">Unsubscribe from [Project Name] emails</a><br>
  <a href="{{unsubscribe_all_url}}">Unsubscribe from all emails</a>
</p>
```

## Sending Limits

- **Resend (free tier):** 100/day, 3,000/month — use for tracked campaigns (opens/clicks)
- **Bluehost:** 10 rotating SMTP accounts, use for warmup and bulk — 10 emails per account per batch

## Safety Rules

- **NEVER send without Kurt's explicit approval** on sample emails
- **ALWAYS include unsubscribe link** via `{{unsubscribe_project_url}}` and `{{unsubscribe_all_url}}`
- The API automatically enforces opt-out checks, dedup, and rate limits
- Bounces and complaints auto-process (IMAP poller + Resend webhooks)
- **Log everything** — the API tracks every send in the database
- **CAN-SPAM compliance** — no misleading subjects, include physical address
