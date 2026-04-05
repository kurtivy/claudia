#!/bin/bash
# post-telegram-capture.sh — Fires after telegram_reply
# Nudges agent to capture learnings from conversations.
# Heavy debounce (30 min) to avoid noise during active chats.

STAMP_FILE="/c/Users/kurtw/.claudia/.last-telegram-capture"
LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"
COOLDOWN=1800  # 30 minutes

now=$(date +%s)

if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE" 2>/dev/null)
  elapsed=$((now - last))
  if [ "$elapsed" -lt "$COOLDOWN" ]; then
    exit 0
  fi
fi

echo "$now" > "$STAMP_FILE"

# Log the event
bash "$LOG_SCRIPT" "telegram_reply" "PostToolUse" "social" "telegram reply sent" 2>/dev/null

# Output the nudge
cat /c/Users/kurtw/.claudia/infra/hooks/nudges/post-telegram-capture.md
