---
title: Agentic Commerce Landscape
type: knowledge
domain: crypto/commerce
consolidated_from: [agent-identity-standards-race, said-protocol-ready, solana-sdp-skill-file, binance-ai-pro-beta, cz-agents-million-payments, twak-agent-marketplace, agent-payments-protocol-war-update, agent-payments-stack-162-projects, agentic-commerce-protocol-war, amazon-v-perplexity-agent-access, moonpay-ows-agent-wallet-standard, visa-cli-command-line-commerce, x402-volume-gap, erc8183-agent-commerce-standard, virtuals-agdp-revenue-network, polymarket-bot-dominance, ucp-agent-commerce-protocol, circle-nanopayments-agent-micropayments, 2026-03-31_agent-payments-four-protocol-fragmentation, 2026-03-31_superteam-earn-agent-registered, 2026-03-31_superteam-earn-bounties-snapshot]
last_updated: 2026-04-01
scope: [self-evolution]
---

# Agentic Commerce Landscape

_Consolidated week of 2026-03-27 to 2026-03-30. Source memory entries preserved in `memories/entries/`._

## Identity Standards

Three competing approaches to on-chain agent identity:

**ERC-8004** (Ethereum, live mainnet Jan 29 2026)
- ERC-721-based identity registry + reputation registry
- Authors: MetaMask, Ethereum Foundation, Google, Coinbase
- v2 in development: adds MCP support + x402 integration
- Solana Agent Registry (Quantu AI, launched Mar 3 2026) is a port of ERC-8004, NOT a competitor — provides cross-chain interop
- BNB Chain extended ERC-8004 with BAP-578 (Non-Fungible Agents): agents exist as on-chain assets that own wallets and spend funds without per-tx human authorization

**SAID Protocol** (Solana-native, ElizaOS ecosystem)
- Separate standard, different team/approach from ERC-8004
- Kurt has SAID registration as pending decision
- ElizaOS launching xProof (MultiversX) for immutable agent decision provenance — complementary to SAID

**Visa TAP / Mastercard Agent Pay** (TradFi)
- Visa TAP: 3-signature cryptographic identity (agent recognition, consumer/device, payment container)
- Mastercard: CDN-layer verification via Web Bot Auth (IETF RFC 9421)
- Both address the "fifth participant" problem — agent breaks the traditional 4-party card model

**Legal forcing function**: Amazon v. Perplexity (N.D. Cal., Mar 10 2026) established that user permission does NOT override platform prohibition under CFAA. Agent identity protocols are now legally necessary, not optional. Ninth Circuit stayed the injunction Mar 17 — appeal outcome will define the space.

## Payment Protocols

Six competing payment standards (the "protocol war" — updated March 30):

| Protocol | Backer | Model | Key Feature | Status (Mar 2026) |
|----------|--------|-------|-------------|-------------------|
| **x402** | Coinbase/Cloudflare | HTTP 402 + USDC | 140M cumulative txns, ~131K daily, ~$28K/day actual | Foundation formed Sep 2025 |
| **MPP** | Stripe + Tempo | Session-based streaming | $500M raised, $5B val. 0.5s finality, no gas. Design partners: Anthropic, OpenAI, Shopify | Launched Mar 18 |
| **ACP** | OpenAI + Stripe | Agent checkout flow | First deployed in ChatGPT Instant Checkout (Feb 2026). Partners: Shopify, Salesforce, PayPal. SPTs (Shared Payment Tokens): scoped per seller, bounded by time/amount. Visa/Mastercard/Affirm/Klarna integrated. Etsy, URBN, Coach, Kate Spade onboarded. | Live |
| **AP2** | Google + 100 partners | Cryptographic mandates (VDCs) | Mastercard committed all US cardholders for agent commerce | Live |
| **UCP** | Google | JSON-RPC 2.0 | Full lifecycle (discovery, cart, logistics, returns) | Active |
| **Visa TAP/CLI** | Visa | CLI for agent card payments | Launched Mar 18. 2-4% fees, 3-day settlement. Closed beta. | Beta |

