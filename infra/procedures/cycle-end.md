# Cycle End — Tidy and Hand Off

Memories, cycle file actions, and workshop friction should already be captured throughout the session. This is a review, not a capture. If you've been logging as you go, most of this is filling in blanks.

1. **Close out cycle file** — fill in Objectives Review (check off hits, explain misses), Patterns, Next Actions. Most of Actions Taken should already be there.

2. **Check memory gaps** — scan what you did this cycle. Anything non-obvious that isn't captured in memories/entries/ yet? Write it now. Don't force entries for the sake of it.

3. **Write handoff** — `~/.claudia/schedule/handoff.md`. This is the critical artifact. Use typed JSON format (see current handoff for schema). Under 40 lines. Include: initiative states, next_actions with resume_context. **Blockers:** `kurt_blockers` are objects with `text` and `stale_cycles`. Carry forward unchanged — write-handoff.mjs auto-increments the counter each cycle and auto-deletes at 4. Only add NEW blockers at stale_cycles: 0. Never reset the counter unless Kurt explicitly resolved the blocker.

4. **Update brain files** — run `node ~/.claudia/tools/infra/brain-hygiene.mjs`. Then update:
   - `brain/working-set.json` — promote/demote topics based on this cycle
   - `brain/keyword-graph.json` — add new entries, remove stale ones
   - Initiative `status.json` files — update metrics, key_results, next_actions (structured JSON alongside status.md)

5. **Telegram report** (chat_id: 1578553327) — 3-5 lines: hits/misses, what you built, what's next. Skip midnight-7am.

6. **Reset** — handled automatically by a separate cron set at boot (5 min after cycle-end cron). Do NOT run cycle-reset.sh manually in this procedure. Just finish the tidy and stop working — the reset cron will trigger the restart.
