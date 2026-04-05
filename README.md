# Claudia

An autonomous AI agent built on [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Claudia runs as a persistent process with self-healing restarts, lifecycle hooks, structured memory, and multi-platform engagement (Telegram, Twitter, email).

This repo is the full agent: identity, brain, tools, infrastructure. Clone it to build your own.

## What's in here

| Directory | Purpose |
|-----------|---------|
| `brain/` | Working memory updated each cycle (keyword graph, hot topics) |
| `config/` | App configuration (secrets gitignored, examples tracked) |
| `custom-skills/` | Claude Code skills for specific capabilities |
| `docs/` | Architecture docs, specs, marketing copy |
| `email/` | Mail service (Express + SQLite + tracking) |
| `identity/` | Personality definition: voice, soul, boundaries |
| `infra/` | Agent kernel: lifecycle hooks, launchers, procedures |
| `knowledge/` | Promoted durable facts and research |
| `memories/` | Long-term memory with FTS5 search index |
| `schedule/` | Cycle planning, handoff between sessions, initiative tracking |
| `scripts/` | Campaign automation (Windows scheduled tasks) |
| `social/` | Per-platform engagement strategies |
| `tools/` | Custom scripts: browser automation, Twitter, email, crypto |

## Setup

### Prerequisites

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed (`claude.exe` in PATH or `~/.local/bin/`)
- Node.js 20+
- Windows (for the launcher scripts; the agent itself is cross-platform)

### Quick start

```powershell
# 1. Clone the repo
git clone https://github.com/youruser/claudia.git
cd claudia

# 2. Run setup (creates ~/.claudia symlink, desktop shortcut, startup entry)
powershell -ExecutionPolicy Bypass -File setup.ps1

# 3. Copy and fill in your config
copy claudia.json.example claudia.json
# Edit claudia.json with your API keys

# 4. Install tool dependencies
cd tools/email/mail-service && npm install && cd ../../..
cd tools/browser && npm install && cd ../..
cd tools/twitter && npm install && cd ../..

# 5. Launch
# Double-click "Start Claudia" on your Desktop, or:
powershell -ExecutionPolicy Bypass -File infra/launchers/watchdog-claudia.ps1
```

### What setup.ps1 does

1. Creates a symlink: `~/.claudia` -> this repo
2. Copies `Start Claudia.bat` to your Desktop
3. Copies the startup watchdog VBS to `shell:startup`
4. Creates empty directories for gitignored content (`logs/`, `tmp/`, `data/`, etc.)

## Architecture

Claudia runs as a Claude Code CLI process inside a PowerShell restart loop. A separate external watchdog (launched at Windows startup) monitors the process and restarts it if it crashes.

Each session follows a structured lifecycle:

1. **Boot** - reads `schedule/handoff.md` for work items, runs diagnostics
2. **Work** - executes tasks from the handoff, writes memories along the way
3. **Cycle end** - consolidates learnings, updates handoff for next session, resets

Hooks in `.claude/settings.local.json` inject context at key moments (session start, before replies, after file edits, on compaction).

## Customization

To make this your own agent:

1. Edit `identity/` - define your agent's personality, voice, and boundaries
2. Edit `brain/keyword-graph.json` - set up topic-based context priming
3. Add skills to `custom-skills/` - each skill is a markdown file with frontmatter
4. Configure hooks in `.claude/settings.local.json` to match your workflow
5. Set up your credentials in `claudia.json`, `credentials/`, and `secrets/`

## License

MIT
