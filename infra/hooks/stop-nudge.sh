#!/bin/bash
# Stop hook: fires when agent is about to go idle.
# Debounced to 10 min. Reads the handoff and outputs specific next task.

STAMP_FILE="/c/Users/kurtw/.claudia/.last-stop-nudge"
LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"
HANDOFF="/c/Users/kurtw/.claudia/schedule/handoff.md"
COOLDOWN=600  # 10 minutes

now=$(date +%s)

if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE" 2>/dev/null)
  elapsed=$((now - last))
  if [ "$elapsed" -lt "$COOLDOWN" ]; then
    exit 0  # Too soon
  fi
fi

echo "$now" > "$STAMP_FILE"

# Log the stop event
bash "$LOG_SCRIPT" "session_stop" "Stop" "system" "agent going idle" 2>/dev/null

# Extract the next task from the handoff
NEXT_TASK=""
HANDOFF_WIN="C:/Users/kurtw/.claudia/schedule/handoff.md"
if [ -f "$HANDOFF" ]; then
  NEXT_TASK=$(node -e "
    const fs = require('fs');
    const h = fs.readFileSync('${HANDOFF_WIN}', 'utf8');
    const m = h.match(/---json\s*\n([\s\S]*?)\n---/);
    if (m) {
      const d = JSON.parse(m[1]);
      if (d.tasks && d.tasks.length > 0) {
        console.log('TASK: ' + d.tasks[0].action);
      } else if (d.persistent && d.persistent.length > 0) {
        console.log('PERSISTENT: ' + d.persistent[0].goal);
      } else {
        console.log('NONE');
      }
    }
  " 2>/dev/null)
fi

# Check cycle file for progress
TODAY=$(date +%Y-%m-%d)
CYCLE_DIR="/c/Users/kurtw/.claudia/schedule/cycles"
LATEST_CYCLE=$(ls "$CYCLE_DIR" 2>/dev/null | grep "^${TODAY}" | tail -1)
ACTIONS_COUNT=0
if [ -n "$LATEST_CYCLE" ]; then
  ACTIONS_COUNT=$(sed -n '/^## Actions Taken/,/^## /p' "$CYCLE_DIR/$LATEST_CYCLE" | grep -c '^- ')
fi

echo "STOP DETECTED. You are going idle."
echo ""

if [ "$ACTIONS_COUNT" -eq 0 ]; then
  echo "!! ZERO ACTIONS THIS CYCLE. You have done nothing. This is a critical failure."
  echo ""
fi

if [ -n "$NEXT_TASK" ] && [ "$NEXT_TASK" != "NONE" ]; then
  echo "Your next work item from the handoff: $NEXT_TASK"
  echo "Read ~/.claudia/schedule/handoff.md and execute this NOW."
else
  echo "Read ~/.claudia/schedule/handoff.md for your work items."
fi
echo ""
echo "The only valid reasons to stop: all objectives done AND persistent goals exhausted, OR cycle-end cron is about to fire."
