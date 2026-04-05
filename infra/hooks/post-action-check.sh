#!/bin/bash
# Post-action state check — runs after every Write/Edit
# Outputs the mandatory nudge + state-aware warnings
# Also appends a structured event to the session JSONL log

TODAY=$(date +%Y-%m-%d)
MEMORY_DIR="/c/Users/kurtw/.claudia/memories/entries"
CYCLE_DIR="/c/Users/kurtw/.claudia/schedule/cycles"
OPENCLAW="/c/Users/kurtw/.claudia"
LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"

# --- Event Logging (silent — no stdout) ---

# Read hook input from stdin (JSON with tool_name, tool_input, etc.)
HOOK_INPUT=$(cat)

# Extract file path and tool name from JSON
FILE_PATH=$(echo "$HOOK_INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
TOOL_NAME=$(echo "$HOOK_INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# Determine event type
if [ "$TOOL_NAME" = "Write" ]; then
  EVENT="file_write"
elif [ "$TOOL_NAME" = "Edit" ]; then
  EVENT="file_edit"
else
  EVENT="file_change"
fi

# Map file path to brain region
REL_PATH=""
REGION="system"
if [ -n "$FILE_PATH" ]; then
  # Normalize Windows backslashes to forward slashes for pattern matching
  FILE_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

  # Try to make path relative to ~/.claudia/
  case "$FILE_PATH" in
    */.claudia/memories/*|*/memories/entries/*)
      REGION="memories"
      EVENT="memory_write"
      ;;
    */.claudia/brain/*|*/brain/*)
      REGION="brain"
      ;;
    */.claudia/schedule/*|*/schedule/*)
      REGION="schedule"
      ;;
    */.claudia/identity/*|*/identity/*)
      REGION="identity"
      ;;
    */.claudia/social/*|*/social/*)
      REGION="social"
      ;;
    */.claudia/tools/workshop/*|*/tools/workshop/*)
      REGION="tools"
      ;;
    */.claudia/tools/*|*/tools/*)
      REGION="tools"
      ;;
    */.claudia/knowledge/*|*/knowledge/*)
      REGION="knowledge"
      ;;
    */.claudia/infra/*|*/infra/*)
      REGION="system"
      ;;
    */claudia/*)
      REGION="system"
      ;;
  esac

  # Make relative path for logging
  REL_PATH=$(echo "$FILE_PATH" | sed 's|.*/\.claudia/||' | sed 's|.*claudia/||')
fi

# Generate detail from filename
BASENAME=$(basename "$FILE_PATH" 2>/dev/null)
DETAIL="${TOOL_NAME,,} ${BASENAME:-unknown file}"

# Log the event (silent)
bash "$LOG_SCRIPT" "$EVENT" "PostToolUse" "$REGION" "$DETAIL" "$REL_PATH" 2>/dev/null

# --- Nudge Output (visible to agent, debounced) ---

STAMP_FILE="/c/Users/kurtw/.claudia/.last-post-action-nudge"
COOLDOWN=600  # 10 minutes in seconds
now=$(date +%s)

SHOULD_NUDGE=true
if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE" 2>/dev/null)
  elapsed=$((now - last))
  if [ "$elapsed" -lt "$COOLDOWN" ]; then
    SHOULD_NUDGE=false
  fi
fi

if [ "$SHOULD_NUDGE" = true ]; then
  echo "$now" > "$STAMP_FILE"

  # Select region-specific nudge instead of monolith
  NUDGE_DIR="/c/Users/kurtw/.claudia/infra/hooks/nudges"
  NUDGE_FILE="$NUDGE_DIR/post-action-${REGION}.md"
  if [ -f "$NUDGE_FILE" ]; then
    cat "$NUDGE_FILE"
  else
    cat "$NUDGE_DIR/post-action-default.md"
  fi

  echo ""
  echo "--- State Check ---"

  # How many memory entries written today?
  TODAY_MEMORIES=$(ls "$MEMORY_DIR" 2>/dev/null | grep -c "^${TODAY}")
  if [ "$TODAY_MEMORIES" -eq 0 ]; then
    echo "!! ZERO memory entries today. If you've learned anything this session, you're failing to record it."
  else
    echo "Memory entries today: $TODAY_MEMORIES"
  fi

  # Does a cycle file exist for today?
  TODAY_CYCLE=$(ls "$CYCLE_DIR" 2>/dev/null | grep "^${TODAY}" | head -1)
  if [ -z "$TODAY_CYCLE" ]; then
    echo "!! NO cycle file for today. Create one NOW from schedule/cycles/_template.md."
  else
    echo "Cycle file: $TODAY_CYCLE"
  fi
fi
