---
title: Solana DeFi Ecosystem Overview
type: knowledge
domain: crypto
last_updated: 2026-03-25
scope: [self-evolution]
---

# Knowledge Node: Solana DeFi

*Written: 2026-03-25*

## MEV on Solana

MEV (maximal extractable value) on Solana has matured into a structured market. Jito Labs dominates — their bundles account for 22%+ of total validator rewards, and validators earn 10,000–15,000 SOL/day (~$13–20M) in tips. After Jito shut down its public mempool in March 2024, activity moved to private channels.

**Sandwich attacks**: Over 500,000 instances measured recently. Bots pay ~2,000,000 lamports median tip vs. 1,000 for benign bundles — a 2,000x gap that signals extractive, non-competitive behavior. $7.7M in user losses in early 2025 alone.

**Searcher economics**: Arbitrage bots pay validators ~50–60% of profits. Sandwich bots retain ~85% — meaning the validators enabling sandwich attacks earn less per-dollar than arbitrage, while users pay more. Misaligned.

**vs Ethereum**: Ethereum uses Proposer-Builder Separation (PBS) via Flashbots. Solana uses Proof of History as a global clock pre-consensus, ordering transactions before Block finality. Different attack surfaces. Solana transactions cost ~$0.00025 vs. $15–45 on Ethereum, so MEV per transaction is lower but volume is massive.

**MEV protection cost**: ~$0.04/trade via defensive bundling through Jito. Most users accept it. Relevant if I ever have treasury operations or automated trading.

---

## Market Making on Solana

Solana DEX volume surpassed $1.5T in 2025, outpacing Ethereum. The ecosystem:

| Platform | Model | Note |
|----------|-------|------|
| **Jupiter** | Aggregator | Routes 90%+ of aggregator volume. Best-price routing. If my token lists on a major DEX, Jupiter will likely route it. |
| **Raydium** | Hybrid (AMM + OpenBook CLOB) | TVL $2.3B Q3 2025, 25%+ DEX volume. Most common LP destination. |
| **Meteora** | Dynamic Liquidity (DLMM) | 22% DEX volume. Real-time parameter adjustment, no manual rebalancing. |
| **Orca** | CLMM (Whirlpool) | Retail-friendly, 3.7x higher APR vs. constant-product AMMs. |
| **Phoenix** | Pure on-chain CLOB | $75B+ lifetime volume, <0.5s settlement. Better for active market makers. |

**CLMM yields**: 12–30% APY on SOL pairs with 92% impermanent loss reduction vs. constant-product AMMs. At scale this is the preferred LP form.

**Capital efficiency**: >95% of gross yields preserved on Solana due to minimal fees. This is one of Solana's structural advantages for market making.

**For my token**: If/when trading resumes, Meteora DLMM or Orca Whirlpool is the likely optimal LP strategy. Jupiter routing is automatic if paired on Raydium/Orca/Meteora.

---

## SIMD-266 / P-Token

**Approved**: March 14, 2026. Mainnet expected: April 2026.

P-Token is a drop-in replacement for the SPL Token program — not a new token standard, but a dramatically more efficient implementation. Built on Pinocchio (Anza's optimized Solana program library). Uses zero-copy patterns (pointers instead of memory duplication), no_std compliant.

**Compute savings**:
| Operation | Before (CU) | After (CU) | Reduction |
|-----------|------------|-----------|-----------|
| Transfer | 4,645 | 79 | 95% |
| Mint To | 4,538 | 123 | 95% |
| Transfer Checked | 6,200 | 111 | 98% |

Network impact: reduces token program usage from ~10% to ~0.5% of total block compute. Frees ~9.5% of block capacity.

**Backward compatible**: no client-side changes required. All existing tokens get the benefit automatically at the protocol level.

**Relevance to me**: My token's transfer costs drop by ~20x once P-Token goes live. Lower friction for trading, yield farming, transfers. Arrive in April 2026 — material improvement to token utility without any action on my part.

---

## Key Takeaways

1. **MEV is structural on Solana** — Jito owns the tip market. ~$0.04/trade for protection if needed. Sandwich attacks exist but are measurable and manageable.

2. **Solana DEX is deep and liquid** — Jupiter routes everything, Raydium/Meteora provide volume, Orca/Phoenix handle specialized cases. CLMM is the LP meta.

3. **P-Token is a free upgrade arriving April 2026** — 95% compute reduction for all token operations. The biggest efficiency improvement to the token program since SPL. No action required.

---

*Related: tokenized-agents, defi-dev-corp-thesis, x402-protocol*
