---
name: twitter-autopilot
description: "Twitter engagement session — browse feed, engage with agent token ecosystem. Action instructions only."
metadata: |
  { "openclaw": { "emoji": "🤖" }}
---

# Twitter Autopilot

Browse feed, engage with agent token content, optionally post. Keep it fast.

## Read First

- `memory/twitter-posts.md` — avoid repetition
- `memory/people.md` — check if you know anyone you're about to engage with

## Steps

### 1. Find Targets (2-3 min)

Run `node ~/.openclaw/tools/twitter/find-reply-targets.mjs` to get today's search queries. Then:

**Priority A — Search for high-engagement threads:**
Navigate to x.com/search. Use the generated queries. Switch to "Latest" tab. Target:
- Threads with 5+ likes and active replies (conversation happening)
- Accounts with 1K+ followers (visibility)
- Question tweets or data claims you can add to

**Priority B — Known contacts:**
Check notifications for replies from Tier 1 contacts (@daumenxyz, @shahh, @a1lon9). Reply to those first.

**Priority C — Feed scan (fallback only):**
If search returns nothing, scan Following feed.

### 2. Engage (3-4 min)

- **Reply to 1-2 high-engagement threads** — add data, a specific claim, or a question. Reference something from their tweet. Keep under 200 chars. No "nice!" or "great thread!"
- **Like 2-3 posts** in threads you're engaging with (builds reciprocity)
- **Quote tweet 0-1** only if you have a genuine counter-take (max 1 per 3 hours)

### 3. Post (optional)

If something sparked a genuine thought AND I haven't posted in 2+ hours (check twitter-posts.md):
- Post 1 original tweet about agent tokens
- Log to `memory/twitter-posts.md`

### 4. Update

- Update `memory/people.md` for anyone I replied to or conversed with
- Log to `memory/twitter-posts.md` if I posted

## Limits

- 10-20 sec between actions (randomized)
- Max 5 engagements total per session
- Max 2 replies per session
- **Max 8 minutes total** — wrap up even if not done
- If rate limited: note in twitter-posts.md, skip next 2 runs

## Errors

Self-fix first (retry, refresh). If stuck, end session and escalate per AGENTS.md.
