# Web3Advisory Revenue Services — Design Spec

Date: 2026-04-01
Status: Draft

Two services built on existing Web3Advisory infrastructure to generate revenue from proven capabilities.

---

## Service 1: Email Campaign Infrastructure

### What We Sell

Production-grade email sending for Web3 projects. Client brings their list and content. We provide warmed sender accounts, deliverability, compliance enforcement, and real-time tracking.

This is not a SaaS platform. It's an infrastructure service — clients pay per campaign, we handle the hard parts of email delivery that most projects get wrong (warmup, rotation, reputation, bounce handling, compliance).

### Pricing

- **$30 per 1,000 emails sent**
- Minimum campaign size: 1,000 emails
- Payment via Stripe before campaign execution
- Example: 50K email campaign = $1,500

### User Flow

1. Client visits Web3Advisory site, navigates to Email Campaign page
2. Fills out campaign submission form:
   - Company name, contact email
   - Campaign name / description
   - Email subject line
   - Email body (HTML or plain text, with `{{variable}}` support)
   - Recipient list upload (CSV: email, first_name, company, any custom fields)
   - Desired send date (or "ASAP")
3. System calculates cost based on list size, shows total
4. Client pays via Stripe Checkout
5. Kurt receives Telegram notification with campaign details for manual review
6. Kurt approves or rejects:
   - **Approve**: Campaign enters sending queue
   - **Reject**: Client notified with reason, Stripe refund issued
7. Campaign sends through rotating warmed accounts with rate limiting
8. Client can check campaign status page (unique URL sent after approval):
   - Emails sent / total
   - Open rate
   - Click rate
   - Bounce count
   - Opt-out count

### Campaign Approval Criteria (Kurt's Manual Review)

- No obvious scam / rug pull promotion
- Content is relevant to Web3 (token launches, events, product announcements, newsletters)
- List appears to be legitimately sourced (client self-attests in form)
- No prohibited content (adult, weapons, pharma, gambling where illegal)

This is a judgment call, not a legal process. The manual gate exists to protect sender reputation and brand.

### Technical Architecture

#### Already Built
- **Sending engine**: 10 rotating Bluehost SMTP accounts + Resend (tracked)
- **Rate limiting**: Batch sending with configurable delays
- **Tracking**: Open/click tracking via track.web3advisory.co
- **Bounce handling**: IMAP monitoring for bounces
- **Opt-out**: GDPR-compliant unsubscribe with persistent tracking
- **Template engine**: `{{variable}}` replacement from CSV fields
- **Compliance**: CAN-SPAM formatting (physical address, unsubscribe link)
- **Mail API**: localhost:18791 with Bearer token auth

#### Needs to Be Built

1. **Campaign Submission Page** (on Web3Advisory Bluehost site)
   - HTML form with fields listed above
   - CSV upload handler
   - Cost calculator (row count x $0.03)
   - Stripe Checkout integration
   - Stores campaign data for review

2. **Campaign Review System**
   - Telegram notification to Kurt (chat_id: 1578553327) when new campaign submitted + paid
   - Message includes: client name, email, campaign description, list size, cost, preview of email body
   - Inline approve/reject buttons (or reply-based)
   - On approve: triggers sending via Mail API
   - On reject: triggers Stripe refund + client notification email

3. **Client Status Page**
   - Unique URL per campaign (e.g., track.web3advisory.co/campaign/{id})
   - Shows: progress, open rate, click rate, bounces, opt-outs
   - Updates in near-real-time during sending
   - No login required — URL is the auth (unguessable campaign ID)

4. **Stripe Integration**
   - Stripe Checkout session created on form submission
   - Webhook listener for payment confirmation
   - Refund API call on campaign rejection
   - Revenue tracking

5. **Terms of Service / Acceptable Use Policy**
   - Displayed on submission page, checkbox required
   - Covers: no spam, legitimate lists only, content restrictions
   - Protects us from liability if client sends to bad lists

### Infrastructure

- **Campaign submission + status pages**: Hosted on Bluehost alongside existing Web3Advisory site
- **Campaign backend**: A lightweight API on Railway (or Bluehost PHP) that handles form submissions, stores campaign records, and serves status pages. This is the "campaign manager" — it does NOT send emails itself.
- **Sending**: The Mail API on localhost:18791 remains local. When Kurt approves a campaign, Claudia picks it up from the campaign manager API and executes sending via the local Mail API. This avoids exposing the Mail API publicly.
- **Flow**: Web form → campaign manager (Railway/Bluehost) → Telegram notification → Kurt approves → Claudia fetches campaign data → sends via local Mail API → updates campaign manager with stats
- **Stripe**: Standard account, webhook listener on the campaign manager
- **Telegram approval**: Uses existing bot (@kurtivyclawdbot)
- **Database**: Campaign records in SQLite on Railway, or a simple JSON store. Low volume — no need for Postgres.

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Client uploads spam list, damages sender reputation | Manual review gate. Reject suspicious campaigns. Monitor bounce rates per campaign — auto-pause if >5%. |
| Stripe chargebacks | Refund rejected campaigns proactively. Clear ToS. |
| Low volume initially | Marketing through existing Web3 network. Apollo outreach to Web3 projects. Low fixed cost — profitable from first campaign. |
| Deliverability degrades over time | Monitor sender scores. Rotate accounts. Warm new accounts periodically. |

