#!/bin/bash
# pre-cron-check.sh — Runs before CronCreate
# Logs the cron_create event, then outputs the nudge text.
# Reads hook input from stdin to extract cron expression.

LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Try to extract cron expression from the JSON input
CRON_EXPR=$(echo "$HOOK_INPUT" | sed -n 's/.*"cron"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
PROMPT=$(echo "$HOOK_INPUT" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# Truncate prompt for detail
DETAIL_PROMPT=$(echo "$PROMPT" | cut -c1-60)
DETAIL="cron ${CRON_EXPR:-unknown}: ${DETAIL_PROMPT:-no prompt}"

# Log the event (silent)
bash "$LOG_SCRIPT" "cron_create" "PreToolUse" "schedule" "$DETAIL" 2>/dev/null

# Output the nudge (visible to agent)
cat /c/Users/kurtw/.claudia/infra/hooks/pre-cron-nudge.md
