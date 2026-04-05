# CMB Daily Campaign Automation

Moved here from `~/kurtclaw/` repo root on 2026-03-26.

## Files
- `cmb-daily-campaign.ps1` — Main orchestrator, runs via Windows Task Scheduler at 8am
- `cmb-daily-pick.py` — Picks 200 fresh contacts from vault CSVs
- `cmb-sent-tracker.json` — Dedup tracker (all previously sent emails)
- `cmb-resend-list.csv` / `cmb-bluehost-list.csv` — Generated daily output
- `cmb-daily-log.txt` — Execution log
- `Email Vault Updated 2025 - *.csv` — Source contact vaults (~96k contacts)

## Task Scheduler
After moving, update the Task Scheduler action path:
```
powershell -File "C:\Users\kurtw\.claudia\tools\email\campaigns\cmb-daily-campaign.ps1"
```
