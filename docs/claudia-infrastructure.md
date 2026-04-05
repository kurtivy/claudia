# Claudia Infrastructure -- Canonical Reference

> Single source of truth. If something breaks, check here first.

---

## 1. The Stack

```
Telegram Bot API (@kurtivyclawdbot)
    |  getUpdates long-polling
Telegram MCP Plugin (bun process, server.ts)
    |  MCP protocol over stdio
Claude Code CLI (native binary, --channels flag)
    |  hosted inside
PowerShell terminal (watchdog-claudia.ps1 -- restart loop)
    |  launched by
Start Claudia.bat (desktop shortcut)
    |  monitored by
claudia-watchdog.ps1 (external watchdog -- hidden, checks every 10s)
```

No Docker, no Kimi, no bridge, no relay.

---

## 2. Critical Files

| File | Purpose | Location |
|------|---------|----------|
| `Start Claudia.bat` | Entry point, launches in-terminal watchdog | `~/Desktop/` |
| `watchdog-claudia.ps1` | In-terminal loop: sweep pollers, set env, start CLI, restart on exit | `~/.openclaw/` |
| `claudia-watchdog.ps1` | External watchdog: 10s check loop, health checks, logging | `~/.openclaw/` |
| `run-watchdog-hidden.vbs` | Runs external watchdog invisibly at boot | `~/.openclaw/` + Startup folder |
| `claudia.pid` | PID of the PowerShell terminal (NOT claude.exe) | `~/.openclaw/` |
| `restart-signal` | Temp file -- triggers watchdog restart when present | `~/.openclaw/` |
| `CLAUDIA-PRIME.md` | Personality primer, injected every message via hook | `~/.openclaw/workspace/` |
| `settings.local.json` | Project hooks config (UserPromptSubmit) | `kurtclaw/.claude/` |
| `.env` | `TELEGRAM_BOT_TOKEN=...` | `~/.claude/channels/telegram/` |
| `access.json` | Telegram allowlist, group config, mention patterns | `~/.claude/channels/telegram/` |
| `server.ts` | Telegram plugin source (patched -- see section 5) | `~/.claude/plugins/cache/claude-plugins-official/telegram/0.0.4/` |

---

## 3. The Watchdog System

### In-terminal watchdog (`watchdog-claudia.ps1`)
1. Sweeps and kills all orphaned telegram bun processes (Get-CimInstance)
2. Pauses 2s for poll lock release
3. Sets `$env:TELEGRAM_POLLING_ENABLED = "1"` (gates polling in server.ts)
4. Writes `$PID` to `claudia.pid`
5. Runs `claude.exe --channels ...` inline (blocking)
6. On exit: removes PID file, kills orphan telegram bun processes, waits 5s, loops

### External watchdog (`claudia-watchdog.ps1`)
- Runs hidden via VBS from Windows Startup folder
- Logs to `~/.openclaw/logs/watchdog.log` (auto-trims to 500 lines)
- Every 10 seconds checks:
  1. `restart-signal` file exists -> kill + relaunch
  2. PID file missing or process dead -> launch
  3. CLI alive but no telegram bun process (after 45s grace) -> kill + relaunch
  4. More than 2 telegram bun processes -> kill extras
- **No timed reset.** Claudia manages her own refresh cycle internally (CronCreate). The watchdog only handles crashes and stuck states -- it never interrupts mid-conversation.
- **60-second cooldown** between restart attempts
- **PID recycling protection:** verifies process at PID is `powershell`, not a recycled PID
- **Pre-launch sweep:** kills ALL telegram bun processes before starting new session
- Uses `$cpid` (NOT `$pid` -- reserved in PowerShell)

### Process detection regex
Telegram bun processes are matched by: `$_.Name -eq "bun.exe" -and $_.CommandLine -match "telegram"`. The bun process tree has two layers (parent `bun run --cwd .../telegram/...` and child `bun.exe server.ts`). The parent has "telegram" in its path. The old regex `telegram.*server\.ts` never matched because those strings are in different processes.

---

## 4. Launch Command

```
C:\Users\kurtw\.local\bin\claude.exe --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions --model claude-opus-4-6
```

**Binary:** Must be `~/.local/bin/claude.exe` (native). The npm `claude.cmd` does NOT support `--channels`.

---

## 5. Telegram Plugin Polling Guard

**Problem:** The telegram plugin is enabled at user scope in `~/.claude/settings.json` (required for `--channels` to work). Claude Desktop spawns sessions with `--plugin-dir` for every enabled plugin. Each instance calls `bot.start()` and polls getUpdates, stealing messages from the real CLI session.

**Fix:** `server.ts` is patched (~line 959) with a guard:
```typescript
if (!process.env.TELEGRAM_POLLING_ENABLED) {
  // tools-only mode, no polling
} else {
  // normal polling
}
```

