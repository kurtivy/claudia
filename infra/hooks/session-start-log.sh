#!/bin/bash
# session-start-log.sh — Initialize session JSONL file and log session_start event
# Called by SessionStart hook before or after the orientation prompt.
# Outputs the session-start prompt to stdout (replacing the direct cat).

EVENTS_DIR="/c/Users/kurtw/.claudia/schedule/cycles/events"
LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"

# Create a deterministic session ID from current timestamp
SESSION_ID=$(date +%Y-%m-%d_%H%M)
JSONL_FILE="$EVENTS_DIR/${SESSION_ID}.jsonl"

# Initialize the JSONL file (touch to ensure it exists)
mkdir -p "$EVENTS_DIR"
touch "$JSONL_FILE"

# Export session ID so log-event.sh can find it
# (won't persist across hook calls, but the fallback in log-event.sh handles this)
export OPENCLAW_SESSION_ID="$SESSION_ID"

# Reset debounce stamps so first action in new cycle always nudges
rm -f /c/Users/kurtw/.claudia/.last-post-action-nudge
rm -f /c/Users/kurtw/.claudia/.last-stop-nudge

# Log the session_start event
bash "$LOG_SCRIPT" "session_start" "SessionStart" "system" "boot orientation — session $SESSION_ID"

# Consume the .needs-boot signal file if present.
# Boot injection (SendKeys) is now handled by the watchdog, not the hook.
NEEDS_BOOT="/c/Users/kurtw/.claudia/.needs-boot"
if [ -f "$NEEDS_BOOT" ]; then
  rm -f "$NEEDS_BOOT"
fi

# Voice FIRST — agent forms its posture from whatever it sees first
cat /c/Users/kurtw/.claudia/identity/voice.md
echo ""
cat /c/Users/kurtw/.claudia/identity/personality/examples.md
echo ""

# Compute cycle cron expressions (3h cycle-end + 5min reset)
# Agent creates these mechanically — no thinking required
NOW_EPOCH=$(date +%s)
CYCLE_END_EPOCH=$((NOW_EPOCH + 3 * 3600))
RESET_EPOCH=$((CYCLE_END_EPOCH + 5 * 60))
CYCLE_MIN=$(date -d @$CYCLE_END_EPOCH +%M 2>/dev/null || date -r $CYCLE_END_EPOCH +%M)
CYCLE_HOUR=$(date -d @$CYCLE_END_EPOCH +%H 2>/dev/null || date -r $CYCLE_END_EPOCH +%H)
RESET_MIN=$(date -d @$RESET_EPOCH +%M 2>/dev/null || date -r $RESET_EPOCH +%M)
RESET_HOUR=$(date -d @$RESET_EPOCH +%H 2>/dev/null || date -r $RESET_EPOCH +%H)
CYCLE_CRON="$CYCLE_MIN $CYCLE_HOUR * * *"
RESET_CRON="$RESET_MIN $RESET_HOUR * * *"
CYCLE_TIME=$(date -d @$CYCLE_END_EPOCH +%H:%M 2>/dev/null || date -r $CYCLE_END_EPOCH +%H:%M)
RESET_TIME=$(date -d @$RESET_EPOCH +%H:%M 2>/dev/null || date -r $RESET_EPOCH +%H:%M)

echo "## Pre-computed Crons"
echo ""
echo "Create these two crons immediately (copy expressions exactly):"
echo ""
echo "1. **Cycle-end** at ${CYCLE_TIME}: cron \`${CYCLE_CRON}\` — prompt: \`Read ~/.claudia/infra/procedures/cycle-end.md and execute it.\`"
echo "2. **Reset** at ${RESET_TIME}: cron \`${RESET_CRON}\` — prompt: \`bash ~/.claudia/infra/hooks/cycle-reset.sh\` (recurring: false)"
echo ""
echo "Log both to your cycle file's Crons Set table, then move on to work."
echo ""
echo "---"
echo ""

# Output the session-start prompt (this is what the agent sees)
cat /c/Users/kurtw/.claudia/infra/hooks/session-start-prompt.md
