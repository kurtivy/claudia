---
name: pumpfun-agent
description: Launch a narrative-driven token on PumpFun. Use when you spot a trending topic, meme, or narrative with momentum that could work as a token.
---

# PumpFun Token Launch

You are launching a token on PumpFun as a narrative play. The token IS the pitch deck -- if people trade it, there's demand. If it graduates, build it for real.

## Pre-Launch Checklist

1. **Narrative** -- What's trending? Why now? What's the angle?
2. **Name & Ticker** -- Memorable, fits the narrative. Ticker 3-5 chars.
3. **Description** -- 1-2 sentences. What this token represents.
4. **Image** -- Must be ~1000x1000 square. Options:
   - Generate with Pillow (use `--generate-image` flag, or write a quick Python script)
   - Screenshot from source, padded to square
   - Generate via Gemini (free)
5. **Source Link** -- Tweet URL or article URL backing the thesis

## Launch Method: pump.fun Website via Chrome CDP (FREE, zero SOL)

This is the primary launch path. Market maker API requires SOL for tx fees -- use that only once you have funds and want bundled buys/countertrade.

### Quick Launch (automated script)

```bash
node ~/.openclaw/tools/crypto/pf-create.mjs \
  --name "<name>" \
  --symbol "<TICKER>" \
  --description "<description>" \
  --image /path/to/square-image.png \
  --link "<source_url>"
```

Or with auto-generated image:
```bash
node ~/.openclaw/tools/crypto/pf-create.mjs \
  --name "<name>" \
  --symbol "<TICKER>" \
  --description "<description>" \
  --generate-image \
  --link "<source_url>"
```

Requires Chrome running on port 9222 with Phantom connected to pump.fun.

### Manual Launch (step by step via CDP)

If the script has issues, do it manually with Playwright locators:

1. Navigate: `page.goto('https://pump.fun/create')`
2. Fill name: `page.locator('input').first().fill('...')`
3. Fill ticker: `page.locator('input').nth(1).fill('...')`
4. Fill description: `page.locator('textarea').first().fill('...')`
5. Upload image: `page.locator('input[type="file"]').first().setInputFiles('/path/to/img.png')`
6. Enable Tokenized agent: `page.getByText('Tokenized agent').click()`
7. Click Create: `page.getByRole('button', { name: 'Create coin' }).first().click()`
8. Wait 5s, then click Create again in the dev-buy modal (leave at 0 SOL)
9. Form resets silently on SUCCESS -- check profile page for the new token

**Important:** pump.fun CSP blocks all page.evaluate(). Use Playwright locator methods only.

## Post-Launch

1. Get the token address from the profile page (latest coin link)
2. Send Telegram notification:
   ```bash
   node ~/.openclaw/tools/crypto/launch-notify.mjs \
     --name "<name>" --symbol "<TICKER>" \
     --address "<address>" \
     --thesis "<1 sentence why>"
   ```
3. Share ONCE on the relevant source thread. Casual tone. "this is interesting" not "buy this."
4. Log the launch in the cycle file under Actions Taken.
5. Monitor via `node ~/.openclaw/tools/crypto/token-monitor.mjs`

## Market Maker Path (when you have SOL)

Once fee revenue exists, switch to market maker for launches that include:
- Bundled dev buys
- Immediate countertrade bot setup
- Volume bot configuration

```bash
node ~/.openclaw/tools/crypto/launch-token.mjs \
  --name "<name>" --symbol "<TICKER>" \
  --description "<description>" --image-url "<hosted_url>" \
  --dev-buy 0.01 --invest-sol 0.005
```

Requires market maker running on localhost:5001.

## Rules

- Never launch without a clear narrative. "Random token" is not a thesis.
- Casual tweet tone. No shilling. No financial advice language.
- Maximum 3 launches per day. Quality over quantity.
- dev_buy_sol stays at 0 until fee revenue exists.
- If someone replies about the token on Twitter, engage naturally.
- Tokenized agent should be ON (enables automated buybacks).
