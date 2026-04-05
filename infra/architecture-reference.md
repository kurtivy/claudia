# Architecture Reference — Technical Map

_For agent onboarding and audits. Every hook, prompt, and file in execution order._

## Session Lifecycle

```
PROCESS START (watchdog-claudia.ps1 — launched by Desktop shortcut "Start Claudia.bat")
│
├── Kill orphan telegram pollers (Get-CimInstance bun.exe where telegram)
├── Set TELEGRAM_POLLING_ENABLED=1
├── Write .needs-boot signal file (tells SessionStart hook to inject "boot")
├── Write .terminal-pid (WindowsTerminal PID for SendKeys targeting)
├── Launch: claude.exe --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions --model claude-opus-4-6
│
▼
SESSION INIT (Claude Code internal)
│
├── Load plugins: telegram, Claude_in_Chrome (extension)
├── Load settings: claudia/.claude/settings.local.json
├── Load CLAUDE.md: claudia/CLAUDE.md
│
├── [HOOK] SessionStart → bash ~/.claudia/infra/hooks/session-start-log.sh
│   ├── Create JSONL event file: schedule/cycles/events/YYYY-MM-DD_HHmm.jsonl
│   ├── Log session_start event
│   ├── Reset debounce stamps
│   ├── Consume .needs-boot signal (watchdog handles boot injection via SendKeys)
│   ├── Output: voice.md + examples.md (personality grounding — loaded FIRST)
│   ├── Output: pre-computed cron expressions (cycle-end + reset, 3h window)
│   └── Output: session-start-prompt.md (boot procedure)
│
▼
BOOT SEQUENCE (agent executes session-start-prompt.md)
│
├── Create crons (mechanically, from pre-computed expressions):
│   ├── Cron 1: Cycle-end (3h after boot) → runs cycle-end.md procedure
│   └── Cron 2: Reset (3h + 5min) → runs cycle-reset.sh (one-shot)
│
├── Read ~/.claudia/schedule/handoff.md (JSON block):
│   ├── tasks[] — specific deliverables, do these first
│   ├── persistent[] — ongoing goals, work when tasks done
│   ├── kurt_blockers[] — objects with {text, stale_cycles}
│   └── tier_0_contact — last resort if everything is blocked
│
├── Run diagnostics: node ~/.claudia/tools/diagnostics/boot-check.mjs
├── Write cycle file: schedule/cycles/YYYY-MM-DD_HHmm-slug.md
├── Telegram check-in (declarative, never a question): "checking X, then doing Y."
│
▼
WORKING PHASE (continuous until cycle-end cron fires)
│
├── Agent is AUTONOMOUS. Executes tasks, then persistent goals.
│   Never asks permission. Never idles. Handoff IS the authorization.
│
├── On ANY message (Telegram, terminal, cron):
│   └── [HOOK] UserPromptSubmit → two hooks:
│       ├── cat voice-short.md (2-line compact voice)
│       └── bash keyword-prime.sh (match keywords → inject priming, 0 tokens on no match)
│
├── On file Write or Edit:
│   └── [HOOK] PostToolUse(Write|Edit) → bash post-action-check.sh
│       ├── Log event to JSONL (always, silent)
│       ├── Debounce: 10-min cooldown
│       └── Region-specific nudge + state check (memory count, cycle file exists)
│
├── On Telegram reply (PRE):
│   └── [HOOK] PreToolUse(telegram__reply) → bash pre-reply-voice.sh
│       ├── ALWAYS: Parse outgoing message, check for permission-asking patterns
│       │   ("should I", "waiting on", "want me to", "ready to", etc.)
│       │   → If detected: inject AUTONOMY VIOLATION warning
│       │   → Also detects blocker-listing (3+ blockers = context dump)
│       └── Debounced (30min): Inject voice examples for personality grounding
│
├── On Telegram reply (POST):
│   └── [HOOK] PostToolUse(telegram__reply) → bash post-telegram-capture.sh
│       └── Debounced (30min): "Worth remembering?" nudge
│
├── On agent going idle:
│   └── [HOOK] Stop → bash stop-nudge.sh
│       ├── Debounce: 10-min cooldown
│       ├── Log session_stop event
│       ├── Read handoff.md → extract specific next task
│       ├── Check cycle file → count Actions Taken entries
│       └── Output: "STOP DETECTED. Next task: [task]. Execute NOW."
│       │   If zero actions: "ZERO ACTIONS THIS CYCLE. Critical failure."
│
├── On context compaction:
│   └── [HOOK] PostCompact → bash post-compact.sh
│       ├── Re-inject full voice.md + examples.md
│       └── "Re-read cycle file, check CronList, continue working."
│
▼
CYCLE-END (3-hour cron fires → agent reads cycle-end.md procedure)
│
├── Close out cycle file (objectives, patterns, next actions)
├── Check memory gaps → write entries if needed
├── Write handoff.md (typed JSON, v2 schema):
│   ├── Uses: node tools/infra/write-handoff.mjs
│   ├── Carries forward persistent goals from previous handoff
│   ├── kurt_blockers: auto-increments stale_cycles per blocker
│   │   stale_cycles >= 4 → auto-deleted (never carried)
│   └── Validated by: node tools/infra/validate-handoff.mjs
├── Update brain/ files: working-set.json, keyword-graph.json
├── Telegram report to Kurt (skip midnight-7am)
│
▼
RESET (cycle-end + 5min cron fires → bash cycle-reset.sh)
│
├── Write restart-signal file
├── Write .needs-boot signal
├── Watchdog detects restart-signal → kills and relaunches process
│
▼
(cycle repeats)
```

