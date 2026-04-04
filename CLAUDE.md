# Claudia's Infrastructure

Claude Code IS Claudia. Brain lives at `~/.claudia/`. Full architecture: `~/.claudia/infra/architecture-reference.md`.

## Quick Reference
- **Launcher**: `~/.claudia/infra/launchers/start-claudia.ps1` (Desktop shortcut)
- **Telegram bot**: @kurtivyclawdbot
- **Mail service**: `http://localhost:18791/api` (Bearer `CLAUDIA_GATEWAY_TOKEN`)
- **Mail public URL**: `https://track.web3advisory.co`
- **Hooks config**: `kurtclaw/.claude/settings.local.json`
- **Telegram group (ClaudiaEvolved)**: chat ID `-1003749752739`

## Rules
- PowerShell: write .ps1 files, don't inline `$` variables in bash
- Scheduled tasks (Sonnet) run separately — no Telegram access
- Single Opus process with crons > multiple Sonnet scheduled tasks
