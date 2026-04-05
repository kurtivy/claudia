---
type: knowledge
domain: email
importance: high
keywords: resend, bluehost, spf, deliverability, mail-service
---

## What
Email system is operational (200/day, Express.js on port 18791, auto-starts, 96K contacts) but Resend has 0% deliverability due to missing SPF record. Bluehost delivers at 21.7% open rate. Triple bug fix on Mar 27 got automated campaigns actually sending.

## Why It Matters
Half of daily email volume (100 Resend sends) is wasted until Kurt fixes DNS. Bluehost side works. Email is Claudia's most proven utility channel.

## Key Facts
- **Architecture**: Express.js mail service on port 18791, public via track.web3advisory.co (Cloudflare tunnel). Auto-starts via Windows Startup. Daily automation at 8am via Task Scheduler.
- **Capacity**: 200 emails/day (100 Resend + 100 Bluehost). 12 sender accounts (10 Bluehost + 2 Resend). ~96K contacts with no-overlap tracking.
- **Resend 0% deliverability**: 592+ emails to spam since Mar 14. Root cause: SPF record (`v=spf1 +ip4:74.220.219.243 +include:mailshake.com -all`) does not include Resend. Hard fail on every Resend email.
- **Bluehost working**: 21.7% open rate (130/600). Subject lines effective. CTA/click-through is the weak point, not opens.
- **Triple bug fix (Mar 27)**: (1) API field name mismatch (list/template vs list_slug/template_slug), (2) Windows shell escaping (cmd.exe vs bash), (3) Wrong script path in config.mjs. Campaign was never sending before this fix.
- **Click tracking fixed**: URLs were never rewritten in email HTML. Now working. Previous 0% click data was a tracking gap, not actual zero clicks.
- **Tracking pixel**: Was only injected for Bluehost. Now injected for all providers.
- **Kurt must fix in Bluehost DNS**: (1) Add Resend SPF include (likely `include:amazonses.com` or `include:resend.com`), (2) Upgrade DMARC from `p=none` to `p=quarantine`.
