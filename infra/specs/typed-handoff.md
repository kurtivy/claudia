# Spec: Typed Handoff Format

**Refinement:** #1 of 5 Mastra-inspired architecture changes
**Status:** Implemented (2026-04-01)
**Author:** Claudia
**Date:** 2026-03-31

## Problem

The handoff file (`schedule/handoff.md`) is free-form markdown. The boot procedure reads it as natural language, which means:
- Circuit breaker logic ("if blocked 2+ cycles") requires the agent to parse prose for dates and statuses
- Initiative states are described differently each time
- Next actions may be vague or ambiguous
- No way to programmatically validate a handoff before writing it
- Resume context (refinement #2) has nowhere structured to live

## Design

A JSON frontmatter block at the top of handoff.md, followed by the existing human-readable markdown. The JSON is the source of truth; the markdown is for human review and agent context.

### Schema (v2 — current)

```json
{
  "$schema": "handoff-v2",
  "timestamp": "2026-04-04T03:45:00.000Z",
  "cycle_file": "schedule/cycles/2026-04-03_2038-w3a-metrics-and-engagement.md",

  "persistent": [
    {
      "id": "grow-w3a-twitter",
      "goal": "Grow @web3advisoryco Twitter presence",
      "strategy": "5 QRTs + 30 replies per session across 5 verticals...",
      "tools": "thread-search.mjs, cdp-reply.mjs, cdp-qrt.mjs",
      "context": {
        "account": "@web3advisoryco",
        "verticals": ["PR", "community management", "KOLs", "email marketing", "AI tools"]
      }
    }
  ],

  "tasks": [
    {
      "action": "Fix brain-hygiene.mjs to parse JSON formats",
      "priority": 1,
      "initiative": "brain-restructure",
      "resume_context": null
    }
  ],

  "tier_0_contact": {
    "method": "telegram",
    "chat_id": "1578553327",
    "name": "Kurt"
  },

  "kurt_blockers": [
    "Wellfound password reset (existing account, no reset email)"
  ],

  "notes": "Free-form context for the next agent session."
}
```

### Tiered goal system

The handoff uses three tiers to ensure agents never idle:

1. **Tier 2 — tasks[]**: Specific actions with hard endings. Execute these first.
2. **Tier 1 — persistent[]**: Ongoing goals that never truly end (e.g., engagement, growth). Pursue when tasks are done.
3. **Tier 0 — tier_0_contact**: If persistent goals are exhausted (rare), ask this person for direction. Only then can the agent go idle.

### Format in handoff.md

```markdown
---json
{ ... JSON-only, no markdown below ... }
---
```

JSON-only. No markdown summary — agents read JSON directly, and `render-status.mjs` produces human-readable output on demand.

The `---json` / `---` fences are chosen over YAML frontmatter because:
1. JSON is unambiguous (no YAML gotchas with strings, booleans, multiline)
2. Parseable with `JSON.parse()` in any hook or tool
3. The agent already writes JSON reliably

### Rules

1. **JSON is the only content.** No markdown section below the fences.
2. **Persistent goals carry forward** across cycles unless explicitly removed.
3. **Tasks are consumed** — completed tasks are removed, not carried forward.
4. **Tier order matters:** tasks first, then persistent, then tier 0.
5. **Kurt blockers are separate** from work items. They go in `kurt_blockers[]` so a future tool can ping Kurt about them.

### Validation

A handoff validator script (`tools/infra/validate-handoff.mjs`) should:
- Parse the JSON block
- Check required fields ($schema, timestamp, blocked, initiatives, next_actions)
- Verify each blocked item has `since` and `consecutive_misses`
- Verify each next_action has `priority` and `action`
- Warn if `resume_context` is missing on priority-1 actions
- Run automatically in the Cycle End procedure before writing

### Boot Procedure Changes

The session-start prompt's circuit breaker logic changes from:
> "check handoff.md for patterns" (prose parsing)

To:
> "parse the JSON block from handoff.md, iterate blocked[] where consecutive_misses >= 2"

This is deterministic. No more hoping the agent correctly identifies patterns in free text.

### Migration

1. Build validate-handoff.mjs
2. Update Cycle End procedure to write JSON+markdown hybrid
3. Update session-start prompt to parse JSON block
4. First real handoff in new format: end of this cycle

### What This Does NOT Cover

- Resume context details (refinement #2 -- separate spec)
- Parallel convergence (refinement #4 -- separate spec)
- Scoped memory (refinement #5 -- separate spec)
- Working/long-term discipline (refinement #6 -- separate spec)

Resume context is embedded in this spec as the `resume_context` field per next_action, but the detailed design of what goes inside that object is refinement #2.
