# Chrome Connection

_"Claudia's window" — a dedicated Debug Profile Chrome instance with port 9222._

## How It Works

1. Chrome runs with `--remote-debugging-port=9222` using a dedicated Debug Profile (`%LOCALAPPDATA%\Google\Chrome\Debug Profile`)
2. Kurt logged into Twitter (and other sites) in this window once — sessions persist across restarts
3. `~/.claudia/tools/browser/cdp-eval.mjs` connects via CDP on localhost:9222
4. Chrome 146 requires a separate `--user-data-dir` for the debug port to bind — the Default profile ignores `--remote-debugging-port`

## Launch Command

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="C:\Users\kurtw\AppData\Local\Google\Chrome\Debug Profile" --restore-last-session
```

The launcher (`start-claudia.ps1`) handles this automatically.

## CLI Tools

```bash
cd ~/.claudia/tools/browser
node cdp-eval.mjs --navigate "https://x.com/notifications"
node cdp-eval.mjs --text 5000        # get page text
node cdp-eval.mjs --snapshot         # accessibility tree
node cdp-eval.mjs --screenshot       # save screenshot
node cdp-eval.mjs "document.title"   # eval JS
```

## At Session Start (boot-check.mjs handles all of this automatically)

1. **Check CDP**: `curl -s http://localhost:9222/json/version`
2. **If down**: boot-check.mjs auto-launches Debug Profile Chrome
3. **Check Twitter**: look at x.com tabs — if any show `/login` or `/flow`, session expired
4. **If expired**: boot-check.mjs runs `twitter-login.mjs` which reads credentials from `~/.claudia/secrets/twitter.json` and types them via CDP
5. **If login fails**: credentials may have changed. Ask Kurt.

Manual launch (if boot-check fails):
```bash
powershell.exe -NoProfile -Command "& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir='C:\Users\kurtw\AppData\Local\Google\Chrome\Debug Profile' --new-window --restore-last-session"
```

Manual Twitter login:
```bash
cd ~/.claudia/tools/browser && node twitter-login.mjs
```

## Twitter Credentials

Stored in `~/.claudia/secrets/twitter.json` (gitignored via `secrets/.gitignore`).
Account: @claudiaonchain. If login fails, check the file exists and credentials are current.

## Visual Identification

Kurt's personal Chrome: **his face** in the profile icon (top right corner).
Claudia's Debug Profile Chrome: **gray neutral person** icon (no Google account logged in to Chrome itself).

If you see Kurt's face, that's the wrong window. Claudia's window always has the neutral icon.

## Rules (non-negotiable)

- **NEVER** kill Kurt's personal Chrome — Claudia's window is SEPARATE from Kurt's browsing
- **NEVER** clear cookies, cache, or session data in the Debug Profile
- **NEVER** use Playwright MCP for tasks requiring auth sessions
- **NEVER** run chrome-debug.ps1 (deprecated — it kills ALL Chrome, including Kurt's)
- **OK** to kill and restart the Debug Profile Chrome if it's misbehaving (it's Claudia's window, not Kurt's)
- **OK** to start the Debug Profile Chrome if it's not running

## Why Debug Profile (Not Default)

Chrome 146 changed where DevToolsActivePort is written. The Default profile ignores `--remote-debugging-port` — port never binds. A separate `--user-data-dir` forces Chrome to create a new debug server. Kurt logged into Twitter in this window, so cookies work (no DPAPI issue — cookies were created natively in this profile, not copied).

## What Doesn't Work

- **Default profile + debug port** — Chrome 146 ignores the flag, port never opens
- **chrome-devtools-mcp** — disabled, not installed
- **Claude in Chrome extension** — Desktop App only, not CLI
- **Playwright MCP** — launches fresh unauthenticated browser
