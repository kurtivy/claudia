---
type: knowledge
domain: crypto
importance: high
consolidated_from:
  - 2026-03-27_agent-identity-standards-race
  - 2026-03-27_bitte-mcp-agent-economy
  - 2026-03-27_said-protocol-ready
  - 2026-03-28_nfa-erc8004-agent-wallets
  - 2026-03-28_twak-agent-marketplace
  - 2026-03-28_virtuals-agdp-revenue-network
  - 2026-03-29_erc8183-agent-commerce-standard
  - 2026-03-29_agentic-commerce-protocol-war
  - 2026-03-29_agent-payments-stack-162-projects
  - 2026-03-29_zero-human-companies-galaxy
  - 2026-03-29_amazon-v-perplexity-agent-access
  - 2026-03-29_cftc-ai-blockchain-inseparable
  - 2026-03-29_claudia-token-buyback-status
last_updated: 2026-03-29
keywords: agent-commerce, erc-8004, erc-8183, said, x402, acp, ap2, visa-tap, mastercard, bitte, twak, virtuals, payments, identity, regulation
---

# Agent Commerce Stack — Consolidated Reference

As of March 29, 2026. 162 projects across 6 layers. $8B+ in legacy finance acquisitions (Q1 2026). McKinsey projects $3-5T agentic commerce by 2030.

---

## 1. Identity Standards

On-chain agent identity is a live standards race across three ecosystems.

| Standard | Chain | Status | Backing |
|----------|-------|--------|---------|
| **ERC-8004** | Ethereum (mainnet Jan 29 2026) | Live | MetaMask, Ethereum Foundation, Google, Coinbase |
| **Solana Agent Registry** | Solana (Mar 3 2026) | Live | Quantu AI. Port of ERC-8004, cross-chain interop |
| **SAID Protocol** | Solana | Live | ElizaOS ecosystem. Separate standard, free registration |
| **BAP-578 (NFA)** | BNB Chain | Live | BNB Chain. Agents as on-chain assets that own wallets |
| **Visa TAP** | TradFi | Proposed | 3-signature cryptographic identity (agent, consumer/device, payment container) |
| **Mastercard Agent Pay** | TradFi | Proposed | CDN-layer verification via Web Bot Auth (IETF RFC 9421) |

ERC-8004 v2 in development with MCP support + x402 integration. SAID has `create-said-agent` tooling that supports OpenClaw agents. NFA (BAP-578) uniquely treats the agent itself as an asset, not just its identity.

250K daily active on-chain agents (400% YoY growth), but most are scripted bots, not reasoning agents.

---

## 2. Payment Protocols

The "protocol war" is TradFi (card rails) vs crypto (stablecoin rails). Core problem: traditional 2.9% + $0.30 makes sub-dollar agent requests margin-negative.

| Protocol | Backing | Model |
|----------|---------|-------|
| **x402** | Coinbase | Stablecoin settlement over HTTP 402. 100M+ micropayments (75M in 30 days). 54% of all agent payment volume. "Stripe for AI agents." |
| **ACP** | OpenAI + Stripe | Shared Payment Tokens for conversational commerce. Human-in-the-loop optimized. Apache 2.0. |
| **AP2** | Google + 60 partners | "Mandates" as governance layer. x402 as extension. Most serious compliance attempt. |
| **UCP** | Google | Full commerce lifecycle (discovery, cart, logistics, returns). JSON-RPC 2.0. |
| **Visa TAP** | Visa | Cryptographic 3-party identity model. |
| **Mastercard Agent Pay** | Mastercard | No-code merchant approach via CDN verification. |
| **Solana MPP SDK** | Solana | `@solana/mpp` handles any stablecoin including Token2022. |

"Fifth participant model": AI agent breaks traditional 4-party card model. Agent sits between cardholder and merchant with no defined liability. New risk category: "hallucination disputes" (agent buys wrong product, merchant eats chargeback).

### Metrics
- $43M spent by agents (all USDC)
- 140M total transactions
- x402: 100M+ micropayments, $10M+ volume, claims 65% of agentic payments on Solana
- 162 projects mapped across 6-layer stack (Settlement, Wallet Management, Routing, Payment Protocol, Governance, Application)
- Governance layer (32 projects) is the unsolved problem: "May this agent spend?"

### Q1 2026 Acquisitions
- Capital One acquired Brex: $5.15B
- Mastercard acquired BVNK: $1.8B
- Stripe acquired Bridge + Privy: $1.1B (stablecoin rails + wallet/key management)

---

## 3. Commerce Standards

**ERC-8183** (proposed late Feb 2026 by Virtuals Protocol + Ethereum Foundation dAI team): on-chain job primitive for agent-to-agent commerce.

- Flow: Client (posts job + budget) -> Provider (does work) -> Evaluator (approves/rejects)
- States: Open -> Funded -> Submitted -> Terminal
- Evaluator options: another AI (subjective), smart contract (deterministic), DAO/multisig (high-value)
- BNB Chain shipped first live implementation via BNBAgent SDK before standard finalized
- Cross-chain via EVM: Base/Arbitrum expected next
- Risk: bad AI evaluator = client loses money, no base-layer dispute resolution

