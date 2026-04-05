#!/bin/bash
# cycle-reset.sh — Reset the Claudia session at end of 3-hour cycle
# Writes the watchdog's restart-signal file so the watchdog handles the kill+relaunch.
# Previous approach (SendKeys /clear, PID parsing from bash) failed silently due to
# UTF-16LE PID files that bash can't read. Let the watchdog do what it's built for.

SIGNAL_FILE="/c/Users/kurtw/.claudia/restart-signal"
BOOT_FILE="/c/Users/kurtw/.claudia/.needs-boot"
LOG_FILE="/c/Users/kurtw/.claudia/logs/cycle-reset.log"

TS=$(date '+%Y-%m-%d %H:%M:%S')

# Signal the watchdog to restart us
echo "cycle-reset" > "$SIGNAL_FILE"

# Tell the next boot to auto-inject the boot procedure
echo "auto" > "$BOOT_FILE"

echo "[$TS] Cycle reset signal written. Watchdog will handle kill+relaunch." >> "$LOG_FILE"
