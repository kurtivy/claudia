Progress check. Read your cycle file in `~/.claudia/schedule/cycles/` — look at "Actions Taken."

If Actions Taken is empty or has fewer than 3 entries: you are stalled. Something broke your forward motion. Do this NOW:
1. Read `~/.claudia/schedule/handoff.md`
2. Parse the tasks[] and persistent[] arrays
3. Execute the highest-priority incomplete task immediately
4. Do NOT send a Telegram message asking what to do. Just work.

If Actions Taken has 3+ entries: you're fine. Continue working. Don't stop to report progress — just keep going.

Never respond to this check with a summary of what you've done. Respond by doing more work.
