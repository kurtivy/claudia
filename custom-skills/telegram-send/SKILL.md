---
name: telegram-send
description: "Send Telegram messages as Kurt's personal account (not the bot). Use when Claudia needs to message someone as Kurt — DMs, group blasts, or personalized outreach via his real Telegram."
metadata: |
  { "openclaw": { "emoji": "📱" } }
---

# Telegram Send (Personal Account)

Send Telegram messages as Kurt's personal account via the ContactManagerBot EXE.

This is NOT the Bot API. This sends as Kurt himself via Telethon. Use sparingly and only when specifically needed.

## Prerequisites

- ContactManagerBot.exe must be running on Kurt's machine
- Located at: `C:\Users\kurtw\telegram-bot-standalone\worker_app\dist\ContactManagerBot.exe`

## Usage

```bash
# Send to specific people
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py send "Hey!" --to @username

# Send to multiple people with personalization
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py send "Hi {{first_name}}!" --to @user1 @user2

# Blast a folder
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py blast "Update" --folder "Crypto" --target groups

# Dry run (simulate)
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py send "Test" --to @kurtivy --dry-run

# Check worker status
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py status

# Check job result
python C:/Users/kurtw/telegram-bot-standalone/telegram-send.py status JOB_ID
```

Run with `--help` for full options.
