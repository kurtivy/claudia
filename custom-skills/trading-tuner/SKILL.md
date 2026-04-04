---
name: trading-tuner
description: "Analyze recent trading performance and apply conservative parameter adjustments. Runs periodically via cron and can be invoked manually. Always reports findings and changes (if any) with revert commands."
metadata: |
  { "openclaw": { "emoji": "🔧" } }
---

# Trading Tuner Skill

Analyzes recent trading performance and makes conservative parameter adjustments to the market maker. Designed for both manual invocation and cron-based periodic execution.

## SAFETY RULES (NON-NEGOTIABLE)

1. **Maximum adjustment per parameter per run: 10% of current value**
2. **Never set `exit.stop_loss_pct` below 8**
3. **Never set `scoring_min_confidence` or `entry.min_confidence` below 0.30**
4. **Never change more than 3 parameters in a single run**
5. **Always report EVERY change to Kurt with old value, new value, and reasoning**
6. **Never adjust parameters when posture is Pause or Conservative** -- bad market data misleads analysis
7. **If unsure, DO NOTHING and report analysis without changes**
8. **Include the revert command for every change made**
9. **Never touch boolean enable/disable flags** -- those are architectural, not tuning
10. **Never touch `exit.take_profit_pct`** -- too impactful, manual only

## TUNABLE PARAMETERS (the ONLY ones you may adjust)

| Key | Description | Min | Max | Seed |
|-----|-------------|-----|-----|------|
| `entry.min_trades_w10` | Min trades in 10s window | 10 | 40 | 20 |
| `entry.min_sells_w10` | Min sells in 10s | 2 | 10 | 5 |
| `entry.min_net_inflow_sol_w10` | Min net SOL inflow 10s | 3.0 | 15.0 | 7.0 |
| `entry.max_sell_pressure_shift_3s` | Max sell pressure 3s | 0.30 | 0.60 | 0.45 |
| `entry.min_price_velocity_3s` | Min price velocity 3s | -0.08 | -0.01 | -0.04 |
| `entry.max_pct_of_lifetime_high` | Max % of ATH | 0.60 | 0.95 | 0.80 |
| `entry.min_buy_sell_imbalance` | Min buy/sell ratio | 0.10 | 0.50 | 0.25 |
| `exit.stop_loss_pct` | Hard stop-loss | 8 | 25 | 20 |
| `entry.sequence_model_min_confidence` | Seq model threshold | 0.30 | 0.60 | 0.40 |

**DO NOT ADJUST** anything not in this table.

## Step 1: Check Posture

```bash
curl -s "${MARKET_MAKER_API}/api/monitoring/pulse" | python3 -m json.tool
```

If posture is Conservative or Pause: **STOP HERE**. Report the posture and exit. Do not analyze or adjust parameters during unfavorable market conditions -- the data will be misleading.

## Step 2: Gather Current State

### Current Config Values (for tunable params)

```bash
curl -s "${MARKET_MAKER_API}/api/dataflow/config" | python3 -m json.tool
```

### Strategy PnL (last 4 hours)

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategies" | python3 -m json.tool
```

Then for each strategy:

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategy/STRATEGY_ID/pnl" | python3 -m json.tool
```

### Recent Positions (last 50)

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategy/STRATEGY_ID/positions?limit=50" | python3 -m json.tool
```

### Extended Stats

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/dashboard/extended_stats" | python3 -m json.tool
```

### ML Model Health

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/model/active" | python3 -m json.tool
curl -s "${MARKET_MAKER_API}/api/pumpportal/analytics/model-health" | python3 -m json.tool
```

### Daily PnL

```bash
cat daily_pnl.json 2>/dev/null || echo "Not accessible"
```

### Anomaly Stats

```bash
curl -s "${MARKET_MAKER_API}/api/anomaly/stats" | python3 -m json.tool
```

## Step 3: Analyze

Look for these patterns in the gathered data:

### Stop-Loss Analysis (THE #1 LEVER)
- Calculate what % of exits hit the stop-loss
- If >50% of losses are stop-loss: consider tightening SL slightly (e.g., 20 -> 18)
- If <20% of losses are stop-loss AND win rate is decent: SL may be too tight, loosening could help
- Remember: SL moves PnL by +3.6%, everything else is +/-0.1%

### Win Rate Trend
- Compare last 2 hours vs last 24 hours
- If win rate dropped >10 percentage points: investigate entry filters
- If win rate is stable: don't touch entry filters

### ML Model Drift
- If AUC < 0.65: trigger retrain (see Step 5)
- If AUC < 0.60: this is critical, must retrain

### Filter Pass Rate
- If too few entries (<1/min in Normal posture): filters may be too tight, consider loosening one
- If too many entries (>5/min in Normal posture): filters too loose, consider tightening one

### Position Hold Times
- If median hold time <500ms: something wrong with exit timing (but DON'T just raise min_delay_ms)
- Hold time is SURVIVORSHIP BIAS -- longer holds correlate with wins but don't cause them
- The dynamic timer (buy_timer_reward/sell_timer_penalty) already handles this correctly

### Posture Alignment
- If posture is Normal but PnL is consistently negative over 2+ hours: investigate whether market conditions have shifted in ways the posture doesn't capture

## Step 4: Apply Changes (if warranted)

For each change, execute:

```bash
curl -s -X PUT "${MARKET_MAKER_API}/api/dataflow/config/KEY_NAME" \
  -H "Content-Type: application/json" \
  -d '{"value": "NEW_VALUE"}' | python3 -m json.tool
```

**Before each change, verify:**
- The adjustment is within the allowed range (see table above)
- The adjustment is <= 10% of the current value
- You haven't already made 3 changes this run
- You have a clear, data-backed reason

## Step 5: Trigger ML Retrain (if needed)

If ML AUC < 0.65 and no retrain is currently running:

```bash
curl -s "${MARKET_MAKER_API}/api/ml/retrain/status" | python3 -m json.tool
```

If status shows no active retrain:

```bash
curl -s -X POST "${MARKET_MAKER_API}/api/ml/retrain/trigger" | python3 -m json.tool
```

## Step 6: Report

Always format your report like this:

```
TRADING TUNER REPORT [HH:MM]
=============================
Posture: [Good/Normal] (pulse: X.XX)
Daily PnL: [+/-X.XX SOL] | Trades: [N] | Win Rate: [XX%]
ML: AUC [X.XX] | Threshold [X.XX]

ANALYSIS:
- SL hit rate: [XX%] of losses
- Win rate trend: [stable/declining/improving] ([last 2h]% vs [last 24h]%)
- Entry rate: [X.X/min]
- Median hold: [XXX ms]

CHANGES MADE:
1. [param]: [old] -> [new]
   Reason: [data-backed explanation]
   Revert: curl -s -X PUT "${MARKET_MAKER_API}/api/dataflow/config/[param]" -H "Content-Type: application/json" -d '{"value": "[old]"}'

OR: No changes warranted. [Brief explanation why the current config is appropriate.]

FLAGS:
- [Any concerns or things to watch]
```

If no changes were made, still report the analysis. Kurt wants to know you checked even when everything is fine.
