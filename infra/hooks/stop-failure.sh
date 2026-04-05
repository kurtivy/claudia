#!/bin/bash
# StopFailure hook — fires when turn ends due to API error (rate limit, auth, etc.)
# Logs the event and sends Telegram alert to Kurt.

LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"
SECRETS="/c/Users/kurtw/.claudia/claudia.json"

# Log the failure event
bash "$LOG_SCRIPT" "api_failure" "StopFailure" "system" "API error caused turn to stop" 2>/dev/null

# Extract bot token for Telegram alert
BOT_TOKEN=$(node -e "try{console.log(require('$SECRETS').agents.telegram.botToken)}catch{}" 2>/dev/null)

if [ -n "$BOT_TOKEN" ]; then
  TIMESTAMP=$(date '+%H:%M %Z')
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d chat_id=1578553327 \
    -d text="⚠️ API error at ${TIMESTAMP}. Session may have stalled. Check if restart needed." \
    > /dev/null 2>&1
fi

# Output prompt for the agent
echo "API error detected. Check if you can continue or if a restart is needed."