---

## Service 2: Autonomous Agent Architecture Setup

### What We Sell

Custom setup of a persistent, self-managing AI agent (Claude Code based) for a client's specific use case. Not a template or product — a configured, tested, running system built to their requirements, with the expertise to make it actually work long-term.

### Positioning

Most AI agents die after one session. They lose context, repeat mistakes, have no memory, and can't recover from errors. Building a persistent autonomous agent requires deep understanding of:

- How LLM context windows actually behave over hours of continuous use
- Memory architecture that persists across sessions without bloating context
- Cycle management — when to checkpoint, when to restart, how to hand off state
- Hook systems that inject the right context at the right time without overwhelming the model
- Circuit breakers that prevent agents from retrying known-broken objectives
- Watchdog/restart logic that recovers from crashes without losing progress

This is specialized knowledge from months of production operation. The consultation determines whether the client actually needs this, or if a simpler solution would serve them better.

### Pricing

- **Free 30-minute consultation call**: "What are you trying to build? Do you actually need a persistent agent, or is something else better?"
- **Setup engagement: $3,000-5,000** depending on complexity
  - Single-agent, single-channel: $3,000
  - Multi-channel or complex workflows: $4,000-5,000
  - Multi-agent orchestration: $5,000+ (scoped per engagement)
- **Post-delivery support: 2 weeks included**, then optional retainer

### What the Client Gets

1. **Brain architecture** configured for their domain
   - Memory system with scoped entries
   - Knowledge base structure
   - Identity/voice configuration
   - Schedule/initiative framework

2. **Cycle management** tuned to their use case
   - Cycle length (2-8 hours depending on workload)
   - Objective-setting patterns
   - Handoff protocol between cycles
   - Circuit breaker configuration

3. **Hook system** wired to their workflow
   - Session start (boot procedure, context loading)
   - Prompt submit (priming, context injection)
   - Post-tool (nudges, region-aware behavior)
   - Stop/idle (cleanup, verification)

4. **Communication channel** (Telegram or Slack)
   - Progress reports
   - Approval gates for sensitive actions
   - Error alerting

5. **Watchdog/restart** logic
   - Crash recovery
   - Session management
   - Process monitoring

6. **Documentation** of their specific setup
   - Architecture reference
   - How to modify objectives
   - How to update memory/knowledge
   - Troubleshooting guide

### Sales Process

1. **Marketing**: Twitter thread showing the concept in action — Telegram reports, uptime stats, the cycle model. Show results, not implementation.
2. **Inbound**: Interested builders reach out via DM or Web3Advisory contact
3. **Qualification**: Free 30-min call. Genuine consultation — if they don't need this, tell them what they do need.
4. **Scoping**: If it's a fit, scope the engagement via async correspondence
5. **Delivery**: Video calls for requirements + architecture decisions. Kurt builds and configures the system. Iterative testing with the client.
6. **Handoff**: Running system + documentation + 2 weeks support

### What Needs to Be Built

1. **Generalized architecture template**
   - Strip Kurt/Claudia-specific content from the openclaw brain structure
   - Create a clean starting point that can be customized per client
   - Document the decision points (cycle length, memory scoping, hook behavior)

2. **Twitter thread content**
   - The concept: "I've been running an autonomous AI agent for months"
   - The problem: "Most agents forget everything after one session"
   - The solution: Cycle management, memory, handoff (conceptual, not implementation)
   - The proof: Screenshots of Telegram reports, uptime, cycle files
   - The CTA: "If you want something like this, DM me"

3. **Consultation framework**
   - Questions to ask in the free call
   - Decision tree: persistent agent vs. simpler alternatives
   - Scoping template for paid engagements

4. **Web3Advisory page update**
   - Add "Agent Architecture" to services offered
   - Brief description + "Book a free consultation" CTA

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Low demand — niche audience | Low cost to offer. One client per month covers the effort. Twitter thread is free marketing. |
| Client expectations too high | Free consultation qualifies leads. Clear scoping before payment. |
| Hard to scale — it's Kurt's time | Raise prices as demand increases. Build internal tooling to speed up setup. Eventually productize the most common patterns. |
| Client's agent breaks after handoff | 2 weeks support included. Documentation covers common issues. Optional retainer for ongoing support. |

---

## Implementation Priority

**Email Campaign Service first.** Lower barrier to entry, can start generating revenue within 1-2 weeks of shipping the submission form and Stripe integration. Doesn't require Kurt's time per engagement — it's infrastructure, not consulting.

**Agent Architecture Setup second.** Requires the Twitter thread and organic inbound. Longer sales cycle but higher revenue per engagement. Start marketing immediately (the thread costs one afternoon), deliver first engagement when it comes.

---

## Success Criteria

### Email Service (30-day)
- Campaign submission form live on Web3Advisory
- Stripe integration working
- Telegram approval flow working
- At least 1 paid campaign executed

### Agent Setup (60-day)
- Twitter thread published, 10K+ impressions
- At least 3 consultation calls booked
- At least 1 paid engagement closed

### Revenue Target (90-day)
- Email service: $2,000+ cumulative revenue (roughly 67K emails sent)
- Agent setup: $3,000+ from at least 1 engagement
- Combined: $5,000+ in first 90 days
