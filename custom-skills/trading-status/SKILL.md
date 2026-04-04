---
name: trading-status
description: "Check market maker trading status: PnL, posture, active positions, circuit breaker status, ML model health, and recent trades. Use when Kurt asks about trading performance, current positions, or system health."
metadata: |
  { "openclaw": { "emoji": "📊" } }
---

# Trading Status Skill

Query the market maker dashboard API at `${MARKET_MAKER_API}` (default: `http://localhost:5001`).

## Quick Status (start here)

### Market Posture (most important context)

```bash
curl -s "${MARKET_MAKER_API}/api/monitoring/pulse" | python3 -m json.tool
```

Posture meanings:
- **Good** (pulse >= 0.75): Market is active, lean in
- **Normal** (pulse >= 0.55): Full trading
- **Conservative** (pulse >= 0.30): PAUSED - velocity strategy breaks down in low activity
- **Pause** (pulse < 0.30): PAUSED

### Pipeline Worker Status

```bash
curl -s "${MARKET_MAKER_API}/api/pipeline/status" | python3 -m json.tool
```

### Daily PnL (fast, from local file)

```bash
cat daily_pnl.json 2>/dev/null || echo "PnL file not accessible"
```

## Detailed Queries

### Strategy List and Status

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategies" | python3 -m json.tool
```

Per-strategy status (replace STRATEGY_ID):

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategies/STRATEGY_ID/status" | python3 -m json.tool
```

### PnL Details

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategy/STRATEGY_ID/pnl" | python3 -m json.tool
```

### Performance Metrics

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategy/STRATEGY_ID/performance" | python3 -m json.tool
```

### Active Positions

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/strategy/STRATEGY_ID/positions" | python3 -m json.tool
```

### Recent Trades

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/dashboard/trades" | python3 -m json.tool
```

### Extended Trading Stats

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/dashboard/extended_stats" | python3 -m json.tool
```

### Wallet Balance

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/wallet/status" | python3 -m json.tool
```

## ML Model Health

### Active Model

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/model/active" | python3 -m json.tool
```

### Model Health Analytics

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/analytics/model-health" | python3 -m json.tool
```

### Retrain Status

```bash
curl -s "${MARKET_MAKER_API}/api/ml/retrain/status" | python3 -m json.tool
```

## System Health

### Operational Health

```bash
curl -s "${MARKET_MAKER_API}/api/pumpportal/ops/health" | python3 -m json.tool
```

### Anomaly Detection Stats

```bash
curl -s "${MARKET_MAKER_API}/api/anomaly/stats" | python3 -m json.tool
```

### Data Integrity

```bash
curl -s "${MARKET_MAKER_API}/api/monitoring/integrity" | python3 -m json.tool
```

## Formatting Guidelines

When reporting status to Kurt, format like this:

```
TRADING STATUS [HH:MM]
---
Posture: [Good/Normal/Conservative/Pause] (pulse: X.XX)
Daily PnL: [+/-X.XX SOL] | Trades: [N] | Win Rate: [XX%]
Wallet: [X.XX SOL]
Active Positions: [N]
ML: AUC [X.XX] | Threshold [X.XX]

Workers: [all up / list any down]
Alerts: [any concerns]
```

Rules:
- Lead with the most important number: today's PnL in SOL
- Show posture and what it means for trading activity
- Show number of active positions and trades today
- Flag any workers that are down
- Flag if ML model AUC has drifted below 0.65
- Flag if posture is Conservative or Pause
- Be concise -- Kurt wants numbers, not prose
