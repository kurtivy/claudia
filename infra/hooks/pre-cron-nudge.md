You're about to create a cron. BEFORE creating it, do both of these:

1. Open your cycle file in `schedule/cycles/` and add a row to the Crons Set table:

| `CRON_EXPRESSION` | What it does | Expected fire time (HH:MM TZ) |

2. If this cron is tied to an objective in your cycle file, note which one.

Crons die with the session. The cycle file is the only record. If you skip this, the next agent has no idea what you planned.