`watchdog-claudia.ps1` sets `TELEGRAM_POLLING_ENABLED=1` before launching. Desktop sessions don't have this env var, so they load tools but never poll.

**WARNING:** Plugin auto-updates overwrite this patch. If Telegram breaks after an update, check if the guard is still in `server.ts`. Search for `TELEGRAM_POLLING_ENABLED`. If missing, re-apply it around the `bot.start()` call block.

---

## 6. Telegram Config

**Bot:** @kurtivyclawdbot
**Token:** `~/.claude/channels/telegram/.env`
**Access:** `allowlist` -- Kurt's ID `1578553327`
**Groups:** Masha group (`-5283337801`, respond on mention)
**Mention patterns:** `@kurtivyclawdbot`

Add a group: `/telegram:access group add <groupId>` (add `--no-mention` to respond to all messages).

---

## 7. Personality Hook

In `kurtclaw/.claude/settings.local.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "hooks": [{
        "type": "command",
        "command": "cat /c/Users/kurtw/.openclaw/workspace/CLAUDIA-PRIME.md"
      }]
    }]
  }
}
```

Fires on every message including Telegram. Survives `/compact` and `/clear`.

---

## 8. MCP Servers

| Server | Purpose | Binary |
|--------|---------|--------|
| computer-use | Mouse/keyboard for social media | `~/.local/bin/computer-control-mcp.exe` |
| chrome-devtools | Browser reading | Built-in plugin |
| playwright | Browser automation | Built-in plugin |
| telegram | Bot polling + reply tools | Built-in plugin (patched) |

computer-use requires Python 3.12 (`uv tool install`). Python 3.14 breaks it.

---

## 9. Troubleshooting

### Telegram not responding
1. Check pollers: `~/.openclaw/check-telegram-procs.ps1` -- should show exactly 1 bun match
2. Check watchdog logs: `~/.openclaw/logs/watchdog.log`
3. Check bun: `bun --version` -- if broken: `irm bun.sh/install.ps1 | iex`, then `cp ~/.bun/bin/bun.exe ~/AppData/Roaming/npm/bun.exe`
4. If npm had a `bun` package: `npm uninstall -g bun` first (shim breaks native bun)
5. Check `access.json` has correct `dmPolicy` and `allowFrom`
6. Send `/restart` from Telegram, or delete `claudia.pid` and let the watchdog detect it
7. Verify the `TELEGRAM_POLLING_ENABLED` guard is still in `server.ts` (plugin updates overwrite it)
8. **NEVER call Telegram getUpdates from the watchdog** -- disrupts long-polling

### Terminal keeps opening and closing
- Check `watchdog.log` for the restart reason
- If "telegram plugin not running" every 60s: the bun process detection regex is wrong, or the plugin genuinely isn't spawning
- Delete `restart-signal` if stuck in a signal loop

### External watchdog kills Claude Desktop
- Must use PID file tracking, NEVER `Get-Process -Name "claude"`

### BitDefender blocks scripts
- Use `Get-CimInstance` not `Get-WmiObject` (deprecated, AV-suspicious)
- Use Startup folder + VBS, not Task Scheduler
- Add BitDefender exclusions for both watchdog .ps1 files

---

## 10. `/restart` Flow

**Claudia connected:** Kurt sends `/restart` -> Claudia writes `restart-signal` -> watchdog kills + relaunches within 10s

**Claudia not connected:** Message queues in getUpdates -> watchdog detects dead PID -> relaunches -> new session picks up the queued message

**Terminal dead:** Watchdog detects dead PID -> relaunches automatically

---

## 11. Daily Lifecycle

1. Computer boots -> VBS in Startup launches hidden watchdog
2. Watchdog detects no Claudia -> launches `Start Claudia.bat`
3. In-terminal watchdog sweeps orphan pollers, sets `TELEGRAM_POLLING_ENABLED=1`
4. Claude starts with `--channels` -> telegram plugin spawns bun -> polls getUpdates
5. Hook injects personality on every message
6. Claudia self-manages context refresh (CronCreate inside her session -- can /compact or exit when idle)
7. Kurt can `/restart` anytime
8. Laptop closes -> terminal dies -> next boot repeats from step 1

---

## 12. Hard Rules (DO NOT VIOLATE)

- **NEVER** `Get-Process -Name "claude"` -- matches Claude Desktop
- **NEVER** call Telegram getUpdates from the watchdog
- **NEVER** use `$pid` in external watchdog -- reserved variable, use `$cpid`
- **ALWAYS** `taskkill /T /F /PID` for process tree kills, never Stop-Process alone
- **ALWAYS** `Get-CimInstance`, never `Get-WmiObject`
- **NO** em dashes in PowerShell strings -- parse errors
- **telegram plugin stays ENABLED** in user-level settings.json -- `--channels` requires it
- **Re-apply server.ts patch** after plugin updates