## Self-Enforcement Architecture

The system uses hooks (fire automatically, no agent cooperation needed) for enforcement:

| Layer | Hook | Catches | Cost |
|-------|------|---------|------|
| **Prevent** | PreToolUse(telegram reply) | Permission-asking before it's sent | ~400 chars on violation, 0 on clean |
| **Recover** | Stop | Idle stalling — injects specific next task from handoff | ~320 chars per idle event |
| **Orient** | SessionStart | Boot drift — loads voice + procedure | ~13K chars (once) |
| **Re-orient** | PostCompact | Context loss after compaction | ~9K chars (rare) |

Blocker escalation is automated in write-handoff.mjs. Each cycle-end, stale_cycles increments. At 4, the blocker is deleted. No agent cooperation needed — the script handles it.

## Handoff Schema (v2)

```json
{
  "$schema": "handoff-v2",
  "timestamp": "ISO-8601",
  "cycle_file": "schedule/cycles/YYYY-MM-DD_HHmm-slug.md",
  "persistent": [
    {
      "id": "string",
      "goal": "string",
      "strategy": "string",
      "tools": "string",
      "context": {}
    }
  ],
  "tasks": [
    {
      "action": "string",
      "priority": 1,
      "initiative": "string|null",
      "resume_context": "string|null"
    }
  ],
  "tier_0_contact": {
    "method": "telegram",
    "chat_id": "string",
    "name": "string"
  },
  "kurt_blockers": [
    { "text": "string", "stale_cycles": 0 }
  ],
  "notes": "string|null"
}
```

**Blocker lifecycle:** New at 0. Incremented each cycle by write-handoff.mjs. At stale_cycles 2, agent sends pointed Telegram ask. At 4, auto-deleted.

## Process Launch Paths

Both launchers MUST have identical flags. If you change one, change the other.

| Script | Location | Used by | Loops? |
|--------|----------|---------|--------|
| `watchdog-claudia.ps1` | `~/.claudia/` | Desktop shortcut (Start Claudia.bat) | Yes — restarts on exit |
| `start-claudia.ps1` | `~/.claudia/infra/launchers/` | Manual use | No — single run |

Required flags: `--channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions --model claude-opus-4-6`
Required env: `TELEGRAM_POLLING_ENABLED=1`
Required signals: `.needs-boot` + `.terminal-pid` written before launch.

External watchdog: `claudia-watchdog.ps1` at `~/.claudia/` monitors process health, restarts via .bat if dead.

## Boot Injection (SendKeys targeting)

The boot injection types "boot" into the terminal to trigger autonomous operation.

- **Window target**: WindowsTerminal process (PID from `.terminal-pid`), NOT claude.exe
- **Signal gate**: Only fires if `.needs-boot` exists (written by watchdog/launcher)
- **Retry**: 3 attempts with 3-second gaps, logged to `~/.claudia/logs/boot-inject.log`

## File Map

### Config
- `claudia/.claude/settings.local.json` — hook definitions, permissions, tool allowlists
- `~/.claude.json` — global MCP servers, Chrome extension cache
- `~/.claude/channels/telegram/.env` — bot token
- `~/.claude/channels/telegram/access.json` — Telegram allowlist

### Hooks (in ~/.claudia/infra/hooks/)