Core structural argument: traditional card rails (2.9% + $0.30) make sub-dollar agent requests margin-negative. Crypto rails are structurally required for machine-to-machine micro-transactions.

**Q1 2026 standards fragmentation update**: Four open standards competing simultaneously -- AP2 (Google, VDC-based cryptographic transaction signing), MPP (Stripe/Tempo, Visa-endorsed for card payments), ACP (Stripe/OpenAI collaboration), x402 (Coinbase, crypto-native, Solana-dominant with 65% of agent txns). No interop. This is the "browser wars" moment for agent commerce. Visa backing MPP is significant signal -- TradFi choosing Stripe over crypto. x402 remains only crypto-native option with no TradFi endorsement.

**Updated opinion**: The "protocol war" framing is wrong. These serve different use cases: x402 = permissionless one-off micropayments, MPP = session-based for enterprise agents with compliance, ACP = consumer checkout, AP2 = authorization framework. Pragmatic teams use all three. Hybrid architecture is emerging. Likely coexistence: x402 wins agents-paying-agents, MPP wins agents-paying-merchants.

**Market forecasts**: $136B agent-driven consumer volume (2025), $1.7T by 2030 (Edgar Dunn), $3-5T agent-mediated commerce by 2030 (McKinsey).

**Adoption reality check (Mar 2026)**: 75% of NRF 2026 retailer attendees say implementing or planning agentic commerce. But 95% of AI-driven sales still complete on merchant sites. Wizard (Mar 10) partnered with Stripe to accelerate ACP merchant onboarding. ChatGPT charges 4% for agentic purchases; Google/Microsoft charge 0%.

Solana MPP SDK (`@solana/mpp`) also launched — handles any stablecoin including Token2022.

**Circle Nanopayments** (testnet Mar 4 2026): gas-free USDC transfers at $0.000001 minimum. Offchain aggregation — thousands of txns batched into single onchain settlement, Circle covers gas. 12 EVM chains (Arbitrum, Base, Ethereum, Optimism, Polygon PoS, etc.). **No Solana** — notable gap given Solana's 65% agentic payment share claim. Demo: autonomous robot dog paying for its own recharging. Circle is building the Visa model for agents: zero-fee at point of sale, monetize float and volume.

**Mastercard live agent payments** (Mar 2026): completed end-to-end agentic transactions across Latin America — 17+ banks including Santander, Bancolombia, Itaú. Visa launched Agentic Ready program with 21 issuing bank partners.

## Job & Settlement Layer

**ERC-8183** (proposed late Feb 2026, Virtuals Protocol + Ethereum Foundation dAI team)
- On-chain job primitive: Client (posts job + budget) -> Provider (does work) -> Evaluator (approves/rejects)
- Four states: Open -> Funded -> Submitted -> Terminal
- Evaluator options: another AI (subjective), smart contract (deterministic), DAO/multisig (high-value)
- BNB Chain shipped first live implementation via BNBAgent SDK before spec finalized
- Main risk: bad evaluator = client loses money, no base-layer dispute resolution

Completes the "agentic commerce stack": ERC-8004 (identity) + ERC-8183 (jobs/escrow) + x402 (payments).

## Marketplaces & Launchpads

**MoonPay Open Wallet Standard (OWS)** (open-sourced Mar 24 2026)
- Framework for AI agents to hold value and sign transactions across multiple chains WITHOUT exposing private keys to agent, LLM context, or parent app
- Contributors: PayPal, Ethereum Foundation, Solana Foundation, Ripple, OKX, Tron, TON Foundation, Base
- Compatible with Coinbase x402 and Stripe/Tempo MPP for micropayments
- Ledger hardware signer integration (Mar 13) — first CLI wallet where agents trade but humans sign on hardware
- Built on MoonPay AI Agents CLI platform (54 tools, 17 skills, 10 chains)
- Target market: $300-500B agentic e-commerce by 2030 (Bain estimate)
- Opinion: MoonPay positioning as Stripe of agent economy by owning wallet abstraction layer. Key isolation solves the real problem. Missing piece: identity (OWS + AgentKit/ERC-8004 is the stack to watch).

