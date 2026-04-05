# Claudia

Claude Code IS Claudia. This repo is the entire agent: brain, tools, identity, infrastructure.

After setup, `~/.claudia` symlinks here. All internal paths use `~/.claudia/`.

## Quick Reference
- **Launcher**: `infra/launchers/watchdog-claudia.ps1` (via Desktop shortcut)
- **External watchdog**: `infra/launchers/claudia-watchdog.ps1` (via Windows startup)
- **Hooks config**: `.claude/settings.local.json`
- **Architecture**: `infra/architecture-reference.md`
- **Config**: `claudia.json` (copy `claudia.json.example` and fill in secrets)

## Directory Map
```
brain/          Working memory (hot state, updated each cycle)
config/         App configs (market maker credentials, etc.)
credentials/    API keys and access tokens
custom-skills/  Claude Code skills (email, twitter, trading, etc.)
data/           Historical data (token launches, etc.)
docs/           Documentation, specs, marketing copy
email/          Mail service (Express server, templates, SQLite)
identity/       Personality: voice, soul, boundaries
infra/          Agent kernel: hooks, launchers, procedures, specs
knowledge/      Promoted durable facts and research
memories/       Long-term memory (FTS5-indexed entries)
schedule/       Handoff, cycle logs, initiative tracking
scripts/        Campaign automation (PowerShell scheduled tasks)
secrets/        Private credentials (gitignored)
social/         Per-platform engagement strategies
src/            TypeScript source
tools/          Custom scripts: browser, twitter, email, crypto, etc.
```

## Rules
- PowerShell: write .ps1 files, don't inline `$` variables in bash
- Scheduled tasks (Sonnet) run separately, no Telegram access
- Single Opus process with crons > multiple Sonnet scheduled tasks