| Script | Called by | Does |
|--------|----------|------|
| `session-start-log.sh` | SessionStart | Init JSONL, output voice + crons + boot prompt |
| `session-start-prompt.md` | session-start-log.sh | Boot procedure (autonomy rules, handoff-driven work) |
| `pre-reply-voice.sh` | PreToolUse(telegram reply) | **Autonomy enforcement** (pattern-match permission-asking) + debounced voice examples |
| `stop-nudge.sh` | Stop | **Idle recovery** (reads handoff, outputs specific next task, counts actions) |
| `post-action-check.sh` | PostToolUse(Write\|Edit) | Log event, debounced region-aware nudge + state check |
| `nudges/post-action-{region}.md` | post-action-check.sh | Region-specific nudges (memories, schedule, brain, tools, etc.) |
| `post-telegram-capture.sh` | PostToolUse(telegram reply) | Debounced conversation capture nudge |
| `keyword-prime.sh` | UserPromptSubmit | Match keywords against brain/keyword-graph.json, inject priming |
| `post-compact.sh` | PostCompact | Re-inject full voice + re-orientation |
| `progress-check-prompt.md` | Available for cron use | Mid-cycle stall recovery (checks Actions Taken) |
| `cycle-reset.sh` | Agent at cycle end | Write restart-signal + .needs-boot |
| `log-event.sh` | All hooks | Append structured JSON to session JSONL |

### Signal Files (in ~/.claudia/)

| File | Written by | Read by | Purpose |
|------|-----------|---------|---------|
| `.needs-boot` | watchdog, cycle-reset.sh | session-start-log.sh | Gate for boot injection |
| `.terminal-pid` | watchdog | session-start-log.sh, cycle-reset.sh | WindowsTerminal PID for SendKeys |
| `restart-signal` | cycle-reset.sh | watchdog | Distinguishes reset from crash |
| `.voice-debounce` | pre-reply-voice.sh | pre-reply-voice.sh | 30-min cooldown |
| `.last-post-action-nudge` | post-action-check.sh | post-action-check.sh | 10-min cooldown |
| `.last-stop-nudge` | stop-nudge.sh | stop-nudge.sh | 10-min cooldown |
| `.last-telegram-capture` | post-telegram-capture.sh | post-telegram-capture.sh | 30-min cooldown |
| `.last-keyword-prime` | keyword-prime.sh | keyword-prime.sh | 2-min cooldown |

### Brain & Data (all in ~/.claudia/)

| Path | Purpose |
|------|---------|
| `identity/` | soul.md, voice.md, voice-short.md, boundaries.md, personality/ |
| `schedule/handoff.md` | Cross-cycle state transfer (JSON v2, <40 lines) |
| `schedule/cycles/` | Per-cycle records + events/ JSONL |
| `schedule/initiatives/` | Per-initiative status.json + status.md |
| `memories/entries/` | Individual memory files (YYYY-MM-DD_slug.md) |
| `knowledge/` | Promoted durable facts (ai/, crypto/, infrastructure/) |
| `brain/working-set.json` | Hot/Warm/Cold topic routing |
| `brain/keyword-graph.json` | Keyword → context priming rules |
| `social/` | Per-platform contacts and strategies |
| `tools/` | Custom scripts (email/, system/, browser/, infra/, diagnostics/) |

### Key Tools

| Tool | Path | Purpose |
|------|------|---------|
| `write-handoff.mjs` | tools/infra/ | Generate v2 handoff with blocker auto-escalation |
| `validate-handoff.mjs` | tools/infra/ | Validate handoff schema |
| `brain-hygiene.mjs` | tools/infra/ | Audit and clean brain files |
| `boot-check.mjs` | tools/diagnostics/ | Infrastructure health check at boot |
| `brain-index.py` | tools/system/ | FTS5 index: `rebuild` or `search "query"` |
| `log-event.sh` | infra/hooks/ | Append structured event to session JSONL |

## Browser Connectivity

- **Claude_in_Chrome** (extension-based): Primary browser MCP. Connects via Chrome extension WebSocket. No DevTools port needed. Tools: `mcp__Claude_in_Chrome__*`

## Token Efficiency

| Mechanism | What | Saves |
|-----------|------|-------|
| voice-short.md | 2-line voice on every prompt vs full 67-line voice.md | ~500 tokens/message |
| Hook debouncing | All nudges debounced (10-30min cooldowns) | Prevents context bloat |
| Region-aware nudges | Targeted 1-line nudge vs 4-step checklist | ~50 tokens/nudge |
| Conditional keyword priming | 0 tokens on no match vs 200+ for full inject | ~180 tokens/message |
| Autonomy enforcement | 0 tokens on clean messages, ~400 only on violations | Near-zero normal cost |
| Handoff file | One JSON file at boot vs reading 5-8 files | ~3000 tokens/boot |
| Full voice at boot + PostCompact only | Heavy personality only when drift happens | ~500 tokens/message saved |
