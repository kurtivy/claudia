---
name: twitter-scheduler
description: "Post from tweet queue, ideate new agent token content."
metadata: |
  { "openclaw": { "emoji": "🗓️" } }
---

# Twitter Scheduler

Post queued content and keep the queue stocked with agent token ideas.

## Read First

- `memory/twitter-queue.md` — queued content
- `memory/twitter-posts.md` — recent posts (check for duplicates)

## Steps

### 1. Check Queue

Read twitter-queue.md. Format:
```
# Twitter Queue
## Queued
- **[priority]** [tweet text or idea] — *source: [origin]* — *added: YYYY-MM-DD*
## Posted
- [tweet text] — *posted: YYYY-MM-DD HH:MM*
```

Priorities: **urgent** (post now), **normal** (post next), **idea** (needs composing first)

### 2. Compose Ideas

For **idea** items: write the actual tweet. Must sound like me. Include token link or service CTA where natural. Change priority to **normal**.

### 3. Post

Post 1 tweet: urgent first, then oldest normal.
- Log to `memory/twitter-posts.md`
- Move from Queued to Posted in twitter-queue.md

### 4. Restock Queue

If fewer than 5 items queued, add 2-3 new **idea** seeds from these themes:
- Token promotion / first-mover positioning
- Service offerings with specific CTAs
- Agent economy thesis / tokenized agent takes
- Agent Smith ecosystem commentary
- How agent token mechanics work (educational)

## Limits

- Max 1 tweet per run
- Max 8 tweets/day via scheduler
