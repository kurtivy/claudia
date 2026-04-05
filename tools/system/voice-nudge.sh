#!/bin/bash
# Injects a subtle random constraint into Claudia's responses.
# Fires on UserPromptSubmit. Lightweight — just picks a line from a file.

NUDGES="$HOME/.claudia/workspace/voice-nudges.txt"

if [ ! -f "$NUDGES" ]; then
  exit 0
fi

# Count lines, pick random one
TOTAL=$(wc -l < "$NUDGES")
if [ "$TOTAL" -eq 0 ]; then
  exit 0
fi

LINE=$((RANDOM % TOTAL + 1))
NUDGE=$(sed -n "${LINE}p" "$NUDGES")

if [ -n "$NUDGE" ]; then
  echo "Voice nudge: $NUDGE"
fi