**Trust Wallet Agent Kit (TWAK)** (launched Mar 26 2026)
- AI agents execute on-chain trades across 25+ blockchains (including Solana)
- Two modes: Agent Wallet (autonomous) and WalletConnect (human-approves-each-tx)
- Agent Marketplace coming ~2 months — developers publish reusable agent strategies
- 220M Trust Wallet users = largest potential distribution channel. CZ-backed.
- MCP supported out of the box
- The marketplace, not the wallet kit, is the real play. If WalletConnect mode required, it's just a bot store.

**Bitte Protocol** (NEAR ecosystem)
- 8,000+ active agents, 700K+ conversational transactions
- Every agent is an MCP server. No-code builder from audited tool blocks.
- Called "NPM for LLMs" but analogy breaks: NPM packages are deterministic, agents aren't. Trust infra becomes the bottleneck.

**Three competing agent launchpad models:**
1. Virtuals (Base) — ecosystem GDP model, $VIRTUAL as base pair, 18K+ agents, $479M aGDP
2. pump.fun (Solana) — per-agent buyback model
3. auto.fun (Solana) — ai16z token pairing

**Virtuals Protocol specifics:**
- 17,000-18,000+ agents deployed, $39.5M cumulative revenue, 23.5K unique active wallets
- Revenue Network (Feb 2026) enables autonomous agent-to-agent commerce
- $VIRTUAL token ~$0.70, ~$457M MC
- Eastworld Labs spun off for physical AI agent deployment (humanoid robots)
- AIXBT case study: $500M peak -> $24M. Token price does not equal product adoption.

## Economic Metrics & Market Size

- 250K daily active on-chain agents (early 2026, 400% YoY growth) — most are scripted bots, not reasoning agents
- 68% of new DeFi protocols include at least one AI agent component
- 41% of crypto hedge funds testing on-chain AI agents for portfolio management
- McKinsey: $3-5T agentic commerce by 2030
- McKinsey: AI execution layer = $2.9T opportunity. 80% of AI projects fail.
- Only 3% of consumer AI users pay today
- Accenture/Wharton: 50%+ of US working hours "in play" for agent reshaping, 120M+ workers
- Monday.com case: 100 SDRs -> agents. Response 24h -> 3min. Cost $8-10M -> <$1M. 72% average seat compression across departments.
- $285B SaaS stock wipeout (Feb 2026) hit thin wrappers hardest

## Pricing Models (Agent Economy)

Four emerging models as per-seat SaaS collapses:
1. **Consumption-based** — per token/call
2. **Outcome-based** — pay per resolved ticket (defining "success" and attribution unsolved)
3. **AI-FTE replacement** — priced as fraction of human salary (easiest ROI pitch)
4. **Hybrid** — combinations of above

Vertical AI with deep domain integration + data moats survives. Thin wrappers (model + UI + workflow) don't. Window to establish position: "quarters, not years."

## ElizaOS Pivot

ElizaOS transitioning open-source framework -> commercial SaaS:
- elizacloud: managed deployment (competing with hatcher.host)
- Jeju: native blockchain powered by AI16Z token
- xProof: on-chain decision provenance (MultiversX) — different accountability approach than ERC-8183 escrow
- 17,600+ GitHub stars
- Token pattern: 20-30% relief pumps then dumps to new ATLs despite shipping code

## Agent Commerce in Production (March 2026)

**Shopify Agentic Storefronts** (launched Mar 24, live by default)
- All US merchants auto-discoverable in ChatGPT, Google AI Mode, Copilot, Gemini
- OpenAI charges 4% fee on ChatGPT purchases. Google/Microsoft charge 0%.
- Non-Shopify brands can join via Agentic plan
- AI shopping traffic surged 4,700% to US retail sites

**CZ thesis** (March 9, 2026): "AI agents will make 1M times more payments than humans, using crypto." Logic: agents can't get bank accounts, crypto is the only open door.

## The Fraud Stack Gap

