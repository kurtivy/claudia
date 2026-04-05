#!/bin/bash
# log-event.sh — Append a structured event to the session's JSONL log
# Usage: log-event.sh <event> <trigger> <region> <detail> [path]
#
# The JSONL file is determined by OPENCLAW_SESSION_ID env var (set at session start).
# If not set, derives from today's date + current hour.
# All output goes to the file only — no stdout (hooks need clean output).

EVENT="$1"
TRIGGER="$2"
REGION="$3"
DETAIL="$4"
FPATH="$5"  # optional, relative to ~/.claudia/

EVENTS_DIR="/c/Users/kurtw/.claudia/schedule/cycles/events"

# Determine session file
if [ -n "$OPENCLAW_SESSION_ID" ]; then
  JSONL_FILE="$EVENTS_DIR/${OPENCLAW_SESSION_ID}.jsonl"
else
  # Fallback: use today's date + find the most recent .jsonl file for today
  TODAY=$(date +%Y-%m-%d)
  LATEST=$(ls "$EVENTS_DIR" 2>/dev/null | grep "^${TODAY}" | sort | tail -1)
  if [ -n "$LATEST" ]; then
    JSONL_FILE="$EVENTS_DIR/$LATEST"
  else
    # No session file yet — create one from current time
    JSONL_FILE="$EVENTS_DIR/$(date +%Y-%m-%d_%H%M).jsonl"
  fi
fi

# Build JSON line
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Escape double quotes in detail and path
DETAIL_ESC=$(echo "$DETAIL" | sed 's/"/\\"/g')
FPATH_ESC=$(echo "$FPATH" | sed 's/"/\\"/g')

if [ -n "$FPATH" ]; then
  echo "{\"ts\":\"$TS\",\"event\":\"$EVENT\",\"path\":\"$FPATH_ESC\",\"trigger\":\"$TRIGGER\",\"region\":\"$REGION\",\"detail\":\"$DETAIL_ESC\"}" >> "$JSONL_FILE"
else
  echo "{\"ts\":\"$TS\",\"event\":\"$EVENT\",\"trigger\":\"$TRIGGER\",\"region\":\"$REGION\",\"detail\":\"$DETAIL_ESC\"}" >> "$JSONL_FILE"
fi
