#!/bin/bash
# keyword-prime.sh — Priming injection via keyword graph
# Fires on UserPromptSubmit. Reads user prompt, matches against keyword-graph.json.
# On match: injects one-line nudge with context keywords and memory pointer.
# On no match: outputs nothing (zero cost).
# Debounce: 2 minutes (avoids repeated priming in rapid conversation)

STAMP_FILE="/c/Users/kurtw/.claudia/.last-keyword-prime"
MATCH_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/keyword-match.mjs"
COOLDOWN=120

# Debounce check
now=$(date +%s)
if [ -f "$STAMP_FILE" ]; then
  last=$(cat "$STAMP_FILE" 2>/dev/null)
  elapsed=$((now - last))
  if [ "$elapsed" -lt "$COOLDOWN" ]; then
    exit 0
  fi
fi

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Extract prompt text (sed since no jq)
PROMPT=$(echo "$HOOK_INPUT" | sed -n 's/.*"prompt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)

# Nothing to match against
if [ -z "$PROMPT" ]; then
  exit 0
fi

# Match via node script (avoids bash quoting hell)
MATCHES=$(node "$MATCH_SCRIPT" "$PROMPT" 2>/dev/null)

# Output matches (or nothing)
if [ -n "$MATCHES" ]; then
  echo "$now" > "$STAMP_FILE"
  echo "$MATCHES"
fi
