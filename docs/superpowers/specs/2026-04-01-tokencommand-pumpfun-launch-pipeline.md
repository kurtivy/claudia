# TokenCommand PumpFun Launch Pipeline

**Date:** 2026-04-01
**Status:** Approved
**Owner:** Claudia (autonomous)

## Overview

An autonomous token launch pipeline where Claudia detects trending narratives, formulates investment theses, and launches tokens on PumpFun via the existing market maker rebuild (`~/Desktop/market_maker_rebuild/`). Revenue comes from 0.5% creator trading fees. Tokens that gain traction become real projects.

Fully autonomous. Claudia decides what to launch and when. Telegram notifications for launches and milestones, not for approval.

## Components

1. **Trend Scanner** -- monitors Twitter/crypto during normal engagement cycles for narrative opportunities
2. **Thesis Engine** -- generates token concept: name, ticker, description, narrative link (tweet or article)
3. **Market Maker Client** -- Node.js HTTP wrapper calling FastAPI on `localhost:5001`
4. **Launch Executor** -- orchestrates: thesis -> image -> launch via market maker -> tweet -> monitor
5. **Revenue Tracker** -- tracks creator fees earned per token, total SOL accumulated, per-token P&L
6. **Token Monitor** (exists at `~/.openclaw/tools/crypto/token-monitor.mjs`) -- extended to track Claudia's own launches

## Launch Flow

1. **Identify narrative** -- trending meme, breaking news, viral thread, new protocol, anything with momentum
2. **Write thesis** -- 2-3 sentence narrative. Pick name, ticker, description. Find source material link.
3. **Generate image** -- screenshot from source article/tweet, OR generate via Gemini (free). Whichever fits better.
4. **Launch token** -- `POST /api/tokens/launch` on market maker. Params: name, ticker, description, image, creator wallet (aged wallet from pool, round-robin).
5. **Tweet** -- Post about the thesis with pump.fun link. Casual tone, not a shill. "This is interesting" not "buy this."
6. **Monitor** -- Track volume, bonding curve progress, holder count via token-monitor.mjs.
7. **Engage** -- Reply to anyone discussing the token or underlying narrative. Drive organic conversation.
8. **Collect fees** -- Periodically claim creator fees via pump.fun browser automation (Chrome CDP).
9. **Invest** -- Once fees accumulate, buy a position in promising launches using collected SOL.
10. **Exit** -- Configure countertrade bot per token in market maker, OR manual sell. No auto-management -- each token needs explicit sell setup.

**Frequency:** No fixed schedule. Launch when a good narrative appears. Could be 0 in a quiet week, 3 in a busy day. Quality over quantity.

## Revenue & Reinvestment Loop

### Fee Collection
- Periodic check of unclaimed creator fees on pump.fun via Chrome CDP (`cdp-eval.mjs`)
- Connect to Kurt's Chrome on port 9222 (Phantom wallet must be installed and connected)
- Collect fees to the creator wallet
- Log each collection: amount, token, timestamp

### Reinvestment Strategy
- Collected fees -> buy into own tokens early on the bonding curve
- Gives Claudia an actual position with upside, not just 0.5% passive fees
- Each token with a position needs explicit exit setup: countertrade bot config in market maker OR manual sell decisions
- Never dump -- gradual exits only

### Flywheel
1. Launch token (free) -> earn 0.5% creator fees from any volume
2. Collect fees -> use as seed capital
3. Buy into own tokens early -> sell position for profit as volume grows
4. Reinvest profits -> bigger positions in future launches

### Tracking
- Per-token P&L: creator fees + position gains/losses
- Total portfolio: cumulative SOL across all wallets
- Milestone alerts via Telegram (first fee collected, first profitable exit, thresholds)

## Technical Integration

### Market Maker Communication
- Node.js HTTP client calling FastAPI on `localhost:5001`
- Key endpoints: launch token, list wallets, check token status
- If market maker is down: log error, alert Telegram, do not silently fail

### Wallet Strategy
- Aged wallets from existing pool (round-robin via market maker)
- Different wallet per launch -- no obvious on-chain link between tokens
- Creator wallet receives fees; trading wallet (if investing) is separate

### Fee Collection (Browser Automation)
- Navigate pump.fun via Chrome CDP (`cdp-eval.mjs`)
- Kurt's Chrome session on port 9222
- **Prerequisite (one-time Kurt setup):** Phantom wallet extension installed + logged into pump.fun

### Trend Detection
- Passive: Claudia already monitors Twitter during engagement cycles
- Active: periodically check crypto Twitter trending, DexScreener trending, pump.fun new launches for meta patterns
- No separate service -- runs within Claudia's normal operating loop

### Image Generation
- Option A: Screenshot from source material (articles, tweets) -- most authentic for narrative plays
- Option B: Gemini image generation (free) -- for when a custom image fits better
- Decision made per token based on narrative

### Storage
- Launch history: `~/.openclaw/data/token-launches.jsonl`
- Fee collection log: `~/.openclaw/data/fee-collections.jsonl`
- Portfolio state: `~/.openclaw/data/portfolio.json`

## Phases

### Phase 1 -- Get the pipe working
- Validate market maker starts and launch endpoint responds
- Fix bugs in PumpFun launch path (PumpPortal API integration)
- Build Node.js client wrapper for market maker API
- Test launch one real token (PumpFun has no testnet)
- Confirm token appears on pump.fun with correct metadata (name, image, description)

### Phase 2 -- Autonomous launch loop
- Trend detection integrated into normal operating cycle
- Full thesis -> image -> launch -> tweet flow working end to end
- Launch history logging to JSONL
- Telegram notifications on each launch (token name, pump.fun link, thesis summary)

### Phase 3 -- Revenue collection
- **Kurt prerequisite:** Phantom installed in Chrome + logged into pump.fun
- Browser automation for fee collection via CDP
- Fee collection logging
- Portfolio tracking (total SOL, per-token breakdown)

### Phase 4 -- Self-investment
- Use accumulated fees to buy into own tokens on bonding curve
- Configure countertrade bot or manual sell per token in market maker
- P&L tracking per token (fees + position gains)
- Reinvestment logic: what % of profits go back into next launches

Each phase is independently useful. Phase 1-2 gets tokens launching and building presence. Phase 3-4 turns it into a revenue engine.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Autonomy | Fully autonomous, no approval gates | No starting funds, nothing to guard. Launch freely. |
| Infrastructure | Existing market maker rebuild | Already built, needs bug fixes. Pay debugging cost once. |
| Wallet source | Aged wallets from pool | Already available, look organic on-chain |
| Initial capital | Zero SOL. Earn from creator fees. | No funds to allocate. Fees bootstrap everything. |
| Image source | Screenshot or Gemini (free) | Zero cost, per-token decision |
| Website | None. Link to tweet/article instead. | Narrative plays don't need sites. Source links are more credible. |
| Position management | Manual sell or countertrade bot per token | Market maker has no auto-management. Each token needs explicit setup. |
| Launch frequency | Opportunistic, not scheduled | Quality over quantity. Launch when narratives appear. |
