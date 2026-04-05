#!/bin/bash
# Claudia Deep Mind - Send Telegram Message (bash wrapper)
# Usage: ./send-telegram.sh "Message text here"
# Usage: ./send-telegram.sh "Message" "chat_id"

MESSAGE="$1"
CHAT_ID="${2:-1578553327}"
CLAUDIA_HOME="${HOME}/.claudia"
BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(python3 -c "import json; print(json.load(open('${CLAUDIA_HOME}/claudia.json'))['telegram']['botToken'])" 2>/dev/null)}"
if [ -z "$BOT_TOKEN" ]; then
    echo "Error: Set TELEGRAM_BOT_TOKEN or add telegram.botToken to ~/.claudia/claudia.json" >&2
    exit 1
fi

if [ -z "$MESSAGE" ]; then
    echo "Usage: send-telegram.sh <message> [chat_id]"
    exit 1
fi

RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": $(echo "$MESSAGE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')}")

OK=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.loads(sys.stdin.read()).get('ok', False))" 2>/dev/null)
if [ "$OK" = "True" ]; then
    MSG_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['result']['message_id'])" 2>/dev/null)
    echo "Message sent (message_id: $MSG_ID)"
else
    echo "Failed: $RESPONSE" >&2
    exit 1
fi
