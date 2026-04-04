---
name: twitter-dm
description: "Send personalized DMs on Twitter/X to target accounts for networking and outreach. Uses browser automation. Always shows messages for approval before sending."
metadata: |
  { "openclaw": { "emoji": "✉️" } }
---

# Twitter DM Outreach Skill

Uses browser automation to send personalized direct messages on Twitter/X for networking and community building.

## SAFETY RULES

1. **ALWAYS show the exact DM text BEFORE sending each message**
2. **Max 10 DMs per session** (hard limit, no exceptions)
3. **Wait 60-120 seconds between DMs** (randomized, avoid detection)
4. **Never send unsolicited promotional or spam messages**
5. **Never DM the same person twice** (check outreach log)
6. **If a DM fails to send, skip and move on** — don't retry
7. **Stop immediately if any rate limit or restriction appears**

## Prerequisites

- Browser logged into my Twitter/X account
- Must have: target criteria AND either a message template or talking points
- Can be invoked by Kurt or run with criteria from STATE.md social graph

## Workflow

### 1. Define Targets

Target criteria can come from:
- Kurt's explicit request (e.g., "Solana developers with 1k+ followers")
- My social graph in STATE.md (accounts I have been engaging with)
- People who replied to my tweets or engaged with my content

### 2. Find Candidates

Use Twitter search to find matching profiles:
- Search relevant keywords
- Check profiles: follower count, bio, recent activity
- Filter for accounts that accept DMs (not all do)
- Build a candidate list of 10-15 accounts

### 3. Present Candidates for Approval

Show the candidate list:

```
DM OUTREACH CANDIDATES
======================
1. @handle1 - [Bio snippet] - [X followers] - [Recent relevant tweet]
2. @handle2 - [Bio snippet] - [X followers] - [Recent relevant tweet]
...

Which accounts should I DM? (numbers, or "all")
```

Wait for approval before proceeding.

### 4. Craft Personalized Messages

For each approved candidate, write a personalized DM based on:
- Their bio and recent tweets
- The message template or talking points provided
- Something specific that shows I actually looked at their profile

**Message guidelines:**
- 2-4 sentences max
- Open with something specific to them (not generic)
- State the purpose clearly
- Include a soft call to action (question, not demand)
- Professional but warm — sounds like me, not a template
- No links in first DM (looks spammy)
- Never reference my initiator's personal details

### 5. Show Each Message for Approval

Before sending each DM:

```
TO: @handle
MESSAGE:
"Hey [name], saw your thread on [topic] — really sharp take on [specific point].
I'm trading on Solana with automated market-making systems and your perspective on
[thing] caught my attention. Would be interested to compare notes sometime."

Send this? (yes/no/edit)
```

Wait for explicit "yes" before sending.

### 6. Send and Log

After sending each DM:

```bash
echo "$(date -I),@handle,\"message preview first 50 chars...\",sent" >> ~/.openclaw/workspace/twitter-outreach-log.csv
```

### 7. Session Report

```
DM OUTREACH REPORT
==================
Date: [YYYY-MM-DD]
Candidates found: [N]
Approved: [N]
Sent: [N]
Failed: [N] (reason)

Sent to:
- @handle1: [first 30 chars of message...]
- @handle2: [first 30 chars of message...]

Next steps: Follow up in 3-5 days if no response.
```

## Outreach Log

The outreach log at `~/.openclaw/workspace/twitter-outreach-log.csv` tracks all DMs:

```
date,handle,message_preview,status
```

Before each session, read the log to avoid duplicate contacts:

```bash
cat ~/.openclaw/workspace/twitter-outreach-log.csv 2>/dev/null || echo "No previous outreach"
```
