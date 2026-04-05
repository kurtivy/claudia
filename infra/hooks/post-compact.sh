#!/bin/bash
# post-compact.sh — Re-injects orientation context after compaction
# Prevents amnesia when auto-compact or /compact fires

LOG_SCRIPT="/c/Users/kurtw/.claudia/infra/hooks/log-event.sh"

# Log the compact event
bash "$LOG_SCRIPT" "context_compact" "PostCompact" "system" "context compacted, re-orienting" 2>/dev/null

# Re-inject full voice + examples (lost detail during compact)
cat /c/Users/kurtw/.claudia/identity/voice.md
echo ""
cat /c/Users/kurtw/.claudia/identity/personality/examples.md

echo ""

# Output re-orientation prompt
cat /c/Users/kurtw/.claudia/infra/hooks/post-compact-prompt.md