The agent commerce ecosystem has payments (x402), identity (ERC-8004), and jobs (ERC-8183) — but zero fraud infrastructure. Problems:
- Traditional fraud signals (typing cadence, mouse movement, device fingerprint) are useless against automated agents
- "Fifth participant" problem: agents break the four-party card model (issuer, acquirer, merchant, cardholder)
- No dispute resolution layer exists for agent-mediated transactions
- Who absorbs the loss when an agent buys wrong? The human? The protocol? The agent operator?

## Polymarket: Bot Dominance Case Study

Polymarket is the clearest example of agent-dominated markets. 14/20 top traders are bots. 3.7% of wallets (bots) generate 37.44% of volume. 92.4% of wallets lose money.

Key numbers:
- $40M extracted by arbitrage bots (Apr 2024-Apr 2025)
- $1K to $14K in 48 hours (Claude-powered bot, March 10 2026)
- $313 to $438K in one month (latency arb, 98% win rate, 6,615 predictions)
- Opportunity windows compressed from 12.3s (2024) to 2.7s (Q1 2026)
- 73% of profits go to bots executing under 100ms

Four bot strategies: latency arbitrage (85-98% win rate), news-driven multi-model ensembles (GPT-4o 40%, Claude 35%, Gemini 25%), structural arbitrage (78-85%), market making (2-5%/mo).

What happened to prediction markets in 18 months (human traders priced out by bots) will happen to every market with API access. The transition from human to agent dominance compresses fast once infrastructure exists.

## Agent Earning Platforms

**Superteam Earn** (Solana's talent layer, 173K+ members)
- Opened bounty platform to AI agents. Agents register via API, browse agent-eligible listings (AGENT_ONLY or AGENT_ALLOWED), submit work programmatically. Human claims USDC payouts.
- Claudia registered as agent "claudia" (username: claudia-glorious-40). Credentials in secrets/superteam.json.
- As of Mar 31: 41 open bounties, only 4 agent-eligible (10%). Most listings are humans-only.
- Agent-eligible bounties: Ranger hackathon ($1M + $200K DeFi vaults, Apr 6), Nosana ElizaOS challenge ($3K, Apr 14 -- best fit), Lume story ($2K -- disqualified, bans AI content).
- Nosana requirements: ElizaOS v2, deploy on Nosana GPU (free credits), Qwen3.5-27B model, GitHub repo + 1-min video demo + social post. 16 submissions as of Mar 31. Kurt needed for video demo.
- superteam-monitor.mjs built to check API, filter by agentAccess field, track state for new-bounty alerts.
- First platform where Claudia can earn money autonomously. Revenue could feed $CLAUDIA buyback mechanism.

## Open Questions

- SAID vs ERC-8004 Agent Registry on Solana: which to register Claudia on? Agent Registry has cross-chain interop advantage.
- TWAK Agent Marketplace: will it allow fully autonomous agents or require WalletConnect supervision?
- Amazon v. Perplexity: preliminary injunction granted — user permission doesn't override merchant prohibition for AI agents under CFAA
- Evaluator problem in ERC-8183: who evaluates the evaluator?
- x402 reality check: ~$28K/day actual volume vs $600M annualized headline. Infrastructure built, usage hasn't arrived.
- Two parallel identity systems forming: Entra Agent ID (enterprise) vs ERC-8004/SAID (crypto). Neither wins both markets.

---

_Source entries: 2026-03-27_agent-identity-standards-race, 2026-03-27_bitte-mcp-agent-economy, 2026-03-28_nfa-erc8004-agent-wallets, 2026-03-28_twak-agent-marketplace, 2026-03-28_virtuals-agdp-revenue-network, 2026-03-29_erc8183-agent-commerce-standard, 2026-03-29_agentic-commerce-protocol-war, 2026-03-29_amazon-v-perplexity-agent-access, 2026-03-29_agent-pricing-vertical-ai, 2026-03-29_elizaos-saas-pivot-xproof, 2026-03-29_saas-unbundling-agent-accountability, 2026-03-29_agent-payments-protocol-war-update, 2026-03-29_agent-fraud-stack-gap, 2026-03-29_visa-cli-command-line-commerce, 2026-03-29_x402-volume-gap, 2026-03-28_cz-agents-million-payments, 2026-03-29_rye-protocol-web-is-protocol_
_Updated: 2026-03-30_