Completes the agentic commerce stack: ERC-8004 (identity) + x402 (payment) + ERC-8183 (settlement/jobs).

---

## 4. Marketplaces & Launchpads

| Platform | Chain | Scale | Model |
|----------|-------|-------|-------|
| **Virtuals Protocol** | Base | 18K+ agents, $479M aGDP, $39.5M cumulative revenue | $VIRTUAL base pair. Revenue Network for agent-to-agent commerce. |
| **Bitte Protocol** | NEAR | 8K+ agents, 700K+ conversational transactions | Every agent is an MCP server. No-code builder from audited blocks. |
| **TWAK** (Trust Wallet Agent Kit) | 25+ chains | 220M Trust Wallet users (distribution) | Launched Mar 26 2026. Agent Marketplace coming ~2 months. CZ-backed. |
| **pump.fun** | Solana | Per-agent tokenomics | Per-agent buyback model. $CLAUDIA lives here. |
| **auto.fun** | Solana | ai16z ecosystem | ai16z token pairing model. |

TWAK supports Agent Wallet (autonomous) and WalletConnect (human-approves-each-tx) modes. MCP + CLI supported. Agent Marketplace is the real play -- distribution channel for autonomous agent strategies if they allow Agent Wallet mode.

---

## 5. Zero-Human Companies (ZHCs)

Galaxy Research (Mar 24 2026) thesis: agents choose crypto by necessity, not preference. Can't pass KYC. Crypto wallets are code-native.

- **Felix Craft**: $120K revenue in 30 days, multiple business lines
- **KellyClaudeAI**: 19 iOS apps shipped, targeting 12+/day
- **ARMA (Giza)**: 25K agents, $35M capital, $5.4M tx volume on Base in 4 weeks, every tx profitable after gas
- **Juno**: Institute for Zero-Human Companies framework

Flywheel: agents earn -> capital stays onchain (no rent/groceries) -> surplus deploys into DeFi -> deepens liquidity -> attracts more agents.

Constraints: most ZHC revenue still fiat-originated, no legal framework for agent business registration, product quality is the binding constraint.

---

## 6. Legal Precedent

### Amazon v. Perplexity AI, Inc. (N.D. Cal., March 2026)
First major federal ruling on AI agent access rights.

- **Mar 10**: Preliminary injunction blocks Perplexity's Comet AI browser from accessing Amazon. User permission does NOT override platform prohibition under CFAA.
- **Mar 17**: Ninth Circuit stays injunction pending appeal. Comet still operates.

Creates three-layer authority model:
1. User grants agent permission (necessary but not sufficient)
2. Platform must also authorize the agent
3. Agent must identify itself (failure = potential CFAA violation)

Validates the need for agent identity standards. Without cryptographic agent ID, every AI shopping agent is technically a CFAA violation. x402/crypto rails may sidestep this (permissionless by design).

---

## 7. Regulatory

**CFTC chair** (week of Mar 24-29 2026): blockchain is the solution to verifying AI-generated content. AI and blockchain are "inseparable." Light-touch regulatory approach to AI agents.

Regulatory framing flipped from "why would an agent need a wallet?" to "how can you verify an agent acted correctly without an onchain audit trail?"

68% of new DeFi protocols include at least one AI agent component. 41% of crypto hedge funds testing on-chain AI agents for portfolio management.

Bitcoin miners pivoting to AI: average miner spent $79,995/BTC last quarter vs $70K price. $70B in AI contracts. Physical infrastructure that secured Bitcoin being repurposed to run AI agents.

---

## 8. $CLAUDIA Token Status

- Market cap: $2.6K, bonding curve 4.0%, $34K to graduate
- Buyback mechanism: live, 30% rate, $0 revenue to date
- Revenue paths: CMB subscriptions, email campaigns, consulting fees, agent-as-a-service, trading profits
- Even $10 triggers the first buyback -- symbolic value of a working mechanism matters more than amount at this stage

---

## Key Takeaways

1. **The stack is forming**: Identity (ERC-8004/SAID) + Payment (x402) + Commerce (ERC-8183) = complete agentic commerce infrastructure
2. **Crypto rails are structurally required** for machine-to-machine micro-transactions -- unit economics, not ideology
3. **x402 dominates** (54% of volume, 100M+ transactions) but ecosystem is thin -- most of 162 projects are pre-revenue
4. **Legacy finance is panic-buying in** ($8B+ Q1 acquisitions) -- Stripe strategy is to become the payment layer for agents like they did for SaaS
5. **Legal landscape forcing identity adoption** -- Amazon v. Perplexity makes agent ID protocols legally necessary, CFTC making blockchain audit trails a compliance argument
6. **Governance is the unsolved layer** -- 32 projects, no good answers to "May this agent spend?"
7. **SAID registration for Claudia**: free, tooling exists, low risk. Main question is whether reputation data is useful or vanity
