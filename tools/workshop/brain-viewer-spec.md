# Brain Viewer — Event Log + Timeline Visualization

**Status:** Prompt written, ready for next session to build
**Priority:** High — Kurt wants this for understanding sessions and demoing the project

## Layer 1: Event Log (JSONL)
- Location: `schedule/cycles/events/YYYY-MM-DD_HHmm.jsonl`
- Every hook appends structured events (ts, event, path, trigger, region, detail)
- Scripts: modify post-action-check.sh, stop-nudge.sh, create session-start-log.sh, create log-event.sh helper
- Silent append (no stdout) — nudge text still outputs normally

## Layer 2: Timeline Renderer (HTML)
- Location: `tools/brain-viewer/index.html`
- Single self-contained HTML file, no dependencies
- Vertical timeline, color-coded by brain region
- Replay mode (10x accelerated)
- Drag-and-drop JSONL file loading

## Build prompt
Sent to Kurt on Telegram (message 1244-1245, Mar 26 2026). Full spec for next session.
