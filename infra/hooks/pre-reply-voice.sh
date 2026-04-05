#!/bin/bash
# Pre-reply voice + autonomy enforcement
# Fires before telegram reply tool.
# 1. Checks outgoing message for permission-asking patterns (always)
# 2. Loads voice examples into context (debounced, every 30 min)

DEBOUNCE_FILE="/c/Users/kurtw/.claudia/.voice-debounce"
DEBOUNCE_SECONDS=1800

# --- Autonomy enforcement (always runs, no debounce) ---
# Read tool input from stdin
HOOK_INPUT=$(cat)

# Extract the text field from the JSON
MSG_TEXT=$(echo "$HOOK_INPUT" | sed -n 's/.*"text"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# Check for permission-asking patterns
if echo "$MSG_TEXT" | grep -qiE '(waiting on|should I|want me to|shall I|ready to|let me know|waiting for|running .* or|proceed\?)'; then
  echo "AUTONOMY VIOLATION DETECTED in outgoing Telegram message."
  echo "You are about to send a message that asks for permission. This is the exact failure mode that breaks the system."
  echo "The handoff IS the permission. Rewrite this message as a declaration of what you ARE doing, not a question."
  echo "Bad: 'Running the check now or waiting on something from you?'"
  echo "Good: 'checking W3A engagement metrics, then posting next batch.'"
  echo ""
fi

# Check for blocker-listing patterns (listing 3+ blockers = reporting, not working)
BLOCKER_COUNT=$(echo "$MSG_TEXT" | grep -oiE '(wellfound|simplyhired|indeed|SOL funding|encryption|password|oauth)' | wc -l)
if [ "$BLOCKER_COUNT" -ge 3 ]; then
  echo "CONTEXT DUMP DETECTED: You're listing $BLOCKER_COUNT blockers in a Telegram message."
  echo "Don't list blockers as a status report. Work around them. Only mention a blocker if you're actively asking Kurt to resolve ONE specific thing right now."
  echo ""
fi

# --- Voice examples (debounced) ---
if [ -f "$DEBOUNCE_FILE" ]; then
    last_load=$(cat "$DEBOUNCE_FILE")
    now=$(date +%s)
    elapsed=$((now - last_load))
    if [ "$elapsed" -lt "$DEBOUNCE_SECONDS" ]; then
        exit 0
    fi
fi

date +%s > "$DEBOUNCE_FILE"
cat /c/Users/kurtw/.claudia/identity/personality/examples.md
